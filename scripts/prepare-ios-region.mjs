import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const REGIONS = JSON.parse(readFileSync(new URL('../app-regions.json', import.meta.url), 'utf8'));

export function transformIOSRegion({ project, plist, offline }, regionName) {
  const region = REGIONS[regionName];
  if (!region || !['rus', 'euro'].includes(regionName)) throw new Error('Region must be rus or euro.');
  const ids = [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)];
  if (ids.length !== 2 || ids.some(match => !Object.values(REGIONS).some(item => item.appId === match[1]))) {
    throw new Error('Unexpected Xcode Bundle IDs; refusing to modify this project.');
  }
  const replacePlist = (source, key, value) => {
    const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`, 'g');
    if ([...source.matchAll(pattern)].length !== 1) throw new Error(`Expected exactly one ${key} in Info.plist.`);
    return source.replace(pattern, (_, start, end) => `${start}${value}${end}`);
  };
  const english = {
    NSCameraUsageDescription: 'Veloxion uses the camera to photograph products for AI generation and editing.',
    NSPhotoLibraryUsageDescription: 'Veloxion accesses your photo library so you can choose product photos for AI generation and editing.',
    NSPhotoLibraryAddUsageDescription: 'Veloxion saves generated and edited images to your photo library when you choose to save them.',
  };
  const russian = {
    NSCameraUsageDescription: 'Veloxion использует камеру, чтобы фотографировать товары для генерации и обработки.',
    NSPhotoLibraryUsageDescription: 'Veloxion использует доступ к галерее, чтобы выбирать фотографии товаров для генерации и обработки.',
    NSPhotoLibraryAddUsageDescription: 'Veloxion может сохранять подготовленные изображения и результаты в вашу галерею.',
  };
  plist = replacePlist(plist, 'CFBundleDisplayName', region.appName);
  for (const [key, value] of Object.entries(regionName === 'euro' ? english : russian)) plist = replacePlist(plist, key, value);
  if (!/data-veloxion-region="(?:rus|euro)"/.test(offline)) throw new Error('Offline screen is missing its region marker.');
  return {
    project: project.replace(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g, `PRODUCT_BUNDLE_IDENTIFIER = ${region.appId};`),
    plist,
    offline: offline.replace(/data-veloxion-region="(?:rus|euro)"/, `data-veloxion-region="${regionName}"`),
  };
}

export function prepareIOSRegion(regionName) {
  const paths = { project: 'ios/App/App.xcodeproj/project.pbxproj', plist: 'ios/App/App/Info.plist', offline: 'www/index.html' };
  const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(resolve(root, path), 'utf8')]));
  const result = transformIOSRegion(source, regionName);
  // Validate all inputs before updating any build files. Android is never modified.
  for (const [key, path] of Object.entries(paths)) if (source[key] !== result[key]) writeFileSync(resolve(root, path), result[key]);
  console.log(JSON.stringify({ region: regionName, ...REGIONS[regionName], androidChanged: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) { console.error('Usage: node scripts/prepare-ios-region.mjs rus|euro'); process.exitCode = 1; }
  else { try { prepareIOSRegion(process.argv[2]); } catch (error) { console.error(error.message); process.exitCode = 1; } }
}
