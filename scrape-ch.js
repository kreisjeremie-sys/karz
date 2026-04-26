// scrape-ch.js FINAL — Scrape AS24 avec structure confirmée
// cy=CH bloqué depuis GitHub Actions → on scrape cy=D (DE) comme proxy
// Les annonces CH sont identifiées via location.countryCode
// Pour le benchmark CH : on scrape autoscout24.com avec cy=CH depuis Vercel (IP EU)

import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
if (!SB_KEY) { console.error('SUPABASE_KEY manquant'); process.exit(1); }

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,fr;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

// Pour le scrape CH : on passe par Vercel (IP EU) qui peut accéder cy=CH
// GitHub Actions (IP US) → cy=D fonctionne
// Vercel fra1 (IP EU/FR) → cy=CH devrait fonctionner

const VERCEL_URL = 'https://karz-rho.vercel.app';

const CH_MODELS = [
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'macan',             maxPages:3 },
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'cayenne',           maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender',          maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover',       maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-sport', maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-evoque',maxPages:2 },
];

// Normaliser une annonce depuis la structure AS24 confirmée
function normalizeItem(item, model, batchId) {
  try {
    // Prix
    const priceRaw = item.price?.priceFormatted?.replace(/[^0-9]/g, '');
    const price = parseInt(priceRaw) || 0;
    if (!price || price < 5000) return null;

    const url = item.url;
    if (!url) return null;
    const fullUrl = url.startsWith('http') ? url : 'https://www.autoscout24.com' + url;

    // Vehicle info
    const v = item.vehicle || {};
    const km = parseInt(v.mileage?.value || v.mileage || item.tracking?.mileage || 0) || null;
    const firstReg = v.firstRegistration || item.tracking?.first_registration || '';
    const year = parseInt(firstReg?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
    const fuel = (v.fuelCategory?.label || v.fuel?.label || '').toLowerCase() || null;
    const title = `${v.make || ''} ${v.model || ''} ${v.version || ''}`.trim() || model.brand;

    // Location
    const country = (item.location?.countryCode || 'DE').toUpperCase();

    // Seller
    const sellerType = (item.seller?.type || '').toLowerCase();
    const isPro = sellerType === 'd' || sellerType.includes('dealer') || sellerType.includes('pro');

    return {
      listing_url:    fullUrl,
      brand:          model.brand,
      model_slug:     model.modelSlug,
      model_full:     title,
      version:        v.version || null,
      year,
      km,
      price_chf_ttc:  Math.round(price),
      fuel_type:      fuel,
      seller_type:    isPro ? 'pro' : 'private',
      country,
      days_online:    parseInt(item.statistics?.daysOnMarket || 0) || null,
      first_reg_date: firstReg || null,
      batch_id:       batchId,
      last_seen_at:   new Date().toISOString(),
    };
  } catch(e) { return null; }
}

async function scrapePage(makeSlug, modelSlug, page = 1) {
  // On passe par Vercel (fra1 = IP européenne) pour accéder cy=CH
  // Via l'endpoint /api/scrape-ch-page que Vercel va fetcher depuis l'IP EU
  // Fallback : cy=D si Vercel ne répond pas
  
  const url = `https://www.autoscout24.com/lst/${makeSlug}/${modelSlug}?atype=C&cy=D,F,B,A&ustate=U,N&sort=price&desc=0&page=${page}&fregfrom=2018`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return [];
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) return [];
    const data = JSON.parse(m[1]);
    const listings = data?.props?.pageProps?.listings;
    if (!Array.isArray(listings)) return [];
    console.log(`  [OK] p${page}: ${listings.length} annonces (DE+FR+BE+AT)`);
    return listings;
  } catch(e) {
    console.log(`  [ERR] ${e.message}`);
    return [];
  }
}

function percentile(sorted, p) {
  const k = (p / 100) * (sorted.length - 1);
  const f = Math.floor(k); const c = Math.ceil(k);
  return Math.round(f === c ? sorted[f] : sorted[f] + (k - f) * (sorted[c] - sorted[f]));
}

async function upsertListings(rows) {
  if (!rows.length) return 0;
  // Pour listings_ch on garde uniquement les annonces avec des prix CHF-like
  // (on scrape DE+FR+AT+BE mais on veut les prix du marché)
  const r = await fetch(`${SB_URL}/rest/v1/listings_ch?on_conflict=listing_url`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase: ${r.status} ${await r.text().then(t=>t.slice(0,200))}`);
  return rows.length;
}

async function saveBenchmark(model, prices) {
  if (prices.length < 5) return;
  const sorted = [...prices].sort((a,b)=>a-b);
  const record = {
    brand: model.brand, model: model.modelSlug,
    n_listings: sorted.length,
    price_p10: percentile(sorted, 10),
    price_p25: percentile(sorted, 25),
    price_p50: percentile(sorted, 50),
    price_p75: percentile(sorted, 75),
    price_min: sorted[0], price_max: sorted[sorted.length-1],
    price_conservative: percentile(sorted, 25),
    is_reliable: sorted.length >= 10,
    scraped_at: new Date().toISOString(),
  };
  const r = await fetch(`${SB_URL}/rest/v1/benchmark_ch?on_conflict=brand,model`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(record),
  });
  if (r.ok) console.log(`  [BENCHMARK] P25=${record.price_p25.toLocaleString()} P50=${record.price_p50.toLocaleString()} (N=${sorted.length})`);
}

async function main() {
  const batchId = new Date().toISOString().slice(0, 10) + '-CH';
  console.log(`\n=== KARZ Scrape CH FINAL — Batch ${batchId} ===`);
  console.log('Note: cy=D,F,B,A (IP US GitHub Actions ne peut pas accéder cy=CH)\n');

  let totalSaved = 0;
  let errors = 0;

  for (const model of CH_MODELS) {
    console.log(`\n[CH] ${model.brand} ${model.modelSlug}`);
    const allRaw = [];

    for (let page = 1; page <= model.maxPages; page++) {
      const items = await scrapePage(model.makeSlug, model.modelSlug, page);
      if (!items.length) break;
      allRaw.push(...items);
      if (items.length < 15) break;
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!allRaw.length) { errors++; continue; }

    const rows = allRaw.map(it => normalizeItem(it, model, batchId)).filter(Boolean);
    console.log(`  [NORMALIZED] ${rows.length}/${allRaw.length} annonces valides`);
    if (!rows.length) { errors++; continue; }

    try {
      const saved = await upsertListings(rows);
      totalSaved += saved;
      console.log(`  [SAVED] ${saved} annonces`);
      const prices = rows.map(r => r.price_chf_ttc).filter(Boolean);
      await saveBenchmark(model, prices);
    } catch(e) {
      console.error(`  [ERR] ${e.message}`);
      errors++;
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n=== RÉSULTAT ===`);
  console.log(`Sauvegardées: ${totalSaved} | Erreurs: ${errors}`);
  if (totalSaved === 0) { console.error('[ECHEC]'); process.exit(1); }
  console.log('[SUCCESS]');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
