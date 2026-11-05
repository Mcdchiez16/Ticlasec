# Channels and multi-link monitoring

Monitoring supports up to 25 HTTP/HTTPS links per watchlist (one per line). Duplicate links are removed. Existing single-link watches still work. Each target has its own change baseline and alerts. Failed fetches do not replace a successful baseline. The scheduler allows at most one running check per watchlist and three concurrent target checks.

Check Frequency → Custom accepts minutes, hours or days, between 30 minutes and 30 days. This is an elapsed interval, not a daily clock-time schedule. Checks run while the backend is running; missed overlapping checks are coalesced, not queued indefinitely.

## Telegram setup (operator)

1. Create or use your bot from Telegram's official **@BotFather**. Keep the bot token private; do not paste it in chats, screenshots, source files or client-side environment variables.
2. Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (without @) and `TELEGRAM_WEBHOOK_SECRET` to the server's untracked `.env`. Generate a separate webhook secret using `openssl rand -hex 32`. Never reuse the bot token as the webhook secret.
3. Use an HTTPS domain or a deliberately configured development tunnel for the web app. Telegram cannot call `localhost:3001`. The callback is `https://YOUR-DOMAIN/api/channels/webhooks/telegram`. Do not expose PostgreSQL, Meilisearch or the Docker socket. This project’s local Compose port bindings are not a production ingress configuration.
4. Apply the private environment: `docker compose --env-file .env up -d --no-deps fastapi`.
5. Register the callback explicitly (this changes Telegram’s webhook for your bot):

   ```sh
   docker compose --env-file .env exec -T fastapi python -m scripts.configure_telegram --public-url https://YOUR-DOMAIN
   ```

   Registration verifies that the configured token belongs to the bot username. It does not print credentials or discard pending updates. Do not use the same bot for another webhook-based application.

6. Sign in → **Monitoring → Channels**. Choose the investigation model, accept the provider disclosure, and click **Connect Telegram**. Open the one-time link and press Start in your own private bot chat. The page changes to Connected only after the authenticated webhook links that chat. Codes expire after 10 minutes; never share a linking code. Click Refresh connections if needed.

## WhatsApp QR connection (local default, experimental)

The local Docker setup defaults to `WHATSAPP_MODE=qr`. It uses the unofficial Baileys linked-device library; **no Meta developer account, business API token, public webhook, or paid QR gateway is required**. It is not endorsed by WhatsApp. Protocol changes, disconnections and account restrictions are possible. Use a dedicated test number for a project demonstration. This is not a supported enterprise/global-scale WhatsApp service.

1. Build/start `whatsapp-bridge`, recreate `fastapi` to mount its private secret, and rebuild/recreate `nextjs` after updating this code. The backend entrypoint applies migration `0040_whatsapp_qr`. Example: `docker compose --env-file .env up -d --build whatsapp-bridge fastapi nextjs`.
2. Sign in → **Monitoring → Channels**. Select a model, accept the messaging disclosure and the separate unofficial linked-device disclosure, then click **Show WhatsApp QR**.
3. On your own phone, open WhatsApp → **Settings** (or ⋮ on Android) → **Linked devices → Link a device**. Scan the displayed QR. Codes refresh automatically; do not share, screenshot or publish them.
4. Wait for **Connected**, then open **Message yourself** and send `/ticla help`, `/ticla cases`, or `/ticla investigate <topic>`. The `/ticla` prefix is required for this mode. Messages to/from other people, groups, historical sync and attachments do not trigger commands.
5. Keep the bridge and backend running. Monitoring alerts and replies go only to your linked account's self-chat, never an arbitrary recipient. There is no Meta Cloud API 24-hour template window in this mode, but delivery still depends on the linked device staying connected.

Each signed-in app user has a separate session. A phone number can only belong to one app user. Scanning links a **companion device with account access**: filtering commands does not remove the underlying privileges of a WhatsApp linked device. The application does not retain other conversation bodies or full history; commands, queued replies and case records have the application's normal retention. Protect the host and the messaging account.

The bridge has no published host port and accepts backend requests only with a separately generated secret. The backend mounts that secret read-only; the bridge does not receive the app's JWT signing secret. Device credentials, signal keys and a bounded pending-command queue are encrypted with AES-256-GCM on `whatsapp_sessions`; the encryption key lives in the same protected volume. This protects against an isolated session-file disclosure, **not host/root or whole-volume compromise**. Backups containing both the key and files can decrypt sessions; treat the whole volume as sensitive. QR images are transient, authenticated and uncached. `WHATSAPP_MAX_SESSIONS` defaults to 10 (maximum 50 per process), not a global scaling guarantee.

