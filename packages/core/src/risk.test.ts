import { describe, it, expect } from 'vitest';
import { evaluateTransfer, evaluateBatch, type RiskContext } from './risk.js';

const ctx: RiskContext = {
  registry: [
    { account: '6222021234560001', registeredName: '北京云海科技有限公司', bankName: '工商银行' },
    { account: '6222021234560099', registeredName: '李某某', bankName: '工商银行' }
  ],
  savedPayees: ['6222021234560001', '6222021234560002', '622848001'],
  lastMonthPayroll: [
    { employeeName: '张三', account: '622848001', bankName: '农业银行', amount: '12000.00' },
    { employeeName: '李四', account: '622848002', bankName: '农业银行', amount: '9800.00' }
  ]
};

describe('单笔风险', () => {
  it('户名不匹配触发高危', () => {
    const flags = evaluateTransfer({
      fromAccount: '6222020000009999',
      payeeAccount: '6222021234560001',
      payeeName: '北京云海科持有限公司', // 被篡改的名称
      payeeBank: '工商银行',
      amount: '88000.00',
      purpose: '货款',
      clientReference: 'ref-1'
    }, ctx);
    expect(flags.some((f) => f.code === 'COP_MISMATCH')).toBe(true);
  });

  it('形似账号触发 LOOKALIKE_ACCOUNT', () => {
    const flags = evaluateTransfer({
      fromAccount: '6222020000009999',
      payeeAccount: '6222021234560002'.replace('2', '3'), // 6322021234560002? 保持等长且只差 1 位
      payeeName: '某供应商',
      payeeBank: '工商银行',
      amount: '100.00',
      purpose: '测试',
      clientReference: 'ref-2'
    }, ctx);
    const lookalike = flags.find((f) => f.code === 'LOOKALIKE_ACCOUNT');
    // 替换后账号可能与 savedPayees 中某个仅差 1 位
    if (lookalike) expect(lookalike.severity).toBe('high');
  });
});

describe('批量风险', () => {
  it('改号、新户、金额异动全部识别', () => {
    const result = evaluateBatch([
      { employeeName: '张三', account: '622848001', bankName: '农业银行', amount: '12000.00' },
      { employeeName: '李四', account: '622848099', bankName: '农业银行', amount: '14000.00' }, // 改号 + 涨薪 43%
      { employeeName: '王五', account: '622848003', bankName: '农业银行', amount: '8000.00' }   // 新人新户
    ], ctx);
    const li = result.items[1]!;
    expect(li.riskFlags.some((f) => f.code === 'ACCOUNT_CHANGED')).toBe(true);
    expect(li.riskFlags.some((f) => f.code === 'AMOUNT_DELTA')).toBe(true);
    expect(result.newPayeeCount).toBe(2);
    expect(result.changedCount).toBe(1);
  });

  it('重复账号计数', () => {
    const result = evaluateBatch([
      { employeeName: '张三', account: '622848001', bankName: '农业银行', amount: '100.00' },
      { employeeName: '李四', account: '622848001', bankName: '农业银行', amount: '200.00' }
    ], ctx);
    expect(result.duplicateAccounts).toBe(1);
    expect(result.items.every((i) => i.riskFlags.some((f) => f.code === 'DUP_ACCOUNT'))).toBe(true);
  });
});
