// scrape-ch.js — Scraper CH custom pour GitHub Actions
// Fetch direct AutoScout24.ch via __NEXT_DATA__
// Zéro Apify — zéro coût

import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;

if (!SB_KEY) {
  console.error('SUPABASE_KEY manquant');
  process.exit(1);
}

const CH_MODELS = [
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'macan',              maxPages:3 },
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'cayenne',            maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender',           maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover',        maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-sport',  maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-evoque', maxPages:2 },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-CH,fr;q=0.9,de-CH;q=0.8',
};

async function scrapeCHPage(makeSlug, modelSlug, page = 1) {
  // AS24.com avec cy=CH pour le marché suisse
  const url = `https://www.autoscout24.com/lst/${makeSlug}/${modelSlug}?atype=C&cy=CH&ustate=U,N&sort=price&desc=0&page=${page}&fregfrom=2018`;
  try {
    const r = await fetch(url, { headers: HEADERS, timeout: 30000 });
    if (!r.ok) { console.log(`  [${r.status}] page ${page}`); return []; }
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!m) { console.log(`  [NO_NEXT_DATA] page ${page}`); return []; }
    let data;
    try { data = JSON.parse(m[1]); } catch(e) { return []; }
    const listings = extractListings(data);
    console.log(`  [OK] ${makeSlug}/${modelSlug} CH p${page}: ${listings.length} annonces`);
    return listings;
  } catch(e) {
    console.log(`  [ERR] ${e.message}`);
    return [];
  }
}

function extractListings(data) {
  const tryPaths = [
    () => data?.props?.pageProps?.listings?.entities,
    () => data?.props?.pageProps?.searchResponse?.listings,
    () => data?.props?.pageProps?.initialState?.search?.results,
    () => data?.props?.pageProps?.listings,
  ];
  let items = null;
  for (const fn of tryPaths) {
    try {
      const v = fn();
      if (Array.isArray(v) && v.length > 0) { items = v; break; }
    } catch(e) {}
  }
  if (!items) return [];

  return items.map(item => {
    try {
      const price = pickNum(
        item.prices?.public?.priceRaw,
        item.price?.priceRaw,
        item.tracking?.price,
        item.price,
      );
      if (!price || price < 5000) return null;
      const km = pickNum(item.tracking?.mileage, item.mileage, item.vehicle?.mileage) || null;
      const firstReg = pickStr(item.firstRegistrationDate, item.tracking?.first_registration);
      const year = parseInt(firstReg?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
      const url = pickStr(item.url, item.listingUrl);
      if (!url) return null;
      const fullUrl = url.startsWith('http') ? url : 'https://www.autoscout24.com' + url;

      return {
        listing_url:   fullUrl,
        price_chf_ttc: Math.round(price),
        km,
        year,
        first_reg_date: firstReg || null,
        fuel_type:     pickStr(item.vehicle?.fuelCategory?.formatted, item.fuelType)?.toLowerCase() || null,
        seller_type:   'unknown',
        days_online:   pickNum(item.daysOnMarket) || null,
        model_full:    pickStr(item.title, item.name),
        version:       pickStr(item.version, item.variant),
      };
    } catch(e) { return null; }
  }).filter(Boolean);
}

function pickNum(...vals) {
  for (const v of vals) {
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) return n;
  }
  return 0;
}
function pickStr(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return '';
}

function percentile(sorted, p) {
  const k = (p / 100) * (sorted.length - 1);
  const f = Math.floor(k); const c = Math.ceil(k);
  return Math.round(f === c ? sorted[f] : sorted[f] + (k - f) * (sorted[c] - sorted[f]));
}

async function upsertListings(rows) {
  if (!rows.length) return 0;
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

async function saveBenchmark(brand, model, prices, searchUrl) {
  if (prices.length < 5) return;
  const sorted = [...prices].sort((a,b)=>a-b);
  const record = {
    brand, model,
    n_listings:        sorted.length,
    price_p10:         percentile(sorted, 10),
    price_p25:         percentile(sorted, 25),
    price_p50:         percentile(sorted, 50),
    price_p75:         percentile(sorted, 75),
    price_min:         sorted[0],
    price_max:         sorted[sorted.length-1],
    price_conservative: percentile(sorted, 25), // P25 direct, sans décote
    is_reliable:       sorted.length >= 10,
    scraped_at:        new Date().toISOString(),
    search_url:        searchUrl,
  };
  await fetch(`${SB_URL}/rest/v1/benchmark_ch?on_conflict=brand,model`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(record),
  });
  console.log(`  [BENCHMARK] P25=${record.price_p25} P50=${record.price_p50} (N=${sorted.length})`);
}

async function main() {
  const batchId = new Date().toISOString().slice(0, 10) + '-CH';
  console.log(`\n=== KARZ Scrape CH — Batch ${batchId} ===\n`);

  let totalSaved = 0;
  let errors = 0;

  for (const model of CH_MODELS) {
    console.log(`\n[CH] ${model.brand} ${model.modelSlug}`);
    const allListings = [];

    for (let page = 1; page <= model.maxPages; page++) {
      const listings = await scrapeCHPage(model.makeSlug, model.modelSlug, page);
      if (!listings.length) break;
      allListings.push(...listings);
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!allListings.length) { errors++; continue; }

    const rows = allListings.map(l => ({
      ...l,
      brand:      model.brand,
      model_slug: model.modelSlug,
      batch_id:   batchId,
      last_seen_at: new Date().toISOString(),
    }));

    try {
      const saved = await upsertListings(rows);
      totalSaved += saved;
      console.log(`  [SAVED] ${saved} annonces CH`);

      const prices = rows.map(r => r.price_chf_ttc).filter(Boolean);
      const searchUrl = `https://www.autoscout24.com/lst/${model.makeSlug}/${model.modelSlug}?atype=C&cy=CH`;
      await saveBenchmark(model.brand, model.modelSlug, prices, searchUrl);
    } catch(e) {
      console.error(`  [ERR] ${e.message}`);
      errors++;
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n=== RÉSULTAT ===`);
  console.log(`Annonces CH sauvegardées : ${totalSaved}`);
  console.log(`Erreurs                  : ${errors}`);

  if (totalSaved === 0) {
    console.error('\n[ATTENTION] Zéro annonce — vérifier structure __NEXT_DATA__ AS24');
    process.exit(1);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
