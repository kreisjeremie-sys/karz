// scrape-ch.js v4 — Debug contenu pageProps.listings
import fetch from 'node-fetch';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = process.env.SUPABASE_KEY;
if (!SB_KEY) { console.error('SUPABASE_KEY manquant'); process.exit(1); }

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,fr;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

async function main() {
  const url = 'https://www.autoscout24.com/lst/porsche/macan?atype=C&cy=CH&ustate=U,N&sort=age&desc=1';
  console.log('Fetching:', url);
  
  const r = await fetch(url, { headers: HEADERS });
  console.log('Status:', r.status);
  const html = await r.text();
  
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) { console.log('NO __NEXT_DATA__'); process.exit(1); }
  
  const data = JSON.parse(m[1]);
  const pp = data?.props?.pageProps;
  
  // Inspecter listings directement
  const listings = pp?.listings;
  console.log('\n--- listings ---');
  console.log('Type:', typeof listings);
  console.log('IsArray:', Array.isArray(listings));
  console.log('Length:', listings?.length);
  
  if (Array.isArray(listings) && listings.length > 0) {
    console.log('\nPremière annonce — toutes les clés:');
    console.log(JSON.stringify(Object.keys(listings[0]), null, 2));
    console.log('\nPremière annonce — données:');
    console.log(JSON.stringify(listings[0], null, 2).slice(0, 2000));
  } else {
    // listings est peut-être un objet, pas un tableau
    console.log('\nlistings value:', JSON.stringify(listings)?.slice(0, 500));
    
    // Chercher numberOfResults pour confirmer qu'il y a des résultats
    console.log('\nnumberOfResults:', pp?.numberOfResults);
    console.log('numberOfPages:', pp?.numberOfPages);
    
    // Chercher dans d'autres structures
    console.log('\n--- Autres clés de pageProps ---');
    for (const [k, v] of Object.entries(pp || {})) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0]?.price !== undefined) {
        console.log(`Found listings-like at pageProps.${k}: ${v.length} items`);
        console.log('Keys:', Object.keys(v[0]).slice(0, 10).join(', '));
        console.log('Sample:', JSON.stringify(v[0]).slice(0, 500));
      }
    }
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
