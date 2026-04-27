// api/scrape-ch.js — Trigger scrape CH via Apify
// Logique inline pour Vercel serverless

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET')
    return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.APIFY_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'APIFY_TOKEN manquant' });

  const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtreXR5em52cXdwdGRuc2dvZGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzUyNzksImV4cCI6MjA5MjQ1MTI3OX0.XLYgXXUkxAkHXaWCc4diAclSpLxLpsZV_NYohr9cSlg';

  try {
    const result = await runScrapeCH(TOKEN, SB_URL, SB_KEY);
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

const CH_SLUGS = [
  { slug:'macan',              brand:'porsche',    label:'Porsche Macan',      maxItems:50 },
  { slug:'cayenne',            brand:'porsche',    label:'Porsche Cayenne',    maxItems:50 },
  { slug:'defender',           brand:'land-rover', label:'LR Defender',        maxItems:60 },
  { slug:'range-rover',        brand:'land-rover', label:'Range Rover',        maxItems:50 },
  { slug:'range-rover-sport',  brand:'land-rover', label:'Range Rover Sport',  maxItems:50 },
  { slug:'range-rover-evoque', brand:'land-rover', label:'Range Rover Evoque', maxItems:40 },
];

async function runScrapeCH(apifyToken, sbUrl, sbKey) {
  const batchId = new Date().toISOString().slice(0, 10) + '-CH';
  const summary = { totalSaved: 0, totalRetired: 0, errors: [], runsCompleted: 0, benchmarks: [] };

  for (const m of CH_SLUGS) {
    try {
      const url = `https://www.autoscout24.com/lst/${m.brand}/${m.slug}?atype=C&cy=CH&ustate=U&sort=price&desc=0&fregfrom=2018`;
      const items = await scrapeApify(apifyToken, url, m.maxItems);
      if (!items?.length) continue;

      const rows = items.map(it => normalizeListingCH(it, m, batchId)).filter(Boolean);
      const saved = await upsertListings(sbUrl, sbKey, 'listings_ch', rows);
      summary.totalSaved += saved;

      const seenUrls = rows.map(r => r.listing_url).filter(Boolean);
      const retired = await markTombstones(sbUrl, sbKey, 'listings_ch', { model_slug: m.slug, seenUrls });
      summary.totalRetired += retired;

      const prices = rows.map(r => r.price_chf_ttc).filter(p => p && p > 0).sort((a,b)=>a-b);
      if (prices.length >= 5) {
        const p25 = percentile(prices, 25);
        const p50 = percentile(prices, 50);
        const p75 = percentile(prices, 75);
        const p10 = percentile(prices, 10);
        await saveBenchmark(sbUrl, sbKey, {
          brand: m.brand === 'porsche' ? 'Porsche' : 'Land Rover',
          model: m.label.replace(/^(Porsche |LR )/, ''),
          n_listings: prices.length,
          price_p10: p10, price_p25: p25, price_p50: p50, price_p75: p75,
          price_min: prices[0], price_max: prices[prices.length - 1],
          price_conservative: Math.round(p25),
          is_reliable: prices.length >= 10,
          scraped_at: new Date().toISOString(),
          search_url: url,
        });
        summary.benchmarks.push({ model: m.label, n: prices.length, p25 });
      }

      summary.runsCompleted++;
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      summary.errors.push(`${m.slug}: ${e.message}`);
    }
  }
  return { batchId, ...summary };
}

async function scrapeApify(token, url, maxItems) {
  const actors = ['automation-lab~autoscout24-scraper', 'misceres~autoscout24-scraper'];
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

function normalizeListingCH(item, m, batchId) {
  // Prix — AS24 structure confirmée
  const priceRaw = item.price?.priceFormatted || item.price?.amount || item.price;
  const priceCHF = typeof priceRaw === 'string'
    ? parseInt(priceRaw.replace(/[^0-9]/g, '')) || 0
    : pickNum(priceRaw, item.tracking?.price);
  if (!priceCHF || priceCHF < 5000) return null;

  // Km — item.vehicle.mileage.value
  const km = pickNum(item.vehicle?.mileage?.value, item.tracking?.mileage, item.mileage, item.km);

  // Année — item.vehicle.firstRegistration
  const yearStr = pickStr(item.vehicle?.firstRegistration, item.firstRegistrationDate, item.tracking?.first_registration);
  const year = parseInt(yearStr?.match(/\b(19|20)\d{2}\b/)?.[0]) || null;

  const url = pickStr(item.url, item.listingUrl, item.link);
  if (!url) return null;
  return {
    listing_url:    url,
    brand:          m.brand === 'porsche' ? 'Porsche' : 'Land Rover',
    model_slug:     m.slug,
    model_full:     pickStr(item.title, item.name, m.label),
    version:        pickStr(item.version, item.variant),
    year:           year,
    km:             km,
    price_chf_ttc:  Math.round(priceCHF),
    fuel_type:      pickStr(item.vehicle?.fuelCategory?.label, item.fuelType)?.toLowerCase() || null,
    seller_type:    pickStr(item.sellerType)?.toLowerCase() || 'unknown',
    days_online:    pickNum(item.daysOnMarket) || null,
    first_reg_date: yearStr || null,
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
function percentile(sorted, p) {
  const k = (p / 100) * (sorted.length - 1);
  const f = Math.floor(k); const c = Math.ceil(k);
  return Math.round(f === c ? sorted[f] : sorted[f] + (k - f) * (sorted[c] - sorted[f]));
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
  if (!r.ok) throw new Error(`Supabase: ${r.status}`);
  return rows.length;
}

async function markTombstones(sbUrl, sbKey, table, { model_slug, seenUrls }) {
  if (!seenUrls.length || seenUrls.length > 100) return 0;
  const inList = seenUrls.map(u => `"${u.replace(/"/g, '\\"')}"`).join(',');
  const r = await fetch(
    `${sbUrl}/rest/v1/${table}?model_slug=eq.${model_slug}&sold_at=is.null&listing_url=not.in.(${encodeURIComponent(inList)})`,
    {
      method: 'PATCH',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sold_at: new Date().toISOString() }),
    }
  );
  return r.ok ? 1 : 0;
}

async function saveBenchmark(sbUrl, sbKey, record) {
  await fetch(`${sbUrl}/rest/v1/benchmark_ch?on_conflict=brand,model`, {
    method: 'POST',
    headers: {
      apikey: sbKey, Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(record),
  });
}
