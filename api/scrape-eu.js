// scrape-eu.js FINAL — Structure AS24 confirmée
import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
if (!SB_KEY) { console.error('SUPABASE_KEY manquant'); process.exit(1); }

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
  DE: { cy:'D',   models:'all' },
  FR: { cy:'F',   models:'all' },
  BE: { cy:'B',   models:['defender-110','range-rover','range-rover-sport','cayenne'] },
  ES: { cy:'E',   models:['cayenne','macan','range-rover-sport','defender-110'] },
};

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
    const priceRaw = item.price?.priceFormatted?.replace(/[^0-9]/g, '');
    const price = parseInt(priceRaw) || 0;
    if (!price || price < 3000) return null;
    const url = item.url;
    if (!url) return null;
    const fullUrl = url.startsWith('http') ? url : 'https://www.autoscout24.com' + url;
    const v = item.vehicle || {};
    const km = parseInt(v.mileage?.value || item.tracking?.mileage || 0) || null;
    const firstReg = v.firstRegistration || item.tracking?.first_registration || '';
    const year = parseInt(firstReg?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
    const fuel = (v.fuelCategory?.label || '').toLowerCase() || null;
    const sellerType = (item.seller?.type || '').toLowerCase();
    const isPro = sellerType === 'd' || sellerType.includes('dealer') || sellerType.includes('pro');
    const title = `${v.make || ''} ${v.model || ''} ${v.version || ''}`.trim();
    return {
      listing_url:    fullUrl,
      brand:          model.brand,
      model_slug:     model.modelSlug,
      model_full:     title || model.brand,
      version:        v.version || null,
      year, km,
      price_eur_ttc:  Math.round(price),
      fuel_type:      fuel,
      seller_type:    isPro ? 'pro' : 'private',
      seller_name:    item.seller?.companyName || '—',
      country,
      source:         'as24',
      days_online:    parseInt(item.statistics?.daysOnMarket || 0) || null,
      first_reg_date: firstReg || null,
      batch_id:       batchId,
      last_seen_at:   new Date().toISOString(),
    };
  } catch(e) { return null; }
}

async function upsert(table, rows) {
  if (!rows.length) return 0;
  const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=listing_url`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().then(t=>t.slice(0,150))}`);
  return rows.length;
}


// ── MOBILE.DE — source complémentaire Allemagne ───────────────
async function scrapeMobileDeModels(model, batchId) {
  // Mobile.de utilise des IDs numériques pour marques/modèles
  const MAKE_IDS = { porsche: 20100, 'land-rover': 8600 };
  const makeId = MAKE_IDS[model.makeSlug];
  if (!makeId) return [];

  const url = `https://suchen.mobile.de/fahrzeuge/search.html?isSearchRequest=true&makeModelVariant1.makeId=${makeId}&scopeId=C&minFirstRegistrationDate=2018-01-01&pageNumber=1&pageSize=50`;

  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) { console.log(`  [Mobile.de ${r.status}]`); return []; }
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) {
      // Mobile.de peut ne pas utiliser Next.js — chercher JSON inline
      const jsonMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({.*?});/s);
      if (!jsonMatch) { console.log(`  [Mobile.de NO_DATA]`); return []; }
      // Tenter d'extraire les annonces
      return [];
    }
    const data = JSON.parse(m[1]);
    // Essayer plusieurs chemins
    const items = data?.props?.pageProps?.searchResult?.items
      || data?.props?.pageProps?.listings
      || [];
    if (!items.length) { console.log(`  [Mobile.de 0 items]`); return []; }
    console.log(`  [Mobile.de OK] ${model.makeSlug} DE: ${items.length} annonces`);

    return items.map(item => {
      try {
        const priceRaw = item.price?.grossAmount || item.price?.amount || item.price;
        const price = typeof priceRaw === 'string'
          ? parseInt(priceRaw.replace(/[^0-9]/g, '')) || 0
          : parseInt(priceRaw) || 0;
        if (!price || price < 5000) return null;
        const v = item.vehicle || {};
        const km = parseInt(v.mileage?.value || v.mileage || 0) || null;
        const firstReg = v.firstRegistration || item.firstRegistrationDate || '';
        const year = parseInt(firstReg?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
        const url = item.url || item.listingUrl;
        if (!url) return null;
        const fullUrl = url.startsWith('http') ? url : 'https://www.mobile.de' + url;
        return {
          listing_url:   fullUrl,
          brand:         model.brand,
          model_slug:    model.modelSlug,
          model_full:    pickStr(item.title, item.name, model.label),
          version:       pickStr(v.version, v.variant),
          year, km,
          price_eur_ttc: Math.round(price),
          fuel_type:     pickStr(v.fuelCategory?.label, v.fuel)?.toLowerCase() || null,
          seller_type:   (item.seller?.type || '').toLowerCase().includes('dealer') ? 'pro' : 'private',
          seller_name:   pickStr(item.seller?.name, item.dealer?.name) || '—',
          country:       'DE',
          source:        'mobilede',
          batch_id:      batchId,
          last_seen_at:  new Date().toISOString(),
        };
      } catch(e) { return null; }
    }).filter(Boolean);
  } catch(e) {
    console.log(`  [Mobile.de ERR] ${e.message}`);
    return [];
  }
}

async function main() {
  const batchId = new Date().toISOString().slice(0, 10) + '-EU';
  console.log(`\n=== KARZ Scrape EU FINAL — ${batchId} ===\n`);
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
      console.log(`  [NORMALIZED] ${rows.length}/${allRaw.length}`);
      if (!rows.length) { errors++; continue; }
      try {
        const saved = await upsert('listings_eu', rows);
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
