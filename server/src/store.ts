import {
  canonicalJSON,
  digest,
  generateKeyPair,
  signMessage,
  verifySignature,
  MerkleTree,
  evaluateTransfer,
  evaluateBatch,
  sumYuan,
  yuanToCents,
  centsToYuan,
  type BatchItem,
  type BatchSummary,
  type BatchTx,
  type DeviceEnrollment,
  type Receipt,
  type RiskContext,
  type TransferRequest,
  type TransferTx
} from 'bank-core';
import { COMPANY_ACCOUNT, LAST_MONTH_PAYROLL, REGISTRY, SAVED_PAYEES } from './data.js';
import { eventBus } from './sse.js';

/** 服务器签名密钥（演示用；真实环境存 HSM/KMS）。手机端内置对应公钥做验签。 */
export const SERVER_KEY = generateKeyPair();

const riskContext: RiskContext = {
  registry: REGISTRY,
  savedPayees: SAVED_PAYEES,
  lastMonthPayroll: LAST_MONTH_PAYROLL
};

interface State {
  transfers: Map<string, TransferTx>;
  batches: Map<string, BatchTx>;
  order: { kind: 'single' | 'batch'; id: string }[];
  devices: Map<string, DeviceEnrollment>;
  seq: number;
}

const state: State = {
  transfers: new Map(),
  batches: new Map(),
  order: [],
  devices: new Map(),
  seq: 0
};

function nextId(prefix: string): string {
  state.seq += 1;
  return `${prefix}${String(state.seq).padStart(6, '0')}`;
}

/** 手机端签名的消息文本：域分隔前缀防止跨类型/跨环境重放。 */
export function singleSignMessage(txHash: string): string {
  return `BANK-CONFIRM:v1:single:${txHash}`;
}
export function batchSignMessage(txHash: string): string {
  return `BANK-CONFIRM:v1:batch:${txHash}`;
}
export function rejectSignMessage(kind: 'single' | 'batch', txHash: string): string {
  return `BANK-REJECT:v1:${kind}:${txHash}`;
}

function makeReceipt(kind: 'single' | 'batch', id: string, amount: string, payeeCount: number): Receipt {
  const receiptHash = digest({ kind, id, amount, payeeCount, at: 'executed' });
  return {
    txId: id,
    kind,
    executedAt: Date.now(),
    amount,
    payeeCount,
    status: 'executed',
    receiptHash,
    serverSignature: signMessage(SERVER_KEY.privateKey, receiptHash)
  };
}

/* ----------------------------- 单笔转账 ----------------------------- */

export function createTransfer(req: TransferRequest): TransferTx {
  const id = nextId('TX');
  const riskFlags = evaluateTransfer(req, riskContext);
  const copEntry = REGISTRY.find((e) => e.account === req.payeeAccount);
  const cop = copEntry ? (copEntry.registeredName === req.payeeName ? 'matched' : 'mismatched') : 'unknown';
  const isNewPayee = !SAVED_PAYEES.includes(req.payeeAccount);

  const body = {
    id,
    type: 'single' as const,
    fromAccount: req.fromAccount || COMPANY_ACCOUNT,
    payee: {
      account: req.payeeAccount,
      accountName: req.payeeName,
      bankName: req.payeeBank
    },
    amount: req.amount,
    purpose: req.purpose,
    clientReference: req.clientReference
  };
  const txHash = digest(body);

  const tx: TransferTx = {
    id,
    type: 'single',
    fromAccount: body.fromAccount,
    account: req.payeeAccount,
    accountName: req.payeeName,
    bankName: req.payeeBank,
    amount: req.amount,
    purpose: req.purpose,
    clientReference: req.clientReference,
    createdAt: Date.now(),
    status: 'pending',
    cop,
    copRegisteredName: copEntry?.registeredName,
    isNewPayee,
    riskFlags,
    txHash,
    serverSignature: signMessage(SERVER_KEY.privateKey, txHash)
  };
  state.transfers.set(id, tx);
  state.order.push({ kind: 'single', id });
  eventBus.emit({ kind: 'transfer-created', tx: structuredClone(tx) });
  return structuredClone(tx);
}

