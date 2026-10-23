import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ORIGIN = 'https://api.appstoreconnect.apple.com';

export class AppStoreError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function credentialsFromEnvironment(env = process.env) {
  const keyId = env.APP_STORE_CONNECT_KEY_IDENTIFIER || env.APP_STORE_CONNECT_KEY_ID;
  const issuerId = env.APP_STORE_CONNECT_ISSUER_ID;
  const raw = env.APP_STORE_CONNECT_PRIVATE_KEY_FILE
    ? readFileSync(env.APP_STORE_CONNECT_PRIVATE_KEY_FILE, 'utf8')
    : env.APP_STORE_CONNECT_PRIVATE_KEY;
  if (!keyId || !issuerId || !raw) {
    throw new AppStoreError('Missing App Store Connect credentials. Check the veloxion-appstore integration and appstore_credentials group in Codemagic.');
  }
  let pem = raw.trim();
  if (pem.startsWith('"')) {
    try { pem = JSON.parse(pem); } catch { throw new AppStoreError('Invalid private key format; use PEM or base64-encoded PEM.'); }
  }
  if (typeof pem !== 'string') throw new AppStoreError('The private key must be PEM text.');
  if (!pem.includes('-----BEGIN')) pem = Buffer.from(pem, 'base64').toString('utf8');
  pem = pem.replace(/\\r\\n|\\n/g, '\n').replace(/\r\n/g, '\n');
  let privateKey;
  try { privateKey = createPrivateKey(pem); } catch { throw new AppStoreError('Cannot parse the App Store Connect private key. Key contents were not logged.'); }
  if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new AppStoreError('App Store Connect requires an ES256 (P-256) private key.');
  }
  return { keyId, issuerId, privateKey };
}

export function makeToken(credentials, now = Math.floor(Date.now() / 1000)) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'ES256', kid: credentials.keyId, typ: 'JWT' })}.${encode({ iss: credentials.issuerId, iat: now - 10, exp: now + 300, aud: 'appstoreconnect-v1' })}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: credentials.privateKey, dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${unsigned}.${signature}`;
}

function checkWrite(method, url, body) {
  const data = body?.data;
  const attrs = data?.attributes || {};
  const only = allowed => Object.keys(attrs).every(key => allowed.includes(key));
  if (method === 'POST' && url.pathname === '/v2/inAppPurchases' && data?.type === 'inAppPurchases'
    && attrs.inAppPurchaseType === 'CONSUMABLE' && only(['name', 'productId', 'inAppPurchaseType', 'reviewNote'])) return;
  if (method === 'POST' && url.pathname === '/v1/inAppPurchaseVersions' && data?.type === 'inAppPurchaseVersions'
    && Object.keys(attrs).length === 0) return;
  if (method === 'POST' && url.pathname === '/v2/inAppPurchaseLocalizations' && data?.type === 'inAppPurchaseLocalizations'
    && only(['name', 'locale', 'description'])) return;
  if (method === 'PATCH' && /^\/v1\/apps\/\d+$/.test(url.pathname) && data?.type === 'apps'
    && only(['subscriptionStatusUrl', 'subscriptionStatusUrlForSandbox', 'subscriptionStatusUrlVersion', 'subscriptionStatusUrlVersionForSandbox'])) return;
  throw new AppStoreError('Write refused: only consumable drafts, localizations and notification URLs are allowed. Pricing, availability, deletion and submission are forbidden.');
}

export function createClient({ credentials, fetchImpl = fetch, allowMetadata = false }) {
  async function request(path, { method = 'GET', body } = {}) {
    const url = new URL(path, ORIGIN);
    if (url.origin !== ORIGIN || url.username || url.password || url.hash || !/^\/v[12]\//.test(url.pathname)) {
      throw new AppStoreError('Refused to send Apple credentials outside the official App Store Connect API.');
    }
    if (method !== 'GET') {
      if (!allowMetadata) throw new AppStoreError('Read-only mode: pass --apply-metadata to configure drafts.');
      checkWrite(method, url, body);
    }
    let response;
    try {
      response = await fetchImpl(url.href, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${makeToken(credentials)}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new AppStoreError(`App Store Connect request failed (${method} ${url.pathname}). Check connectivity; no write was retried automatically.`);
    }
    if (!response.ok) {
      const hint = response.status === 401 ? ' Check the Apple key, issuer and expiration.'
        : response.status === 403 ? ' Check App Manager permissions and the Paid Apps Agreement.' : '';
      throw new AppStoreError(`App Store Connect HTTP ${response.status} (${method} ${url.pathname}).${hint}`, response.status);
    }
    try { return await response.json(); } catch { throw new AppStoreError('App Store Connect returned an invalid JSON response.'); }
  }
  async function list(path) {
    const data = [];
    const visited = new Set();
    while (path) {
      const canonical = new URL(path, ORIGIN).href;
      if (visited.has(canonical) || visited.size >= 100) throw new AppStoreError('Unexpected App Store Connect pagination loop.');
      visited.add(canonical);
      const page = await request(path);
      if (!Array.isArray(page.data)) throw new AppStoreError('App Store Connect list response is missing its data array.');
      data.push(...page.data);
      path = page.links?.next;
    }
    return data;
  }
  return { request, list };
}
