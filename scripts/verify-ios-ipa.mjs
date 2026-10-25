import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { APPS } from './ci-testflight-prepare.mjs';

try {
  const region = process.argv[2];
  if (!APPS[region] || process.platform !== 'darwin') throw new Error('Run on the build Mac with an explicit EURO/RUS region.');
  const files = readdirSync('build/ios/ipa').filter(file => file.endsWith('.ipa'));
  if (files.length !== 1) throw new Error('Expected exactly one IPA.');
  const ipa = resolve('build/ios/ipa', files[0]);
  const destination = mkdtempSync(join(tmpdir(), 'veloxion-verify-'));
  execFileSync('unzip', ['-q', ipa, '-d', destination], { stdio: 'pipe' });
  const apps = readdirSync(join(destination, 'Payload')).filter(name => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error('Expected one application in the IPA.');
  const appPath = join(destination, 'Payload', apps[0]);
  const info = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', join(appPath, 'Info.plist')], { encoding: 'utf8' }));
  const expected = JSON.parse(readFileSync('build/testflight/preflight.json', 'utf8'));
  const native = JSON.parse(readFileSync(join(appPath, 'capacitor.config.json'), 'utf8'));
  if (info.CFBundleIdentifier !== APPS[region].bundleId || String(info.CFBundleVersion) !== expected.buildNumber || native.appId !== APPS[region].bundleId
    || native.server?.url !== (region === 'euro' ? 'https://veloxion.eu/lk' : 'https://veloxion.io/lk')) throw new Error('IPA identity, build number or website is incorrect.');
  const schemes = (info.CFBundleURLTypes || []).flatMap(type => type.CFBundleURLSchemes || []);
  if (schemes.length !== 1 || schemes[0] !== APPS[region].bundleId) throw new Error('IPA OAuth callback is not bound to the regional Bundle ID.');
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' });
  const report = { success: true, region, appId: expected.appId, bundleId: info.CFBundleIdentifier, version: info.CFBundleShortVersionString, buildNumber: info.CFBundleVersion, website: native.server.url, signatureVerified: true, ipa };
  writeFileSync(`build/testflight/${region}-ipa.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error) { console.error(error.message?.startsWith('Command failed') ? 'IPA verification command failed.' : error.message); process.exitCode = 1; }
