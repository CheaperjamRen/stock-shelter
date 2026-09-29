import type { MetricKey } from './metrics';

/**
 * 筛选行：确定性引擎求值的最小数据结构。
 * Stock 与历史快照行均满足该结构；所有口径时点标注随行携带，保证关键数字可追溯。
 */
export interface ScreenRow {
  code: string;
  name: string;
  industry: string;
  /** 上市日期（回测中用于剔除当时尚未上市的标的） */
  listDate: string;
  /** 指标快照：null = 数据缺失（三态判定中的「缺数据」） */
  m: Record<MetricKey, number | null>;
  /** 财务类指标统计时点（如「2026 年中报披露口径」） */
  asOfFinance: string;
  /** 行情类指标统计时点（如「2026-09-25 收盘」） */
  asOfMarket: string;
  /** 北向持股统计时点 */
  asOfNorth: string;
  /** 字段缺失原因说明 */
  missingNotes: Partial<Record<MetricKey, string>>;
}

export interface Stock extends ScreenRow {
  /** 上一交易日行情类指标快照（用于每日监控的新增/退出 diff） */
  prevMarket: Partial<Record<MetricKey, number | null>>;
  /** 当日成交额（元，仅真实数据宽层注入；用于候选精算池的流动性排序） */
  liquid?: number;
}
