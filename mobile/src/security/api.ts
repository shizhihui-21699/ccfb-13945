import { verifySignature, type BatchTx, type ServerEvent, type TransferTx } from 'bank-core';
import { getDeviceId, signWithDeviceKey } from './keystore.js';

export interface TrustState {
  serverPublicKey: string | null;
  serviceName: string;
  verified: boolean;
}

async function jsonFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? '请求失败');
  }
  return res.json() as Promise<T>;
}

/** 独立通道引导：拉取并信任服务器公钥（真机通过证书绑定 + 预置公钥实现）。 */
export async function bootstrap(): Promise<TrustState> {
  const info = await jsonFetch<{ serviceName: string; serverPublicKey: string }>('/api/bootstrap');
  return {
    serverPublicKey: info.serverPublicKey,
    serviceName: info.serviceName,
    verified: Boolean(info.serverPublicKey)
  };
}

export function assertServerSigned(tx: { txHash: string; serverSignature: string }, serverPublicKey: string): void {
  if (!verifySignature(serverPublicKey, tx.txHash, tx.serverSignature)) {
    // 真机上这里应直接阻断 UI 并上报告警
    throw new Error('服务器签名验证失败：数据可能被中间人篡改，已停止展示');
  }
}

export const mobileApi = {
  enroll: (publicKey: string, label: string) =>
    jsonFetch('/api/devices/enroll', {
      method: 'POST',
      body: JSON.stringify({ deviceId: getDeviceId(), publicKey, label })
    }),

  list: () =>
    jsonFetch<{ transfers: TransferTx[]; batches: BatchTx[]; order: { kind: string; id: string }[] }>('/api/transactions'),

  getTransfer: (id: string) => jsonFetch<TransferTx>(`/api/transfers/${id}`),
  getBatch: (id: string) => jsonFetch<BatchTx>(`/api/batches/${id}`),

  confirmTransfer: (txHash: string, id: string) =>
    jsonFetch<TransferTx>(`/api/mobile/transfers/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getDeviceId(),
        signature: signWithDeviceKey(`BANK-CONFIRM:v1:single:${txHash}`)
      })
    }),

  rejectTransfer: (txHash: string, id: string) =>
    jsonFetch<TransferTx>(`/api/mobile/transfers/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getDeviceId(),
        signature: signWithDeviceKey(`BANK-REJECT:v1:single:${txHash}`)
      })
    }),

  confirmBatch: (txHash: string, id: string) =>
    jsonFetch<BatchTx>(`/api/mobile/batches/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getDeviceId(),
        signature: signWithDeviceKey(`BANK-CONFIRM:v1:batch:${txHash}`)
      })
    }),

  rejectBatch: (txHash: string, id: string) =>
    jsonFetch<BatchTx>(`/api/mobile/batches/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({
        deviceId: getDeviceId(),
        signature: signWithDeviceKey(`BANK-REJECT:v1:batch:${txHash}`)
      })
    })
};

export function subscribeMobileEvents(handler: (event: ServerEvent) => void): () => void {
  const es = new EventSource('/api/events');
  const kinds = ['transfer-created', 'transfer-updated', 'batch-created', 'batch-updated'] as const;
  for (const kind of kinds) {
    es.addEventListener(kind, (e: MessageEvent) => handler(JSON.parse(e.data) as ServerEvent));
  }
  return () => es.close();
}
