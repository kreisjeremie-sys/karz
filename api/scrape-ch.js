// api/scrape-ch.js — TEST 4 nouvelles pistes pour scraper marché CH

export default async function handler(req, res) {
  const results = [];
  
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de-CH,de;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  // ═════════════════════════════════════════════════════════════
  // PISTE 1 : Google Cache / Wayback Machine pour AS24.ch
  // Si Cloudflare bloque le live, peut-être pas le cache
  // ═════════════════════════════════════════════════════════════
  results.push(await testUrl(
    'P1: Google Cache AS24.ch',
    'https://webcache.googleusercontent.com/search?q=cache:autoscout24.ch/de/lst/porsche/cayenne',
    baseHeaders
  ));

  results.push(await testUrl(
    'P1b: Wayback Machine AS24.ch',
    'https://web.archive.org/web/2025*/autoscout24.ch/de/lst/porsche/cayenne',
    baseHeaders
  ));

  // ═════════════════════════════════════════════════════════════
  // PISTE 2 : Sites suisses moins protégés
  // car-for-you.ch, autoricardo.ch, gowago.ch, motorbeurs.ch
  // ═════════════════════════════════════════════════════════════
  results.push(await testUrl(
    'P2a: car-for-you.ch',
    'https://www.car-for-you.ch/de/auto/porsche/cayenne',
    baseHeaders
  ));

  results.push(await testUrl(
    'P2b: AutoRicardo.ch',
    'https://www.autoricardo.ch/auto-occasion/porsche-cayenne',
    baseHeaders
  ));

  results.push(await testUrl(
    'P2c: GoWago.ch',
    'https://gowago.ch/leasing/porsche-cayenne',
    baseHeaders
  ));

  // ═════════════════════════════════════════════════════════════
  // PISTE 3 : Garages individuels suisses (small dealers)
  // Plus protégés ? Tester quelques exemples connus
  // ═════════════════════════════════════════════════════════════
  results.push(await testUrl(
    'P3a: Emil Frey occasions',
    'https://www.emilfrey.ch/de/occasions?marke=porsche&modell=cayenne',
    baseHeaders
  ));

  // ═════════════════════════════════════════════════════════════
  // PISTE 4 : OFAS / OFROU — registres officiels suisses
  // Pas de prix mais on a les données techniques
  // ═════════════════════════════════════════════════════════════
  // Pas pertinent pour le prix
  
  // ═════════════════════════════════════════════════════════════
  // PISTE 5 : APIs publiques d'agrégateurs
  // Auto-i-DAT (suisse), Eurotax web service
  // ═════════════════════════════════════════════════════════════
  results.push(await testUrl(
    'P5a: Auto-i-DAT.ch search',
    'https://www.auto-i-dat.ch/de/search?make=porsche&model=cayenne',
    baseHeaders
  ));

  // ═════════════════════════════════════════════════════════════
  // PISTE 6 : RSS / Sitemaps AS24.ch (souvent moins protégés)
  // ═════════════════════════════════════════════════════════════
  results.push(await testUrl(
    'P6a: Sitemap AS24.ch',
    'https://www.autoscout24.ch/sitemap.xml',
    baseHeaders
  ));

  results.push(await testUrl(
    'P6b: Robots AS24.ch',
    'https://www.autoscout24.ch/robots.txt',
    baseHeaders
  ));

  // ═════════════════════════════════════════════════════════════
  // PISTE 7 : Sub-domains AS24.ch / m.autoscout24.ch / API hidden
  // ═════════════════════════════════════════════════════════════
  results.push(await testUrl(
    'P7a: m.autoscout24.ch',
    'https://m.autoscout24.ch/de/lst/porsche/cayenne',
    baseHeaders
  ));

  results.push(await testUrl(
    'P7b: AS24.ch API public',
    'https://www.autoscout24.ch/api/listing-search?make=porsche&model=cayenne',
    baseHeaders
  ));

  results.push(await testUrl(
    'P7c: AS24.ch graphql',
    'https://www.autoscout24.ch/api/graphql',
    baseHeaders
  ));

  // ═════════════════════════════════════════════════════════════
  // PISTE 8 : Approche par flux RSS / iframe widget
  // ═════════════════════════════════════════════════════════════
  results.push(await testUrl(
    'P8a: AS24.ch widget',
    'https://www.autoscout24.ch/widget/search?make=porsche&model=cayenne',
    baseHeaders
  ));

  return res.status(200).json({ results });
}

async function testUrl(name, url, headers) {
  try {
    const r = await fetch(url, { headers, redirect: 'follow' });
    const text = await r.text();
    
    return {
      name,
      url: url.slice(0, 100),
      status: r.status,
      contentType: (r.headers.get('content-type') || '').slice(0, 50),
      sizeKb: Math.round(text.length / 1024),
      hasDataDome: text.includes('captcha-delivery') || text.includes('datadome'),
      hasCloudflare: text.includes('cf-browser-verification') || text.includes('Just a moment'),
      hasJsonLd: text.includes('application/ld+json'),
      hasNextData: text.includes('__NEXT_DATA__'),
      hasOfferLink: /href="[^"]*\/(offer|car|auto|fahrzeug)[^"]+"/i.test(text),
      priceCHFCount: (text.match(/CHF\s*\d/gi) || []).length,
      sample: text.slice(0, 300).replace(/\s+/g, ' '),
    };
  } catch(e) {
    return { name, url, error: e.message.slice(0, 100) };
  }
}
