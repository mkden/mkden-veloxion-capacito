import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const java = name => read('android/app/src/main/java/io/veloxion/app/' + name + '.java');

test('native login is the launcher on both platforms; no remote view is created before it', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /MainActivity[\s\S]*?android:exported="false"\s*\/>/);
  assert.match(manifest, /NativeAuthActivity[\s\S]*?android.intent.action.MAIN/);
  assert.match(java('NativeAuthActivity'), /extends AppCompatActivity/);
  assert.doesNotMatch(java('NativeAuthActivity'), /new WebView|extends BridgeActivity/);
  assert.doesNotMatch(read('ios/App/App/Info.plist'), /UIMainStoryboardFile/);
  assert.match(read('ios/App/App/AppDelegate.swift'), /window = UIWindow[\s\S]*?showNativeAuth\(\)/);
  assert.match(read('ios/App/App/NativeAuthViewController.swift'), /UIViewController/);
});

test('native methods are registered alongside existing payment and push integrations', () => {
  assert.ok(java('MainActivity').indexOf('registerPlugin(NativeAuthPlugin.class)') < java('MainActivity').indexOf('super.onCreate'));
  assert.match(read('ios/App/App/VeloxionViewController.swift'), /VeloxionPurchasesPlugin/);
  assert.match(read('ios/App/App/VeloxionViewController.swift'), /NativeAuthPlugin/);
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  for (const file of ['NativeAuthSession.swift', 'NativeAuthViewController.swift', 'NativeAuthPlugin.swift']) {
    assert.match(project, new RegExp(file.replaceAll('.', '\\.') + ' in Sources'));
  }
});

test('each native region uses its own trusted site/API and rejects unknown bundle IDs', () => {
  for (const source of [java('NativeAuthApi'), read('ios/App/App/NativeAuthSession.swift')]) {
    for (const marker of ['io.veloxion.app', 'eu.veloxion.app', 'https://api.veloxion.io/api', 'https://veloxion.eu']) assert.ok(source.includes(marker));
    assert.match(source, /Unknown app(?:lication)? region/);
  }
  assert.match(java('NativeAuthPlugin'), /getPort\(\)==-1 \|\| uri.getPort\(\)==443/);
  assert.match(read('ios/App/App/NativeAuthSession.swift'), /url.port == nil \|\| url.port == 443/);
});

test('refresh tokens stay in device-only encrypted storage, not URLs, logs or bridge results', () => {
  assert.match(java('AuthSessionStore'), /AndroidKeyStore/);
  assert.match(java('AuthSessionStore'), /AES\/GCM\/NoPadding/);
  assert.match(read('ios/App/App/NativeAuthSession.swift'), /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/);
  for (const file of ['auth_backup_rules.xml', 'auth_data_extraction_rules.xml']) {
    assert.match(read('android/app/src/main/res/xml/' + file), /exclude domain="sharedpref" path="veloxion_native_auth.xml"/);
  }
  assert.match(read('capacitor.config.ts'), /loggingBehavior: "none"/);
  for (const source of [java('NativeAuthActivity'), java('NativeAuthPlugin'), read('ios/App/App/NativeAuthPlugin.swift')]) {
    assert.doesNotMatch(source, /\?(?:token|accessToken)=|putExtra\("(?:token|accessToken|password|code)"|console\.log|Log\.[diwe]\(/);
  }
});

test('OTP requests are explicit, guarded and rate limited; API requests do not follow redirects', () => {
  for (const source of [java('NativeAuthActivity'), read('ios/App/App/NativeAuthViewController.swift')]) {
    assert.match(source, /resendAt/);
    assert.match(source, /termsAccepted/);
    assert.match(source, /auth\/register\/request-code/);
    assert.match(source, /busy/);
    assert.doesNotMatch(source, /7777|testCode|setInterval|Timer\.scheduledTimer/);
  }
  assert.match(java('NativeAuthApi'), /setInstanceFollowRedirects\(false\)/);
  assert.match(read('ios/App/App/NativeAuthSession.swift'), /completionHandler\(nil\)/);
});

test('offline assets contain complete bundled translations and a return to native login', () => {
  const labels = JSON.parse(read('www/native-auth.json'));
  assert.deepEqual(Object.keys(labels.ru).sort(), Object.keys(labels.en).sort());
  for (const dictionary of Object.values(labels)) {
    for (const value of Object.values(dictionary)) assert.equal(typeof value, 'string');
    for (const key of ['offline', 'login', 'register', 'phone', 'email', 'code', 'password', 'consent', 'retry']) assert.ok(dictionary[key]);
  }
  assert.match(read('www/index.html'), /auth.showLogin\(\{ clearSession: false \}\)/);
});

test('late network responses cannot restore a session after explicit logout', () => {
  assert.match(java('AuthSessionStore'), /revision.get\(\) != expectedRevision/);
  assert.match(java('AuthSessionStore'), /revision.incrementAndGet/);
  assert.match(read('ios/App/App/NativeAuthSession.swift'), /generation == revision/);
  assert.match(read('ios/App/App/NativeAuthSession.swift'), /generation \+= 1/);
  for (const source of [java('NativeAuthApi'), read('ios/App/App/NativeAuthSession.swift')]) assert.match(source, /is_blocked/);
});
