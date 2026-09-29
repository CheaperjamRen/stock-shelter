import { useState } from 'react';
import { BellRing, BellOff, BookmarkPlus, FolderOpen, Play, Trash2, LogIn, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useScreener } from '@/state/ScreenerContext';
import { describeCondition } from '@/engine/screener';
import { InferenceTag, MetricFootnote } from './shared';
import { toast } from 'sonner';

/**
 * 策略管理与每日监控：保存命名策略、载入、开启每日监控任务（每日重跑，提示新增进入/退出标的）。
 * 演示环境无服务端与定时任务：监控 diff 由「上一交易日快照」模拟重跑得出，界面明确标注。
 */

export function StrategyPanel() {
  const {
    conditions,
    strategies,
    monitorRuns,
    saveStrategy,
    deleteStrategy,
    loadStrategy,
    toggleMonitoring,
    runMonitorNow,
    openDrawer,
  } = useScreener();
  const [name, setName] = useState('');

  const onSave = () => {
    if (!name.trim()) {
      toast.error('请输入策略名称');
      return;
    }
    if (conditions.filter((c) => c.enabled).length === 0) {
      toast.error('当前无生效条件，无法保存策略');
      return;
    }
    saveStrategy(name);
    setName('');
    toast.success(`策略「${name.trim()}」已保存`);
  };

  return (
    <section id="strategies" aria-labelledby="strategies-heading" className="scroll-mt-20">
      <div className="mb-3">
        <h2 id="strategies-heading" className="font-serif-sc text-lg font-semibold">
          策略与每日监控
        </h2>
        <p className="text-sm text-muted-foreground">
          把当前整套条件保存为命名策略，并可一键转为每日监控任务（每日重跑，提示新增进入 / 退出的标的）
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border bg-card p-4 shadow-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="策略名称，如：低估值高股息蓝筹"
              aria-label="策略名称"
              className="flex-1"
            />
            <Button className="gap-1.5" onClick={onSave} disabled={conditions.filter((c) => c.enabled).length === 0}>
              <BookmarkPlus className="h-4 w-4" aria-hidden />
              保存当前策略
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            将保存当前 {conditions.filter((c) => c.enabled).length} 条生效条件及其阈值与口径。
          </p>
        </div>

        {strategies.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            暂无保存的策略。
          </p>
        ) : (
          <div className="grid gap-3">
            {strategies.map((s) => {
              const run = monitorRuns[s.id];
              return (
                <div key={s.id} className="rounded-lg border bg-card p-4 shadow-card">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-serif-sc font-semibold">{s.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {s.conditions.filter((c) => c.enabled).length} 条生效条件
                        </Badge>
                        <span className="text-xs text-muted-foreground">保存于 {s.savedAt}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => loadStrategy(s.id)}>
                        <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                        载入
                      </Button>
                      <Button
                        variant={s.monitoring ? 'default' : 'outline'}
                        size="sm"
                        className="gap-1.5"
                        onClick={() => toggleMonitoring(s.id)}
                        aria-pressed={s.monitoring}
                      >
                        {s.monitoring ? (
                          <>
                            <BellOff className="h-3.5 w-3.5" aria-hidden />
                            停止监控
                          </>
                        ) : (
                          <>
                            <BellRing className="h-3.5 w-3.5" aria-hidden />
                            每日监控
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteStrategy(s.id)}
                        aria-label={`删除策略 ${s.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.conditions
                      .filter((c) => c.enabled)
                      .map((c) => (
                        <Badge key={c.id} variant="secondary" className="max-w-full font-normal">
                          <span className="max-w-72 truncate">{describeCondition(c)}</span>
                        </Badge>
                      ))}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => runMonitorNow(s.id)}
                      disabled={!s.monitoring}
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden />
                      立即重跑（模拟每日任务）
                    </Button>
                    {!s.monitoring && <span className="text-xs text-muted-foreground">开启每日监控后可重跑</span>}
                  </div>

                  {run && (
                    <div className="mt-3 rounded-md border bg-muted/30 p-3">
                      <p className="mb-2 text-xs text-muted-foreground">
                        重跑时间 {run.ranAt} · 上一交易日通过 {run.prevPassCount} 只 → 当前通过 {run.currentPassCount} 只 <InferenceTag />
                      </p>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <p className="mb-1 flex items-center gap-1 text-sm font-medium text-pass">
                            <LogIn className="h-3.5 w-3.5" aria-hidden />
                            新增进入（{run.enter.length}）
                          </p>
                          {run.enter.length === 0 ? (
                            <p className="text-xs text-muted-foreground">无</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {run.enter.map((stk) => (
                                <button
                                  key={stk.code}
                                  type="button"
                                  onClick={() => openDrawer(stk.code)}
                                  className="rounded-sm border border-pass/30 bg-pass/10 px-1.5 py-0.5 text-xs text-pass"
                                >
                                  {stk.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="mb-1 flex items-center gap-1 text-sm font-medium text-fail">
                            <LogOut className="h-3.5 w-3.5" aria-hidden />
                            退出名单（{run.exit.length}）
                          </p>
                          {run.exit.length === 0 ? (
                            <p className="text-xs text-muted-foreground">无</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {run.exit.map((stk) => (
                                <button
                                  key={stk.code}
                                  type="button"
                                  onClick={() => openDrawer(stk.code)}
                                  className="rounded-sm border border-fail/30 bg-fail/10 px-1.5 py-0.5 text-xs text-fail"
                                >
                                  {stk.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        说明：演示环境无服务端定时任务，此结果为以「上一交易日快照」对比当前快照模拟的每日重跑差异；正式部署时由定时任务调用同一确定性引擎执行。
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
