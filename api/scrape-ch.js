// api/scrape-ch.js — DEBUG VERSION pour Comparis.ch
// Version diagnostique : log la structure de réponse de comparis.ch

export default async function handler(req, res) {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de-CH,de;q=0.9,fr-CH;q=0.8,fr;q=0.7,en;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
  };

  // Tester plusieurs URLs Comparis pour voir laquelle marche
  const testUrls = [
    'https://en.comparis.ch/carfinder/marktplatz/details?MakeId=64&ModelId=8284', // Porsche Cayenne
    'https://en.comparis.ch/carfinder/marktplatz/result?Make=Porsche&Model=Cayenne',
    'https://www.comparis.ch/carfinder/marktplatz?Make=Porsche&Model=Cayenne',
    'https://en.comparis.ch/carfinder/marktplatz?make=porsche&model=cayenne',
    // Format de recherche standard Comparis
    'https://en.comparis.ch/carfinder/marktplatz/search?vehicleCategoryId=1&makeIdentificationNumber=64&modelIdentificationNumber=8284',
  ];

  const results = [];
  
  for (const url of testUrls) {
    try {
      const r = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      const html = await r.text();
      
      // Chercher des indices de structure
      const hasNextData = html.includes('__NEXT_DATA__');
      const hasInitialState = html.includes('__INITIAL_STATE__');
      const hasNuxt = html.includes('__NUXT__');
      const hasReactProps = html.includes('data-reactroot') || html.includes('__REACT_QUERY_STATE__');
      
      // Chercher des prix
      const priceMatches = [...html.matchAll(/CHF[\s\xa0]*([\d'.\s]+)/g)].slice(0, 5).map(m => m[0]);
      
      // Chercher des liens d'annonces
      const linkMatches = [...html.matchAll(/href="([^"]*\/(?:porsche|land-rover|cayenne|defender|range)[^"]*)"/gi)].slice(0, 5).map(m => m[1]);
      
      results.push({
        url,
        status: r.status,
        size: html.length,
        hasNextData,
        hasInitialState,
        hasNuxt,
        hasReactProps,
        priceMatches,
        linkMatches,
        contentType: r.headers.get('content-type'),
        sample: html.slice(0, 800).replace(/\s+/g, ' '),
      });
    } catch(e) {
      results.push({ url, error: e.message });
    }
  }

  return res.status(200).json({ results });
}
