// scrape-eu.js — Scraper EU custom pour GitHub Actions
// Fetch direct AutoScout24 + Mobile.de via __NEXT_DATA__
// Zéro Apify — zéro coût
// Usage: node scrape-eu.js

import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;

if (!SB_KEY) {
  console.error('SUPABASE_KEY manquant');
  process.exit(1);
}

const MODELS = [
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'macan'               },
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'cayenne'             },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-90'         },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-110'        },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-130'        },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover'         },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-sport'   },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-evoque'  },
];

const MARKETS = {
  DE: { cy:'D', models:'all' },
  FR: { cy:'F', models:'all' },
  BE: { cy:'B', models:['defender-110','range-rover','range-rover-sport','cayenne'] },
  ES: { cy:'E', models:['cayenne','macan','range-rover-sport','defender-110'] },
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8,de;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

async function scrapeAS24Page(makeSlug, modelSlug, cy, page = 1) {
  const url = `https://www.autoscout24.com/lst/${makeSlug}/${modelSlug}?atype=C&cy=${cy}&ustate=U,N&sort=age&desc=1&page=${page}&fregfrom=2018`;
  try {
    const r = await fetch(url, { headers: HEADERS, timeout: 30000 });
    if (!r.ok) {
      console.log(`  [${r.status}] ${url}`);
      return [];
    }
    const html = await r.text();

    // Extraire __NEXT_DATA__
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!m) {
      console.log(`  [NO_NEXT_DATA] ${url}`);
      return [];
    }

    let data;
    try { data = JSON.parse(m[1]); } catch(e) { return []; }

    // Naviguer dans la structure Next.js de AS24
    const listings = extractListings(data);
    console.log(`  [OK] ${makeSlug}/${modelSlug} cy=${cy} p${page}: ${listings.length} annonces`);
    return listings;
  } catch(e) {
    console.log(`  [ERR] ${url}: ${e.message}`);
    return [];
  }
}

