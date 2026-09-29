import { AppShell } from '@/components/screener/AppShell';
import { IntentPanel } from '@/components/screener/IntentPanel';
import { ConditionPanel } from '@/components/screener/ConditionPanel';
import { ResultPanel } from '@/components/screener/ResultPanel';
import { MarketStrip } from '@/components/screener/MarketStrip';
import { WhatIfPanel } from '@/components/screener/WhatIfPanel';
import { WatchlistPanel } from '@/components/screener/WatchlistPanel';
import { BacktestPanel } from '@/components/screener/BacktestPanel';
import { StrategyPanel } from '@/components/screener/StrategyPanel';
import { StockDrawer } from '@/components/screener/StockDrawer';

/**
 * 研选主页：单列纵向工作流（市场环境 → 意图输入 → 筛选条件 → 结果 → 分析面板）。
 * 桌面端左侧为锚点导航（见 AppShell），移动端为 Sheet 菜单。
 */

export default function ScreenerPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-6 md:px-6 md:py-8">
        <MarketStrip />
        <IntentPanel />
        <ConditionPanel />
        <ResultPanel />
        <WhatIfPanel />
        <WatchlistPanel />
        <BacktestPanel />
        <StrategyPanel />
      </div>
      <StockDrawer />
    </AppShell>
  );
}
