import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const validId = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);

export async function secretFile(path, bytes = 32) {
  try { await writeFile(path, randomBytes(bytes).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const value = (await readFile(path, 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid bridge secret file');
  return value;
}

export class EncryptedStore {
  constructor(root, key, json = {}) {
    this.root = root; this.key = Buffer.from(key, 'hex'); this.json = json;
    this.pending = new Map(); this.closed = new Set();
  }
  directory(id) {
    if (!validId(id)) throw new Error('Invalid session ID');
    return join(this.root, id);
  }
  file(id, name) { return join(this.directory(id), createHash('sha256').update(name).digest('hex') + '.enc'); }
  async read(id, name) {
    await (this.pending.get(id) ?? Promise.resolve());
    try {
      const data = await readFile(this.file(id, name));
      const cipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
      cipher.setAAD(Buffer.from(`${id}:${name}`)); cipher.setAuthTag(data.subarray(12, 28));
      return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString(), this.json.reviver);
    } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  write(id, name, value) {
    if (this.closed.has(id)) return Promise.reject(new Error('Session storage revoked'));
    const previous = this.pending.get(id) ?? Promise.resolve();
    const work = previous.catch(() => {}).then(async () => {
      await mkdir(this.directory(id), { recursive: true, mode: 0o700 });
      const target = this.file(id, name);
      if (value === null) { await rm(target, { force: true }); return; }
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
      cipher.setAAD(Buffer.from(`${id}:${name}`));
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value, this.json.replacer)), cipher.final()]);
      const temp = `${target}.${randomBytes(8).toString('hex')}.tmp`;
      await writeFile(temp, Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), { mode: 0o600 });
      await rename(temp, target);
    });
    this.pending.set(id, work);
    work.finally(() => { if (this.pending.get(id) === work) this.pending.delete(id); }).catch(() => {});
    return work;
  }
  async remove(id) {
    const directory = this.directory(id); // exact, validated UUID beneath the session root
    this.closed.add(id);
    await (this.pending.get(id) ?? Promise.resolve()).catch(() => {});
    await rm(directory, { recursive: true, force: true });
    this.pending.delete(id);
  }
  async sessions() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    return (await readdir(this.root)).filter(validId);
  }
}
