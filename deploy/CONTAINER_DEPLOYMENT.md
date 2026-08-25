# Frontend container deployment

The production frontend is built once in GitHub Actions and deployed as an
immutable image. Production does not run `npm ci` or `next build`.

## Pipeline

1. A push to `main` runs type checking, lint, tests, and the Next.js build.
2. CI builds and pushes both the commit SHA tag and `latest` to GHCR.
3. The deploy job pulls the exact SHA-tagged image on the GitHub runner, streams
   it to production over SSH, and fast-forwards the deployment scripts.
4. `deploy-container.sh` starts the inactive blue/green slot on port 3002 or
   3003, then waits for `/api/health`.
5. After the local health check passes, the script atomically changes the Nginx
   upstream and checks the public health endpoint.
6. If either Nginx validation or the public check fails, the old upstream stays
   live. On success, the previous container is stopped but retained for rollback.

Runtime configuration remains on the server:

- `/opt/genilink-platform/.env` remains the source of truth. Before `docker run`,
  `prepare-docker-env.sh` writes a mode-0600 temporary Docker env file, removes
  dotenv-style outer quotes, and validates the selected SMS provider's required
  settings. The temporary file is deleted when deployment exits.
- `/opt/genilink-platform/.keys` is mounted read-only at `/app/.keys`.
- Neither file is copied into the image or uploaded to GHCR.

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
