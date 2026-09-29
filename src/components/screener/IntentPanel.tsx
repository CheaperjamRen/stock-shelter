import { Sparkles, Tag, Hash, Info, CircleHelp, TriangleAlert, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EXAMPLE_PHRASES } from '@/data/metrics';
import { useScreener } from '@/state/ScreenerContext';
import type { ParseStep } from '@/engine/parser';
import { cn } from '@/lib/utils';

/**
 * 意图输入区：自然语言输入 + 示例短语快捷填充 + 解析意图
 * + 步骤式可解释反馈（识别关键词 → 转化条件）
 * + 歧义口径确认弹窗（AI 解析层只负责理解与澄清，不产出选股结果）。
 */

function StepIcon({ kind }: { kind: ParseStep['kind'] }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if (kind === 'keyword') return <Tag className={cn(cls, 'text-primary')} aria-hidden />;
  if (kind === 'number') return <Hash className={cn(cls, 'text-primary')} aria-hidden />;
  if (kind === 'ambiguity') return <CircleHelp className={cn(cls, 'text-amber-600')} aria-hidden />;
  return <Info className={cn(cls, 'text-muted-foreground')} aria-hidden />;
}

function AmbiguityDialog() {
  const { ambiguities, resolveAmbiguity, dismissAmbiguity } = useScreener();
  const open = ambiguities.length > 0;
  const amb = ambiguities[0];

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        {amb && (
          <DialogHeader>
            <DialogTitle className="font-serif-sc">歧义口径确认</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p>{amb.question}</p>
                <div className="space-y-2">
                  {amb.options.map((opt, i) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => resolveAmbiguity(0, i)}
                      className="w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                    >
                      <p className="text-sm font-medium text-foreground">{opt.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{opt.explanation}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  口径确认后将生成对应条件卡片，后续仍可在条件卡上随时切换口径。
                </p>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => dismissAmbiguity(0)}>
                  暂不处理（该词不参与筛选）
                </Button>
              </div>
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function IntentPanel() {
  const { inputText, setInputText, parseAndApply, parseSteps, conflicts, clearConditions, loading, loadError } = useScreener();

  return (
    <section id="intent" aria-labelledby="intent-heading" className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="intent-heading" className="font-serif-sc text-lg font-semibold">
            选股意图输入
          </h2>
          <p className="text-sm text-muted-foreground">用自然语言描述，AI 解析层将拆解为结构化条件（仅解析，不产出选股结果）</p>
        </div>
        {parseSteps.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearConditions}>
            清空解析与条件
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card md:p-5">
        {loadError && (
          <Alert variant="destructive" className="mb-4">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            <AlertTitle>数据源加载失败</AlertTitle>
            <AlertDescription>{loadError}（系统不会静默降级为演示数据后伪装正常结论）</AlertDescription>
          </Alert>
        )}

        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="例如：经营改善、估值合理、走势相对稳定"
          aria-label="选股意图输入框"
          className="min-h-24 resize-y text-base"
          disabled={loading}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">示例短语：</span>
          {EXAMPLE_PHRASES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setInputText(p)}
              className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button className="gap-1.5" onClick={() => parseAndApply(inputText)} disabled={loading || !inputText.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {loading ? '数据准备中…' : '解析意图'}
          </Button>
          <p className="text-xs text-muted-foreground">
            AI 解析层只负责理解与澄清；筛选由确定性引擎执行，同一输入结果唯一可复现。
          </p>
        </div>

        {conflicts.warnings.map((w) => (
          <Alert key={w} className="mt-4 border-amber-300 bg-amber-50 text-amber-900">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            <AlertTitle>张力组合警示（允许执行）</AlertTitle>
            <AlertDescription className="text-amber-800">{w}</AlertDescription>
          </Alert>
        ))}

        {parseSteps.length > 0 && (
          <div className="mt-4 rounded-md border bg-muted/40 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Wand2 className="h-3.5 w-3.5" aria-hidden />
              解析过程（步骤式反馈）
            </p>
            <ol className="space-y-1.5">
              {parseSteps.map((s, i) => (
                <li key={`${s.kind}-${i}`} className="flex items-start gap-2 text-sm leading-relaxed">
                  <StepIcon kind={s.kind} />
                  <span className={cn('min-w-0 break-words', s.kind === 'note' && 'text-muted-foreground')}>{s.text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <AmbiguityDialog />
    </section>
  );
}
