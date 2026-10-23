import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AppStoreError, createClient, credentialsFromEnvironment } from './app-store-api.mjs';

export const BUNDLE_ID = 'io.veloxion.app';
export const NOTIFICATIONS_URL = 'https://api.veloxion.io/api/payments/apple/notifications';
export const CATALOG = [210, 420, 1990, 4500, 15000, 20000].map(credits => ({
  productId: `${BUNDLE_ID}.credits.${credits}`,
  credits,
  name: `Veloxion ${credits} credits`,
  reviewNote: `Consumable top-up of ${credits} credits for AI content generation in the Veloxion RUS account. Credits do not expire and cannot be exchanged for cash. One credit corresponds to one RUB of internal wallet credit, not one generation. Delivery requires server verification of the signed Apple transaction.`,
  localizations: [
    { locale: 'ru', name: `${credits} кредитов Veloxion`, description: `${credits} кредитов для ИИ. Без срока действия.` },
    { locale: 'en-US', name: `${credits} Veloxion credits`, description: `${credits} AI credits. No expiration.` },
  ],
}));

export function appStoreRegion(name = 'rus') {
  if (name === 'rus') return { bundleId: BUNDLE_ID, notificationsUrl: NOTIFICATIONS_URL, catalog: CATALOG };
  if (name !== 'euro') throw new AppStoreError('App Store setup region must be rus or euro.');
  const bundleId = 'eu.veloxion.app';
  return { bundleId, notificationsUrl: 'https://veloxion.eu/api/payments/apple/notifications',
    catalog: [25, 50, 100, 250, 500, 1000].map(credits => ({ productId: `${bundleId}.credits.${credits}`, credits,
      name: `Veloxion Europe ${credits} EUR credit`,
      reviewNote: `Consumable credit of EUR ${credits} to the separate Veloxion Europe wallet for AI services. Wallet credit is not the App Store retail price. Credits do not expire and cannot be cashed out. Delivery requires server verification and is idempotent.`,
      localizations: [
        { locale: 'en-US', name: `${credits} EUR wallet credit`, description: 'AI content credits. No expiration.' },
        { locale: 'de-DE', name: `${credits} EUR Guthaben`, description: 'KI-Guthaben ohne Ablaufdatum.' },
        { locale: 'it', name: `${credits} EUR di credito`, description: 'Crediti IA senza scadenza.' },
        { locale: 'es-ES', name: `${credits} EUR de saldo`, description: 'Créditos IA sin caducidad.' },
        { locale: 'fr-FR', name: `${credits} EUR de crédit`, description: 'Crédits IA sans expiration.' },
        { locale: 'pl', name: `${credits} EUR kredytu`, description: 'Kredyty AI bez terminu ważności.' },
        { locale: 'zh-Hans', name: `${credits} 欧元余额`, description: 'AI 内容点数，永久有效。' },
      ],
    })) };
}

export function notificationPatch(attributes = {}, notificationsUrl = NOTIFICATIONS_URL) {
  const patch = {};
  for (const [urlKey, versionKey] of [
    ['subscriptionStatusUrl', 'subscriptionStatusUrlVersion'],
    ['subscriptionStatusUrlForSandbox', 'subscriptionStatusUrlVersionForSandbox'],
  ]) {
    if (attributes[urlKey] && attributes[urlKey] !== notificationsUrl) {
      throw new AppStoreError(`Existing ${urlKey} points to another endpoint. Refusing to overwrite it.`);
    }
    if (attributes[urlKey] !== notificationsUrl) patch[urlKey] = notificationsUrl;
    if (attributes[versionKey] !== 'V2') patch[versionKey] = 'V2';
  }
  return patch;
}

function indexProducts(products, catalog = CATALOG) {
  const index = new Map();
  for (const product of products) {
    const key = product.attributes?.productId;
    if (index.has(key)) throw new AppStoreError(`Duplicate product ID in Apple response: ${key}.`);
    index.set(key, product);
  }
  for (const item of catalog) {
    const product = index.get(item.productId);
    if (product && product.attributes.inAppPurchaseType !== 'CONSUMABLE') {
      throw new AppStoreError(`Product ${item.productId} exists but is not Consumable. No products were changed.`);
    }
  }
  return index;
}