/* ----------------------------- 批量代发 ----------------------------- */

export interface BatchCreateRequest {
  fromAccount?: string;
  purpose: string;
  rows: { employeeName: string; account: string; bankName: string; amount: string }[];
}

export function createBatch(req: BatchCreateRequest): BatchTx {
  const id = nextId('BT');
  const { items, duplicateAccounts, newPayeeCount, changedCount } = evaluateBatch(req.rows, riskContext);

  const totalAmount = sumYuan(items.map((i) => i.amount));
  const highRiskCount = items.filter((i) => i.riskFlags.some((f) => f.severity === 'high')).length;
  const mediumRiskCount = items.filter(
    (i) => !i.riskFlags.some((f) => f.severity === 'high') && i.riskFlags.some((f) => f.severity === 'medium')
  ).length;

  const lastMonthMatched = req.rows
    .map((r) => LAST_MONTH_PAYROLL.find((p) => p.employeeName === r.employeeName))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => p.amount);
  const lastMonthTotal = lastMonthMatched.length > 0 ? sumYuan(lastMonthMatched) : '0.00';
  const totalDeltaVsLastMonth = centsToYuan(yuanToCents(totalAmount) - yuanToCents(lastMonthTotal));

  const summary: BatchSummary = {
    totalCount: items.length,
    totalAmount,
    highRiskCount,
    mediumRiskCount,
    newPayeeCount,
    changedCount,
    duplicateAccounts,
    totalDeltaVsLastMonth
  };

  const tree = new MerkleTree(items.map(leafItemForHash));
  const merkleRoot = tree.root;
  const body = {
    id,
    type: 'batch' as const,
    fromAccount: req.fromAccount || COMPANY_ACCOUNT,
    purpose: req.purpose,
    itemCount: items.length,
    totalAmount,
    merkleRoot
  };
  const txHash = digest(body);

  const batch: BatchTx = {
    id,
    type: 'batch',
    fromAccount: body.fromAccount,
    purpose: req.purpose,
    createdAt: Date.now(),
    status: 'pending',
    items,
    summary,
    merkleRoot,
    txHash,
    serverSignature: signMessage(SERVER_KEY.privateKey, txHash)
  };
  state.batches.set(id, batch);
  state.order.push({ kind: 'batch', id });
  eventBus.emit({ kind: 'batch-created', batch: structuredClone(batch) });
  return structuredClone(batch);
}

/** 叶子哈希载荷（与手机端核对单笔明细时使用的规范化结构一致）。 */
export function leafItemForHash(item: BatchItem) {
  return {
    rowNo: item.rowNo,
    employeeName: item.employeeName,
    account: item.account,
    bankName: item.bankName,
    amount: item.amount
  };
}

export function getMerkleProof(batchId: string, rowNo: number) {
  const batch = state.batches.get(batchId);
  if (!batch) throw new Error('批次不存在');
  const tree = new MerkleTree(batch.items.map(leafItemForHash));
  const index = batch.items.findIndex((i) => i.rowNo === rowNo);
  if (index < 0) throw new Error('行号不存在');
  return tree.proofFor(index);
}

/* --------------------------- 手机端确认/拒绝 --------------------------- */

function findDevice(deviceId: string): DeviceEnrollment {
  const device = state.devices.get(deviceId);
  if (!device) throw new Error('设备未注册');
  return device;
}

