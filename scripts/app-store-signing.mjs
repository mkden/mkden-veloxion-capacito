import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AppStoreError } from './app-store-api.mjs';

export const EURO_BUNDLE = 'eu.veloxion.app';
const certificatesPath = '/v1/certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=200';
const publicHash = key => createHash('sha256').update(createPublicKey(key).export({ format: 'der', type: 'spki' })).digest('hex');

function openssl(args, env = process.env) {
  try { return execFileSync('openssl', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 30000 }); }
  catch { throw new AppStoreError('OpenSSL could not prepare or verify EURO signing files. Private data was not logged.'); }
}

export function prepareSigningStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = join(directory, 'euro-distribution.key.pem');
  if (!existsSync(keyPath)) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
  }
  const key = createPrivateKey(readFileSync(keyPath));
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength !== 2048) throw new AppStoreError('The EURO distribution key is not RSA-2048. Nothing was replaced.');
  const csrPath = join(directory, 'euro-distribution.csr');
  if (!existsSync(csrPath)) openssl(['req', '-new', '-sha256', '-key', keyPath, '-subj', '/CN=Veloxion AI Europe Distribution', '-out', csrPath]);
  openssl(['req', '-in', csrPath, '-verify', '-noout']);
  const csrKey = openssl(['req', '-in', csrPath, '-pubkey', '-noout']);
  const publicKeySha256 = publicHash(key);
  if (publicHash(csrKey) !== publicKeySha256) throw new AppStoreError('The stored EURO CSR does not match the local private key. Nothing was replaced.');
  return { csr: readFileSync(csrPath, 'utf8'), publicKeySha256, directory, keyPath };
}

export function certificateMatches(resource, publicKeySha256, now = Date.now()) {
  if (resource?.type !== 'certificates' || !['DISTRIBUTION', 'IOS_DISTRIBUTION'].includes(resource.attributes?.certificateType) || resource.attributes.activated === false) return false;
  try {
    const certificate = new X509Certificate(Buffer.from(resource.attributes.certificateContent, 'base64'));
    return publicHash(certificate.publicKey.export({ format: 'pem', type: 'spki' })) === publicKeySha256 && Date.parse(certificate.validTo) > now + 86400000;
  } catch { return false; }
}

export function validateProfilePlist(plist, { teamId, prefix = teamId, bundleId = EURO_BUNDLE } = {}) {
  const string = key => new RegExp(`<key>\\s*${key}\\s*</key>\\s*<string>([^<]+)</string>`).exec(plist)?.[1];
  const team = /<key>\s*TeamIdentifier\s*<\/key>\s*<array>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1];
  if (!/^[A-Z0-9]{10}$/.test(teamId || '') || !/^[A-Z0-9]{10}$/.test(prefix || '') || team !== teamId
    || !['eu.veloxion.app', 'io.veloxion.app'].includes(bundleId)
    || string('application-identifier') !== `${prefix}.${bundleId}` || string('aps-environment') !== 'production'
    || !/<key>\s*get-task-allow\s*<\/key>\s*<false\s*\/>/.test(plist)
    || /<key>\s*ProvisionedDevices\s*<\/key>/.test(plist)
    || /<key>\s*ProvisionsAllDevices\s*<\/key>\s*<true\s*\/>/.test(plist)) {
    throw new AppStoreError('The profile is not a production App Store profile for EURO with APNs enabled.');
  }
  return true;
}