function extractListings(data) {
  // AS24 stocke les annonces dans plusieurs endroits selon la version
  const tryPaths = [
    () => data?.props?.pageProps?.listings?.entities,
    () => data?.props?.pageProps?.searchResponse?.listings,
    () => data?.props?.pageProps?.initialState?.search?.results,
    () => data?.props?.pageProps?.data?.searchResult?.items,
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
      // Extraire les champs — AS24 a plusieurs structures selon la version
      const price = pickNum(
        item.prices?.public?.priceRaw,
        item.price?.priceRaw,
        item.tracking?.price,
        item.publicPrice,
        item.price,
      );
      if (!price || price < 3000) return null;

      const km = pickNum(
        item.tracking?.mileage,
        item.mileage,
        item.vehicle?.mileage,
        item.specs?.mileage,
      );

      const firstReg = pickStr(
        item.firstRegistrationDate,
        item.tracking?.first_registration,
        item.firstRegistration,
        item.vehicle?.firstRegistration,
      );
      const year = parseInt(firstReg?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;

      const url = pickStr(item.url, item.listingUrl, item.adUrl);
      if (!url) return null;

      // Construire l'URL complète si relative
      const fullUrl = url.startsWith('http') ? url : 'https://www.autoscout24.com' + url;

      const fuel = pickStr(
        item.vehicle?.fuelCategory?.formatted,
        item.fuelType,
        item.tracking?.fuel_type,
        item.fuel,
      )?.toLowerCase() || null;

      const sellerType = pickStr(
        item.sellerType,
        item.seller?.type,
        item.dealer?.type,
      )?.toLowerCase() || 'unknown';

      const co2 = pickNum(item.co2Emission, item.vehicle?.co2, item.tracking?.co2) || null;
      const weight = pickNum(item.bodyWeight, item.vehicle?.bodyWeight) || null;

      return {
        listing_url:   fullUrl,
        price_eur_ttc: Math.round(price),
        km:            km || null,
        year,
        first_reg_date: firstReg || null,
        fuel_type:     fuel,
        seller_type:   sellerType.includes('dealer') || sellerType.includes('pro') ? 'pro'
                       : sellerType.includes('priv') ? 'private' : 'unknown',
        seller_name:   pickStr(item.dealerName, item.seller?.name, item.dealer?.companyName) || '—',
        days_online:   pickNum(item.daysOnMarket, item.daysOnline) || null,
        co2_wltp:      co2,
        weight_kg:     weight,
        model_full:    pickStr(item.title, item.vehicle?.title, item.name),
        version:       pickStr(item.version, item.variant, item.trim, item.vehicle?.version),
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

async function upsertListings(table, rows) {
  if (!rows.length) return 0;
  const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=listing_url`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase upsert error: ${r.status} ${txt.slice(0,200)}`);
  }
  return rows.length;
}

async function markTombstones(table, filters, seenUrls) {
  if (!seenUrls.length) return 0;
  // Récupérer les annonces actives pour ce périmètre
  let q = `${SB_URL}/rest/v1/${table}?sold_at=is.null`;
  for (const [k, v] of Object.entries(filters)) q += `&${k}=eq.${encodeURIComponent(v)}`;
  const r = await fetch(q + '&select=listing_url', {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) return 0;
  const active = await r.json();
  const toRetire = active.filter(a => !seenUrls.includes(a.listing_url)).map(a => a.listing_url);
  if (!toRetire.length) return 0;

  // Marquer sold_at
  let retired = 0;
  for (const url of toRetire) {
    const p = await fetch(
      `${SB_URL}/rest/v1/${table}?listing_url=eq.${encodeURIComponent(url)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sold_at: new Date().toISOString() }),
      }
    );
    if (p.ok) retired++;
  }
  console.log(`  [TOMBSTONE] ${retired} annonces retirées`);
  return retired;
}

async function main() {
  const batchId = new Date().toISOString().slice(0, 10) + '-EU';
  console.log(`\n=== KARZ Scrape EU — Batch ${batchId} ===\n`);

  let totalSaved = 0;
  let totalRetired = 0;
  let errors = 0;

  for (const [country, cfg] of Object.entries(MARKETS)) {
    const models = cfg.models === 'all' ? MODELS
      : MODELS.filter(m => cfg.models.includes(m.modelSlug));

    for (const model of models) {
      console.log(`\n[${country}] ${model.brand} ${model.modelSlug}`);
      const allListings = [];

      // Scraper les 2 premières pages (suffisant pour nouvelles annonces)
      for (const page of [1, 2]) {
        const listings = await scrapeAS24Page(model.makeSlug, model.modelSlug, cfg.cy, page);
        if (!listings.length) break;
        allListings.push(...listings);
        await new Promise(r => setTimeout(r, 1500)); // pause anti rate-limit
      }

      if (!allListings.length) {
        console.log(`  [SKIP] Aucune annonce`);
        errors++;
        continue;
      }

      // Enrichir avec les métadonnées
      const rows = allListings.map(l => ({
        ...l,
        brand:      model.brand,
        model_slug: model.modelSlug,
        country,
        source:     'as24',
        batch_id:   batchId,
        last_seen_at: new Date().toISOString(),
      }));

      try {
        const saved = await upsertListings('listings_eu', rows);
        totalSaved += saved;
        console.log(`  [SAVED] ${saved} annonces`);

        const seenUrls = rows.map(r => r.listing_url);
        const retired = await markTombstones(
          'listings_eu',
          { country, source: 'as24', model_slug: model.modelSlug },
          seenUrls
        );
        totalRetired += retired;
      } catch(e) {
        console.error(`  [ERR SUPABASE] ${e.message}`);
        errors++;
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== RÉSULTAT ===`);
  console.log(`Annonces sauvegardées : ${totalSaved}`);
  console.log(`Annonces retirées     : ${totalRetired}`);
  console.log(`Erreurs               : ${errors}`);
  console.log(`Batch ID              : ${batchId}`);

  if (totalSaved === 0) {
    console.error('\n[ATTENTION] Zéro annonce sauvegardée — vérifier la structure __NEXT_DATA__ AS24');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
