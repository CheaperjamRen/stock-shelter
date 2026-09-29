/**
 * 指标目录：全站唯一口径定义来源。
 * 每个指标必须携带：通俗定义、统计时点、数据来源、单位、合理区间（供 What-if / 输入校验）。
 */

export type MetricKey =
  | 'close'
  | 'mktCap'
  | 'pe'
  | 'pePercentile'
  | 'peIndRel'
  | 'pb'
  | 'pbPercentile'
  | 'peg'
  | 'roe'
  | 'revGrowth'
  | 'profitGrowth'
  | 'grossMargin'
  | 'dividendYield'
  | 'chg20d'
  | 'chg60d'
  | 'volatility'
  | 'drawdown52w'
  | 'northHolding'
  | 'avgTurnover';

export type Operator = 'lt' | 'lte' | 'gt' | 'gte' | 'between';

export type MetricCategory =
  | '估值'
  | '成长'
  | '盈利质量'
  | '动量'
  | '波动'
  | '股息'
  | '市值'
  | '流动性';

/** 指标口径四要素：定义 / 统计时点 / 数据来源 / 单位 */
export interface MetricDef {
  key: MetricKey;
  /** 完整名称（条件卡、抽屉用） */
  name: string;
  /** 表格列短名 */
  short: string;
  unit: string;
  category: MetricCategory;
  /** 通俗定义 */
  definition: string;
  /** 统计时点说明（具体日期由股票级 asOf 提供） */
  dataPoint: string;
  /** 数据来源 */
  source: string;
  /** 合理取值区间（输入校验与 What-if 边界） */
  domain: [number, number];
  /** 输入步长 */
  step: number;
  /** 显示小数位 */
  decimals: number;
  /** 是否可加入筛选条件（收盘价仅展示） */
  filterable: boolean;
  /** 数值越高越好（true）/越低越好（false）/中性（null），用于对比池极值标注 */
  higherIsBetter: boolean | null;
  /** 口径时点分组：行情 / 财务 / 北向 */
  asOfGroup: 'market' | 'finance' | 'north';
  /** 添加条件时的默认操作符与阈值 */
  defaultCond: { op: Operator; value: number; value2?: number };
}

