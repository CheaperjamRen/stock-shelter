import type { MetricKey, Operator } from '../data/metrics';
import type { ScreenRow } from '../data/types';

/** 备选口径（换口径用） */
export interface ConditionAlternative {
  label: string;
  explanation: string;
  metric: MetricKey;
  op: Operator;
  value: number;
  value2?: number;
}

/** 结构化筛选条件（条件卡片的数据模型） */
export interface Condition {
  id: string;
  metric: MetricKey;
  op: Operator;
  value: number;
  /** between 区间上界 */
  value2?: number;
  enabled: boolean;
  /** 来源：意图解析 / 手动添加 */
  origin: 'intent' | 'manual';
  /** 解析命中的原始关键词（可解释性） */
  sourceKeyword?: string;
  /** 备选口径列表（来自歧义确认，支持一键切换） */
  alternatives?: ConditionAlternative[];
}

/** 三态判定：通过 / 不通过 / 数据缺失 */
export type EvalStatus = 'pass' | 'fail' | 'missing';

export interface ConditionEval {
  conditionId: string;
  status: EvalStatus;
  actual: number | null;
}

/** 单只股票的完整评估（逐条件核对单数据源） */
export interface RowEval {
  row: ScreenRow;
  evals: ConditionEval[];
  passed: boolean;
  failCount: number;
  missingCount: number;
}

export interface ExclusionReason {
  metric: MetricKey;
  label: string;
  count: number;
}

export interface ScreenResult {
  passedRows: RowEval[];
  excludedRows: RowEval[];
  total: number;
  passCount: number;
  passRate: number;
  exclusionTop: ExclusionReason[];
  activeConditionCount: number;
}

/** 冲突与张力检测结果 */
export interface ConflictResult {
  /** 硬冲突：阻断筛选执行 */
  hard: string[];
  /** 张力组合：警示但允许执行 */
  warnings: string[];
}
