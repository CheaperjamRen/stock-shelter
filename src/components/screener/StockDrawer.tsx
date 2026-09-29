import { useEffect, useState } from 'react';
import { CalendarClock, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { METRICS, OPERATOR_LABEL } from '@/data/metrics';
import { describeCondition, fmtThreshold } from '@/engine/screener';
import { useScreener } from '@/state/ScreenerContext';
import { asOfFor, ChangeText, FactTag, InferenceTag, fmtNum, MissingCell, MetricFootnote, StatusBadge } from './shared';
import { cn } from '@/lib/utils';

/**
 * 明细抽屉：逐条件核对单。
 * 每个条件展示实际值 vs 阈值、通过/不通过/数据缺失三态标签、数据时点与来源，
 * 并区分「客观事实」（字段值）与「模型推断」（判定结论）。
 */

export function StockDrawer() {
  const { drawerCode, stocks, result, openDrawer, conditions } = useScreener();
  const [evalRow, setEvalRow] = useState<ReturnType<typeof useScreener>['result']['passedRows'][number] | null>(null);

  useEffect(() => {
    if (!drawerCode) {
      setEvalRow(null);
      return;
    }
    const found =
      result.passedRows.find((r) => r.row.code === drawerCode) ??
      result.excludedRows.find((r) => r.row.code === drawerCode);
    setEvalRow(found ?? null);
  }, [drawerCode, result]);

  const activeConds = conditions.filter((c) => c.enabled);
  const row = evalRow?.row;

  return (
    <Sheet open={drawerCode != null} onOpenChange={(v) => !v && openDrawer(null)}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {row && evalRow && (
          <>
            <SheetHeader className="border-b pb-4">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-left font-serif-sc">
                <span className="num text-sm font-normal text-muted-foreground">{row.code}</span>
                {row.name}
                {evalRow.passed ? (
                  <Badge className="border-pass/30 bg-pass/10 text-pass">入选</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {evalRow.failCount > 0 ? '被排除' : '数据缺失'}
                  </Badge>
                )}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {row.industry} · 上市 {row.listDate}
              </p>
            </SheetHeader>

            <div className="space-y-4 py-4">
              {/* 数据时点总览 */}
              <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-1.5 flex items-center gap-1.5 font-medium text-foreground/80">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  数据时点与来源
                </p>
                <p>行情类指标：{row.asOfMarket}</p>
                <p>财务类指标：{row.asOfFinance}</p>
                <p>北向持股：{row.asOfNorth}</p>
                <p className="mt-1 flex items-start gap-1">
                  <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  演示数据快照（模拟生成，非实时）
                </p>
              </div>

              {/* 逐条件核对单 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-serif-sc text-sm font-semibold">逐条件核对单</h3>
                  <span className="text-xs text-muted-foreground">
                    通过 {activeConds.length - evalRow.failCount - evalRow.missingCount} / {activeConds.length}
                  </span>
                </div>

                {activeConds.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">当前无生效条件。</p>
                ) : (
                  <ul className="space-y-2">
                    {activeConds.map((cond) => {
                      const ev = evalRow.evals.find((e) => e.conditionId === cond.id);
                      const def = METRICS[cond.metric];
                      const status = ev?.status ?? 'missing';
                      const actual = ev?.actual ?? null;
                      const actualCell =
                        actual == null ? (
                          <MissingCell note={row.missingNotes[cond.metric]} />
                        ) : (
                          <span className="num">{fmtNum(actual, def.decimals)}</span>
                        );
                      return (
                        <li key={cond.id} className="rounded-md border bg-card p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <MetricFootnote metric={cond.metric} className="text-sm font-medium" />
                            <StatusBadge status={status} />
                          </div>
                          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
                            <span className="text-xs text-muted-foreground">实际值</span>
                            <span>{actualCell}</span>
                            <span className="text-xs text-muted-foreground">阈值</span>
                            <span className="num">
                              {cond.op === 'between'
                                ? `${fmtThreshold(Math.min(cond.value, cond.value2 ?? cond.value))} ~ ${fmtThreshold(Math.max(cond.value, cond.value2 ?? cond.value))} ${def.unit}`
                                : `${OPERATOR_LABEL[cond.op]} ${fmtThreshold(cond.value)} ${def.unit}`}
                            </span>
                            <span className="text-xs text-muted-foreground">口径时点</span>
                            <span className="text-xs">{asOfFor(row, def.asOfGroup)}</span>
                          </div>
                          {status === 'missing' && (
                            <p className="mt-2 rounded-sm bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                              数据缺失不计入通过：本条件按「缺数据」处理，不会以默认值代入计算。
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* 结论区分 */}
              <div className="space-y-2">
                <h3 className="font-serif-sc text-sm font-semibold">结论标注</h3>
                <div className="flex items-start gap-2 text-sm">
                  <FactTag />
                  <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                    上表「实际值」均为演示快照中的字段数值（含时点与口径）。
                  </p>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <InferenceTag />
                  <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                    {evalRow.passed
                      ? `该股入选是确定性引擎基于上述 ${activeConds.length} 条规则的布尔判定结论（模型推断）。`
                      : evalRow.failCount > 0
                        ? `该股被排除源于 ${evalRow.failCount} 项条件不通过（模型推断），不代表对该股的任何负面判断。`
                        : '该股因数据缺失未计入通过名单（模型推断：宁可缺失也不以默认值计算）。'}
                  </p>
                </div>
              </div>

              {/* 行情关键指标 */}
              <Separator />
              <div>
                <h3 className="mb-2 font-serif-sc text-sm font-semibold">关键行情指标</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(['close', 'chg20d', 'chg60d', 'drawdown52w'] as const).map((k) => {
                    const def = METRICS[k];
                    const v = row.m[k];
                    return (
                      <div key={k} className="rounded-md border p-2">
                        <p className="text-xs text-muted-foreground">{def.name}</p>
                        {v == null ? (
                          <MissingCell note={row.missingNotes[k]} />
                        ) : (
                          <ChangeText v={k === 'close' ? null : v}>
                            <span className="num text-base font-medium">{k === 'drawdown52w' ? fmtNum(v, 1) : `${v > 0 ? '+' : ''}${fmtNum(v, 2)}`}</span>
                            <span className="ml-1 text-xs text-muted-foreground">{k === 'close' ? def.unit : '%'}</span>
                          </ChangeText>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
