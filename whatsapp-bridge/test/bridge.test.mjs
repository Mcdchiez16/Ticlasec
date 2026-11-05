import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, copyFile, mkdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { EncryptedStore, validId, secretFile } from '../src/storage.mjs';
import { selfCommand } from '../src/commands.mjs';
import { Sessions } from '../src/sessions.mjs';
import { authentication, BufferJSON } from '../src/baileys-adapter.mjs';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const user = { id: '260977000001:12@s.whatsapp.net', lid: '123456:12@lid' };
const incoming = (text = '/ticla help') => ({ key: { fromMe: true, id: 'test-event', remoteJid: '260977000001@s.whatsapp.net' },
  messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: text } });
const tick = () => new Promise(resolve => setImmediate(resolve));

async function storage(t) {
  const root = await mkdtemp(join(tmpdir(), 'ticla-qr-test-'));
  t.after(() => rm(root, { recursive: true, force: true })); // exact test-owned mkdtemp directory
  return new EncryptedStore(root, randomBytes(32).toString('hex'));
}
test('session files are encrypted, authenticated, private and owner-bound', async t => {
  const store = await storage(t);
  await store.write(A, 'creds', { secret: 'sensitive-credential', number: 1 });
  assert.equal((await store.read(A, 'creds')).secret, 'sensitive-credential');
  assert.equal((await readFile(store.file(A, 'creds'))).includes(Buffer.from('sensitive-credential')), false);
  assert.equal((await stat(store.file(A, 'creds'))).mode & 0o777, 0o600);
  const wrong = new EncryptedStore(store.root, randomBytes(32).toString('hex'));
  await assert.rejects(wrong.read(A, 'creds'));
  await mkdir(store.directory(B));
  await copyFile(store.file(A, 'creds'), store.file(B, 'creds'));
  await assert.rejects(store.read(B, 'creds'));
  assert.equal(validId('../../'), false);
  await assert.rejects(store.remove('../../'));
});
test('writes serialize, removal only affects that session and revokes later writes', async t => {
  const store = await storage(t);
  await Promise.all(Array.from({ length: 20 }, (_, n) => store.write(A, 'count', n)));
  await store.write(B, 'keep', 'other user');
  assert.equal(await store.read(A, 'count'), 19);
  await store.remove(A);
  assert.equal(await store.read(A, 'count'), null);
  assert.equal(await store.read(B, 'keep'), 'other user');
  await assert.rejects(store.write(A, 'count', 20));
});
test('secret creation is stable and private', async t => {
  const store = await storage(t), path = join(store.root, 'secret');
  assert.equal(await secretFile(path), await secretFile(path));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});
test('accepts only explicit own self-chat commands, including own LID', () => {
  assert.equal(selfCommand(incoming('/ticla cases'), user).text, 'cases');
  const message = incoming('/ticla'); message.key.remoteJid = '123456@lid';
  assert.equal(selfCommand(message, user).text, 'help');
  message.message = { ephemeralMessage: { message: { conversation: '/ticla monitors' } } };
  assert.equal(selfCommand(message, user).text, 'monitors');
});
for (const [name, change] of Object.entries({
  contact: m => { m.key.remoteJid = '260977000002@s.whatsapp.net'; },
  group: m => { m.key.remoteJid = '12345@g.us'; },
  incoming: m => { m.key.fromMe = false; },
  old: m => { m.messageTimestamp -= 301; },
  future: m => { m.messageTimestamp += 301; },
  malformed: m => { m.key.remoteJid = null; },
  identifier: m => { m.key.id = {}; },
  forwarded: m => { m.message = { extendedTextMessage: { text: '/ticla cases', contextInfo: { isForwarded: true } } }; },
  ordinary: m => { m.message.conversation = 'investigate this'; },
  reply: m => { m.message.conversation = 'TiclaSec\n\n/ticla help'; },
  attachment: m => { m.message = { imageMessage: { caption: '/ticla help' } }; },
})) test(`ignores ${name} messages`, () => { const m = incoming(); change(m); assert.equal(selfCommand(m, user), null); });

