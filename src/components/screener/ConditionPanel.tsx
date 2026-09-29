import { Plus, Trash2, Repeat2, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CATEGORY_ORDER, METRICS, METRIC_LIST, OPERATOR_LABEL } from '@/data/metrics';
import type { MetricKey, Operator } from '@/data/metrics';
import type { Condition } from '@/engine/types';
import type { ConditionAlternative } from '@/engine/types';
import { useScreener } from '@/state/ScreenerContext';
import { MetricFootnote } from './shared';
import { cn } from '@/lib/utils';

/**
 * 条件卡片区：可编辑条件列表（改阈值 / 换口径 / 启停 / 删除，修改即时触发重新筛选）
 * + 添加条件面板（8 类指标库，每项含通俗定义说明）。
 */

/** 估值类指标的通用备选口径（换口径功能） */
const VALUATION_ALTS: ConditionAlternative[] = [
  {
    label: 'PE-TTM 处于最近 10 年 30 分位以下',
    explanation: '纵向口径：当前市盈率低于自身过去 10 年 70% 的交易日',
    metric: 'pePercentile',
    op: 'lte',
    value: 30,
  },
  {
    label: 'PE-TTM 低于行业中位数',
    explanation: '横向口径：市盈率低于同行业中位水平',
    metric: 'peIndRel',
    op: 'lt',
    value: 1,
  },
  {
    label: 'PB 低于历史 40 分位',
    explanation: '资产口径：市净率低于自身历史 60% 的交易日',
    metric: 'pbPercentile',
    op: 'lte',
    value: 40,
  },
  {
    label: 'PE-TTM < 20 倍',
    explanation: '绝对值口径：市盈率低于 20 倍（不同行业基准差异大）',
    metric: 'pe',
    op: 'lt',
    value: 20,
  },
];

const VALUATION_KEYS: MetricKey[] = ['pe', 'pePercentile', 'peIndRel', 'pb', 'pbPercentile', 'peg'];

function alternativesFor(c: Condition): ConditionAlternative[] {
  if (c.alternatives && c.alternatives.length > 0) return c.alternatives;
  if (VALUATION_KEYS.includes(c.metric)) return VALUATION_ALTS;
  return [];
}

const OPERATORS: Operator[] = ['lt', 'lte', 'gt', 'gte', 'between'];

function ConditionCard({ cond }: { cond: Condition }) {
  const { updateCondition, removeCondition, toggleCondition, funnel } = useScreener();
  const def = METRICS[cond.metric];
  const alts = alternativesFor(cond);
  const hit = funnel[cond.id];

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 shadow-card transition-opacity md:p-4',
        !cond.enabled && 'opacity-55'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          checked={cond.enabled}
          onCheckedChange={() => toggleCondition(cond.id)}
          aria-label={`${cond.enabled ? '禁用' : '启用'}条件 ${def.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <MetricFootnote metric={cond.metric} className="text-sm font-medium text-foreground" />
            {cond.origin === 'intent' && cond.sourceKeyword && (
              <Badge variant="secondary" className="text-[11px]">
                来自「{cond.sourceKeyword}」
              </Badge>
            )}
            {!cond.enabled && <Badge variant="outline" className="text-[11px]">已禁用</Badge>}
            {cond.enabled && hit && (
              <span className="num text-[11px] text-muted-foreground" title="该条件在完整池中独立筛选的命中情况（条件漏斗）">
                筛选后剩 <span className="font-semibold text-foreground">{hit.pass}</span> 只
                {hit.missing > 0 && <span>（其中 {hit.missing} 只缺数据）</span>}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <Select
            value={cond.op}
            onValueChange={(v) => updateCondition(cond.id, { op: v as Operator })}
          >
            <SelectTrigger className="h-9 w-20" aria-label="比较操作符">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((op) => (
                <SelectItem key={op} value={op}>
                  {OPERATOR_LABEL[op]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={cond.value}
              min={def.domain[0]}
              max={def.domain[1]}
              step={def.step}
              onChange={(e) => updateCondition(cond.id, { value: Number(e.target.value) })}
              className="num h-9 w-24"
              aria-label={`${def.name} 阈值`}
            />
            <span className="text-xs text-muted-foreground">{def.unit}</span>
          </div>

          {cond.op === 'between' && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">至</span>
              <Input
                type="number"
                value={cond.value2 ?? cond.value}
                min={def.domain[0]}
                max={def.domain[1]}
                step={def.step}
                onChange={(e) => updateCondition(cond.id, { value2: Number(e.target.value) })}
                className="num h-9 w-24"
                aria-label={`${def.name} 区间上界`}
              />
            </div>
          )}

          {alts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="切换口径定义">
                  <Repeat2 className="h-4 w-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                {alts.map((a) => (
                  <DropdownMenuItem key={a.label} onClick={() => useApplyAlt(cond.id, a)} className="flex-col items-start gap-0.5 py-2">
                    <span className="text-sm">{a.label}</span>
                    <span className="text-xs text-muted-foreground">{a.explanation}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            onClick={() => removeCondition(cond.id)}
            aria-label={`删除条件 ${def.name}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        口径：{def.dataPoint} · 来源：{def.source} · 合理区间 {def.domain[0]}~{def.domain[1]} {def.unit}（悬停指标名查看完整定义）
      </p>

      {cond.enabled && hit && (() => {
        const pool = hit.pass + hit.fail + hit.missing;
        if (pool === 0) return null;
        const passPct = Math.round((hit.pass / pool) * 100);
        const failPct = Math.round((hit.fail / pool) * 100);
        return (
          <div className="mt-2">
            <div
              className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary"
              role="img"
              aria-label={`该条件在完整池中独立命中 ${hit.pass} 只，未通过 ${hit.fail + hit.missing} 只`}
            >
              <div className="h-full bg-primary" style={{ width: `${passPct}%` }} />
              <div className="h-full bg-secondary-foreground/15" style={{ width: `${failPct}%` }} />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              完整池单独筛选：命中 <span className="num font-medium text-foreground">{hit.pass}</span> 只 · 未命中{' '}
              <span className="num font-medium">{hit.fail}</span> 只
              {hit.missing > 0 && (
                <>
                  {' '}· 缺数据 <span className="num font-medium">{hit.missing}</span> 只
                </>
              )}
            </p>
          </div>
        );
      })()}
    </div>
  );
}

