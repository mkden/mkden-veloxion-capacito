import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');

test('native OAuth proof and callback guards execute independently of Android', () => {
  const bin = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin') : process.platform === 'win32' ? 'E:/SDK/jbr/bin' : '';
  mkdirSync(join(root, 'build-local'), { recursive: true });
  const dir = mkdtempSync(join(root, 'build-local/oauth-test-'));
  try {
    execFileSync(join(bin, 'javac'), ['-d', dir, join(root, 'android/app/src/main/java/io/veloxion/app/NativeOAuthFlow.java'), join(root, 'test/NativeOAuthFlowTests.java')]);
    assert.match(execFileSync(join(bin, 'java'), ['-cp', dir, 'NativeOAuthFlowTests'], { encoding: 'utf8' }), /region isolation passed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('provider entry points are native system authentication, not embedded web login', () => {
  const android = read('android/app/src/main/java/io/veloxion/app/NativeAuthActivity.java');
  const ios = read('ios/App/App/NativeAuthViewController.swift');
  for (const source of [android, ios]) {
    assert.match(source, /auth\/native\/start/); assert.match(source, /auth\/native\/exchange/);
    assert.match(source, /codeChallenge/); assert.match(source, /codeVerifier/); assert.match(source, /registrationRequired/);
    assert.match(source, /termsAccepted/); assert.doesNotMatch(source, /client_secret|refreshToken=|accessToken=/);
  }
  assert.match(android, /CustomTabsIntent/); assert.match(android, /store.save\(session,flow.revision\)/);
  assert.match(ios, /ASWebAuthenticationSession/); assert.match(ios, /save\(session, revision: revision\)/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:scheme="\$\{applicationId\}" android:host="oauth" android:path="\/callback"/);
  assert.match(read('ios/App/App/Info.plist'), /CFBundleURLSchemes[\s\S]*?\$\(PRODUCT_BUNDLE_IDENTIFIER\)/);
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /NativeOAuthFlow.swift in Sources/);
});
