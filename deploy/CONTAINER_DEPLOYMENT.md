# Frontend container deployment

The production frontend is built once in GitHub Actions and deployed as an
immutable image. Production does not run `npm ci` or `next build`.

## Pipeline

1. A push to `main` runs type checking, lint, tests, and the Next.js build.
2. CI builds and pushes both the commit SHA tag and `latest` to GHCR.
3. The deploy job pulls the exact SHA-tagged image on the GitHub runner, streams
   it to production over SSH, and fast-forwards the deployment scripts.
4. `deploy-container.sh` grants the container's fixed runtime group read-only
   access to the mounted signing keys and verifies key readability as the
   image's final non-root user.
5. The script runs `prisma migrate deploy` from the immutable release image
   using the server-owned runtime environment. A migration failure stops the
   release before the inactive container or Nginx is changed.
6. The script starts the inactive blue/green slot on port 3002 or 3003, then
   waits for `/api/health`.
7. After the local health check passes, the script atomically changes the Nginx
   upstream and checks the public health endpoint.
8. If either key preflight, Nginx validation, or the public check fails, the old
   upstream stays live. On success, the previous container is stopped but
   retained for rollback.
9. Rollback validates that the retained image can read, parse, and use the
   mounted signing-key pair before restarting it or changing Nginx.

Runtime configuration remains on the server:

- `/opt/genilink-platform/.env` remains the source of truth. Before `docker run`,
  `prepare-docker-env.sh` writes a mode-0600 temporary Docker env file, removes
  dotenv-style outer quotes, and validates the selected SMS provider's required
  settings. The temporary file is deleted when deployment exits.
- `/opt/genilink-platform/.keys` is mounted read-only at `/app/.keys`. The
  directory is mode `0750` and `private.pem`/`public.pem` are mode `0640`, owned
  by `root:65533`; the image's `nextjs` user uses that fixed group. The group ID
  remains compatible with the retained previous container so rollback does not
  lose signing-key access. `deploy/container-runtime.env` is the shared source
  of truth for this runtime group contract across the image, deploy script, and
  CI tests.
- Neither file is copied into the image or uploaded to GHCR.

Database migrations in production must follow expand/contract compatibility:
the migration deployed with a new image may only add or relax schema used by
the currently active release. Destructive drops, renames, and incompatible
constraint changes require a later release after all rollback candidates stop
depending on the old schema. Container rollback changes application traffic;
it does not reverse database migrations.

## GitHub Actions secrets

The repository needs these Actions secrets:

- `PROD_HOST`
- `PROD_USER`
- `PROD_SSH_KEY`
- `PROD_KNOWN_HOSTS`

The workflow uses its short-lived `GITHUB_TOKEN` only on the ephemeral GitHub
runner. Production receives the verified image over SSH and stores no registry
credential.

## Operations

Show the active image and slot:

```bash
cat /opt/genilink-deploy/active-slot
cat /opt/genilink-deploy/active-image
docker ps -a --filter label=cn.genilink.role=frontend
```

Roll back to the retained previous container:

```bash
sudo /opt/genilink-platform/deploy/deploy-container.sh rollback
```

The first container release migrates from the legacy PM2 process. Automatic
rollback becomes available after two successful container releases; until then,
port 3001 remains the legacy fallback.
