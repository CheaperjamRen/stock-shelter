/**
 * 扶摇 API 响应 → 内部 Stock 指标的纯函数映射层。
 * 只做字段映射与派生计算，不发起网络请求；全部可单测。
 *
 * 口径对照（真实模式）：
 * - mktCap 使用「流通市值」（float_market_cap，元），精确到亿元，与演示模式的
 *   总市值口径不同，需在数据源说明处显式标注。
 * - peIndRel / pePercentile / pbPercentile / northHolding 在真实模式下无法
 *   从扶摇 API 直接获得，一律显式标注缺失原因，不静默赋默认值。
 */
import type { MetricKey } from './metrics';
import type { FinancialAbility, PriceBar, SnapshotItem } from './fuyaoApi';

/** 缺失原因常量（真实模式） */
export const MISSING_PE_PERCENTILE = '需逐日历史 PE 序列，当前数据源（扶摇 API）未提供该能力';
export const MISSING_PB_PERCENTILE = '需逐日历史 PB 序列，当前数据源（扶摇 API）未提供该能力';
export const MISSING_NORTH = '北向持股披露当前数据源未提供（2024-08 起交易所改为不定期披露）';
export const MISSING_PE_IND_REL = '需行业归属映射，行业映射构建后可用';
export const MISSING_DEEP = '深度指标仅对精算池计算（见数据源状态条说明）';

export interface MarketPhase {
  /** 行情快照时间戳（毫秒）→ 人类可读时间 */
  marketAsOf: string;
  /** 财务口径说明 */
  financeAsOf: string;
}

/** 全市场环境快照（真实投研工作流：先看大盘环境再动手筛选） */
export interface MarketContext {
  /** 上涨 / 平盘 / 下跌家数 */
  up: number;
  flat: number;
  down: number;
  /** 涨跌幅中位数（%） */
  medianChgPct: number | null;
  /** 全市场总成交额（亿元） */
  totalTurnoverYi: number | null;
  /** 快照时点 */
  asOf: string;
}

/** 由全市场行情快照聚合市场广度（纯函数；快照已由 loadStocks 拉取，零额外请求） */
export function aggregateMarket(items: SnapshotItem[], timestampMs: number | null): MarketContext {
  let up = 0;
  let flat = 0;
  let down = 0;
  let turnoverSum = 0;
  let turnoverCount = 0;
  const chgs: number[] = [];
  for (const it of items) {
    if (it.thscode.endsWith('.BJ')) continue; // 北交所暂不纳入大盘广度（口径：沪深 A 股）
    turnoverCount += 1;
    if (it.turnover != null) turnoverSum += it.turnover;
    const c = it.price_change_ratio_pct;
    if (c == null) continue;
    if (c > 0.0001) up += 1;
    else if (c < -0.0001) down += 1;
    else flat += 1;
    chgs.push(c);
  }
  chgs.sort((a, b) => a - b);
  const median = chgs.length > 0 ? chgs[Math.floor(chgs.length / 2)] : null;
  return {
    up,
    flat,
    down,
    medianChgPct: median != null ? round2(median) : null,
    totalTurnoverYi: turnoverCount > 0 ? round1(turnoverSum / 1e8) : null,
    asOf: fmtAsOf(timestampMs, '时点未知'),
  };
}

