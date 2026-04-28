// api/scrape-ch.js — Test endpoints API AS24

export default async function handler(req, res) {
  const results = [];
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/html,*/*;q=0.8',
    'Accept-Language': 'de-CH,de;q=0.9',
  };
  
  // Endpoints API publics AS24 (utilisés par leur frontend)
  const endpoints = [
    // API search (souvent JSON direct)
    { name: 'AS24 API search CH', url: 'https://api.autoscout24.com/v1/listings/search?cy=CH&makeId=74&modelId=18284&pageSize=10' },
    // API mobile
    { name: 'AS24 Mobile API CH', url: 'https://m.autoscout24.com/api/listings/search?cy=CH&makeId=74&pageSize=10' },
    // GraphQL endpoint
    { name: 'AS24 GraphQL', url: 'https://www.autoscout24.com/api/graphql?query={listings(cy:"CH",make:"porsche"){price,url}}' },
    // API mockée par leur front
    { name: 'AS24 listings CH JSON', url: 'https://www.autoscout24.com/lst/porsche/cayenne.json?cy=CH' },
    // Accept JSON header
    { name: 'AS24 .com cy=CH JSON header', url: 'https://www.autoscout24.com/lst/porsche/cayenne?cy=CH&format=json', acceptJson: true },
    // SearchFunnel API endpoint (utilisé par AS24 SPA)
    { name: 'AS24 search-funnel CH', url: 'https://www.autoscout24.com/as24-search-funnel/api/v3/listings?cy=CH&makeId=74' },
    // Tester AS24 fr avec cy CH
    { name: 'AS24.fr cy=CH', url: 'https://www.autoscout24.fr/lst/porsche/cayenne?cy=CH&fregfrom=2018' },
    // Tester AS24 it (Italie a frontière CH)
    { name: 'AS24.it cy=I,CH', url: 'https://www.autoscout24.it/lst/porsche/cayenne?cy=I,CH&fregfrom=2018' },
    // Inverse : forcer CH dans path
    { name: 'AS24 CH path', url: 'https://www.autoscout24.com/ch/lst/porsche/cayenne' },
    // Country-specific iframe URL
    { name: 'AS24 plzcr CH iframe', url: 'https://www.autoscout24.com/lst/porsche/cayenne?country=CH&plzr=8000' },
  ];
  
  for (const ep of endpoints) {
    try {
      const h = ep.acceptJson ? { ...headers, 'Accept': 'application/json' } : headers;
      const r = await fetch(ep.url, { headers: h, redirect: 'follow' });
      const text = await r.text();
      
      let listingCount = 0;
      let isJson = false;
      let sample = null;
      
      const ct = r.headers.get('content-type') || '';
      isJson = ct.includes('json');
      
      if (isJson) {
        try {
          const data = JSON.parse(text);
          // Chercher arrays
          function find(o, p='') {
            if (Array.isArray(o) && o.length > 2 && o[0]?.price) return { path: p, count: o.length };
            if (o && typeof o === 'object') {
              for (const [k, v] of Object.entries(o)) {
                const r = find(v, p ? `${p}.${k}` : k);
                if (r) return r;
              }
            }
            return null;
          }
          const f = find(data);
          if (f) { listingCount = f.count; sample = f.path; }
        } catch(e) {}
      } else {
        // HTML — chercher __NEXT_DATA__
        const m = text.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
        if (m) {
          try {
            const data = JSON.parse(m[1]);
            listingCount = data?.props?.pageProps?.listings?.length || 0;
            const nbResults = data?.props?.pageProps?.numberOfResults;
            sample = nbResults !== undefined ? `numberOfResults=${nbResults}` : null;
          } catch(e) {}
        }
      }
      
      results.push({
        name: ep.name,
        url: ep.url.slice(0, 80),
        status: r.status,
        contentType: ct.slice(0, 50),
        sizeKb: Math.round(text.length / 1024),
        isJson,
        listingCount,
        sample,
        finalUrl: r.url.slice(0, 80),
      });
    } catch(e) {
      results.push({ name: ep.name, error: e.message });
    }
  }
  
  return res.status(200).json({ results });
}
