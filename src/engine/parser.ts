import { METRICS } from '../data/metrics';
import type { MetricKey, Operator } from '../data/metrics';
import type { Condition } from './types';
import { describeCondition } from './screener';

/**
 * AI 解析层（规则式 NLU，演示实现）：
 * 只负责自然语言理解与澄清——关键词映射、数字条件抽取、歧义识别、步骤化可解释反馈。
 * 绝不直接给出选股结果；筛选一律交由确定性引擎执行。
 */

export interface ParseStep {
  kind: 'keyword' | 'number' | 'ambiguity' | 'note';
  text: string;
}

export interface AmbiguityOption {
  label: string;
  explanation: string;
  metric: MetricKey;
  op: Operator;
  value: number;
}

export interface Ambiguity {
  keyword: string;
  question: string;
  options: AmbiguityOption[];
}

export interface ParseResult {
  conditions: Condition[];
  steps: ParseStep[];
  ambiguities: Ambiguities;
  /** 输入中完全无法识别的片段 */
  unrecognized: boolean;
}

type Ambiguities = Ambiguity[];

interface KeywordRule {
  /** 触发词 */
  words: string[];
  metric: MetricKey;
  op: Operator;
  value: number;
  /** 步骤说明中的语义描述 */
  meaning: string;
  /** 命中即视为歧义（不直接生成条件，待用户确认口径） */
  ambiguous?: boolean;
}

const KEYWORD_RULES: KeywordRule[] = [
  { words: ['经营改善', '基本面改善', '业绩改善', '盈利改善'], metric: 'profitGrowth', op: 'gte', value: 15, meaning: '盈利端同比改善（净利润增速）' },
  { words: ['高成长', '高增长', '业绩高增长', '成长性好'], metric: 'revGrowth', op: 'gte', value: 20, meaning: '营收高增长' },
  { words: ['走势相对稳定', '走势稳定', '走势平稳', '相对稳定'], metric: 'volatility', op: 'lte', value: 25, meaning: '走势相对稳定（低波动）' },
  { words: ['波动小', '低波动', '波动低'], metric: 'volatility', op: 'lte', value: 20, meaning: '低波动' },
  { words: ['高股息', '分红高', '高分红', '股息高'], metric: 'dividendYield', op: 'gte', value: 4, meaning: '高股息' },
  { words: ['蓝筹', '大市值', '大盘股', '大盘'], metric: 'mktCap', op: 'gte', value: 1000, meaning: '大市值蓝筹' },
  { words: ['小市值', '小盘股', '小盘'], metric: 'mktCap', op: 'lte', value: 300, meaning: '小市值' },
  { words: ['北向重仓', '北向资金', '北向持股', '外资重仓'], metric: 'northHolding', op: 'gte', value: 3, meaning: '北向资金重仓' },
  { words: ['强势', '动量强', '涨幅居前', '走势强'], metric: 'chg60d', op: 'gte', value: 15, meaning: '中期动量强势' },
  { words: ['超跌', '深度回调', '大幅回调'], metric: 'drawdown52w', op: 'lte', value: -25, meaning: '超跌（距52周高点深回撤）' },
  { words: ['回撤浅', '接近新高', '创新高'], metric: 'drawdown52w', op: 'gte', value: -15, meaning: '回撤较浅（接近一年高点）' },
  { words: ['白马', '优质', '高ROE', '高roe', '赚钱能力强'], metric: 'roe', op: 'gte', value: 15, meaning: '高净资产收益率' },
  { words: ['高毛利', '盈利质量高'], metric: 'grossMargin', op: 'gte', value: 40, meaning: '高毛利率' },
  { words: ['成交活跃', '流动性好', '交易活跃'], metric: 'avgTurnover', op: 'gte', value: 10, meaning: '成交活跃（流动性）' },
  { words: ['低估', '便宜', '低估值'], metric: 'pePercentile', op: 'lte', value: 30, meaning: '估值处于历史低位' },
  { words: ['破净'], metric: 'pb', op: 'lt', value: 1, meaning: '破净（PB < 1）' },
];

