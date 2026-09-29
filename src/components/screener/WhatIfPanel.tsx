import { useMemo, useState } from 'react';
import { GitCompareArrows, LogIn, LogOut, Sigma } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeCondition } from '@/engine/screener';
import { useScreener } from '@/state/ScreenerContext';
import { InferenceTag, MetricFootnote } from './shared';
import { cn } from '@/lib/utils';

/**
 * What-if 敏感性分析：选定条件、调整 ±10% / ±20%，
 * 实时展示放宽纳入 / 收紧剔除的边际名单与文字解读（模型推断）。
 */

const FACTORS = [
  { pct: 0.1, label: '±10%' },
  { pct: 0.2, label: '±20%' },
];

export function WhatIfPanel() {
  const { conditions, runWhatIf, openDrawer } = useScreener();
  const activeConds = useMemo(() => conditions.filter((c) => c.enabled), [conditions]);
  const [targetId, setTargetId] = useState<string>('');
  const [pct, setPct] = useState<number>(0.1);

  const target = activeConds.find((c) => c.id === targetId) ?? activeConds[0];
  const wi = useMemo(
    () => (target ? runWhatIf(target.id, pct) : null),
    [target, pct, runWhatIf]
  );

  if (activeConds.length === 0) {
    return (
      <section id="whatif" className="scroll-mt-20">
        <h2 className="font-serif-sc text-lg font-semibold">What-if 敏感性分析</h2>
        <p className="mt-2 rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          暂无生效条件。请先在上方生成或启用条件，再进行阈值敏感性测试。
        </p>
      </section>
    );
  }

  return (
    <section id="whatif" aria-labelledby="whatif-heading" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="whatif-heading" className="font-serif-sc text-lg font-semibold">
            What-if 敏感性分析
          </h2>
          <p className="text-sm text-muted-foreground">
            选择任一条件并调整阈值幅度，实时查看边际名单（结果为
            <InferenceTag />，基于当前演示快照计算）
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">分析条件</span>
            <Select value={target?.id ?? ''} onValueChange={setTargetId}>
              <SelectTrigger className="h-9 min-w-44 flex-1" aria-label="选择分析条件">
                <SelectValue placeholder="选择条件" />
              </SelectTrigger>
              <SelectContent>
                {activeConds.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {describeCondition(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">幅度</span>
            {FACTORS.map((f) => (
              <Button
                key={f.pct}
                variant={pct === f.pct ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPct(f.pct)}
                className="num"
                aria-pressed={pct === f.pct}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {target && (
          <p className="mt-3 text-xs text-muted-foreground">
            当前条件：<span className="text-foreground">{describeCondition(target)}</span>（指标口径见{' '}
            <MetricFootnote metric={target.metric} showName={false} />）
          </p>
        )}

        {wi && (
          <div className="mt-4 space-y-3">
            <div className="rounded-md border bg-primary/5 p-3 text-sm leading-relaxed">
              <p className="flex items-start gap-2">
                <Sigma className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">{wi.summary}</span>
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border">
                <p className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-medium text-pass">
                  <LogIn className="h-4 w-4" aria-hidden />
                  放宽 {wi.pct}% 后新纳入（{wi.enter.length} 只）
                </p>
                {wi.enter.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">无边际变动。</p>
                ) : (
                  <ul className="max-h-44 overflow-y-auto p-2">
                    {wi.enter.map((r) => (
                      <li key={r.row.code}>
                        <button
                          type="button"
                          onClick={() => openDrawer(r.row.code)}
                          className="flash-in flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-secondary"
                        >
                          <span className="min-w-0 truncate">
                            <span className="num mr-2 text-xs text-muted-foreground">{r.row.code}</span>
                            {r.row.name}
                          </span>
                          <span className="num shrink-0 text-xs text-muted-foreground">{r.row.industry}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-md border">
                <p className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-medium text-fail">
                  <LogOut className="h-4 w-4" aria-hidden />
                  收紧 {wi.pct}% 后被剔除（{wi.exit.length} 只）
                </p>
                {wi.exit.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">无边际变动。</p>
                ) : (
                  <ul className="max-h-44 overflow-y-auto p-2">
                    {wi.exit.map((r) => (
                      <li key={r.row.code}>
                        <button
                          type="button"
                          onClick={() => openDrawer(r.row.code)}
                          className={cn('flash-out flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-secondary')}
                        >
                          <span className="min-w-0 truncate">
                            <span className="num mr-2 text-xs text-muted-foreground">{r.row.code}</span>
                            {r.row.name}
                          </span>
                          <span className="num shrink-0 text-xs text-muted-foreground">{r.row.industry}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border bg-muted/40 p-2">
                <p className="text-xs text-muted-foreground">当前通过</p>
                <p className="num text-lg font-semibold">{wi.baseCount}</p>
              </div>
              <div className="rounded-md border bg-pass/5 p-2">
                <p className="text-xs text-muted-foreground">放宽后</p>
                <p className="num text-lg font-semibold text-pass">{wi.relaxedCount}</p>
              </div>
              <div className="rounded-md border bg-fail/5 p-2">
                <p className="text-xs text-muted-foreground">收紧后</p>
                <p className="num text-lg font-semibold text-fail">{wi.tightenedCount}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
