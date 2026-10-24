import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { createClient } from '../scripts/app-store-api.mjs';
import { certificateMatches, configureEuroSigning, prepareSigningStore, signingFromEmbeddedProfile, validateProfilePlist } from '../scripts/app-store-signing.mjs';

const directory = mkdtempSync(join(tmpdir(), 'veloxion-signing-test-'));
after(() => { assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\veloxion-signing-test-') || resolve(directory).startsWith(resolve(tmpdir()) + '/veloxion-signing-test-')); rmSync(directory, { recursive: true }); });
const store = prepareSigningStore(directory);
const certificatePath = join(directory, 'test.cer.pem');
execFileSync('openssl', ['req', '-x509', '-new', '-key', store.keyPath, '-sha256', '-days', '3', '-subj', '/CN=Test/OU=TEAM123456', '-out', certificatePath], { stdio: 'pipe', windowsHide: true });
const x509 = new X509Certificate(readFileSync(certificatePath));
const certificate = { type: 'certificates', id: 'CERT-EU', attributes: { certificateType: 'DISTRIBUTION', certificateContent: x509.raw.toString('base64'), expirationDate: x509.validTo } };
const bundle = { type: 'bundleIds', id: 'EU-RESOURCE', attributes: { identifier: 'eu.veloxion.app', platform: 'IOS', seedId: 'TEAM123456' } };
const profile = { type: 'profiles', id: 'PROFILE-EU', attributes: { profileType: 'IOS_APP_STORE', profileState: 'ACTIVE', expirationDate: x509.validTo, profileContent: 'test-only' }, relationships: { bundleId: { data: { id: bundle.id } }, certificates: { data: [{ id: certificate.id }] } } };
const plist = `<plist><dict><key>TeamIdentifier</key><array><string>TEAM123456</string></array><key>Entitlements</key><dict><key>application-identifier</key><string>TEAM123456.eu.veloxion.app</string><key>aps-environment</key><string>production</string><key>get-task-allow</key><false/></dict></dict></plist>`;

test('local signing key and CSR are stable; certificates must match the local public key', () => {
  const repeated = prepareSigningStore(directory);
  assert.equal(store.publicKeySha256, repeated.publicKeySha256);
  assert.equal(store.csr, repeated.csr);
  assert.equal(certificateMatches(certificate, store.publicKeySha256), true);
  assert.equal(certificateMatches(certificate, 'wrong'), false);
  assert.equal(certificateMatches({ ...certificate, attributes: { ...certificate.attributes, activated: false } }, store.publicKeySha256), false);
});

test('profile requires EURO identity, production push, correct team and no development/ad-hoc entitlement', () => {
  assert.equal(validateProfilePlist(plist, { teamId: 'TEAM123456' }), true);
  for (const invalid of [plist.replace('eu.veloxion.app', 'io.veloxion.app'), plist.replace('production', 'development'), plist.replace('<false/>', '<true/>'), plist.replace('</dict></plist>', '<key>ProvisionedDevices</key><array/></dict></plist>')]) {
    assert.throws(() => validateProfilePlist(invalid, { teamId: 'TEAM123456' }));
  }
  assert.throws(() => validateProfilePlist(plist, { teamId: 'OTHER12345' }));
});

test('previous successful RUS IPA can supply only a public distribution certificate', () => {
  const source = plist.replace('eu.veloxion.app', 'io.veloxion.app').replace('</dict></plist>', `<key>DeveloperCertificates</key><array><data>${x509.raw.toString('base64')}</data></array></dict></plist>`);
  const result = signingFromEmbeddedProfile(source);
  assert.equal(result.publicKeySha256, store.publicKeySha256);
  assert.equal(result.teamId, 'TEAM123456');
  assert.throws(() => signingFromEmbeddedProfile(source.replace('io.veloxion.app', 'foreign.app')));
});

function fixture({ certificates = [certificate], profiles = [profile], capabilities = true } = {}) {
  const writes = [];
  const client = {
    list: async path => path.startsWith('/v1/bundleIds?') ? [bundle]
      : path.includes('/bundleIdCapabilities') ? capabilities ? ['PUSH_NOTIFICATIONS', 'IN_APP_PURCHASE'].map(capabilityType => ({ attributes: { capabilityType } })) : []
      : path.startsWith('/v1/certificates?') ? certificates : profiles,
    request: async (path, options = {}) => {
      if (!options.method || options.method === 'GET') return { data: profile };
      writes.push({ path, ...options });
      return { data: path === '/v1/profiles' ? profile : certificate };
    },
  };
  return { client, writes };
}

test('valid certificate and EURO profile are reused without Apple writes', async () => {
  const f = fixture();
  const result = await configureEuroSigning(f.client, store, { inspectProfile: () => true, reuseOnly: true });
  assert.equal(result.report.certificateReused, true);
  assert.equal(result.report.profileCreated, false);
  assert.equal(f.writes.length, 0);
});

test('certificate reuse creates only a separate EURO profile', async () => {
  const f = fixture({ profiles: [] });
  const result = await configureEuroSigning(f.client, store, { inspectProfile: () => true, reuseOnly: true });
  assert.equal(result.report.profileCreated, true);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].path, '/v1/profiles');
  assert.equal(f.writes[0].body.data.relationships.bundleId.data.id, bundle.id);
  assert.equal(f.writes[0].body.data.relationships.certificates.data[0].id, certificate.id);
});

test('certificate limit, absent capabilities and unmatched reused certificate stop without revocation', async () => {
  for (const options of [
    { certificates: Array.from({ length: 3 }, (_, id) => ({ ...certificate, id: String(id), attributes: { ...certificate.attributes, certificateContent: 'invalid' } })) },
    { capabilities: false },
  ]) {
    const f = fixture(options);
    await assert.rejects(configureEuroSigning(f.client, store, { inspectProfile: () => true }));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture({ certificates: [] });
  await assert.rejects(configureEuroSigning(f.client, store, { reuseOnly: true }), /No certificate will be created or revoked/);
  assert.equal(f.writes.length, 0);
});

test('API signing writes require a verified EURO bundle and matching public certificate', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const writes = [];
  const client = createClient({ credentials: { keyId: 'TESTKEY123', issuerId: 'test', privateKey }, euroSigning: store, fetchImpl: async (url, options) => {
    const path = new URL(url).pathname;
    if (options.method !== 'GET') writes.push(path);
    return new Response(JSON.stringify({ data: path === '/v1/bundleIds' ? [bundle] : path === '/v1/certificates' ? [certificate] : profile }));
  } });
  const post = id => ({ method: 'POST', body: { data: { type: 'profiles', attributes: { name: 'Veloxion Europe App Store', profileType: 'IOS_APP_STORE' }, relationships: { bundleId: { data: { type: 'bundleIds', id } }, certificates: { data: [{ type: 'certificates', id: certificate.id }] } } } } });
  await assert.rejects(client.request('/v1/profiles', post(bundle.id)));
  await client.list('/v1/bundleIds');
  await assert.rejects(client.request('/v1/profiles', post(bundle.id)));
  await client.list('/v1/certificates');
  await assert.rejects(client.request('/v1/profiles', post('RUS-RESOURCE')));
  await client.request('/v1/profiles', post(bundle.id));
  await assert.rejects(client.request('/v1/certificates/123', { method: 'DELETE' }));
  await assert.rejects(client.request('/v1/certificates', { method: 'POST', body: { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: 'foreign' } } } }));
  assert.deepEqual(writes, ['/v1/profiles']);
});
