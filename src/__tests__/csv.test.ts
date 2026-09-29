import { describe, expect, it } from 'vitest';
import { escapeCsvCell, rowsToCsv, statusLabel } from '@/lib/csv';
import type { ScreenRow } from '@/data/types';
import type { RowEval } from '@/engine/types';

interface RowOver {
  passed?: boolean;
  failCount?: number;
  missingCount?: number;
  row?: Partial<ScreenRow> & { m?: Partial<ScreenRow['m']> };
}

function row(over: RowOver = {}): RowEval {
  const baseM: ScreenRow['m'] = {
    close: 1500,
    mktCap: 18800,
    pe: 28.5,
    pePercentile: null,
    peIndRel: null,
    pb: 7.8,
    pbPercentile: null,
    peg: null,
    roe: 32,
    revGrowth: 15.2,
    profitGrowth: 14.1,
    grossMargin: 91.5,
    dividendYield: 3.1,
    chg20d: 2.4,
    chg60d: 8.4,
    volatility: 21,
    drawdown52w: -18.3,
    northHolding: null,
    avgTurnover: 0.9,
  };
  const baseRow: ScreenRow = {
    code: '600519.SH',
    name: '贵州茅台',
    industry: '白酒',
    listDate: '2001-08-27',
    m: { ...baseM },
    asOfMarket: '2026-09-25 15:00',
    asOfFinance: '2026 中报',
    asOfNorth: '—',
    missingNotes: { pePercentile: '数据源未提供' },
  };
  return {
    row: {
      ...baseRow,
      ...over.row,
      m: { ...baseM, ...over.row?.m },
      missingNotes: { ...baseRow.missingNotes, ...over.row?.missingNotes },
    },
    evals: [],
    passed: over.passed ?? true,
    failCount: over.failCount ?? 0,
    missingCount: over.missingCount ?? 0,
  };
}

describe('escapeCsvCell CSV 转义', () => {
  it('普通值原样输出', () => {
    expect(escapeCsvCell('600519.SH')).toBe('600519.SH');
  });
  it('含逗号 / 引号 / 换行加引号并转义引号', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
  });
});

describe('statusLabel 状态标签', () => {
  it('入选 / 排除（失败项） / 排除（缺数据）三态', () => {
    expect(statusLabel(row())).toBe('入选');
    expect(statusLabel(row({ passed: false, failCount: 2 }))).toBe('排除(2项不通过)');
    expect(statusLabel(row({ passed: false, failCount: 0 }))).toBe('排除(数据缺失)');
  });
});

describe('rowsToCsv 结果导出', () => {
  it('输出含 BOM 与表头，指标列按目录名+单位命名', () => {
    const csv = rowsToCsv([row()]);
    expect(csv.startsWith('\uFEFF代码,名称,行业,状态')).toBe(true);
    expect(csv).toContain('PE-TTM(倍)');
    expect(csv).toContain('总市值(亿元)');
  });
  it('缺失指标标为「缺失(原因)」，不静默填默认值', () => {
    const csv = rowsToCsv([row()]);
    expect(csv).toContain('缺失(数据源未提供)');
  });
  it('多行以 CRLF 分隔', () => {
    const csv = rowsToCsv([
      row(),
      row({ row: { code: '000001.SZ', name: '平安银行' } }),
    ]);
    const body = csv.slice(1);
    expect(body).toMatch(/\r\n600519\.SH/);
    expect(body).toMatch(/\r\n000001\.SZ/);
  });
  it('排除行也导出（研究需要保留被排除名单与原因）', () => {
    const csv = rowsToCsv([row({ passed: false, failCount: 1 })]);
    expect(csv).toContain('排除(1项不通过)');
  });
});