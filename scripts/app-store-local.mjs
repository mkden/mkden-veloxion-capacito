import { parseEnv } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppStoreError, createClient, credentialsFromEnvironment } from './app-store-api.mjs';
import { configureEuroBundle } from './app-store-euro-bootstrap.mjs';
import { prepareSigningStore, prepareReuseStore, configureEuroSigning, saveSigningArtifacts, saveProfileArtifact } from './app-store-signing.mjs';

export function localCredentials(env = process.env) {
  if (!env.CONNECTOR_ENV_PATH) throw new AppStoreError('Run connect-app-store.ps1 to select the private local credentials file.');
  let values;
  try { values = parseEnv(readFileSync(env.CONNECTOR_ENV_PATH, 'utf8')); }
  catch { throw new AppStoreError('Cannot read the local credentials file. Run connect-app-store.ps1.'); }
  const missing = ['APP_STORE_CONNECT_KEY_IDENTIFIER', 'APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_PRIVATE_KEY_FILE'].filter(key => !values[key]);
  if (missing.length) throw new AppStoreError(`Missing ${missing.join(', ')} in ${resolve(env.CONNECTOR_ENV_PATH)}.`);
  if (!/^[A-Z0-9]{10}$/.test(values.APP_STORE_CONNECT_KEY_IDENTIFIER) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values.APP_STORE_CONNECT_ISSUER_ID)) {
    throw new AppStoreError('Invalid Key ID or Issuer ID format. Enter a Team API key, not an individual or APNs key.');
  }
  try { return credentialsFromEnvironment(values); }
  catch (error) { throw new AppStoreError(error instanceof AppStoreError ? error.message : 'The selected .p8 file cannot be read.'); }
}

export async function testAccess(client) {
  const bundles = await client.list('/v1/bundleIds?filter[identifier]=eu.veloxion.app&limit=2');
  const certificates = await client.list('/v1/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=200');
  await client.list('/v1/profiles?filter[profileType]=IOS_APP_STORE&limit=1');
  return { success: true, authenticated: true, provisioningReadable: true,
    euroBundleExists: bundles.some(item => item.attributes?.identifier === 'eu.veloxion.app'),
    distributionCertificates: certificates.length, changesMade: false };
}

export async function main(args = process.argv.slice(2)) {
  const mode = args.shift() || 'test';
  let output;
  let previousIpa;
  const ipaIndex = args.indexOf('--previous-ipa');
  if (ipaIndex >= 0) {
    if (!args[ipaIndex + 1]) throw new AppStoreError('Provide the previous successful RUS IPA path.');
    previousIpa = resolve(args[ipaIndex + 1]); args.splice(ipaIndex, 2);
  }
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--output') throw new AppStoreError('Usage: app-store-local.mjs test|bundle|signing|reuse-signing [--previous-ipa RUS.ipa] [--output report.json]');
    output = resolve(args[1]);
  }
  let report;
  try {
    if (!['test', 'bundle', 'signing', 'reuse-signing'].includes(mode)) throw new AppStoreError('Only read-only test and explicit EURO bundle/signing setup are supported.');
    const credentials = localCredentials();
    const directory = join(dirname(resolve(process.env.CONNECTOR_ENV_PATH)), 'euro-signing');
    if (mode === 'reuse-signing' && !previousIpa) throw new AppStoreError('Certificate reuse requires a previous successful RUS IPA.');
    const store = mode === 'signing' ? prepareSigningStore(directory) : mode === 'reuse-signing' ? prepareReuseStore(directory, previousIpa) : undefined;
    const client = createClient({ credentials, allowEuroBundle: mode === 'bundle', euroSigning: store });
    if (['signing', 'reuse-signing'].includes(mode)) {
      const result = await configureEuroSigning(client, store, { reuseOnly: mode === 'reuse-signing' });
      report = { ...result.report, files: mode === 'reuse-signing' ? saveProfileArtifact(store, result.profile) : saveSigningArtifacts(store, result.certificate, result.profile),
        privateKeyExported: mode === 'signing', codemagicSigningVerified: false };
    } else report = mode === 'bundle' ? await configureEuroBundle(client, { apply: true }) : await testAccess(client);
  } catch (error) {
    report = { success: false, error: error instanceof AppStoreError ? error.message : 'Local Apple operation failed; credentials were not logged.' };
    process.exitCode = 1;
  }
  report.at = new Date().toISOString();
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error('Invalid local Apple command.'); process.exitCode = 1; });
