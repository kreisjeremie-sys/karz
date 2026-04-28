// api/fetch-listing.js — Fetch et parse une URL d'annonce AS24
// Structure AS24 confirmée : 
// - tracking.firstRegistration = "MM-YYYY"
// - tracking.fuelType = "b"/"d"/"e"/"m"
// - vehicle.variant = "Cayenne Turbo"
// - location.countryCode = "DE"

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
        'Accept-Language': 'de-DE,de;q=0.9,fr;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    if (!r.ok) {
      return res.status(200).json({ 
        success: false, 
        error: `HTTP ${r.status} — Page bloquée. Remplissez manuellement.` 
      });
    }
    const html = await r.text();

    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) {
      return res.status(200).json({ 
        success: false, 
        error: 'Page non reconnue. Remplissez manuellement.' 
      });
    }

    let data;
    try { data = JSON.parse(m[1]); }
    catch(e) { return res.status(200).json({ success: false, error: 'JSON invalide' }); }

    // Nouvelle structure AS24 : pageProps.listingDetails OU pageProps.detail
    const listing = extractFromAS24(data, url);

    if (!listing.price_eur_ttc && !listing.price_chf_ttc) {
      return res.status(200).json({ 
        success: false, 
        error: 'Prix non trouvé sur la page. Remplissez manuellement.' 
      });
    }

    return res.status(200).json({ success: true, listing });
  } catch(e) {
    return res.status(200).json({ 
      success: false, 
      error: 'Erreur : ' + e.message 
    });
  }
}

function extractFromAS24(data, url) {
  const pp = data?.props?.pageProps || {};
  
  // Différents chemins possibles selon le type de page (détail ou liste)
  const detail = pp.listingDetails || pp.detail || pp.listing || pp.detailItem || {};
  
  const v = detail.vehicle || {};
  const t = detail.tracking || {};
  const price = detail.prices?.public || detail.price || {};
  const seller = detail.seller || detail.dealer || {};
  const location = detail.location || {};

  // Prix
  const priceRaw = price.priceRaw || price.amount || price.priceFormatted || detail.publicPrice;
  const priceNum = typeof priceRaw === 'string'
    ? parseInt(priceRaw.replace(/[^0-9]/g, '')) || 0
    : parseInt(priceRaw) || 0;

  // Détecter devise
  const priceFormatted = price.priceFormatted || '';
  const isCHF = priceFormatted.includes('CHF') || priceFormatted.includes('Fr.');

  // Km
  const km = parseInt(
    t.mileage || 
    v.mileageInKm?.toString().replace(/[^0-9]/g, '') || 
    v.mileage?.value || 
    detail.mileage || 0
  ) || null;

  // Année
  const firstReg = t.firstRegistration || v.firstRegistration || detail.firstRegistration || '';
  const yearMatch = firstReg.toString().match(/\b(20(?:1[0-9]|2[0-6]))\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;

  // Carburant
  const FUEL_MAP = { b:'essence', d:'diesel', e:'electrique', m:'hybride', p:'hybride' };
  let fuel = FUEL_MAP[t.fuelType];
  if (!fuel) {
    const fuelLabel = (v.fuel || v.fuelCategory?.label || detail.fuelType || '').toLowerCase();
    if (fuelLabel.includes('diesel')) fuel = 'diesel';
    else if (fuelLabel.includes('electric') || fuelLabel.includes('elektr')) fuel = 'electrique';
    else if (fuelLabel.includes('hybrid')) fuel = 'hybride';
    else if (fuelLabel.includes('gas') || fuelLabel.includes('petrol') || fuelLabel.includes('benzin')) fuel = 'essence';
    else fuel = null;
  }

  // Marque / modèle
  const make = (v.make || detail.make || '').trim();
  const model = (v.model || detail.model || '').trim();
  const variant = (v.variant || v.modelVersionInput || detail.version || '').trim();

  // Vendeur
  const sellerType = (seller.type || detail.sellerType || '').toLowerCase();
  const isPro = sellerType === 'd' || sellerType.includes('dealer') || sellerType.includes('pro');
  const sellerName = seller.companyName || seller.name || detail.sellerName || '—';
  
  // Pays
  const country = (location.countryCode || detail.country || 'DE').toUpperCase();

  return {
    brand:           normalizeBrand(make),
    model_full:      `${make} ${model} ${variant}`.trim().replace(/\s+/g, ' '),
    model_slug:      modelToSlug(model),
    version:         variant || null,
    year:            year,
    km:              km,
    price_eur_ttc:   isCHF ? null : priceNum,
    price_chf_ttc:   isCHF ? priceNum : null,
    fuel_type:       fuel,
    seller_type:     isPro ? 'pro' : 'private',
    seller_name:     sellerName,
    country:         country,
    first_reg_date:  firstReg || null,
    listing_url:     url,
  };
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
