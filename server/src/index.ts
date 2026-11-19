import express from 'express';
import cors from 'cors';
import {
  SERVER_KEY,
  createTransfer,
  createBatch,
  confirmTransfer,
  rejectTransfer,
  confirmBatch,
  rejectBatch,
  enrollDevice,
  listAll,
  getTransfer,
  getBatch,
  getMerkleProof,
  resetAll
} from './store.js';
import { PAYROLL_TEMPLATE } from './data.js';
import { eventBus } from './sse.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PORT = 4000;

/** 引导信息：手机端启动时拉取服务器公钥（演示环境直接下发；真实环境预置在 App 内/证书绑定）。 */
app.get('/api/bootstrap', (_req, res) => {
  res.json({
    serviceName: '安信银行 · 交易确认服务',
    serverPublicKey: SERVER_KEY.publicKey,
    serverTime: Date.now(),
    protocolVersion: 'BANK-CONFIRM:v1'
  });
});

/* ---------------- 不可信网页端调用（数据可能已被木马篡改） ---------------- */

app.post('/api/transfers', (req, res) => {
  try {
    const tx = createTransfer(req.body);
    res.status(201).json(tx);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/batches', (req, res) => {
  try {
    const batch = createBatch(req.body);
    res.status(201).json(batch);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/payroll-template', (_req, res) => {
  res.json({ rows: PAYROLL_TEMPLATE });
});

/* ---------------- 可信手机端调用（设备密钥签名） ---------------- */

app.post('/api/devices/enroll', (req, res) => {
  try {
    res.status(201).json(enrollDevice(req.body));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/mobile/transfers/:id/confirm', (req, res) => {
  try {
    res.json(confirmTransfer(req.body.deviceId, req.params.id!, req.body.signature));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/mobile/transfers/:id/reject', (req, res) => {
  try {
    res.json(rejectTransfer(req.body.deviceId, req.params.id!, req.body.signature));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/mobile/batches/:id/confirm', (req, res) => {
  try {
    res.json(confirmBatch(req.body.deviceId, req.params.id!, req.body.signature));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/mobile/batches/:id/reject', (req, res) => {
  try {
    res.json(rejectBatch(req.body.deviceId, req.params.id!, req.body.signature));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get('/api/mobile/batches/:id/proof/:rowNo', (req, res) => {
  try {
    res.json(getMerkleProof(req.params.id!, Number(req.params.rowNo)));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/* -------------------------------- 通用查询 -------------------------------- */

app.get('/api/transactions', (_req, res) => res.json(listAll()));
app.get('/api/transfers/:id', (req, res) => {
  const tx = getTransfer(req.params.id!);
  if (!tx) return res.status(404).json({ error: '不存在' });
  res.json(tx);
});
app.get('/api/batches/:id', (req, res) => {
  const batch = getBatch(req.params.id!);
  if (!batch) return res.status(404).json({ error: '不存在' });
  res.json(batch);
});

app.post('/api/demo/reset', (_req, res) => {
  resetAll();
  res.json({ ok: true });
});

/* --------------------------------- SSE --------------------------------- */

app.get('/api/events', (_req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  res.write(`event: ready\ndata: {}\n\n`);
  const unsubscribe = eventBus.subscribe((event) => {
    res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  res.on('close', unsubscribe);
});

app.listen(PORT, () => {
  console.log(`银行服务器: http://localhost:${PORT}`);
  console.log(`服务器公钥(演示): ${SERVER_KEY.publicKey}`);
});