export function fmtAsOf(ms: number | null | undefined, fallback: string): string {
  if (ms == null) return fallback;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return fallback;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface SnapshotStock {
  code: string;
  name: string;
  close: number | null;
  prevClose: number | null;
  priceChangePct: number | null;
  turnover: number | null; // 当日成交额（元）
  m: Partial<Record<MetricKey, number | null>>;
}

/** 宽层估值输入（仅取用于计算的字段，兼容裁剪响应） */
export type WideValuation = { pe_ttm?: number | null; pb_mrq?: number | null };
/** 宽层竞价输入（仅取用于计算的字段） */
export type WideAuction = { float_market_cap?: number | null; name?: string };

/** 宽层：行情快照 × 估值 × 竞价市值 → 基础指标行（深度指标全部缺失并标注） */
export function mapWideLayer(
  snapshot: Map<string, SnapshotItem>,
  valuations: Map<string, WideValuation>,
  auctions: Map<string, WideAuction>,
  universeNames: Map<string, string>
): SnapshotStock[] {
  const out: SnapshotStock[] = [];
  for (const [code, s] of snapshot) {
    const v = valuations.get(code);
    const a = auctions.get(code);
    const name = universeNames.get(code) ?? a?.name ?? s.ticker ?? code;
    const close = s.last_price ?? null;
    out.push({
      code,
      name,
      close,
      prevClose: s.prev_price ?? close,
      priceChangePct: s.price_change_ratio_pct ?? null,
      turnover: s.turnover ?? null,
      m: {
        close,
        mktCap: a?.float_market_cap != null ? round1(a.float_market_cap / 1e8) : null,
        pe: v?.pe_ttm ?? null,
        pb: v?.pb_mrq ?? null,
        // 深度指标：宽层不拉取，显式缺失
        roe: null,
        revGrowth: null,
        profitGrowth: null,
        grossMargin: null,
        peg: null,
        dividendYield: null,
        chg20d: null,
        chg60d: null,
        volatility: null,
        drawdown52w: null,
        avgTurnover: null,
        pePercentile: null,
        pbPercentile: null,
        peIndRel: null,
        northHolding: null,
      },
    });
  }
  return out;
}

/** 由 60/120 日窗口 K 线派生动量类指标（前复权收盘价序列，按日期升序或降序均可） */
export function deriveMomentum(bars: PriceBar[]): {
  chg20d: number | null;
  chg60d: number | null;
  volatility: number | null;
  drawdown52w: number | null;
  avgTurnover: number | null;
} {
  if (bars.length < 61) return { chg20d: null, chg60d: null, volatility: null, drawdown52w: null, avgTurnover: null };
  // 按日期升序
  const sorted = [...bars].sort((a, b) => a.date_ms - b.date_ms);
  const closes = sorted.map((b) => b.close_price);
  const last = closes[closes.length - 1];
  const close20Ago = closes[closes.length - 21];
  const close60Ago = closes[closes.length - 61];
  const chg20d = close20Ago > 0 ? round2(((last - close20Ago) / close20Ago) * 100) : null;
  const chg60d = close60Ago > 0 ? round2(((last - close60Ago) / close60Ago) * 100) : null;

  // 年化波动率：近 60 个交易日对数收益标准差 × √250
  const win60 = closes.slice(-61);
  let vol: number | null = null;
  if (win60.length >= 61) {
    const rets: number[] = [];
    for (let i = 1; i < win60.length; i += 1) {
      if (win60[i - 1] > 0) rets.push(Math.log(win60[i] / win60[i - 1]));
    }
    if (rets.length >= 20) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
      vol = round1(Math.sqrt(variance) * Math.sqrt(250) * 100);
    }
  }

  // 距 52 周高点回撤：以窗口内最高收盘价为基准
  const max52 = Math.max(...closes);
  const drawdown52w = max52 > 0 ? round1(((last - max52) / max52) * 100) : null;

  // 近 20 日日均成交额（亿元）
  const turn20 = sorted.slice(-20).map((b) => b.turnover);
  const avgTurnover = turn20.length >= 20 ? round1(turn20.reduce((a, b) => a + b, 0) / turn20.length / 1e8) : null;

  return { chg20d, chg60d, volatility: vol, drawdown52w, avgTurnover };
}

/** 从五类财务指标块中提取指标值（百分比原值字符串 → 数值，如 "89.12" → 89.12） */
export function financialValue(abilities: FinancialAbility[], indexId: string): number | null {
  for (const blk of abilities) {
    for (const ind of blk.indicators) {
      if (ind.index_id === indexId) {
        if (ind.value == null || ind.value === '') return null;
        const n = Number(ind.value);
        return Number.isFinite(n) ? n : null;
      }
    }
  }
  return null;
}

/** PEG = PE / 净利同比增速（增速以百分数值计，如 25 表示 25%）；增速非正或 PE 非正时无意义，高 PEG 封顶 99 */
export function calcPeg(pe: number | null | undefined, profitGrowth: number | null | undefined): number | null {
  if (pe == null || profitGrowth == null || pe <= 0 || profitGrowth <= 0) return null;
  return round2(Math.min(pe / profitGrowth, 99));
}

/** 由除复权事件流计算近 12 个月股息率（每股现金分红合计 ÷ 当前价 × 100） */
export function deriveDividendYield(
  events: Array<{ exDateMs: number; dividendPerShare: number }>,
  close: number | null | undefined,
  nowMs: number
): number | null {
  if (close == null || close <= 0) return null;
  const cutoff = nowMs - 366 * 24 * 3600 * 1000;
  const total = events
    .filter((e) => e.exDateMs >= cutoff && e.exDateMs <= nowMs)
    .reduce((acc, e) => acc + (e.dividendPerShare > 0 ? e.dividendPerShare : 0), 0);
  if (total <= 0) return null;
  return round2((total / close) * 100);
}

/** 最新财务报告期序列：以「当前最新披露期」优先，提供回退链 */
export function reportFallbackChain(nowMs: number): string[] {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-12
  const candidates: string[] = [];
  if (m >= 9) candidates.push(`${y}-2`); // 9 月后中报已披露
  if (m >= 5) candidates.push(`${y}-1`); // 5 月后一季报已披露
  candidates.push(`${y - 1}-4`); // 去年年报
  candidates.push(`${y - 1}-3`); // 去年三季报
  // 去重保序
  return [...new Set(candidates)].slice(0, 3);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}