import type { MetricKey } from './metrics';
import { METRICS } from './metrics';
import type { Stock } from './types';
import { clamp, gauss, hashStr, mulberry32 } from './rng';

/**
 * 内置 A 股演示数据集：71 只代表性股票，覆盖 24 个申万一级行业。
 * 所有数值由行业基线 + 股票代码种子确定性生成（非真实数据），
 * 页面顶部以「演示数据快照」徽标显式标注，禁止伪装实时数据。
 * 部分字段刻意留缺值，用于演示「数据缺失显式提示」能力。
 */

export const MARKET_SNAPSHOT_DATE = '2026-09-25';
export const PREV_TRADE_DATE = '2026-09-24';

/** [代码, 名称, 行业] */
const STOCK_LIST: Array<[string, string, string]> = [
  ['600519', '贵州茅台', '食品饮料'],
  ['000858', '五粮液', '食品饮料'],
  ['000568', '泸州老窖', '食品饮料'],
  ['603288', '海天味业', '食品饮料'],
  ['600887', '伊利股份', '食品饮料'],
  ['601398', '工商银行', '银行'],
  ['601939', '农业银行', '银行'],
  ['600036', '招商银行', '银行'],
  ['601166', '兴业银行', '银行'],
  ['601128', '常熟银行', '银行'],
  ['601318', '中国平安', '非银金融'],
  ['300059', '东方财富', '非银金融'],
  ['601688', '华泰证券', '非银金融'],
  ['601601', '中国太保', '非银金融'],
  ['600276', '恒瑞医药', '医药生物'],
  ['300760', '迈瑞医疗', '医药生物'],
  ['603259', '药明康德', '医药生物'],
  ['000538', '云南白药', '医药生物'],
  ['300015', '爱尔眼科', '医药生物'],
  ['002475', '立讯精密', '电子'],
  ['688981', '中芯国际', '电子'],
  ['002371', '北方华创', '电子'],
  ['603501', '韦尔股份', '电子'],
  ['000725', '京东方A', '电子'],
  ['603296', '华勤技术', '电子'],
  ['300750', '宁德时代', '电力设备'],
  ['601012', '隆基绿能', '电力设备'],
  ['600438', '通威股份', '电力设备'],
  ['300274', '阳光电源', '电力设备'],
  ['301358', '湖南裕能', '电力设备'],
  ['688111', '金山办公', '计算机'],
  ['002230', '科大讯飞', '计算机'],
  ['600588', '用友网络', '计算机'],
  ['000157', '中联重科', '机械设备'],
  ['600031', '三一重工', '机械设备'],
  ['300450', '先导智能', '机械设备'],
  ['000333', '美的集团', '家用电器'],
  ['000651', '格力电器', '家用电器'],
  ['600690', '海尔智家', '家用电器'],
  ['002594', '比亚迪', '汽车'],
  ['601238', '广汽集团', '汽车'],
  ['601633', '长城汽车', '汽车'],
  ['600104', '上汽集团', '汽车'],
  ['600660', '福耀玻璃', '汽车'],
  ['600309', '万华化学', '基础化工'],
  ['002493', '荣盛石化', '基础化工'],
  ['603260', '合盛硅业', '基础化工'],
  ['600019', '宝钢股份', '钢铁'],
  ['000709', '河钢股份', '钢铁'],
  ['603993', '洛阳钼业', '有色金属'],
  ['600547', '山东黄金', '有色金属'],
  ['002460', '赣锋锂业', '有色金属'],
  ['601899', '紫金矿业', '有色金属'],
  ['601668', '中国建筑', '建筑装饰'],
  ['601186', '中国铁建', '建筑装饰'],
  ['600585', '海螺水泥', '建筑材料'],
  ['002714', '牧原股份', '农林牧渔'],
  ['300498', '温氏股份', '农林牧渔'],
  ['600900', '长江电力', '公用事业'],
  ['003816', '中国广核', '公用事业'],
  ['601088', '中国神华', '煤炭'],
  ['601021', '春秋航空', '交通运输'],
  ['600009', '上海机场', '交通运输'],
  ['601006', '大秦铁路', '交通运输'],
  ['002352', '顺丰控股', '交通运输'],
  ['300413', '芒果超媒', '传媒'],
  ['002602', '世纪华通', '传媒'],
  ['600941', '中国移动', '通信'],
  ['000063', '中兴通讯', '通信'],
  ['600398', '海澜之家', '纺织服饰'],
  ['001979', '招商蛇口', '房地产'],
  ['300070', '碧水源', '环保'],
];

