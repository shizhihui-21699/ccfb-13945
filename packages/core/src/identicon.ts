import { sha256Hex } from './crypto.js';

/**
 * 确定性身份方块（identicon）：同一账号永远生成同一图案。
 * 手机端给每个收款人显示，用户可凭图案记忆快速识别"账号被换成另一个人"。
 * 纯前端生成、无外部依赖。
 */
export interface Identicon {
  grid: boolean[][];
  colors: [string, string];
}

const PALETTE: [string, string][] = [
  ['#2563eb', '#93c5fd'],
  ['#dc2626', '#fca5a5'],
  ['#059669', '#6ee7b7'],
  ['#d97706', '#fcd34d'],
  ['#7c3aed', '#c4b5fd'],
  ['#0891b2', '#67e8f9'],
  ['#be185d', '#f9a8d4'],
  ['#15803d', '#86efac']
];

export function accountIdenticon(seed: string, size = 5): Identicon {
  const hash = sha256Hex(seed);
  const paletteIndex = parseInt(hash.slice(0, 2), 16) % PALETTE.length;
  const grid: boolean[][] = [];
  // 左右镜像，只需要 ceil(size/2) 列的随机位
  const half = Math.ceil(size / 2);
  let bitPos = 2;
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < half; c++) {
      const byte = hash[bitPos >> 2]!;
      const nibble = bitPos % 4 === 0 ? parseInt(byte, 16) >> 0 : parseInt(byte, 16);
      row.push(((nibble >> (bitPos % 4)) & 1) === 1);
      bitPos++;
    }
    for (let c = half; c < size; c++) row.push(row[size - 1 - c]!);
    grid.push(row);
  }
  return { grid, colors: PALETTE[paletteIndex]! };
}
