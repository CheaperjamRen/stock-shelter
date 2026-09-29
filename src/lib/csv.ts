/**
 * 筛选结果 CSV 导出（真实投研工作流：结果要落到 Excel 做二次加工/留档）。
 * 纯函数 + Blob 下载分离，便于单测；UTF-8 BOM 保证 Excel 打开中文不乱码。
 */
import { METRICS } from '@/data/metrics';
import type { MetricKey } from '@/data/metrics';
import type { RowEval } from '@/engine/types';

/** 导出列：代码 / 名称 / 行业 / 状态 / 口径时点 + 估值与基本面指标（与表格一致） */
const EXPORT_METRICS: MetricKey[] = [
  'close',
  'mktCap',
  'pe',
  'pePercentile',
  'pb',
  'roe',
  'revGrowth',
  'profitGrowth',
  'grossMargin',
  'peg',
  'dividendYield',
  'chg20d',
  'chg60d',
  'volatility',
  'drawdown52w',
  'avgTurnover',
];

/** CSV 单元格转义：含逗号 / 引号 / 换行时加双引号并加倍内部引号 */
export function escapeCsvCell(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** 行状态的人类可读标签（导出文件名与 CSV 状态列共用） */
export function statusLabel(ev: RowEval): string {
  if (ev.passed) return '入选';
  if (ev.failCount > 0) return `排除(${ev.failCount}项不通过)`;
  return '排除(数据缺失)';
}

/** RowEval[] → CSV 文本（含 BOM 与表头） */
export function rowsToCsv(rows: RowEval[]): string {
  const header = [
    '代码',
    '名称',
    '行业',
    '状态',
    '行情时点',
    '财务时点',
    ...EXPORT_METRICS.map((k) => `${METRICS[k].name}(${METRICS[k].unit})`),
  ];
  const lines = [header.map(escapeCsvCell).join(',')];
  for (const ev of rows) {
    const r = ev.row;
    const cells = [
      r.code,
      r.name,
      r.industry,
      statusLabel(ev),
      r.asOfMarket,
      r.asOfFinance,
      ...EXPORT_METRICS.map((k) => {
        const v = r.m[k];
        if (v == null) return r.missingNotes[k] ? `缺失(${r.missingNotes[k]})` : '缺失';
        return String(v);
      }),
    ];
    lines.push(cells.map(escapeCsvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 触发浏览器下载（仅客户端） */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}