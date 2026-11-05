export function normalizeJid(jid = '') {
  return typeof jid === 'string' ? jid.replace(/:\d+@/, '@') : '';
}

export function accountIdentity(user) {
  const jid = normalizeJid(user?.id);
  if (!/^\d{7,20}@s\.whatsapp\.net$/.test(jid)) throw new Error('Unable to identify linked account');
  return { account: jid.split('@')[0], jid, aliases: new Set([jid, normalizeJid(user?.lid)].filter(Boolean)) };
}

export function selfCommand(message, user, now = Math.floor(Date.now() / 1000)) {
  if (!message?.key?.fromMe || typeof message.key.id !== 'string' || !message.key.id || message.key.id.length > 100) return null;
  let identity;
  try { identity = accountIdentity(user); } catch { return null; }
  if (!identity.aliases.has(normalizeJid(message.key.remoteJid))) return null;
  const timestamp = Number(message.messageTimestamp);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 300) return null;
  const body = message.message?.ephemeralMessage?.message ?? message.message;
  if (body?.extendedTextMessage?.contextInfo?.isForwarded || body?.messageContextInfo?.isForwarded) return null;
  const text = body?.conversation ?? body?.extendedTextMessage?.text;
  if (typeof text !== 'string' || text.length > 1000) return null;
  const command = text.match(/^\/ticla(?:\s+([\s\S]*))?$/i);
  if (!command) return null;
  return { event: 'message', account: identity.account, event_id: message.key.id,
           text: command[1]?.trim() || 'help', sent_at: timestamp, self_chat: true };
}
