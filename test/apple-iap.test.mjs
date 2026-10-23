import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('native purchases are compiled and registered by the storyboard controller', () => {
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  for (const name of ['VeloxionPurchasesPlugin.swift', 'VeloxionViewController.swift']) {
    assert.ok(project.includes(`${name} in Sources`));
    assert.ok(project.includes(`path = ${name}`));
  }
  assert.match(read('ios/App/App/Base.lproj/Main.storyboard'), /customClass="VeloxionViewController" customModule="App"/);
  assert.match(read('ios/App/App/VeloxionViewController.swift'), /registerPluginInstance\(VeloxionPurchasesPlugin\(\)\)/);
});
test('purchase returns signed proof without prematurely finishing delivery', () => {
  const source = read('ios/App/App/VeloxionPurchasesPlugin.swift');
  const purchase = source.split('@objc public func purchase')[1].split('@objc public func getPendingTransactions')[0];
  assert.match(purchase, /appAccountToken\(token\)/);
  assert.doesNotMatch(purchase, /\.finish\(/);
  assert.match(source, /result.jwsRepresentation/);
  assert.match(source, /Transaction.unfinished/);
  assert.match(source, /Transaction.updates/);
  assert.match(source, /case \.verified/);
  assert.match(source, /trustedOrigin/);
});
test('validation workflow cannot publish to TestFlight or App Review', () => {
  const workflow = read('codemagic.yaml').split('  ios-iap-validation:')[1].split('  ios-release:')[0];
  assert.doesNotMatch(workflow, /publishing:|submit_to_testflight|submit_to_app_store/);
  assert.match(workflow, /build-ipa/);
});
