import { X509Certificate } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AppStoreError, createClient, credentialsFromEnvironment } from './app-store-api.mjs';
import { validateProfilePlist } from './app-store-signing.mjs';

export const APPS = {
  euro: { appId: '6826526999', bundleId: 'eu.veloxion.app' },
  rus: { appId: '6797630481', bundleId: 'io.veloxion.app' },
};

export function nextBuildNumber(builds, now = new Date()) {
  const date = now.toISOString().replace(/\D/g, '').slice(0, 12);
  const previous = builds.map(b => String(b.attributes?.version || '')).filter(v => /^\d{1,14}$/.test(v)).map(Number);
  const next = Math.max(Number(date), ...previous.map(n => n + 1));
  if (!Number.isSafeInteger(next)) throw new Error('Build number is out of range.');
  return String(next);
}

export async function prepare(region) {
  const app = APPS[region];
  if (!app || process.env.VELOXION_APP_REGION !== region) throw new AppStoreError('Explicit matching iOS region is required.');
  if (process.platform !== 'darwin') throw new AppStoreError('Signing preflight must run on the Codemagic Mac.');
  // Integration-generated APP_STORE_CONNECT_* variables must not shadow the upload key.
  const client = createClient({ credentials: credentialsFromEnvironment({
    APP_STORE_CONNECT_KEY_IDENTIFIER: process.env.VELOXION_APPLE_KEY_ID,
    APP_STORE_CONNECT_ISSUER_ID: process.env.VELOXION_APPLE_ISSUER_ID,
    APP_STORE_CONNECT_PRIVATE_KEY: process.env.VELOXION_APPLE_PRIVATE_KEY,
  }) });
  const record = (await client.request(`/v1/apps/${app.appId}`)).data;
  if (record?.attributes?.bundleId !== app.bundleId) throw new AppStoreError('Apple app ID does not match the requested region.');
  const bundles = await client.list(`/v1/bundleIds?filter[identifier]=${app.bundleId}&limit=2`);
  if (bundles.length !== 1 || bundles[0].attributes.identifier !== app.bundleId) throw new AppStoreError('Expected one exact Apple Bundle ID.');
  const bundle = bundles[0];
  const profileList = await client.list('/v1/profiles?filter[profileType]=IOS_APP_STORE&filter[profileState]=ACTIVE&include=bundleId,certificates&limit=200');
  const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toUpperCase();
  const profiles = profileList.filter(p => p.relationships?.bundleId?.data?.id === bundle.id && p.attributes?.profileType === 'IOS_APP_STORE'
    && p.attributes?.profileState === 'ACTIVE' && Date.parse(p.attributes.expirationDate) > Date.now() + 86400000)
    .sort((a, b) => Date.parse(b.attributes.expirationDate) - Date.parse(a.attributes.expirationDate));
  const directory = resolve('build/testflight'); mkdirSync(directory, { recursive: true });
  const profilePath = join(directory, `${region}.mobileprovision`);
  let selected;
  for (const candidate of profiles) {
    const certificates = await client.list(`/v1/profiles/${encodeURIComponent(candidate.id)}/certificates`);
    const certificate = certificates.map(c => {
      try { return new X509Certificate(Buffer.from(c.attributes.certificateContent, 'base64')); } catch { return null; }
    }).find(c => c && identities.includes(c.fingerprint.replaceAll(':', '').toUpperCase()) && Date.parse(c.validTo) > Date.now() + 86400000);
    if (!certificate) continue;
    const teamId = /^OU=([A-Z0-9]{10})$/m.exec(certificate.subject)?.[1];
    const detail = (await client.request(`/v1/profiles/${encodeURIComponent(candidate.id)}`)).data;
    writeFileSync(profilePath, Buffer.from(detail.attributes.profileContent, 'base64'), { mode: 0o600 });
    let plist;
    try { plist = execFileSync('security', ['cms', '-D', '-i', profilePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { continue; }
    try { validateProfilePlist(plist, { teamId, prefix: bundle.attributes.seedId || teamId, bundleId: app.bundleId }); }
    catch { continue; }
    selected = { profileId: candidate.id, teamId };
    break;
  }
  if (!selected) throw new AppStoreError('No exact regional App Store/APNs profile matches an available private signing identity. No certificate will be created or revoked.');
  const builds = await client.list(`/v1/builds?filter[app]=${app.appId}&sort=-uploadedDate&limit=200`);
  const buildNumber = nextBuildNumber(builds);
  execFileSync('agvtool', ['new-version', '-all', buildNumber], { cwd: 'ios/App', stdio: 'inherit' });
  const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  const ids = [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(m => m[1]);
  if (ids.length !== 2 || ids.some(id => id !== app.bundleId)) throw new AppStoreError('Xcode project is configured for the wrong region.');
  const report = { region, ...app, ...selected, buildNumber, profilePath, appStoreSubmission: false };
  writeFileSync(join(directory, 'preflight.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:\/)/, '$1'))) {
  prepare(process.argv[2]).catch(error => { console.error(error instanceof AppStoreError ? error.message : 'iOS signing preflight failed; private data was not logged.'); process.exitCode = 1; });
}
