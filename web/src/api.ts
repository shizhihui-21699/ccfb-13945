import type { BatchTx, ServerEvent, TransferTx } from 'bank-core';

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

export const api = {
  createTransfer: (body: unknown) => jsonFetch<TransferTx>('/api/transfers', { method: 'POST', body: JSON.stringify(body) }),
  createBatch: (body: unknown) => jsonFetch<BatchTx>('/api/batches', { method: 'POST', body: JSON.stringify(body) }),
  listTransactions: () => jsonFetch<{ transfers: TransferTx[]; batches: BatchTx[]; order: { kind: string; id: string }[] }>('/api/transactions'),
  getTransfer: (id: string) => jsonFetch<TransferTx>(`/api/transfers/${id}`),
  getBatch: (id: string) => jsonFetch<BatchTx>(`/api/batches/${id}`),
  payrollTemplate: () => jsonFetch<{ rows: Array<{ employeeName: string; account: string; bankName: string; amount: string }> }>('/api/payroll-template'),
  reset: () => jsonFetch<{ ok: boolean }>('/api/demo/reset', { method: 'POST' })
};

/** 订阅服务器 SSE，返回取消函数。 */
export function subscribeEvents(handler: (event: ServerEvent) => void): () => void {
  const es = new EventSource('/api/events');
  const kinds = ['transfer-created', 'transfer-updated', 'batch-created', 'batch-updated'] as const;
  for (const kind of kinds) {
    es.addEventListener(kind, (e: MessageEvent) => handler(JSON.parse(e.data) as ServerEvent));
  }
  return () => es.close();
}
