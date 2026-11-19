import type { BatchItem, CopStatus, PayeeInfo, RiskFlag, TransferRequest } from './types.js';
import { yuanToCents, diffYuan } from './money.js';

export interface RegistryEntry {
  account: string;
  registeredName: string;
  bankName: string;
}

export interface LastMonthPayrollEntry {
  employeeName: string;
  account: string;
  bankName: string;
  amount: string;
}

export interface RiskContext {
  /** 账户名→账号登记簿（确认收款人 CoP）。 */
  registry: RegistryEntry[];
  /** 用户历史收款人账号集合。 */
  savedPayees: string[];
  /** 上月工资明细，用于差异分析。 */
  lastMonthPayroll: LastMonthPayrollEntry[];
}

export function checkCop(payeeAccount: string, claimedName: string, ctx: Pick<RiskContext, 'registry'>): {
  cop: CopStatus;
  registeredName?: string;
} {
  const entry = ctx.registry.find((e) => e.account === payeeAccount);
  if (!entry) return { cop: 'unknown' };
  return {
    cop: entry.registeredName === claimedName ? 'matched' : 'mismatched',
    registeredName: entry.registeredName
  };
}

/** 单笔转账风险评估（服务器端执行，手机端只展示服务器结论）。 */
export function evaluateTransfer(req: TransferRequest, ctx: RiskContext): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const { cop, registeredName } = checkCop(req.payeeAccount, req.payeeName, ctx);

  if (cop === 'mismatched') {
    flags.push({
      code: 'COP_MISMATCH',
      severity: 'high',
      message: `户名校验失败：该账号实名登记为「${registeredName}」，与填写的「${req.payeeName}」不一致`
    });
  }
  if (cop === 'unknown') {
    flags.push({ code: 'COP_UNKNOWN', severity: 'medium', message: '该账号无法进行户名校验，请务必逐位核对' });
  }
  if (!ctx.savedPayees.includes(req.payeeAccount)) {
    flags.push({ code: 'NEW_PAYEE', severity: 'high', message: '首次向该账号转账（新收款人）' });
  }
  if (yuanToCents(req.amount) >= 5000000) {
    flags.push({ code: 'LARGE_AMOUNT', severity: 'high', message: `大额转账：${req.amount} 元` });
  } else if (yuanToCents(req.amount) >= 500000) {
    flags.push({ code: 'BIG_AMOUNT', severity: 'medium', message: `金额较大：${req.amount} 元` });
  }

  // 形似账号检测：与任一已保存收款人的账号仅少数位不同。
  // 仅对非已保存账号生效——两个都已登记的常用收款人之间相似不构成掉包信号。
  if (!ctx.savedPayees.includes(req.payeeAccount)) {
    for (const saved of ctx.savedPayees) {
      if (saved.length !== req.payeeAccount.length) continue;
      let diffs = 0;
      for (let i = 0; i < saved.length; i++) if (saved[i] !== req.payeeAccount[i]) diffs++;
      if (diffs > 0 && diffs <= 2) {
        flags.push({
          code: 'LOOKALIKE_ACCOUNT',
          severity: 'high',
          message: `目标账号与常用收款人账号仅 ${diffs} 位不同，疑似被掉包`
        });
        break;
      }
    }
  }
  return flags;
}

export interface BatchRiskResult {
  items: BatchItem[];
  duplicateAccounts: number;
  newPayeeCount: number;
  changedCount: number;
}

/** 批量代发逐行风险评估。 */
export function evaluateBatch(
  rows: { employeeName: string; account: string; bankName: string; amount: string }[],
  ctx: RiskContext
): BatchRiskResult {
  const accountCount = new Map<string, number>();
  for (const r of rows) accountCount.set(r.account, (accountCount.get(r.account) ?? 0) + 1);
  const duplicateAccounts = [...accountCount.values()].filter((c) => c > 1).length;

  let newPayeeCount = 0;
  let changedCount = 0;

  const items: BatchItem[] = rows.map((r, idx) => {
    const flags: RiskFlag[] = [];
    const { cop, registeredName } = checkCop(r.account, r.employeeName, ctx);
    if (cop === 'mismatched') {
      flags.push({
        code: 'COP_MISMATCH',
        severity: 'high',
        message: `户名校验失败：账号实名登记为「${registeredName}」`
      });
    }
    const isNew = !ctx.savedPayees.includes(r.account);
    if (isNew) {
      newPayeeCount++;
      flags.push({ code: 'NEW_PAYEE', severity: 'high', message: '新账号（上月未出现）' });
    }
    if ((accountCount.get(r.account) ?? 0) > 1) {
      flags.push({ code: 'DUP_ACCOUNT', severity: 'high', message: '同一账号在本批次中出现多次' });
    }
    const last = ctx.lastMonthPayroll.find((p) => p.employeeName === r.employeeName);
    if (last) {
      if (last.account !== r.account) {
        changedCount++;
        flags.push({
          code: 'ACCOUNT_CHANGED',
          severity: 'high',
          message: `收款账号与上月不同（上月 ${last.account}）`
        });
      }
      const deltaPct = yuanToCents(last.amount) === 0 ? 0 :
        (yuanToCents(r.amount) - yuanToCents(last.amount)) / yuanToCents(last.amount);
      if (Math.abs(deltaPct) >= 0.1) {
        flags.push({
          code: 'AMOUNT_DELTA',
          severity: Math.abs(deltaPct) >= 0.3 ? 'high' : 'medium',
          message: `金额较上月变动 ${(deltaPct * 100).toFixed(1)}%（${describeDeltaShort(r.amount, last.amount)}）`
        });
      }
    } else {
      flags.push({ code: 'NEW_EMPLOYEE', severity: 'medium', message: '上月工资表中无此人' });
    }
    if (yuanToCents(r.amount) >= 500000) {
      flags.push({ code: 'BIG_AMOUNT', severity: 'medium', message: '单笔金额 ≥ 5 万' });
    }
    return {
      rowNo: idx + 1,
      employeeName: r.employeeName,
      account: r.account,
      bankName: r.bankName,
      amount: r.amount,
      cop,
      copRegisteredName: registeredName,
      riskFlags: flags
    };
  });

  return { items, duplicateAccounts, newPayeeCount, changedCount };
}

function describeDeltaShort(current: string, last: string): string {
  return diffYuan(current, last);
}

export function highestSeverity(flags: RiskFlag[]): 'high' | 'medium' | 'low' | 'none' {
  if (flags.some((f) => f.severity === 'high')) return 'high';
  if (flags.some((f) => f.severity === 'medium')) return 'medium';
  if (flags.length > 0) return 'low';
  return 'none';
}

export type { PayeeInfo };
