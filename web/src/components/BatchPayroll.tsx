import { useEffect, useMemo, useState } from 'react';
import type { BatchTx } from 'bank-core';
import { api } from '../api.js';
import { StatusBadge, formatTime } from './Shared.js';

type Row = { employeeName: string; account: string; bankName: string; amount: string };

export function BatchPayroll() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState<BatchTx | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'risk' | 'high'>('all');

  useEffect(() => {
    api.payrollTemplate().then((d) => {
      setRows(d.rows);
      setLoading(false);
    });
  }, []);

  const visibleItems = useMemo(() => {
    if (!batch) return [];
    if (filter === 'risk') return batch.items.filter((i) => i.riskFlags.length > 0);
    if (filter === 'high') return batch.items.filter((i) => i.riskFlags.some((f) => f.severity === 'high'));
    return batch.items;
  }, [batch, filter]);

  async function submit() {
    setSubmitting(true);
    try {
      const created = await api.createBatch({
        fromAccount: '6222020000008888',
        purpose: '11 月员工工资代发',
        rows
      });
      setBatch(created);
    } finally {
      setSubmitting(false);
    }
  }

  async function refresh() {
    if (!batch) return;
    setBatch(await api.getBatch(batch.id));
  }

  if (loading) return <div className="card">加载工资模板中…</div>;

  return (
    <div className="card">
      <h2>批量代发工资 <span className="tag tag-web">不可信电脑端</span></h2>
      <p className="muted">
        本批次共 {rows.length} 笔。木马可能只篡改其中一两笔——人不可能逐行核对 120 行，
        风险分层与 Merkle 承诺在手机端完成。
      </p>

      {!batch ? (
        <>
          <div className="batch-actions">
            <button className="btn-primary" disabled={submitting} onClick={submit}>
              {submitting ? '提交中…' : `提交 ${rows.length} 笔代发申请`}
            </button>
            <span className="muted small">提交后在手机端进行分层审阅与签名</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>行号</th><th>姓名</th><th>账号</th><th>开户行</th><th>金额</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td><td>{r.employeeName}</td>
                    <td className="mono">{r.account}</td><td>{r.bankName}</td><td>{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">仅预览前 8 行，完整 {rows.length} 行已随请求提交。</p>
          </div>
        </>
      ) : (
        <div className="batch-result">
          <div className="status-row">
            <strong>批次 {batch.id}</strong>
            <StatusBadge status={batch.status} />
            <span className="muted small">{formatTime(batch.createdAt)}</span>
            <button className="btn-mini" onClick={refresh}>刷新状态</button>
          </div>
          <div className="summary-grid">
            <div className="sum-cell"><span>总笔数</span><strong>{batch.summary.totalCount}</strong></div>
            <div className="sum-cell"><span>总金额</span><strong>{batch.summary.totalAmount}</strong></div>
            <div className="sum-cell danger"><span>高风险行</span><strong>{batch.summary.highRiskCount}</strong></div>
            <div className="sum-cell warn"><span>中风险行</span><strong>{batch.summary.mediumRiskCount}</strong></div>
            <div className="sum-cell danger"><span>新账号</span><strong>{batch.summary.newPayeeCount}</strong></div>
            <div className="sum-cell danger"><span>账号变动</span><strong>{batch.summary.changedCount}</strong></div>
          </div>
          <div className="filter-bar">
            {(['all', 'risk', 'high'] as const).map((f) => (
              <button key={f} className={`btn-mini ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? `全部 ${batch.items.length} 行` : f === 'risk' ? `仅风险行` : '仅高风险'}
              </button>
            ))}
          </div>
          <div className="table-wrap tall">
            <table className="data-table">
              <thead>
                <tr><th>行号</th><th>姓名</th><th>账号</th><th>金额</th><th>风险</th></tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.rowNo} className={item.riskFlags.some((f) => f.severity === 'high') ? 'row-high' : item.riskFlags.length ? 'row-med' : ''}>
                    <td>{item.rowNo}</td>
                    <td>{item.employeeName}</td>
                    <td className="mono">{item.account}</td>
                    <td>{item.amount}</td>
                    <td>
                      {item.riskFlags.length === 0 ? <span className="ok-text">正常</span> :
                        item.riskFlags.map((f) => (
                          <span key={f.code} className={`risk-chip ${f.severity}`}>{f.message}</span>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {batch.status === 'rejected' && (
            <div className="alert-banner bad">批次已在手机端拒绝，{batch.summary.totalCount} 笔代发全部未执行。</div>
          )}
          {batch.status === 'executed' && (
            <div className="alert-banner ok">批次已按手机端确认的 Merkle 根执行，回单哈希：{batch.receipt?.receiptHash.slice(0, 16)}…</div>
          )}
        </div>
      )}
    </div>
  );
}
