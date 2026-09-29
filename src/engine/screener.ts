import { METRICS, OPERATOR_LABEL } from '../data/metrics';
import type { ScreenRow } from '../data/types';
import type { Condition, ConditionEval, EvalStatus, ExclusionReason, RowEval, ScreenResult } from './types';

/**
 * 确定性筛选引擎：纯规则求值，独立于 AI 解析层。
 * 同一输入（数据行 + 条件集）永远产出唯一可复现的结果。
 * 三态判定：通过 / 不通过 / 数据缺失（缺失显式提示，禁止静默赋默认值）。
 */

export function evalCondition(actual: number | null | undefined, cond: Condition): EvalStatus {
  if (actual == null || Number.isNaN(actual)) return 'missing';
  switch (cond.op) {
    case 'lt':
      return actual < cond.value ? 'pass' : 'fail';
    case 'lte':
      return actual <= cond.value ? 'pass' : 'fail';
    case 'gt':
      return actual > cond.value ? 'pass' : 'fail';
    case 'gte':
      return actual >= cond.value ? 'pass' : 'fail';
    case 'between': {
      const hi = cond.value2 ?? cond.value;
      const lo = Math.min(cond.value, hi);
      const up = Math.max(cond.value, hi);
      return actual >= lo && actual <= up ? 'pass' : 'fail';
    }
  }
}

export function fmtThreshold(v: number): string {
  return String(Number(v.toFixed(4)));
}

/** 人类可读的条件描述，如「PE-TTM ≤ 20 倍」 */
export function describeCondition(cond: Condition): string {
  const def = METRICS[cond.metric];
  if (cond.op === 'between') {
    const hi = cond.value2 ?? cond.value;
    const lo = Math.min(cond.value, hi);
    const up = Math.max(cond.value, hi);
    return `${def.short} 介于 ${fmtThreshold(lo)} ~ ${fmtThreshold(up)} ${def.unit}`;
  }
  return `${def.short} ${OPERATOR_LABEL[cond.op]} ${fmtThreshold(cond.value)} ${def.unit}`;
}

export function runScreen(rows: ScreenRow[], conditions: Condition[]): ScreenResult {
  const active = conditions.filter((c) => c.enabled);
  const evals: RowEval[] = rows.map((row) => {
    const cs: ConditionEval[] = active.map((c) => ({
      conditionId: c.id,
      status: evalCondition(row.m[c.metric], c),
      actual: row.m[c.metric],
    }));
    const failCount = cs.filter((e) => e.status === 'fail').length;
    const missingCount = cs.filter((e) => e.status === 'missing').length;
    return { row, evals: cs, passed: failCount === 0 && missingCount === 0, failCount, missingCount };
  });

  const passedRows = evals.filter((e) => e.passed);
  const excludedRows = evals.filter((e) => !e.passed);

  // 排除原因 Top 汇总（按条件统计被排除股票中的 不通过+缺失）
  const reasons: ExclusionReason[] = [];
  for (const cond of active) {
    let count = 0;
    for (const ev of excludedRows) {
      const e = ev.evals.find((x) => x.conditionId === cond.id);
      if (e && e.status !== 'pass') count += 1;
    }
    if (count > 0) reasons.push({ metric: cond.metric, label: describeCondition(cond), count });
  }
  reasons.sort((a, b) => b.count - a.count);

  return {
    passedRows,
    excludedRows,
    total: rows.length,
    passCount: passedRows.length,
    passRate: rows.length === 0 ? 0 : passedRows.length / rows.length,
    exclusionTop: reasons.slice(0, 5),
    activeConditionCount: active.length,
  };
}

/** 单个条件在完整池中的独立命中统计（条件漏斗：感知每条规则的筛选力度） */
export interface ConditionFunnel {
  pass: number;
  fail: number;
  missing: number;
}

export function conditionFunnel(rows: ScreenRow[], conditions: Condition[]): Record<string, ConditionFunnel> {
  const out: Record<string, ConditionFunnel> = {};
  for (const c of conditions) {
    if (!c.enabled) continue;
    let pass = 0;
    let fail = 0;
    let missing = 0;
    for (const row of rows) {
      const s = evalCondition(row.m[c.metric], c);
      if (s === 'pass') pass += 1;
      else if (s === 'fail') fail += 1;
      else missing += 1;
    }
    out[c.id] = { pass, fail, missing };
  }
  return out;
}
