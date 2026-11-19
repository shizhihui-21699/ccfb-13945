import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { visualHash, type TransferTx } from 'bank-core';
import { api } from '../api.js';
import { getEnabledAttacks, logTrojanEvent } from '../trojan.js';
import { Identicon, StatusBadge, formatTime } from './Shared.js';

const FORM_DEFAULTS = {
  payeeAccount: '6222021234560001',
  payeeName: '北京云海科技有限公司',
  payeeBank: '工商银行北京分行',
  amount: '88000.00',
  purpose: '11 月货款'
};

export function SingleTransfer() {
  const [form, setForm] = useState(FORM_DEFAULTS);
  const [tx, setTx] = useState<TransferTx | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0);

  // 监听木马开关变化，重新渲染"被污染"的显示
  useEffect(() => {
    const refresh = () => setTick((v) => v + 1);
    window.addEventListener('trojan-config-changed', refresh);
    return () => window.removeEventListener('trojan-config-changed', refresh);
  }, []);

  const enabled = getEnabledAttacks();

  // ① 显示层掉包：页面回显的是"用户以为的"收款方，与服务器记录无关
  const displayPayee = useMemo(() => {
    if (tx && enabled.has('domSwap')) {
      return { account: FORM_DEFAULTS.payeeAccount, name: FORM_DEFAULTS.payeeName, bank: FORM_DEFAULTS.payeeBank };
    }
    return {
      account: tx?.account ?? form.payeeAccount,
      name: tx?.accountName ?? form.payeeName,
      bank: tx?.bankName ?? form.payeeBank
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, tick]);

  useEffect(() => {
    if (!tx) {
      setQrUrl('');
      return;
    }
    // ③ 二维码替换：木马把二维码载荷里的交易号换成攻击者构造的编号
    const refId = enabled.has('qrReplace') ? `FAKE${tx.id.slice(2)}` : tx.id;
    if (enabled.has('qrReplace')) {
      logTrojanEvent('qrReplace', `确认二维码已被替换，内嵌编号：${refId}（真实编号 ${tx.id}）`);
    }
    const payload = `bankconfirm://tx?ref=${refId}&h=${tx.txHash.slice(0, 12)}`;
    QRCode.toDataURL(payload, { width: 168, margin: 1 }).then(setQrUrl).catch(() => setQrUrl(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, tick]);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      const created = await api.createTransfer({
        fromAccount: '6222020000008888',
        ...form,
        clientReference: `WEB-${Date.now()}`
      });
      setTx(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshStatus() {
    if (!tx) return;
    const latest = await api.getTransfer(tx.id);
    setTx(latest);
  }

  const fakeSuccess = tx?.status === 'rejected' && enabled.has('fakeSuccess');

  return (
    <div className="two-col">
      <div className="card">
        <h2>单笔转账 <span className="tag tag-web">不可信电脑端</span></h2>
        <p className="muted">在中毒电脑上填写并提交。木马可在你看不见的地方修改任何内容。</p>
        <div className="form">
          <label>收款账号
            <input value={form.payeeAccount} onChange={(e) => setForm({ ...form, payeeAccount: e.target.value })} />
          </label>
          <label>收款户名
            <input value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} />
          </label>
          <label>开户行
            <input value={form.payeeBank} onChange={(e) => setForm({ ...form, payeeBank: e.target.value })} />
          </label>
          <label>转账金额（元）
            <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <label>用途
            <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary" disabled={submitting} onClick={submit}>
            {submitting ? '提交中…' : '提交转账（等待手机确认）'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>网页回显 <span className="tag tag-trojan" hidden={!enabled.has('domSwap')}>☠ 显示可能造假</span></h2>
        {!tx ? (
          <p className="muted">提交后在这里显示网页认为的交易信息——记住：这台电脑上的一切都可能是假的。</p>
        ) : (
          <div className="tx-review">
            <div className="tx-head">
              <Identicon seed={displayPayee.account} />
              <div>
                <div className="big-name">{displayPayee.name}</div>
                <div className="muted">{displayPayee.bank}</div>
              </div>
            </div>
            <dl className="kv">
              <dt>收款账号</dt><dd className="account-text">{displayPayee.account}</dd>
              <dt>转账金额</dt><dd className="amount-text">{form.amount} 元</dd>
              <dt>用途</dt><dd>{form.purpose}</dd>
              <dt>交易编号</dt><dd className="mono">{tx.id}</dd>
              <dt>视觉哈希</dt><dd className="vhash">{visualHash(tx.txHash).join(' · ')}</dd>
            </dl>
            <div className="qr-row">
              {qrUrl && <img src={qrUrl} alt="确认二维码" className="qr" />}
              <div className="qr-note">
                <p>打开手机银行 App 扫码，或在手机端待确认列表中查看本笔交易。</p>
                <p className="muted small">真正的收款方以手机端独立拉取并验签的数据为准。</p>
              </div>
            </div>
            <div className="status-row">
              <StatusBadge status={fakeSuccess ? 'executed' : tx.status} />
              <span className="muted small">更新于 {formatTime(Date.now())}</span>
              <button className="btn-mini" onClick={refreshStatus}>刷新状态</button>
            </div>
            {fakeSuccess && (
              <div className="fake-receipt">
                <div className="fake-stamp">转账成功</div>
                <p>电子回单编号：{tx.id}-RC</p>
                <p className="muted small">☠ 这是木马伪造的成功页。服务器真实状态为「已拒绝」，资金并未转出。</p>
              </div>
            )}
            {tx.status === 'rejected' && !fakeSuccess && (
              <div className="alert-banner bad">手机端已拒绝该交易，服务器未执行任何资金划转。</div>
            )}
            {tx.status === 'executed' && (
              <div className="alert-banner ok">交易已按手机端确认的内容执行，回单哈希：{tx.receipt?.receiptHash.slice(0, 16)}…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
