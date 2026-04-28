// api/scrape-ch.js — Endpoint Vercel pour scraper autoscout24.ch
// Vercel utilise des IPs européennes (Frankfurt/Paris) acceptées par AS24.ch

export default async function handler(req, res) {
  // Allow only POST or GET
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
  const SB_KEY = process.env.SUPABASE_KEY;
  if (!SB_KEY) {
    return res.status(500).json({ error: 'SUPABASE_KEY missing in Vercel env' });
  }

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de-CH,de;q=0.9,fr-CH;q=0.8,fr;q=0.7,en;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
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

  const FUEL_MAP = { b:'essence', d:'diesel', e:'electrique', m:'hybride', p:'hybride' };
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
    const url = `https://www.autoscout24.ch/de/lst/${makeSlug}/${modelSlug}?atype=C&ustate=N,U&sort=age&desc=1&page=${page}&fregfrom=2018`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return { error: r.status, items: [] };
    const html = await r.text();
    
    // Essai 1: __NEXT_DATA__
    let m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const items = data?.props?.pageProps?.listings 
          || data?.props?.pageProps?.searchResults?.listings 
          || [];
        return { items, source: 'next' };
      } catch(e) {}
    }
    
    // Essai 2: window state
    m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        const items = data?.search?.results?.items 
          || data?.results?.items 
          || [];
        return { items, source: 'initial' };
      } catch(e) {}
    }
    
    return { items: [], source: 'none', htmlSample: html.slice(0, 500) };
  }

  function normalizeItem(item, model, batchId) {
    try {
      const v = item.vehicle || {};
      const t = item.tracking || {};
      const priceRaw = item.price?.priceFormatted?.replace(/[^0-9]/g, '') 
                      || item.price?.value || item.price;
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
      const isPro = (seller.type || '').toLowerCase().includes('d');
      const title = v.variant || `${v.make || ''} ${v.model || ''}`.trim() || model.brand;
      return {
        listing_url: fullUrl, brand: model.brand, model_slug: model.modelSlug,
        model_full: title, version: v.variant || null, year, km,
        price_chf_ttc: Math.round(price), fuel_type: fuel,
        seller_type: isPro ? 'pro' : 'private',
        seller_name: seller.companyName || seller.name || '—',
        country: 'CH', source: 'as24ch',
        first_reg_date: firstReg || null, batch_id: batchId,
        last_seen_at: new Date().toISOString(),
      };
    } catch(e) { return null; }
  }

  async function upsertBatch(rows) {
    let saved = 0;
    const chunk = 20;
    for (let i = 0; i < rows.length; i += chunk) {
      const batch = rows.slice(i, i + chunk);
      const seen = new Set();
      const unique = batch.filter(r => {
        if (seen.has(r.listing_url)) return false;
        seen.add(r.listing_url); return true;
      });
      const r = await fetch(`${SB_URL}/rest/v1/listings_ch?on_conflict=listing_url`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(unique),
      });
      if (r.ok) saved += unique.length;
    }
    return saved;
  }

  const batchId = new Date().toISOString().slice(0, 10) + '-CH';
  const log = [];
  let totalSaved = 0, errors = 0, firstError = null;

  for (const model of MODELS) {
    log.push(`[CH] ${model.brand} ${model.modelSlug}`);
    const allRaw = [];
    for (const page of [1, 2]) {
      const res = await scrapePage(model.makeSlug, model.modelSlug, page);
      if (res.error) {
        log.push(`  [${res.error}] page ${page}`);
        if (!firstError) firstError = res;
        break;
      }
      if (!res.items.length) {
        log.push(`  [NO_DATA] page ${page} (source: ${res.source})`);
        if (!firstError && res.htmlSample) firstError = { htmlSample: res.htmlSample };
        break;
      }
      log.push(`  [OK ${res.source}] page ${page}: ${res.items.length}`);
      allRaw.push(...res.items);
      if (res.items.length < 15) break;
      await new Promise(r => setTimeout(r, 1500));
    }
    if (!allRaw.length) { errors++; continue; }
    const rows = allRaw.map(it => normalizeItem(it, model, batchId)).filter(Boolean);
    log.push(`  [NORMALIZED] ${rows.length}/${allRaw.length}`);
    if (!rows.length) { errors++; continue; }
    try {
      const saved = await upsertBatch(rows);
      totalSaved += saved;
      log.push(`  [SAVED] ${saved}`);
    } catch(e) { log.push(`  [SAVE_ERR] ${e.message}`); errors++; }
    await new Promise(r => setTimeout(r, 1000));
  }

  return res.status(200).json({
    success: totalSaved > 0,
    totalSaved,
    errors,
    log,
    firstError,
    batchId,
  });
}
