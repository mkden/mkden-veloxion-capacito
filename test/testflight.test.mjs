import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPS, nextBuildNumber } from '../scripts/ci-testflight-prepare.mjs';
import { CODEMAGIC_APP_ID, CODEMAGIC_BRANCH, createCodemagicClient } from '../scripts/codemagic-local.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function workflow(name) {
  const text = read('codemagic.yaml');
  const start = text.indexOf(`  ${name}:`);
  assert.ok(start > 0);
  const tail = text.slice(start + 2);
  return tail.split(/\n  [a-z][a-z0-9-]+:\r?\n/)[0];
}

test('TestFlight uploads are manual, isolated by region and cannot submit to either review', () => {
  for (const region of ['euro', 'rus']) {
    const text = workflow(`ios-${region}-testflight`);
    assert.match(text, new RegExp(`VELOXION_APP_REGION: ${region}`));
    assert.match(text, new RegExp(`ci-testflight-prepare.mjs ${region}`));
    assert.match(text, new RegExp(`--profile .*${region}\\.mobileprovision`));
    assert.match(text, new RegExp(`verify-ios-ipa.mjs ${region}`));
    assert.match(text, /publishing:/);
    assert.match(text, /submit_to_app_store: false/);
    assert.match(text, /submit_to_testflight: false/);
    assert.doesNotMatch(text, /triggering:|pattern: main|beta_groups:|expire_build_submitted_for_review: true/);
  }
  assert.doesNotMatch(workflow('ios-euro-testflight'), /firebase_credentials|GOOGLE_SERVICE_INFO_PLIST/);
});

test('build numbers advance past previously uploaded builds and keep correct Apple identities', () => {
  assert.equal(nextBuildNumber([], new Date('2026-10-24T08:30:00Z')), '202610240830');
  assert.equal(nextBuildNumber([{ attributes: { version: '202610240830' } }], new Date('2026-10-24T08:30:00Z')), '202610240831');
  assert.equal(APPS.euro.bundleId, 'eu.veloxion.app');
  assert.equal(APPS.rus.bundleId, 'io.veloxion.app');
  assert.notEqual(APPS.euro.appId, APPS.rus.appId);
});

test('build preflight requires a matching private identity and actual IPA identity before upload', () => {
  assert.match(read('scripts/ci-testflight-prepare.mjs'), /find-identity/);
  assert.match(read('scripts/ci-testflight-prepare.mjs'), /validateProfilePlist/);
  assert.match(read('scripts/verify-ios-ipa.mjs'), /CFBundleIdentifier !== APPS\[region\].bundleId/);
  assert.match(read('scripts/verify-ios-ipa.mjs'), /CFBundleVersion/);
  assert.match(read('scripts/verify-ios-ipa.mjs'), /codesign/);
});

test('Codemagic token is never sent to foreign hosts and only two approved build workflows can start', async () => {
  const requests = [];
  const client = createCodemagicClient({ token: 'fixture-secret-token', fetchImpl: async (url, options) => { requests.push({ url, options }); return new Response(JSON.stringify({ buildId: 'a'.repeat(24) })); } });
  const approved = { appId: CODEMAGIC_APP_ID, branch: CODEMAGIC_BRANCH, workflowId: 'ios-euro-testflight' };
  for (const body of [{ ...approved, branch: 'main' }, { ...approved, workflowId: 'ios-release' }, { ...approved, appId: 'another-app' }, { ...approved, environment: { variables: { unsafe: 'value' } } }]) {
    await assert.rejects(client.request('/builds', { method: 'POST', body }));
  }
  await assert.rejects(client.request('https://evil.example/apps'));
  assert.equal(requests.length, 0);
  for (const region of ['euro', 'rus']) await client.request('/builds', { method: 'POST', body: { ...approved, workflowId: `ios-${region}-testflight` } });
  assert.equal(requests.length, 2);
});

test('Codemagic errors never print the server body or token', async () => {
  const client = createCodemagicClient({ token: 'fixture-secret-token', fetchImpl: async () => new Response('sensitive-server-body', { status: 403 }) });
  await assert.rejects(client.request('/apps/' + CODEMAGIC_APP_ID), error => !error.message.includes('fixture-secret-token') && !error.message.includes('sensitive-server-body'));
});
