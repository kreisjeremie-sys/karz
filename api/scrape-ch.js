// api/scrape-ch.js — TEST 4 stratégies différentes pour scraper le marché CH

export default async function handler(req, res) {
  const results = [];
  
  // Stratégie 1: AS24.com avec cy=CH MAIS user-agent mobile (différent crawl)
  results.push(await testStrategy(
    'S1: AS24.com cy=CH mobile UA',
    'https://www.autoscout24.com/lst/porsche/cayenne?cy=CH',
    {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept-Language': 'de-CH,de;q=0.9',
    }
  ));
  
  // Stratégie 2: Mobile.de (concurrent allemand qui inclut annonces CH frontalières)
  results.push(await testStrategy(
    'S2: Mobile.de avec country CH',
    'https://suchen.mobile.de/fahrzeuge/search.html?makeModelVariant1.makeId=20100&country=CH&damageUnrepaired=NO_DAMAGE_UNREPAIRED&isSearchRequest=true&pageNumber=1&pageSize=20&scopeId=C',
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'de-CH,de;q=0.9',
    }
  ));
  
  // Stratégie 3: Tutti.ch (annonces locales suisses, peut-être moins protégé)
  results.push(await testStrategy(
    'S3: Tutti.ch Porsche Cayenne',
    'https://www.tutti.ch/de/q/autos?query=porsche+cayenne&sorting=newest',
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'de-CH,de;q=0.9',
    }
  ));
  
  // Stratégie 4: Anibis.ch (autre marketplace suisse)
  results.push(await testStrategy(
    'S4: Anibis.ch',
    'https://www.anibis.ch/fr/c/auto-bateaux-2-roues-vehicules-d-occasion?fts=porsche+cayenne',
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-CH,fr;q=0.9,de;q=0.7',
    }
  ));
  
  // Stratégie 5: Mobile.de page Porsche standard sans country (juste pour comparer)
  results.push(await testStrategy(
    'S5: Mobile.de Porsche standard',
    'https://suchen.mobile.de/fahrzeuge/search.html?makeModelVariant1.makeId=20100&isSearchRequest=true&pageSize=20&scopeId=C',
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'de-DE,de;q=0.9',
    }
  ));

  return res.status(200).json({ results });
}

async function testStrategy(name, url, headers) {
  try {
    const baseHeaders = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      ...headers,
    };
    const r = await fetch(url, { headers: baseHeaders, redirect: 'follow' });
    const html = await r.text();
    
    // Compter les indices d'annonces
    const indicators = {
      hasNextData: html.includes('__NEXT_DATA__'),
      hasNuxt: html.includes('__NUXT__'),
      hasInitialState: html.includes('__INITIAL_STATE__'),
      hasReactQuery: html.includes('__REACT_QUERY_STATE__'),
      hasDataDome: html.includes('captcha-delivery') || html.includes('datadome'),
      hasCloudflare: html.includes('cf-browser-verification') || html.includes('Just a moment'),
      sizeKb: Math.round(html.length / 1024),
    };
    
    // Chercher les prix CHF/EUR
    const priceCHF = [...html.matchAll(/CHF[\s\xa0]*([\d'.]+)/g)].slice(0, 5).map(m => m[0]);
    const priceEUR = [...html.matchAll(/€[\s\xa0]*([\d'.]+)/g)].slice(0, 3).map(m => m[0]);
    
    // Chercher des liens d'annonces
    const offerLinks = [...html.matchAll(/href="([^"]*(?:\/auto\/|\/offers?\/|\/fahrzeuge\/|\/vehicle\/)[^"]+)"/g)].slice(0, 5).map(m => m[1]);
    
    // Chercher arrays JSON avec items qui ressemblent à annonces
    let listingCount = 0;
    let listingPath = null;
    let firstListing = null;
    
    if (indicators.hasNextData) {
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      if (m) {
        try {
          const data = JSON.parse(m[1]);
          // Chercher récursivement
          function findArr(obj, path = '') {
            if (!obj || typeof obj !== 'object') return null;
            for (const [k, v] of Object.entries(obj)) {
              const p = path ? `${path}.${k}` : k;
              if (Array.isArray(v) && v.length >= 3 && v[0] && typeof v[0] === 'object') {
                const keys = Object.keys(v[0]);
                if (keys.some(x => /price|vehicle|mileage|year/i.test(x))) {
                  return { path: p, count: v.length, sample: keys.slice(0, 10) };
                }
              }
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                const res = findArr(v, p);
                if (res) return res;
              }
            }
            return null;
          }
          const found = findArr(data);
          if (found) {
            listingCount = found.count;
            listingPath = found.path;
            firstListing = found.sample;
          }
        } catch(e) {}
      }
    }
    
    return {
      name, url, status: r.status, ...indicators,
      priceCHF: priceCHF.length, priceEUR: priceEUR.length,
      sampleCHF: priceCHF.slice(0, 3),
      offerLinks: offerLinks.slice(0, 3),
      listingCount, listingPath, firstListing,
      finalUrl: r.url.slice(0, 100),
    };
  } catch(e) {
    return { name, url, error: e.message };
  }
}
