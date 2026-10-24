import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

export const CODEMAGIC_APP_ID = '6a7099c79158da398bcfb28e';
export const CODEMAGIC_BRANCH = 'feature/ios-euro-app';
const ORIGIN = 'https://api.codemagic.io';
export const TESTFLIGHT_GROUP = 'veloxion_testflight_20261024';

export async function configureTestFlightCredentials({ token, credentials, fetchImpl = fetch }) {
  const origin = 'https://codemagic.io';
  async function request(path, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(origin + path, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'x-auth-token': token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new Error('Codemagic credential configuration request failed; inspect the group before retrying.'); }
    if (!response.ok) throw new Error(`Codemagic credential configuration HTTP ${response.status}. No private values were logged.`);
    return response.status === 201 && path.endsWith('/variables') ? null : response.json();
  }
  const path = `/api/v3/apps/${CODEMAGIC_APP_ID}/variable-groups`;
  const groups = (await request(path + '?page_size=100')).data;
  const matches = groups.filter(group => group.name === TESTFLIGHT_GROUP);
  if (matches.length > 1) throw new Error('Duplicate TestFlight credential groups; configuration stopped.');
  const group = matches[0] || (await request(path, 'POST', { name: TESTFLIGHT_GROUP })).data;
  if (!/^[a-f0-9]{24}$/i.test(group?.id || '')) throw new Error('Codemagic did not confirm the credential group.');
  const variablesPath = `/api/v3/variable-groups/${group.id}/variables`;
  let variables = (await request(variablesPath + '?page_size=100')).data;
  const names = ['APP_STORE_CONNECT_KEY_IDENTIFIER', 'APP_STORE_CONNECT_ISSUER_ID', 'APP_STORE_CONNECT_PRIVATE_KEY'];
  if (!variables.length) {
    // Export directly into the trusted CI secret store, never into logs or repository files.
    const values = [credentials.keyId, credentials.issuerId, credentials.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()];
    await request(variablesPath, 'POST', { secure: true, variables: names.map((name, index) => ({ name, value: values[index] })) });
    variables = (await request(variablesPath + '?page_size=100')).data;
  }
  if (variables.length !== names.length || names.some(name => !variables.some(v => v.name === name && v.secure === true))) {
    throw new Error('Incomplete or non-secret TestFlight credentials; existing variables were not overwritten.');
  }
  return { success: true, group: TESTFLIGHT_GROUP, groupId: group.id, secretNames: names };
}

export function readToken(env = process.env) {
  if (!env.CONNECTOR_ENV_PATH) throw new Error('Run connect-codemagic.ps1 to configure private local access.');
  let values;
  try { values = parseEnv(readFileSync(env.CONNECTOR_ENV_PATH, 'utf8')); }
  catch { throw new Error('Cannot read the private Codemagic credentials file. Run connect-codemagic.ps1.'); }
  if (!/^[A-Za-z0-9_.-]{20,512}$/.test(values.CODEMAGIC_API_TOKEN || '')) throw new Error(`Missing or invalid CODEMAGIC_API_TOKEN in ${resolve(env.CONNECTOR_ENV_PATH)}.`);
  return values.CODEMAGIC_API_TOKEN;
}

export function createCodemagicClient({ token, fetchImpl = fetch }) {
  async function request(path, { method = 'GET', body } = {}) {
    const url = new URL(path, ORIGIN);
    if (url.origin !== ORIGIN || url.username || url.password || url.hash) throw new Error('Refused to send the Codemagic token to another host.');
    if (method !== 'GET') {
      const keys = Object.keys(body || {});
      if (method !== 'POST' || url.pathname !== '/builds' || body?.appId !== CODEMAGIC_APP_ID || body.branch !== CODEMAGIC_BRANCH
        || !['ios-euro-testflight', 'ios-rus-testflight'].includes(body.workflowId)
        || keys.some(key => !['appId', 'workflowId', 'branch'].includes(key))) throw new Error('Only explicitly requested EURO/RUS TestFlight builds on the isolated branch are allowed.');
    }
    let response;
    try { response = await fetchImpl(url.href, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'x-auth-token': token, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new Error(`Codemagic request failed (${method} ${url.pathname}); it was not retried automatically.`); }
    if (!response.ok) throw new Error(`Codemagic HTTP ${response.status} (${method} ${url.pathname}). Check the token and team access.`);
    try { return await response.json(); } catch { throw new Error('Codemagic returned invalid JSON.'); }
  }
  return { request };
}

export async function main(args = process.argv.slice(2)) {
  const mode = args.shift() || 'test';
  let output;
  const index = args.indexOf('--output');
  if (index >= 0 && args[index + 1]) { output = resolve(args[index + 1]); args.splice(index, 2); }
  let report;
  try {
    const client = createCodemagicClient({ token: readToken() });
    if (mode === 'test' && !args.length) {
      const result = await client.request('/apps/' + CODEMAGIC_APP_ID);
      const app = result.application;
      if (app?._id !== CODEMAGIC_APP_ID) throw new Error('Codemagic did not confirm the expected Veloxion application.');
      report = { success: true, appId: app._id, appName: app.appName, changesMade: false };
    } else if (mode === 'start' && args.length === 1 && ['euro', 'rus'].includes(args[0])) {
      const workflowId = `ios-${args[0]}-testflight`;
      const result = await client.request('/builds', { method: 'POST', body: { appId: CODEMAGIC_APP_ID, branch: CODEMAGIC_BRANCH, workflowId } });
      if (!/^[a-f0-9]{24}$/i.test(result.buildId || '')) throw new Error('Codemagic did not return a build ID; check the dashboard before retrying.');
      report = { success: true, region: args[0], buildId: result.buildId, workflowId, branch: CODEMAGIC_BRANCH, uploadedToApple: false };
    } else throw new Error('Usage: codemagic-local.mjs test|start euro|start rus [--output report.json]');
  } catch (error) { report = { success: false, error: error.message }; process.exitCode = 1; }
  report.at = new Date().toISOString();
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error('Invalid Codemagic command.'); process.exitCode = 1; });