async function harness(t, options = {}) {
  const store = await storage(t), events = [], sockets = [];
  const sessions = new Sessions({ store,
    authenticate: async () => ({ state: { creds: { registered: false } }, save: async () => {} }),
    socketFactory: () => {
      const socket = { ev: new EventEmitter(), user, sent: [], end() {}, logout: async () => {},
        sendMessage: async (jid, body) => { socket.sent.push({ jid, body }); } };
      sockets.push(socket); return socket;
    }, notify: async body => { events.push(body); }, renderQR: async () => 'data:image/png;base64,VEVTVA==', ...options });
  t.after(() => sessions.stop());
  return { sessions, store, events, sockets };
}
test('start is coalesced; QR stays private until scan; connected requires backend approval', async t => {
  let release;
  const h = await harness(t, { notify: async body => {
    if (body.event === 'connected') await new Promise(resolve => { release = resolve; });
  } });
  await Promise.all([h.sessions.start(A), h.sessions.start(A)]);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.sessions.view(B).status, 'disconnected');
  const socket = h.sockets[0];
  socket.ev.emit('connection.update', { qr: 'private-qr' }); await tick();
  assert.equal(h.sessions.view(A).status, 'awaiting_scan');
  assert.ok(h.sessions.view(A).qr_data_url);
  socket.ev.emit('connection.update', { connection: 'open' }); await tick();
  assert.notEqual(h.sessions.view(A).status, 'connected');
  assert.equal(h.sessions.view(A).qr_data_url, null);
  release(); await tick();
  assert.equal(h.sessions.view(A).status, 'connected');
  assert.equal(h.sessions.view(A).identity, '••••0001');
});
test('history ignored, self commands forwarded once per pending event, outbound goes only to self', async t => {
  const h = await harness(t);
  await h.sessions.start(A);
  const socket = h.sockets[0]; socket.ev.emit('connection.update', { connection: 'open' }); await tick();
  socket.ev.emit('messages.upsert', { type: 'append', messages: [incoming()] }); await tick();
  assert.equal(h.events.filter(e => e.event === 'message').length, 0);
  socket.ev.emit('messages.upsert', { type: 'notify', messages: [incoming('/ticla cases')] });
  await h.sessions.records.get(A).pending;
  assert.equal(h.events.find(e => e.event === 'message').connection_id, A);
  assert.equal(h.events.find(e => e.event === 'message').text, 'cases');
  assert.equal((await h.store.read(A, 'command-outbox')).length, 0);
  await h.sessions.send(A, 'Your cases');
  assert.equal(socket.sent[0].jid, '260977000001@s.whatsapp.net');
  assert.equal(socket.sent[0].body.linkPreview, null);
  await h.sessions.remove(A);
  socket.ev.emit('connection.update', { connection: 'open' }); await tick();
  assert.equal(h.sessions.view(A).status, 'disconnected');
  await assert.rejects(h.sessions.send(A, 'revoked'));
  await assert.rejects(h.sessions.start(A));
});
test('revocation while authorization is in flight cannot start a socket', async t => {
  let release;
  const h = await harness(t, { notify: () => new Promise(resolve => { release = resolve; }) });
  const starting = h.sessions.start(A);
  await h.sessions.remove(A); release();
  await assert.rejects(starting);
  assert.equal(h.sockets.length, 0);
});
test('unauthorized sends do not reach WhatsApp', async t => {
  let revoked = false;
  const h = await harness(t, { notify: async () => { if (revoked) throw Object.assign(new Error('Revoked'), { status: 410 }); } });
  await h.sessions.start(A); h.sockets[0].ev.emit('connection.update', { connection: 'open' }); await tick();
  revoked = true;
  await assert.rejects(h.sessions.send(A, 'private briefing'));
  assert.equal(h.sockets[0].sent.length, 0);
});
test('concurrent new sessions respect capacity', async t => {
  const h = await harness(t, { limit: 1 });
  const first = h.sessions.start(A);
  await assert.rejects(h.sessions.start(B)); await first;
  assert.equal(h.sockets.length, 1);
});

test('Baileys binary authentication keys survive encrypted persistence', async t => {
  const store = await storage(t); store.json = BufferJSON;
  const auth = await authentication(store, A);
  auth.state.creds.me = user;
  await auth.state.keys.set({ session: { recipient: Buffer.from([0, 255, 128, 7]) } });
  await auth.save();
  const restored = await authentication(store, A);
  assert.deepEqual(restored.state.creds.noiseKey, auth.state.creds.noiseKey);
  assert.deepEqual((await restored.state.keys.get('session', ['recipient'])).recipient, Buffer.from([0, 255, 128, 7]));
  assert.equal(restored.state.creds.me.id, user.id);
});
test('restore uses paired companion identity even when mobile registration flag is false', async t => {
  const h = await harness(t);
  await h.store.write(A, 'creds', { registered: false, me: user });
  await h.sessions.restore();
  assert.equal(h.sockets.length, 1);
  h.sessions.fail(h.sessions.records.get(A), 'Retry limit reached');
  await h.sessions.restore();
  assert.equal(h.sockets.length, 1, 'restore must not bypass the bounded reconnect policy');
});
