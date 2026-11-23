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
      assert.ok(block.includes(direction), key + ': ' + direction);
    }
  }
  const regions = JSON.parse(read('app-regions.json'));
  assert.equal(regions.rus.url, 'https://veloxion.io/lk');
  assert.equal(regions.euro.url, 'https://veloxion.ai/lk');
});

test('WKWebView vertical panning remains enabled after iPad landscape rotation', () => {
  const appDelegate = read('ios/App/App/AppDelegate.swift');
  assert.ok(appDelegate.includes('webView.scrollView.isScrollEnabled = true'));
  assert.ok(appDelegate.includes('webView.scrollView.bounces = true'));
  assert.ok(appDelegate.includes('webView.scrollView.alwaysBounceVertical = true'));
  assert.ok(appDelegate.includes('func applicationDidBecomeActive'));
  assert.ok(appDelegate.includes('configureBridgeWebView()'));
  assert.ok(!appDelegate.includes('webView.scrollView.isScrollEnabled = false'));
});

test('EURO TestFlight loads shared certificate and installs separate EURO profile', () => {
  const yaml = read('codemagic.yaml');
  for (const region of ['euro','rus']) {
    const block = yaml.split('  ios-' + region + '-testflight:')[1]?.split('\n  ios-')[0] ?? '';
    assert.ok(block, region);
    assert.ok(block.includes('VELOXION_APP_REGION: ' + region), region);
    // Codemagic imports the shared team certificate using existing RUS setup.
    // Region-specific provisioning is explicitly installed before IPA export.
    assert.ok(block.includes('bundle_identifier: io.veloxion.app'), region);
    assert.ok(block.includes('ci-testflight-prepare.mjs ' + region), region);
    assert.ok(block.includes('verify-ios-ipa.mjs ' + region), region);
  }
  const euro = yaml.split('  ios-euro-testflight:')[1]?.split('\n  ios-rus-testflight:')[0] ?? '';
  assert.ok(euro.includes('--profile "$CM_BUILD_DIR/build/testflight/euro.mobileprovision"'));
  assert.ok(euro.includes('verify-ios-ipa.mjs euro'));
});
