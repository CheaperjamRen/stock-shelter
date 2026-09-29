import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Minus,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { METRICS } from '@/data/metrics';
import type { MetricKey } from '@/data/metrics';
import { describeCondition } from '@/engine/screener';
import type { RowEval } from '@/engine/types';
import { useScreener } from '@/state/ScreenerContext';
import { ChangeText, FactTag, fmtNum, MissingCell } from './shared';
import { downloadCsv, rowsToCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';

/**
 * 筛选结果区：通过率统计条（含 Universe 广度）+ 行业分布聚合（点击排除）
 * + 候选股票表格（表头点击排序与快捷排序下拉联动）+ CSV 导出
 * + 被排除股票及其失败原因 Top 汇总 + 勾选加入对比观察池。
 * 表格数据全部为客观事实（字段值），归属判定为确定性引擎输出。
 */

type SortKey = MetricKey | 'code' | 'name';

/** 研究常用排序预设（与表头点击排序共享同一 state） */
const QUICK_SORTS: Array<{ label: string; key: SortKey; dir: 'asc' | 'desc' }> = [
  { label: '总市值（大→小）', key: 'mktCap', dir: 'desc' },
  { label: 'PE-TTM（低→高）', key: 'pe', dir: 'asc' },
  { label: '股息率（高→低）', key: 'dividendYield', dir: 'desc' },
  { label: 'ROE（高→低）', key: 'roe', dir: 'desc' },
  { label: '近 60 日涨幅（高→低）', key: 'chg60d', dir: 'desc' },
  { label: '净利增速（高→低）', key: 'profitGrowth', dir: 'desc' },
  { label: '年化波动（低→高）', key: 'volatility', dir: 'asc' },
];

const RESULT_COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'code', label: '代码' },
  { key: 'name', label: '名称' },
  { key: 'pe', label: 'PE-TTM' },
  { key: 'pePercentile', label: 'PE分位' },
  { key: 'roe', label: 'ROE' },
  { key: 'revGrowth', label: '营收增速' },
  { key: 'profitGrowth', label: '净利增速' },
  { key: 'dividendYield', label: '股息率' },
  { key: 'chg60d', label: '近60日' },
  { key: 'volatility', label: '年化波动' },
  { key: 'mktCap', label: '总市值' },
];

