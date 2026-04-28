// api/scrape-ch.js — DEBUG structure AS24.com cy=CH

export default async function handler(req, res) {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de-CH,de;q=0.9,fr-CH;q=0.8,fr;q=0.7,en;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  const url = 'https://www.autoscout24.com/lst/porsche/cayenne?cy=CH';
  const r = await fetch(url, { headers: HEADERS, redirect: 'follow' });
  const html = await r.text();
  
  // Chercher TOUS les blocs JSON et identifier celui qui contient les annonces
  const findings = {};
  
  // 1. __NEXT_DATA__
  let m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      // Explorer toutes les clés de pageProps
      const pageProps = data?.props?.pageProps || {};
      findings.nextDataKeys = Object.keys(pageProps);
      
      // Pour chaque clé, log la taille et le type
      findings.nextDataDetails = {};
      for (const k of Object.keys(pageProps)) {
        const v = pageProps[k];
        if (Array.isArray(v)) {
          findings.nextDataDetails[k] = `array[${v.length}]` + (v[0] ? ` first_keys=${Object.keys(v[0]).slice(0,8).join(',')}` : '');
        } else if (typeof v === 'object' && v !== null) {
          findings.nextDataDetails[k] = `object keys=${Object.keys(v).slice(0,10).join(',')}`;
        } else {
          findings.nextDataDetails[k] = `${typeof v}: ${String(v).slice(0, 50)}`;
        }
      }
      
      // Chercher partout dans pageProps des arrays de >5 items qui ressemblent à des annonces
      function findListingArrays(obj, path = '') {
        const found = [];
        if (!obj || typeof obj !== 'object') return found;
        for (const [k, v] of Object.entries(obj)) {
          const newPath = path ? `${path}.${k}` : k;
          if (Array.isArray(v) && v.length >= 3 && v[0] && typeof v[0] === 'object') {
            const firstKeys = Object.keys(v[0]).join(',');
            if (firstKeys.includes('price') || firstKeys.includes('vehicle') || firstKeys.includes('id')) {
              found.push({ path: newPath, count: v.length, sampleKeys: Object.keys(v[0]).slice(0, 12) });
            }
          } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            found.push(...findListingArrays(v, newPath));
          }
        }
        return found;
      }
      findings.listingArrays = findListingArrays(data).slice(0, 10);
    } catch(e) {
      findings.nextDataError = e.message;
    }
  }
  
  // Chercher les indices de redirection ou de page différente
  findings.title = (html.match(/<title[^>]*>([^<]+)/) || [])[1];
  findings.h1 = (html.match(/<h1[^>]*>([^<]+)/) || [])[1];
  findings.canonicalUrl = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  findings.robotsMeta = (html.match(/<meta name="robots" content="([^"]+)"/) || [])[1];
  
  // Chercher des prix CHF dans le HTML
  const priceCHF = [...html.matchAll(/CHF[\s\xa0]*([\d'.\s]+)/g)].slice(0, 10).map(m => m[0]);
  findings.priceCHFmatches = priceCHF;
  
  // Chercher des liens d'annonces
  const offerLinks = [...html.matchAll(/href="(\/offers\/[^"]+)"/g)].slice(0, 5).map(m => m[1]);
  findings.offerLinks = offerLinks;
  
  return res.status(200).json(findings);
}