interface IndustryProfile {
  pe: [number, number];
  pb: [number, number];
  roe: [number, number];
  rev: [number, number];
  profit: [number, number];
  gm: [number, number] | null;
  div: [number, number];
  vol: [number, number];
  cap: [number, number];
  rate: [number, number];
}

const PROFILES: Record<string, IndustryProfile> = {
  食品饮料: { pe: [26, 8], pb: [6.5, 2.5], roe: [21, 6], rev: [9, 5], profit: [13, 9], gm: [55, 14], div: [1.9, 0.9], vol: [25, 5], cap: [1500, 1600], rate: [0.5, 0.25] },
  银行: { pe: [5.8, 1.1], pb: [0.62, 0.14], roe: [11, 2], rev: [2.5, 2], profit: [3.5, 3.5], gm: null, div: [5.2, 1.0], vol: [17, 3], cap: [9000, 6000], rate: [0.35, 0.15] },
  非银金融: { pe: [14, 6], pb: [1.6, 0.7], roe: [10, 3], rev: [12, 8], profit: [10, 12], gm: null, div: [2.2, 1.0], vol: [26, 5], cap: [3000, 2500], rate: [0.7, 0.35] },
  医药生物: { pe: [32, 12], pb: [5, 2.5], roe: [15, 6], rev: [12, 7], profit: [18, 12], gm: [58, 12], div: [1.0, 0.6], vol: [28, 5], cap: [1300, 1200], rate: [0.7, 0.3] },
  电子: { pe: [38, 16], pb: [4.5, 2], roe: [12, 5], rev: [18, 10], profit: [25, 18], gm: [30, 9], div: [0.7, 0.5], vol: [34, 6], cap: [1100, 1000], rate: [0.9, 0.4] },
  电力设备: { pe: [24, 12], pb: [3, 1.5], roe: [12, 6], rev: [20, 12], profit: [22, 20], gm: [22, 8], div: [0.9, 0.6], vol: [33, 6], cap: [900, 900], rate: [0.9, 0.4] },
  计算机: { pe: [45, 18], pb: [5, 2], roe: [11, 5], rev: [15, 9], profit: [20, 15], gm: [40, 12], div: [0.6, 0.4], vol: [32, 6], cap: [700, 600], rate: [0.9, 0.4] },
  机械设备: { pe: [22, 9], pb: [2.4, 1], roe: [11, 4], rev: [12, 8], profit: [15, 12], gm: [28, 8], div: [1.6, 0.8], vol: [28, 5], cap: [600, 500], rate: [0.7, 0.3] },
  家用电器: { pe: [13, 5], pb: [2.6, 1], roe: [20, 6], rev: [7, 5], profit: [12, 9], gm: [28, 8], div: [3.4, 1.2], vol: [24, 5], cap: [1300, 1100], rate: [0.6, 0.25] },
  汽车: { pe: [22, 10], pb: [2.5, 1.2], roe: [11, 5], rev: [12, 9], profit: [18, 16], gm: [20, 7], div: [2.0, 1.0], vol: [29, 6], cap: [1200, 1300], rate: [0.7, 0.3] },
  基础化工: { pe: [18, 9], pb: [2, 1], roe: [10, 5], rev: [9, 8], profit: [12, 14], gm: [22, 9], div: [1.8, 1.0], vol: [30, 6], cap: [800, 700], rate: [0.7, 0.3] },
  钢铁: { pe: [12, 6], pb: [0.9, 0.3], roe: [7, 3], rev: [3, 4], profit: [5, 8], gm: [9, 4], div: [2.8, 1.0], vol: [28, 5], cap: [700, 500], rate: [0.6, 0.25] },
  有色金属: { pe: [22, 12], pb: [2.6, 1.3], roe: [12, 6], rev: [15, 12], profit: [25, 22], gm: [18, 8], div: [1.2, 0.8], vol: [35, 7], cap: [1000, 900], rate: [0.8, 0.35] },
  建筑装饰: { pe: [7, 3], pb: [0.7, 0.2], roe: [9, 2], rev: [6, 5], profit: [6, 6], gm: [10, 3], div: [2.6, 0.9], vol: [24, 4], cap: [1500, 1200], rate: [0.5, 0.2] },
  建筑材料: { pe: [12, 5], pb: [1.2, 0.4], roe: [10, 3], rev: [6, 5], profit: [10, 9], gm: [25, 6], div: [3.0, 1.0], vol: [26, 5], cap: [800, 400], rate: [0.6, 0.25] },
  农林牧渔: { pe: [20, 15], pb: [2.8, 1.5], roe: [10, 8], rev: [10, 9], profit: [15, 25], gm: [15, 8], div: [1.5, 1.0], vol: [31, 6], cap: [700, 600], rate: [0.8, 0.35] },
  公用事业: { pe: [16, 6], pb: [1.8, 0.7], roe: [10, 3], rev: [6, 4], profit: [12, 8], gm: [35, 10], div: [2.6, 0.9], vol: [20, 4], cap: [1300, 1000], rate: [0.5, 0.2] },
  煤炭: { pe: [9, 3], pb: [1.3, 0.4], roe: [14, 4], rev: [5, 5], profit: [8, 9], gm: [35, 8], div: [5.0, 1.2], vol: [26, 5], cap: [2000, 800], rate: [0.55, 0.2] },
  交通运输: { pe: [15, 8], pb: [1.8, 0.9], roe: [9, 4], rev: [8, 6], profit: [12, 12], gm: [25, 10], div: [2.4, 1.1], vol: [26, 5], cap: [900, 700], rate: [0.6, 0.25] },
  传媒: { pe: [28, 14], pb: [2.8, 1.4], roe: [9, 5], rev: [10, 9], profit: [15, 18], gm: [35, 12], div: [1.2, 0.8], vol: [33, 6], cap: [400, 350], rate: [0.9, 0.4] },
  通信: { pe: [20, 9], pb: [2.2, 1], roe: [10, 4], rev: [8, 6], profit: [15, 12], gm: [32, 10], div: [2.2, 1.0], vol: [27, 5], cap: [1600, 1400], rate: [0.6, 0.25] },
  纺织服饰: { pe: [14, 6], pb: [1.8, 0.8], roe: [12, 4], rev: [6, 5], profit: [10, 9], gm: [40, 10], div: [3.2, 1.2], vol: [26, 5], cap: [300, 250], rate: [0.7, 0.3] },
  房地产: { pe: [10, 6], pb: [0.6, 0.2], roe: [6, 3], rev: [5, 7], profit: [8, 12], gm: [18, 6], div: [3.0, 1.4], vol: [32, 6], cap: [700, 500], rate: [0.7, 0.3] },
  环保: { pe: [18, 8], pb: [1.5, 0.6], roe: [8, 3], rev: [9, 7], profit: [10, 10], gm: [28, 8], div: [1.8, 0.9], vol: [29, 5], cap: [250, 200], rate: [0.8, 0.35] },
};

