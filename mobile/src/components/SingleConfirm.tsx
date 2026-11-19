import { useState } from 'react';
import {
  groupAccount,
  rmbUpper,
  visualHash,
  verifySignature,
  type TransferTx
} from 'bank-core';
import { mobileApi } from '../security/api.js';
import { Identicon, RiskList, CopBadge } from './Shared.js';

interface Props {
  tx: TransferTx;
  serverPublicKey: string;
  onChanged: () => void;
}

export function SingleConfirm({ tx, serverPublicKey, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ackFields, setAckFields] = useState({ account: false, amount: false, name: false });
  const [typedTail, setTypedTail] = useState('');
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdTimer, setHoldTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const serverSigned = verifySignature(serverPublicKey, tx.txHash, tx.serverSignature);
  const hasHighRisk = tx.riskFlags.some((f) => f.severity === 'high');
  const allAck = ackFields.account && ackFields.amount && ackFields.name;
  const tailMatch = typedTail === tx.account.slice(-6);
  const canConfirm = serverSigned && tx.status === 'pending' && allAck && (!hasHighRisk || tailMatch);

  async function act(action: 'confirm' | 'reject') {
    setBusy(true);
    setError('');
    try {
      if (action === 'confirm') await mobileApi.confirmTransfer(tx.txHash, tx.id);
      else await mobileApi.rejectTransfer(tx.txHash, tx.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startHold() {
    if (!canConfirm || busy) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / 1200) * 100);
      setHoldProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        setHoldTimer(null);
        void act('confirm');
        setHoldProgress(0);
      }
    }, 40);
    setHoldTimer(timer);
  }
  function cancelHold() {
    if (holdTimer) clearInterval(holdTimer);
    setHoldTimer(null);
    setHoldProgress(0);
  }

  return (
    <div className="phone-screen">
      <div className="screen-head">
        <span className="screen-kicker">服务器真实交易记录 · 独立通道验签</span>
        <h2>单笔转账确认</h2>
        <div className="trust-line">
          {serverSigned ? <span className="trust-ok">🔐 服务器签名有效</span> : <span className="trust-bad">签名无效，禁止确认</span>}
          <span className="mono small muted">{tx.id}</span>
        </div>
      </div>

      <div className="payee-hero">
        <Identicon seed={tx.account} size={56} />
        <div>
          <div className="payee-name">{tx.accountName}</div>
          <div className="muted small">{tx.bankName}</div>
          {tx.isNewPayee && <span className="new-payee-tag">新收款人</span>}
        </div>
      </div>

      <CopBadge cop={tx.cop} registeredName={tx.copRegisteredName} />

      <div className="info-block">
        <div className="info-row">
          <span className="info-label">收款账号（逐位核对）</span>
          <button className="btn-mini" onClick={() => setAckFields((s) => ({ ...s, account: true }))}>
            {ackFields.account ? '✓ 已逐位核对' : '我已逐位核对'}
          </button>
        </div>
        <div className="account-big mono">{groupAccount(tx.account)}</div>
      </div>

      <div className="info-block">
        <div className="info-row">
          <span className="info-label">转账金额</span>
          <button className="btn-mini" onClick={() => setAckFields((s) => ({ ...s, amount: true }))}>
            {ackFields.amount ? '✓ 已核对' : '我已核对'}
          </button>
        </div>
        <div className="amount-big">¥ {tx.amount}</div>
        <div className="amount-upper">{rmbUpper(tx.amount)}</div>
      </div>

      <div className="info-block">
        <div className="info-row">
          <span className="info-label">收款户名</span>
          <button className="btn-mini" onClick={() => setAckFields((s) => ({ ...s, name: true }))}>
            {ackFields.name ? '✓ 已核对' : '我已核对'}
          </button>
        </div>
        <div className="name-line">{tx.accountName}</div>
      </div>

      <div className="info-block compact">
        <div className="info-row"><span className="info-label">付款账号</span><span className="mono small">{tx.fromAccount}</span></div>
        <div className="info-row"><span className="info-label">用途</span><span>{tx.purpose}</span></div>
        <div className="info-row"><span className="info-label">视觉哈希</span><span className="vhash">{visualHash(tx.txHash).join(' ')}</span></div>
      </div>

      <RiskList flags={tx.riskFlags} />

      {hasHighRisk && tx.status === 'pending' && (
        <div className="hard-gate">
          <div className="hard-gate-title">⛔ 高危交易二次核验</div>
          <p className="small muted">请手动输入收款账号 <b>最后 6 位</b>（{tx.account.slice(-6)}），证明你确实在看本屏幕：</p>
          <input
            inputMode="numeric"
            value={typedTail}
            onChange={(e) => setTypedTail(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="输入账号末 6 位"
            className="gate-input"
          />
          {typedTail.length === 6 && !tailMatch && <div className="gate-err">与服务器记录不一致，不能确认</div>}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {tx.status === 'pending' ? (
        <div className="action-area">
          <button className="btn-reject" disabled={busy} onClick={() => act('reject')}>拒绝交易</button>
          <button
            className={`btn-hold ${canConfirm ? '' : 'disabled'}`}
            disabled={!canConfirm || busy}
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
          >
            <span className="hold-fill" style={{ width: `${holdProgress}%` }} />
            <span className="hold-label">
              {!allAck ? '先完成上方三项核对' : hasHighRisk && !tailMatch ? '完成高危二次核验' : '长按 1.2 秒签名确认'}
            </span>
          </button>
        </div>
      ) : (
        <div className={`final-status ${tx.status}`}>
          {tx.status === 'executed' ? (
            <>
              <div className="final-title">✓ 已签名并执行</div>
              <p className="small">设备签名已提交服务器验签，回单哈希：<br /><span className="mono">{tx.receipt?.receiptHash}</span></p>
            </>
          ) : (
            <>
              <div className="final-title">✗ 已拒绝，资金未转出</div>
              <p className="small muted">拒绝记录已签名留痕，网页端任何"成功"提示均为伪造。</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
