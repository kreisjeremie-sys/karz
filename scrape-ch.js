// scrape-ch.js v2 — Debug structure AS24 + URLs alternatives
import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;

if (!SB_KEY) { console.error('SUPABASE_KEY manquant'); process.exit(1); }

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,fr;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

// Tester plusieurs formats d'URL AS24
const TEST_URLS = [
  'https://www.autoscout24.com/lst/porsche/macan?atype=C&cy=CH&ustate=U,N&sort=age&desc=1',
  'https://www.autoscout24.com/lst/porsche/macan?atype=C&cy=D&ustate=U,N&sort=age&desc=1',
  'https://www.autoscout24.com/lst/porsche/macan?cy=D&ustate=U&sort=age&desc=1',
];

async function testUrl(url) {
  console.log(`\nTesting: ${url}`);
  try {
    const r = await fetch(url, { headers: HEADERS });
    console.log(`Status: ${r.status}`);
    if (!r.ok) return null;
    const html = await r.text();
    console.log(`HTML length: ${html.length} chars`);

    // Chercher __NEXT_DATA__
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) {
      console.log('NO __NEXT_DATA__ found');
      // Chercher d'autres patterns
      const patterns = [
        /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
        /window\.__PRELOADED_STATE__\s*=\s*({.*?});/s,
        /"listings":\[({.*?})\]/s,
      ];
      for (const p of patterns) {
        if (p.test(html)) console.log(`Found pattern: ${p.toString().slice(0,50)}`);
      }
      return null;
    }

    let data;
    try { data = JSON.parse(m[1]); } catch(e) { console.log('JSON parse error:', e.message); return null; }
    console.log('__NEXT_DATA__ found, size:', m[1].length);

    // Explorer la structure
    const keys = Object.keys(data?.props?.pageProps || {});
    console.log('pageProps keys:', keys.join(', '));

    // Chercher des tableaux d'annonces
    function findArrays(obj, path = '', depth = 0) {
      if (depth > 5) return;
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        const p = path ? `${path}.${k}` : k;
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
          console.log(`Array at ${p}: ${v.length} items, first keys: ${Object.keys(v[0]).slice(0,5).join(',')}`);
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
          findArrays(v, p, depth + 1);
        }
      }
    }
    findArrays(data?.props?.pageProps);
    return data;
  } catch(e) {
    console.log('Error:', e.message);
    return null;
  }
}

async function main() {
  console.log('=== KARZ Debug scraper CH ===\n');

  let workingData = null;
  for (const url of TEST_URLS) {
    const data = await testUrl(url);
    if (data) { workingData = data; break; }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!workingData) {
    console.log('\n[ATTENTION] Aucune URL ne retourne de __NEXT_DATA__');
    console.log('AS24 bloque peut-être les requêtes depuis GitHub Actions');
    console.log('Solution alternative : utiliser l API interne AS24');
    // Tester l'API interne AS24
    await testInternalAPI();
    process.exit(1);
  }
}

async function testInternalAPI() {
  console.log('\n=== Test API interne AS24 ===');
  // AS24 a une API REST interne utilisée par leur app mobile
  const apiUrls = [
    'https://api.autoscout24.com/offers?vehicle_type=J&make=porsche&model=macan&country=CH&currency=CHF&limit=5',
    'https://www.autoscout24.com/offers?vehicle_type=J&make_id=74&country=CH&limit=5',
  ];
  for (const url of apiUrls) {
    console.log(`\nAPI test: ${url}`);
    try {
      const r = await fetch(url, {
        headers: {
          ...HEADERS,
          'Accept': 'application/json',
          'X-Market': 'CH',
        }
      });
      console.log(`Status: ${r.status}`);
      if (r.ok) {
        const data = await r.json();
        console.log('Response keys:', Object.keys(data).join(', '));
        if (data.offers || data.listings || data.items) {
          console.log('[SUCCESS] API interne accessible!');
        }
      }
    } catch(e) { console.log('Error:', e.message); }
    await new Promise(r => setTimeout(r, 1000));
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
