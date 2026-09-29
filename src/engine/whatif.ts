import { METRICS } from '../data/metrics';
import type { ScreenRow } from '../data/types';
import { runScreen } from './screener';
import type { Condition } from './types';

/**
 * What-if 敏感性分析（确定性）：
 * 选定一条生效条件、调整幅度 ±10% / ±20%，
 * 同时给出「阈值放宽会纳入 X 只」与「收紧会剔除 Y 只」双向边际名单。
 * 放宽 = 该条件更容易通过（upper-bound 调大阈值 / lower-bound 调小阈值）。
 */

const isUpper = (c: Condition) => c.op === 'lt' || c.op === 'lte';
const isLower = (c: Condition) => c.op === 'gt' || c.op === 'gte';

function scaleBounds(c: Condition, pct: number, widen: boolean): Condition {
  if (c.op === 'between') {
    const hi = c.value2 ?? c.value;
    const mid = (c.value + hi) / 2;
    const half = Math.max(((hi - c.value) / 2) * (widen ? 1 + pct : 1 - pct), 0);
    return { ...c, value: Number((mid - half).toFixed(4)), value2: Number((mid + half).toFixed(4)) };
  }
  if (isUpper(c)) {
    return { ...c, value: Number((c.value * (widen ? 1 + pct : 1 - pct)).toFixed(4)) };
  }
  if (isLower(c)) {
    return { ...c, value: Number((c.value * (widen ? 1 - pct : 1 + pct)).toFixed(4)) };
  }
  return c;
}

export function whatIf(rows: ScreenRow[], conditions: Condition[], targetId: string, pct: number) {
  const target = conditions.find((c) => c.id === targetId);
  if (!target || !target.enabled) return null;

  const base = runScreen(rows, conditions);
  const relaxedSet = conditions.map((c) => (c.id === targetId ? scaleBounds(c, pct, true) : c));
  const tightenedSet = conditions.map((c) => (c.id === targetId ? scaleBounds(c, pct, false) : c));
  const relaxed = runScreen(rows, relaxedSet);
  const tightened = runScreen(rows, tightenedSet);

  const baseCodes = new Set(base.passedRows.map((r) => r.row.code));
  const relaxCodes = new Set(relaxed.passedRows.map((r) => r.row.code));
  const tightCodes = new Set(tightened.passedRows.map((r) => r.row.code));

  // 放宽纳入 = 放宽版通过 − 基线；收紧剔除 = 基线 − 收紧版通过
  const enter = relaxed.passedRows.filter((r) => !baseCodes.has(r.row.code));
  const exit = base.passedRows.filter((r) => !tightCodes.has(r.row.code));

  const def = METRICS[target.metric];
  const pctLabel = Math.round(pct * 100);
  const names = (arr: typeof enter) => (arr.length === 0 ? '无' : arr.map((r) => r.row.name).join('、'));
  const summary =
    `在「${def.short}」当前阈值基础上：放宽 ${pctLabel}% 会纳入 ${enter.length} 只（${names(enter)}），` +
    `当前通过 ${base.passCount} 只 → 放宽后 ${relaxed.passCount} 只；` +
    `收紧 ${pctLabel}% 会剔除 ${exit.length} 只（${names(exit)}），收紧后剩余 ${tightened.passCount} 只。`;

  return {
    pct: pctLabel,
    target,
    baseCount: base.passCount,
    relaxedCount: relaxed.passCount,
    tightenedCount: tightened.passCount,
    enter,
    exit,
    summary,
  };
}

export type WhatIfResult = ReturnType<typeof whatIf>;
