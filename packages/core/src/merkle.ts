import { sha256Hex } from './crypto.js';
import { canonicalJSON } from './encoding.js';

export interface MerkleProof {
  leafHash: string;
  /** 自叶向根，每层给出兄弟哈希与方向；up 表示奇数节点的单独提升。 */
  path: { sibling: string; direction: 'left' | 'right' | 'up' }[];
  root: string;
}

function pairHash(left: string, right: string): string {
  // 顺序敏感：排序仅用于单哈希提升，不用于兄弟合并，避免第二原像歧义。
  return sha256Hex(`N:${left}:${right}`);
}

function leafHashOf(leaf: unknown): string {
  return sha256Hex(`L:${canonicalJSON(leaf)}`);
}

export class MerkleTree {
  readonly leaves: string[];
  readonly layers: string[][];

  constructor(items: unknown[]) {
    this.leaves = items.map(leafHashOf);
    this.layers = [this.leaves];
    let current = this.leaves;
    while (current.length > 1) {
      const next: string[] = [];
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i]!;
        const right = current[i + 1];
        next.push(right === undefined ? sha256Hex(`D:${left}`) : pairHash(left, right));
      }
      this.layers.push(next);
      current = next;
    }
  }

  get root(): string {
    return this.layers[this.layers.length - 1]?.[0] ?? sha256Hex('EMPTY');
  }

  proofFor(index: number): MerkleProof {
    const leafHash = this.leaves[index]!;
    const path: MerkleProof['path'] = [];
    let idx = index;
    for (let level = 0; level < this.layers.length - 1; level++) {
      const layer = this.layers[level]!;
      const siblingIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
      const sibling = layer[siblingIndex];
      if (sibling === undefined) {
        // 奇数提升节点：记录提升步骤，验证时施加相同的 D: 前缀。
        path.push({ sibling: '', direction: 'up' });
        idx = Math.floor(idx / 2);
        continue;
      }
      path.push({ sibling, direction: idx % 2 === 0 ? 'right' : 'left' });
      idx = Math.floor(idx / 2);
    }
    return { leafHash, path, root: this.root };
  }
}

export function verifyMerkleProof(item: unknown, proof: MerkleProof): boolean {
  if (leafHashOf(item) !== proof.leafHash) return false;
  let hash = proof.leafHash;
  for (const { sibling, direction } of proof.path) {
    if (direction === 'up') hash = sha256Hex(`D:${hash}`);
    else hash = direction === 'right' ? pairHash(hash, sibling) : pairHash(sibling, hash);
  }
  return hash === proof.root;
}

export function leafHash(item: unknown): string {
  return leafHashOf(item);
}
