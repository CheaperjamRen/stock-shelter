/**
 * 扶摇金融数据 API 客户端（同花顺 · fuyao.aicubes.cn）
 *
 * 设计要点：
 * - base URL 双模式：`direct` 直连（部署环境，key 由 localStorage / 构建注入）或
 *   `proxy` 本地代理（vite dev，key 只存于服务端环境变量，不进 bundle）。
 * - 统一 ApiResponse 信封解析（code=0 成功）；业务错误与网络错误均显式抛错，
 *   调用方不得静默降级。
 * - 分块批量：估值/竞价/指数成分等接口单次上限 100，自动分块并发。
 * - 简单并发达：控制整体并发上限，避免触发 X-RateLimit-Limit 限流。
 * - 轻量内存缓存：快照类接口缓存 60s，历史 K 线缓存 10min。
 */

export const FUYAO_DIRECT_BASE = 'https://fuyao.aicubes.cn/api';

export interface FuyaoClientOptions {
  /** 直连模式：key 明文走请求头；代理模式：key 由代理注入，传空即可 */
  apiKey?: string;
  /** direct | proxy */
  mode?: 'direct' | 'proxy';
  /** 代理模式下前端使用的挂载前缀，如 /fuyao/api */
  proxyBase?: string;
  concurrency?: number;
}

export class FuyaoApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'FuyaoApiError';
  }
}

interface ApiEnvelope<T> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

// ---------- 响应类型 ----------

export interface SnapshotItem {
  thscode: string;
  ticker: string;
  name: string;
  last_price: number | null;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  prev_price: number | null;
  price_change: number | null;
  price_change_ratio_pct: number | null;
  volume: number | null; // 股
  turnover: number | null; // 元
  [k: string]: unknown;
}

export interface ValuationItem {
  thscode: string;
  pe_ttm: number | null;
  pe_mrq: number | null;
  pb_mrq: number | null;
  ps_ttm: number | null;
  pcf_ttm: number | null;
  [k: string]: unknown;
}

export interface AuctionItem {
  thscode: string;
  ticker: string;
  name: string;
  float_market_cap: number | null; // 流通市值（元）
  total_market_cap?: number | null; // 总市值（元，若提供）
  auction_turnover_rate_pct?: number | null; // 竞价换手率
  [k: string]: unknown;
}

export interface PriceBar {
  date_ms: number;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
  turnover: number;
}

export interface FinancialAbility {
  ability: string;
  indicators: Array<{ index_id: string; value: string | null }>;
}

export interface ConstituentItem {
  thscode: string;
  ticker: string;
  name: string;
}

export interface TickerItem {
  thscode: string;
  ticker: string;
  name: string;
  exchange: string | null;
  asset_type: string;
  currency: string;
  list_date: string | null;
}

export interface AdjustmentFactorItem {
  thscode: string;
  /** 除权除息日（毫秒） */
  ex_date_ms: number;
  /** 每股现金分红（税前，原始货币）；非现金事件为 0 */
  dividend_per_share: number;
  /** 每股送转股（股） */
  per_share_bonus?: number;
  [k: string]: unknown;
}

// ---------- 客户端 ----------

export class FuyaoClient {
  private readonly apiKey: string;
  private readonly mode: 'direct' | 'proxy';
  private readonly base: string;
  private readonly concurrency: number;
  private readonly cache = new Map<string, { at: number; ttlMs: number; value: unknown }>();

  constructor(opts: FuyaoClientOptions = {}) {
    this.apiKey = opts.apiKey?.trim() ?? '';
    this.mode = opts.mode ?? 'direct';
    this.base = this.mode === 'direct' ? FUYAO_DIRECT_BASE : (opts.proxyBase ?? '/fuyao/api');
    this.concurrency = opts.concurrency ?? 8;
  }

  private cacheKey(method: string, path: string, query: string): string {
    return `${method}|${path}|${query}`;
  }

  private async raw<T>(method: string, path: string, query: Record<string, string | number | undefined>, ttlMs = 0): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    const qstr = qs.toString();
    const key = this.cacheKey(method, path, qstr);
    if (ttlMs > 0) {
      const hit = this.cache.get(key);
      if (hit && Date.now() - hit.at < hit.ttlMs) return hit.value as T;
    }