/** 歧义词表：不直接生成条件，弹出可选口径让用户确认 */
const AMBIGUOUS_RULES = [
  {
    words: ['估值合理', '估值适中', '估值不高'],
    keyword: '估值合理',
    question: '「估值合理」存在多种常用口径，请选择您想采用的定义：',
    options: [
      {
        label: 'PE-TTM 处于最近 10 年 30 分位以下',
        explanation: '纵向口径：当前市盈率低于自身过去 10 年 70% 的交易日，即相对自身历史便宜。适合判断个股估值的历史位置，但对盈利波动大的公司不敏感。',
        metric: 'pePercentile' as MetricKey,
        op: 'lte' as Operator,
        value: 30,
      },
      {
        label: 'PE-TTM 低于行业中位数',
        explanation: '横向口径：市盈率低于同行业中位水平，衡量相对同业的便宜程度。适合行业内比较，但行业整体高估时会失真。',
        metric: 'peIndRel' as MetricKey,
        op: 'lt' as Operator,
        value: 1,
      },
      {
        label: 'PB 低于历史 40 分位',
        explanation: '资产口径：市净率低于自身历史 60% 的交易日。适合银行、地产等重资产行业，对轻资产公司参考性较弱。',
        metric: 'pbPercentile' as MetricKey,
        op: 'lte' as Operator,
        value: 40,
      },
    ] as AmbiguityOption[],
  },
];

/** 指标别名 → 数字条件抽取 */
const NUMBER_ALIASES: Array<{ words: string[]; metric: MetricKey }> = [
  { words: ['PE-TTM', 'PE TTM', '市盈率', 'PE'], metric: 'pe' },
  { words: ['PE分位', 'PE 分位', '市盈率分位'], metric: 'pePercentile' },
  { words: ['PB分位', 'PB 分位', '市净率分位'], metric: 'pbPercentile' },
  { words: ['PB', '市净率'], metric: 'pb' },
  { words: ['PEG'], metric: 'peg' },
  { words: ['ROE', '净资产收益率'], metric: 'roe' },
  { words: ['营收增速', '收入增速', '营收增长'], metric: 'revGrowth' },
  { words: ['净利增速', '利润增速', '净利润增长'], metric: 'profitGrowth' },
  { words: ['毛利率'], metric: 'grossMargin' },
  { words: ['股息率'], metric: 'dividendYield' },
  { words: ['市值'], metric: 'mktCap' },
  { words: ['波动率', '年化波动'], metric: 'volatility' },
  { words: ['回撤'], metric: 'drawdown52w' },
  { words: ['北向占比', '北向持股占比'], metric: 'northHolding' },
  { words: ['成交额', '日均成交'], metric: 'avgTurnover' },
  { words: ['近20日', '20日涨跌', '20日涨幅'], metric: 'chg20d' },
  { words: ['近60日', '60日涨跌', '60日涨幅'], metric: 'chg60d' },
];

const LOW_WORDS = ['低于', '小于', '不超过', '少于', '最多'];
const HIGH_WORDS = ['高于', '大于', '超过', '起码', '至少', '不低于'];
const BETWEEN_WORDS = ['介于', '之间', '在'];

function makeId(metric: MetricKey, used: Set<string>): string {
  let i = 1;
  let id = `cond-${metric}`;
  while (used.has(id)) {
    i += 1;
    id = `cond-${metric}-${i}`;
  }
  used.add(id);
  return id;
}

function makeCondition(metric: MetricKey, op: Operator, value: number, used: Set<string>, keyword: string, value2?: number): Condition {
  return {
    id: makeId(metric, used),
    metric,
    op,
    value,
    value2,
    enabled: true,
    origin: 'intent',
    sourceKeyword: keyword,
  };
}