/** TTM 亏损（演示）：PE / PEG / PE 分位缺失 */
const LOSS_MAKING = new Set(['002714', '600438', '002493', '300070']);
/** 财务披露滞后（演示场景：仍为一季报口径） */
const FINANCE_LAG = new Set(['000709', '002602', '001979']);
/** 上市日期覆盖（其余按种子生成） */
const LIST_DATES: Record<string, string> = {
  '688981': '2020-07-16',
  '300760': '2018-10-16',
  '688111': '2019-11-18',
  '003816': '2019-08-26',
  '301358': '2023-02-08',
  '603296': '2023-08-08',
};
/** 上市不足 10 年：PE 历史分位缺失 */
const NO_PE_PERCENTILE = new Set(['688981', '300760', '688111', '003816', '301358', '603296']);

/** 知名个股数值覆盖（其余由行业基线生成） */
const OVERRIDES: Record<string, Partial<Record<MetricKey, number>>> = {
  '600519': { close: 1712.0, mktCap: 21500, pe: 24.5, pb: 8.9, roe: 32.0, grossMargin: 91.5, dividendYield: 3.1, volatility: 21.0 },
  '601398': { close: 6.6, mktCap: 23500, pe: 6.3, pb: 0.68, roe: 10.5, dividendYield: 5.9, volatility: 16.0 },
  '601939': { mktCap: 19500, pe: 6.8, dividendYield: 5.2 },
  '600036': { mktCap: 9800, pe: 7.6, roe: 15.2, dividendYield: 4.8 },
  '300750': { close: 266.0, mktCap: 11800, pe: 21.5, roe: 20.0, profitGrowth: 28.0, volatility: 31.0 },
  '002594': { mktCap: 9600, pe: 23.0, profitGrowth: 24.0 },
  '600941': { mktCap: 15800, pe: 15.5, dividendYield: 4.4, volatility: 17.0 },
  '600900': { mktCap: 6900, pe: 20.5, roe: 16.5, dividendYield: 3.6, volatility: 14.0, drawdown52w: -6.0 },
  '601088': { mktCap: 7600, pe: 12.5, dividendYield: 6.9, volatility: 20.0 },
  '000333': { mktCap: 4900, pe: 13.2, roe: 22.0, dividendYield: 4.1 },
  '600276': { pe: 46.0, profitGrowth: 32.0 },
  '601899': { mktCap: 5200, pe: 15.8, profitGrowth: 42.0 },
  '600547': { pe: 36.0, profitGrowth: 38.0 },
  '603288': { pe: 30.0, grossMargin: 36.5 },
  '002352': { mktCap: 2100 },
  '600009': { drawdown52w: -38.0 },
};

