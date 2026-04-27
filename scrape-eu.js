// scrape-eu.js — DEBUG VERSION — log structure AS24
import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
if (!SB_KEY) { console.error('SUPABASE_KEY manquant'); process.exit(1); }

console.log('=== DEBUG AS24 STRUCTURE ===');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,fr;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
};

async function main() {
  const url = 'https://www.autoscout24.com/lst/porsche/cayenne?atype=C&cy=D&ustate=U,N&sort=age&desc=1&page=1';
  console.log('Fetching:', url);
  const r = await fetch(url, { headers: HEADERS });
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) { console.log('NO __NEXT_DATA__'); process.exit(1); }
  const data = JSON.parse(m[1]);
  const listings = data?.props?.pageProps?.listings;
  console.log('Listings count:', listings?.length);
  if (!listings?.length) process.exit(1);
  
  const item = listings[0];
  console.log('\n--- TOP LEVEL KEYS ---');
  console.log(Object.keys(item).join(', '));
  
  console.log('\n--- VEHICLE (complet) ---');
  console.log(JSON.stringify(item.vehicle, null, 2));
  
  console.log('\n--- TRACKING ---');
  console.log(JSON.stringify(item.tracking, null, 2)?.slice(0, 800));
  
  console.log('\n--- URL ---');
  console.log(item.url);
  
  // Chercher toutes les occurrences d'année
  const str = JSON.stringify(item);
  const years = [...str.matchAll(/\b(201[5-9]|202[0-6])\b/g)].map(m => m[0]);
  const uniqueYears = [...new Set(years)];
  console.log('\n--- ANNÉES TROUVÉES ---', uniqueYears.join(', '));
  
  // Chercher 'first' et 'reg' et 'year' dans les clés
  function findKeys(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (k.toLowerCase().includes('first') || k.toLowerCase().includes('reg') || 
          k.toLowerCase().includes('year') || k.toLowerCase().includes('fuel') ||
          k.toLowerCase().includes('date')) {
        console.log(`KEY: ${p} = ${JSON.stringify(v)?.slice(0, 100)}`);
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) findKeys(v, p);
    }
  }
  console.log('\n--- CLÉS IMPORTANTES ---');
  findKeys(item);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
