import { accountIdentity, selfCommand } from './commands.mjs';
import { validId } from './storage.mjs';

export class Sessions {
  constructor({ store, authenticate, socketFactory, notify, renderQR, limit = 10 }) {
    Object.assign(this, { store, authenticate, socketFactory, notify, renderQR, limit });
    this.records = new Map(); this.starting = new Map(); this.revoked = new Set();
  }
  view(id) {
    const record = this.records.get(id);
    if (!record) return { status: 'disconnected' };
    return { status: record.status, qr_data_url: record.expiresAt > Date.now() ? record.qr : null,
      qr_expires_at: Math.floor(record.expiresAt / 1000), error: record.error || null,
      identity: record.account ? `••••${record.account.slice(-4)}` : null };
  }
  async start(id) {
    if (!validId(id)) throw new Error('Invalid session ID');
    if (this.revoked.has(id)) throw new Error('Session revoked. Disconnect and create a new link.');
    if (this.starting.has(id)) return this.starting.get(id);
    if (!this.records.has(id) && new Set([...this.records.keys(), ...this.starting.keys()]).size >= this.limit) throw new Error('QR session limit reached');
    const task = this._start(id);
    this.starting.set(id, task);
    try { return await task; } finally { this.starting.delete(id); }
  }
  async _start(id) {
    const current = this.records.get(id);
    if (current && ['connecting', 'awaiting_scan', 'connected', 'reconnecting'].includes(current.status)) return this.view(id);
    await this.notify({ connection_id: id, event: 'authorize' });
    if (!current && this.records.size >= this.limit) throw new Error('QR session limit reached');
    if (current) { current.deleted = true; this.pause(current); }
    const auth = await this.authenticate(this.store, id);
    const record = { id, auth, status: 'connecting', qr: null, expiresAt: 0, retries: 0, timers: new Set(),
      outbox: await this.store.read(id, 'command-outbox') ?? [], pending: Promise.resolve(), deleted: false };
    if (this.revoked.has(id)) throw new Error('Session revoked');
    this.records.set(id, record);
    this.connect(record);
    return this.view(id);
  }
  later(record, fn, ms) {
    const timer = setTimeout(() => { record.timers.delete(timer); if (!record.deleted) Promise.resolve(fn()).catch(() => this.fail(record, 'Connection failed. Disconnect and scan again.')); }, ms);
    timer.unref?.(); record.timers.add(timer);
  }
  fail(record, text) {
    if (record.deleted) return;
    this.pause(record); record.status = 'error'; record.error = text;
  }
  pause(record) {
    for (const timer of record.timers) clearTimeout(timer);
    record.timers.clear(); record.qr = null; record.expiresAt = 0;
    if (record.socket) { record.socket.ev.removeAllListeners(); record.socket.end(new Error('Local session stopped')); }
    record.socket = null;
  }
  connect(record) {
    if (record.deleted) return;
    const socket = this.socketFactory(record.auth.state);
    record.socket = socket;
    const active = () => !record.deleted && record.socket === socket;
    socket.ev.on('creds.update', () => {
      if (active()) record.auth.save().catch(() => this.fail(record, 'Could not save the device session. Disconnect and retry.'));
    });
    socket.ev.on('connection.update', update => {
      (async () => {
        if (!active()) return;
        if (update.qr) {
          const image = await this.renderQR(update.qr);
          if (!active()) return;
          record.qr = image; record.expiresAt = Date.now() + 40000; record.status = 'awaiting_scan';
        }
        if (update.connection === 'open') {
          record.qr = null; record.expiresAt = 0;
          await this.opened(record, socket);
        }
        if (update.connection === 'close') {
          const reason = update.lastDisconnect?.error?.output?.statusCode;
          record.qr = null; record.expiresAt = 0;
          if (reason === 401 || reason === 403) {
            this.fail(record, 'WhatsApp logged this device out. Disconnect, then scan a new QR code.');
            await this.store.write(record.id, 'creds', null);
          } else if (record.retries < 6) {
            record.status = 'reconnecting'; record.retries++;
            socket.ev.removeAllListeners();
            this.later(record, () => this.connect(record), reason === 515 ? 500 : Math.min(30000, 1000 * 2 ** record.retries));
          } else this.fail(record, 'Connection could not be restored. Disconnect and try again.');
        }
      })().catch(() => this.fail(record, 'WhatsApp pairing failed. Disconnect and try again.'));
    });
    socket.ev.on('messages.upsert', event => {
      if (!active() || record.status !== 'connected' || event.type !== 'notify') return;
      for (const message of event.messages ?? []) {
        const command = selfCommand(message, socket.user);
        if (!command) continue;
        record.pending = record.pending.catch(() => {}).then(async () => {
          if (!active() || record.outbox.some(item => item.event_id === command.event_id)) return;
          if (record.outbox.length >= 50) { record.error = 'Command queue is full. Use the web app until it clears.'; return; }
          record.outbox.push({ connection_id: record.id, ...command });
          await this.store.write(record.id, 'command-outbox', record.outbox);
          await this.flush(record);
        }).catch(() => this.fail(record, 'Could not save a chat command. Reconnect before trying again.'));
      }
    });
    // Companion-device authentication is indicated by creds.me, not the mobile
    // registration flag (which can remain false after successful QR pairing).
    if (!record.auth.state.creds.me?.id) this.later(record, () => {
      if (record.status !== 'connected') this.fail(record, 'Pairing timed out. Click Show QR again to retry.');
    }, 5 * 60000);
  }
  async opened(record, socket) {
    if (record.deleted || record.socket !== socket) return;
    const identity = accountIdentity(socket.user);
    record.account = identity.account;
    try {
      await this.notify({ connection_id: record.id, event: 'connected', account: identity.account });
      if (record.deleted || record.socket !== socket) return;
      record.status = 'connected'; record.error = null; record.retries = 0;
      await record.auth.save();
      await this.flush(record);
    } catch (error) {
      if (record.deleted || record.socket !== socket) return;
      if ([409, 410].includes(error.status)) { await this.remove(record.id); return; }
      record.status = 'reconnecting';
      this.later(record, () => this.opened(record, socket), 5000);
    }
  }
  async flush(record) {
    if (record.flushing || record.deleted) return;
    record.flushing = true;
    try {
      while (record.outbox.length && !record.deleted) {
        const message = record.outbox[0];
        if (Date.now() / 1000 - message.sent_at < 3600) {
          try { await this.notify(message); }
          catch (error) {
            if (error.status === 410) { await this.remove(record.id); return; }
            this.later(record, () => this.flush(record), 5000); return;
          }
        }
        record.outbox.shift();
        if (!record.deleted) await this.store.write(record.id, 'command-outbox', record.outbox);
      }
    } finally { record.flushing = false; }
  }
  async send(id, text) {
    const record = this.records.get(id);
    if (!record || record.status !== 'connected' || typeof text !== 'string' || !text || text.length > 4000) throw new Error('Session not ready');
    await this.notify({ connection_id: id, event: 'authorize' });
    if (record.deleted || !record.socket) throw new Error('Session revoked');
    const { jid } = accountIdentity(record.socket.user);
    await record.socket.sendMessage(jid, { text: `TiclaSec\n\n${text}`, linkPreview: null });
    return { sent: true };
  }
  async remove(id) {
    if (!validId(id)) throw new Error('Invalid session ID');
    this.revoked.add(id);
    const record = this.records.get(id);
    if (record) {
      record.deleted = true;
      let timeout;
      try { await Promise.race([record.socket?.logout(), new Promise(resolve => { timeout = setTimeout(resolve, 4000); })]); }
      catch { /* Already logged out. */ }
      finally { clearTimeout(timeout); }
      this.pause(record); this.records.delete(id);
    }
    await this.store.remove(id);
    return { disconnected: true };
  }
  async restore() {
    for (const id of await this.store.sessions()) {
      if (this.records.has(id)) continue;
      try {
        const creds = await this.store.read(id, 'creds');
        if (creds?.me?.id) await this.start(id);
      } catch (error) {
        if (error.status === 410) await this.remove(id);
        // Keep encrypted credentials on temporary API failure; retry later.
      }
    }
  }
  async sweep() {
    for (const record of this.records.values()) {
      try { await this.notify({ connection_id: record.id, event: 'authorize' }); }
      catch (error) { if (error.status === 410) await this.remove(record.id); }
    }
    await this.restore();
  }
  stop() { for (const record of this.records.values()) { record.deleted = true; this.pause(record); } }
}
