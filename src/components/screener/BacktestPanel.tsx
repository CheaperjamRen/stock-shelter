import { useMemo, useState } from 'react';
import { History, Play, TriangleAlert } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CSI300_LABEL } from '@/data/history';
import { useScreener } from '@/state/ScreenerContext';
import { InferenceTag } from './shared';

/**
 * 简化历史回测：每期末重选、等权持有；组合累计收益 vs 沪深300（演示基准）。
 * 显式标注三项局限：财务数据按披露时点取值 / 未计交易成本与滑点 / 存在幸存者偏差。
 */

function fmtPct(v: number, digits = 1): string {
  const s = (v * 100).toFixed(digits);
  return `${v > 0 ? '+' : ''}${s}%`;
}

export function BacktestPanel() {
  const { runBacktestNow, conditions, hasHardConflict, loading } = useScreener();
  const [ran, setRan] = useState(false);

  const bt = useMemo(
    () => (ran && conditions.length > 0 && !hasHardConflict ? runBacktestNow() : null),
    [ran, conditions, hasHardConflict, runBacktestNow]
  );

  const stats = bt?.stats;

  return (
    <section id="backtest" aria-labelledby="backtest-heading" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="backtest-heading" className="font-serif-sc text-lg font-semibold">
            简化历史回测
          </h2>
          <p className="text-sm text-muted-foreground">
            按当前条件在历史各季度末调仓时点回放（每期末重选、等权持有），结果为 <InferenceTag />
          </p>
        </div>
        <Button
          className="shrink-0 gap-1.5"
          onClick={() => setRan(true)}
          disabled={loading || conditions.filter((c) => c.enabled).length === 0 || hasHardConflict}
        >
          <Play className="h-4 w-4" aria-hidden />
          运行回测
        </Button>
      </div>

      {!ran ? (
        <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          尚未运行。点击「运行回测」按当前 {conditions.filter((c) => c.enabled).length} 条生效条件回放历史（2024Q4 – 2026Q3，共 7 个调仓期）。
        </div>
      ) : !bt ? (
        <div className="rounded-lg border border-dashed border-destructive/50 bg-card p-6 text-center text-sm text-muted-foreground">
          {hasHardConflict ? '存在硬冲突，回测已阻断。' : '无生效条件，无法回测。'}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border bg-card p-4 shadow-card md:p-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">年化收益</p>
                <p className={`num text-xl font-semibold ${stats && stats.annualizedReturn > 0 ? 'text-up' : 'text-down'}`}>
                  {stats ? fmtPct(stats.annualizedReturn) : '—'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">基准 {stats ? fmtPct(stats.csi300Annualized) : '—'}</p>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">最大回撤</p>
                <p className="num text-xl font-semibold text-down">{stats ? fmtPct(-stats.maxDrawdown) : '—'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">超额（年化）{stats ? fmtPct(stats.excessAnnualized) : '—'}</p>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-forecast">季度胜率</p>
                <p className="num text-xl font-semibold">{stats ? `${Math.round(stats.winRate * 100)}%` : '—'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">共 {stats?.totalQuarters ?? 0} 个持有期</p>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">年化波动</p>
                <p className="num text-xl font-semibold">{stats ? fmtPct(stats.annualizedVol) : '—'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">等权持有 · 季度调仓</p>
              </div>
            </div>

            <div className="mt-4 h-64 w-full min-w-0 overflow-hidden md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bt.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${((v - 1) * 100).toFixed(0)}%`}
                    width={44}
                  />
                  <Tooltip
                    formatter={(value: number | string, name: string) => [
                      `${(((value as number) - 1) * 100).toFixed(2)}%`,
                      name,
                    ]}
                    labelClassName="text-xs"
                  />
                  <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="portfolioEquity"
                    name="组合累计净值（回测）"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="csi300Equity"
                    name="沪深300（演示基准）"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground">{CSI300_LABEL}；净值 1 = 2024-12-31 基期。</p>
          </div>

          {/* 各期持仓 */}
          <div className="rounded-lg border bg-card p-4 shadow-card">
            <p className="mb-2 text-sm font-medium">各调仓期入选标的（每期期末重选）</p>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {bt.periodHoldings.map((p) => (
                <div key={p.period} className="rounded-md border bg-muted/30 p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{p.period}</span>
                    <span className="num text-xs text-muted-foreground">{p.stocks.length} 只 · 等权</span>
                  </div>
                  {p.stocks.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">该期无股票通过筛选。</p>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.stocks.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[11px] font-normal">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 局限性合规说明 */}
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
            <p className="mb-2 flex items-center gap-1.5 font-semibold">
              <TriangleAlert className="h-4 w-4" aria-hidden />
              回测局限（必须阅读）
            </p>
            <ul className="list-disc space-y-1 pl-4">
              <li>财务数据按披露时点取值（调仓时点使用已披露的最近一期财务数据），已尽量避免未来函数，但演示数据的口径时点为模拟。</li>
              <li>未计交易成本与滑点：实际交易的佣金、印花税与冲击成本会降低净收益。</li>
              <li>存在幸存者偏差：样本为当前在市股票，历史上已退市股票未纳入（本期样本中自 2024-12-31 首个调仓时点起已上市比例为 {bt.survivalRate != null ? `${Math.round(bt.survivalRate * 100)}%` : '—'}）。</li>
            </ul>
            <p className="mt-2 text-xs">历史表现不代表未来，回测结果不构成任何投资建议。</p>
          </div>
        </div>
      )}
    </section>
  );
}
