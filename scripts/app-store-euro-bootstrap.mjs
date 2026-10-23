import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppStoreError, createClient, credentialsFromEnvironment } from './app-store-api.mjs';
import { REGIONS } from './prepare-ios-region.mjs';

const region = REGIONS.euro;
const requiredCapabilities = ['PUSH_NOTIFICATIONS', 'IN_APP_PURCHASE'];

export async function configureEuroBundle(client, { apply = false } = {}) {
  const bundlesPath = `/v1/bundleIds?filter[identifier]=${region.appId}&limit=2`;
  const matches = await client.list(bundlesPath);
  if (matches.length > 1 || matches.some(b => b.attributes?.identifier !== region.appId || !['IOS', 'UNIVERSAL'].includes(b.attributes.platform))) {
    throw new AppStoreError('Unexpected EURO Bundle ID response. No existing identifier will be changed.');
  }
  let bundle = matches[0];
  const actions = [];
  if (!bundle) {
    actions.push(apply ? 'register-euro-bundle-id' : 'would-register-euro-bundle-id');
    if (apply) {
      bundle = (await client.request('/v1/bundleIds', { method: 'POST', body: { data: {
        type: 'bundleIds', attributes: { identifier: region.appId, name: region.appName, platform: 'IOS' },
      } } })).data;
      if (!bundle?.id || bundle.attributes?.identifier !== region.appId) throw new AppStoreError('Apple did not confirm the EURO Bundle ID.');
    }
  }
  let capabilities = bundle ? await client.list(`/v1/bundleIds/${encodeURIComponent(bundle.id)}/bundleIdCapabilities?limit=200`) : [];
  for (const capabilityType of requiredCapabilities) {
    if (capabilities.some(c => c.attributes?.capabilityType === capabilityType)) continue;
    actions.push(`${apply ? 'enable' : 'would-enable'}-${capabilityType}`);
    if (apply) await client.request('/v1/bundleIdCapabilities', { method: 'POST', body: { data: {
      type: 'bundleIdCapabilities', attributes: { capabilityType },
      relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } } },
    } } });
  }
  if (apply) {
    capabilities = await client.list(`/v1/bundleIds/${encodeURIComponent(bundle.id)}/bundleIdCapabilities?limit=200`);
    if (!requiredCapabilities.every(type => capabilities.some(c => c.attributes?.capabilityType === type))) throw new AppStoreError('EURO capability verification failed.');
  }
  const apps = await client.list(`/v1/apps?filter[bundleId]=${region.appId}&limit=2`);
  if (apps.length > 1 || apps.some(app => app.attributes?.bundleId !== region.appId)) throw new AppStoreError('Unexpected EURO app record response.');
  return {
    success: true, region: 'euro', bundleId: region.appId, bundleResourceId: bundle?.id || null,
    mode: apply ? 'apply-bundle' : 'read-only', actions, capabilitiesVerified: apply,
    appStoreAppId: apps[0]?.id || null,
    appRecord: { exists: apps.length === 1, name: region.appName, platform: 'iOS', primaryLanguage: 'English (U.S.)', bundleId: region.appId, sku: 'veloxion-eu-ios' },
    appRecordCreated: false, certificatesCreated: false, certificatesRevoked: false,
    pushDeliveryConfigured: false, appleBillingConfigured: false, appPublished: false,
    remaining: [
      ...(apps.length ? [] : ['Create the app record on the App Store Connect website; Apple does not expose public app-creation REST API.']),
      'Prepare a EURO App Store provisioning profile and matching Codemagic distribution certificate; never revoke RUS certificates.',
      'Configure EURO APNs backend, EURO device-token registration and an authorized team/topic APNs key.',
      'Port server-verified Apple IAP to EURO. Do not release with Stripe AI-credit checkout inside iOS.',
      'Build ios-euro-validation, test on iPhone, then submit only after explicit approval.',
    ],
  };
}

export async function main(args = process.argv.slice(2)) {
  let apply = false;
  let output;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply-bundle') apply = true;
    else if (args[i] === '--output' && args[i + 1]) output = resolve(args[++i]);
    else throw new AppStoreError('Usage: node scripts/app-store-euro-bootstrap.mjs [--apply-bundle] [--output report.json]');
  }
  let report;
  try {
    report = await configureEuroBundle(createClient({ credentials: credentialsFromEnvironment(), allowEuroBundle: apply }), { apply });
  } catch (error) {
    report = { success: false, region: 'euro', error: error instanceof AppStoreError ? error.message : 'EURO bootstrap failed; credentials were not logged.' };
    process.exitCode = 1;
  }
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Invalid EURO bootstrap arguments.'); process.exitCode = 1; });
}
