// scrape-ch.js — Scrape RÉEL autoscout24.ch
// Stratégie: hit autoscout24.ch directement avec headers CH
// Si bloqué depuis IPs US GitHub Actions, fallback sur cy=CH via .com

import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
if (!SB_KEY) { console.error('SUPABASE_KEY manquant'); process.exit(1); }

console.log('=== KARZ scrape-ch.js v3 — autoscout24.ch ===');

// Headers Suisse
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,fr-CH;q=0.8,fr;q=0.7,en;q=0.6',
  'Accept-Encoding': 'gzip, deflate, br',
  'X-Forwarded-For': '85.0.0.1', // IP suisse (Swisscom range)
};

const MODELS = [
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'macan'              },
  { brand:'Porsche',    makeSlug:'porsche',    modelSlug:'cayenne'            },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-90'        },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-110'       },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'defender-130'       },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover'        },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-sport'  },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-velar'  },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-evoque' },
];

const FUEL_MAP = {
  b: 'essence', d: 'diesel', e: 'electrique', m: 'hybride', p: 'hybride', h: 'hydrogene',
};
function normalizeFuel(code, label) {
  if (code && FUEL_MAP[code]) return FUEL_MAP[code];
  if (!label) return null;
  const f = label.toLowerCase();
  if (f.includes('diesel')) return 'diesel';
  if (f.includes('electric') || f.includes('elektr')) return 'electrique';
  if (f.includes('hybrid') || f.includes('plug')) return 'hybride';
  if (f.includes('gas') || f.includes('petrol') || f.includes('benzin')) return 'essence';
  return f;
}

async function scrapePage(makeSlug, modelSlug, page = 1) {
  // URL autoscout24.ch (domaine suisse direct)
  const url = `https://www.autoscout24.ch/de/lst/${makeSlug}/${modelSlug}?atype=C&ustate=N,U&sort=age&desc=1&page=${page}&fregfrom=2018&size=20`;
  
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: 'follow' });
    if (!r.ok) {
      console.log(`  [${r.status}] ${url}`);
      return [];
    }
    const html = await r.text();
    
    // autoscout24.ch utilise sa propre structure différente d'autoscout24.com
    // Essai 1: __NEXT_DATA__ (si Next.js)
    let m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const listings = data?.props?.pageProps?.listings 
          || data?.props?.pageProps?.searchResults?.listings
          || [];
        if (listings.length) {
          console.log(`  [OK Next.js] ${makeSlug}/${modelSlug} p${page}: ${listings.length}`);
          return listings;
        }
      } catch(e) {}
    }
    
    // Essai 2: script JSON inline avec les annonces
    // autoscout24.ch utilise souvent window.__INITIAL_STATE__
    m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const listings = data?.search?.results?.items 
          || data?.search?.results?.listings
          || data?.results?.items
          || [];
        if (listings.length) {
          console.log(`  [OK INITIAL_STATE] ${makeSlug}/${modelSlug} p${page}: ${listings.length}`);
          return listings;
        }
      } catch(e) {}
    }
    
    // Essai 3: parsing HTML direct (si les annonces sont dans le DOM)
    // Chercher les data-listing-id ou les classes typiques
    const articleMatches = [...html.matchAll(/data-listing-id="(\d+)"[^>]*>([\s\S]*?)<\/article>/g)];
    if (articleMatches.length) {
      console.log(`  [OK HTML parse] ${makeSlug}/${modelSlug} p${page}: ${articleMatches.length}`);
      // Parser chaque article — basique
      return articleMatches.map(m => ({
        listing_id: m[1],
        html: m[2],
        _isHtmlSource: true,
      }));
    }
    
    console.log(`  [NO_DATA] ${url.slice(0, 80)}`);
    return [];
  } catch(e) { 
    console.log(`  [ERR] ${e.message}`); 
    return []; 
  }
}

