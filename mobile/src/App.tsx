import { useEffect, useMemo, useState } from 'react';
import { verifySignature, type BatchTx, type TransferTx } from 'bank-core';
import { bootstrap, mobileApi, subscribeMobileEvents, type TrustState } from './security/api.js';
import { getDevicePublicKey, getDeviceId } from './security/keystore.js';
import { SingleConfirm } from './components/SingleConfirm.js';
import { BatchConfirm } from './components/BatchConfirm.js';
import { Identicon } from './components/Shared.js';

interface Data {
  transfers: TransferTx[];
  batches: BatchTx[];
  order: { kind: string; id: string }[];
}

type Selection = { kind: 'single' | 'batch'; id: string } | null;

export function App() {
  const [trust, setTrust] = useState<TrustState | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [data, setData] = useState<Data>({ transfers: [], batches: [], order: [] });
  const [selection, setSelection] = useState<Selection>(null);
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    bootstrap()
      .then((t) => {
        setTrust(t);
        return mobileApi.enroll(getDevicePublicKey(), '演示手机 · iPhone 安全区模拟');
      })
      .then(() => setEnrolled(true))
      .catch((e) => setBootError((e as Error).message));
  }, []);

  const reload = () => mobileApi.list().then(setData).catch(() => undefined);

  useEffect(() => {
    reload();
    const unsub = subscribeMobileEvents(() => reload());
    const t = setInterval(reload, 5000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, []);

  const transferMap = useMemo(() => new Map(data.transfers.map((t) => [t.id, t])), [data.transfers]);
  const batchMap = useMemo(() => new Map(data.batches.map((b) => [b.id, b])), [data.batches]);

  const pendingCount =
    data.transfers.filter((t) => t.status === 'pending').length +
    data.batches.filter((b) => b.status === 'pending').length;

  const selectedTx = selection?.kind === 'single' ? transferMap.get(selection.id) : undefined;
  const selectedBatch = selection?.kind === 'batch' ? batchMap.get(selection.id) : undefined;

  return (
    <div className="stage">
      <div className="phone">
        <div className="phone-notch" />
        <header className="phone-header">
          <div className="app-title">
            <span className="app-mark">安信</span>
            <div>
              <strong>手机银行 · 交易确认</strong>
              <div className="small muted">可信设备（独立通道 + 设备密钥）</div>
            </div>
          </div>
          {pendingCount > 0 && <span className="pending-pill">{pendingCount} 笔待确认</span>}
        </header>

        <div className="phone-body">
          {bootError && <div className="error-banner">引导失败：{bootError}</div>}
          {!trust ? (
            <div className="booting">正在建立独立安全通道…</div>
          ) : (
            <>
              <div className="trust-banner">
                <span className={trust.verified ? 'trust-ok' : 'trust-bad'}>
                  {trust.verified ? '🔐' : '⚠'} {trust.serviceName}
                </span>
                <span className="small muted mono">设备 {getDeviceId().slice(0, 14)}…</span>
                <span className={`enroll-tag ${enrolled ? 'on' : ''}`}>
                  {enrolled ? '设备密钥已注册' : '注册中…'}
                </span>
              </div>

              {selectedTx && trust.serverPublicKey && (
                <button className="back-link" onClick={() => setSelection(null)}>← 返回待确认列表</button>
              )}
              {selectedBatch && trust.serverPublicKey && (
                <button className="back-link" onClick={() => setSelection(null)}>← 返回待确认列表</button>
              )}

              {selectedTx && trust.serverPublicKey ? (
                <SingleConfirm tx={selectedTx} serverPublicKey={trust.serverPublicKey} onChanged={reload} />
              ) : selectedBatch && trust.serverPublicKey ? (
                <BatchConfirm batch={selectedBatch} serverPublicKey={trust.serverPublicKey} onChanged={reload} />
              ) : (
                <div className="tx-list">
                  <h3>待办与历史</h3>
                  {data.order.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-icon">📭</div>
                      <p>暂无交易。请在电脑端网银发起一笔转账或批量代发。</p>
                      <p className="small muted">电脑端显示什么都不重要——这里展示的是服务器记录的真实内容。</p>
                    </div>
                  )}
                  {[...data.order].reverse().map(({ kind, id }) =>
                    kind === 'single' ? (
                      <TransferRow key={id} tx={transferMap.get(id)!} serverPublicKey={trust.serverPublicKey!} onClick={() => setSelection({ kind: 'single', id })} />
                    ) : (
                      <BatchRow key={id} batch={batchMap.get(id)!} serverPublicKey={trust.serverPublicKey!} onClick={() => setSelection({ kind: 'batch', id })} />
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="stage-hint">
        这台手机是系统的信任锚点：数据经独立通道从银行服务器直取，每条记录先验服务器签名再展示；
        确认动作由设备密钥签名，服务器验签通过后才划转资金。
      </div>
    </div>
  );
}

function TransferRow({ tx, serverPublicKey, onClick }: { tx: TransferTx; serverPublicKey: string; onClick: () => void }) {
  const signed = verifySignature(serverPublicKey, tx.txHash, tx.serverSignature);
  const high = tx.riskFlags.some((f) => f.severity === 'high');
  return (
    <button className={`tx-card ${tx.status} ${high && tx.status === 'pending' ? 'has-high' : ''}`} onClick={onClick}>
      <Identicon seed={tx.account} size={40} />
      <div className="tx-card-body">
        <div className="tx-card-top">
          <strong>{tx.accountName}</strong>
          <span className="tx-amount">¥{tx.amount}</span>
        </div>
        <div className="tx-card-sub small muted mono">{tx.account}</div>
        <div className="tx-card-tags">
          <span className="kind-tag">单笔</span>
          {tx.isNewPayee && <span className="chip-warn">新收款人</span>}
          {high && <span className="chip-danger">高危 {tx.riskFlags.length}</span>}
          {!signed && <span className="chip-danger">验签失败</span>}
          <StatusText status={tx.status} />
        </div>
      </div>
    </button>
  );
}

function BatchRow({ batch, serverPublicKey, onClick }: { batch: BatchTx; serverPublicKey: string; onClick: () => void }) {
  const signed = verifySignature(serverPublicKey, batch.txHash, batch.serverSignature);
  return (
    <button className={`tx-card ${batch.status} ${batch.summary.highRiskCount > 0 && batch.status === 'pending' ? 'has-high' : ''}`} onClick={onClick}>
      <div className="batch-icon">📊</div>
      <div className="tx-card-body">
        <div className="tx-card-top">
          <strong>{batch.purpose}</strong>
          <span className="tx-amount">¥{batch.summary.totalAmount}</span>
        </div>
        <div className="tx-card-sub small muted">{batch.summary.totalCount} 笔 · 高风险 {batch.summary.highRiskCount} 行</div>
        <div className="tx-card-tags">
          <span className="kind-tag">批量</span>
          {batch.summary.highRiskCount > 0 && <span className="chip-danger">高危 {batch.summary.highRiskCount}</span>}
          {!signed && <span className="chip-danger">验签失败</span>}
          <StatusText status={batch.status} />
        </div>
      </div>
    </button>
  );
}

function StatusText({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    pending: { text: '待确认', cls: 'st-pending' },
    executed: { text: '已执行', cls: 'st-ok' },
    rejected: { text: '已拒绝', cls: 'st-bad' }
  };
  const m = map[status] ?? { text: status, cls: 'st-pending' };
  return <span className={`status-chip ${m.cls}`}>{m.text}</span>;
}
