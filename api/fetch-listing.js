// api/fetch-listing.js — Fetch __NEXT_DATA__ depuis URL AS24/Mobile.de
// Gratuit, sans Apify. Fallback formulaire manuel si bloqué.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url requise' });

  try {
    // User-Agent réel pour éviter les blocages basiques
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8',
      },
    });
    if (!r.ok) {
      return res.status(200).json({ success: false, error: `HTTP ${r.status} — Page bloquée ou inaccessible. Remplissez manuellement.` });
    }
    const html = await r.text();

    // Extraire __NEXT_DATA__ (AutoScout24 utilise Next.js)
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) {
      return res.status(200).json({ success: false, error: 'Données structurées non trouvées sur cette page. Remplissez manuellement.' });
    }

    let nextData;
    try { nextData = JSON.parse(m[1]); }
    catch(e) { return res.status(200).json({ success: false, error: 'JSON __NEXT_DATA__ invalide.' }); }

    // Naviguer dans le JSON pour extraire les champs (structure AS24)
    const listing = extractFromNextData(nextData);

    if (!listing.price_eur_ttc) {
      return res.status(200).json({ success: false, error: 'Prix non extrait. Remplissez manuellement.' });
    }

    return res.status(200).json({ success: true, listing });
  } catch(e) {
    return res.status(200).json({ success: false, error: 'Erreur fetch : ' + e.message + '. Remplissez manuellement.' });
  }
}

function extractFromNextData(data) {
  // Recherche profonde du listing dans le JSON Next.js
  // Structure varie selon la version AS24 — on tente plusieurs chemins
  const tryPaths = [
    () => data?.props?.pageProps?.listing,
    () => data?.props?.pageProps?.listingDetails,
    () => data?.props?.pageProps?.detailItem,
    () => data?.props?.pageProps?.data?.listing,
  ];
  let l = null;
  for (const fn of tryPaths) { try { l = fn(); if (l) break; } catch(e) {} }
  if (!l) return { price_eur_ttc: null };

  // Extraire les champs en étant tolérant à plusieurs structures
  const priceTTC = l.prices?.public?.priceRaw || l.price?.priceRaw || l.publicPrice || l.price || 0;
  const km       = l.tracking?.mileage || l.mileage || l.vehicle?.mileage || 0;
  const yearReg  = l.tracking?.first_registration || l.firstRegistrationDate || l.firstRegistration || '';
  const year     = parseInt(yearReg?.toString().match(/\b(19|20)\d{2}\b/)?.[0]) || null;
  const make     = l.vehicle?.make || l.make || '';
  const model    = l.vehicle?.model || l.model || '';
  const version  = l.vehicle?.modelVersionInput || l.vehicle?.version || l.version || '';
  const fuel     = (l.vehicle?.fuelCategory?.formatted || l.fuelType || l.tracking?.fuel_type || '').toLowerCase();
  const country  = (l.location?.countryCode || l.country || 'DE').toUpperCase();
  const seller   = l.dealer?.companyName || l.sellerName || l.seller?.name || '—';
  const sellerType = (l.sellerType || l.seller?.type || '').toLowerCase();
  const isPro    = sellerType.includes('dealer') || sellerType.includes('pro');

  return {
    brand:           normalizeBrand(make),
    model:           cleanModel(model + (version ? ' ' + version : '')),
    year:            year,
    km:              parseInt(km) || null,
    price_eur_ttc:   parseInt(priceTTC) || null,
    fuel_type:       fuel,
    seller_type:     isPro ? 'pro' : (sellerType.includes('priv') ? 'private' : 'unknown'),
    seller_name:     seller,
    country:         country,
    first_reg_date:  yearReg || null,
  };
}

function normalizeBrand(b) {
  if (!b) return '';
  const l = b.toLowerCase();
  if (l === 'porsche') return 'Porsche';
  if (l.includes('land')) return 'Land Rover';
  return b;
}

function cleanModel(s) {
  return s.trim().replace(/\s+/g, ' ');
}
