# Deploy TiclaSec with Coolify

This deployment publishes only the Next.js web service. FastAPI, PostgreSQL,
Tor, and the optional WhatsApp bridge remain on the private Compose network.

## Server baseline

- A Coolify server with at least 4 GB RAM; 8 GB is recommended for builds and
  concurrent investigations.
- A DNS `A` record pointing the application hostname to the Coolify server.
- This `ticlasec` directory pushed to a private Git repository. Do not push the
  parent workspace, `.env`, research keys, annotation databases, or private
  generator labels.

## Create the resource

1. In Coolify, create a project and production environment.
2. Add the private Git repository through a GitHub App or read-only deploy key.
3. Select **Docker Compose** as the build strategy.
4. Use `/` as the base directory and `/docker-compose.coolify.yml` as the
   Compose location.
5. Add a domain to the `nextjs` service using internal port 3000, for example
   `https://ticlasec.example.com:3000`.
6. Do not create domains or public port mappings for `fastapi`, `postgres`,
   `tor`, or `whatsapp-bridge`.

## Required environment variables

Generate each value separately. Use hexadecimal for the PostgreSQL password so
it remains safe when embedded in a connection URL.

```sh
python3 -c "import secrets; print(secrets.token_hex(32))"
python3 -c "import secrets; print(secrets.token_hex(32))"
python3 -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
```

Set the results in Coolify:

```env
POSTGRES_PASSWORD=<first hexadecimal value>
JWT_SECRET=<second hexadecimal value>
TICLASEC_MFA_KEY=<URL-safe base64 value>
PRODUCT_NAME=TiclaSec
NEXT_PUBLIC_PRODUCT_NAME=TiclaSec
NEXT_PUBLIC_PRODUCT_LONG_NAME=AI Threat Collection & Intelligence System
PLAYWRIGHT_ENABLED=false
TICLASEC_RESEARCH_MODE=false
DEFAULT_MODEL=gpt-4o-mini
OPENAI_API_KEY=<your existing OpenAI API key>
```

Provider and enrichment keys not in use may remain empty. OpenRouter remains
optional and is not used unless an OpenRouter model is explicitly selected.
Keep production values in Coolify, never in a committed `.env` file.

## First administrator

Migrations create `admin@ticlasec.tech` with an inaccessible random password.
After the first successful deployment, open a terminal for the `fastapi`
service and run the interactive reset command:

```sh
python scripts/reset_password.py admin@ticlasec.tech --new-email you@example.com --no-force-reset
```

The command prompts for the password without placing it in shell history.

## Verification

1. Confirm all five services are healthy in Coolify.
2. Open `https://your-domain.example/api/health`.
3. Sign in with the administrator account.
4. Open Evaluation and download the `SYN-001`–`SYN-050` corpus. Confirm its
   dataset SHA-256 is
   `c4f1a6228611512fe769206d732ab08dcead5ebf20ebd420bdb2bf782a9be7b1`.
5. Run a built-in synthetic investigation before enabling live collection.

## Persistence and backups

Back up the `postgres_data`, `monitors_data`, `tor_data`, and—when used—the
WhatsApp volumes. Named volumes survive normal redeployments but are not
backups. Test a restore before relying on the installation.
