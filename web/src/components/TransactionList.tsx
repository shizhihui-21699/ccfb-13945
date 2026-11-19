import { useEffect, useState } from 'react';
import type { BatchTx, TransferTx } from 'bank-core';
import { api, subscribeEvents } from '../api.js';
import { getEnabledAttacks } from '../trojan.js';
import { StatusBadge, formatTime } from './Shared.js';

interface ListData {
  transfers: TransferTx[];
  batches: BatchTx[];
  order: { kind: string; id: string }[];
}

export function TransactionList() {
  const [data, setData] = useState<ListData | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const reload = () => api.listTransactions().then(setData);
    reload();
    const unsub = subscribeEvents(() => reload());
    const onTrojan = () => setTick((v) => v + 1);
    window.addEventListener('trojan-config-changed', onTrojan);
    return () => {
      unsub();
      window.removeEventListener('trojan-config-changed', onTrojan);
    };
  }, []);

  if (!data) return <div className="card">加载中…</div>;

  const transferMap = new Map(data.transfers.map((t) => [t.id, t]));
  const batchMap = new Map(data.batches.map((b) => [b.id, b]));
  const fakeSuccessOn = getEnabledAttacks().has('fakeSuccess');

  return (
    <div className="card">
      <h2>交易流水（网页视角）</h2>
      {data.order.length === 0 && <p className="muted">还没有交易。先在左侧发起一笔转账或代发。</p>}
      <table className="data-table">
        <thead>
          <tr><th>编号</th><th>类型</th><th>关键信息</th><th>金额</th><th>时间</th><th>状态</th></tr>
        </thead>
        <tbody>
          {[...data.order].reverse().map(({ kind, id }) => {
            if (kind === 'single') {
              const t = transferMap.get(id);
              if (!t) return null;
              const faked = fakeSuccessOn && t.status === 'rejected';
              return (
                <tr key={id}>
                  <td className="mono">{t.id}</td>
                  <td>单笔</td>
                  <td>{t.accountName}<br /><span className="mono small muted">{t.account}</span></td>
                  <td>{t.amount}</td>
                  <td className="small">{formatTime(t.createdAt)}</td>
                  <td>
                    <StatusBadge status={faked ? 'executed' : t.status} />
                    {faked && <div className="small trojan-warn">☠ 伪造状态</div>}
                  </td>
                </tr>
              );
            }
            const b = batchMap.get(id);
            if (!b) return null;
            return (
              <tr key={id}>
                <td className="mono">{b.id}</td>
                <td>批量</td>
                <td>{b.purpose}<br /><span className="small muted">{b.summary.totalCount} 笔</span></td>
                <td>{b.summary.totalAmount}</td>
                <td className="small">{formatTime(b.createdAt)}</td>
                <td><StatusBadge status={b.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
