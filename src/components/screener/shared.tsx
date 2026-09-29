import { Info, CircleHelp } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { METRICS, METRIC_LIST, metricProvenance } from '@/data/metrics';
import type { MetricKey } from '@/data/metrics';
import type { EvalStatus } from '@/engine/types';
import type { ScreenRow } from '@/data/types';
import { useScreener } from '@/state/ScreenerContext';
import { cn } from '@/lib/utils';

/**
 * 筛选器共享展示组件：三态标签、口径脚注悬浮卡、数值格式化、事实/推断标签。
 * 设计签名：所有指标名携带上标序号，锚定「口径脚注卡片」（定义/时点/来源/单位四要素）。
 */

export function fmtNum(v: number | null | undefined, decimals: number): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(decimals);
}

/** 三态标签：通过 / 不通过 / 数据缺失 */
export function StatusBadge({ status, className }: { status: EvalStatus; className?: string }) {
  const map: Record<EvalStatus, { label: string; cls: string }> = {
    pass: { label: '通过', cls: 'bg-pass/10 text-pass border-pass/30' },
    fail: { label: '不通过', cls: 'bg-fail/10 text-fail border-fail/30' },
    missing: { label: '数据缺失', cls: 'bg-muted text-muted-foreground border-border' },
  };
  const s = map[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        s.cls,
        className
      )}
    >
      {status === 'missing' && <CircleHelp className="mr-0.5 h-3 w-3" aria-hidden />}
      {s.label}
    </span>
  );
}

/** 指标口径脚注：指标名 + 上标序号 + 悬浮口径卡片 */
export function MetricFootnote({
  metric,
  showName = true,
  className,
}: {
  metric: MetricKey;
  showName?: boolean;
  className?: string;
}) {
  const def = METRICS[metric];
  const { providerInfo } = useScreener();
  const pv = metricProvenance(metric, providerInfo?.id === 'fuyao');
  const idx = METRIC_LIST.findIndex((m) => m.key === metric) + 1;
  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button" className={cn('inline-flex items-center text-left', className)} aria-label={`查看 ${def.name} 口径说明`}>
          {showName && <span>{def.name}</span>}
          <sup className="fn-sup">{idx}</sup>
          <Info className="ml-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-80">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-serif-sc text-sm font-semibold">{def.name}</p>
            <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">{def.category}</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{def.definition}</p>
          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground/80">统计时点：</span>
              {pv.dataPoint}
            </p>
            <p>
              <span className="font-medium text-foreground/80">数据来源：</span>
              {pv.source}
            </p>
            <p>
              <span className="font-medium text-foreground/80">单位：</span>
              {def.unit}　<span className="font-medium text-foreground/80">合理区间：</span>
              {def.domain[0]} ~ {def.domain[1]}
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/** 缺失单元格：斜纹背景 + 原因悬浮提示（禁止静默赋默认值） */
export function MissingCell({ note }: { note?: string }) {
  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="missing-stripes inline-flex cursor-help items-center rounded-sm px-2 py-0.5 text-xs text-muted-foreground">
          数据缺失
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-72">
        <p className="text-sm">
          {note ? `缺失原因：${note}` : '该字段数据缺失，不参与通过判定（不会按默认值计算）。'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">含缺失字段的股票不计入通过名单，需显式处理。</p>
      </HoverCardContent>
    </HoverCard>
  );
}

/** 事实 / 推断标签：合规红线要求每条结论区分来源 */
export function FactTag() {
  return (
    <span className="inline-flex items-center rounded-sm border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground whitespace-nowrap">
      客观事实
    </span>
  );
}

export function InferenceTag() {
  return (
    <span className="inline-flex items-center rounded-sm border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-xs text-primary whitespace-nowrap">
      模型推断
    </span>
  );
}

/** 按指标口径分组返回该股对应统计时点 */
export function asOfFor(row: ScreenRow, group: 'market' | 'finance' | 'north'): string {
  if (group === 'finance') return row.asOfFinance;
  if (group === 'north') return row.asOfNorth;
  return row.asOfMarket;
}

/** 涨跌着色（A 股惯例：涨红跌绿） */
export function ChangeText({ v, children }: { v: number | null; children: React.ReactNode }) {
  if (v == null) return <span className="text-muted-foreground">{children}</span>;
  return <span className={v > 0 ? 'text-up' : v < 0 ? 'text-down' : ''}>{children}</span>;
}
