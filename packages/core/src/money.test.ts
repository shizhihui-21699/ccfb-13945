import { describe, it, expect } from 'vitest';
import { rmbUpper } from './rmb.js';
import { yuanToCents, centsToYuan, sumYuan, groupAccount, diffAccountPositions } from './money.js';

describe('人民币大写', () => {
  it.each([
    ['0.00', '零元整'],
    ['100.00', '壹佰元整'],
    ['1234.56', '壹仟贰佰叁拾肆元伍角陆分'],
    ['10001.05', '壹万零壹元零伍分'],
    ['100000.00', '壹拾万元整'],
    ['200001000.10', '贰亿零壹仟元壹角整'],
    ['0.08', '零元零捌分'],
    ['50020.30', '伍万零贰拾元叁角整']
  ])('%s -> %s', (input, expected) => {
    expect(rmbUpper(input)).toBe(expected);
  });
});

describe('金额与账号工具', () => {
  it('分/元互转与求和无浮点误差', () => {
    expect(yuanToCents('1234.56')).toBe(123456);
    expect(centsToYuan(123456)).toBe('1234.56');
    expect(sumYuan(['0.10', '0.20'])).toBe('0.30');
    expect(sumYuan(['99999.99', '0.01'])).toBe('100000.00');
  });

  it('账号分组与差异位', () => {
    expect(groupAccount('6222020200012345678')).toBe('6222 0202 0001 2345 678');
    expect(diffAccountPositions('62220001', '62220091')).toEqual([6]);
  });
});
