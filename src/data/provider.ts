import { buildDemoStocks } from './stocks';
import type { Stock } from './types';
import type { MetricKey } from './metrics';
import { getFuyaoClient } from './fuyaoApi';
import {
  MISSING_DEEP,
  MISSING_NORTH,
  MISSING_PB_PERCENTILE,
  MISSING_PE_IND_REL,
  MISSING_PE_PERCENTILE,
  aggregateMarket,
  calcPeg,
  deriveDividendYield,
  deriveMomentum,
  financialValue,
  fmtAsOf,
  mapWideLayer,
  reportFallbackChain,
} from './fuyaoMapper';
import type { MarketContext } from './fuyaoMapper';

/**
 * 数据层 Provider 抽象：
 * - DemoSnapshotProvider：内置演示数据快照（无 Key 时默认，页面顶部显式标注）
 * - FuyaoApiProvider：扶摇金融数据 API（同花顺），Universe 分层 + 深度精算池
 *
 * 合规红线：
 * 1. 无 Key / 接口失败必须显式报错，绝不静默降级为演示数据后伪装成真实结论；
 * 2. 数据源无法提供的字段（北向、历史分位、行业中位数等）一律 null + missingNotes 标注原因，
 *    不造数、不填经验值。
 */

export interface ProviderInfo {
  id: 'demo' | 'fuyao';
  label: string;
  isDemo: boolean;
  /** 真实模式下行情揭示时点（如「2026-09-25 15:00」） */
  asOf?: string;
  /** 口径/范围说明（如「沪深300 成分」「流通市值」） */
  note?: string;
}

export interface EnrichProgress {
  done: number;
  total: number;
  /** 当前精算对象（如「600519.SH 贵州茅台」） */
  current?: string;
}

export interface EnrichedPatch {
  code: string;
  m: Partial<Record<MetricKey, number | null>>;
  asOfFinance: string;
  missingNotes: Partial<Record<MetricKey, string>>;
}

export interface DataProvider {
  readonly info: ProviderInfo;
  loadStocks(): Promise<Stock[]>;
  /**
   * 深度指标精算（可选能力）：对候选集逐只补充财务 / 动量 / 股息等逐只接口数据。
   * 单只失败只标注该股缺失原因并继续，不做整体中断（显式降级而非静默）。
   */
  enrich?(codes: string[], onProgress?: (p: EnrichProgress) => void): Promise<EnrichedPatch[]>;
  /** 全市场环境快照（可选能力）：真实模式由 loadStocks 已拉取的全市场快照聚合，零额外请求 */
  getMarketContext?(): Promise<MarketContext | null>;
}

// ---------- 演示数据 ----------

export class DemoSnapshotProvider implements DataProvider {
  readonly info: ProviderInfo = { id: 'demo', label: '演示数据快照', isDemo: true };

  async loadStocks(): Promise<Stock[]> {
    return buildDemoStocks();
  }

  /** 演示数据无当日大盘口径，明确不提供市场环境（不编造大盘数字） */
  async getMarketContext(): Promise<MarketContext | null> {
    return null;
  }
}

// ---------- 扶摇金融数据 API ----------

/** 股票池（Universe）：指数成分 / 全市场流动性分层 */
export type FuyaoUniverse = 'hs300' | 'zz500' | 'all';

export interface FuyaoProviderOptions {
  apiKey?: string;
  /** direct=浏览器直连（线上，key 由用户设置面板持有）；proxy=本地代理（key 存服务端 env） */
  mode?: 'direct' | 'proxy';
  universe?: FuyaoUniverse;
  /** 精算池上限（按成交额降序取前 N 只做深度指标） */
  enrichLimit?: number;
  /** 深度精算并发上限（请求峰值 = concurrency×3，贴近 15/s 限流） */
  concurrency?: number;
}

const UNIVERSE_INDEX: Record<Exclude<FuyaoUniverse, 'all'>, string> = {
  hs300: '000300.SH',
  zz500: '000905.SH',
};

const UNIVERSE_LABEL: Record<FuyaoUniverse, string> = {
  hs300: '沪深300 成分',
  zz500: '中证500 成分',
  all: '全市场（估值/市值按流动性分层）',
};

const FINANCIAL_INDICATOR_IDS = {
  roe: 'index_weighted_avg_roe',
  revGrowth: 'calculate_operating_income_yoy_growth_ratio',
  profitGrowth: 'calculate_parent_holder_net_profit_yoy_growth_ratio',
  grossMargin: 'sale_gross_margin',
} as const;

/** 真实模式下宽层不提供、只能由精算池补充的深度指标 */
export const DEEP_METRICS: MetricKey[] = [
  'roe',
  'revGrowth',
  'profitGrowth',
  'grossMargin',
  'peg',
  'chg20d',
  'chg60d',
  'volatility',
  'drawdown52w',
  'avgTurnover',
  'dividendYield',
];

/** 真实模式下数据源明确无法提供的指标：null + 原因标注 */
const UNAVAILABLE_METRICS: Array<[MetricKey, string]> = [
  ['pePercentile', MISSING_PE_PERCENTILE],
  ['pbPercentile', MISSING_PB_PERCENTILE],
  ['northHolding', MISSING_NORTH],
  ['peIndRel', MISSING_PE_IND_REL],
];

