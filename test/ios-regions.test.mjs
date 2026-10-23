import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGIONS, transformIOSRegion } from '../scripts/prepare-ios-region.mjs';
import { configureEuroBundle } from '../scripts/app-store-euro-bootstrap.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = () => ({ project: read('ios/App/App.xcodeproj/project.pbxproj'), plist: read('ios/App/App/Info.plist'), offline: read('www/index.html') });

test('EURO and RUS have distinct Bundle IDs and isolated website hosts', () => {
  assert.equal(REGIONS.euro.appId, 'eu.veloxion.app');
  assert.equal(REGIONS.euro.url, 'https://veloxion.eu/lk');
  assert.equal(REGIONS.rus.appId, 'io.veloxion.app');
  assert.ok(REGIONS.euro.allowNavigation.every(host => !host.includes('veloxion.io')));
  assert.match(read('capacitor.config.ts'), /process.env.VELOXION_APP_REGION \|\| "rus"/);
});

test('build transformation sets both Xcode Bundle IDs, privacy text and offline region', () => {
  const euro = transformIOSRegion(source(), 'euro');
  assert.equal([...euro.project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = eu.veloxion.app;/g)].length, 2);
  assert.doesNotMatch(euro.project, /PRODUCT_BUNDLE_IDENTIFIER = io.veloxion.app;/);
  assert.match(euro.plist, /<string>Veloxion AI Europe<\/string>/);
  assert.match(euro.plist, /Veloxion uses the camera/);
  assert.match(euro.offline, /data-veloxion-region="euro"/);
  assert.deepEqual(transformIOSRegion(euro, 'euro'), euro);
  assert.deepEqual(transformIOSRegion(euro, 'rus'), source());
});

test('unexpected region or project identifiers are rejected before any edits', () => {
  assert.throws(() => transformIOSRegion(source(), 'china'), /Region must be/);
  const invalid = source();
  invalid.project = invalid.project.replace('PRODUCT_BUNDLE_IDENTIFIER = io.veloxion.app;', 'PRODUCT_BUNDLE_IDENTIFIER = unknown.app;');
  assert.throws(() => transformIOSRegion(invalid, 'euro'), /refusing to modify/);
});

test('native purchase scope is bound to the signed Bundle ID rather than a shared website allowlist', () => {
  const swift = read('ios/App/App/VeloxionPurchasesPlugin.swift');
  assert.match(swift, /case "io.veloxion.app": return \["veloxion.io", "www.veloxion.io"\]/);
  assert.match(swift, /case "eu.veloxion.app": return \["veloxion.eu", "www.veloxion.eu"\]/);
  assert.match(swift, /default: return \[\]/);
  assert.match(swift, /Bundle.main.bundleIdentifier/);
  assert.match(swift, /hasPrefix\(productPrefix\)/);
  assert.doesNotMatch(swift, /hasPrefix\("io.veloxion.app./);
});

test('EURO workflow cannot publish, use a RUS profile or restore RUS Firebase configuration', () => {
  const workflow = read('codemagic.yaml').split('  ios-euro-validation:')[1].split('  ios-iap-setup:')[0];
  assert.match(workflow, /bundle_identifier: eu.veloxion.app/);
  assert.match(workflow, /VELOXION_APP_REGION: euro/);
  assert.doesNotMatch(workflow, /publishing:|submit_to_|firebase_credentials|GOOGLE_SERVICE_INFO_PLIST|bundle_identifier: io.veloxion.app/);
});

function bundleFixture() {
  let bundle;
  const capabilities = [];
  const writes = [];
  return {
    writes,
    client: {
      async list(path) {
        if (path.startsWith('/v1/bundleIds?')) return bundle ? [bundle] : [];
        if (path.includes('/bundleIdCapabilities')) return capabilities;
        if (path.startsWith('/v1/apps?')) return [];
        throw new Error(`Unexpected read ${path}`);
      },
      async request(path, options) {
        writes.push({ path, ...options });
        if (path === '/v1/bundleIds') {
          bundle = { id: 'EU-RESOURCE', type: 'bundleIds', attributes: options.body.data.attributes };
          return { data: bundle };
        }
        if (path === '/v1/bundleIdCapabilities') {
          capabilities.push({ id: String(capabilities.length), attributes: options.body.data.attributes });
          return { data: capabilities.at(-1) };
        }
        throw new Error(`Unexpected write ${path}`);
      },
    },
  };
}

test('EURO bootstrap dry-run does not create identifiers or imply an app exists', async () => {
  const fixture = bundleFixture();
  const report = await configureEuroBundle(fixture.client);
  assert.equal(fixture.writes.length, 0);
  assert.equal(report.appRecord.exists, false);
  assert.equal(report.appRecordCreated, false);
  assert.equal(report.appRecord.bundleId, 'eu.veloxion.app');
});

test('EURO bootstrap only registers its own bundle/capabilities and is idempotent', async () => {
  const fixture = bundleFixture();
  const report = await configureEuroBundle(fixture.client, { apply: true });
  assert.equal(report.capabilitiesVerified, true);
  assert.equal(fixture.writes.length, 3);
  assert.equal(fixture.writes[0].body.data.attributes.identifier, 'eu.veloxion.app');
  assert.equal(report.certificatesRevoked, false);
  assert.equal(report.appleBillingConfigured, false);
  assert.equal(report.pushDeliveryConfigured, false);
  assert.equal(report.appPublished, false);
  await configureEuroBundle(fixture.client, { apply: true });
  assert.equal(fixture.writes.length, 3);
});
