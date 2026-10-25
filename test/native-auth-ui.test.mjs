import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
const cases = JSON.parse(read('test/native-phone-cases.json'));

test('Android mask matches website formatting and preserves editing/cursor semantics', () => {
  const bin = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin') : process.platform === 'win32' ? 'E:/SDK/jbr/bin' : '';
  const temporary = join(root, 'build-local'); mkdirSync(temporary, { recursive: true });
  const dir = mkdtempSync(join(temporary, 'phone-test-'));
  const run = (...args) => execFileSync(join(bin, 'java'), ['-cp', dir, 'NativePhoneMaskProbe', ...args.map(String)], { encoding: 'utf8' });
  try {
    execFileSync(join(bin, 'javac'), ['-d', dir, join(root, 'android/app/src/main/java/io/veloxion/app/NativePhoneMask.java'), join(root, 'test/NativePhoneMaskProbe.java')]);
    for (const [input, expected] of cases.format) assert.equal(run('format', input), expected);
    for (const [before, start, count, input, expected, cursor] of cases.edit) assert.equal(run('edit', before, start, count, input), expected + '\n' + cursor);
    assert.equal(run('canonical', '+7 (912) 345-67-89'), '+79123456789');
    assert.equal(run('canonical', '+7 (912)'), '');
    const websitePath = join(root, '../rus/frontend/components/auth-client.tsx');
    if (existsSync(websitePath)) {
      const source = readFileSync(websitePath, 'utf8').match(/function formatPhoneValue\(value: string\) \{[\s\S]*?\n\}/)?.[0];
      assert.ok(source, 'RUS website mask must be available for parity check');
      const website = new Function(source.replace('value: string', 'value') + '; return formatPhoneValue;')();
      for (const [input, expected] of cases.format) assert.equal(website(input), expected);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('native layouts bundle the LK logo/font offline and only mask phone identities', () => {
  for (const asset of ['www/veloxion-logo.png', 'www/fonts/Manrope.ttf', 'www/fonts/OFL-Manrope.txt']) assert.ok(existsSync(join(root, asset)));
  const android = read('android/app/src/main/java/io/veloxion/app/NativeAuthActivity.java');
  const ios = read('ios/App/App/NativeAuthViewController.swift');
  for (const source of [android, ios]) {
    assert.match(source, /NativePhoneMask\.canonical/); assert.match(source, /NativePhoneMask\.complete/);
    assert.ok(source.includes('+7 (999) 123-45-67')); assert.match(source, /Manrope/); assert.match(source, /veloxion-logo/);
    assert.match(source, /registerTab/); assert.match(source, /loginTab/);
  }
  assert.match(android, /formatting \|\| usesEmail\(\)/);
  assert.match(ios, /textField === identity, !usesEmail/);
  assert.match(android, /consent.setChecked\(false\)/);
  assert.match(ios, /consent.isSelected = false/);
  assert.match(read('ios/App/App.xcodeproj/project.pbxproj'), /NativePhoneMask.swift in Sources/);
});
