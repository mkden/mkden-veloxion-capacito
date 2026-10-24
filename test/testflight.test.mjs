import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { copyInternalTesters } from '../scripts/app-store-testflight.mjs';
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

test('EURO internal testing only reuses existing RUS internal testers and is idempotent', async () => {
  let group;
  let linkedBuilds = [];
  let testers = [];
  const writes = [];
  const credentials = { keyId: 'fixture', issuerId: 'fixture', privateKey: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey };
  const build = { id: 'euro-build', type: 'builds', attributes: { version: '202610240902', processingState: 'VALID' } };
  const app = { id: APPS.euro.appId, attributes: { bundleId: APPS.euro.bundleId } };
  const user = { id: 'fixture-user', attributes: { username: 'fixture@example.test', roles: ['MARKETING'], allAppsVisible: true } };
  let visibleApps = [{ id: APPS.rus.appId }];
  const client = {
    request: async path => ({ data: path.endsWith('/app') ? app : group }),
    list: async path => {
      if (path.startsWith('/v1/builds?')) return [build];
      if (path === `/v1/apps/${APPS.rus.appId}/betaGroups`) return [{ id: 'internal', type: 'betaGroups', attributes: { isInternalGroup: true } }, { id: 'external', type: 'betaGroups', attributes: { isInternalGroup: false } }];
      if (path === '/v1/betaGroups/internal/betaTesters') return [{ type: 'betaTesters', id: 'existing-tester', attributes: { email: 'fixture@example.test' } }];
      if (path === '/v1/users?limit=200') return [user];
      if (path === '/v1/users/fixture-user/visibleApps') return visibleApps;
      if (path === `/v1/apps/${APPS.euro.appId}/betaGroups`) return group ? [group] : [];
      if (path === '/v1/betaGroups/euro-group/betaTesters') return testers;
      if (path === '/v1/betaGroups/euro-group/builds') return linkedBuilds;
      if (path === `/v1/betaTesters?filter[apps]=${APPS.euro.appId}&limit=200`) return testers;
      throw new Error('Unexpected read: ' + path);
    },
  };
  const fetchImpl = async (url, options) => {
    writes.push(url);
    assert.equal(new URL(url).origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    if (url.endsWith('/v1/betaGroups')) {
      assert.equal(body.data.relationships.app.data.id, APPS.euro.appId);
      assert.equal(body.data.attributes.isInternalGroup, true);
      assert.equal(body.data.attributes.hasAccessToAllBuilds, false);
      group = { ...body.data, id: 'euro-group' };
      return new Response(JSON.stringify({ data: group }), { status: 201 });
    }
    if (url.endsWith('/v1/betaTesters')) {
      assert.equal(body.data.attributes.email, 'fixture@example.test');
      assert.deepEqual(body.data.relationships.betaGroups.data, [{ type: 'betaGroups', id: 'euro-group' }]);
      const tester = { ...body.data, id: 'euro-tester' };
      testers.push(tester);
      return new Response(JSON.stringify({ data: tester }), { status: 201 });
    } else if (url.endsWith('/users/fixture-user/relationships/visibleApps')) {
      assert.deepEqual(body.data, [{ type: 'apps', id: APPS.euro.appId }]);
      visibleApps.push(...body.data);
    } else if (url.endsWith('/relationships/betaTesters')) testers = body.data;
    else if (url.endsWith('/relationships/builds')) linkedBuilds = body.data;
    else throw new Error('Unexpected write');
    return new Response(null, { status: 204 });
  };
  const report = await copyInternalTesters({ credentials, client, buildNumber: build.attributes.version, fetchImpl });
  assert.equal(report.internalTesterCount, 1);
  assert.equal(report.externalInvitations, false);
  assert.equal(writes.length, 3);
  await copyInternalTesters({ credentials, client, buildNumber: build.attributes.version, fetchImpl });
  assert.equal(writes.length, 3);
  user.attributes.allAppsVisible = false;
  await assert.rejects(copyInternalTesters({ credentials, client, buildNumber: build.attributes.version, fetchImpl }));
  assert.equal(writes.length, 3);
  const granted = await copyInternalTesters({ credentials, client, buildNumber: build.attributes.version, grantEuroAppAccess: true, fetchImpl });
  assert.equal(writes.length, 4);
  assert.equal(granted.appAccessAdded, 1);
  assert.deepEqual(user.attributes.roles, ['MARKETING']);
  assert.ok(visibleApps.some(app => app.id === APPS.rus.appId));
  app.id = APPS.rus.appId;
  await assert.rejects(copyInternalTesters({ credentials, client, buildNumber: build.attributes.version, fetchImpl }));
  assert.equal(writes.length, 4);
});
