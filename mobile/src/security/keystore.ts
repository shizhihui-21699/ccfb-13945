import {
  generateKeyPair,
  getPublicKey,
  signMessage,
  verifySignature,
  type KeyPair
} from 'bank-core';

/**
 * 设备密钥保管。
 * 演示环境用 localStorage 模拟；真实 App 中：
 *  - iOS: Keychain（kSecAttrAccessibleWhenUnlockedThisDeviceOnly）
 *  - Android: Keystore（StrongBox，私钥不可导出，签名在 TEE 内完成）
 * 私钥永远不离开安全区，App 进程本身也读不到原始字节。
 */
const KEY_STORAGE = 'bank-device-key-v1';
const DEVICE_ID_STORAGE = 'bank-device-id-v1';

function randomDeviceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `dev-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function loadOrCreateKey(): KeyPair {
  const raw = localStorage.getItem(KEY_STORAGE);
  if (raw) return JSON.parse(raw) as KeyPair;
  const kp = generateKeyPair();
  localStorage.setItem(KEY_STORAGE, JSON.stringify(kp));
  return kp;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_STORAGE);
  if (!id) {
    id = randomDeviceId();
    localStorage.setItem(DEVICE_ID_STORAGE, id);
  }
  return id;
}

export function getDevicePublicKey(): string {
  return getPublicKey(loadOrCreateKey().privateKey);
}

/** 在"安全区"内完成签名（演示：内存中调用；真机由系统 API 完成且不可导出）。 */
export function signWithDeviceKey(message: string): string {
  return signMessage(loadOrCreateKey().privateKey, message);
}

export { verifySignature };
