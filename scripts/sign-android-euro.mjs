import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const java = join(process.env.JAVA_HOME || 'E:/SDK/jbr', 'bin/java.exe');
const tools = join(process.env.ANDROID_SDK_ROOT || 'E:/non/android-sdk/Sdk', 'build-tools/36.0.0');
const privateDir = join(homedir(), '.codex/connectors/veloxion-android-signing');
const envPath = join(privateDir, '.env'), keystore = join(privateDir, 'euro-release.p12');
const run = (file, args, options = {}) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...options });
try {
  const unsigned = resolve(process.argv[2] || join(root, 'android/app/build/outputs/apk/release/app-release-unsigned.apk'));
  const badge = run(join(tools, 'aapt2.exe'), ['dump', 'badging', unsigned]);
  const version = /package: name='eu.veloxion.app' versionCode='(\d+)' versionName='([A-Za-z0-9._-]+)'/.exec(badge);
  if (!version || Number(version[1]) < 1) throw new Error('APK identity/version does not match EURO.');
  const config = JSON.parse(readFileSync(join(root, 'android/app/src/main/assets/capacitor.config.json'), 'utf8'));
  if (config.appId !== 'eu.veloxion.app' || config.server?.url !== 'https://veloxion.eu/lk') throw new Error('Wrong regional Capacitor configuration.');
  mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  const user = run('whoami.exe', []).trim();
  run('icacls.exe', [privateDir, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F']);
  if (!existsSync(envPath)) {
    if (existsSync(keystore)) throw new Error('Existing EURO key has no credential file; refusing to replace it.');
    const password = randomBytes(32).toString('base64url');
    writeFileSync(envPath, `ANDROID_EURO_STORE_PASSWORD=${password}\nANDROID_EURO_KEY_ALIAS=veloxion-euro\n`, { mode: 0o600, flag: 'wx' });
  }
  const credentials = parseEnv(readFileSync(envPath, 'utf8'));
  if (!credentials.ANDROID_EURO_STORE_PASSWORD || credentials.ANDROID_EURO_KEY_ALIAS !== 'veloxion-euro') throw new Error('EURO signing credentials are incomplete.');
  const env = { ...process.env, ...credentials };
  if (!existsSync(keystore)) run(join(process.env.JAVA_HOME || 'E:/SDK/jbr', 'bin/keytool.exe'), ['-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-alias', credentials.ANDROID_EURO_KEY_ALIAS,
    '-storepass:env', 'ANDROID_EURO_STORE_PASSWORD', '-keypass:env', 'ANDROID_EURO_STORE_PASSWORD', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Veloxion AI Europe, O=Veloxion'], { env });
  const directory = join(root, 'build-local/euro'); mkdirSync(directory, { recursive: true });
  const aligned = join(directory, 'euro-aligned.apk'), output = join(directory, `Veloxion-EURO-${version[2]}-${version[1]}.apk`);
  if (existsSync(output)) throw new Error('Signed APK already exists; choose a new build version instead of overwriting it.');
  run(join(tools, 'zipalign.exe'), ['-p', '-f', '4', unsigned, aligned]);
  const signer = join(tools, 'lib/apksigner.jar');
  run(java, ['-jar', signer, 'sign', '--ks', keystore, '--ks-key-alias', credentials.ANDROID_EURO_KEY_ALIAS, '--ks-pass', 'env:ANDROID_EURO_STORE_PASSWORD', '--key-pass', 'env:ANDROID_EURO_STORE_PASSWORD', '--out', output, aligned], { env });
  const verified = run(java, ['-jar', signer, 'verify', '--verbose', '--print-certs', output]);
  if (!verified.includes('Verified using v2 scheme (APK Signature Scheme v2): true')) throw new Error('APK v2 signing verification failed.');
  const report = { apk: output, appId: 'eu.veloxion.app', versionName: version[2], versionCode: Number(version[1]), signing: 'dedicated-release-key', keystore,
    sha256: createHash('sha256').update(readFileSync(output)).digest('hex'), certificateSha256: /certificate SHA-256 digest: ([a-f0-9]+)/i.exec(verified)?.[1] };
  writeFileSync(join(directory, 'build-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) { console.error(error.stderr ? 'Android signing tool failed; private output was not logged.' : error.message); process.exitCode = 1; }
