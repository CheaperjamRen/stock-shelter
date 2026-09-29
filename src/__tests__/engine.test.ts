import { describe, expect, it } from 'vitest';
import { withDerivedMetrics } from '@/data/derive';
import { buildDemoStocks } from '@/data/stocks';
import type { Stock } from '@/data/types';
import { detectConflicts } from '@/engine/conflict';
import { parseIntent } from '@/engine/parser';
import { conditionFunnel, runScreen } from '@/engine/screener';
import type { Condition } from '@/engine/types';
import { runBacktest } from '@/engine/backtest';
import { whatIf } from '@/engine/whatif';

/** 确定性引擎链路验证：解析 → 筛选 → what-if → 回测 */

const stocks: Stock[] = buildDemoStocks();
const rows = withDerivedMetrics(stocks);

function cond(metric: Condition['metric'], op: Condition['op'], value: number, value2?: number): Condition {
  return { id: `c-${metric}-${op}-${value}`, metric, op, value, value2, enabled: true, origin: 'manual' };
}

describe('演示数据集', () => {
  it('包含 60+ 只股票且覆盖多行业', () => {
    expect(stocks.length).toBeGreaterThanOrEqual(60);
    expect(new Set(stocks.map((s) => s.industry)).size).toBeGreaterThanOrEqual(15);
  });

  it('存在数据缺失样本（北向/亏损 PE 等）', () => {
    expect(stocks.some((s) => s.m.northHolding == null)).toBe(true);
    expect(stocks.some((s) => s.m.pe == null)).toBe(true);
    expect(stocks.some((s) => s.m.grossMargin == null)).toBe(true);
  });

  it('派生指标 peIndRel 与行业 PE 中位数一致', () => {
    const maotai = rows.find((r) => r.code === '600519');
    const peers = rows.filter((r) => r.industry === '食品饮料' && r.m.pe != null && r.m.pe > 0).map((r) => r.m.pe as number).sort((a, b) => a - b);
    expect(peers.length).toBeGreaterThan(1);
    const mid = Math.floor(peers.length / 2);
    const med = peers.length % 2 === 1 ? peers[mid] : (peers[mid - 1] + peers[mid]) / 2;
    expect(maotai?.m.peIndRel).toBeCloseTo(((maotai?.m.pe as number) / med) as number, 2);
  });
});

describe('意图解析（AI 层只解析不选股）', () => {
  it('示例意图解析为条件卡片 + 歧义确认', () => {
    const r = parseIntent('经营改善、估值合理、走势相对稳定');
    expect(r.conditions.map((c) => c.metric)).toContain('profitGrowth');
    expect(r.conditions.map((c) => c.metric)).toContain('volatility');
    expect(r.ambiguities.length).toBe(1);
    expect(r.ambiguities[0].options.length).toBeGreaterThanOrEqual(3);
  });

  it('数字条件抽取与回撤口径换算', () => {
    const r = parseIntent('ROE 高于 12，回撤小于 30%，PE-TTM 低于 25');
    expect(r.conditions).toHaveLength(3);
    const dd = r.conditions.find((c) => c.metric === 'drawdown52w');
    expect(dd?.op).toBe('gte');
    expect(dd?.value).toBe(-30);
    const pe = r.conditions.find((c) => c.metric === 'pe');
    expect(pe?.value).toBe(25);
  });

  it('显式短语与关键词模板同口径重复时合并为一条条件', () => {
    const r = parseIntent('超跌的优质白马，ROE 高于 15%');
    const roeConds = r.conditions.filter((c) => c.metric === 'roe');
    expect(roeConds).toHaveLength(1);
    expect(r.conditions.map((c) => c.metric)).toContain('drawdown52w');
    // 合并动作需在步骤中明示（可解释性）
    const merged = r.steps.find((s) => s.kind === 'note' && s.text.includes('语义重复，已合并'));
    expect(merged).toBeTruthy();
  });

  it('不同阈值的方向相同条件保持并存（不做蕴含化简）', () => {
    const r = parseIntent('白马，ROE 高于 20%');
    const roeConds = r.conditions.filter((c) => c.metric === 'roe');
    expect(roeConds.map((c) => Math.round(c.value)).sort()).toEqual([15, 20]);
  });

  it('无语义输入标记 unrecognized', () => {
    expect(parseIntent('今天天气不错').unrecognized).toBe(true);
  });
});

