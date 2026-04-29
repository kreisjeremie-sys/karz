// api/fetch-listing.js — Parse une URL d'annonce (AS24, AS24.ch, Mobile.de, etc.)
// Le parsing CÔTÉ SERVEUR ne marche que pour AS24 (autres sites bloquent les IPs Vercel)
// Mobile.de et AS24.ch nécessitent le bookmarklet côté navigateur

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url requise' });

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-CH,de;q=0.9,fr;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    if (!r.ok) {
      // Mobile.de et AS24.ch retournent 403 → demander à utiliser le bookmarklet
      const isProtected = url.includes('mobile.de') || url.includes('autoscout24.ch');
      return res.status(200).json({ 
        success: false, 
        error: isProtected
          ? `Site protégé (HTTP ${r.status}) — utilisez le bookmarklet "+ KARZ" depuis votre navigateur`
          : `HTTP ${r.status} — Page bloquée. Remplissez manuellement.`
      });
    }
    const html = await r.text();

    // Essai 1 : __NEXT_DATA__ (AS24.com et autres sites Next.js)
    let data = null;
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (nextMatch) {
      try { data = JSON.parse(nextMatch[1]); } catch(e) {}
    }

    if (data) {
      const listing = extractFromNextData(data, url);
      if (listing.price_eur_ttc || listing.price_chf_ttc) {
        return res.status(200).json({ success: true, listing });
      }
    }

    // Essai 2 : JSON-LD (souvent présent dans les annonces auto)
    const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)];
    for (const m of jsonLdMatches) {
      try {
        const ld = JSON.parse(m[1]);
        const listing = extractFromJsonLd(ld, url);
        if (listing && (listing.price_eur_ttc || listing.price_chf_ttc)) {
          return res.status(200).json({ success: true, listing });
        }
      } catch(e) {}
    }

    return res.status(200).json({ 
      success: false, 
      error: 'Page non reconnue. Utilisez le bookmarklet ou remplissez manuellement.' 
    });
  } catch(e) {
    return res.status(200).json({ success: false, error: 'Erreur : ' + e.message });
  }
}

function extractFromNextData(data, url) {
  const pp = data?.props?.pageProps || {};
  const detail = pp.listingDetails || pp.detail || pp.listing || pp.detailItem || pp.vehicleDetails || {};
  
  const v = detail.vehicle || {};
  const t = detail.tracking || {};
  const price = detail.prices?.public || detail.price || {};
  const seller = detail.seller || detail.dealer || {};
  const location = detail.location || {};

  const priceRaw = price.priceRaw || price.amount || price.priceFormatted || detail.publicPrice;
  const priceNum = typeof priceRaw === 'string'
    ? parseInt(priceRaw.replace(/[^0-9]/g, '')) || 0
    : parseInt(priceRaw) || 0;

  const priceFormatted = price.priceFormatted || '';
  const isCHF = priceFormatted.includes('CHF') || priceFormatted.includes('Fr.') || url.includes('.ch');

  const km = parseInt(
    t.mileage || 
    v.mileageInKm?.toString().replace(/[^0-9]/g, '') || 
    v.mileage?.value || 
    detail.mileage || 0
  ) || null;

  const firstReg = t.firstRegistration || v.firstRegistration || detail.firstRegistration || '';
  const yearMatch = firstReg.toString().match(/\b(20(?:1[0-9]|2[0-6]))\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;

  const FUEL_MAP = { b:'essence', d:'diesel', e:'electrique', m:'hybride', p:'hybride' };
  let fuel = FUEL_MAP[t.fuelType];
  if (!fuel) {
    const fuelLabel = (v.fuel || v.fuelCategory?.label || detail.fuelType || '').toLowerCase();
    if (fuelLabel.includes('diesel')) fuel = 'diesel';
    else if (fuelLabel.includes('electric') || fuelLabel.includes('elektr')) fuel = 'electrique';
    else if (fuelLabel.includes('hybrid')) fuel = 'hybride';
    else if (fuelLabel.includes('gas') || fuelLabel.includes('petrol') || fuelLabel.includes('benzin')) fuel = 'essence';
  }

  const make = (v.make || detail.make || '').trim();
  const model = (v.model || detail.model || '').trim();
  const variant = (v.variant || v.modelVersionInput || detail.version || '').trim();

  const sellerType = (seller.type || detail.sellerType || '').toLowerCase();
  const isPro = sellerType === 'd' || sellerType.includes('dealer') || sellerType.includes('pro');
  const sellerName = seller.companyName || seller.name || detail.sellerName || '—';
  
  const country = (location.countryCode || detail.country || (url.includes('.ch') ? 'CH' : 'DE')).toUpperCase();

  return {
    brand:           normalizeBrand(make),
    model_full:      `${make} ${model} ${variant}`.trim().replace(/\s+/g, ' '),
    model_slug:      modelToSlug(model),
    version:         variant || null,
    year,
    km,
    price_eur_ttc:   isCHF ? null : priceNum,
    price_chf_ttc:   isCHF ? priceNum : null,
    price_chf:       isCHF ? priceNum : null,
    fuel_type:       fuel || null,
    seller_type:     isPro ? 'pro' : 'private',
    seller_name:     sellerName,
    country:         country,
    first_reg_date:  firstReg || null,
    listing_url:     url,
    city:            location.city || null,
  };
}

function extractFromJsonLd(ld, url) {
  // JSON-LD peut être un array ou objet
  const items = Array.isArray(ld) ? ld : [ld];
  for (const item of items) {
    if (item['@type'] === 'Vehicle' || item['@type'] === 'Car' || item['@type'] === 'Product') {
      const isCHF = (item.priceCurrency || '').toUpperCase() === 'CHF' || url.includes('.ch');
      const price = parseInt(item.offers?.price || item.price || 0);
      if (!price) continue;
      
      return {
        brand:          normalizeBrand(item.brand?.name || item.brand || item.manufacturer || ''),
        model_full:     item.name || `${item.brand} ${item.model}`,
        model_slug:     modelToSlug(item.model || ''),
        version:        item.vehicleConfiguration || null,
        year:           parseInt(item.modelDate || item.productionDate?.slice(0,4)) || null,
        km:             parseInt(item.mileageFromOdometer?.value || 0) || null,
        price_eur_ttc:  isCHF ? null : price,
        price_chf_ttc:  isCHF ? price : null,
        price_chf:      isCHF ? price : null,
        fuel_type:      item.fuelType?.toLowerCase() || null,
        country:        url.includes('.ch') ? 'CH' : 'DE',
        listing_url:    url,
      };
    }
  }
  return null;
}

function normalizeBrand(b) {
  if (!b) return '';
  const l = b.toLowerCase();
  if (l === 'porsche') return 'Porsche';
  if (l.includes('land')) return 'Land Rover';
  return b;
}

function modelToSlug(model) {
  if (!model) return '';
  return model.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-');
}
