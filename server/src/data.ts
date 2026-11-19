import type { LastMonthPayrollEntry, RegistryEntry } from 'bank-core';

const SURNAMES = ['张', '李', '王', '赵', '陈', '刘', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡'];
const GIVEN_PARTS = ['伟', '芳', '娜', '敏', '静', '磊', '军', '洋'];
const BANKS = ['农业银行', '建设银行', '工商银行', '中国银行', '招商银行'];

export interface PayrollRow {
  employeeName: string;
  account: string;
  bankName: string;
  amount: string;
}

/** 确定性生成 120 人工资模板（姓名、账号均唯一，与"上月发放记录"一致）。 */
export const PAYROLL_TEMPLATE: PayrollRow[] = Array.from({ length: 120 }, (_, i) => {
  // 15 姓 × 8 名 = 120 个唯一姓名
  const name = SURNAMES[i % SURNAMES.length]! + GIVEN_PARTS[Math.floor(i / SURNAMES.length) % GIVEN_PARTS.length]!;
  const account = `622848${String(100001 + i).padStart(10, '0')}`;
  const base = 8000 + (i % 12) * 750 + (i % 3) * 137;
  const amount = `${base}.00`;
  return { employeeName: name, account, bankName: BANKS[i % BANKS.length]!, amount };
});

export const LAST_MONTH_PAYROLL: LastMonthPayrollEntry[] = PAYROLL_TEMPLATE.map((p) => ({ ...p }));

/** 全行账户实名登记簿（模拟银联/银行核心的 CoP 数据源）。 */
export const REGISTRY: RegistryEntry[] = [
  { account: '6222021234560001', registeredName: '北京云海科技有限公司', bankName: '工商银行北京分行' },
  { account: '6222021234560002', registeredName: '上海澄明贸易有限公司', bankName: '工商银行上海分行' },
  // 木马控制的两类攻击账号
  { account: '6222021234560099', registeredName: '陈志强', bankName: '建设银行深圳分行' },
  { account: '6222021234560098', registeredName: '北京云海科技有限责任公司', bankName: '民生银行北京分行' },
  ...PAYROLL_TEMPLATE.map((p) => ({
    account: p.account,
    registeredName: p.employeeName,
    bankName: p.bankName
  }))
];

/** 用户历史收款人：全部工资账号 + 两个常用对公收款方。 */
export const SAVED_PAYEES: string[] = [
  '6222021234560001',
  '6222021234560002',
  ...PAYROLL_TEMPLATE.map((p) => p.account)
];

export const COMPANY_ACCOUNT = '6222020000008888';
