import { useEffect, useState } from 'react';
import { accountIdenticon } from 'bank-core';

/** 确定性身份方块：同一账号图案恒定，账号一变图案立刻变。 */
export function Identicon({ seed, size = 40 }: { seed: string; size?: number }) {
  const icon = accountIdenticon(seed);
  const cells = 5;
  const cell = size / cells;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="identicon" aria-label="收款方身份图案">
      {icon.grid.flatMap((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={c * cell}
              y={r * cell}
              width={cell * 0.92}
              height={cell * 0.92}
              rx={cell * 0.18}
              fill={icon.colors[0]}
            />
          ) : null
        )
      )}
    </svg>
  );
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: '待手机确认', cls: 'st-pending' },
  confirmed: { label: '已确认', cls: 'st-ok' },
  executed: { label: '已执行', cls: 'st-ok' },
  rejected: { label: '已拒绝（交易未执行）', cls: 'st-bad' },
  failed: { label: '失败', cls: 'st-bad' }
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: 'st-pending' };
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
