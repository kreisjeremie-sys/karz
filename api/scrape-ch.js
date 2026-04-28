// api/scrape-ch.js — TEST AS24.com avec cy=CH

export default async function handler(req, res) {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'de-CH,de;q=0.9,fr-CH;q=0.8,fr;q=0.7,en;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  const testUrls = [
    // AS24.com avec cy=CH (Suisse)
    'https://www.autoscout24.com/lst/porsche/cayenne?atype=C&cy=CH&ustate=N,U&sort=age&desc=1&page=1',
    // AS24.com avec cy=CH explicite
    'https://www.autoscout24.com/lst/porsche/cayenne?cy=CH',
    // AS24 avec query simple
    'https://www.autoscout24.com/lst/land-rover/range-rover?cy=CH',
    // AS24 fr.autoscout24 (interface FR mais .com)
    'https://www.autoscout24.fr/lst/porsche/cayenne?atype=C&cy=CH&ustate=N,U&sort=age&desc=1&page=1',
    // AS24 de.autoscout24 (sans .ch)
    'https://www.autoscout24.de/lst/porsche/cayenne?atype=C&cy=CH&ustate=N,U&sort=age&desc=1&page=1',
  ];

  const results = [];
  for (const url of testUrls) {
    try {
      const r = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      const html = await r.text();
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      let listingsCount = 0;
      let firstListingPrice = null;
      let firstListingCountry = null;
      if (m) {
        try {
          const data = JSON.parse(m[1]);
          const listings = data?.props?.pageProps?.listings || [];
          listingsCount = listings.length;
          if (listings[0]) {
            firstListingPrice = listings[0].price?.priceFormatted;
            firstListingCountry = listings[0].location?.countryCode || listings[0].tracking?.country;
          }
        } catch(e) {}
      }
      results.push({
        url,
        status: r.status,
        size: html.length,
        listingsCount,
        firstListingPrice,
        firstListingCountry,
        finalUrl: r.url,
      });
    } catch(e) {
      results.push({ url, error: e.message });
    }
  }

  return res.status(200).json({ results });
}
