import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { APPS, nextBuildNumber, installProvisioningProfile } from '../scripts/ci-testflight-prepare.mjs';
import { CODEMAGIC_APP_ID, CODEMAGIC_BRANCH, TESTFLIGHT_GROUP, configureTestFlightCredentials, createCodemagicClient } from '../scripts/codemagic-local.mjs';
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
    assert.ok(text.includes(TESTFLIGHT_GROUP));
    assert.match(text, /api_key: \$VELOXION_APPLE_PRIVATE_KEY/);
    assert.doesNotMatch(text, /- appstore_credentials|auth: integration/);
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

test('downloaded profiles are installed for current and legacy Xcode without unsafe file names', () => {
  const home = mkdtempSync(join(tmpdir(), 'veloxion-profile-install-'));
  try {
    const profile = join(home, 'fixture.mobileprovision');
    writeFileSync(profile, 'fixture-profile');
    const uuid = '7cba2840-aa32-4a4b-a949-18c2ee132c47';
    assert.equal(installProvisioningProfile(profile, `<key>UUID</key><string>${uuid}</string>`, home), uuid);
    for (const directory of ['Library/Developer/Xcode/UserData/Provisioning Profiles', 'Library/MobileDevice/Provisioning Profiles']) {
      assert.equal(readFileSync(join(home, directory, uuid + '.mobileprovision'), 'utf8'), 'fixture-profile');
    }
    assert.throws(() => installProvisioningProfile(profile, '<key>UUID</key><string>../../bad</string>', home));
  } finally { rmSync(home, { recursive: true, force: true }); }
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

test('new Apple credentials are scoped to an isolated app group and stored as secrets', async () => {
  const calls = [];
  const names = ['VELOXION_APPLE_KEY_ID', 'VELOXION_APPLE_ISSUER_ID', 'VELOXION_APPLE_PRIVATE_KEY'];
  const results = [{ data: [] }, { data: { id: 'b'.repeat(24), name: TESTFLIGHT_GROUP } }, { data: [] }, null,
    { data: names.map(name => ({ name, secure: true, value: null })) }];
  const report = await configureTestFlightCredentials({ token: 'fixture-token', credentials: { keyId: 'fixture-id', issuerId: 'fixture-issuer', privateKey: { export: () => 'fixture-private-pem' } },
    fetchImpl: async (url, options) => { calls.push({ url, options }); const value = results.shift(); return new Response(value === null ? null : JSON.stringify(value), { status: value === null ? 201 : 200 }); } });
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => new URL(call.url).origin === 'https://codemagic.io' && call.options.redirect === 'error'));
  assert.equal(JSON.parse(calls[1].options.body).name, TESTFLIGHT_GROUP);
  const imported = JSON.parse(calls[3].options.body);
  assert.equal(imported.secure, true);
  assert.deepEqual(imported.variables.map(v => v.name), names);
  assert.ok(!JSON.stringify(report).includes('fixture-private-pem'));
});