export function signingFromEmbeddedProfile(plist) {
  const encoded = /<key>\s*DeveloperCertificates\s*<\/key>\s*<array>\s*<data>([\s\S]+?)<\/data>\s*<\/array>/.exec(plist)?.[1];
  if (!encoded) throw new AppStoreError('The previous build must contain exactly one distribution certificate.');
  let certificate;
  try { certificate = new X509Certificate(Buffer.from(encoded.replace(/\s/g, ''), 'base64')); }
  catch { throw new AppStoreError('Cannot decode the previous build public certificate.'); }
  const teamId = /^OU=([A-Z0-9]{10})$/m.exec(certificate.subject)?.[1];
  const identifier = /<key>\s*application-identifier\s*<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1];
  if (!teamId || !/^[A-Z0-9]{10}\.io\.veloxion\.app$/.test(identifier || '') || Date.parse(certificate.validTo) <= Date.now() + 86400000
    || !/<key>\s*get-task-allow\s*<\/key>\s*<false\s*\/>/.test(plist) || /<key>\s*ProvisionedDevices\s*<\/key>/.test(plist)) {
    throw new AppStoreError('The previous build is not an eligible RUS App Store distribution build.');
  }
  return { publicKeySha256: publicHash(certificate.publicKey.export({ format: 'pem', type: 'spki' })), teamId };
}

export function prepareReuseStore(directory, ipaPath) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  let files, content;
  try {
    files = execFileSync('tar', ['-tf', ipaPath], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 }).split(/\r?\n/)
      .filter(file => /^Payload\/[^/]+\.app\/embedded\.mobileprovision$/.test(file));
    if (files.length !== 1) throw new Error('Ambiguous application');
    content = execFileSync('tar', ['-xOf', ipaPath, files[0]], { windowsHide: true, maxBuffer: 1024 * 1024 });
  } catch { throw new AppStoreError('Cannot extract the public provisioning profile from the previous RUS IPA.'); }
  const sourceProfile = join(directory, 'previous-rus.mobileprovision');
  writeFileSync(sourceProfile, content, { mode: 0o600 });
  const plist = openssl(['cms', '-verify', '-inform', 'DER', '-in', sourceProfile, '-noverify']);
  return { ...signingFromEmbeddedProfile(plist), directory };
}

