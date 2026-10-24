import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { androidFirebaseConfig } from '../scripts/prepare-android-region.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const config = { project_info: { project_id: 'test-project' }, client: ['io.veloxion.app', 'eu.veloxion.app'].map(package_name => ({ client_info: { android_client_info: { package_name } } })) };
test('Android selects only the matching regional Firebase app', () => {
  assert.equal(androidFirebaseConfig(config, 'euro').client[0].client_info.android_client_info.package_name, 'eu.veloxion.app');
  assert.equal(androidFirebaseConfig(config, 'rus').client[0].client_info.android_client_info.package_name, 'io.veloxion.app');
  assert.equal(config.client.length, 2);
  assert.throws(() => androidFirebaseConfig({ ...config, private_key: 'never embed' }, 'euro'));
  assert.throws(() => androidFirebaseConfig({ ...config, client: [] }, 'euro'));
});
test('Android has independent identity, an explicit activity, and notification permission/icon', () => {
  assert.match(read('android/app/build.gradle'), /applicationId region.appId/);
  assert.match(read('android/app/build.gradle'), /regionName == 'euro' \? 1 : 3/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:name="io.veloxion.app.MainActivity"/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /POST_NOTIFICATIONS/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /default_notification_icon/);
});
