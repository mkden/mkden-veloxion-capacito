import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';

// Public smoke checks: no provider token exchange, accounts, credentials or paid requests.
for (const [region, api, provider, bundle, host] of [
  ['euro', 'https://veloxion.eu/api', 'google', 'eu.veloxion.app', 'accounts.google.com'],
  ['rus', 'https://api.veloxion.io/api', 'yandex', 'io.veloxion.app', 'oauth.yandex.ru'],
]) {
  const request = (path, body) => fetch(api + path, { method: body ? 'POST' : 'GET', redirect: 'manual',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const verifier = randomBytes(32).toString('base64url'), state = randomBytes(32).toString('base64url');
  const body = { provider, platform: 'ios', state, codeChallenge: createHash('sha256').update(verifier).digest('base64url'), intent: 'login' };
  const start = await request('/auth/native/start', body);
  assert.equal(start.status, 201); assert.equal(start.headers.get('cache-control'), 'no-store');
  const envelope = await start.json(); assert.equal(envelope.success, true);
  const authorization = new URL(envelope.data.authorizationUrl);
  assert.equal(authorization.protocol, 'https:'); assert.equal(authorization.hostname, host);
  const callback = new URL(authorization.searchParams.get('redirect_uri'));
  assert.equal(callback.origin, new URL(api).origin);
  callback.searchParams.set('state', authorization.searchParams.get('state'));
  callback.searchParams.set('error', 'access_denied');
  const cancelled = await fetch(callback, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  assert.equal(cancelled.status, 302); assert.equal(cancelled.headers.get('cache-control'), 'no-store');
  assert.equal(cancelled.headers.get('referrer-policy'), 'no-referrer');
  const returned = new URL(cancelled.headers.get('location'));
  assert.equal(returned.protocol, bundle + ':'); assert.equal(returned.hostname, 'oauth'); assert.equal(returned.pathname, '/callback');
  assert.equal(returned.searchParams.get('state'), state); assert.equal(returned.searchParams.get('error'), 'cancelled');
  assert.equal(returned.searchParams.get('token'), null); assert.equal(returned.searchParams.get('refreshToken'), null);
  const replay = await fetch(callback, { redirect: 'manual', signal: AbortSignal.timeout(20000) }); assert.equal(replay.status, 401);
  assert.equal((await request('/auth/native/start', { ...body, provider: 'invalid' })).status, 400);
  assert.equal((await request('/auth/native/start', { ...body, intent: 'register', termsAccepted: false })).status, 400);
  assert.equal((await request('/auth/native/exchange', { code: randomBytes(32).toString('base64url'), codeVerifier: verifier })).status, 401);
  const web = await request('/auth/' + provider + '/start'); assert.equal(web.status, 302);
  assert.equal(new URL(web.headers.get('location')).hostname, host);
  console.log(JSON.stringify({ region, provider, configured: true, cancelRoundTrip: true, replayRejected: true, missingConsentRejected: true, invalidExchangeRejected: true, webLoginPreserved: true, providerSignInAttempted: false }));
}
