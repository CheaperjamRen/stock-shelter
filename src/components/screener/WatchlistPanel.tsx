import { useMemo } from 'react';
import { Eye, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { METRICS, METRIC_LIST } from '@/data/metrics';
import type { MetricKey } from '@/data/metrics';
import { useScreener } from '@/state/ScreenerContext';
import { ChangeText, FactTag, fmtNum, MetricFootnote, MissingCell } from './shared';
import { cn } from '@/lib/utils';

/**
 * 对比观察池：勾选的股票做多指标横向对比，高亮每列最优/最差（客观事实 + 极值标注为模型推断）。
 */

const COMPARE_KEYS: MetricKey[] = [
  'close',
  'mktCap',
  'pe',
  'pePercentile',
  'pb',
  'peg',
  'roe',
  'revGrowth',
  'profitGrowth',
  'grossMargin',
  'dividendYield',
  'chg20d',
  'chg60d',
  'volatility',
  'drawdown52w',
  'northHolding',
  'avgTurnover',
];

export function WatchlistPanel() {
  const { watchlist, stocks, toggleWatch, clearWatchlist, openDrawer, providerInfo } = useScreener();

  const rows = useMemo(
    () => watchlist.map((code) => stocks.find((s) => s.code === code)).filter((s): s is NonNullable<typeof s> => s != null),
    [watchlist, stocks]
  );

  if (rows.length === 0) {
    return (
      <section id="watchlist" className="scroll-mt-20">
        <h2 className="font-serif-sc text-lg font-semibold">对比观察池</h2>
        <p className="mt-2 rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          暂无观察股票。在「筛选结果」表格勾选股票即可加入对比观察池。
        </p>
      </section>
    );
  }

  // 每列极值（忽略缺失）
  const extremes = useMemo(() => {
    const ext: Partial<Record<MetricKey, { best: string; worst: string }>> = {};
    for (const key of COMPARE_KEYS) {
      const def = METRICS[key];
      if (def.higherIsBetter == null) continue;
      const vals = rows.filter((r) => r.m[key] != null);
      if (vals.length < 2) continue;
      const sorted = [...vals].sort((a, b) => (def.higherIsBetter ? (b.m[key] as number) - (a.m[key] as number) : (a.m[key] as number) - (b.m[key] as number)));
      ext[key] = { best: sorted[0].code, worst: sorted[sorted.length - 1].code };
    }
    return ext;
  }, [rows]);

  return (
    <section id="watchlist" aria-labelledby="watchlist-heading" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="watchlist-heading" className="font-serif-sc text-lg font-semibold">
            对比观察池（{rows.length} 只）
          </h2>
          <p className="text-sm text-muted-foreground">
            多指标横向对比 <FactTag />（高亮标注为模型推断）
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={clearWatchlist}>
          <Trash2 className="h-4 w-4" aria-hidden />
          清空
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-card">
        <div className="w-full max-w-full overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead className="whitespace-nowrap">股票</TableHead>
                {COMPARE_KEYS.map((k) => {
                  const def = METRICS[k];
                  const idx = METRIC_LIST.findIndex((m) => m.key === k) + 1;
                  return (
                    <TableHead key={k} className="whitespace-nowrap text-xs">
                      <MetricFootnote metric={k} className="text-xs" />
                    </TableHead>
                  );
                })}
                <TableHead className="w-10" aria-label="操作" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.code} className="cursor-pointer" onClick={() => openDrawer(r.code)}>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-medium">{r.name}</span>
                      <span className="num text-xs text-muted-foreground">{r.code} · {r.industry}</span>
                    </div>
                  </TableCell>
                  {COMPARE_KEYS.map((k) => {
                    const def = METRICS[k];
                    const v = r.m[k];
                    const ext = extremes[k];
                    const isBest = ext?.best === r.code;
                    const isWorst = ext?.worst === r.code;
                    if (v == null) {
                      return (
                        <TableCell key={k} className="whitespace-nowrap">
                          <MissingCell note={r.missingNotes[k]} />
                        </TableCell>
                      );
                    }
                    const isChange = k === 'chg20d' || k === 'chg60d';
                    return (
                      <TableCell
                        key={k}
                        className={cn(
                          'num whitespace-nowrap',
                          isBest && 'bg-pass/10 font-medium text-pass',
                          isWorst && 'bg-fail/10 text-fail'
                        )}
                      >
                        {isChange ? (
                          <ChangeText v={v}>{`${v > 0 ? '+' : ''}${fmtNum(v, def.decimals)}`}</ChangeText>
                        ) : (
                          fmtNum(v, def.decimals)
                        )}
                        {isBest && <TrendingUp className="ml-1 inline h-3 w-3" aria-label="池内最优" />}
                        {isWorst && <TrendingDown className="ml-1 inline h-3 w-3" aria-label="池内最差" />}
                      </TableCell>
                    );
                  })}
                  <TableCell className="whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWatch(r.code);
                      }}
                      aria-label={`移出观察池：${r.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          <Eye className="mr-1 inline h-3 w-3" aria-hidden />
          {providerInfo?.isDemo ? '数据为演示快照（非实时）；' : ''}绿色高亮 = 池内最优，红色高亮 = 池内最差（仅对有明确方向性的指标标注）。
        </p>
      </div>
    </section>
  );
}