function productBody(appId, item) {
  return { data: {
    type: 'inAppPurchases',
    attributes: { name: item.name, productId: item.productId, inAppPurchaseType: 'CONSUMABLE', reviewNote: item.reviewNote },
    relationships: { app: { data: { type: 'apps', id: appId } } },
  } };
}

export async function configureAppStore(client, { apply = false, region = 'rus' } = {}) {
  const { bundleId: BUNDLE_ID, notificationsUrl: NOTIFICATIONS_URL, catalog: CATALOG } = appStoreRegion(region);
  const apps = await client.list(`/v1/apps?filter[bundleId]=${BUNDLE_ID}&limit=2`);
  if (apps.length !== 1 || apps[0].attributes?.bundleId !== BUNDLE_ID || !/^\d+$/.test(apps[0].id)) {
    throw new AppStoreError(`Expected exactly one numeric App Store app for ${BUNDLE_ID}.`);
  }
  // Read URL fields explicitly; a sparse app-list response is not proof they are empty.
  const app = (await client.request(`/v1/apps/${apps[0].id}?fields[apps]=bundleId,subscriptionStatusUrl,subscriptionStatusUrlVersion,subscriptionStatusUrlForSandbox,subscriptionStatusUrlVersionForSandbox`)).data;
  if (app?.id !== apps[0].id || app.attributes?.bundleId !== BUNDLE_ID) throw new AppStoreError('App identity changed during preflight.');
  const appId = app.id;
  const productsPath = `/v1/apps/${appId}/inAppPurchasesV2?limit=200`;
  const before = indexProducts(await client.list(productsPath), CATALOG);
  const patch = notificationPatch(app.attributes, NOTIFICATIONS_URL);
  const report = {
    appId, bundleId: BUNDLE_ID, mode: apply ? 'apply-metadata' : 'read-only',
    pricesChanged: false, availabilityChanged: false, submittedForReview: false,
    serverPaymentsEnabled: false,
    actions: [], products: [],
    backendSettings: { 'payments.apple.app_id': appId },
    remaining: ['Owner: verify active Paid Apps Agreement, banking and tax details.',
      'Approve Apple price points and territories; wallet credits are NOT Apple sale prices.',
      'Capture an actual iPhone payment-screen screenshot for App Review.',
      `Configure a dedicated Sandbox/review user on the ${region.toUpperCase()} backend and test on iPhone.`,
      'Attach the first IAPs to a new app version and submit only after explicit approval.'],
  };
  const plans = [];
  // Complete conflict checks for all existing products before the first write.
  for (const item of CATALOG) {
    const product = before.get(item.productId);
    const plan = { item, product, version: null, locales: [], frozen: false };
    if (product) {
      const versions = await client.list(`/v2/inAppPurchases/${encodeURIComponent(product.id)}/versions?limit=200`);
      const editable = versions.filter(v => v.attributes?.state === 'PREPARE_FOR_SUBMISSION');
      if (editable.length > 1) throw new AppStoreError(`Multiple editable versions for ${item.productId}; manual review required.`);
      plan.version = editable[0];
      plan.frozen = !plan.version && (versions.length > 0 || !['MISSING_METADATA', 'READY_TO_SUBMIT'].includes(product.attributes.state));
      if (plan.version) plan.locales = await client.list(`/v1/inAppPurchaseVersions/${encodeURIComponent(plan.version.id)}/localizations?limit=200`);
    }
    plans.push(plan);
  }
  for (const plan of plans) {
    const { item } = plan;
    let { product, version, locales } = plan;
    if (!product) {
      report.actions.push({ action: apply ? 'create-product' : 'would-create-product', productId: item.productId });
      if (apply) {
        product = (await client.request('/v2/inAppPurchases', { method: 'POST', body: productBody(appId, item) })).data;
        if (!product?.id) throw new AppStoreError(`Apple did not return the new product ID for ${item.productId}.`);
      }
    }
    if (plan.frozen) {
      report.products.push({ productId: item.productId, id: product.id, credits: item.credits, state: product.attributes.state, metadata: 'preserved-non-draft' });
      continue;
    }
    if (!version) {
      report.actions.push({ action: apply ? 'create-draft-version' : 'would-create-draft-version', productId: item.productId });
      if (apply) {
        version = (await client.request('/v1/inAppPurchaseVersions', { method: 'POST', body: { data: {
          type: 'inAppPurchaseVersions', relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id: product.id } } },
        } } })).data;
        if (!version?.id || version.attributes?.state !== 'PREPARE_FOR_SUBMISSION') throw new AppStoreError('Apple did not return an editable draft version.');
        // A new draft may inherit metadata; never duplicate inherited localizations.
        locales = await client.list(`/v1/inAppPurchaseVersions/${encodeURIComponent(version.id)}/localizations?limit=200`);
      }
    }
    for (const localization of item.localizations) {
      if (locales.some(l => l.attributes?.locale === localization.locale)) continue;
      report.actions.push({ action: apply ? 'create-localization' : 'would-create-localization', productId: item.productId, locale: localization.locale });
      if (apply) await client.request('/v2/inAppPurchaseLocalizations', { method: 'POST', body: { data: {
        type: 'inAppPurchaseLocalizations', attributes: localization,
        relationships: { version: { data: { type: 'inAppPurchaseVersions', id: version.id } } },
      } } });
    }
    if (apply) {
      const verified = await client.list(`/v1/inAppPurchaseVersions/${encodeURIComponent(version.id)}/localizations?limit=200`);
      if (!item.localizations.every(l => verified.some(actual => actual.attributes?.locale === l.locale))) {
        throw new AppStoreError(`Localization verification failed for ${item.productId}. Rerun the audit before retrying.`);
      }
    }
    report.products.push({ productId: item.productId, id: product?.id || null, credits: item.credits,
      versionId: version?.id || null, metadata: apply ? 'draft-localizations-verified' : 'planned',
      locales: item.localizations.map(l => l.locale) });
  }
  if (Object.keys(patch).length) {
    report.actions.push({ action: apply ? 'set-notifications-v2' : 'would-set-notifications-v2' });
    if (apply) await client.request(`/v1/apps/${appId}`, { method: 'PATCH', body: { data: { type: 'apps', id: appId, attributes: patch } } });
  }
  if (apply) {
    const after = indexProducts(await client.list(productsPath), CATALOG);
    if (!CATALOG.every(item => after.has(item.productId))) throw new AppStoreError('Final product verification failed.');
    const verifiedApp = (await client.request(`/v1/apps/${appId}`)).data;
    if (Object.keys(notificationPatch(verifiedApp?.attributes, NOTIFICATIONS_URL)).length) throw new AppStoreError('Notification URL verification failed.');
  }
  report.notifications = { production: NOTIFICATIONS_URL, sandbox: NOTIFICATIONS_URL, version: 'V2', verified: apply };
  return report;
}