    const url = `${this.base}${path}${qstr ? `?${qstr}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.mode === 'direct' && this.apiKey) headers['X-api-key'] = this.apiKey;

    let res: Response;
    try {
      res = await fetch(url, { method, headers });
    } catch (e) {
      throw new FuyaoApiError(
        `扶摇 API 网络请求失败（${path}）：${e instanceof Error ? e.message : String(e)}`
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new FuyaoApiError(`扶摇 API 响应解析失败（HTTP ${res.status}）：${path}`);
    }
    if (!res.ok || body === null || typeof body !== 'object') {
      throw new FuyaoApiError(`扶摇 API HTTP ${res.status}（${path}）`);
    }
    const env = body as ApiEnvelope<T>;
    if (env.code !== 0) {
      throw new FuyaoApiError(
        `扶摇 API 业务错误（${path}）：${env.message ?? 'unknown'} (code=${env.code})`,
        env.code,
        env.request_id
      );
    }
    if (ttlMs > 0) this.cache.set(key, { at: Date.now(), ttlMs, value: env.data });
    return env.data;
  }

  /** 并发执行一批请求（带整体并发上限），任一失败即整体失败（保持数据一致性，禁止部分静默忽略） */
  async inBatches<T>(input: T[], batchSize: number, fn: (batch: T[]) => Promise<unknown>): Promise<void> {
    const slices: T[][] = [];
    for (let i = 0; i < input.length; i += batchSize) slices.push(input.slice(i, i + batchSize));
    const queue = [...slices];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(this.concurrency, Math.max(1, queue.length)) }, async () => {
      while (cursor < queue.length) {
        const idx = cursor;
        cursor += 1;
        await fn(queue[idx]);
      }
    });
    await Promise.all(workers);
  }

  /** 行情快照：一次返回全市场（参数分页被服务端忽略，仅用于兼容） */
  snapshot(): Promise<{ timestamp: number; item: SnapshotItem[] }> {
    return this.raw('GET', '/a-share/prices/snapshot', {}, 60_000);
  }

  /** 估值批量（单次 ≤100） */
  valuations(thscodes: string[]): Promise<{ timestamp: number; item: ValuationItem[] }> {
    return this.raw('GET', '/a-share/valuations/snapshot', { thscodes: thscodes.join(',') }, 60_000);
  }

  /** 竞价快照批量（≤100）：流通市值 / 换手率等 */
  auction(thscodes: string[]): Promise<{ timestamp: number; item: AuctionItem[] }> {
    return this.raw('GET', '/a-share/auction/snapshot', { thscodes: thscodes.join(',') }, 60_000);
  }

  /** 历史 K 线（单只，前复权），窗口跨度 ≤10 年 */
  historical(thscode: string, startMs: number, endMs: number): Promise<{ timestamp: number; item: PriceBar[] }> {
    return this.raw(
      'GET',
      '/a-share/prices/historical',
      { thscode, interval: '1d', start: startMs, end: endMs, adjust: 'forward' },
      600_000
    );
  }

  /** 单只财务指标（report=yyyy-N） */
  financials(thscode: string, report: string): Promise<{ thscode: string; report: string; abilities: FinancialAbility[] }> {
    return this.raw('GET', '/a-share/financials/indicators', { thscode, report }, 600_000);
  }

  /** 指数成分（如 000300.SH 沪深300 / 000905.SH 中证500） */
  constituents(thscode: string): Promise<{ timestamp: number; item: ConstituentItem[] }> {
    return this.raw('GET', '/a-share-index/constituents/ths-stock-list', { thscode }, 600_000);
  }

  /** 标的检索（代码/名称关键字） */
  searchTickers(q: string): Promise<{ timestamp: number; item: TickerItem[] }> {
    return this.raw('GET', '/meta/tickers/search', { q }, 0);
  }

  /** 除权除息事件（单只；from/to 为 YYYY-MM-DD） */
  adjustmentFactors(
    thscode: string,
    from?: string,
    to?: string
  ): Promise<{ timestamp: number; item: AdjustmentFactorItem[] }> {
    return this.raw(
      'GET',
      '/a-share/corporate-actions/adjustment-factors',
      { thscode, from, to },
      600_000
    );
  }
}

const clientCache = new Map<string, FuyaoClient>();

/** 获取（或创建）共享 client；同一配置只建一次，利于复用限流与缓存 */
export function getFuyaoClient(opts: FuyaoClientOptions): FuyaoClient {
  const key = `${opts.mode ?? 'direct'}|${opts.apiKey ?? ''}|${opts.proxyBase ?? ''}`;
  const hit = clientCache.get(key);
  if (hit) return hit;
  const c = new FuyaoClient(opts);
  clientCache.set(key, c);
  return c;
}