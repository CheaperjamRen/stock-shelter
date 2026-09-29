import { METRICS } from '../data/metrics';
import { describeCondition } from './screener';
import type { Condition, ConflictResult } from './types';

/**
 * 冲突与张力检测（AI 解析层的逻辑校验职责，同样适用于手动编辑后的实时校验）：
 * - 硬冲突：同一指标出现数学上互斥的边界（如 PE<20 且 PE>50），阻断执行并提示修正；
 * - 张力组合：业务常理上难以并存的组合（如高股息 + 高成长），警示但允许执行。
 */

const isHigh = (c: Condition) => c.op === 'gt' || c.op === 'gte';
const isLow = (c: Condition) => c.op === 'lt' || c.op === 'lte';
const atLeast = (c: Condition, v: number) => isHigh(c) && c.value >= v;
const atMost = (c: Condition, v: number) => isLow(c) && c.value <= v;

export function detectConflicts(conditions: Condition[]): ConflictResult {
  const hard: string[] = [];
  const warnings: string[] = [];
  const active = conditions.filter((c) => c.enabled);

  // 按指标聚合，检查边界互斥
  const byMetric = new Map<string, Condition[]>();
  for (const c of active) {
    const arr = byMetric.get(c.metric);
    if (arr) arr.push(c);
    else byMetric.set(c.metric, [c]);
  }

  for (const [metric, conds] of byMetric) {
    const def = METRICS[metric as Condition['metric']];
    if (!def) continue;

    for (const c of conds) {
      if (c.op === 'between' && (c.value2 ?? c.value) <= c.value) {
        hard.push(`「${def.name}」的区间条件无效：下界 ${c.value} 不小于上界 ${c.value2 ?? c.value}，请修正。`);
      }
    }

    let minUpper = Number.POSITIVE_INFINITY;
    let upperDesc = '';
    let maxLower = Number.NEGATIVE_INFINITY;
    let lowerDesc = '';
    for (const c of conds) {
      if (isLow(c) && c.value < minUpper) {
        minUpper = c.value;
        upperDesc = describeCondition(c);
      }
      if (isHigh(c) && c.value > maxLower) {
        maxLower = c.value;
        lowerDesc = describeCondition(c);
      }
      if (c.op === 'between') {
        const hi = c.value2 ?? c.value;
        if (hi < minUpper) {
          minUpper = hi;
          upperDesc = describeCondition(c);
        }
        if (c.value > maxLower) {
          maxLower = c.value;
          lowerDesc = describeCondition(c);
        }
      }
    }
    if (maxLower > Number.NEGATIVE_INFINITY && minUpper < Number.POSITIVE_INFINITY && maxLower >= minUpper) {
      hard.push(`「${def.name}」存在硬冲突：同时要求 ${lowerDesc} 与 ${upperDesc}，数学上无解，请修正后重试。`);
    }
  }

  // 张力组合（警示但允许执行）
  const has = (metric: Condition['metric'], pred: (c: Condition) => boolean) =>
    active.some((c) => c.metric === metric && pred(c));

  if (
    (has('dividendYield', (c) => atLeast(c, 4)) && has('profitGrowth', (c) => atLeast(c, 25))) ||
    (has('dividendYield', (c) => atLeast(c, 4)) && has('revGrowth', (c) => atLeast(c, 20)))
  ) {
    warnings.push('张力提示：高股息与高成长并存较为罕见——成熟高分红公司通常增速放缓，同时满足的样本可能极少，结果区分度或不足。');
  }
  if (has('volatility', (c) => atMost(c, 20)) && (has('chg60d', (c) => atLeast(c, 25)) || has('chg20d', (c) => atLeast(c, 12)))) {
    warnings.push('张力提示：低波动与短期强势动量并存的概率较低——大幅上涨通常伴随波动率抬升，请注意组合可能过窄。');
  }
  if (has('pe', (c) => atMost(c, 12)) && has('profitGrowth', (c) => atLeast(c, 30))) {
    warnings.push('张力提示：深度低估值与高增长并存较少见，建议核对盈利质量（是否含一次性损益）与估值口径时点。');
  }
  if (has('mktCap', (c) => atMost(c, 200)) && has('northHolding', (c) => atLeast(c, 4))) {
    warnings.push('张力提示：小市值与高北向持股并存较罕见（陆股通标的以中大市值为主），该条件下数据缺失比例可能较高。');
  }

  return { hard, warnings };
}
