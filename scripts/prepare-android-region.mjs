import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const regions = JSON.parse(readFileSync(new URL('../app-regions.json', import.meta.url), 'utf8'));

export function androidFirebaseConfig(config, regionName) {
  const region = regions[regionName];
  if (!region || !['rus', 'euro'].includes(regionName)) throw new Error('Invalid Android region.');
  if (config.private_key || config.type === 'service_account') throw new Error('A server key must never enter the Android application.');
  const clients = config.client?.filter(client => client.client_info?.android_client_info?.package_name === region.appId);
  if (clients?.length !== 1 || !config.project_info?.project_id) throw new Error('Firebase configuration does not contain exactly one matching Android application.');
  return { ...config, client: clients };
}

export function prepareAndroidRegion(regionName, firebasePath) {
  const region = regions[regionName];
  const selected = androidFirebaseConfig(JSON.parse(readFileSync(resolve(firebasePath || resolve(root, 'google-services.json')), 'utf8')), regionName);
  const config = JSON.parse(readFileSync(resolve(root, 'android/app/src/main/assets/capacitor.config.json'), 'utf8'));
  if (config.appId !== region.appId || config.server?.url !== region.url) throw new Error('Capacitor region does not match Android. Set VELOXION_APP_REGION before cap sync android.');
  const offlinePath = resolve(root, 'android/app/src/main/assets/public/index.html');
  const offline = readFileSync(offlinePath, 'utf8');
  if (!/data-veloxion-region="(?:rus|euro)"/.test(offline)) throw new Error('Offline screen has no region marker.');
  writeFileSync(resolve(root, 'android/app/google-services.json'), JSON.stringify(selected, null, 2) + '\n');
  writeFileSync(offlinePath, offline.replace(/data-veloxion-region="(?:rus|euro)"/, `data-veloxion-region="${regionName}"`));
  console.log(JSON.stringify({ region: regionName, appId: region.appId, url: region.url, firebaseProject: selected.project_info.project_id, serverKeyEmbedded: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { prepareAndroidRegion(process.argv[2], process.argv[3]); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
