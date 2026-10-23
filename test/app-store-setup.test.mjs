import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { AppStoreError, createClient, credentialsFromEnvironment, makeToken } from '../scripts/app-store-api.mjs';
import { BUNDLE_ID, CATALOG, NOTIFICATIONS_URL, configureAppStore, notificationPatch } from '../scripts/app-store-setup.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const credentials = { keyId: 'TESTKEY123', issuerId: '00000000-0000-0000-0000-000000000000', privateKey };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

test('all product metadata fits Apple character limits and never implies a sale price', () => {
  for (const item of CATALOG) {
    assert.ok(item.name.length <= 64);
    for (const localization of item.localizations) {
      assert.ok(localization.name.length >= 2 && localization.name.length <= 30);
      assert.ok(localization.description.length <= 45, localization.description);
      assert.doesNotMatch(localization.description, /[$\u20ac\u20bd]/);
    }
  }
});

function appleFixture() {
  const app = { type: 'apps', id: '1234567890', attributes: { bundleId: BUNDLE_ID } };
  const products = [];
  const versions = new Map();
  const localizations = new Map();
  const writes = [];
  let counter = 0;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    const method = options.method;
    if (method === 'GET') {
      if (path === '/v1/apps') return json({ data: [app] });
      if (path === `/v1/apps/${app.id}`) return json({ data: app });
      if (path.endsWith('/inAppPurchasesV2')) return json({ data: products });
      if (path.endsWith('/versions')) return json({ data: versions.get(path.split('/')[3]) || [] });
      if (path.endsWith('/localizations')) return json({ data: localizations.get(path.split('/')[3]) || [] });
      throw new Error(`Unexpected fixture GET ${path}`);
    }
    const { data } = JSON.parse(options.body);
    writes.push({ path, method, data });
    if (path === '/v2/inAppPurchases') {
      const product = { ...data, id: `product-${++counter}`, attributes: { ...data.attributes, state: 'MISSING_METADATA' } };
      products.push(product);
      return json({ data: product });
    }
    if (path === '/v1/inAppPurchaseVersions') {
      const version = { type: data.type, id: `version-${++counter}`, attributes: { state: 'PREPARE_FOR_SUBMISSION' } };
      versions.set(data.relationships.inAppPurchase.data.id, [version]);
      localizations.set(version.id, []);
      return json({ data: version });
    }
    if (path === '/v2/inAppPurchaseLocalizations') {
      const localization = { ...data, id: `locale-${++counter}` };
      localizations.get(data.relationships.version.data.id).push(localization);
      return json({ data: localization });
    }
    if (path === `/v1/apps/${app.id}` && method === 'PATCH') {
      Object.assign(app.attributes, data.attributes);
      return json({ data: app });
    }
    throw new Error(`Unexpected fixture write ${path}`);
  };
  return { app, products, versions, localizations, writes, client: createClient({ credentials, allowMetadata: true, fetchImpl }) };
}

test('credentials normalize PEM, escaped PEM, JSON PEM and base64 without logging values', () => {
  for (const raw of [pem, pem.replace(/\n/g, '\\n'), JSON.stringify(pem), Buffer.from(pem).toString('base64')]) {
    const result = credentialsFromEnvironment({ APP_STORE_CONNECT_KEY_IDENTIFIER: credentials.keyId, APP_STORE_CONNECT_ISSUER_ID: credentials.issuerId, APP_STORE_CONNECT_PRIVATE_KEY: raw });
    assert.equal(result.privateKey.asymmetricKeyType, 'ec');
  }
  assert.throws(() => credentialsFromEnvironment({}), /Missing App Store Connect credentials/);
  assert.throws(() => credentialsFromEnvironment({ APP_STORE_CONNECT_KEY_ID: 'id', APP_STORE_CONNECT_ISSUER_ID: 'issuer', APP_STORE_CONNECT_PRIVATE_KEY: 'secret-invalid-PEM' }), error => !error.message.includes('secret-invalid-PEM'));
});

test('JWT is short-lived ES256 with correct issuer and audience', () => {
  const [header, payload, signature] = makeToken(credentials, 1700000000).split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'ES256', kid: credentials.keyId, typ: 'JWT' });
  const body = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(body.iss, credentials.issuerId);
  assert.equal(body.aud, 'appstoreconnect-v1');
  assert.equal(body.exp, 1700000300);
  assert.equal(verify('sha256', Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
});

