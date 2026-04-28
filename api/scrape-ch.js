// api/scrape-ch.js — TEST Mobile.de avec différentes approches

export default async function handler(req, res) {
  const results = [];
  
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  // Différentes approches Mobile.de
  const urls = [
    // URLs publiques standard
    { 
      name: 'M1: Recherche standard Porsche',
      url: 'https://suchen.mobile.de/fahrzeuge/search.html?dam=false&isSearchRequest=true&makeModelVariant1.makeId=20100&pageNumber=1&scopeId=C&damageUnrepaired=NO_DAMAGE_UNREPAIRED'
    },
    { 
      name: 'M2: HomePage Porsche',
      url: 'https://www.mobile.de/fahrzeuge/auto/porsche/'
    },
    { 
      name: 'M3: Page sans params',
      url: 'https://www.mobile.de/'
    },
    {
      name: 'M4: Mobile.de avec robots',
      url: 'https://www.mobile.de/robots.txt'
    },
    {
      name: 'M5: Mobile.de sitemap',
      url: 'https://www.mobile.de/sitemap.xml'
    },
    // Endpoint API public Mobile.de
    {
      name: 'M6: API public listings',
      url: 'https://services.mobile.de/search-api/search?makeId=20100&modelGroupId=&page.number=0&page.size=20'
    },
    {
      name: 'M7: API search v2',
      url: 'https://www.mobile.de/svc/s/?ms=20100;;;&p=0&s=20'
    },
    // Sub-domains
    {
      name: 'M8: home.mobile.de',
      url: 'https://home.mobile.de/'
    },
    {
      name: 'M9: m.mobile.de',
      url: 'https://m.mobile.de/'
    },
    // En passant par un Referer
    {
      name: 'M10: avec Referer Google',
      url: 'https://suchen.mobile.de/fahrzeuge/search.html?makeModelVariant1.makeId=20100',
      extraHeaders: { 'Referer': 'https://www.google.de/' }
    },
    // En passant par un Referer Mobile.de
    {
      name: 'M11: avec Referer Mobile.de',
      url: 'https://suchen.mobile.de/fahrzeuge/search.html?makeModelVariant1.makeId=20100',
      extraHeaders: { 'Referer': 'https://www.mobile.de/' }
    },
    // Avec User-Agent crawler standard
    {
      name: 'M12: User-Agent Googlebot',
      url: 'https://suchen.mobile.de/fahrzeuge/search.html?makeModelVariant1.makeId=20100',
      extraHeaders: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
    },
  ];
  
  for (const { name, url, extraHeaders } of urls) {
    try {
      const headers = { ...baseHeaders, ...(extraHeaders || {}) };
      const r = await fetch(url, { headers, redirect: 'follow' });
      const text = await r.text();
      
      const hasNextData = text.includes('__NEXT_DATA__');
      let listingCount = 0;
      let listingPath = null;
      
      if (hasNextData) {
        const m = text.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (m) {
          try {
            const data = JSON.parse(m[1]);
            function find(o, p='') {
              if (!o || typeof o !== 'object') return null;
              if (Array.isArray(o) && o.length >= 3 && o[0] && typeof o[0] === 'object') {
                const k = Object.keys(o[0]);
                if (k.some(x => /price|car|listing|vehicle|id/i.test(x))) {
                  return { path: p, count: o.length };
                }
              }
              if (typeof o === 'object' && !Array.isArray(o)) {
                for (const [k, v] of Object.entries(o)) {
                  const r = find(v, p ? `${p}.${k}` : k);
                  if (r) return r;
                }
              }
              return null;
            }
            const f = find(data);
            if (f) { listingCount = f.count; listingPath = f.path; }
          } catch(e) {}
        }
      }
      
      const priceEur = (text.match(/€[\s\xa0]*[\d.,]+/g) || []).length;
      const offerLinks = (text.match(/href="[^"]*\/auto\/(?:porsche|land-rover|cayenne|defender)[^"]*"/gi) || []).length;
      
      results.push({
        name, 
        url: url.slice(0, 100),
        status: r.status,
        contentType: (r.headers.get('content-type') || '').slice(0, 50),
        sizeKb: Math.round(text.length / 1024),
        hasNextData, listingPath, listingCount,
        priceEur, offerLinks,
        finalUrl: r.url.slice(0, 100),
        sample: text.slice(0, 200).replace(/\s+/g, ' '),
      });
    } catch(e) {
      results.push({ name, url, error: e.message.slice(0, 100) });
    }
  }
  
  return res.status(200).json({ results });
}