function StockRow({
  ev,
  columns,
  onOpen,
  watched,
  onWatch,
}: {
  ev: RowEval;
  columns: Array<{ key: SortKey; label: string; className?: string }>;
  onOpen: (code: string) => void;
  watched: boolean;
  onWatch: (code: string) => void;
}) {
  const row = ev.row;
  return (
    <TableRow className={cn('cursor-pointer', watched && 'bg-primary/5')} onClick={() => onOpen(row.code)}>
      <TableCell className="whitespace-nowrap">
        <Checkbox
          checked={watched}
          onCheckedChange={() => onWatch(row.code)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`${watched ? '移出' : '加入'}对比观察池：${row.name}`}
        />
      </TableCell>
      {columns.map((col) => {
        if (col.key === 'code') return <TableCell key={col.key} className="num whitespace-nowrap">{row.code}</TableCell>;
        if (col.key === 'name')
          return (
            <TableCell key={col.key} className="whitespace-nowrap font-medium">
              <span className="block max-w-28 truncate" title={row.name}>{row.name}</span>
            </TableCell>
          );
        const def = METRICS[col.key as MetricKey];
        const v = row.m[col.key as MetricKey];
        if (v == null) {
          return (
            <TableCell key={col.key} className="whitespace-nowrap">
              <MissingCell note={row.missingNotes[col.key as MetricKey]} />
            </TableCell>
          );
        }
        const isChange = col.key === 'chg20d' || col.key === 'chg60d' || col.key === 'drawdown52w';
        return (
          <TableCell key={col.key} className={cn('num whitespace-nowrap', col.className)}>
            {isChange ? (
              <ChangeText v={v}>
                {col.key === 'drawdown52w' ? fmtNum(v, def.decimals) : `${v > 0 ? '+' : ''}${fmtNum(v, def.decimals)}`}
              </ChangeText>
            ) : (
              fmtNum(v, def.decimals)
            )}
          </TableCell>
        );
      })}
      <TableCell className="whitespace-nowrap">
        {ev.passed ? (
          <Badge className="border-pass/30 bg-pass/10 text-pass hover:bg-pass/10">入选</Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Ban className="h-3 w-3" aria-hidden />
            {ev.failCount > 0 ? `${ev.failCount} 项不通过` : '数据缺失'}
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ResultPanel() {
  const { result, conditions, stocks, loading, openDrawer, toggleWatch, watchlist, hasHardConflict, providerInfo } =
    useScreener();
  const [sortKey, setSortKey] = useState<SortKey>('mktCap');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [industry, setIndustry] = useState<string>('all');
  /** 通过池行业分布点击排除（研究常见操作：先看行业 Top，再剔除不想碰的行业） */
  const [excludedIndustries, setExcludedIndustries] = useState<string[]>([]);
  const [showExcluded, setShowExcluded] = useState(false);
  const [exported, setExported] = useState(false);
  /** 结果分页（结果可能上百行，不分页会拖垮表格与滚动） */
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const industries = useMemo(
    () => Array.from(new Set(stocks.map((s) => s.industry))).sort((a, b) => a.localeCompare(b, 'zh')),
    [stocks]
  );

  /** 通过池按行业聚合（Top 优先）+ 占比 */
  const passedIndustries = useMemo(() => {
    const map = new Map<string, number>();
    for (const ev of result.passedRows) {
      const ind = ev.row.industry;
      map.set(ind, (map.get(ind) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([industry, count]) => ({ industry, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [result.passedRows]);

  const maxIndCount = passedIndustries.length > 0 ? passedIndustries[0].count : 0;

  const toggleExcludedIndustry = (ind: string) => {
    setExcludedIndustries((cur) => (cur.includes(ind) ? cur.filter((x) => x !== ind) : [...cur, ind]));
  };

  const filtered = useMemo(() => {
    const rows = showExcluded ? [...result.passedRows, ...result.excludedRows] : result.passedRows;
    const rows2 = industry === 'all' ? rows : rows.filter((r) => r.row.industry === industry);
    const rows3 = excludedIndustries.length === 0 ? rows2 : rows2.filter((r) => !excludedIndustries.includes(r.row.industry));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows3].sort((a, b) => {
      if (sortKey === 'code' || sortKey === 'name') {
        return a.row[sortKey].localeCompare(b.row[sortKey], 'zh') * dir;
      }
      const va = a.row.m[sortKey as MetricKey];
      const vb = b.row.m[sortKey as MetricKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir;
    });
  }, [result, showExcluded, industry, excludedIndustries, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'code' || key === 'name' ? 'asc' : 'desc');
    }
  };

  const onQuickSort = (value: string) => {
    const [k, d] = value.split(':');
    setSortKey(k as SortKey);
    setSortDir(d as 'asc' | 'desc');
  };

  const currentQuick = QUICK_SORTS.find((q) => q.key === sortKey && q.dir === sortDir);
  const quickValue = currentQuick ? `${sortKey}:${sortDir}` : 'custom';

  const onExport = () => {
    downloadCsv(`A股筛选结果_${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(filtered));
    setExported(true);
    window.setTimeout(() => setExported(false), 2000);
  };

  const passPct = Math.round(result.passRate * 1000) / 10;
  const coveragePct = result.total > 0 ? Math.round((result.passCount / result.total) * 1000) / 10 : 0;

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const paged = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

  const onPageSize = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };

  if (loading) {
    return (
      <section id="results" className="scroll-mt-20" aria-busy="true" aria-label="数据加载中">
        <div className="mb-3">
          <p className="h-6 w-24 animate-pulse rounded bg-secondary/70" />
          <p className="mt-1.5 h-4 w-64 animate-pulse rounded bg-secondary/50" />
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="h-4 w-2/3 animate-pulse rounded bg-secondary/60" />
          <div className="mt-3 h-2 w-full animate-pulse rounded bg-secondary/50" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-3 w-10 animate-pulse rounded bg-secondary/40" />
                <div className="h-3 w-24 animate-pulse rounded bg-secondary/55" />
                <div className="h-3 flex-1 animate-pulse rounded bg-secondary/35" />
                <div className="h-3 w-16 animate-pulse rounded bg-secondary/45" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="results" aria-labelledby="results-heading" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="results-heading" className="font-serif-sc text-lg font-semibold">
            筛选结果
          </h2>
          <p className="text-sm text-muted-foreground">确定性引擎输出 · 同一输入结果唯一可复现</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Select value={quickValue} onValueChange={onQuickSort}>
            <SelectTrigger className="h-9 w-44" aria-label="快捷排序">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUICK_SORTS.map((q) => (
                <SelectItem key={`${q.key}:${q.dir}`} value={`${q.key}:${q.dir}`}>
                  {q.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">自定义排序（点表头）</SelectItem>
            </SelectContent>
          </Select>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="h-9 w-32" aria-label="行业筛选">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部行业</SelectItem>
              {industries.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowExcluded((v) => !v)}>
            {showExcluded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            {showExcluded ? '仅看候选' : '含被排除股票'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" aria-hidden />
            {exported ? '已导出' : '导出 CSV'}
          </Button>
        </div>
      </div>

      {/* 通过率统计条（含 Universe 广度） */}
      <div className="mb-3 rounded-lg border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-2">
            <span className="num text-2xl font-semibold text-primary">{result.passCount}</span>
            <span className="text-sm text-muted-foreground">/ {result.total} 只通过</span>
          </div>
          <div className="min-w-40 flex-1">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>全市场通过率 <FactTag /></span>
              <span className="num">{passPct}%</span>
            </div>
            <Progress value={passPct} aria-label="全市场通过率" />
          </div>
          {result.passRate > 0.5 && (
            <Badge variant="secondary" className="border-amber-300 text-amber-700">
              筛选区分度较低（通过率 &gt; 50%）
            </Badge>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Universe：{providerInfo?.label ?? '全部标的'}（{result.total} 只）· 通过 {result.passCount} 只 · 覆盖率{' '}
          <span className="num">{coveragePct}%</span>
        </p>

        {passedIndustries.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              通过池行业分布（点击行业可排除 / 恢复）
              {excludedIndustries.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExcludedIndustries([])}
                  className="ml-2 inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                >
                  <X className="h-3 w-3" aria-hidden />
                  清除排除
                </button>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {passedIndustries.map(({ industry, count }) => {
                const excluded = excludedIndustries.includes(industry);
                const pct = maxIndCount > 0 ? Math.round((count / maxIndCount) * 100) : 0;
                return (
                  <button
                    key={industry}
                    type="button"
                    onClick={() => toggleExcludedIndustry(industry)}
                    aria-pressed={excluded}
                    title={excluded ? `点击恢复 ${industry}` : `点击排除 ${industry}`}
                    className={cn(
                      'group relative overflow-hidden rounded-md border px-2.5 py-1 text-xs transition-colors',
                      excluded
                        ? 'border-destructive/30 text-muted-foreground/70 hover:border-destructive/60'
                        : 'border-border bg-secondary/40 hover:border-primary/50 hover:bg-primary/5'
                    )}
                  >
                    <span className={cn('relative z-10 flex items-center gap-1', excluded && 'line-through')}>
                      {industry}
                      <span className="num font-medium">{count}</span>
                    </span>
                    <span
                      className="absolute inset-y-0 left-0 bg-primary/10"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {result.exclusionTop.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">排除原因 Top 汇总（被排除股票中，按条件统计）</p>
            <div className="flex flex-wrap gap-1.5">
              {result.exclusionTop.map((r) => (
                <Badge key={r.label} variant="outline" className="gap-1 whitespace-nowrap">
                  <span className="max-w-64 truncate">{r.label}</span>
                  <span className="num text-fail">{r.count}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {hasHardConflict ? (
        <div className="rounded-lg border border-dashed border-destructive/50 bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">存在硬冲突，筛选已被阻断。请先在「筛选条件」区修正冲突条件。</p>
        </div>
      ) : conditions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">暂无生效条件，未执行筛选。请先解析意图或添加条件。</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-card">
          <div className="w-full max-w-full overflow-x-auto bg-card">
            <Table className="[&>div]:max-w-full">
              <TableHeader>
                <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={false}
                      aria-label="占位"
                      className="invisible"
                    />
                  </TableHead>
                  {RESULT_COLUMNS.map((col) => (
                    <TableHead key={col.key} className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSort(col.key)}
                        className="inline-flex items-center gap-1 text-xs font-medium"
                        aria-label={`按 ${col.label} 排序`}
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
                        )}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead className="whitespace-nowrap">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={RESULT_COLUMNS.length + 2} className="h-24 text-center text-sm text-muted-foreground">
                      {showExcluded
                        ? '无匹配股票。'
                        : '当前条件下 0 只股票通过。可查看「排除原因 Top」了解主要阻断条件，或在 What-if 面板测试阈值放宽。'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((ev) => (
                    <StockRow
                      key={ev.row.code}
                      ev={ev}
                      columns={RESULT_COLUMNS}
                      onOpen={openDrawer}
                      watched={watchlist.includes(ev.row.code)}
                      onWatch={toggleWatch}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
              <p className="text-xs text-muted-foreground">
                当前视图共 <span className="num font-medium text-foreground">{filtered.length}</span> 只 · 第{' '}
                <span className="num font-medium text-foreground">{curPage}</span> / {pageCount} 页
              </p>
              <div className="flex items-center gap-1.5">
                <Select value={String(pageSize)} onValueChange={onPageSize}>
                  <SelectTrigger className="h-8 w-24" aria-label="每页行数">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 行/页</SelectItem>
                    <SelectItem value="20">20 行/页</SelectItem>
                    <SelectItem value="50">50 行/页</SelectItem>
                    <SelectItem value="100">100 行/页</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={curPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={curPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
          {showExcluded && (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              被排除股票共 {result.excludedRows.length} 只，点击任意行可展开「逐条件核对单」查看失败原因与数据缺失详情。
            </p>
          )}
        </div>
      )}
    </section>
  );
}