export async function configureEuroSigning(client, store, { inspectProfile, reuseOnly = false } = {}) {
  const matches = await client.list(`/v1/bundleIds?filter[identifier]=${EURO_BUNDLE}&limit=2`);
  if (matches.length !== 1 || matches[0].attributes?.identifier !== EURO_BUNDLE || !['IOS', 'UNIVERSAL'].includes(matches[0].attributes.platform)) throw new AppStoreError('Register and verify the EURO Bundle ID before provisioning.');
  const bundle = matches[0];
  const capabilities = await client.list(`/v1/bundleIds/${encodeURIComponent(bundle.id)}/bundleIdCapabilities`);
  if (!['PUSH_NOTIFICATIONS', 'IN_APP_PURCHASE'].every(type => capabilities.some(c => c.attributes?.capabilityType === type))) throw new AppStoreError('EURO capabilities must be enabled before generating a profile.');
  const certificates = await client.list(certificatesPath);
  let certificate = certificates.find(item => certificateMatches(item, store.publicKeySha256));
  let certificateCreated = false;
  if (!certificate) {
    if (reuseOnly) throw new AppStoreError('The previous build certificate is not currently valid in Apple. No certificate will be created or revoked.');
    const active = certificates.filter(item => item.attributes?.activated !== false && Date.parse(item.attributes?.expirationDate) > Date.now());
    if (active.length >= 3) throw new AppStoreError('Distribution certificate limit may already be reached. No existing certificate will be revoked. Export an existing certificate WITH its private key from Codemagic before continuing.');
    certificate = (await client.request('/v1/certificates', { method: 'POST', body: { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: store.csr } } } })).data;
    certificateCreated = true;
    if (!certificateMatches(certificate, store.publicKeySha256)) throw new AppStoreError('Apple returned a certificate that does not match the local EURO key. Nothing will be revoked automatically.');
  }
  const x509 = new X509Certificate(Buffer.from(certificate.attributes.certificateContent, 'base64'));
  const teamId = /^OU=([A-Z0-9]{10})$/m.exec(x509.subject)?.[1];
  if (!teamId) throw new AppStoreError('Could not verify the certificate Apple Team ID.');
  if (store.teamId && store.teamId !== teamId) throw new AppStoreError('The previous build and current certificate Apple teams do not match.');
  const identity = { teamId, prefix: bundle.attributes.seedId || teamId };
  const inspect = inspectProfile || (resource => {
    const data = Buffer.from(resource.attributes?.profileContent || '', 'base64');
    if (data.length < 100 || data.length > 1024 * 1024) throw new AppStoreError('Invalid provisioning profile download.');
    const file = join(store.directory, 'profile-candidate.mobileprovision');
    writeFileSync(file, data, { mode: 0o600 });
    const plist = openssl(['cms', '-verify', '-inform', 'DER', '-in', file, '-noverify']);
    return validateProfilePlist(plist, identity);
  });
  const profiles = await client.list('/v1/profiles?filter[profileType]=IOS_APP_STORE&filter[profileState]=ACTIVE&include=bundleId,certificates&limit=200');
  let profile;
  for (const candidate of profiles) {
    if (candidate.attributes?.profileType !== 'IOS_APP_STORE' || candidate.attributes?.profileState !== 'ACTIVE'
      || Date.parse(candidate.attributes.expirationDate) <= Date.now() + 86400000
      || candidate.relationships?.bundleId?.data?.id !== bundle.id
      || !candidate.relationships?.certificates?.data?.some(c => c.id === certificate.id)) continue;
    const detail = (await client.request(`/v1/profiles/${encodeURIComponent(candidate.id)}`)).data;
    try { inspect(detail); profile = detail; break; } catch { /* A stale APNs entitlement requires a new EURO profile, never deletion. */ }
  }
  let profileCreated = false;
  if (!profile) {
    profile = (await client.request('/v1/profiles', { method: 'POST', body: { data: {
      type: 'profiles', attributes: { name: `Veloxion Europe App Store ${new Date().toISOString().replace(/[:.]/g, '').slice(0, 17)}Z`, profileType: 'IOS_APP_STORE' },
      relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } }, certificates: { data: [{ type: 'certificates', id: certificate.id }] } },
    } } })).data;
    profileCreated = true;
    if (!profile?.id || profile.attributes?.profileType !== 'IOS_APP_STORE' || profile.attributes?.profileState !== 'ACTIVE') throw new AppStoreError('Apple did not confirm an active EURO App Store profile.');
    inspect(profile);
  }
  return { certificate, profile, report: { success: true, bundleId: EURO_BUNDLE, certificateId: certificate.id, profileId: profile.id,
    certificateCreated, certificateReused: !certificateCreated, profileCreated, certificatesRevoked: false, profilesDeleted: false, apnsEntitlementVerified: true, appPublished: false } };
}

export function saveProfileArtifact(store, profile) {
  const profilePath = join(store.directory, 'eu.veloxion.app.mobileprovision');
  writeFileSync(profilePath, Buffer.from(profile.attributes.profileContent, 'base64'), { mode: 0o600 });
  return { profilePath };
}

export function saveSigningArtifacts(store, certificate, profile) {
  const cert = new X509Certificate(Buffer.from(certificate.attributes.certificateContent, 'base64'));
  const certPath = join(store.directory, 'euro-distribution.cer.pem');
  writeFileSync(certPath, cert.toString(), { mode: 0o600 });
  const profilePath = join(store.directory, 'eu.veloxion.app.mobileprovision');
  writeFileSync(profilePath, Buffer.from(profile.attributes.profileContent, 'base64'), { mode: 0o600 });
  const passwordPath = join(store.directory, 'p12-password.txt');
  if (!existsSync(passwordPath)) writeFileSync(passwordPath, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 });
  const p12Path = join(store.directory, 'euro-distribution.p12');
  openssl(['pkcs12', '-export', '-inkey', store.keyPath, '-in', certPath, '-name', 'Veloxion Europe Distribution', '-out', p12Path, '-passout', 'env:VELOXION_LOCAL_P12_PASSWORD'],
    { ...process.env, VELOXION_LOCAL_P12_PASSWORD: readFileSync(passwordPath, 'utf8').trim() });
  return { p12Path, profilePath, passwordFile: passwordPath };
}
