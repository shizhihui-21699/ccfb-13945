import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, bytesToHex, hexToBytes } from '@noble/hashes/utils';

/** SHA-256，返回十六进制（64 位小写）。 */
export function sha256Hex(data: string): string {
  return bytesToHex(sha256(utf8ToBytes(data)));
}

export interface KeyPair {
  /** 十六进制私钥（32 字节）。演示环境；真实 App 中密钥存 iOS Keychain / Android Keystore。 */
  privateKey: string;
  /** 十六进制公钥（32 字节）。 */
  publicKey: string;
}

export function generateKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(ed25519.getPublicKey(privateKey))
  };
}

export function getPublicKey(privateKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(privateKeyHex)));
}

/** 对消息字符串签名，返回十六进制签名。 */
export function signMessage(privateKeyHex: string, message: string): string {
  return bytesToHex(ed25519.sign(utf8ToBytes(message), hexToBytes(privateKeyHex)));
}

/** 验证签名（公钥/签名均为十六进制）。 */
export function verifySignature(publicKeyHex: string, message: string, signatureHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), utf8ToBytes(message), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}
