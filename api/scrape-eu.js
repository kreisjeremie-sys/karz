// api/scrape-eu.js — Trigger scrape EU via Apify
// Appelé manuellement depuis Admin OU automatiquement via GitHub Actions cron
// La logique est inline ici car Vercel serverless ne supporte pas les imports relatifs

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.APIFY_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'APIFY_TOKEN manquant dans Vercel Environment Variables' });

  const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtreXR5em52cXdwdGRuc2dvZGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzUyNzksImV4cCI6MjA5MjQ1MTI3OX0.XLYgXXUkxAkHXaWCc4diAclSpLxLpsZV_NYohr9cSlg';

  try {
    const result = await runScrapeEU(TOKEN, SB_URL, SB_KEY);
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── LOGIQUE SCRAPE EU (inline) ─────────────────────────────────

const EU_MARKETS = {
  DE: { models: 'all', sources: ['as24', 'mobilede'] },
  FR: { models: 'all', sources: ['as24'] },
  BE: { models: ['defender-110','range-rover','range-rover-sport','cayenne'], sources: ['as24'] },
  ES: { models: ['cayenne','macan','range-rover-sport','defender-110'],       sources: ['as24'] },
};

const ALL_MODELS = [
  { slug:'macan',                    brand:'porsche',    label:'Porsche Macan' },
  { slug:'cayenne',                  brand:'porsche',    label:'Porsche Cayenne' },
  { slug:'defender-90',              brand:'land-rover', label:'LR Defender 90' },
  { slug:'defender-110',             brand:'land-rover', label:'LR Defender 110' },
  { slug:'defender-130',             brand:'land-rover', label:'LR Defender 130' },
  { slug:'range-rover',              brand:'land-rover', label:'Range Rover' },
  { slug:'range-rover-sport',        brand:'land-rover', label:'Range Rover Sport' },
  { slug:'range-rover-evoque',       brand:'land-rover', label:'Range Rover Evoque' },
];

const CY_MAP = { DE:'D', FR:'F', BE:'B', ES:'E' };

async function runScrapeEU(apifyToken, sbUrl, sbKey) {
  const batchId = new Date().toISOString().slice(0, 10) + '-EU';
  const summary = { totalSaved: 0, totalRetired: 0, errors: [], runsCompleted: 0 };

  for (const [country, cfg] of Object.entries(EU_MARKETS)) {
    const models = cfg.models === 'all' ? ALL_MODELS
      : ALL_MODELS.filter(m => cfg.models.includes(m.slug));

    for (const source of cfg.sources) {
      for (const model of models) {
        try {
          const url = source === 'mobilede'
            ? `https://suchen.mobile.de/fahrzeuge/search.html?dam=0&isSearchRequest=true&ms%5B0%5D%5Bmn%5D=${encodeURIComponent(model.brand === 'porsche' ? 'Porsche' : 'Land Rover')}`
            : `https://www.autoscout24.com/lst/${model.brand}/${model.slug}?atype=C&cy=${CY_MAP[country]}&ustate=U&sort=age&desc=1&fregfrom=2019`;

          const items = await scrapeApify(apifyToken, url, source === 'mobilede' ? 'mobilede' : 'as24', 25);
          if (!items?.length) continue;

          const rows = items.map(it => normalizeListing(it, country, source, model, batchId)).filter(Boolean);
          const saved = await upsertListings(sbUrl, sbKey, 'listings_eu', rows);
          summary.totalSaved += saved;

          const seenUrls = rows.map(r => r.listing_url).filter(Boolean);
          const retired  = await markTombstones(sbUrl, sbKey, 'listings_eu', {
            country, source, model_slug: model.slug, seenUrls,
          });
          summary.totalRetired += retired;
          summary.runsCompleted++;
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          summary.errors.push(`${country}/${source}/${model.slug}: ${e.message}`);
        }
      }
    }
  }
  return { batchId, ...summary };
}

async function scrapeApify(token, url, source, maxItems) {
  const actors = source === 'mobilede'
    ? ['misceres~mobile-de-scraper']
    : ['automation-lab~autoscout24-scraper', 'misceres~autoscout24-scraper'];
  const input = { startUrls: [{ url }], maxItems };
  for (const actor of actors) {
    try {
      const r = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=120&memory=512`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
      );
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.length) return data;
    } catch (e) { continue; }
  }
  return [];
}

function normalizeListing(item, country, source, model, batchId) {
  const priceTTC = pickNum(item.price, item.priceEur, item.tracking?.price, item.publicPrice);
  if (!priceTTC || priceTTC < 5000) return null;
  const km = pickNum(item.tracking?.mileage, item.mileage, item.km, item.vehicle?.mileage);
  const yearStr = pickStr(item.firstRegistrationDate, item.tracking?.first_registration, item.firstRegistration);
  const year = parseInt(yearStr?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;
  const url = pickStr(item.url, item.listingUrl, item.adUrl, item.link);
  if (!url) return null;
  const fuel = pickStr(item.fuelType, item.fuel, item.tracking?.fuel_type)?.toLowerCase() || null;
  const sellerType = pickStr(item.sellerType, item.seller?.type, item.dealer?.type)?.toLowerCase() || '';
  return {
    listing_url:    url,
    brand:          model.brand === 'porsche' ? 'Porsche' : 'Land Rover',
    model_slug:     model.slug,
    model_full:     pickStr(item.title, item.name, model.label),
    version:        pickStr(item.version, item.variant, item.trim),
    year:           year,
    km:             km,
    price_eur_ttc:  Math.round(priceTTC),
    fuel_type:      fuel,
    seller_type:    sellerType.includes('dealer') || sellerType.includes('pro') ? 'pro'
                    : sellerType.includes('priv') ? 'private' : 'unknown',
    seller_name:    pickStr(item.dealerName, item.seller?.name, item.sellerName) || '—',
    country:        country,
    days_online:    pickNum(item.daysOnMarket, item.daysOnline) || null,
    co2_wltp:       pickNum(item.co2Emission, item.tracking?.co2) || null,
    weight_kg:      pickNum(item.bodyWeight, item.weight) || null,
    first_reg_date: yearStr || null,
    source:         source,
    batch_id:       batchId,
    last_seen_at:   new Date().toISOString(),
  };
}

function pickNum(...vals) {
  for (const v of vals) {
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) return n;
  }
  return 0;
}
function pickStr(...vals) {
  for (const v of vals) { if (v && String(v).trim()) return String(v).trim(); }
  return '';
}

async function upsertListings(sbUrl, sbKey, table, rows) {
  if (!rows.length) return 0;
  const r = await fetch(`${sbUrl}/rest/v1/${table}?on_conflict=listing_url`, {
    method: 'POST',
    headers: {
      apikey: sbKey, Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Supabase upsert: ${r.status} ${txt.slice(0,150)}`);
  }
  return rows.length;
}

async function markTombstones(sbUrl, sbKey, table, { country, source, model_slug, seenUrls }) {
  if (!seenUrls.length || seenUrls.length > 100) return 0;
  const inList = seenUrls.map(u => `"${u.replace(/"/g, '\\"')}"`).join(',');
  const r = await fetch(
    `${sbUrl}/rest/v1/${table}?country=eq.${country}&source=eq.${source}&model_slug=eq.${model_slug}&sold_at=is.null&listing_url=not.in.(${encodeURIComponent(inList)})`,
    {
      method: 'PATCH',
      headers: {
        apikey: sbKey, Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json', Prefer: 'count=exact',
      },
      body: JSON.stringify({ sold_at: new Date().toISOString() }),
    }
  );
  if (!r.ok) return 0;
  const range = r.headers.get('content-range') || '0';
  return parseInt(range.split('/')[1]) || 0;
}
