# Third-party notices

TiclaSec uses third-party open-source packages and container images. Each
component remains governed by its own license.

The authoritative dependency inventories are:

- `pyproject.toml` for Python packages.
- `web/package-lock.json` for the web application.
- `whatsapp-bridge/package-lock.json` for the optional messaging bridge.
- `docker-compose.yml`, `docker-compose.coolify.yml`, and `docker/` for base
  container images.

Before distributing a binary or container bundle, generate and retain a
license inventory for the exact build. This file is a provenance pointer, not
a replacement for dependency license texts.

TiclaSec is derived in part from VoidAccess under the MIT License. The retained
copyright and permission notice is in `LICENSE`.
