import makeWASocket, { BufferJSON, initAuthCreds, proto, Browsers } from '@whiskeysockets/baileys';

export { BufferJSON };
const logger = { level: 'silent', child() { return this; }, trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {} };

export async function authentication(store, id) {
  const creds = await store.read(id, 'creds') ?? initAuthCreds();
  return {
    state: { creds, keys: {
      async get(type, ids) {
        const result = {};
        await Promise.all(ids.map(async key => {
          let value = await store.read(id, `${type}:${key}`);
          if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
          result[key] = value;
        }));
        return result;
      },
      async set(values) {
        for (const [type, keys] of Object.entries(values)) {
          for (const [key, value] of Object.entries(keys)) await store.write(id, `${type}:${key}`, value ?? null);
        }
      },
    } },
    save: () => store.write(id, 'creds', creds),
  };
}

export function socketFactory(auth) {
  return makeWASocket({ auth, logger, browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false, syncFullHistory: false,
    connectTimeoutMs: 30000, defaultQueryTimeoutMs: 15000,
    generateHighQualityLinkPreview: false, getMessage: async () => undefined,
  });
}
