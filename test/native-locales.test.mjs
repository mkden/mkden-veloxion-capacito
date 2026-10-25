import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('EURO bundles all seven LK languages without Russian or untranslated fields', () => {
  const base = JSON.parse(read('www/native-auth.json')), extra = JSON.parse(read('www/native-auth-euro.json'));
  assert.deepEqual(Object.keys(extra).sort(), ['de','es','fr','it','pl','zh']);
  for (const dictionary of Object.values(extra)) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(base.en).sort());
    for (const text of Object.values(dictionary)) assert.ok(typeof text === 'string' && text.trim() && !/[А-Яа-яЁё]/.test(text));
  }
  for (const path of ['android/app/src/main/java/io/veloxion/app/NativeAuthActivity.java','ios/App/App/NativeAuthViewController.swift']) {
    const source = read(path);
    assert.match(source, /native-auth-euro/); assert.match(source, /changeLanguage/); assert.match(source, /EU \/ /);
    assert.doesNotMatch(source, /EUROPE|"Europe"/); assert.match(source, /vkLogin/);
  }
});
test('language preference bridge is separate from session handoff and restricted to trusted origins', () => {
  for (const path of ['android/app/src/main/java/io/veloxion/app/NativeAuthPlugin.java','ios/App/App/NativeAuthPlugin.swift']) {
    const source = read(path); assert.match(source, /getLocale/); assert.match(source, /setLocale/); assert.match(source, /Invalid locale or origin/);
  }
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /NativeAuthLocale.swift in Sources/);
});