describe('确定性筛选引擎', () => {
  it('同一输入结果唯一可复现', () => {
    const a = runScreen(rows, [cond('roe', 'gte', 15), cond('pePercentile', 'lte', 40)]);
    const b = runScreen(rows, [cond('roe', 'gte', 15), cond('pePercentile', 'lte', 40)]);
    expect(a.passedRows.map((r) => r.row.code)).toEqual(b.passedRows.map((r) => r.row.code));
    expect(a.passCount).toBeGreaterThan(0);
  });

  it('三态判定：缺失不计入通过', () => {
    const r = runScreen(rows, [cond('northHolding', 'gte', 3)]);
    const missingRow = r.excludedRows.find((e) => e.missingCount > 0);
    expect(missingRow).toBeDefined();
    expect(r.passedRows.every((e) => e.missingCount === 0)).toBe(true);
  });

  it('禁用条件不参与求值', () => {
    const all = runScreen(rows, [cond('roe', 'gte', 15, undefined), { ...cond('pe', 'lt', 1), enabled: false }]);
    const only = runScreen(rows, [cond('roe', 'gte', 15)]);
    expect(all.passCount).toBe(only.passCount);
  });
});

describe('冲突与张力检测', () => {
  it('PE<20 且 PE>50 判定硬冲突', () => {
    const r = detectConflicts([cond('pe', 'lt', 20), cond('pe', 'gt', 50)]);
    expect(r.hard).toHaveLength(1);
  });

  it('高股息 + 高成长仅警示不阻断', () => {
    const r = detectConflicts([cond('dividendYield', 'gte', 5), cond('profitGrowth', 'gte', 30)]);
    expect(r.hard).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('What-if 敏感性', () => {
  it('放宽纳入与收紧剔除名单合理', () => {
    const cs = [cond('roe', 'gte', 15), cond('pePercentile', 'lte', 40)];
    const wi = whatIf(rows, cs, cs[0].id, 0.2);
    expect(wi).not.toBeNull();
    if (wi) {
      expect(wi.relaxedCount).toBeGreaterThanOrEqual(wi.baseCount);
      expect(wi.tightenedCount).toBeLessThanOrEqual(wi.baseCount);
      expect(wi.enter.length).toBe(wi.relaxedCount - wi.baseCount);
      expect(wi.summary).toContain('放宽');
      expect(wi.summary).toContain('收紧');
    }
  });
});

describe('简化历史回测', () => {
  it('输出绩效曲线与统计（防未来函数滞后取值）', () => {
    const bt = runBacktest(stocks, [cond('roe', 'gte', 12)]);
    expect(bt.points).toHaveLength(7);
    expect(bt.periodHoldings).toHaveLength(7);
    expect(bt.stats.totalQuarters).toBe(7);
    for (const p of bt.points) {
      expect(p.portfolioEquity).toBeGreaterThan(0);
      expect(p.csi300Equity).toBeGreaterThan(0);
    }
    expect(bt.survivalRate).not.toBeNull();
  });

  it('空结果期也能正常运行（等权 0 只时收益记 0）', () => {
    const bt = runBacktest(stocks, [cond('pe', 'lt', 0.01)]);
    expect(bt.points.every((p) => Number.isFinite(p.portfolioEquity))).toBe(true);
  });
});

describe('条件漏斗（单条件独立命中统计）', () => {
  it('命中 + 未命中 + 缺数据 = 完整池总数，且仅统计启用条件', () => {
    const cs = [cond('roe', 'gte', 12), { ...cond('pe', 'lt', 10), enabled: false }];
    const f = conditionFunnel(rows, cs);
    const ids = Object.keys(f);
    expect(ids).toHaveLength(1);
    const hit = f[ids[0]];
    expect(hit.pass + hit.fail + hit.missing).toBe(rows.length);
  });

  it('缺失字段计入 missing 而非 fail（不静默按默认值判定）', () => {
    const f = conditionFunnel(rows, [cond('northHolding', 'gt', 0)]);
    const hit = f['c-northHolding-gt-0'];
    expect(hit.missing).toBeGreaterThan(0);
    expect(hit.fail + hit.missing).toBe(rows.length - hit.pass);
  });

  it('与组合筛选的通过数一致（单条件组合 = 该条件独立命中）', () => {
    const c = cond('roe', 'gte', 12);
    const f = conditionFunnel(rows, [c])[c.id];
    const r = runScreen(rows, [c]);
    expect(r.passCount).toBe(f.pass);
  });
});
