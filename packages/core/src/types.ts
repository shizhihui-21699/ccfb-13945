/** 服务器与可信手机端之间的共享协议类型。 */

export type RiskSeverity = 'high' | 'medium' | 'low';

export interface PayeeInfo {
  account: string;
  accountName: string;
  bankName: string;
}

export interface TransferRequest {
  fromAccount: string;
  payeeAccount: string;
  payeeName: string;
  payeeBank: string;
  /** 字符串金额，两位小数，避免浮点误差。 */
  amount: string;
  purpose: string;
  clientReference: string;
}

export type CopStatus = 'matched' | 'mismatched' | 'unknown';

export interface RiskFlag {
  code: string;
  severity: RiskSeverity;
  message: string;
}

export type TxStatus = 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed';

export interface TransferTx extends PayeeInfo {
  id: string;
  type: 'single';
  fromAccount: string;
  amount: string;
  purpose: string;
  clientReference: string;
  createdAt: number;
  status: TxStatus;
  cop: CopStatus;
  copRegisteredName?: string;
  isNewPayee: boolean;
  riskFlags: RiskFlag[];
  /** 规范化交易体的哈希，签名即对它进行。 */
  txHash: string;
  /** 服务器对 txHash 的签名，手机端先验签再展示。 */
  serverSignature: string;
  /** 手机设备公钥确认后的签名。 */
  deviceSignature?: string;
  receipt?: Receipt;
}

export interface BatchItem {
  rowNo: number;
  employeeName: string;
  account: string;
  bankName: string;
  amount: string;
  cop: CopStatus;
  copRegisteredName?: string;
  riskFlags: RiskFlag[];
}

export interface BatchSummary {
  totalCount: number;
  totalAmount: string;
  highRiskCount: number;
  mediumRiskCount: number;
  newPayeeCount: number;
  changedCount: number;
  duplicateAccounts: number;
  totalDeltaVsLastMonth: string;
}

export type BatchStatus = 'pending' | 'confirmed' | 'rejected' | 'executed' | 'failed';

export interface BatchTx {
  id: string;
  type: 'batch';
  fromAccount: string;
  purpose: string;
  createdAt: number;
  status: BatchStatus;
  items: BatchItem[];
  summary: BatchSummary;
  merkleRoot: string;
  txHash: string;
  serverSignature: string;
  deviceSignature?: string;
  receipt?: Receipt;
}

export interface Receipt {
  txId: string;
  kind: 'single' | 'batch';
  executedAt: number;
  amount: string;
  payeeCount: number;
  status: 'executed';
  receiptHash: string;
  serverSignature: string;
}

/** 服务器推送事件（SSE）。 */
export type ServerEvent =
  | { kind: 'transfer-created'; tx: TransferTx }
  | { kind: 'transfer-updated'; tx: TransferTx }
  | { kind: 'batch-created'; batch: BatchTx }
  | { kind: 'batch-updated'; batch: BatchTx };

export interface DeviceEnrollment {
  deviceId: string;
  publicKey: string;
  label: string;
  enrolledAt: number;
}