// 触发口径切换的桥接（避免在 JSX 回调中直接引用 context 造成渲染顺序问题）
let applyAltHandler: ((id: string, alt: ConditionAlternative) => void) | null = null;
function useApplyAlt(id: string, alt: ConditionAlternative) {
  applyAltHandler?.(id, alt);
}

function AddConditionPanel() {
  const { addCondition } = useScreener();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <Plus className="h-4 w-4" aria-hidden />
          添加条件
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(28rem,calc(100vw-2rem))] p-0">
        <div className="max-h-96 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">指标库（按类别 · 悬停查看通俗定义）</p>
          {CATEGORY_ORDER.map((cat) => {
            const items = METRIC_LIST.filter((m) => m.category === cat && m.filterable);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="mb-3">
                <p className="mb-1.5 text-xs font-semibold text-foreground/80">{cat}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      title={`${m.definition}\n口径：${m.dataPoint} · 单位：${m.unit}`}
                      onClick={() => addCondition(m.key)}
                      className="group flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-2.5 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      {m.name}
                      <Plus className="h-3 w-3 text-muted-foreground group-hover:text-primary" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ConditionPanel() {
  const { conditions, conflicts, hasHardConflict } = useScreener();

  return (
    <section id="conditions" aria-labelledby="conditions-heading" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="conditions-heading" className="font-serif-sc text-lg font-semibold">
            筛选条件（{conditions.filter((c) => c.enabled).length}/{conditions.length} 生效）
          </h2>
          <p className="text-sm text-muted-foreground">修改阈值 / 换口径 / 启停 / 删除，均立即触发确定性引擎重新筛选</p>
        </div>
        <div className="shrink-0">
          <AddConditionPanel />
        </div>
      </div>

      {hasHardConflict && (
        <Alert variant="destructive" className="mb-3">
          <TriangleAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>存在硬冲突，筛选已阻断</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {conflicts.hard.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <p className="mt-1">请修正或删除冲突条件后重试。</p>
          </AlertDescription>
        </Alert>
      )}

      {conditions.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            暂无条件。在上方输入选股意图，或点击「添加条件」从指标库选择（估值 / 成长 / 盈利质量 / 动量 / 波动 / 股息 / 市值 / 流动性）。
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {conditions.map((c) => (
            <ConditionCard key={c.id} cond={c} />
          ))}
        </div>
      )}
    </section>
  );
}

/** 供 ConditionCard 内 DropdownMenuItem 使用的口径切换注册器 */
export function RegisterApplyAlt() {
  const { applyAlternative } = useScreener();
  applyAltHandler = applyAlternative;
  return null;
}