export async function main(args = process.argv.slice(2)) {
  let output;
  let apply = false;
  let planOnly = false;
  let region = 'rus';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply-metadata') apply = true;
    else if (args[i] === '--plan') planOnly = true;
    else if (args[i] === '--region' && args[i + 1]) region = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = resolve(args[++i]);
    else throw new AppStoreError('Usage: node scripts/app-store-setup.mjs [--region rus|euro] [--plan | --apply-metadata] [--output report.json]');
  }
  if (planOnly && apply) throw new AppStoreError('--plan cannot be combined with --apply-metadata.');
  const config = appStoreRegion(region);
  const save = report => {
    if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }); }
    console.log(JSON.stringify(report, null, 2));
  };
  try {
    const report = planOnly
      ? { mode: 'offline-plan', bundleId: config.bundleId, products: config.catalog, notifications: { url: config.notificationsUrl, version: 'V2' }, pricesChanged: false, submittedForReview: false }
      : await configureAppStore(createClient({ credentials: credentialsFromEnvironment(), allowMetadata: apply }), { apply, region });
    save({ success: true, ...report });
  } catch (error) {
    // Only our sanitized diagnostics may reach build logs or artifacts.
    const message = error instanceof AppStoreError ? error.message : 'App Store setup failed unexpectedly; credentials were not logged.';
    save({ success: false, error: message, mode: apply ? 'apply-metadata' : 'read-only', pricesChanged: false, submittedForReview: false });
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Invalid setup arguments. Use --plan, --apply-metadata or --output report.json.'); process.exitCode = 1; });
}
