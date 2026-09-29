import type { MetricKey } from './metrics';
import type { ScreenRow } from './types';

/**
 * 派生指标计算：在每次筛选前对当次样本执行，保证口径随样本一致且确定性可复现。
 * 当前派生指标：PE 相对行业中位数（peIndRel）。
 */
export function withDerivedMetrics<T extends ScreenRow>(rows: T[]): T[] {
  const byIndustry = new Map<string, number[]>();
  for (const r of rows) {
    const pe = r.m.pe;
    if (pe != null && pe > 0) {
      const arr = byIndustry.get(r.industry);
      if (arr) arr.push(pe);
      else byIndustry.set(r.industry, [pe]);
    }
  }
  const medians = new Map<string, number>();
  for (const [ind, arr] of byIndustry) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    medians.set(ind, med);
  }
  return rows.map((r) => {
    const med = medians.get(r.industry);
    const pe = r.m.pe;
    const rel = med != null && pe != null && pe > 0 ? Number(((pe / med) as number).toFixed(4)) : null;
    if (r.m.peIndRel === rel) return r;
    return { ...r, m: { ...r.m, peIndRel: rel } } as T;
  });
}

/** 字段是否为派生指标（用于口径展示区分） */
export const DERIVED_KEYS: MetricKey[] = ['peIndRel'];