**Disconnect WhatsApp** immediately revokes app chat access and queued responses. A durable job attempts device logout and removes the local encrypted session. Offline/stopped sessions cannot guarantee WhatsApp-side logout; remove the device directly in the phone's **Linked devices** screen to ensure immediate WhatsApp-side revocation. Reconnect to change the model. If WhatsApp logs out a device, disconnect in Channels before scanning again. Manual phone pairing is necessary to validate delivery with your actual account; automated tests use simulated sockets, not a real number.

## Optional official WhatsApp Cloud API mode

Set `WHATSAPP_MODE=cloud` to use Meta's official WhatsApp Business Cloud API instead. Disconnect existing QR links **before** changing modes and verify the device is removed on the phone. Configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_NUMBER` (international digits), `WHATSAPP_APP_SECRET`, a separately generated `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_API_VERSION` (the supported `vNN.0` version from your Meta app dashboard).

Register `https://YOUR-DOMAIN/api/channels/webhooks/whatsapp` in Meta's webhook configuration, use the same verify token, and subscribe to the WhatsApp Business account's `messages` events. Recreate the backend with the environment, then link the account from Channels by sending its one-time command to the configured business number.

Free-form replies and monitoring alerts are sent only within 24 hours of the user's last inbound message. Outside that window, alerts stay in the web app; message the business number again to reopen the window. Approved outbound template messages are **not implemented**. Provider setup, permissions, billing and public HTTPS hosting remain operator responsibilities. “Ready to link” means settings exist; it is not a provider health check.

## Using your connected chat

- `help`: show commands.
- `investigate <topic>`: queue an evidence-collection investigation, Fast depth / Global scope, using the model chosen when linking and the linked account's API credentials.
- `cases`: list your five most recent case IDs.
- `status <case ID>`: show status, current step and page/entity counts.
- `brief <case ID>`: retrieve the stored evidence briefing (up to 3,500 characters; use the web app for the full report and evidence).
- `monitors`: list your watchlists.

A leading slash is optional for Telegram and Cloud API. For WhatsApp QR, always use `/ticla` followed by the command in Message yourself. This is a command interface, not unrestricted conversational AI. Ask the commands explicitly; normal chat text does not trigger collection or spend on a model. No automatic completed-case push is enabled; use `status` / `brief`. Watchlist alerts can be selected separately in the creation form after connecting.

Disconnect from Channels to revoke chat commands and connected-account alerts, including queued replies. Reconnect to change the model. Deactivated accounts and pending password resets cannot use chat commands. Bot chats are an additional access method: protect the messaging account and revoke it if the phone or chat is compromised. Enabling web MFA does not require a fresh OTP for each message after an explicit account link.

## Security and delivery

Telegram authenticates webhooks with its secret-token header; group, channel and bot messages are ignored. WhatsApp Cloud API signatures are checked against the exact request body and the configured phone-number ID. QR mode uses a separate private bridge credential and a session-bound self-chat identity instead. Short-lived API link codes are hashed at rest and single-use. Every case query and monitor alert is owner-scoped. No provider API or linked-device credentials are returned to the browser (only the transient pairing QR).

Webhook receipts, investigation creation and reply enqueueing commit together, so duplicate inbound deliveries cannot create duplicate investigations. Replies use the durable queue with a dedicated worker and three delivery attempts. Outbound delivery is at-least-once (an acknowledgement lost at the provider can result in a repeated reply), not guaranteed exactly-once. Failed replies are recorded as failed `channel_reply` jobs; a provider acceptance is not proof the user read a message. The database stores replay IDs for seven days; incoming messages older than one hour are ignored. Source links in briefings and connected-channel alerts are defanged and previews disabled. Messages and briefings sent to Telegram/Meta leave this server; link only with that understanding.

## Provider references

- [Baileys: unofficial linked-device library and usage caveats](https://github.com/WhiskeySockets/Baileys)
- [Baileys QR authentication](https://github.com/WhiskeySockets/docs/blob/main/authentication/qr-code.mdx)

- [Telegram Bot API: webhooks and sendMessage](https://core.telegram.org/bots/api)
- [Telegram webhook deployment guide](https://core.telegram.org/bots/webhooks)
- [Meta sample: webhook signatures and owner-scoped access](https://github.com/fbsamples/business-messaging-sample-tech-provider-app/blob/main/CONTRIBUTING.md)
- [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/)
