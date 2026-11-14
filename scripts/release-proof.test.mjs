import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findReleaseProof} from './release-proof.mjs';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const repo = 'owner/project';
const sha = 'a'.repeat(40);
const head = 'b'.repeat(40);
const tree = 'c'.repeat(40);
const testedSha = 'e'.repeat(40);

function fixture() {
  const pull = {number: 7, merged_at: '2026-11-14', merge_commit_sha: sha, base: {ref: 'main'}, head: {sha: head, repo: {full_name: repo}}};
  const commit = {tree: {sha: tree}, parents: [{sha: 'd'.repeat(40)}, {sha: head}]};
  const run = {id: 42, event: 'pull_request', conclusion: 'success', head_sha: head, head_repository: {full_name: repo}, display_title: `PR #7 validation ${testedSha}`};
  const jobs = [...workflow.matchAll(/^  (build|container):\n([\s\S]*?)(?=^  [\w-]+:)/gm)].map(([, id, definition]) => ({
    name: id === 'build' ? 'build' : 'Build and publish production image',
    conclusion: 'success',
    steps: [...definition.matchAll(/^      - name: (.*)$/gm)].map(([, name]) => ({name, conclusion: 'success'})),
  }));
  const calls = [];
  const api = async (path) => {
    calls.push(path);
    if (path === `commits/${sha}/pulls?per_page=100`) return [pull];
    if (path === `git/commits/${testedSha}`) return commit;
    if (path === `actions/workflows/ci.yml/runs?event=pull_request&status=success&head_sha=${head}&per_page=5`) return {workflow_runs: [run]};
    if (path === 'actions/runs/42/jobs?filter=latest&per_page=100') return {jobs};
    throw new Error(`Unexpected API call: ${path}`);
  };
  return {pull, commit, run, jobs, calls, check: () => findReleaseProof({api, sha, repository: repo, branch: 'main', releaseTree: tree})};
}

test('reuses a complete PR run for the identical tree after a squash changes the SHA', async () => {
  assert.equal(await fixture().check(), 42);
});

test('falls back when the merge adds files outside the tested tree', async () => {
  const data = fixture();
  data.commit.tree.sha = 'd'.repeat(40);
  assert.equal(await data.check(), null);
  assert.equal(data.calls.length, 3);
});

test('falls back when the PR is from a fork or the release commit does not match', async () => {
  const fork = fixture();
  fork.pull.head.repo.full_name = 'fork/project';
  assert.equal(await fork.check(), null);
  const unrelated = fixture();
  unrelated.pull.merge_commit_sha = head;
  assert.equal(await unrelated.check(), null);
});

test('falls back for a different PR, a different tested head or a skipped source or image check', async () => {
  const other = fixture();
  other.run.display_title = `PR #8 validation ${testedSha}`;
  assert.equal(await other.check(), null);
  const unlinked = fixture();
  unlinked.commit.parents[1].sha = sha;
  assert.equal(await unlinked.check(), null);
  for (const name of ['Verify cloud checkout revision', 'Run tests', 'Smoke test image migration runtime']) {
    const data = fixture();
    const step = data.jobs.flatMap((job) => job.steps).find((item) => item.name === name);
    assert.ok(step, name);
    step.conclusion = 'skipped';
    assert.equal(await data.check(), null, name);
  }
});
