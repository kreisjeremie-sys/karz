// scrape-ch.js v3 — Structure AS24 confirmée : pageProps.listings
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

const CH_MODELS = [
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'macan',             maxPages:3 },
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'cayenne',           maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender',          maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover',       maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-sport', maxPages:3 },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-evoque',maxPages:2 },
];

async function scrapePage(makeSlug, modelSlug, page = 1) {
  const url = `https://www.autoscout24.com/lst/${makeSlug}/${modelSlug}?atype=C&cy=CH&ustate=U,N&sort=age&desc=1&page=${page}`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) { console.log(`  [${r.status}] page ${page}`); return []; }
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) { console.log(`  [NO_NEXT_DATA] page ${page}`); return []; }
    let data;
    try { data = JSON.parse(m[1]); } catch(e) { return []; }

    // Structure confirmée : props.pageProps.listings (tableau direct)
    const listings = data?.props?.pageProps?.listings;
    if (!Array.isArray(listings)) {
      console.log(`  [NO_LISTINGS] page ${page} — type: ${typeof listings}`);
      return [];
    }
    console.log(`  [OK] ${makeSlug}/${modelSlug} CH p${page}: ${listings.length} annonces`);
    return listings;
  } catch(e) {
    console.log(`  [ERR] ${e.message}`);
    return [];
  }
}

function normalizeListing(item, model, batchId) {
  try {
    // Prix — AS24 structure confirmée
    const price = parseFloat(
      item.price?.amount ||
      item.price ||
      item.prices?.public?.priceRaw ||
      item.tracking?.price || 0
    );
    if (!price || price < 5000) return null;

    const url = item.url || item.listingUrl;
    if (!url) return null;
    const fullUrl = url.startsWith('http') ? url : 'https://www.autoscout24.com' + url;

    const km = parseInt(item.mileage?.value || item.mileage || item.tracking?.mileage || 0) || null;

    const firstReg = item.firstRegistration || item.firstRegistrationDate ||
                     item.tracking?.first_registration || '';
    const year = parseInt(firstReg?.toString().match(/\b(19|20)\d{2}\b/)?.[0]) || null;

    const fuel = (item.fuel?.label || item.fuelType || item.tracking?.fuel_type || '').toLowerCase() || null;

    const sellerType = (item.seller?.type || item.sellerType || '').toLowerCase();
    const isPro = sellerType.includes('dealer') || sellerType.includes('pro') || sellerType === 'd';

    return {
      listing_url:    fullUrl,
      brand:          model.brand,
      model_slug:     model.modelSlug,
      model_full:     item.title || item.name || `${model.brand} ${model.modelSlug}`,
      version:        item.version || item.variant || null,
      year,
      km,
      price_chf_ttc:  Math.round(price),
      fuel_type:      fuel,
      seller_type:    isPro ? 'pro' : 'private',
      days_online:    parseInt(item.daysOnMarket || 0) || null,
      first_reg_date: firstReg || null,
      batch_id:       batchId,
      last_seen_at:   new Date().toISOString(),
    };
  } catch(e) { return null; }
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

async function saveBenchmark(model, prices) {
  if (prices.length < 5) return;
  const sorted = [...prices].sort((a,b)=>a-b);
  const record = {
    brand:              model.brand,
    model:              model.modelSlug,
    n_listings:         sorted.length,
    price_p10:          percentile(sorted, 10),
    price_p25:          percentile(sorted, 25),
    price_p50:          percentile(sorted, 50),
    price_p75:          percentile(sorted, 75),
    price_min:          sorted[0],
    price_max:          sorted[sorted.length - 1],
    price_conservative: percentile(sorted, 25),
    is_reliable:        sorted.length >= 10,
    scraped_at:         new Date().toISOString(),
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
  if (r.ok) {
    console.log(`  [BENCHMARK] ${model.brand} ${model.modelSlug} — P25=CHF ${record.price_p25.toLocaleString()} P50=CHF ${record.price_p50.toLocaleString()} (N=${sorted.length})`);
  }
}

async function main() {
  const batchId = new Date().toISOString().slice(0, 10) + '-CH';
  console.log(`\n=== KARZ Scrape CH v3 — Batch ${batchId} ===\n`);

  let totalSaved = 0;
  let errors = 0;

  for (const model of CH_MODELS) {
    console.log(`\n[CH] ${model.brand} ${model.modelSlug}`);
    const allRaw = [];

    for (let page = 1; page <= model.maxPages; page++) {
      const items = await scrapePage(model.makeSlug, model.modelSlug, page);
      if (!items.length) break;
      allRaw.push(...items);
      if (items.length < 15) break; // Dernière page
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!allRaw.length) { errors++; continue; }

    const rows = allRaw.map(it => normalizeListing(it, model, batchId)).filter(Boolean);
    console.log(`  [NORMALIZED] ${rows.length}/${allRaw.length} annonces valides`);

    if (!rows.length) { errors++; continue; }

    try {
      const saved = await upsertListings(rows);
      totalSaved += saved;
      console.log(`  [SAVED] ${saved} annonces dans Supabase`);
      const prices = rows.map(r => r.price_chf_ttc).filter(Boolean);
      await saveBenchmark(model, prices);
    } catch(e) {
      console.error(`  [ERR SUPABASE] ${e.message}`);
      errors++;
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n=== RÉSULTAT FINAL ===`);
  console.log(`Annonces sauvegardées : ${totalSaved}`);
  console.log(`Erreurs               : ${errors}`);

  if (totalSaved === 0) {
    console.error('[ECHEC] Zéro annonce sauvegardée');
    process.exit(1);
  }
  console.log('[SUCCESS] Scrape CH terminé avec succès');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
