import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export function classifyRelease(paths) {
  let server = false;
  let gateway = false;
  for (const path of paths) {
    if (path.startsWith('deploy/mobile-gateway/') || path === '.github/workflows/mobile-gateway.yml') {
      gateway = true;
    } else if (!['AGENTS.md', 'CHANGELOG.md', 'VERSION', 'deploy/RELEASE_SCOPES.md'].includes(path)) {
      // Unknown paths fail safe: never silently omit a possible server dependency.
      server = true;
    }
  }
  return {server, gateway};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const base = args[args.indexOf('--base') + 1];
  const head = args[args.indexOf('--head') + 1];
  if (!args.includes('--base') || !args.includes('--head') || !base || !head) {
    throw new Error('Usage: node scripts/release-scope.mjs --base REF --head REF');
  }
  const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head], {encoding: 'utf8'})
    .split('\0').filter(Boolean);
  const scope = classifyRelease(paths);
  console.log(JSON.stringify({...scope, files: paths}));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `server=${scope.server}\ngateway=${scope.gateway}\n`);
  }
}
