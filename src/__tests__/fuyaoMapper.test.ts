import { describe, expect, it } from 'vitest';
import {
  calcPeg,
  deriveDividendYield,
  deriveMomentum,
  financialValue,
  fmtAsOf,
  mapWideLayer,
  reportFallbackChain,
} from '@/data/fuyaoMapper';

describe('fuyaoMapper 纯函数', () => {
  describe('fmtAsOf', () => {
    it('把毫秒时间戳格式化为可读时点', () => {
      const ms = new Date(2026, 8, 25, 15, 4).getTime(); // 2026-09-25 15:04
      expect(fmtAsOf(ms, 'x')).toBe('2026-09-25 15:04');
    });
    it('无效时间戳回退默认文案', () => {
      expect(fmtAsOf(null, 'unknown')).toBe('unknown');
      expect(fmtAsOf(NaN, 'unknown')).toBe('unknown');
    });
  });

  describe('reportFallbackChain 报告期回退链', () => {
    it('当年 9 月：优先当年中报，回退一季报与去年年报', () => {
      const now = new Date(2026, 8, 25).getTime(); // 2026-09-25
      expect(reportFallbackChain(now)).toEqual(['2026-2', '2026-1', '2025-4']);
    });
    it('当年 1 月：去年年报优先', () => {
      const now = new Date(2026, 0, 15).getTime();
      expect(reportFallbackChain(now).slice(0, 2)).toEqual(['2025-4', '2025-3']);
    });
    it('链接不重复且最多 3 期', () => {
      const chain = reportFallbackChain(new Date(2026, 9, 1).getTime());
      expect(new Set(chain).size).toBe(chain.length);
      expect(chain.length).toBeLessThanOrEqual(3);
    });
  });

  describe('financialValue 财务指标提取', () => {
    const abilities = [
      {
        ability: '盈利能力',
        indicators: [
          { index_id: 'index_weighted_avg_roe', value: '12.50000000' },
          { index_id: 'sale_gross_margin', value: null },
        ],
      },
      {
        ability: '成长能力',
        indicators: [
          { index_id: 'net_profit_yoy_growth_ratio', value: '23.4' },
          { index_id: 'operating_income_yoy_growth_ratio', value: '' },
        ],
      },
    ];
    it('按指标 ID 提取百分数原值', () => {
      expect(financialValue(abilities, 'index_weighted_avg_roe')).toBe(12.5);
      expect(financialValue(abilities, 'net_profit_yoy_growth_ratio')).toBe(23.4);
    });
    it('null / 空串 / 未出现均返回 null（不造数）', () => {
      expect(financialValue(abilities, 'sale_gross_margin')).toBeNull();
      expect(financialValue(abilities, 'operating_income_yoy_growth_ratio')).toBeNull();
      expect(financialValue(abilities, 'no_such_id')).toBeNull();
    });
  });

  describe('calcPeg', () => {
    it('PE/增速 均为正时计算 PEG', () => {
      expect(calcPeg(20, 25)).toBe(0.8);
    });
    it('增速非正或 PE 非正时无意义 → null', () => {
      expect(calcPeg(20, 0)).toBeNull();
      expect(calcPeg(20, -5)).toBeNull();
      expect(calcPeg(-10, 20)).toBeNull();
      expect(calcPeg(null, 20)).toBeNull();
    });
    it('高 PEG 封顶 99（避免无穷大字段破坏 UI）', () => {
      expect(calcPeg(50, 0.1)).toBe(99);
    });
  });

  describe('deriveMomentum K 线派生动量', () => {
    /** 构造收盘价序列：定期上台阶便于验证涨跌幅 */
    function makeBars(n: number, base: number, step: number): Array<{ date_ms: number; close_price: number; turnover: number }> {
      const bars = [];
      for (let i = 0; i < n; i += 1) {
        bars.push({
          date_ms: new Date(2025, 0, 1).getTime() + i * 86400_000,
          close_price: base + Math.floor(i / 20) * step,
          turnover: 2e9 + i * 1e6,
        });
      }
      return bars;
    }
    it('K 线不足 61 根时全部返回 null', () => {
      const m = deriveMomentum(makeBars(30, 10, 1) as never);
      expect(m.chg20d).toBeNull();
      expect(m.chg60d).toBeNull();
      expect(m.volatility).toBeNull();
      expect(m.drawdown52w).toBeNull();
      expect(m.avgTurnover).toBeNull();
    });
    it('20 日涨幅为（末价-20日前价）相对涨幅', () => {
      // 121 根：前 101 根 10 元，最后 20 根 12 元 → 20 个交易日前的价格是 index 100 = 10 元
      const bars = makeBars(121, 10, 0).slice();
      const last20 = 121 - 20; // index 101 起为 12 元，共 20 根
      const m = deriveMomentum(bars.map((b, i) => ({ ...b, close_price: i >= last20 ? 12 : 10 })) as never);
      expect(m.chg20d).toBeCloseTo(20, 1);
    });
    it('52 周回撤 = 现价相对窗口内最高价', () => {
      const bars = makeBars(300, 10, 0).slice();
      bars[150] = { ...bars[150], close_price: 20 }; // 中途高点 20
      const m = deriveMomentum(bars as never);
      expect(m.drawdown52w).toBeCloseTo((10 / 20 - 1) * 100, 1);
    });
    it('近 20 日日均成交额折算为亿元', () => {
      const bars = makeBars(81, 10, 1).slice();
      const m = deriveMomentum(bars as never);
      // turnover = 2e9 + i*1e6，近 20 根平均 ≈ (2e9 + i*1e6) / 1e8 ≈ 20.05 → 平均
      expect(m.avgTurnover).toBeGreaterThan(19);
      expect(m.avgTurnover).toBeLessThan(21);
    });
  });

  describe('deriveDividendYield 股息率', () => {
    const now = new Date(2026, 8, 25).getTime();
    it('近 12 个月每股分红合计 ÷ 现价', () => {
      const events = [
        { exDateMs: now - 100 * 86400_000, dividendPerShare: 1.2 }, // 12 个月内
        { exDateMs: now - 400 * 86400_000, dividendPerShare: 0.8 }, // 窗口之外（400 天前）
        { exDateMs: now - 30 * 86400_000, dividendPerShare: 0 }, // 送转事件不计
      ];
      const dy = deriveDividendYield(events, 20, now);
      expect(dy).toBeCloseTo((1.2 / 20) * 100, 1); // 6%
    });
    it('无分红或现价缺失 → null', () => {
      expect(deriveDividendYield([], 20, now)).toBeNull();
      expect(deriveDividendYield([{ exDateMs: now, dividendPerShare: 1 }], null, now)).toBeNull();
    });
  });

  describe('mapWideLayer 宽层映射', () => {
    const snapshot = new Map([['600519.SH', { thscode: '600519.SH', last_price: 1500, prev_price: 1490, price_change_ratio_pct: 0.67, turnover: 8e9 }]]);
    const valuations = new Map([['600519.SH', { pe_ttm: 28.5, pb_mrq: 9.1 }]]);
    const auctions = new Map([['600519.SH', { float_market_cap: 1.88e12 }]]);
    const names = new Map([['600519.SH', '贵州茅台']]);
    it('映射价格/市值/PE/PB 并保留成交额', () => {
      const [r] = mapWideLayer(snapshot as never, valuations as never, auctions as never, names as never);
      expect(r.code).toBe('600519.SH');
      expect(r.name).toBe('贵州茅台');
      expect(r.close).toBe(1500);
      expect(r.prevClose).toBe(1490);
      expect(r.turnover).toBe(8e9);
      expect(r.m.mktCap).toBeCloseTo(18800, 0); // 1.88e12 / 1e8
      expect(r.m.pe).toBe(28.5);
      expect(r.m.pb).toBe(9.1);
    });
    it('估值/市值缺失的标的对应字段为 null', () => {
      const snap2 = new Map([['000001.SZ', { thscode: '000001.SZ', last_price: 10, turnover: 1e8 }]]);
      const [r] = mapWideLayer(snap2 as never, new Map(), new Map(), new Map());
      expect(r.m.pe).toBeNull();
      expect(r.m.mktCap).toBeNull();
      expect(r.name).toBe('000001.SZ'); // 无名称回退代码
    });
  });
});