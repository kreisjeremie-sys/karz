// api/scrape-ch.js — DEBUG : analyser la structure prix annonces livrables CH

export default async function handler(req, res) {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'de-CH,de;q=0.9',
  };
  
  const url = 'https://www.autoscout24.com/lst/porsche/cayenne?country=CH&plzr=8000&atype=C&ustate=N,U&sort=age&desc=1&page=1&fregfrom=2018';
  const r = await fetch(url, { headers: HEADERS });
  const html = await r.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) return res.status(200).json({ error: 'no NEXT_DATA' });
  
  const data = JSON.parse(m[1]);
  const listings = data?.props?.pageProps?.listings || [];
  
  // Pour les 5 premières annonces, extraire TOUS les champs liés au prix
  const sample = listings.slice(0, 5).map(item => ({
    url: item.url?.slice(0, 60),
    country: item.location?.countryCode,
    locationCity: item.location?.city,
    locationZip: item.location?.zip,
    
    // Prix dans toutes ses formes
    price: item.price,
    tracking_price: item.tracking?.price,
    
    // Vehicle / variant
    variant: item.vehicle?.variant,
    firstReg: item.tracking?.firstRegistration,
    mileage: item.tracking?.mileage,
    fuel: item.tracking?.fuelType,
    
    // Seller info
    sellerType: item.seller?.type,
    sellerCountry: item.seller?.address?.countryCode,
    sellerCity: item.seller?.address?.city,
    sellerZip: item.seller?.address?.zip,
    
    // Tracking complet
    trackingKeys: item.tracking ? Object.keys(item.tracking) : [],
    
    // Tous les champs de price si c'est un objet
    allPriceFields: item.price && typeof item.price === 'object' ? Object.keys(item.price) : null,
  }));
  
  // Statistiques globales sur la page
  const stats = {
    total: listings.length,
    byCountry: {},
    bySeller: {},
    pricesFormatted: listings.slice(0, 20).map(l => l.price?.priceFormatted),
  };
  listings.forEach(l => {
    const c = l.location?.countryCode || 'unknown';
    stats.byCountry[c] = (stats.byCountry[c] || 0) + 1;
    const sc = l.seller?.address?.countryCode || 'unknown';
    stats.bySeller[sc] = (stats.bySeller[sc] || 0) + 1;
  });
  
  return res.status(200).json({ stats, sample });
}
