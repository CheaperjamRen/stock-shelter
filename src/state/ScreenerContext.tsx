import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DEEP_METRICS, getDataProvider } from '@/data/provider';
import type { DataProvider, ProviderInfo } from '@/data/provider';
import type { MarketContext } from '@/data/fuyaoMapper';
import { METRICS } from '@/data/metrics';
import type { MetricKey } from '@/data/metrics';
import { withDerivedMetrics } from '@/data/derive';
import { stockAtPrevDay } from '@/data/stocks';
import type { Stock } from '@/data/types';
import { conditionFunnel, runScreen } from '@/engine/screener';
import { detectConflicts } from '@/engine/conflict';
import { parseIntent } from '@/engine/parser';
import type { Ambiguity, ParseStep } from '@/engine/parser';
import type { Condition, ConditionAlternative } from '@/engine/types';
import { whatIf } from '@/engine/whatif';
import { runBacktest } from '@/engine/backtest';

/**
 * 全局状态：条件集 / 筛选结果 / 解析轨迹 / 观察池 / 策略与监控。
 * 所有筛选结果均由确定性引擎实时派生（useMemo），同一输入唯一可复现。
 * 注：演示环境无服务端，策略与观察池为会话内保存。
 */

export interface SavedStrategy {
  id: string;
  name: string;
  conditions: Condition[];
  savedAt: string;
  /** 监控开关 */
  monitoring: boolean;
}

export interface MonitorRun {
  strategyId: string;
  ranAt: string;
  enter: Stock[];
  exit: Stock[];
  prevPassCount: number;
  currentPassCount: number;
}

interface ScreenerState {
  stocks: Stock[];
  providerInfo: ProviderInfo | null;
  /** 全市场环境快照（仅真实数据源提供；演示模式为 null，不编造大盘数字） */
  market: MarketContext | null;
  loadError: string | null;
  loading: boolean;
  /** 深度指标精算状态（真实数据源下，条件含深度指标时自动触发） */
  enriching: boolean;
  enrichProgress: { done: number; total: number; current?: string } | null;
  enrichError: string | null;

  conditions: Condition[];
  result: ReturnType<typeof runScreen>;
  /** 条件漏斗：conditionId → 完整池独立命中统计 */
  funnel: ReturnType<typeof conditionFunnel>;
  conflicts: ReturnType<typeof detectConflicts>;
  hasHardConflict: boolean;

  parseSteps: ParseStep[];
  ambiguities: Ambiguity[];
  lastIntent: string;
  inputText: string;

  drawerCode: string | null;
  watchlist: string[];
  strategies: SavedStrategy[];
  monitorRuns: Record<string, MonitorRun>;

  setInputText: (t: string) => void;
  parseAndApply: (text: string) => void;
  resolveAmbiguity: (ambIndex: number, optionIndex: number) => void;
  dismissAmbiguity: (ambIndex: number) => void;
  addCondition: (metric: MetricKey) => void;
  updateCondition: (id: string, patch: Partial<Condition>) => void;
  removeCondition: (id: string) => void;
  toggleCondition: (id: string) => void;
  clearConditions: () => void;
  applyAlternative: (id: string, alt: ConditionAlternative) => void;
  openDrawer: (code: string | null) => void;
  toggleWatch: (code: string) => void;
  clearWatchlist: () => void;
  saveStrategy: (name: string) => void;
  deleteStrategy: (id: string) => void;
  loadStrategy: (id: string) => void;
  toggleMonitoring: (id: string) => void;
  runMonitorNow: (id: string) => void;
  runWhatIf: (targetId: string, pct: number) => ReturnType<typeof whatIf>;
  runBacktestNow: () => ReturnType<typeof runBacktest>;
}

const ScreenerContext = createContext<ScreenerState | null>(null);

let condSeq = 0;
function nextId(metric: MetricKey): string {
  condSeq += 1;
  return `cond-${metric}-${condSeq}`;
}

