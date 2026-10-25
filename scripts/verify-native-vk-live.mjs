import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

// Cancellation-only probe: never signs in, creates accounts or exchanges real provider codes.
const api = 'https://api.veloxion.io/api';
const request = (url, body) => fetch(url, { method: body ? 'POST' : 'GET', redirect: 'manual',
  headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
const random = () => randomBytes(32).toString('base64url');
const state = random(), verifier = random();
const start = await request(api + '/auth/native/start', { provider: 'vk', platform: 'ios', state,
  codeChallenge: createHash('sha256').update(verifier).digest('base64url'), intent: 'login' });
assert.equal(start.status, 201);
const authorization = new URL((await start.json()).data.authorizationUrl);
assert.equal(authorization.origin, 'https://id.vk.com'); assert.equal(authorization.pathname, '/authorize');
assert.equal(authorization.searchParams.get('redirect_uri'), 'https://veloxion.io/auth');
assert.equal(authorization.searchParams.get('code_challenge_method'), 's256');
assert.match(authorization.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
assert.equal(authorization.searchParams.has('client_secret'), false); assert.equal(authorization.searchParams.has('code_verifier'), false);
const providerState = authorization.searchParams.get('state');
const wrong = new URL(api + '/auth/yandex/callback'); wrong.searchParams.set('state', providerState); wrong.searchParams.set('error', 'access_denied');
assert.equal((await request(wrong)).status, 401);
const website = new URL(authorization.searchParams.get('redirect_uri')); website.searchParams.set('state', providerState); website.searchParams.set('error', 'access_denied');
const forwarded = await request(website);
assert.equal(forwarded.status, 307); assert.equal(forwarded.headers.get('referrer-policy'), 'no-referrer');
assert.match(forwarded.headers.get('cache-control'), /no-store/);
const callback = new URL(forwarded.headers.get('location'));
assert.equal(callback.origin, new URL(api).origin); assert.equal(callback.pathname, '/api/auth/vk/native/callback');
const cancelled = await request(callback);
assert.equal(cancelled.status, 302); assert.equal(cancelled.headers.get('cache-control'), 'no-store');
const returned = new URL(cancelled.headers.get('location'));
assert.equal(returned.protocol, 'io.veloxion.app:'); assert.equal(returned.hostname, 'oauth'); assert.equal(returned.pathname, '/callback');
assert.equal(returned.searchParams.get('state'), state); assert.equal(returned.searchParams.get('error'), 'cancelled');
assert.equal(returned.searchParams.has('token'), false); assert.equal(returned.searchParams.has('refreshToken'), false);
assert.equal((await request(callback)).status, 401);
assert.equal((await request('https://veloxion.io/auth?state=ordinary-web-state')).status, 200);
console.log(JSON.stringify({ provider: 'vk', providerPkce: true, wrongProviderRejectedWithoutConsumingState: true,
  websiteForwarding: true, cancellationRoundTrip: true, replayRejected: true, webLoginPreserved: true, realSignInAttempted: false }));
