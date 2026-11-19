import { sha256Hex } from './crypto.js';

/**
 * 规范化 JSON：键按字典序排序、无多余空白。
 * 签名/哈希前统一使用，保证两端对"同一笔交易"算出相同的字节。
 */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
}

export function digest(value: unknown): string {
  return sha256Hex(canonicalJSON(value));
}

/**
 * 视觉哈希：把完整 SHA-256 折叠成 6 个便于人眼比对的词组（hex → 词表）。
 * 手机端与网页端各显示一次，用户可肉眼核对；真实场景也可以只信手机端。
 */
const WORDS = [
  '麒麟', '青松', '白鹭', '朱雀', '玄武', '青鸾', '锦鲤', '玉竹',
  '银河', '烟雨', '丹霞', '沧海', '明月', '磐石', '风信', '木兰',
  '海棠', '春雪', '晚舟', '落霞', '孤鸿', '寒梅', '清泉', '远山',
  '北辰', '南屿', '西风', '东海', '云岫', '星河', '霜降', '雷震'
];

export function visualHash(hex: string): string[] {
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  return groups.slice(0, 6).map((g) => {
    const n = parseInt(g, 16);
    return `${WORDS[n % WORDS.length]}-${(n % 90) + 10}`;
  });
}