const REPORT_LABEL: Record<string, string> = {
  '1': '一季报',
  '2': '中报',
  '3': '三季报',
  '4': '年报',
};

export class FuyaoApiProvider implements DataProvider {
  readonly info: ProviderInfo;
  readonly universe: FuyaoUniverse;
  private readonly enrichLimit: number;
  private readonly concurrency: number;
  private readonly client: ReturnType<typeof getFuyaoClient>;
  /** 宽层行情 close 缓存（精算派生股息率时需要） */
  private closeByCode = new Map<string, number>();
  /** 宽层 PE 缓存（精算派生 PEG 时需要） */
  private peByCode = new Map<string, number | null>();
  /** 宽层名称缓存（精算进度展示用） */
  private nameCache = new Map<string, string>();
  /** 全市场环境快照缓存（由 loadStocks 顺带聚合，零额外请求） */
  private marketCtx: MarketContext | null = null;

  constructor(opts: FuyaoProviderOptions = {}) {
    this.universe = opts.universe ?? 'hs300';
    this.enrichLimit = opts.enrichLimit ?? 60;
    this.concurrency = opts.concurrency ?? 6;
    this.client = getFuyaoClient({
      apiKey: opts.apiKey ?? '',
      mode: opts.mode ?? 'direct',
    });
    this.info = {
      id: 'fuyao',
      label: `扶摇金融数据 API · ${UNIVERSE_LABEL[this.universe]}`,
      isDemo: false,
      note: '市值口径=流通市值（元）',
    };
  }

