/**
 * 端到端冒烟测试：直接对运行中的服务器（localhost:4000）走完整攻防链路。
 * 运行：npx tsx scripts/e2e-smoke.ts
 */
import {
  generateKeyPair,
  signMessage,
  verifySignature,
  MerkleTree,
  verifyMerkleProof,
  type BatchTx,
  type TransferTx
} from 'bank-core';

const BASE = 'http://localhost:4000';
let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

async function main() {
  console.log('— 0. 重置演示数据 —');
  await call('/api/demo/reset', { method: 'POST' });

  console.log('— 1. 引导与设备注册 —');
  const boot = await call<{ serverPublicKey: string }>('/api/bootstrap');
  const serverKey = boot.body.serverPublicKey;
  check('拿到服务器公钥', Boolean(serverKey));

  const device = generateKeyPair();
  const deviceId = 'dev-smoke-test';
  await call('/api/devices/enroll', {
    method: 'POST',
    body: JSON.stringify({ deviceId, publicKey: device.publicKey, label: '冒烟测试设备' })
  });
  check('设备注册成功', true);

  console.log('— 2. 正常单笔：手机端验签 → 签名确认 → 执行 —');
  const benign = await call<TransferTx>('/api/transfers', {
    method: 'POST',
    body: JSON.stringify({
      fromAccount: '6222020000008888',
      payeeAccount: '6222021234560001',
      payeeName: '北京云海科技有限公司',
      payeeBank: '工商银行北京分行',
      amount: '88000.00',
      purpose: '11 月货款',
      clientReference: 'smoke-1'
    })
  });
  const tx1 = benign.body;
  check('服务器签名可验证', verifySignature(serverKey, tx1.txHash, tx1.serverSignature));
  check('户名校验通过', tx1.cop === 'matched');
  check('常用收款人无新户标记', tx1.isNewPayee === false);

  const okSig = signMessage(device.privateKey, `BANK-CONFIRM:v1:single:${tx1.txHash}`);
  const confirmed = await call<TransferTx>(`/api/mobile/transfers/${tx1.id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, signature: okSig })
  });
  check('签名确认后交易执行', confirmed.body.status === 'executed');
  check('返回电子回单', Boolean(confirmed.body.receipt));
  check(
    '回单服务器签名有效',
    verifySignature(serverKey, confirmed.body.receipt!.receiptHash, confirmed.body.receipt!.serverSignature)
  );

  const replay = await call(`/api/mobile/transfers/${tx1.id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, signature: okSig })
  });
  check('重复确认被拒绝（防重放）', replay.status === 400);

  console.log('— 3. 木马报文掉包：服务器记录的是攻击者账号，风控高危，手机端拒绝 —');
  const tampered = await call<TransferTx>('/api/transfers', {
    method: 'POST',
    body: JSON.stringify({
      fromAccount: '6222020000008888',
      payeeAccount: '6222021234560099', // 木马替换后的账号
      payeeName: '陈志强',
      payeeBank: '建设银行深圳分行',
      amount: '88000.00',
      purpose: '11 月货款',
      clientReference: 'smoke-2'
    })
  });
  const tx2 = tampered.body;
  check('被掉包交易命中户名/新户风控', tx2.riskFlags.some((f) => f.severity === 'high'));
  check('新收款人标记成立', tx2.isNewPayee === true);
  const badSig = signMessage(device.privateKey, 'BANK-CONFIRM:v1:single:deadbeef');
  const badConfirm = await call(`/api/mobile/transfers/${tx2.id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, signature: badSig })
  });
  check('错误签名确认被拒', badConfirm.status === 400);

  const rejectSig = signMessage(device.privateKey, `BANK-REJECT:v1:single:${tx2.txHash}`);
  const rejected = await call<TransferTx>(`/api/mobile/transfers/${tx2.id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, signature: rejectSig })
  });
  check('手机端拒绝后状态为 rejected', rejected.body.status === 'rejected');
  check('被拒绝交易没有回单（资金未动）', !rejected.body.receipt);

  console.log('— 4. 相似户名社工：CoP 直接拆穿 —');
  const lookalike = await call<TransferTx>('/api/transfers', {
    method: 'POST',
    body: JSON.stringify({
      fromAccount: '6222020000008888',
      payeeAccount: '6222021234560098',
      payeeName: '北京云海科技有限责任公司',
      payeeBank: '民生银行北京分行',
      amount: '88000.00',
      purpose: '货款',
      clientReference: 'smoke-3'
    })
  });
  check('相似户名账号与真实目标是两个不同账号', lookalike.body.account !== '6222021234560001');
  check('服务器签名仍然有效（数据真实自洽）', verifySignature(serverKey, lookalike.body.txHash, lookalike.body.serverSignature));
  check('该笔被标记为新收款人高危', lookalike.body.riskFlags.some((f) => f.code === 'NEW_PAYEE'));

  console.log('— 5. 干净批次 120 笔：Merkle 根独立重算一致 + 包含证明 —');
  const tpl = await call<{ rows: Array<{ employeeName: string; account: string; bankName: string; amount: string }> }>(
    '/api/payroll-template'
  );
  const cleanBatch = await call<BatchTx>('/api/batches', {
    method: 'POST',
    body: JSON.stringify({ fromAccount: '6222020000008888', purpose: '11 月员工工资代发', rows: tpl.body.rows })
  });
  const b1 = cleanBatch.body;
  const localTree = new MerkleTree(b1.items.map((i) => ({
    rowNo: i.rowNo, employeeName: i.employeeName, account: i.account, bankName: i.bankName, amount: i.amount
  })));
  check('手机端重算 Merkle 根与服务器承诺一致', localTree.root === b1.merkleRoot);
  check('批次服务器签名有效', verifySignature(serverKey, b1.txHash, b1.serverSignature));
  check('干净批次无高风险行', b1.summary.highRiskCount === 0);
  check('总笔数 120', b1.summary.totalCount === 120);

  const proof = await call<ReturnType<MerkleTree['proofFor']>>(`/api/mobile/batches/${b1.id}/proof/37`);
  const item37 = b1.items.find((i) => i.rowNo === 37)!;
  check(
    '第 37 行 Merkle 包含证明验证通过',
    verifyMerkleProof(
      { rowNo: item37.rowNo, employeeName: item37.employeeName, account: item37.account, bankName: item37.bankName, amount: item37.amount },
      proof.body
    )
  );

  console.log('— 6. 木马篡改批次第 37 行：风险引擎定位 + 根承诺变化 —');
  const tamperedRows = tpl.body.rows.map((r) => ({ ...r }));
  const original37 = { ...tamperedRows[36]! };
  tamperedRows[36] = {
    employeeName: '陈志强',
    account: '6222021234560099',
    bankName: '建设银行深圳分行',
    amount: '48900.00'
  };
  const badBatch = await call<BatchTx>('/api/batches', {
    method: 'POST',
    body: JSON.stringify({ fromAccount: '6222020000008888', purpose: '11 月员工工资代发', rows: tamperedRows })
  });
  const b2 = badBatch.body;
  const row37 = b2.items.find((i) => i.rowNo === 37)!;
  check('被篡改行带高危标记', row37.riskFlags.some((f) => f.severity === 'high'));
  check('被篡改行识别为新账号', row37.riskFlags.some((f) => f.code === 'NEW_PAYEE'));
  check('批次高风险计数 ≥ 1', b2.summary.highRiskCount >= 1);
  const tamperedTree = new MerkleTree(b2.items.map((i) => ({
    rowNo: i.rowNo, employeeName: i.employeeName, account: i.account, bankName: i.bankName, amount: i.amount
  })));
  check('篡改批次的根与干净批次不同（改一行根就变）', tamperedTree.root !== b1.merkleRoot);
  check('篡改批次自身重算根仍与服务器承诺一致（承诺的就是真实内容）', tamperedTree.root === b2.merkleRoot);
  check('第 37 行账号确为攻击账号', row37.account === '6222021234560099');
  check('原第 37 行账号与篡改后不同', original37.account !== row37.account);

  const batchRejectSig = signMessage(device.privateKey, `BANK-REJECT:v1:batch:${b2.txHash}`);
  const batchRejected = await call<BatchTx>(`/api/mobile/batches/${b2.id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, signature: batchRejectSig })
  });
  check('整批拒绝成功', batchRejected.body.status === 'rejected');

  console.log('— 7. 干净批次签名确认后执行 —');
  const batchConfirmSig = signMessage(device.privateKey, `BANK-CONFIRM:v1:batch:${b1.txHash}`);
  const batchDone = await call<BatchTx>(`/api/mobile/batches/${b1.id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, signature: batchConfirmSig })
  });
  check('批次执行状态', batchDone.body.status === 'executed');
  check('批次回单笔数为 120', batchDone.body.receipt?.payeeCount === 120);

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