function normalizeItem(item, model, batchId) {
  try {
    if (item._isHtmlSource) {
      // Parser HTML basique
      return parseHtmlListing(item, model, batchId);
    }
    
    // Structure JSON (similar à AS24.com)
    const v = item.vehicle || {};
    const t = item.tracking || {};
    
    const priceRaw = item.price?.priceFormatted?.replace(/[^0-9]/g, '') 
                    || item.price?.value
                    || item.price;
    const price = typeof priceRaw === 'string' 
      ? parseInt(priceRaw.replace(/[^0-9]/g, '')) || 0
      : parseInt(priceRaw) || 0;
    if (!price || price < 5000) return null;
    
    const url = item.url || item.detailPageUrl;
    if (!url) return null;
    const fullUrl = url.startsWith('http') ? url : 'https://www.autoscout24.ch' + url;
    
    const km = parseInt(t.mileage || v.mileageInKm?.replace(/[^0-9]/g, '') || v.mileage?.value || 0) || null;
    const firstReg = t.firstRegistration || v.firstRegistration || '';
    const yearMatch = firstReg.match(/\b(20(?:1[0-9]|2[0-6]))\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    const fuel = normalizeFuel(t.fuelType, v.fuel);
    
    const seller = item.seller || {};
    const sellerType = (seller.type || '').toLowerCase();
    const isPro = sellerType === 'd' || sellerType.includes('dealer') || sellerType.includes('pro');
    
    const title = v.variant || `${v.make || ''} ${v.model || ''}`.trim() || model.brand;
    
    return {
      listing_url:    fullUrl,
      brand:          model.brand,
      model_slug:     model.modelSlug,
      model_full:     title,
      version:        v.variant || null,
      year, km,
      price_chf_ttc:  Math.round(price), // RÉEL CHF cette fois
      fuel_type:      fuel,
      seller_type:    isPro ? 'pro' : 'private',
      seller_name:    seller.companyName || seller.name || '—',
      country:        'CH',
      source:         'as24ch',
      first_reg_date: firstReg || null,
      batch_id:       batchId,
      last_seen_at:   new Date().toISOString(),
    };
  } catch(e) { return null; }
}

function parseHtmlListing(item, model, batchId) {
  // Parser HTML très basique — extraction des infos clés
  const html = item.html;
  
  const priceMatch = html.match(/CHF[^\d]*(\d[\d\s'.]*)/);
  const price = priceMatch ? parseInt(priceMatch[1].replace(/[^0-9]/g, '')) : 0;
  if (!price || price < 5000) return null;
  
  const yearMatch = html.match(/\b(20(?:1[0-9]|2[0-6]))\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;
  
  const kmMatch = html.match(/(\d[\d\s'.]+)\s*km/);
  const km = kmMatch ? parseInt(kmMatch[1].replace(/[^0-9]/g, '')) : null;
  
  const urlMatch = html.match(/href="(\/[^"]+)"/);
  const url = urlMatch ? 'https://www.autoscout24.ch' + urlMatch[1] : null;
  if (!url) return null;
  
  let fuel = null;
  if (/diesel/i.test(html)) fuel = 'diesel';
  else if (/electric|elektr/i.test(html)) fuel = 'electrique';
  else if (/hybrid/i.test(html)) fuel = 'hybride';
  else if (/benzin|essence/i.test(html)) fuel = 'essence';
  
  return {
    listing_url:    url,
    brand:          model.brand,
    model_slug:     model.modelSlug,
    model_full:     model.brand,
    year, km,
    price_chf_ttc:  price,
    fuel_type:      fuel,
    seller_type:    'pro',
    seller_name:    '—',
    country:        'CH',
    source:         'as24ch',
    batch_id:       batchId,
    last_seen_at:   new Date().toISOString(),
  };
}

async function upsertBatch(table, rows) {
  let saved = 0;
  const chunk = 20;
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
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
    if (r.ok) saved += unique.length;
    else {
      const err = await r.text();
      console.log(`  [CHUNK ERR] ${err.slice(0, 100)}`);
    }
  }
  return saved;
}

async function main() {
  const batchId = new Date().toISOString().slice(0, 10) + '-CH';
  console.log(`\n=== KARZ Scrape CH RÉEL — ${batchId} ===\n`);
  let totalSaved = 0, errors = 0;

  for (const model of MODELS) {
    console.log(`\n[CH] ${model.brand} ${model.modelSlug}`);
    const allRaw = [];
    for (const page of [1, 2]) {
      const items = await scrapePage(model.makeSlug, model.modelSlug, page);
      if (!items.length) break;
      allRaw.push(...items);
      if (items.length < 15) break;
      await new Promise(r => setTimeout(r, 1500));
    }
    if (!allRaw.length) { errors++; continue; }
    
    const rows = allRaw.map(it => normalizeItem(it, model, batchId)).filter(Boolean);
    const withYear = rows.filter(r => r.year).length;
    const withFuel = rows.filter(r => r.fuel_type).length;
    console.log(`  [NORMALIZED] ${rows.length}/${allRaw.length} | year:${withYear} fuel:${withFuel}`);
    
    if (!rows.length) { errors++; continue; }
    try {
      const saved = await upsertBatch('listings_ch', rows);
      totalSaved += saved;
      console.log(`  [SAVED] ${saved}`);
    } catch(e) { console.error(`  [ERR] ${e.message}`); errors++; }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=== RÉSULTAT === Sauvegardées: ${totalSaved} | Erreurs: ${errors}`);
  if (totalSaved === 0) { console.error('[ECHEC]'); process.exit(1); }
  console.log('[SUCCESS]');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
