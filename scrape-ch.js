// scrape-ch.js v5 — Test sans filtre cy + avec cy=D,A,B (pays proches CH)
import fetch from 'node-fetch';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,fr;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

// Tester plusieurs combinaisons
const TESTS = [
  { label: 'cy=CH (suisse)',          url: 'https://www.autoscout24.com/lst/porsche/macan?atype=C&cy=CH&ustate=U,N&sort=age&desc=1' },
  { label: 'cy=D (allemagne)',         url: 'https://www.autoscout24.com/lst/porsche/macan?atype=C&cy=D&ustate=U,N&sort=age&desc=1' },
  { label: 'autoscout24.ch direct',   url: 'https://www.autoscout24.ch/de/s/mk-porsche?sort%5B0%5D%5Btype%5D=RELEVANCE&sc=false' },
  { label: 'cy=D,A,B,CH',            url: 'https://www.autoscout24.com/lst/porsche/macan?atype=C&cy=D,A,B,CH&ustate=U,N&sort=age&desc=1' },
];

async function testUrl(label, url) {
  console.log(`\n[TEST] ${label}`);
  try {
    const r = await fetch(url, { headers: HEADERS });
    console.log(`Status: ${r.status}`);
    if (!r.ok) return;
    const html = await r.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) { console.log('NO __NEXT_DATA__'); return; }
    const data = JSON.parse(m[1]);
    const pp = data?.props?.pageProps;
    const listings = pp?.listings;
    console.log(`numberOfResults: ${pp?.numberOfResults}`);
    console.log(`listings.length: ${Array.isArray(listings) ? listings.length : 'not array'}`);
    if (Array.isArray(listings) && listings.length > 0) {
      const first = listings[0];
      console.log(`[SUCCESS] Premier résultat:`);
      console.log(`  Title: ${first.title || first.name || 'N/A'}`);
      console.log(`  Price: ${JSON.stringify(first.price)?.slice(0,100)}`);
      console.log(`  URL: ${first.url || 'N/A'}`);
      console.log(`  Keys: ${Object.keys(first).join(', ')}`);
    }
  } catch(e) { console.log(`Error: ${e.message}`); }
}

async function main() {
  console.log('=== KARZ Debug v5 — Test URLs ===');
  for (const t of TESTS) {
    await testUrl(t.label, t.url);
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('\nDone');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
