// scrape-eu.js FINAL v2 — Structure AS24 confirmée depuis debug
// tracking.firstRegistration = "09-2012"
// tracking.fuelType = "b"/"d"/"e"/"m"
// vehicle.fuel = "Gasoline"/"Diesel"/"Electric"/"Hybrid"

import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
if (!SB_KEY) { console.error('SUPABASE_KEY manquant'); process.exit(1); }

console.log('=== KARZ scrape-eu.js v2 starting ===');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,fr;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
};

const MODELS = [
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'macan'              },
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'cayenne'            },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-90'        },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-110'       },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-130'       },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover'        },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-sport'  },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-evoque' },
];

const MARKETS = {
  DE: { cy:'D', models:'all' },
  FR: { cy:'F', models:'all' },
  BE: { cy:'B', models:['defender-110','range-rover','range-rover-sport','cayenne'] },
  ES: { cy:'E', models:['cayenne','macan','range-rover-sport','defender-110'] },
};

// Mapping fuelType code → label normalisé
const FUEL_MAP = {
  b: 'essence', B: 'essence',
  d: 'diesel',  D: 'diesel',
  e: 'electrique', E: 'electrique',
  m: 'hybride', M: 'hybride',
  p: 'hybride', P: 'hybride', // plug-in hybrid
  h: 'hydrogene', H: 'hydrogene',
};

function normalizeFuel(fuelCode, fuelLabel) {
  // D'abord essayer le code court (b/d/e/m)
  if (fuelCode && FUEL_MAP[fuelCode]) return FUEL_MAP[fuelCode];
  // Sinon normaliser le label textuel
  if (!fuelLabel) return null;
  const f = fuelLabel.toLowerCase();
  if (f.includes('diesel')) return 'diesel';
  if (f.includes('electric')) return 'electrique';
  if (f.includes('hybrid') || f.includes('plug')) return 'hybride';
  if (f.includes('gas') || f.includes('petrol') || f.includes('benzin')) return 'essence';
  return f;
}

async function scrapePage(makeSlug, modelSlug, cy, page = 1) {
  const url = `https://www.autoscout24.com/lst/${makeSlug}/${modelSlug}?atype=C&cy=${cy}&ustate=U,N&sort=age&desc=1&page=${page}&fregfrom=2018`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) { console.log(`  [${r.status}]`); return []; }
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) return [];
    const data = JSON.parse(m[1]);
    const listings = data?.props?.pageProps?.listings;
    if (!Array.isArray(listings) || !listings.length) return [];
    console.log(`  [OK] ${makeSlug}/${modelSlug} ${cy} p${page}: ${listings.length} annonces`);
    return listings;
  } catch(e) { console.log(`  [ERR] ${e.message}`); return []; }
}

function normalizeItem(item, model, country, batchId) {
  try {
    // Prix
    const priceRaw = item.price?.priceFormatted?.replace(/[^0-9]/g, '');
    const price = parseInt(priceRaw) || parseInt(item.tracking?.price) || 0;
    if (!price || price < 3000) return null;

    const url = item.url;
    if (!url) return null;
    const fullUrl = url.startsWith('http') ? url : 'https://www.autoscout24.com' + url;

    const v = item.vehicle || {};
    const t = item.tracking || {};

    // Kilométrage — tracking.mileage est le plus fiable (string "82008")
    const km = parseInt(t.mileage || v.mileageInKm?.replace(/[^0-9]/g, '') || 0) || null;

    // Année — tracking.firstRegistration = "09-2012" ou "2022-03"
    const firstReg = t.firstRegistration || v.firstRegistration || '';
    const yearMatch = firstReg.match(/\b(20(?:1[0-9]|2[0-6]))\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;

    // Carburant — tracking.fuelType = "b"/"d"/"e"/"m"
    const fuel = normalizeFuel(t.fuelType, v.fuel);

    // Vendeur
    const seller = item.seller || {};
    const sellerType = (seller.type || '').toLowerCase();
    const isPro = sellerType === 'd' || sellerType.includes('dealer') || sellerType.includes('pro');

    // Titre — vehicle.variant est plus descriptif
    const title = v.variant || `${v.make || ''} ${v.model || ''}`.trim() || model.brand;

    return {
      listing_url:    fullUrl,
      brand:          model.brand,
      model_slug:     model.modelSlug,
      model_full:     title,
      version:        v.variant || null,
      year,
      km,
      price_eur_ttc:  Math.round(price),
      fuel_type:      fuel,
      seller_type:    isPro ? 'pro' : 'private',
      seller_name:    seller.companyName || seller.name || '—',
      country,
      source:         'as24',
      days_online:    parseInt(item.statistics?.daysOnMarket || 0) || null,
      first_reg_date: firstReg || null,
      batch_id:       batchId,
      last_seen_at:   new Date().toISOString(),
    };
  } catch(e) { return null; }
}

async function upsertBatch(table, rows) {
  // Insérer par chunks de 20 pour éviter les erreurs de doublon intra-batch
  let saved = 0;
  const chunk = 20;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    // Déduplication intra-batch sur listing_url
    const seen = new Set();
    const unique = batch.filter(r => {
      if (seen.has(r.listing_url)) return false;
      seen.add(r.listing_url);
      return true;
    });
    const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=listing_url`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(unique),
    });
    if (r.ok) { saved += unique.length; }
    else {
      const err = await r.text();
      console.log(`  [CHUNK ERR] ${err.slice(0, 100)}`);
    }
  }
  return saved;
}

async function main() {
  const batchId = new Date().toISOString().slice(0, 10) + '-EU';
  console.log(`\n=== KARZ Scrape EU v2 — ${batchId} ===\n`);
  let totalSaved = 0, errors = 0;

  for (const [country, cfg] of Object.entries(MARKETS)) {
    const models = cfg.models === 'all' ? MODELS
      : MODELS.filter(m => cfg.models.includes(m.modelSlug));

    for (const model of models) {
      console.log(`\n[${country}] ${model.brand} ${model.modelSlug}`);
      const allRaw = [];
      for (const page of [1, 2]) {
        const items = await scrapePage(model.makeSlug, model.modelSlug, cfg.cy, page);
        if (!items.length) break;
        allRaw.push(...items);
        if (items.length < 15) break;
        await new Promise(r => setTimeout(r, 1500));
      }
      if (!allRaw.length) { errors++; continue; }

      const rows = allRaw.map(it => normalizeItem(it, model, country, batchId)).filter(Boolean);
      const withYear = rows.filter(r => r.year).length;
      const withFuel = rows.filter(r => r.fuel_type).length;
      console.log(`  [NORMALIZED] ${rows.length}/${allRaw.length} | year:${withYear} fuel:${withFuel}`);

      if (!rows.length) { errors++; continue; }
      try {
        const saved = await upsertBatch('listings_eu', rows);
        totalSaved += saved;
        console.log(`  [SAVED] ${saved}`);
      } catch(e) { console.error(`  [ERR] ${e.message}`); errors++; }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== RÉSULTAT === Sauvegardées: ${totalSaved} | Erreurs: ${errors}`);
  if (totalSaved === 0) { console.error('[ECHEC]'); process.exit(1); }
  console.log('[SUCCESS]');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
