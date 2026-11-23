import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('RUS and EURO iOS allow landscape rotation on iPad and iPhone', () => {
  const plist = read('ios/App/App/Info.plist');
  for (const key of ['UISupportedInterfaceOrientations', 'UISupportedInterfaceOrientations~ipad']) {
    const block = plist.match(new RegExp('<key>' + key + '<\\/key>\\s*<array>([\\s\\S]*?)<\\/array>'))?.[1];
    assert.ok(block, key);
    for (const direction of ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']) {
      assert.match(block, new RegExp(direction), key + ': ' + direction);
    }
  }
  const regions = JSON.parse(read('app-regions.json'));
  assert.equal(regions.rus.url, 'https://veloxion.io/lk');
  assert.equal(regions.euro.url, 'https://veloxion.ai/lk');
});

test('WKWebView vertical panning remains enabled after iPad landscape rotation', () => {
  const appDelegate = read('ios/App/App/AppDelegate.swift');
  assert.match(appDelegate, /webView\.scrollView\.isScrollEnabled\s*=\s*true/);
  assert.match(appDelegate, /webView\.scrollView\.bounces\s*=\s*true/);
  assert.match(appDelegate, /webView\.scrollView\.alwaysBounceVertical\s*=\s*true/);
  assert.match(appDelegate, /func applicationDidBecomeActive[\s\S]*configureBridgeWebView\(\)/);
  assert.doesNotMatch(appDelegate, /webView\.scrollView\.isScrollEnabled\s*=\s*false/);
});

test('EURO TestFlight uses EURO signing while RUS remains isolated', () => {
  const yaml = read('codemagic.yaml');
  for (const [region, bundleId] of [['euro','eu.veloxion.app'], ['rus','io.veloxion.app']]) {
    const block = yaml.split('  ios-' + region + '-testflight:')[1]?.split('\n  ios-')[0] ?? '';
    assert.ok(block, region);
    assert.match(block, new RegExp('VELOXION_APP_REGION: ' + region));
    assert.match(block, new RegExp('bundle_identifier: ' + bundleId.replaceAll('.', '\\.') + '(?:\\n|$)'));
    assert.match(block, new RegExp('ci-testflight-prepare\\.mjs ' + region));
    assert.match(block, new RegExp('verify-ios-ipa\\.mjs ' + region));
  }
});