function round(v: number, d: number): number {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function genListDate(rng: () => number): string {
  const year = 1994 + Math.floor(rng() * 24);
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function genStock(code: string, name: string, industry: string): Stock {
  const prof = PROFILES[industry];
  const rng = mulberry32(hashStr(code));
  const loss = LOSS_MAKING.has(code);
  const m = {} as Record<MetricKey, number | null>;
  const dec = (k: MetricKey) => METRICS[k].decimals;

  // 基础指标（行业基线 + 种子噪声）
  const cap = Math.round(clamp(prof.cap[0] + gauss(rng) * prof.cap[1], 60, 26000));
  m.mktCap = cap;
  m.close = round(clamp(4 + rng() * 60 + gauss(rng) * 10, 2, 180), dec('close'));
  m.pe = loss ? null : round(clamp(prof.pe[0] + gauss(rng) * prof.pe[1], 3, 120), dec('pe'));
  m.pb = round(clamp(prof.pb[0] + gauss(rng) * prof.pb[1], 0.3, 15), dec('pb'));
  m.roe = loss ? round(-(2 + rng() * 9), dec('roe')) : round(clamp(prof.roe[0] + gauss(rng) * prof.roe[1], -5, 45), dec('roe'));
  m.revGrowth = loss ? round(-(3 + rng() * 12), dec('revGrowth')) : round(prof.rev[0] + gauss(rng) * prof.rev[1], dec('revGrowth'));
  m.profitGrowth = loss ? round(-(8 + rng() * 30), dec('profitGrowth')) : round(prof.profit[0] + gauss(rng) * prof.profit[1], dec('profitGrowth'));
  m.grossMargin = prof.gm == null ? null : round(clamp(prof.gm[0] + gauss(rng) * prof.gm[1], 2, 95), dec('grossMargin'));
  m.dividendYield = round(clamp(prof.div[0] + gauss(rng) * prof.div[1], 0, 12), dec('dividendYield'));
  m.volatility = round(clamp(prof.vol[0] + gauss(rng) * prof.vol[1], 8, 65), dec('volatility'));
  m.chg20d = round(gauss(rng) * 7, dec('chg20d'));
  m.chg60d = round(gauss(rng) * 16, dec('chg60d'));
  m.drawdown52w = round(clamp(-3 - rng() * 38 + gauss(rng) * 5, -70, -1), dec('drawdown52w'));

  // 知名个股覆盖
  const ov = OVERRIDES[code];
  if (ov) {
    for (const [k, v] of Object.entries(ov)) {
      m[k as MetricKey] = v;
    }
  }

  // 派生 / 条件性指标
  const rate = clamp(prof.rate[0] + gauss(rng) * prof.rate[1], 0.05, 3);
  m.avgTurnover = round(((m.mktCap as number) * rate) / 100, dec('avgTurnover'));
  m.pePercentile =
    loss || NO_PE_PERCENTILE.has(code) ? null : Math.round(clamp(50 + gauss(rng) * 22, 3, 97));
  m.pbPercentile =
    loss || NO_PE_PERCENTILE.has(code) ? null : Math.round(clamp(50 + gauss(rng) * 20, 3, 95));
  const profit = m.profitGrowth;
  m.peg = !loss && profit != null && profit > 5 && m.pe != null ? round(clamp(m.pe / Math.max(profit, 5), 0.2, 4.5), dec('peg')) : null;

  // 北向持股：部分缺失（显式提示，禁止静默补值）
  let north: number | null;
  let northNote: string | undefined;
  if ((m.mktCap as number) < 300 && rng() < 0.7) {
    north = null;
    northNote = '未纳入陆股通标的';
  } else if (rng() < 0.12) {
    north = null;
    northNote = '北向持股数据未披露（演示缺失）';
  } else {
    north = round(clamp(0.4 + rng() * 5.5, 0.1, 9), dec('northHolding'));
  }
  m.northHolding = north;

  // 缺失原因标注
  const missingNotes: Partial<Record<MetricKey, string>> = {};
  if (loss) {
    missingNotes.pe = 'TTM 归母净利润为负，市盈率无意义';
    missingNotes.peg = '净利润增速非正，PEG 无意义';
    missingNotes.pePercentile = '亏损状态下 PE 历史分位无意义';
  }
  if (prof.gm == null) missingNotes.grossMargin = '金融行业不适用毛利率口径';
  if (NO_PE_PERCENTILE.has(code) && !loss) missingNotes.pePercentile = '上市不足 10 年，历史分位序列不足';
  if (northNote) missingNotes.northHolding = northNote;

  // 上一交易日行情快照（用于每日监控 diff，确定性微扰）
  const prng = mulberry32(hashStr(`${code}|prev`));
  const pm = (v: number, rel: number, d: number) => round(v * (1 + gauss(prng) * rel), d);
  const prevMarket: Partial<Record<MetricKey, number | null>> = {
    close: pm(m.close as number, 0.007, dec('close')),
    mktCap: Math.round((m.mktCap as number) * (1 + gauss(prng) * 0.007)),
    pe: m.pe == null ? null : pm(m.pe, 0.008, dec('pe')),
    pb: pm(m.pb as number, 0.008, dec('pb')),
    pePercentile: m.pePercentile == null ? null : Math.round(clamp((m.pePercentile as number) + gauss(prng) * 1.4, 1, 99)),
    dividendYield: pm(m.dividendYield as number, 0.008, dec('dividendYield')),
    chg20d: round((m.chg20d as number) + gauss(prng) * 2.2, dec('chg20d')),
    chg60d: round((m.chg60d as number) + gauss(prng) * 2.8, dec('chg60d')),
    volatility: round((m.volatility as number) + gauss(prng) * 0.6, dec('volatility')),
    drawdown52w: round(clamp((m.drawdown52w as number) + gauss(prng) * 0.9, -78, 0), dec('drawdown52w')),
    avgTurnover: pm(m.avgTurnover as number, 0.12, dec('avgTurnover')),
  };

  return {
    code,
    name,
    industry,
    listDate: LIST_DATES[code] ?? genListDate(rng),
    m,
    prevMarket,
    asOfFinance: FINANCE_LAG.has(code)
      ? '2026 年一季报披露口径（中报暂缓披露，演示场景）'
      : '2026 年中报披露口径（截至 2026-08-31 披露）',
    asOfMarket: `${MARKET_SNAPSHOT_DATE} 收盘`,
    asOfNorth: `${PREV_TRADE_DATE} 陆股通持股披露`,
    missingNotes,
  };
}

/** 构建演示数据集（确定性：同种子同结果） */
export function buildDemoStocks(): Stock[] {
  return STOCK_LIST.map(([code, name, industry]) => genStock(code, name, industry));
}

/** 上一交易日的筛选行（财务指标不变，行情类替换为 prev 快照） */
export function stockAtPrevDay(stock: Stock): Stock {
  const m = { ...stock.m };
  for (const [k, v] of Object.entries(stock.prevMarket)) {
    if (v !== undefined) m[k as MetricKey] = v;
  }
  return {
    ...stock,
    m,
    asOfMarket: `${PREV_TRADE_DATE} 收盘（上一交易日）`,
  };
}