export const METRICS: Record<MetricKey, MetricDef> = {
  close: {
    key: 'close',
    name: '收盘价',
    short: '收盘价',
    unit: '元',
    category: '市值',
    definition: '最近一个交易日收盘价格（不复权），用于展示与计算市值类指标。',
    dataPoint: '行情快照日收盘',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 5000],
    step: 0.01,
    decimals: 2,
    filterable: false,
    higherIsBetter: null,
    asOfGroup: 'market',
    defaultCond: { op: 'lte', value: 100 },
  },
  mktCap: {
    key: 'mktCap',
    name: '总市值',
    short: '总市值',
    unit: '亿元',
    category: '市值',
    definition: '总股本 × 收盘价，衡量公司规模。常用于区分大盘 / 中盘 / 小盘风格。',
    dataPoint: '行情快照日收盘计算',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 30000],
    step: 1,
    decimals: 0,
    filterable: true,
    higherIsBetter: null,
    asOfGroup: 'market',
    defaultCond: { op: 'gte', value: 500 },
  },
  pe: {
    key: 'pe',
    name: 'PE-TTM',
    short: 'PE-TTM',
    unit: '倍',
    category: '估值',
    definition: '市盈率（滚动十二个月）：总市值 ÷ 最近四个季度归母净利润。亏损公司该指标无意义，显示为数据缺失。',
    dataPoint: '行情快照日收盘 × 最近四季报财务口径',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 200],
    step: 0.1,
    decimals: 1,
    filterable: true,
    higherIsBetter: false,
    asOfGroup: 'market',
    defaultCond: { op: 'lt', value: 20 },
  },
  pePercentile: {
    key: 'pePercentile',
    name: 'PE 近 10 年历史分位',
    short: 'PE分位',
    unit: '%',
    category: '估值',
    definition: '当前 PE-TTM 在自身过去 10 年每日 PE 序列中的百分位。30% 表示当前估值低于历史上 70% 的交易日，用于纵向估值比较。',
    dataPoint: '截至行情快照日，向前追溯 10 年',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 100],
    step: 1,
    decimals: 0,
    filterable: true,
    higherIsBetter: false,
    asOfGroup: 'market',
    defaultCond: { op: 'lte', value: 30 },
  },
  peIndRel: {
    key: 'peIndRel',
    name: 'PE 相对行业中位数',
    short: 'PE/行业中位',
    unit: '倍',
    category: '估值',
    definition: '个股 PE-TTM ÷ 同行业（申万一级）PE-TTM 中位数。小于 1 表示估值低于行业中位水平，用于横向估值比较。',
    dataPoint: '随行情快照，按当日样本行业内计算',
    source: '演示数据集行业内计算（派生指标）',
    domain: [0, 3],
    step: 0.05,
    decimals: 2,
    filterable: true,
    higherIsBetter: false,
    asOfGroup: 'market',
    defaultCond: { op: 'lt', value: 1 },
  },
  pb: {
    key: 'pb',
    name: 'PB（市净率）',
    short: 'PB',
    unit: '倍',
    category: '估值',
    definition: '总市值 ÷ 归母净资产。小于 1 即「破净」，常用于银行、地产等重资产行业的估值锚。',
    dataPoint: '行情快照日收盘 × 最新报告期净资产',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 20],
    step: 0.1,
    decimals: 2,
    filterable: true,
    higherIsBetter: false,
    asOfGroup: 'market',
    defaultCond: { op: 'lt', value: 1.5 },
  },
  pbPercentile: {
    key: 'pbPercentile',
    name: 'PB 近 10 年历史分位',
    short: 'PB分位',
    unit: '%',
    category: '估值',
    definition: '当前 PB 在自身过去 10 年每日 PB 序列中的百分位。40% 表示当前市净率低于历史上 60% 的交易日，用于纵向估值比较。',
    dataPoint: '截至行情快照日，向前追溯 10 年',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 100],
    step: 1,
    decimals: 0,
    filterable: true,
    higherIsBetter: false,
    asOfGroup: 'market',
    defaultCond: { op: 'lte', value: 40 },
  },
  peg: {
    key: 'peg',
    name: 'PEG',
    short: 'PEG',
    unit: '倍',
    category: '估值',
    definition: 'PE-TTM ÷ 归母净利润同比增速（百分比数值）。约等于 1 通常被视为估值与成长匹配；增速非正时无意义，显示为数据缺失。',
    dataPoint: '行情快照日 PE × 最新财务增速',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 5],
    step: 0.1,
    decimals: 2,
    filterable: true,
    higherIsBetter: false,
    asOfGroup: 'finance',
    defaultCond: { op: 'lte', value: 1.5 },
  },
  roe: {
    key: 'roe',
    name: 'ROE-TTM',
    short: 'ROE-TTM',
    unit: '%',
    category: '盈利质量',
    definition: '净资产收益率（滚动十二个月）：归母净利润 ÷ 平均归母净资产，衡量股东资本的赚钱效率。',
    dataPoint: '最新披露报告期（滚动四季）',
    source: '演示财务快照（模拟生成，非真实披露）',
    domain: [-50, 60],
    step: 0.1,
    decimals: 1,
    filterable: true,
    higherIsBetter: true,
    asOfGroup: 'finance',
    defaultCond: { op: 'gte', value: 15 },
  },
  revGrowth: {
    key: 'revGrowth',
    name: '营收同比增速',
    short: '营收增速',
    unit: '%',
    category: '成长',
    definition: '营业收入较上年同期增长率，衡量业务规模的扩张速度。',
    dataPoint: '最新披露报告期同比',
    source: '演示财务快照（模拟生成，非真实披露）',
    domain: [-100, 300],
    step: 0.5,
    decimals: 1,
    filterable: true,
    higherIsBetter: true,
    asOfGroup: 'finance',
    defaultCond: { op: 'gte', value: 15 },
  },
  profitGrowth: {
    key: 'profitGrowth',
    name: '归母净利润同比增速',
    short: '净利增速',
    unit: '%',
    category: '成长',
    definition: '归属母公司股东的净利润较上年同期增长率，衡量盈利端的改善或恶化幅度。',
    dataPoint: '最新披露报告期同比',
    source: '演示财务快照（模拟生成，非真实披露）',
    domain: [-100, 500],
    step: 0.5,
    decimals: 1,
    filterable: true,
    higherIsBetter: true,
    asOfGroup: 'finance',
    defaultCond: { op: 'gte', value: 20 },
  },
  grossMargin: {
    key: 'grossMargin',
    name: '毛利率',
    short: '毛利率',
    unit: '%',
    category: '盈利质量',
    definition: '(营业收入 − 营业成本) ÷ 营业收入，衡量产品或服务的定价权与成本壁垒。金融行业不适用该口径，显示为数据缺失。',
    dataPoint: '最新披露报告期',
    source: '演示财务快照（模拟生成，非真实披露）',
    domain: [0, 100],
    step: 0.5,
    decimals: 1,
    filterable: true,
    higherIsBetter: true,
    asOfGroup: 'finance',
    defaultCond: { op: 'gte', value: 40 },
  },
  dividendYield: {
    key: 'dividendYield',
    name: '股息率（TTM）',
    short: '股息率',
    unit: '%',
    category: '股息',
    definition: '近 12 个月每股分红合计 ÷ 当前股价，衡量现金回报水平。',
    dataPoint: '行情快照日收盘 × 近 12 月分红',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 15],
    step: 0.1,
    decimals: 2,
    filterable: true,
    higherIsBetter: true,
    asOfGroup: 'market',
    defaultCond: { op: 'gte', value: 4 },
  },
  chg20d: {
    key: 'chg20d',
    name: '近 20 日涨跌幅',
    short: '近20日',
    unit: '%',
    category: '动量',
    definition: '最近 20 个交易日收盘价涨跌幅（短期动量）。',
    dataPoint: '截至行情快照日，向前 20 个交易日',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [-50, 50],
    step: 0.5,
    decimals: 2,
    filterable: true,
    higherIsBetter: true,
    asOfGroup: 'market',
    defaultCond: { op: 'gte', value: 5 },
  },
  chg60d: {
    key: 'chg60d',
    name: '近 60 日涨跌幅',
    short: '近60日',
    unit: '%',
    category: '动量',
    definition: '最近 60 个交易日收盘价涨跌幅（中期动量）。',
    dataPoint: '截至行情快照日，向前 60 个交易日',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [-80, 120],
    step: 0.5,
    decimals: 2,
    filterable: true,
    higherIsBetter: true,
    asOfGroup: 'market',
    defaultCond: { op: 'gte', value: 15 },
  },
  volatility: {
    key: 'volatility',
    name: '年化波动率',
    short: '年化波动',
    unit: '%',
    category: '波动',
    definition: '近 60 个交易日日收益率标准差 × √250，衡量价格波动的剧烈程度，数值越小走势越平稳。',
    dataPoint: '截至行情快照日，向前 60 个交易日',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 80],
    step: 0.5,
    decimals: 1,
    filterable: true,
    higherIsBetter: false,
    asOfGroup: 'market',
    defaultCond: { op: 'lte', value: 25 },
  },
  drawdown52w: {
    key: 'drawdown52w',
    name: '距 52 周高点回撤',
    short: '52周回撤',
    unit: '%',
    category: '动量',
    definition: '当前价相对过去 52 周最高价的回撤幅度，0 表示处于一年高点附近，-30 表示较高点下跌 30%。',
    dataPoint: '截至行情快照日，向前 52 周',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [-80, 0],
    step: 0.5,
    decimals: 1,
    filterable: true,
    higherIsBetter: true,
    asOfGroup: 'market',
    defaultCond: { op: 'lte', value: -20 },
  },
  northHolding: {
    key: 'northHolding',
    name: '北向持股占比',
    short: '北向占比',
    unit: '%',
    category: '流动性',
    definition: '陆股通（北向资金）持股数量 ÷ 自由流通股本。部分股票未纳入陆股通标的或未披露，显示为数据缺失。',
    dataPoint: '陆股通持股披露日（详见个股标注）',
    source: '演示陆股通快照（模拟生成，非真实披露）',
    domain: [0, 15],
    step: 0.1,
    decimals: 2,
    filterable: true,
    higherIsBetter: null,
    asOfGroup: 'north',
    defaultCond: { op: 'gte', value: 3 },
  },
  avgTurnover: {
    key: 'avgTurnover',
    name: '近 20 日日均成交额',
    short: '日均成交',
    unit: '亿元',
    category: '流动性',
    definition: '最近 20 个交易日成交金额的日均值，衡量交易活跃度与进出容量。',
    dataPoint: '截至行情快照日，向前 20 个交易日',
    source: '演示数据快照（模拟生成，非真实行情）',
    domain: [0, 200],
    step: 0.5,
    decimals: 1,
    filterable: true,
    higherIsBetter: null,
    asOfGroup: 'market',
    defaultCond: { op: 'gte', value: 10 },
  },
};

export const METRIC_LIST: MetricDef[] = Object.values(METRICS);

export const CATEGORY_ORDER: MetricCategory[] = [
  '估值',
  '成长',
  '盈利质量',
  '动量',
  '波动',
  '股息',
  '市值',
  '流动性',
];

/** 示例短语：一键填充 */
export const EXAMPLE_PHRASES: string[] = [
  '经营改善、估值合理、走势相对稳定',
  '高股息、低估值的大市值蓝筹',
  '业绩高增长、北向重仓的强势股',
  '波动小、回撤浅、成交活跃',
  '毛利率高、PEG 低于 1.5 的优质公司',
  '超跌的优质白马，ROE 高于 15%',
];

export const OPERATOR_LABEL: Record<Operator, string> = {
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  between: '介于',
};