  async loadStocks(): Promise<Stock[]> {
    const snapshot = await this.client.snapshot();
    const snapByCode = new Map<string, (typeof snapshot.item)[number]>();
    for (const it of snapshot.item) snapByCode.set(it.thscode, it);

    // Universe 分层：指数成分（含名称）；all 模式用成交额前 500 只拿名称/估值/市值
    let codes: string[] = [];
    const nameByCode = new Map<string, string>();
    if (this.universe === 'all') {
      const sorted = [...snapByCode.values()]
        .filter((s) => s.thscode.endsWith('.SH') || s.thscode.endsWith('.SZ'))
        .sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0));
      codes = sorted.slice(0, 500).map((s) => s.thscode);
    } else {
      const indexCode = UNIVERSE_INDEX[this.universe];
      const cons = await this.client.constituents(indexCode);
      for (const c of cons.item) {
        nameByCode.set(c.thscode, c.name);
        codes.push(c.thscode);
      }
    }

    // 估值与竞价（单次 ≤100，分批）→ PE/PB 与流通市值
    const codesForBatch = codes.slice(0, 500);
    const valMap = new Map<string, { pe_ttm: number | null; pb_mrq: number | null }>();
    const auctionMap = new Map<string, { float_market_cap: number | null; name?: string }>();
    if (codesForBatch.length > 0) {
      await this.client.inBatches(codesForBatch, 100, async (chunk) => {
        const [val, auc] = await Promise.all([this.client.valuations(chunk), this.client.auction(chunk)]);
        for (const v of val.item) {
          valMap.set(v.thscode, { pe_ttm: v.pe_ttm ?? null, pb_mrq: v.pb_mrq ?? null });
        }
        for (const a of auc.item) {
          auctionMap.set(a.thscode, { float_market_cap: a.float_market_cap ?? null, name: a.name });
          if (a.name && !nameByCode.has(a.thscode)) nameByCode.set(a.thscode, a.name);
        }
      });
    }

    // 宽层映射：基础行情指标 + 深度指标全部显式缺失
    const wide = mapWideLayer(snapByCode, valMap, auctionMap, nameByCode);
    const now = new Date();
    const stocks: Stock[] = wide.map((r) => {
      this.closeByCode.set(r.code, r.close ?? 0);
      this.peByCode.set(r.code, r.m.pe ?? null);
      this.nameCache.set(r.code, r.name || r.code);
      const m = { ...r.m } as Record<MetricKey, number | null>;
      for (const k of DEEP_METRICS) m[k] = null;
      const missingNotes: Partial<Record<MetricKey, string>> = {};
      for (const k of DEEP_METRICS) missingNotes[k] = MISSING_DEEP;
      for (const [k, reason] of UNAVAILABLE_METRICS) {
        m[k] = null;
        missingNotes[k] = reason;
      }
      return {
        code: r.code,
        name: r.name || r.code,
        industry: '未分类',
        listDate: '',
        m,
        asOfFinance: '未精算（仅宽层行情）',
        asOfMarket: this.marketAsOf(snapshot.timestamp),
        asOfNorth: '数据源未提供',
        missingNotes,
        prevMarket: { close: r.prevClose },
        liquid: r.turnover ?? 0,
      } satisfies Stock;
    });

    this.info.asOf = this.marketAsOf(snapshot.timestamp);
    this.marketCtx = aggregateMarket(snapshot.item, snapshot.timestamp);
    return stocks;
  }

  /** 大盘环境：全市场广度统计（涨跌家数 / 涨跌中位 / 总成交额） */
  async getMarketContext(): Promise<MarketContext | null> {
    return this.marketCtx;
  }

  async enrich(
    codes: string[],
    onProgress?: (p: EnrichProgress) => void
  ): Promise<EnrichedPatch[]> {
    const targets = codes.slice(0, this.enrichLimit);
    if (targets.length === 0) return [];
    const reportChain = reportFallbackChain(Date.now());
    const patches: EnrichedPatch[] = [];
    let done = 0;

    const worker = async (code: string) => {
      const missingNotes: Partial<Record<MetricKey, string>> = {};
      const patch: EnrichedPatch = {
        code,
        m: {},
        asOfFinance: '未精算',
        missingNotes,
      };
      const onItem = () => {
        done += 1;
        if (onProgress) {
          onProgress({ done, total: targets.length, current: `${code} ${this.nameOf(code)}` });
        }
      };
      try {
        // 每股内部：财务 + 历史 K 线 + 除权分红（3 个独立请求并发）
        const [fin, bars, divEvts] = await Promise.all([
          this.fetchFinancials(code, reportChain, patch),
          this.client.historical(code, Date.now() - 450 * 86400_000, Date.now()),
          this.client.adjustmentFactors(code, fmtDate(Date.now() - 366 * 86400_000), fmtDate(Date.now())),
        ]);
        if (fin) patch.asOfFinance = fin;
        const mom = deriveMomentum(bars.item);
        Object.assign(patch.m, mom);
        const close = this.closeByCode.get(code);
        const dy = deriveDividendYield(
          divEvts.item.map((e) => ({ exDateMs: e.ex_date_ms, dividendPerShare: e.dividend_per_share })),
          close,
          Date.now()
        );
        if (dy != null) patch.m.dividendYield = dy;
        else if (close != null && close > 0) missingNotes.dividendYield = '近 12 个月无现金分红事件';
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const k of DEEP_METRICS) missingNotes[k] = `精算失败：${msg}`;
      } finally {
        onItem();
      }
      patches.push(patch);
    };

    await runPool(targets, this.concurrency, worker);
    return patches;
  }

  private async fetchFinancials(
    code: string,
    reportChain: string[],
    patch: EnrichedPatch
  ): Promise<string | null> {
    let lastErr: unknown = null;
    for (const report of reportChain) {
      try {
        const fin = await this.client.financials(code, report);
        const abilities = fin.abilities ?? [];
        const m = patch.m as Record<string, number | null>;
        m.roe = financialValue(abilities, FINANCIAL_INDICATOR_IDS.roe);
        m.revGrowth = financialValue(abilities, FINANCIAL_INDICATOR_IDS.revGrowth);
        m.profitGrowth = financialValue(abilities, FINANCIAL_INDICATOR_IDS.profitGrowth);
        m.grossMargin = financialValue(abilities, FINANCIAL_INDICATOR_IDS.grossMargin);
        m.peg = calcPeg(this.peByCode.get(code) ?? null, m.profitGrowth);
        const [y, q] = report.split('-');
        return `${y} ${REPORT_LABEL[q] ?? q} 披露口径`;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) {
      patch.missingNotes.roe =
        patch.missingNotes.roe ??
        `财务指标拉取失败：${lastErr instanceof Error ? lastErr.message : String(lastErr)}`;
    }
    return null;
  }

  private nameOf(code: string): string {
    return this.nameCache.get(code) ?? '';
  }

  private marketAsOf(timestamp: number | null | undefined): string {
    return fmtAsOf(timestamp ?? null, '行情时点未知');
  }
}

// ---------- Factory ----------

/**
 * 创建数据 Provider：
 * - 本地开发（DEV）：走 vite proxy，Key 存于服务端 env（FUYAO_API_KEY），不进 bundle；
 * - 浏览器侧检测到 localStorage 中用户自填的 Key（线上部署）：直连扶摇 API（CORS 已放行）；
 * - 以上均无：演示数据快照（页面顶部显式标注，不伪装）。
 */
export function getDataProvider(opts?: { apiKey?: string; universe?: FuyaoUniverse }): DataProvider {
  let key = opts?.apiKey?.trim() ?? '';
  if (!key && typeof window !== 'undefined') {
    key = (window.localStorage.getItem('fuyao_api_key') ?? '').trim();
  }
  if (key) {
    return new FuyaoApiProvider({ apiKey: key, mode: 'direct', universe: opts?.universe });
  }
  if (import.meta.env.DEV) {
    // 本地代理模式：key 由 vite server 从 process.env.FUYAO_API_KEY 注入
    return new FuyaoApiProvider({ mode: 'proxy', universe: opts?.universe });
  }
  return new DemoSnapshotProvider();
}

// ---------- 工具 ----------

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 容错并发池：单任务失败不影响整体，由任务自行处理或上抛 */
async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      try {
        await fn(items[idx]);
      } catch {
        // 任务内部已处理异常；此处兜底避免整体中断
      }
    }
  });
  await Promise.all(workers);
}