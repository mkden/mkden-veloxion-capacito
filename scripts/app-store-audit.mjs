// Read-only App Store audit. Credentials stay in the CI environment, never artifacts.
import { createPrivateKey, sign } from 'node:crypto';

const env = process.env;
const keyId = env.APP_STORE_CONNECT_KEY_IDENTIFIER || env.APP_STORE_CONNECT_KEY_ID;
const issuer = env.APP_STORE_CONNECT_ISSUER_ID;
const privateKey = env.APP_STORE_CONNECT_PRIVATE_KEY;
if (!keyId || !issuer || !privateKey) {
  console.log('App Store metadata audit skipped: integration credentials are not exposed to this workflow.');
  process.exit(0);
}
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const body = `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64({ iss: issuer, iat: now, exp: now + 300, aud: 'appstoreconnect-v1' })}`;
const signature = sign('sha256', Buffer.from(body), { key: createPrivateKey(privateKey), dsaEncoding: 'ieee-p1363' }).toString('base64url');
async function get(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${path}`, { headers: { Authorization: `Bearer ${body}.${signature}` } });
  if (!res.ok) throw new Error(`Read-only App Store audit failed: HTTP ${res.status}`);
  return res.json();
}
const apps = await get('apps?filter[bundleId]=io.veloxion.app');
if (apps.data.length !== 1) throw new Error('Expected one App Store app for io.veloxion.app.');
const app = apps.data[0];
console.log(JSON.stringify({ appId: app.id, bundleId: app.attributes.bundleId, name: app.attributes.name }));
const products = await get(`apps/${app.id}/inAppPurchasesV2?limit=200`);
console.log(JSON.stringify({ products: products.data.map(p => ({ productId: p.attributes.productId, type: p.attributes.inAppPurchaseType, state: p.attributes.state })) }));
