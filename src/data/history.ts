import type { MetricKey } from './metrics';
import { clamp, gauss, hashStr, mulberry32 } from './rng';
import type { ScreenRow, Stock } from './types';

/**
 * 历史回测数据（演示、确定性生成）：
 * - 调仓时点：每季度末重选、下一季度等权持有；
 * - 财务指标按披露时点滞后一期取值，避免未来函数；
 * - 个股季度收益率由种子生成，与基准弱相关（beta）；
 * - 沪深300 为演示基准序列，非真实历史行情。
 */

export const REBALANCE_DATES = [
  '2024-12-31',
  '2025-03-31',
  '2025-06-30',
  '2025-09-30',
  '2025-12-31',
  '2026-03-31',
  '2026-06-30',
];

export const HOLD_LABELS = [
  '2025Q1',
  '2025Q2',
  '2025Q3',
  '2025Q4',
  '2026Q1',
  '2026Q2',
  '2026Q3（至 09-25）',
];

/** 沪深300 演示基准季度收益率（%） */
export const CSI300_RETURNS = [-1.8, 3.5, 2.2, 5.6, -2.4, 4.1, 1.8];
export const CSI300_LABEL = '沪深300（演示基准序列，非真实历史行情）';

const FIN_KEYS: MetricKey[] = ['peg', 'roe', 'revGrowth', 'profitGrowth', 'grossMargin'];

function round(v: number, d: number): number {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function stockBeta(code: string): number {
  return 0.85 + (hashStr(code) % 30) / 100;
}

/** 个股第 k 期（k=1..7）季度收益率（%），确定性生成 */
export function stockQuarterReturn(stock: Stock, k: number): number {
  const rng = mulberry32(hashStr(`${stock.code}|ret|${k}`));
  const vol = stock.m.volatility ?? 30;
  return round(CSI300_RETURNS[k - 1] * stockBeta(stock.code) + gauss(rng) * (vol / 2), 2);
}

/** 调仓时点 k（0 起）的历史指标快照：行情类当期扰动，财务类滞后一期（披露时点） */
export function histSnapshot(stock: Stock, k: number): ScreenRow {
  const rng = mulberry32(hashStr(`${stock.code}|hist|${k}`));
  const m: Record<MetricKey, number | null> = { ...stock.m };

  // 行情类：围绕当前值均值回复扰动
  const mult = (v: number, rel: number, d: number) => round(v * (1 + gauss(rng) * rel), d);
  if (m.close != null) m.close = mult(m.close, 0.1, 2);
  if (m.mktCap != null) m.mktCap = Math.round(m.mktCap * (1 + gauss(rng) * 0.1));
  if (m.pe != null) m.pe = mult(m.pe, 0.12, 1);
  if (m.pb != null) m.pb = mult(m.pb, 0.1, 2);
  if (m.dividendYield != null) m.dividendYield = mult(m.dividendYield, 0.08, 2);
  if (m.avgTurnover != null) m.avgTurnover = mult(m.avgTurnover, 0.25, 1);
  if (m.pePercentile != null) m.pePercentile = Math.round(clamp(m.pePercentile + gauss(rng) * 9, 2, 98));
  if (m.pbPercentile != null) m.pbPercentile = Math.round(clamp(m.pbPercentile + gauss(rng) * 9, 2, 98));
  if (m.chg20d != null) m.chg20d = round(m.chg20d + gauss(rng) * 6, 2);
  if (m.chg60d != null) m.chg60d = round(m.chg60d + gauss(rng) * 10, 2);
  if (m.volatility != null) m.volatility = round(clamp(m.volatility + gauss(rng) * 3, 5, 75), 1);
  if (m.drawdown52w != null) m.drawdown52w = round(clamp(m.drawdown52w + gauss(rng) * 9, -75, -1), 1);

  // 财务类：使用 k-1 期财务序列（披露滞后，防未来函数）
  const fk = Math.max(0, k - 1);
  const frng = mulberry32(hashStr(`${stock.code}|fin|${fk}`));
  for (const key of FIN_KEYS) {
    const cur = m[key];
    if (cur == null) continue;
    if (key === 'peg') m.peg = round(clamp(cur + gauss(frng) * 0.35, 0.2, 5), 2);
    else if (key === 'roe') m.roe = round(cur + gauss(frng) * 2.5, 1);
    else if (key === 'revGrowth') m.revGrowth = round(cur + gauss(frng) * 6, 1);
    else if (key === 'profitGrowth') m.profitGrowth = round(cur + gauss(frng) * 9, 1);
    else if (key === 'grossMargin') m.grossMargin = round(clamp(cur + gauss(frng) * 2, 2, 95), 1);
  }

  // 北向数据在早期时点部分缺失（演示数据缺失场景）
  const missingNotes = { ...stock.missingNotes };
  if (m.northHolding != null && k <= 1 && rng() < 0.5) {
    m.northHolding = null;
    missingNotes.northHolding = '该时点北向持股数据未披露（演示缺失）';
  }

  return { ...stock, m, missingNotes };
}

/** 股票在指定日期是否已上市（回测剔除未上市标的） */
export function isListedAt(stock: Stock, date: string): boolean {
  return stock.listDate <= date;
}
