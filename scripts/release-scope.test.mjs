import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {classifyRelease} from './release-scope.mjs';

test('gateway code, tests and bundled browser are gateway only', () => {
  assert.deepEqual(classifyRelease(['deploy/mobile-gateway/gateway-agent.ps1', 'deploy/mobile-gateway/browser-runtime/package-lock.json', 'VERSION', 'CHANGELOG.md']), {server: false, gateway: true});
});
test('client, server, migrations and shared dependencies require server release', () => {
  for (const path of ['src/app/page.tsx', 'src/app/api/health/route.ts', 'prisma/schema.prisma', 'package-lock.json', 'Dockerfile', 'deploy/deploy-container.sh', '.github/workflows/ci.yml', 'unknown-new-runtime/file']) {
    assert.deepEqual(classifyRelease([path]), {server: true, gateway: false}, path);
  }
});
test('mixed changes release both independently', () => {
  assert.deepEqual(classifyRelease(['src/lib/capture.ts', 'deploy/mobile-gateway/handlers/kimi-app.ps1']), {server: true, gateway: true});
});
test('release instructions and metadata alone deploy neither system', () => {
  assert.deepEqual(classifyRelease(['AGENTS.md', 'deploy/RELEASE_SCOPES.md', 'VERSION', 'CHANGELOG.md']), {server: false, gateway: false});
  assert.deepEqual(classifyRelease([]), {server: false, gateway: false});
});
test('gateway workflow is scoped to gateway', () => {
  assert.deepEqual(classifyRelease(['.github/workflows/mobile-gateway.yml']), {server: false, gateway: true});
});
test('cross-boundary renames represented as deletion/addition retain both scopes', () => {
  assert.deepEqual(classifyRelease(['src/old.ts', 'deploy/mobile-gateway/new.ps1']), {server: true, gateway: true});
});
test('CLI executes and compares exact git revisions', () => {
  const env = {...process.env};
  delete env.GITHUB_OUTPUT;
  const result = execFileSync(process.execPath, [fileURLToPath(new URL('./release-scope.mjs', import.meta.url)), '--base', 'HEAD', '--head', 'HEAD'], {encoding: 'utf8', env});
  assert.deepEqual(JSON.parse(result), {server: false, gateway: false, files: []});
});
test('workflow gates both independent job groups before existing cloud chain', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /gateway:\s+name:[^\n]+\s+needs: changes\s+if: needs\.changes\.outputs\.gateway == 'true'/);
  assert.match(workflow, /build:\s+needs: changes\s+if: needs\.changes\.outputs\.server == 'true'/);
  assert.match(workflow, /container:[\s\S]*?needs: build/);
  assert.match(workflow, /deploy:[\s\S]*?needs: container/);
});