export function confirmTransfer(deviceId: string, txId: string, signature: string): TransferTx {
  const device = findDevice(deviceId);
  const tx = state.transfers.get(txId);
  if (!tx) throw new Error('交易不存在');
  if (tx.status !== 'pending') throw new Error(`交易已处于 ${tx.status} 状态，不能重复确认`);
  const message = singleSignMessage(tx.txHash);
  if (!verifySignature(device.publicKey, message, signature)) throw new Error('设备签名验证失败');

  // 安全断言：服务器再次校验自己的记录未被内部流程改动
  if (!verifySignature(SERVER_KEY.publicKey, tx.txHash, tx.serverSignature)) {
    throw new Error('服务器记录完整性异常');
  }

  tx.deviceSignature = signature;
  tx.status = 'executed';
  tx.receipt = makeReceipt('single', tx.id, tx.amount, 1);
  state.transfers.set(txId, tx);
  eventBus.emit({ kind: 'transfer-updated', tx: structuredClone(tx) });
  return structuredClone(tx);
}

export function rejectTransfer(deviceId: string, txId: string, signature: string): TransferTx {
  const device = findDevice(deviceId);
  const tx = state.transfers.get(txId);
  if (!tx) throw new Error('交易不存在');
  if (tx.status !== 'pending') throw new Error('交易已终结');
  if (!verifySignature(device.publicKey, rejectSignMessage('single', tx.txHash), signature)) {
    throw new Error('设备签名验证失败');
  }
  tx.status = 'rejected';
  state.transfers.set(txId, tx);
  eventBus.emit({ kind: 'transfer-updated', tx: structuredClone(tx) });
  return structuredClone(tx);
}

export function confirmBatch(deviceId: string, batchId: string, signature: string): BatchTx {
  const device = findDevice(deviceId);
  const batch = state.batches.get(batchId);
  if (!batch) throw new Error('批次不存在');
  if (batch.status !== 'pending') throw new Error(`批次已处于 ${batch.status} 状态`);
  if (!verifySignature(device.publicKey, batchSignMessage(batch.txHash), signature)) {
    throw new Error('设备签名验证失败');
  }
  batch.deviceSignature = signature;
  batch.status = 'executed';
  batch.receipt = makeReceipt('batch', batch.id, batch.summary.totalAmount, batch.summary.totalCount);
  state.batches.set(batchId, batch);
  eventBus.emit({ kind: 'batch-updated', batch: structuredClone(batch) });
  return structuredClone(batch);
}

export function rejectBatch(deviceId: string, batchId: string, signature: string): BatchTx {
  const device = findDevice(deviceId);
  const batch = state.batches.get(batchId);
  if (!batch) throw new Error('批次不存在');
  if (batch.status !== 'pending') throw new Error('批次已终结');
  if (!verifySignature(device.publicKey, rejectSignMessage('batch', batch.txHash), signature)) {
    throw new Error('设备签名验证失败');
  }
  batch.status = 'rejected';
  state.batches.set(batchId, batch);
  eventBus.emit({ kind: 'batch-updated', batch: structuredClone(batch) });
  return structuredClone(batch);
}

/* ------------------------------- 设备注册 ------------------------------- */

export function enrollDevice(input: { deviceId: string; publicKey: string; label: string }): DeviceEnrollment {
  const device: DeviceEnrollment = { ...input, enrolledAt: Date.now() };
  state.devices.set(input.deviceId, device);
  return structuredClone(device);
}

/* -------------------------------- 查询 -------------------------------- */

export function listAll() {
  const transfers = [...state.transfers.values()].map((t) => structuredClone(t));
  const batches = [...state.batches.values()].map((b) => structuredClone(b));
  return { transfers, batches, order: [...state.order] };
}

export function getTransfer(id: string) {
  const tx = state.transfers.get(id);
  return tx ? structuredClone(tx) : null;
}

export function getBatch(id: string) {
  const batch = state.batches.get(id);
  return batch ? structuredClone(batch) : null;
}

/** 演示重置：清空所有交易（保留设备注册）。 */
export function resetAll() {
  state.transfers.clear();
  state.batches.clear();
  state.order.length = 0;
  state.seq = 0;
}

export { canonicalJSON };
