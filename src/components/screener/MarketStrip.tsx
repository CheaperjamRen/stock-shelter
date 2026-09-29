import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MarketContext } from '@/data/fuyaoMapper';
import { useScreener } from '@/state/ScreenerContext';

/**
 * 市场环境快照条：真实模式下由全市场行情快照聚合（零额外请求）。
 * 展示涨跌家数 / 涨跌中位 / 成交额 —— 选股结果要放进「今天市场是什么环境」里解读。
 * Demo 模式不渲染（演示数据无当日大盘口径，不编造）。
 */

function fmtYi(yi: number | null): string {
  if (yi == null) return '—';
  if (yi >= 10000) return `${(yi / 10000).toFixed(2)} 万亿`;
  return `${yi.toFixed(0)} 亿`;
}

export function MarketStrip() {
  const { market } = useScreener();
  if (!market) return null;

  const total = market.up + market.flat + market.down;
  const upPct = total > 0 ? Math.round((market.up / total) * 1000) / 10 : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border bg-card px-4 py-2.5 shadow-card">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Activity className="h-3.5 w-3.5 text-primary" aria-hidden />
        市场环境<sup>①</sup>
        <span className="num text-muted-foreground/70">{market.asOf}</span>
      </span>

      <span className="flex items-center gap-1.5 text-sm">
        <span className="num font-semibold text-up">{market.up}</span>
        <span className="text-xs text-muted-foreground">涨</span>
        {market.flat > 0 && (
          <>
            <span className="num font-semibold text-muted-foreground">{market.flat}</span>
            <span className="text-xs text-muted-foreground">平</span>
          </>
        )}
        <span className="num font-semibold text-down">{market.down}</span>
        <span className="text-xs text-muted-foreground">跌</span>
        <span className="num ml-1 text-xs text-muted-foreground">(涨家占比 {upPct}%)</span>
      </span>

      {market.medianChgPct != null && (
        <span className="flex items-center gap-1 text-sm">
          {market.medianChgPct > 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-up" aria-hidden />
          ) : market.medianChgPct < 0 ? (
            <TrendingDown className="h-3.5 w-3.5 text-down" aria-hidden />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          )}
          <span className="text-xs text-muted-foreground">涨跌中位</span>
          <span className={`num font-semibold ${market.medianChgPct > 0 ? 'text-up' : market.medianChgPct < 0 ? 'text-down' : ''}`}>
            {market.medianChgPct > 0 ? '+' : ''}
            {market.medianChgPct.toFixed(2)}%
          </span>
        </span>
      )}

      <span className="flex items-center gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">两市成交额</span>
        <span className="num font-semibold">{fmtYi(market.totalTurnoverYi)}</span>
      </span>

      <span className="ml-auto hidden text-xs text-muted-foreground/70 md:inline">
        沪深 A 股快照聚合 · 用于结果解读背景，不参与筛选判定
      </span>
    </div>
  );
}