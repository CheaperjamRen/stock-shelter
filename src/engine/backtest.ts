import { withDerivedMetrics } from '../data/derive';
import { CSI300_RETURNS, HOLD_LABELS, REBALANCE_DATES, histSnapshot, isListedAt, stockQuarterReturn } from '../data/history';
import type { Stock } from '../data/types';
import { runScreen } from './screener';
import type { Condition } from './types';

/**
 * 简化历史回测（确定性）：
 * 每季度末按当时可见数据重选（财务指标滞后一期取值，避免未来函数），
 * 下一季度等权持有；输出组合累计收益曲线 vs 沪深300 演示基准。
 */

export interface BacktestPoint {
  period: string;
  portfolioReturn: number;
  csi300Return: number;
  portfolioEquity: number;
  csi300Equity: number;
  holdings: number;
}

export interface BacktestStats {
  annualizedReturn: number;
  annualizedVol: number;
  maxDrawdown: number;
  winRate: number;
  csi300Annualized: number;
  excessAnnualized: number;
  totalQuarters: number;
}

export interface BacktestResult {
  points: BacktestPoint[];
  stats: BacktestStats;
  periodHoldings: Array<{ period: string; stocks: string[] }>;
  survivalRate: number | null;
}

export function runBacktest(stocks: Stock[], conditions: Condition[]): BacktestResult {
  const n = REBALANCE_DATES.length;
  const points: BacktestPoint[] = [];
  const periodHoldings: Array<{ period: string; stocks: string[] }> = [];
  let equity = 1;
  let csi = 1;
  const quarterlyReturns: number[] = [];

  for (let k = 0; k < n; k++) {
    const date = REBALANCE_DATES[k];
    const rows = withDerivedMetrics(
      stocks.filter((s) => isListedAt(s, date)).map((s) => histSnapshot(s, k))
    );
    const screen = runScreen(rows, conditions);

    // 汇总展示用持股（代码+名称）
    const held = screen.passedRows.map((r) => `${r.row.name}(${r.row.code})`);
    periodHoldings.push({ period: HOLD_LABELS[k], stocks: held });

    // 下一期收益（最后一期持有至今快照日 09-25）
    const rets = screen.passedRows.map((r) => stockQuarterReturn(r.row as Stock, k + 1) / 100);
    const portRet = rets.length > 0 ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
    const bench = CSI300_RETURNS[k] / 100;

    equity *= 1 + portRet;
    csi *= 1 + bench;
    quarterlyReturns.push(portRet);

    points.push({
      period: HOLD_LABELS[k],
      portfolioReturn: Number((portRet * 100).toFixed(2)),
      csi300Return: Number((bench * 100).toFixed(2)),
      portfolioEquity: Number(equity.toFixed(4)),
      csi300Equity: Number(csi.toFixed(4)),
      holdings: screen.passCount,
    });
  }

  // 绩效统计
  const totalQuarters = points.length;
  const finalEquity = equity;
  const years = totalQuarters / 4;
  const annualizedReturn = finalEquity > 0 ? finalEquity ** (1 / years) - 1 : -1;
  const mean = quarterlyReturns.reduce((a, b) => a + b, 0) / totalQuarters;
  const variance =
    quarterlyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, totalQuarters - 1);
  const annualizedVol = Math.sqrt(variance) * 2;
  let peak = 1;
  let maxDrawdown = 0;
  let running = 1;
  for (const q of quarterlyReturns) {
    running *= 1 + q;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, (peak - running) / peak);
  }
  const winRate = quarterlyReturns.filter((r) => r > 0).length / totalQuarters;
  const csiAnnualized = csi > 0 ? csi ** (1 / years) - 1 : -1;

  // 幸存者偏差演示统计：当前样本中在全部调仓时点均已上市的股票占比
  const allListedFromStart = stocks.filter((s) => isListedAt(s, REBALANCE_DATES[0])).length;
  const survivalRate = stocks.length > 0 ? allListedFromStart / stocks.length : null;

  return {
    points,
    stats: {
      annualizedReturn,
      annualizedVol,
      maxDrawdown,
      winRate,
      csi300Annualized: csiAnnualized,
      excessAnnualized: annualizedReturn - csiAnnualized,
      totalQuarters,
    },
    periodHoldings,
    survivalRate,
  };
}
