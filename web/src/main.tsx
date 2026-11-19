import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { installTrojanFetch } from './trojan.js';
import './styles.css';

// 木马在页面脚本最早阶段劫持 fetch（演示：真实木马通过注入/钩子实现）
installTrojanFetch();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
