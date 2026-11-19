import { describe, it, expect } from 'vitest';
import { generateKeyPair, signMessage, verifySignature } from './crypto.js';
import { canonicalJSON, digest, visualHash } from './encoding.js';

describe('crypto', () => {
  it('签名可验证、篡改后失败', () => {
    const kp = generateKeyPair();
    const sig = signMessage(kp.privateKey, 'hello');
    expect(verifySignature(kp.publicKey, 'hello', sig)).toBe(true);
    expect(verifySignature(kp.publicKey, 'hellp', sig)).toBe(false);
  });

  it('规范化 JSON 与键顺序无关', () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
    expect(digest({ b: [1, { x: 2 }], a: 'z' })).toBe(digest({ a: 'z', b: [1, { x: 2 }] }));
  });

  it('视觉哈希稳定且为 6 组', () => {
    const h = digest({ payee: 'acct-1', amount: '100.00' });
    expect(visualHash(h)).toHaveLength(6);
    expect(visualHash(h)).toEqual(visualHash(h));
  });
});
