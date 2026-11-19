import { useState } from 'react';
import { SingleTransfer } from './components/SingleTransfer.js';
import { BatchPayroll } from './components/BatchPayroll.js';
import { TransactionList } from './components/TransactionList.js';
import { TrojanConsole } from './components/TrojanConsole.js';
import { api } from './api.js';

type Tab = 'single' | 'batch';

export function App() {
  const [tab, setTab] = useState<Tab>('single');

  async function reset() {
    await api.reset();
    localStorage.removeItem('trojan-events-v1');
    window.dispatchEvent(new CustomEvent('trojan-event'));
    location.reload();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">安信</span>
          <div>
            <h1>安信企业网银 <span className="env-tag">演示环境 · 本机</span></h1>
            <p className="tagline">本机已被植入木马 —— 页面显示的任何内容都不可信，确认请用手机 App</p>
          </div>
        </div>
        <button className="btn-ghost" onClick={reset}>重置演示数据</button>
      </header>

      <div className="layout">
        <main className="main-col">
          <nav className="tabs">
            <button className={tab === 'single' ? 'active' : ''} onClick={() => setTab('single')}>单笔转账</button>
            <button className={tab === 'batch' ? 'active' : ''} onClick={() => setTab('batch')}>批量代发（120 笔）</button>
          </nav>
          {tab === 'single' ? <SingleTransfer /> : <BatchPayroll />}
          <TransactionList />
        </main>
        <aside className="side-col">
          <TrojanConsole />
          <div className="card principle-card">
            <h3>为什么手机端能拦住？</h3>
            <ol>
              <li>交易数据以<b>服务器记录</b>为准，手机通过独立通道直接拉取，不经过这台中毒电脑。</li>
              <li>手机先验证服务器签名，确认数据确实来自银行且未被中间人篡改。</li>
              <li>确认动作由手机安全区里的设备密钥<b>签名</b>，服务器验签通过才执行。</li>
              <li>批量交易用 <b>Merkle 根</b>承诺：改任意一笔，根哈希就变，签名随之失效。</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
