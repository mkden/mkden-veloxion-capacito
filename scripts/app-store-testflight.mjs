import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppStoreError, createClient, makeToken } from './app-store-api.mjs';
import { localCredentials } from './app-store-local.mjs';

const EURO_APP = '6826526999';
const RUS_APP = '6797630481';
const GROUP_NAME = 'Veloxion EURO Internal';

export async function copyInternalTesters({ credentials, client = createClient({ credentials }), buildNumber, grantEuroAppAccess = false, fetchImpl = fetch }) {
  if (!/^\d{12}$/.test(buildNumber || '')) throw new AppStoreError('An exact uploaded EURO build number is required.');
  const builds = await client.list(`/v1/builds?filter[app]=${EURO_APP}&filter[version]=${buildNumber}&limit=5`);
  if (builds.length !== 1 || builds[0].attributes?.processingState !== 'VALID') throw new AppStoreError('Expected one valid uploaded EURO build.');
  const build = builds[0];
  const app = (await client.request(`/v1/builds/${encodeURIComponent(build.id)}/app`)).data;
  if (app?.id !== EURO_APP || app.attributes?.bundleId !== 'eu.veloxion.app') throw new AppStoreError('The build does not belong to EURO.');
  const sourceGroups = (await client.list(`/v1/apps/${RUS_APP}/betaGroups`)).filter(g => g.type === 'betaGroups' && g.attributes?.isInternalGroup === true);
  const testerIds = new Set();
  const testerEmails = new Map();
  for (const group of sourceGroups) {
    for (const tester of await client.list(`/v1/betaGroups/${encodeURIComponent(group.id)}/betaTesters`)) {
      if (tester.type !== 'betaTesters' || !tester.id || !tester.attributes?.email?.includes('@')) throw new AppStoreError('Invalid internal tester relationship.');
      testerIds.add(tester.id);
      testerEmails.set(tester.id, tester.attributes?.email?.toLowerCase());
    }
  }
  if (!testerIds.size || testerIds.size > 100) throw new AppStoreError('Expected 1-100 existing RUS internal testers. No tester was created or invited externally.');
  async function post(path, body) {
    let response;
    try {
      response = await fetchImpl('https://api.appstoreconnect.apple.com' + path, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${makeToken(credentials)}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new AppStoreError('Internal TestFlight configuration request failed; inspect existing state before retrying.'); }
    if (!response.ok) {
      let hint = '';
      try {
        const errors = (await response.json()).errors;
        hint = (errors || []).map(error => `${error.code || ''}: ${error.detail || error.title || ''}`)
          .join('; ').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').slice(0, 500);
      } catch { /* Non-JSON errors are never echoed. */ }
      throw new AppStoreError(`Internal TestFlight configuration HTTP ${response.status} (${path}). ${hint}`);
    }
    return response.status === 204 ? null : response.json();
  }
  const users = await client.list('/v1/users?limit=200');
  let appAccessAdded = 0;
  for (const id of testerIds) {
    const user = users.find(u => u.attributes?.username?.toLowerCase() === testerEmails.get(id));
    if (!user?.id) throw new AppStoreError('An internal tester did not match an existing App Store Connect user.');
    if (user.attributes.allAppsVisible) continue;
    const path = `/v1/users/${encodeURIComponent(user.id)}`;
    if ((await client.list(path + '/visibleApps')).some(app => app.id === EURO_APP)) continue;
    if (!grantEuroAppAccess) throw new AppStoreError('Some internal testers need explicit permission to access the EURO app. Their roles were not changed.');
    await post(path + '/relationships/visibleApps', { data: [{ type: 'apps', id: EURO_APP }] });
    if (!(await client.list(path + '/visibleApps')).some(app => app.id === EURO_APP)) throw new AppStoreError('Apple has not confirmed access to the EURO app.');
    appAccessAdded++;
  }
  const groups = await client.list(`/v1/apps/${EURO_APP}/betaGroups`);
  const matches = groups.filter(g => g.attributes?.name === GROUP_NAME);
  if (matches.length > 1 || matches.some(g => !g.attributes.isInternalGroup || g.attributes.publicLinkEnabled)) throw new AppStoreError('Unexpected EURO group; existing access was not changed.');
  let group = matches[0];
  if (!group) {
    group = (await post('/v1/betaGroups', { data: { type: 'betaGroups', attributes: { name: GROUP_NAME, isInternalGroup: true, hasAccessToAllBuilds: false },
      relationships: { app: { data: { type: 'apps', id: EURO_APP } } } } })).data;
  }
  const groupId = encodeURIComponent(group.id);
  const verifiedApp = (await client.request(`/v1/betaGroups/${groupId}/app`)).data;
  const verifiedGroup = (await client.request(`/v1/betaGroups/${groupId}`)).data;
  if (verifiedApp?.id !== EURO_APP || verifiedGroup?.attributes?.isInternalGroup !== true || verifiedGroup.attributes.publicLinkEnabled) throw new AppStoreError('The target is not a private EURO internal group.');
  const existingEmails = new Set((await client.list(`/v1/betaGroups/${groupId}/betaTesters`)).map(t => t.attributes?.email?.toLowerCase()));
  const missing = [...testerIds].filter(id => !existingEmails.has(testerEmails.get(id)));
  const euroTesters = await client.list(`/v1/betaTesters?filter[apps]=${EURO_APP}&limit=200`);
  for (const id of missing) {
    const email = testerEmails.get(id);
    const existingTester = euroTesters.find(t => t.attributes?.email?.toLowerCase() === email);
    if (existingTester) await post(`/v1/betaGroups/${groupId}/relationships/betaTesters`, { data: [{ type: 'betaTesters', id: existingTester.id }] });
    else await post('/v1/betaTesters', { data: { type: 'betaTesters', attributes: { email }, relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } } } });
  }
  const linkedBuilds = await client.list(`/v1/betaGroups/${groupId}/builds`);
  if (!linkedBuilds.some(b => b.id === build.id)) await post(`/v1/betaGroups/${groupId}/relationships/builds`, { data: [{ type: 'builds', id: build.id }] });
  const confirmed = new Set((await client.list(`/v1/betaGroups/${groupId}/betaTesters`)).map(t => t.attributes?.email?.toLowerCase()));
  const confirmedBuilds = await client.list(`/v1/betaGroups/${groupId}/builds`);
  if ([...testerIds].some(id => !confirmed.has(testerEmails.get(id))) || !confirmedBuilds.some(b => b.id === build.id)) throw new AppStoreError('Apple has not yet confirmed the requested internal TestFlight access.');
  return { success: true, appId: EURO_APP, buildNumber, buildId: build.id, internalGroupId: group.id, internalTesterCount: testerIds.size, testersAdded: missing.length, appAccessAdded, rolesChanged: false, externalInvitations: false, appReviewSubmitted: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] !== '--copy-rus-internal-testers' || ![4, 5].includes(process.argv.length) || (process.argv[4] && process.argv[4] !== '--grant-euro-app-access')) {
    console.error('Usage: app-store-testflight.mjs --copy-rus-internal-testers EURO_BUILD_NUMBER [--grant-euro-app-access]'); process.exitCode = 1;
  } else {
    copyInternalTesters({ credentials: localCredentials(), buildNumber: process.argv[3], grantEuroAppAccess: process.argv[4] === '--grant-euro-app-access' })
      .then(report => console.log(JSON.stringify(report, null, 2)))
      .catch(error => { console.error(error instanceof AppStoreError ? error.message : 'Internal TestFlight setup failed; private data was not logged.'); process.exitCode = 1; });
  }
}
