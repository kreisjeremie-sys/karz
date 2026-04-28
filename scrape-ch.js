// scrape-ch.js — FINAL — Scrape AS24.com avec country=CH&plzr=8000
// Découverte: country=CH (pas cy=CH) + plzr=8000 (Zurich) expose le marché CH

import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
if (!SB_KEY) { console.error('SUPABASE_KEY manquant'); process.exit(1); }

console.log('=== KARZ scrape-ch.js v4 — country=CH&plzr=8000 ===');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,fr-CH;q=0.8,fr;q=0.7,en;q=0.6',
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
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-velar'  },
  { brand:'Land Rover', makeSlug:'land-rover', modelSlug:'range-rover-evoque' },
];

const FUEL_MAP = { b:'essence', d:'diesel', e:'electrique', m:'hybride', p:'hybride', h:'hydrogene' };
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
  // PARAMÈTRE CLÉ : country=CH (pas cy=CH) + plzr=8000 (Zurich)
  const url = `https://www.autoscout24.com/lst/${makeSlug}/${modelSlug}?country=CH&plzr=8000&atype=C&ustate=N,U&sort=age&desc=1&page=${page}&fregfrom=2018`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) { console.log(`  [${r.status}]`); return []; }
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) return [];
    const data = JSON.parse(m[1]);
    const listings = data?.props?.pageProps?.listings;
    if (!Array.isArray(listings) || !listings.length) return [];
    console.log(`  [OK] ${makeSlug}/${modelSlug} CH p${page}: ${listings.length}`);
    return listings;
  } catch(e) { console.log(`  [ERR] ${e.message}`); return []; }
}

function normalizeItem(item, model, batchId) {
  try {
    const v = item.vehicle || {};
    const t = item.tracking || {};
    
    // Prix — peut être en CHF ou EUR selon l'annonce
    const priceRaw = item.price?.priceFormatted?.replace(/[^0-9]/g, '');
    const price = parseInt(priceRaw) || parseInt(t.price) || 0;
    if (!price || price < 5000) return null;
    
    const url = item.url;
    if (!url) return null;
    const fullUrl = url.startsWith('http') ? url : 'https://www.autoscout24.com' + url;
    
    // Détecter la devise depuis priceFormatted ou la location
    const priceStr = item.price?.priceFormatted || '';
    const isCHF = priceStr.includes('CHF') || priceStr.includes('Fr.');
    const isEUR = priceStr.includes('€') || priceStr.includes('EUR');
    
    // Pays de l'annonce
    const country = item.location?.countryCode || t.country || 'CH';
    
    const km = parseInt(t.mileage || v.mileageInKm?.replace(/[^0-9]/g, '') || 0) || null;
    const firstReg = t.firstRegistration || v.firstRegistration || '';
    const yearMatch = firstReg.match(/\b(20(?:1[0-9]|2[0-6]))\b/);
    const year = yearMatch ? parseInt(yearMatch[1]) : null;
    const fuel = normalizeFuel(t.fuelType, v.fuel);
    const seller = item.seller || {};
    const isPro = (seller.type || '').toLowerCase() === 'd' || 
                  (seller.type || '').toLowerCase().includes('dealer');
    const title = v.variant || `${v.make || ''} ${v.model || ''}`.trim() || model.brand;
    
    return {
      listing_url:    fullUrl,
      brand:          model.brand,
      model_slug:     model.modelSlug,
      model_full:     title,
      version:        v.variant || null,
      year,
      km,
      // price_chf_ttc : si l'annonce est en CHF on stocke direct, sinon on note la devise
      price_chf_ttc:  Math.round(price),
      currency:       isCHF ? 'CHF' : (isEUR ? 'EUR' : 'CHF'),
      fuel_type:      fuel,
      seller_type:    isPro ? 'pro' : 'private',
      seller_name:    seller.companyName || seller.name || '—',
      country:        country,
      source:         'as24-ch',
      first_reg_date: firstReg || null,
      batch_id:       batchId,
      last_seen_at:   new Date().toISOString(),
    };
  } catch(e) { return null; }
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
    // Retirer 'currency' si la colonne n'existe pas encore — on la stocke seulement si présente
    const cleaned = unique.map(r => {
      const { currency, ...rest } = r;
      return rest;
    });
    const r = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=listing_url`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(cleaned),
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
  const batchId = new Date().toISOString().slice(0, 10) + '-CH';
  console.log(`\n=== KARZ Scrape CH (AS24 country=CH) — ${batchId} ===\n`);
  let totalSaved = 0, errors = 0;

  for (const model of MODELS) {
    console.log(`\n[CH] ${model.brand} ${model.modelSlug}`);
    const allRaw = [];
    // 3 pages pour avoir un benchmark robuste
    for (const page of [1, 2, 3]) {
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
    const inCHF = rows.filter(r => r.currency === 'CHF').length;
    console.log(`  [NORMALIZED] ${rows.length}/${allRaw.length} | year:${withYear} fuel:${withFuel} CHF:${inCHF}`);
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