/**
 * 回撤口径换算：回撤以负值表示（-30 表示距 52 周高点回撤 30%）。
 * 自然语言中的「小于/大于」描述的是回撤幅度，需转成负值比较：
 *   「回撤小于 30%」= 回撤幅度不超过 30% = drawdown >= -30
 *   「回撤超过 30%」= 回撤幅度大于 30% = drawdown <= -30
 *   「回撤介于 10% ~ 20%」= drawdown 介于 -20 ~ -10
 */
function convertDrawdown(
  metric: MetricKey,
  op: Operator,
  value: number,
  value2?: number,
): { op: Operator; value: number; value2?: number } {
  if (metric !== 'drawdown52w') return { op, value, value2 };
  if (op === 'between' && value2 != null) {
    return { op: 'between', value: -value2, value2: -value };
  }
  // lt → gte、gt → lte、lte → gt、gte → lt 均为“幅度比较”的取反换算
  const flip: Record<string, Operator> = { lt: 'gte', gt: 'lte', lte: 'gt', gte: 'lt' };
  return { op: flip[op] ?? op, value: -value };
}

/** 提取「别名 + 比较词 + 数字」型条件 */
function extractNumberConditions(text: string, used: Set<string>): { conds: Condition[]; steps: ParseStep[]; consumed: string[] } {
  const conds: Condition[] = [];
  const steps: ParseStep[] = [];
  const consumed: string[] = [];

  for (const alias of NUMBER_ALIASES) {
    for (const w of alias.words) {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const betweenRe = new RegExp(`${escaped}[\\s]*[约在]?[\\s]*(?:从)?[\\s]*(\\d+(?:\\.\\d+)?)\\s*(?:%|倍|亿|元)?[\\s]*(?:到|至|~|—|-)[\\s]*(\\d+(?:\\.\\d+)?)\\s*(?:%|倍|亿|元)?`);
      const bm = text.match(betweenRe);
      if (bm) {
        const v1 = Number(bm[1]);
        const v2 = Number(bm[2]);
        const conv = convertDrawdown(alias.metric, 'between', v1, v2);
        conds.push(makeCondition(alias.metric, conv.op, conv.value, used, bm[0], conv.value2));
        steps.push({ kind: 'number', text: `识别数字条件「${bm[0].trim()}」→ ${METRICS[alias.metric].name} 介于 ${conv.value} ~ ${conv.value2} ${METRICS[alias.metric].unit}` });
        consumed.push(bm[0]);
        break;
      }

      for (const [words, op] of [
        [LOW_WORDS, 'lt'] as const,
        [HIGH_WORDS, 'gt'] as const,
      ] as Array<readonly [string[], 'lt' | 'gt']>) {
        const re = new RegExp(`${escaped}[\\s]*(?:${words.join('|')})[\\s]*(\\d+(?:\\.\\d+)?)\\s*(?:%|倍|亿|元)?`);
        const m = text.match(re);
        if (m) {
          const v = Number(m[1]);
          const conv = convertDrawdown(alias.metric, op, v);
          conds.push(makeCondition(alias.metric, conv.op, conv.value, used, m[0]));
          steps.push({ kind: 'number', text: `识别数字条件「${m[0].trim()}」→ ${METRICS[alias.metric].name} ${conv.op === 'lt' ? '<' : conv.op === 'lte' ? '≤' : conv.op === 'gte' ? '≥' : '>'} ${conv.value} ${METRICS[alias.metric].unit}` });
          consumed.push(m[0]);
          break;
        }
      }
      if (consumed.some((c) => c.length > 0 && text.includes(c) && alias.words.includes(w) && consumed[consumed.length - 1] !== '')) {
        // 已有该指标的条件则跳过重复匹配
      }
    }
  }
  return { conds, steps, consumed };
}

/** 主入口：解析自然语言意图 */
/**
 * 相同语义方向判定：gt/gte 同属「下限类」，lt/lte 同属「上限类」，between 独立。
 * 「ROE > 15」与「ROE ≥ 15」视为同一阈值档位（对连续数值二者实际差异可忽略），
 * 用于合并用户显式短语与关键词模板重复命中的同口径条件。
 */
