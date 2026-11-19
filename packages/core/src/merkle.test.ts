import { describe, it, expect } from 'vitest';
import { MerkleTree, verifyMerkleProof } from './merkle.js';

describe('MerkleTree', () => {
  const items = [
    { id: 1, account: '6222020001', amount: '100.00' },
    { id: 2, account: '6222020002', amount: '200.00' },
    { id: 3, account: '6222020003', amount: '300.00' },
    { id: 4, account: '6222020004', amount: '400.00' },
    { id: 5, account: '6222020005', amount: '500.00' }
  ];

  it('每个元素的包含证明都可验证（含奇数提升）', () => {
    const tree = new MerkleTree(items);
    for (let i = 0; i < items.length; i++) {
      const proof = tree.proofFor(i);
      expect(verifyMerkleProof(items[i]!, proof)).toBe(true);
    }
  });

  it('篡改任一元素后证明失效', () => {
    const tree = new MerkleTree(items);
    const proof = tree.proofFor(2);
    const tampered = { ...items[2], amount: '999.00' };
    expect(verifyMerkleProof(tampered, proof)).toBe(false);
  });

  it('根随内容变化且稳定', () => {
    const t1 = new MerkleTree(items);
    const t2 = new MerkleTree(items);
    const t3 = new MerkleTree([...items.slice(0, 4), { ...items[4]!, amount: '501.00' }]);
    expect(t1.root).toBe(t2.root);
    expect(t1.root).not.toBe(t3.root);
  });
});
