import { accountIdenticon, highestSeverity, type RiskFlag } from 'bank-core';

export function Identicon({ seed, size = 44 }: { seed: string; size?: number }) {
  const icon = accountIdenticon(seed);
  const cells = 5;
  const cell = size / cells;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="identicon">
      {icon.grid.flatMap((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell * 0.92} height={cell * 0.92} rx={cell * 0.18} fill={icon.colors[0]} />
          ) : null
        )
      )}
    </svg>
  );
}

export function RiskList({ flags }: { flags: RiskFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="risk-ok-box">
        <span className="check">✓</span> 自动风控未发现异常；仍请核对收款方与金额
      </div>
    );
  }
  const sev = highestSeverity(flags);
  return (
    <div className={`risk-box ${sev}`}>
      <div className="risk-box-title">
        {sev === 'high' ? '⛔ 服务器风控发现高危信号' : '⚠ 存在需要留意的风险'}
      </div>
      <ul>
        {flags.map((f) => (
          <li key={f.code} className={`flag ${f.severity}`}>
            <span className="flag-dot" />
            <span>{f.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CopBadge({ cop, registeredName }: { cop: string; registeredName?: string }) {
  if (cop === 'matched') {
    return (
      <div className="cop matched">
        <strong>✓ 户名校验通过</strong>
        <span>账号实名登记名与收款户名一致（银行核心系统返回）</span>
      </div>
    );
  }
  if (cop === 'mismatched') {
    return (
      <div className="cop mismatched">
        <strong>✗ 户名校验失败</strong>
        <span>该账号实名登记为：<b>{registeredName}</b>，与申请的收款户名不一致</span>
      </div>
    );
  }
  return (
    <div className="cop unknown">
      <strong>？ 无法完成户名校验</strong>
      <span>银行核心查无此账号登记信息，请逐位核对账号</span>
    </div>
  );
}

export function SectionTitle({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="section-title">
      <span>{children}</span>
      {extra}
    </div>
  );
}