function sameOpDirection(a: Operator, b: Operator): boolean {
  if (a === 'between' || b === 'between') return a === b;
  const down = new Set<Operator>(['lt', 'lte']);
  return down.has(a) === down.has(b);
}

/**
 * 同口径条件去重：同指标、同方向、阈值一致（±1e-6）视为重复，
 * 保留先出现的一条，并在步骤中明示合并，避免漏斗/排除统计出现近似重复项。
 * 仅合并完全等价条件，不做蕴含化简——不同阈值（如 ≥15 与 ≥20）继续并存。
 */
function dedupeConditions(conds: Condition[], steps: ParseStep[]): Condition[] {
  const out: Condition[] = [];
  for (const c of conds) {
    const dup = out.find(
      (x) =>
        x.metric === c.metric &&
        sameOpDirection(x.op, c.op) &&
        Math.abs(x.value - c.value) < 1e-6 &&
        Math.abs((x.value2 ?? x.value) - (c.value2 ?? c.value)) < 1e-6,
    );
    if (dup) {
      steps.push({
        kind: 'note',
        text: `「${describeCondition(c)}」与「${describeCondition(dup)}」语义重复，已合并为一条条件`,
      });
    } else {
      out.push(c);
    }
  }
  return out;
}

export function parseIntent(text: string): ParseResult {
  const used = new Set<string>();
  const conditions: Condition[] = [];
  const steps: ParseStep[] = [];
  const ambiguities: Ambiguities = [];
  let consumedText = text;

  // 1. 歧义词优先识别（不生成条件，收集可选口径）
  for (const rule of AMBIGUOUS_RULES) {
    if (rule.words.some((w) => text.includes(w))) {
      ambiguities.push({ keyword: rule.keyword, question: rule.question, options: rule.options });
      steps.push({ kind: 'ambiguity', text: `「${rule.keyword}」未定义口径，已生成 ${rule.options.length} 个备选定义待确认（确认前暂不参与筛选）` });
      for (const w of rule.words) {
        consumedText = consumedText.split(w).join(' ');
      }
    }
  }

  // 2. 数字条件抽取
  const numRes = extractNumberConditions(text, used);
  conditions.push(...numRes.conds);
  steps.push(...numRes.steps);
  for (const c of numRes.consumed) {
    consumedText = consumedText.split(c).join(' ');
  }

  // 3. 关键词规则匹配
  for (const rule of KEYWORD_RULES) {
    const hit = rule.words.find((w) => consumedText.includes(w));
    if (!hit) continue;
    const cond = makeCondition(rule.metric, rule.op, rule.value, used, hit);
    conditions.push(cond);
    steps.push({ kind: 'keyword', text: `识别关键词「${hit}」（${rule.meaning}）→ 生成条件：${describeCondition(cond)}` });
    for (const w of rule.words) {
      consumedText = consumedText.split(w).join(' ');
    }
  }

  // 4. 未识别提示
  const remaining = consumedText.replace(/[、，。,.;;\s的股票我要找优选一下]+/g, '').trim();
  if (conditions.length === 0 && ambiguities.length === 0) {
    steps.push({ kind: 'note', text: '未识别出有效的选股关键词或数字条件。可尝试示例短语，或在下方条件面板手动添加条件。' });
    return { conditions, steps, ambiguities, unrecognized: true };
  }
  if (remaining.length > 0) {
    steps.push({ kind: 'note', text: `以下内容未转化为条件（未覆盖该语义，可手动添加）：「${remaining.slice(0, 40)}」` });
  }

  // 5. 同口径条件去重（显式短语与模板重复命中时合并，保持漏斗统计口径唯一）
  return { conditions: dedupeConditions(conditions, steps), steps, ambiguities, unrecognized: false };
}
