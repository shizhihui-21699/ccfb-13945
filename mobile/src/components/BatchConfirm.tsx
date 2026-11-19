import { useMemo, useState } from 'react';
import {
  MerkleTree,
  rmbUpper,
  verifyMerkleProof,
  visualHash,
  verifySignature,
  type BatchTx
} from 'bank-core';
import { mobileApi } from '../security/api.js';
import { RiskList } from './Shared.js';

interface Props {
  batch: BatchTx;
  serverPublicKey: string;
  onChanged: () => void;
}

type Filter = 'risk' | 'all';

export function BatchConfirm({ batch, serverPublicKey, onChanged }: Props) {
  const [filter, setFilter] = useState<Filter>('risk');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [proofResult, setProofResult] = useState<Record<number, boolean>>({});
  const [ack, setAck] = useState({ summary: false, risks: false, merkle: false });
  const [typedTotal, setTypedTotal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const serverSigned = verifySignature(serverPublicKey, batch.txHash, batch.serverSignature);
  const hasHigh = batch.summary.highRiskCount > 0;

  // 手机端独立重算 Merkle 根，验证与服务器下发的根一致
  const localRoot = useMemo(() => {
    const tree = new MerkleTree(batch.items.map((i) => ({
      rowNo: i.rowNo,
      employeeName: i.employeeName,
      account: i.account,
      bankName: i.bankName,
      amount: i.amount
    })));
    return tree.root;
  }, [batch]);
  const rootMatches = localRoot === batch.merkleRoot;

  const riskItems = useMemo(() => batch.items.filter((i) => i.riskFlags.length > 0), [batch]);
  const shown = filter === 'risk' ? riskItems : batch.items;

  const totalTail = batch.summary.totalAmount.replace('.', '').slice(-6);
  const totalMatch = typedTotal === totalTail;
  const canConfirm =
    serverSigned && rootMatches && ack.summary && ack.risks && ack.merkle &&
    batch.status === 'pending' && (!hasHigh || totalMatch);

  async function verifyRow(rowNo: number) {
    const item = batch.items.find((i) => i.rowNo === rowNo);
    if (!item) return;
    try {
      const res = await fetch(`/api/mobile/batches/${batch.id}/proof/${rowNo}`);
      const proof = await res.json();
      const ok = verifyMerkleProof({
        rowNo: item.rowNo,
        employeeName: item.employeeName,
        account: item.account,
        bankName: item.bankName,
        amount: item.amount
      }, proof);
      setProofResult((p) => ({ ...p, [rowNo]: ok && proof.root === batch.merkleRoot }));
    } catch {
      setProofResult((p) => ({ ...p, [rowNo]: false }));
    }
  }

  async function act(action: 'confirm' | 'reject') {
    setBusy(true);
    setError('');
    try {
      if (action === 'confirm') await mobileApi.confirmBatch(batch.txHash, batch.id);
      else await mobileApi.rejectBatch(batch.txHash, batch.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone-screen">
      <div className="screen-head">
        <span className="screen-kicker">批量代发 · 服务器真实批次 · 独立验签</span>
        <h2>{batch.purpose}</h2>
        <div className="trust-line">
          {serverSigned ? <span className="trust-ok">🔐 服务器签名有效</span> : <span className="trust-bad">签名无效</span>}
          <span className="mono small muted">{batch.id}</span>
        </div>
      </div>

      {/* 第一层：人读摘要 */}
      <div className="review-block">
        <div className="review-block-head">
          <span>① 批次摘要（人读）</span>
          <button className="btn-mini" onClick={() => setAck((s) => ({ ...s, summary: true }))}>
            {ack.summary ? '✓ 已核对' : '我已核对'}
          </button>
        </div>
        <div className="human-summary">
          <div className="hs-line">
            本批次将从 <b className="mono">{batch.fromAccount}</b> 向
            <b> {batch.summary.totalCount} </b>名员工合计发放
            <b className="hs-amount"> ¥{batch.summary.totalAmount}</b>
          </div>
          <div className="hs-upper">{rmbUpper(batch.summary.totalAmount)}</div>
          <div className="hs-sub muted small">
            较上月合计变动：{batch.summary.totalDeltaVsLastMonth} 元 ·
            新账号 {batch.summary.newPayeeCount} 个 · 账号变动 {batch.summary.changedCount} 个 ·
            重复账号 {batch.summary.duplicateAccounts} 个
          </div>
        </div>
      </div>

      {/* 第二层：风险分层 */}
      <div className="review-block">
        <div className="review-block-head">
          <span>② 风险分层审阅（{riskItems.length} 行有风险标记，高风险 {batch.summary.highRiskCount} 行）</span>
          <button className="btn-mini" onClick={() => setAck((s) => ({ ...s, risks: true }))}>
            {ack.risks ? '✓ 已逐行审阅' : '我已逐行审阅'}
          </button>
        </div>
        <div className="filter-tabs">
          <button className={filter === 'risk' ? 'active' : ''} onClick={() => setFilter('risk')}>
            只看风险行（{riskItems.length}）
          </button>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            全部 {batch.items.length} 行
          </button>
        </div>
        <div className="row-list">
          {shown.map((item) => {
            const high = item.riskFlags.some((f) => f.severity === 'high');
            return (
              <div key={item.rowNo} className={`pay-row ${high ? 'high' : item.riskFlags.length ? 'med' : 'ok'}`}>
                <div className="pay-row-main" onClick={() => setExpandedRow(expandedRow === item.rowNo ? null : item.rowNo)}>
                  <span className="row-no">#{item.rowNo}</span>
                  <span className="row-name">{item.employeeName}</span>
                  <span className="row-amount">¥{item.amount}</span>
                  <span className="row-state">{item.riskFlags.length ? (high ? '⛔ 高风险' : '⚠ 留意') : '✓ 正常'}</span>
                </div>
                <div className="row-account mono small muted">{item.bankName} · {item.account}</div>
                {expandedRow === item.rowNo && (
                  <div className="row-detail">
                    {item.riskFlags.length === 0 ? (
                      <p className="small ok-text">自动风控未发现异常</p>
                    ) : (
                      <RiskList flags={item.riskFlags} />
                    )}
                    <button className="btn-mini" onClick={() => verifyRow(item.rowNo)}>
                      向服务器索取该行 Merkle 包含证明并验证
                    </button>
                    {proofResult[item.rowNo] !== undefined && (
                      <div className={proofResult[item.rowNo] ? 'proof-ok' : 'proof-bad'}>
                        {proofResult[item.rowNo]
                          ? '✓ 证明有效：该行确实包含在批次 Merkle 根内，且内容逐字段一致'
                          : '✗ 证明验证失败：该行不属于服务器承诺的批次'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 第三层：Merkle 承诺 */}
      <div className="review-block">
        <div className="review-block-head">
          <span>③ 完整性承诺（Merkle 根）</span>
          <button className="btn-mini" onClick={() => setAck((s) => ({ ...s, merkle: true }))}>
            {ack.merkle ? '✓ 已理解' : '我已理解'}
          </button>
        </div>
        <p className="small muted">
          手机端对全部 {batch.items.length} 行重新计算 Merkle 根，与服务器签名承诺的根比对。
          任意一行被增删改，根都会改变，签名立即失效——签名只覆盖这一个根，就等于覆盖了每一行。
        </p>
        <div className={`merkle-box ${rootMatches ? 'ok' : 'bad'}`}>
          <div>本地重算根：<span className="mono small">{localRoot.slice(0, 32)}…</span></div>
          <div>服务器承诺：<span className="mono small">{batch.merkleRoot.slice(0, 32)}…</span></div>
          <div className="merkle-verdict">
            {rootMatches ? '✓ 两根一致，批次内容完整' : '✗ 根不一致，禁止确认'}
          </div>
          <div className="vhash">{visualHash(batch.merkleRoot).join(' ')}</div>
        </div>
      </div>

      {hasHigh && batch.status === 'pending' && (
        <div className="hard-gate">
          <div className="hard-gate-title">⛔ 高风险批次二次核验</div>
          <p className="small muted">输入批次总金额的 <b>整数部分末 4 位 + 角分 2 位</b>（共 6 位数字，答案 {totalTail}）：</p>
          <input
            inputMode="numeric"
            className="gate-input"
            value={typedTotal}
            onChange={(e) => setTypedTotal(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 位数字"
          />
          {typedTotal.length === 6 && !totalMatch && <div className="gate-err">与服务器记录的总金额不一致</div>}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {batch.status === 'pending' ? (
        <div className="action-area">
          <button className="btn-reject" disabled={busy} onClick={() => act('reject')}>整批拒绝</button>
          <button className={`btn-confirm ${canConfirm ? '' : 'disabled'}`} disabled={!canConfirm || busy} onClick={() => act('confirm')}>
            签名确认整批 {batch.summary.totalCount} 笔
          </button>
        </div>
      ) : (
        <div className={`final-status ${batch.status}`}>
          {batch.status === 'executed' ? (
            <>
              <div className="final-title">✓ 批次已签名并执行</div>
              <p className="small">回单哈希：<span className="mono">{batch.receipt?.receiptHash}</span></p>
            </>
          ) : (
            <div className="final-title">✗ 批次已拒绝，{batch.summary.totalCount} 笔全部未执行</div>
          )}
        </div>
      )}
    </div>
  );
}
