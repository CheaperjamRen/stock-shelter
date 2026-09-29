import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Menu,
  ShieldAlert,
  Database,
  CircleAlert,
  LineChart,
  SlidersHorizontal,
  Table2,
  GitCompareArrows,
  History,
  BellRing,
  MessageSquareText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useScreener } from '@/state/ScreenerContext';
import { ComplianceDialog } from './ComplianceDialog';
import { cn } from '@/lib/utils';

/**
 * 应用外壳：顶部状态栏（应用名 / 数据源徽标 / 合规入口）+
 * 桌面锚点导航（hidden md:block）+ 移动端 Sheet 菜单（md:hidden）。
 */

export const NAV_SECTIONS = [
  { id: 'intent', label: '意图输入', icon: MessageSquareText },
  { id: 'conditions', label: '筛选条件', icon: SlidersHorizontal },
  { id: 'results', label: '筛选结果', icon: Table2 },
  { id: 'whatif', label: 'What-if 敏感性', icon: GitCompareArrows },
  { id: 'watchlist', label: '对比观察池', icon: LineChart },
  { id: 'backtest', label: '历史回测', icon: History },
  { id: 'strategies', label: '策略与监控', icon: BellRing },
] as const;

function DataSourceBadge() {
  const { providerInfo, loadError } = useScreener();
  if (loadError) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="gap-1 whitespace-nowrap">
              <CircleAlert className="h-3 w-3" aria-hidden />
              数据加载失败
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-72">
            <p>{loadError}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (!providerInfo || providerInfo.isDemo) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1 whitespace-nowrap border border-border">
              <Database className="h-3 w-3" aria-hidden />
              演示数据快照
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-72">
            <p>当前使用内置演示数据快照（确定性模拟生成，非实时行情）。配置扶摇金融数据 API Key 后可切换真实数据（见 README）。</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="max-w-64 gap-1 whitespace-nowrap">
            <Database className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{providerInfo.label}</span>
            {providerInfo.asOf && <span className="num text-[11px] opacity-80">· {providerInfo.asOf}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-80">
          <p>
            {providerInfo.note ?? '扶摇金融数据 API（同花顺）实时行情与财务数据；指标缺失显式标注，不静默补数。'}
          </p>
          {providerInfo.asOf && <p className="mt-1 text-xs opacity-80">行情揭示时点：{providerInfo.asOf}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="页面分区导航" className="flex flex-col gap-1">
      {NAV_SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={onNavigate}
          className="flex min-h-12 items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <s.icon className="h-4 w-4 shrink-0" aria-hidden />
          {s.label}
        </a>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { providerInfo } = useScreener();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-serif-sc text-sm font-bold text-primary-foreground">
            研
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif-sc text-base font-semibold leading-tight">研选</p>
            <p className="truncate text-xs text-muted-foreground">智能选股与策略解释器</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList />
        </div>
        <div className="border-t px-5 py-4 text-xs leading-relaxed text-muted-foreground">
          <p>研究辅助工具 · 不构成投资建议</p>
          <p className="mt-1">
            {providerInfo?.isDemo ? 'A 股演示数据快照' : `${providerInfo?.note ?? '扶摇金融数据 API'}${providerInfo?.asOf ? ` · ${providerInfo.asOf}` : ''}`}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b bg-background/95 px-4 py-2.5 backdrop-blur md:px-6">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="打开导航菜单">
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle className="flex items-center gap-2 font-serif-sc text-left">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">研</span>
                  研选 · 分区导航
                </SheetTitle>
              </SheetHeader>
              <div className="px-3 py-2">
                <NavList onNavigate={() => setNavOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif-sc text-base font-semibold md:text-lg">研选 · 自然语言智能选股与策略解释器</h1>
            <p className="hidden truncate text-xs text-muted-foreground md:block">A 股投资研究辅助 · 意图解析 → 确定性筛选 → 逐条件解释</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <DataSourceBadge />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setComplianceOpen(true)}>
              <ShieldAlert className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">合规声明</span>
              <span className="sr-only sm:hidden">合规声明</span>
            </Button>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className={cn('border-t bg-card px-4 py-4 md:px-6')}>
          <p className="text-xs leading-relaxed text-muted-foreground">
            本工具为研究辅助，不构成任何投资建议。数据为演示快照（非实时），关键数字均可追溯字段、时点、单位与统计口径；
            涨跌预测、收益承诺与买卖建议均超出本工具能力边界。
          </p>
        </footer>
      </div>

      <ComplianceDialog open={complianceOpen} onOpenChange={setComplianceOpen} />
    </div>
  );
}
