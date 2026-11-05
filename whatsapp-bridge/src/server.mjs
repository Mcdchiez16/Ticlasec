import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { EncryptedStore, secretFile, validId } from './storage.mjs';
import { authentication, socketFactory, BufferJSON } from './baileys-adapter.mjs';
import { Sessions } from './sessions.mjs';

const root = process.env.WHATSAPP_SESSION_DIR || '/data';
const secrets = process.env.WHATSAPP_SECRET_DIR || '/run/bridge-secrets';
await mkdir(root, { recursive: true, mode: 0o700 });
await mkdir(secrets, { recursive: true, mode: 0o700 });
const token = await secretFile(`${secrets}/bridge.key`);
const encryptionKey = await secretFile(`${root}/encryption.key`);
const store = new EncryptedStore(`${root}/sessions`, encryptionKey, BufferJSON);
const origin = (process.env.BACKEND_URL || 'http://fastapi:8000').replace(/\/$/, '');

async function notify(body) {
  const response = await fetch(`${origin}/channels/bridge/event`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) { const error = new Error('Backend rejected bridge event'); error.status = response.status; throw error; }
  return response.json();
}
const sessions = new Sessions({ store, authenticate: authentication, socketFactory, notify,
  renderQR: value => QRCode.toDataURL(value, { width: 320, margin: 4, errorCorrectionLevel: 'M' }),
  limit: Math.max(1, Math.min(50, Number(process.env.WHATSAPP_MAX_SESSIONS) || 10)),
});
const respond = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') return respond(res, 200, { status: 'ok' });
  const received = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return respond(res, 401, { error: 'Unauthorized' });
  const match = req.url.match(/^\/sessions\/([a-f0-9-]+)(\/send)?$/);
  if (!match || !validId(match[1])) return respond(res, 404, { error: 'Not found' });
  const [, id, action] = match;
  try {
    let chunks = [], size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 16384) return respond(res, 413, { error: 'Body too large' }); chunks.push(chunk); }
    const body = size ? JSON.parse(Buffer.concat(chunks)) : {};
    if (!action && req.method === 'GET') return respond(res, 200, sessions.view(id));
    if (!action && req.method === 'POST') return respond(res, 202, await sessions.start(id));
    if (!action && req.method === 'DELETE') return respond(res, 200, await sessions.remove(id));
    if (action === '/send' && req.method === 'POST') return respond(res, 200, await sessions.send(id, body.text));
    return respond(res, 405, { error: 'Method not allowed' });
  } catch (error) { return respond(res, error.status === 410 ? 410 : 503, { error: 'QR session request failed. Retry or disconnect and scan again.' }); }
});
server.requestTimeout = 20000; server.headersTimeout = 10000;
server.listen(8090, '0.0.0.0', () => console.log('Private WhatsApp QR bridge ready'));
// No QR strings, message bodies, phone numbers or credentials are logged.
const sweep = setInterval(() => sessions.sweep().catch(() => {}), 30000); sweep.unref();
sessions.restore().catch(() => {});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  clearInterval(sweep); sessions.stop(); server.close(() => process.exit(0));
});