test('untrusted URLs and pagination cannot receive Apple credentials', async () => {
  let calls = 0;
  const client = createClient({ credentials, fetchImpl: async () => { calls++; return json({ data: [], links: { next: 'https://attacker.invalid/v1/apps' } }); } });
  await assert.rejects(client.request('https://attacker.invalid/v1/apps'), /outside the official/);
  assert.equal(calls, 0);
  await assert.rejects(client.list('/v1/apps'), /outside the official/);
  assert.equal(calls, 1);
});

test('pagination follows all pages and refuses repeated links', async () => {
  let page = 0;
  const client = createClient({ credentials, fetchImpl: async () => json(++page === 1 ? { data: [{ id: 'a' }], links: { next: '/v1/apps?cursor=2' } } : { data: [{ id: 'b' }] }) });
  assert.deepEqual(await client.list('/v1/apps'), [{ id: 'a' }, { id: 'b' }]);
  const loop = createClient({ credentials, fetchImpl: async () => json({ data: [], links: { next: '/v1/apps' } }) });
  await assert.rejects(loop.list('/v1/apps'), /pagination loop/);
});

test('pricing, availability, deletion, app submission and unrelated app fields are forbidden', async () => {
  let calls = 0;
  const client = createClient({ credentials, allowMetadata: true, fetchImpl: async () => { calls++; return json({}); } });
  for (const path of ['/v1/inAppPurchasePriceSchedules', '/v1/inAppPurchaseAvailabilities', '/v1/reviewSubmissions']) {
    await assert.rejects(client.request(path, { method: 'POST', body: { data: {} } }), /Write refused/);
  }
  await assert.rejects(client.request('/v2/inAppPurchases/123', { method: 'DELETE' }), /Write refused/);
  await assert.rejects(client.request('/v1/apps/123', { method: 'PATCH', body: { data: { type: 'apps', attributes: { bundleId: 'another.app' } } } }), /Write refused/);
  assert.equal(calls, 0);
});

test('read-only client rejects all writes and errors do not leak Apple response bodies', async () => {
  const client = createClient({ credentials, fetchImpl: async () => new Response('SECRET_RESPONSE_BODY', { status: 403 }) });
  await assert.rejects(client.request('/v1/apps/123', { method: 'PATCH' }), /Read-only mode/);
  await assert.rejects(client.request('/v1/apps'), error => error instanceof AppStoreError && error.status === 403 && !error.message.includes('SECRET_RESPONSE_BODY'));
});

test('EURO bootstrap cannot enable capabilities on a foreign or unverified Bundle ID', async () => {
  const writes = [];
  const client = createClient({ credentials, allowEuroBundle: true, fetchImpl: async (url, options) => {
    if (options.method === 'GET') return json({ data: [{ type: 'bundleIds', id: 'EU-RESOURCE', attributes: { identifier: 'eu.veloxion.app', platform: 'IOS' } }] });
    writes.push(url);
    return json({ data: {} });
  } });
  const capability = id => ({ method: 'POST', body: { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'PUSH_NOTIFICATIONS' }, relationships: { bundleId: { data: { type: 'bundleIds', id } } } } } });
  await assert.rejects(client.request('/v1/bundleIdCapabilities', capability('EU-RESOURCE')), /not authorized/);
  await client.list('/v1/bundleIds?filter[identifier]=eu.veloxion.app');
  await assert.rejects(client.request('/v1/bundleIdCapabilities', capability('RUS-RESOURCE')), /not authorized/);
  await client.request('/v1/bundleIdCapabilities', capability('EU-RESOURCE'));
  assert.equal(writes.length, 1);
  await assert.rejects(client.request('/v1/bundleIds', { method: 'POST', body: { data: { type: 'bundleIds', attributes: { identifier: 'io.veloxion.app', platform: 'IOS', name: 'Wrong' } } } }), /not authorized/);
  await assert.rejects(client.request('/v1/certificates/123', { method: 'DELETE' }), /not authorized/);
});