export function ScreenerProvider({ children }: { children: ReactNode }) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);
  const [market, setMarket] = useState<MarketContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number; current?: string } | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  /** 已精算代码缓存（避免条件微调时重复拉取逐只接口） */
  const enrichedCodes = useRef(new Set<string>());
  /** 数据源 Provider 单例 */
  const providerRef = useRef<DataProvider | null>(null);

  const [conditions, setConditions] = useState<Condition[]>([]);
  const [parseSteps, setParseSteps] = useState<ParseStep[]>([]);
  const [ambiguities, setAmbiguities] = useState<Ambiguity[]>([]);
  const [lastIntent, setLastIntent] = useState('');
  const [inputText, setInputText] = useState('');

  const [drawerCode, setDrawerCode] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [monitorRuns, setMonitorRuns] = useState<Record<string, MonitorRun>>({});

  // 数据层加载：失败显式提示，禁止静默降级
  useEffect(() => {
    let cancelled = false;
    const provider = getDataProvider();
    providerRef.current = provider;
    setProviderInfo(provider.info);
    provider
      .loadStocks()
      .then((s) => {
        if (!cancelled) setStocks(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    provider
      .getMarketContext?.()
      .then((m) => {
        if (!cancelled) setMarket(m);
      })
      .catch(() => {
        /* 大盘环境获取失败不回退整体；保持 null（不展示市场条） */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => withDerivedMetrics(stocks), [stocks]);
  const result = useMemo(() => runScreen(rows, conditions), [rows, conditions]);
  /** 条件漏斗：每个启用条件在完整池中的独立命中统计（筛选力度可视化） */
  const funnel = useMemo(() => conditionFunnel(rows, conditions), [rows, conditions]);

  // 深度指标精算编排（真实数据源）：
  // 1) 条件含深度指标时，先用宽层可判条件预筛出初选池（缩小精算范围，贴合真实工作流）
  // 2) 按流动性排序取前 N 只（宽层快照有成交额），对未精算代码并发拉取财务/动量/股息
  // 3) 精算结果合并回 stocks，useMemo 自动重跑筛选
  const deepNeeded = useMemo(
    () => conditions.some((c) => c.enabled && DEEP_METRICS.includes(c.metric)),
    [conditions]
  );
  const shallowConditions = useMemo(
    () => conditions.filter((c) => c.enabled && !DEEP_METRICS.includes(c.metric)),
    [conditions]
  );
  // 预筛只用于挑选精算池；最终结果仍由全条件 runScreen 决定
  const prePassed = useMemo(() => {
    if (shallowConditions.length === 0) return rows;
    return runScreen(rows, shallowConditions).passedRows.map((r) => r.row as Stock);
  }, [rows, shallowConditions]);

  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || !provider.enrich || !deepNeeded) return;
    if (rows.length === 0 || prePassed.length === 0) return;
    let cancelled = false;
    // 初选池按流动性（成交额）排序取前阈值
    const N = 60; // 精算池容量（贴合限流与等待时长的平衡）
    const pool = [...prePassed]
      .sort((a, b) => (b.liquid ?? 0) - (a.liquid ?? 0))
      .slice(0, N)
      .map((r) => r.code);
    const todo = pool.filter((c) => !enrichedCodes.current.has(c));
    if (todo.length === 0) return;

    setEnriching(true);
    setEnrichError(null);
    provider
      .enrich(todo, (p) => {
        if (!cancelled) setEnrichProgress(p);
      })
      .then((patches) => {
        if (cancelled) return;
        for (const p of patches) enrichedCodes.current.add(p.code);
        // 合并精算结果：m 字段覆盖，missingNotes 合并，财务时点更新
        setStocks((prev) => {
          const map = new Map(patches.map((p) => [p.code, p]));
          return prev.map((s) => {
            const p = map.get(s.code);
            if (!p) return s;
            return {
              ...s,
              m: { ...s.m, ...p.m },
              asOfFinance: p.asOfFinance || s.asOfFinance,
              missingNotes: { ...s.missingNotes, ...p.missingNotes },
            } as Stock;
          });
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setEnrichError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) {
          setEnriching(false);
          setEnrichProgress(null);
        }
      });
    return () => {
      cancelled = true;
    };
    // 精算结果合并会改变 stocks → rows 重建 → 但 enrichedCodes 缓存防止已精算代码重复执行
  }, [deepNeeded, prePassed, rows.length]);
  const conflicts = useMemo(() => detectConflicts(conditions), [conditions]);
  const hasHardConflict = conflicts.hard.length > 0;

  const parseAndApply = useCallback((text: string) => {
    const parsed = parseIntent(text);
    setParseSteps(parsed.steps);
    setAmbiguities(parsed.ambiguities);
    setLastIntent(text);
    if (parsed.conditions.length > 0 || parsed.ambiguities.length > 0) {
      setConditions(parsed.conditions);
    }
  }, []);

  const resolveAmbiguity = useCallback(
    (ambIndex: number, optionIndex: number) => {
      setAmbiguities((prev) => {
        const amb = prev[ambIndex];
        if (!amb) return prev;
        const opt = amb.options[optionIndex];
        if (!opt) return prev;
        const alternatives: ConditionAlternative[] = amb.options.map((o) => ({
          label: o.label,
          explanation: o.explanation,
          metric: o.metric,
          op: o.op,
          value: o.value,
        }));
        const def = METRICS[opt.metric];
        setConditions((cs) => [
          ...cs,
          {
            id: nextId(opt.metric),
            metric: opt.metric,
            op: opt.op,
            value: opt.value,
            enabled: true,
            origin: 'intent',
            sourceKeyword: amb.keyword,
            alternatives,
          },
        ]);
        setParseSteps((steps) => [
          ...steps,
          {
            kind: 'keyword',
            text: `已确认「${amb.keyword}」口径：${opt.label} → 生成条件：${def.short} ${opt.op === 'lt' ? '<' : opt.op === 'lte' ? '≤' : opt.op === 'gt' ? '>' : '≥'} ${opt.value} ${def.unit}`,
          },
        ]);
        return prev.filter((_, i) => i !== ambIndex);
      });
    },
    []
  );

  const dismissAmbiguity = useCallback((ambIndex: number) => {
    setAmbiguities((prev) => prev.filter((_, i) => i !== ambIndex));
  }, []);

  const addCondition = useCallback((metric: MetricKey) => {
    const def = METRICS[metric];
    setConditions((cs) => [
      ...cs,
      {
        id: nextId(metric),
        metric,
        op: def.defaultCond.op,
        value: def.defaultCond.value,
        value2: def.defaultCond.value2,
        enabled: true,
        origin: 'manual',
      },
    ]);
  }, []);

  const updateCondition = useCallback((id: string, patch: Partial<Condition>) => {
    setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const removeCondition = useCallback((id: string) => {
    setConditions((cs) => cs.filter((c) => c.id !== id));
  }, []);

  const toggleCondition = useCallback((id: string) => {
    setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  }, []);

  const clearConditions = useCallback(() => {
    setConditions([]);
    setParseSteps([]);
    setAmbiguities([]);
    setLastIntent('');
  }, []);

  const applyAlternative = useCallback((id: string, alt: ConditionAlternative) => {
    setConditions((cs) =>
      cs.map((c) => (c.id === id ? { ...c, op: alt.op, value: alt.value, metric: c.metric } : c))
    );
    setParseSteps((steps) => [
      ...steps,
      { kind: 'keyword', text: `口径切换：${alt.label}` },
    ]);
  }, []);

  const openDrawer = useCallback((code: string | null) => setDrawerCode(code), []);

  const toggleWatch = useCallback((code: string) => {
    setWatchlist((w) => (w.includes(code) ? w.filter((c) => c !== code) : [...w, code]));
  }, []);

  const clearWatchlist = useCallback(() => setWatchlist([]), []);

  const saveStrategy = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || conditions.length === 0) return;
      setStrategies((prev) => [
        ...prev,
        {
          id: `strategy-${Date.now()}`,
          name: trimmed,
          conditions: conditions.map((c) => ({ ...c })),
          savedAt: new Date().toLocaleString('zh-CN'),
          monitoring: false,
        },
      ]);
    },
    [conditions]
  );

  const deleteStrategy = useCallback((id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
    setMonitorRuns((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const loadStrategy = useCallback(
    (id: string) => {
      const s = strategies.find((x) => x.id === id);
      if (!s) return;
      setConditions(s.conditions.map((c) => ({ ...c })));
      setParseSteps([{ kind: 'note', text: `已载入保存的策略「${s.name}」（${s.conditions.length} 条条件）` }]);
    },
    [strategies]
  );

  const toggleMonitoring = useCallback((id: string) => {
    setStrategies((prev) => prev.map((s) => (s.id === id ? { ...s, monitoring: !s.monitoring } : s)));
  }, []);

  const runMonitorNow = useCallback(
    (id: string) => {
      const s = strategies.find((x) => x.id === id);
      if (!s || stocks.length === 0) return;
      const current = runScreen(rows, s.conditions);
      const prevRows = withDerivedMetrics(stocks.map(stockAtPrevDay));
      const prev = runScreen(prevRows, s.conditions);
      const curCodes = new Set(current.passedRows.map((r) => r.row.code));
      const prevCodes = new Set(prev.passedRows.map((r) => r.row.code));
      const enter = current.passedRows.filter((r) => !prevCodes.has(r.row.code)).map((r) => r.row as Stock);
      const exit = prev.passedRows.filter((r) => !curCodes.has(r.row.code)).map((r) => r.row as Stock);
      setMonitorRuns((m) => ({
        ...m,
        [id]: {
          strategyId: id,
          ranAt: new Date().toLocaleString('zh-CN'),
          enter,
          exit,
          prevPassCount: prev.passCount,
          currentPassCount: current.passCount,
        },
      }));
    },
    [strategies, stocks, rows]
  );

  const runWhatIf = useCallback(
    (targetId: string, pct: number) => whatIf(rows, conditions, targetId, pct),
    [rows, conditions]
  );

  const runBacktestNow = useCallback(() => runBacktest(stocks, conditions), [stocks, conditions]);

  const value: ScreenerState = {
    stocks,
    providerInfo,
    market,
    loadError,
    loading,
    enriching,
    enrichProgress,
    enrichError,
    conditions,
    result,
    funnel,
    conflicts,
    hasHardConflict,
    parseSteps,
    ambiguities,
    lastIntent,
    inputText,
    drawerCode,
    watchlist,
    strategies,
    monitorRuns,
    setInputText,
    parseAndApply,
    resolveAmbiguity,
    dismissAmbiguity,
    addCondition,
    updateCondition,
    removeCondition,
    toggleCondition,
    clearConditions,
    applyAlternative,
    openDrawer,
    toggleWatch,
    clearWatchlist,
    saveStrategy,
    deleteStrategy,
    loadStrategy,
    toggleMonitoring,
    runMonitorNow,
    runWhatIf,
    runBacktestNow,
  };

  return <ScreenerContext.Provider value={value}>{children}</ScreenerContext.Provider>;
}

export function useScreener(): ScreenerState {
  const ctx = useContext(ScreenerContext);
  if (!ctx) throw new Error('useScreener 必须在 ScreenerProvider 内使用');
  return ctx;
}
