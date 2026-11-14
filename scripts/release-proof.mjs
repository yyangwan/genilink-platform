import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const checkoutCheck = 'Verify cloud checkout revision';
const requiredJobs = [
  ['build', [
    checkoutCheck, 'Install dependencies', 'Generate Prisma client',
    'Validate and apply database migrations', 'Type check', 'Lint', 'Run tests',
    'Test deployment environment normalization', 'Test marketing upstream contract gate',
    'Test container key permission preparation', 'Validate context retry scheduler',
  ]],
  ['Build and publish production image', [checkoutCheck, 'Build immutable image', 'Smoke test image migration runtime', 'Smoke test image signing-key access']],
];

export async function findReleaseProof({api, sha, repository, branch, releaseTree}) {
  const pulls = await api(`commits/${sha}/pulls?per_page=100`);
  const pull = pulls.find((candidate) => candidate.merged_at
    && candidate.merge_commit_sha === sha
    && candidate.base.ref === branch
    && candidate.head.repo?.full_name === repository);
  if (!pull || !/^[a-f0-9]{40}$/.test(pull.head.sha)) return null;

  const {workflow_runs: runs} = await api(
    `actions/workflows/ci.yml/runs?event=pull_request&status=success&head_sha=${pull.head.sha}&per_page=5`,
  );
  for (const run of runs) {
    const prefix = `PR #${pull.number} validation `;
    if (run.event !== 'pull_request' || run.conclusion !== 'success'
      || run.head_sha !== pull.head.sha || run.head_repository?.full_name !== repository
      || !run.display_title.startsWith(prefix)) continue;
    // The run API reports the PR head. The workflow records the synthetic merge
    // SHA that both jobs actually checked out and validated in its run name.
    const testedSha = run.display_title.slice(prefix.length);
    if (!/^[a-f0-9]{40}$/.test(testedSha)) continue;
    const commit = await api(`git/commits/${testedSha}`);
    if (commit.parents.length !== 2 || commit.parents[1].sha !== pull.head.sha
      || commit.tree.sha !== releaseTree) continue;
    const {jobs} = await api(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    const complete = requiredJobs.every(([name, steps]) => jobs.some((job) =>
      job.name === name && job.conclusion === 'success'
      && steps.every((step) => job.steps.some((entry) => entry.name === step && entry.conclusion === 'success')),
    ));
    if (complete) return run.id;
  }
  return null;
}

async function main() {
  const {GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_REF_NAME, GITHUB_SHA, GITHUB_TOKEN, GITHUB_OUTPUT} = process.env;
  const api = async (path) => {
    const result = await fetch(`${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/${path}`, {
      headers: {Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json'},
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error(`GitHub API returned ${result.status}`);
    return result.json();
  };

  let run = null;
  try {
    const releaseTree = execFileSync('git', ['rev-parse', `${GITHUB_SHA}^{tree}`], {encoding: 'utf8'}).trim();
    run = await findReleaseProof({
      api, sha: GITHUB_SHA, repository: GITHUB_REPOSITORY, branch: GITHUB_REF_NAME, releaseTree,
    });
  } catch (error) {
    console.warn(`Could not verify prior PR validation: ${error.message}`);
  }
  appendFileSync(GITHUB_OUTPUT, `verified=${run !== null}\n`);
  console.log(run === null ? 'Full cloud validation is required.' : `Reusing cloud validation from PR run ${run}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