test('read-only audit plans six consumables without making writes', async () => {
  const fixture = appleFixture();
  const report = await configureAppStore(fixture.client);
  assert.equal(report.appId, fixture.app.id);
  assert.equal(report.products.length, 6);
  assert.equal(report.actions.filter(a => a.action === 'would-create-product').length, 6);
  assert.equal(fixture.writes.length, 0);
  assert.equal(report.notifications.verified, false);
});

test('apply creates six consumables, twelve localizations and V2 URLs, then is idempotent', async () => {
  const fixture = appleFixture();
  const report = await configureAppStore(fixture.client, { apply: true });
  assert.equal(report.products.length, 6);
  assert.equal(fixture.products.length, 6);
  assert.equal(fixture.writes.filter(w => w.path === '/v2/inAppPurchases').length, 6);
  assert.equal(fixture.writes.filter(w => w.path === '/v2/inAppPurchaseLocalizations').length, 12);
  assert.equal(fixture.app.attributes.subscriptionStatusUrl, NOTIFICATIONS_URL);
  assert.equal(fixture.app.attributes.subscriptionStatusUrlVersionForSandbox, 'V2');
  assert.equal(report.notifications.verified, true);
  assert.equal(report.pricesChanged, false);
  const count = fixture.writes.length;
  const repeated = await configureAppStore(fixture.client, { apply: true });
  assert.equal(fixture.writes.length, count);
  assert.deepEqual(repeated.actions, []);
});

test('conflicting notification URL fails before any writes', async () => {
  const fixture = appleFixture();
  fixture.app.attributes.subscriptionStatusUrl = 'https://existing.example/notifications';
  await assert.rejects(configureAppStore(fixture.client, { apply: true }), /Refusing to overwrite/);
  assert.equal(fixture.writes.length, 0);
});

test('wrong existing product type fails before any writes', async () => {
  const fixture = appleFixture();
  fixture.products.push({ id: 'wrong-type', attributes: { productId: CATALOG[5].productId, inAppPurchaseType: 'NON_CONSUMABLE' } });
  await assert.rejects(configureAppStore(fixture.client, { apply: true }), /not Consumable/);
  assert.equal(fixture.writes.length, 0);
});

test('existing custom descriptions and reviewed products are preserved', async () => {
  const fixture = appleFixture();
  await configureAppStore(fixture.client, { apply: true });
  const firstVersion = fixture.versions.get(fixture.products[0].id)[0];
  fixture.localizations.get(firstVersion.id)[0].attributes.description = 'Custom approved business copy';
  const secondVersion = fixture.versions.get(fixture.products[1].id)[0];
  secondVersion.attributes.state = 'IN_REVIEW';
  const count = fixture.writes.length;
  const report = await configureAppStore(fixture.client, { apply: true });
  assert.equal(fixture.writes.length, count);
  assert.equal(fixture.localizations.get(firstVersion.id)[0].attributes.description, 'Custom approved business copy');
  assert.equal(report.products[1].metadata, 'preserved-non-draft');
});

test('notification configuration is idempotent', () => {
  assert.deepEqual(notificationPatch({ subscriptionStatusUrl: NOTIFICATIONS_URL, subscriptionStatusUrlVersion: 'V2', subscriptionStatusUrlForSandbox: NOTIFICATIONS_URL, subscriptionStatusUrlVersionForSandbox: 'V2' }), {});
});

test('offline plan works without credentials and missing credentials fail honestly', () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('APP_STORE_CONNECT_')) delete env[key];
  const plan = spawnSync(process.execPath, ['scripts/app-store-setup.mjs', '--plan'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).products.length, 6);
  const audit = spawnSync(process.execPath, ['scripts/app-store-audit.mjs'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
  assert.equal(audit.status, 1);
  assert.equal(JSON.parse(audit.stdout).success, false);
});

test('setup CI only runs on a dedicated branch and cannot publish an app', () => {
  const source = readFileSync(new URL('../codemagic.yaml', import.meta.url), 'utf8');
  const setup = source.split('  ios-iap-setup:')[1].split('  ios-iap-validation:')[0];
  assert.match(setup, /pattern: iap\/app-store-setup/);
  assert.match(setup, /--apply-metadata/);
  assert.doesNotMatch(setup, /publishing:|submit_to_|build-ipa|pattern: main/);
});
