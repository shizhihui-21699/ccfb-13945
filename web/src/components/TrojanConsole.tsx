import { useEffect, useState } from 'react';
import {
  ATTACKS,
  getEnabledAttacks,
  getTrojanEvents,
  clearTrojanEvents,
  type AttackId,
  type TrojanEvent
} from '../trojan.js';
import { formatTime } from './Shared.js';

export function TrojanConsole() {
  const [enabled, setEnabled] = useState<Set<AttackId>>(new Set());
  const [events, setEvents] = useState<TrojanEvent[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const refresh = () => {
      setEnabled(getEnabledAttacks());
      setEvents(getTrojanEvents());
    };
    refresh();
    window.addEventListener('trojan-config-changed', refresh);
    window.addEventListener('trojan-event', refresh);
    return () => {
      window.removeEventListener('trojan-config-changed', refresh);
      window.removeEventListener('trojan-event', refresh);
    };
  }, []);

  return (
    <section className="trojan-panel">
      <header className="trojan-head" onClick={() => setOpen((v) => !v)}>
        <div className="trojan-title">
          <span className="skull">☠</span> 木马控制台（红队模拟 · 仅本机演示）
          <span className="trojan-count">{enabled.size} 项攻击已武装</span>
        </div>
        <span className="trojan-toggle">{open ? '收起 ▾' : '展开 ▴'}</span>
      </header>
      {open && (
        <>
          <div className="attack-grid">
            {ATTACKS.map((a) => {
              const on = enabled.has(a.id);
              return (
                <label key={a.id} className={`attack-card ${on ? 'armed' : ''}`}>
                  <div className="attack-card-head">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = new Set(enabled);
                        if (e.target.checked) next.add(a.id);
                        else next.delete(a.id);
                        setEnabled(next);
                        localStorage.setItem('trojan-attacks-v1', JSON.stringify([...next]));
                        window.dispatchEvent(new CustomEvent('trojan-config-changed'));
                      }}
                    />
                    <strong>{a.name}</strong>
                    <span className={`layer-tag layer-${a.layer}`}>{a.layer}</span>
                  </div>
                  <p>{a.description}</p>
                </label>
              );
            })}
          </div>
          <div className="trojan-log">
            <div className="trojan-log-head">
              <strong>木马行为日志</strong>
              <button className="btn-mini" onClick={clearTrojanEvents}>清空</button>
            </div>
            {events.length === 0 ? (
              <p className="muted">暂无攻击动作。武装攻击后在左侧发起交易，可在此观察木马如何动手。</p>
            ) : (
              <ul>
                {events.map((e, i) => (
                  <li key={i}>
                    <span className="log-time">{formatTime(e.at)}</span>
                    <span className="log-attack">{ATTACKS.find((a) => a.id === e.attack)?.name}</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
