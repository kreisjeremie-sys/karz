// KARZ v10 — calc.js
// UNE SEULE fonction computeDeal() pour tous les calculs de marge.
// Toute l'application appelle cette fonction — jamais de calcul inline.
// ═══════════════════════════════════════════════════════════════

import { LEGAL, DEPRECIATION } from './config.js';

// ── CO2 FÉDÉRAL ───────────────────────────────────────────────
// Retourne {penalty, exempt, couldBeExempt, reason, target}
// PRINCIPE : CO2 calculé par défaut.
// Exempté SEULEMENT si condition CONFIRMÉE (age ou km).
export function computeCO2(co2_wltp, kg_vide, monthsReg, kmCurrent) {
  // Électrique
  if (!co2_wltp || co2_wltp === 0)
    return { penalty:0, exempt:true, couldBeExempt:false,
             reason:'Électrique — CO2 = 0, aucune sanction (OFEN)' };

  // Exemption >12 mois confirmée
  if (monthsReg >= LEGAL.CO2_EXEMPT_MONTHS)
    return { penalty:0, exempt:true, couldBeExempt:false,
             reason:`${monthsReg} mois immatriculé → exempté (BAZG + ASTRA)` };

  // Exemption >6 mois + >5000 km confirmée
  if (monthsReg >= LEGAL.CO2_EXEMPT_MONTHS_KM && kmCurrent > LEGAL.CO2_EXEMPT_KM)
    return { penalty:0, exempt:true, couldBeExempt:false,
             reason:`${monthsReg} mois + ${kmCurrent.toLocaleString('fr-CH')} km → exempté (BAZG + ASTRA)` };

  // Cible individuelle OFEN
  const target = LEGAL.CO2_TARGET_BASE + LEGAL.CO2_COEFF * ((kg_vide || 1800) - LEGAL.CO2_MASS_REF);
  const excess  = co2_wltp - target;

  // Sous la cible → aucune pénalité
  if (excess <= 0)
    return { penalty:0, exempt:false, couldBeExempt:false,
             reason:`CO2 ${co2_wltp} g/km < cible ${target.toFixed(1)} g/km — aucune pénalité`, target };

  // Pénalité applicable
  const penalty = Math.round(excess * LEGAL.CO2_RATE);

  // km inconnu et >6 mois : pénalité en pire cas, potentiellement exemptable
  const kmUnknown     = (!kmCurrent || kmCurrent === 0);
  const couldBeExempt = kmUnknown && monthsReg >= LEGAL.CO2_EXEMPT_MONTHS_KM;

  return {
    penalty, exempt:false, couldBeExempt, target,
    reason: couldBeExempt
      ? `CO2 ${co2_wltp} g/km → CHF ${penalty.toLocaleString('fr-CH')} (pire cas — vérifier km > ${LEGAL.CO2_EXEMPT_KM.toLocaleString()})`
      : `CO2 ${co2_wltp} g/km − cible ${target.toFixed(1)} g/km = ${excess.toFixed(1)} g × CHF ${LEGAL.CO2_RATE}/g`,
  };
}

// ── TAXE CANTONALE GE (impôt plaques annuel acheteur) ─────────
// Source : ge.ch/impot-vehicules/nouvel-impot-2025
// Information pour l'acheteur final — ne rentre PAS dans le landed cost
export function computeTaxeGE(co2, kg, yearMEC, isElectric) {
  if (isElectric) {
    if (kg <= 1000) return 120;
    if (kg <= 1500) return 180;
    if (kg <= 2000) return 250;
    if (kg <= 2500) return 350;
    return 450;
  }
  const base = 120;
  let surcharge = 0;
  if (co2 <= 0)    surcharge = 0;
  else if (co2 <= 100) surcharge = co2 * 0.25;
  else if (co2 <= 120) surcharge = 25 + (co2 - 100) * 0.50;
  else if (co2 <= 140) surcharge = 35 + (co2 - 120) * 1.00;
  else if (co2 <= 160) surcharge = 55 + (co2 - 140) * 2.50;
  else if (co2 <= 200) surcharge = 105 + (co2 - 160) * 5.00;
  else                 surcharge = 305 + (co2 - 200) * 10.00;
  let total = base + surcharge;
  if ((yearMEC || 0) >= 2010 && co2 < 121) total *= 0.5;
  else if (co2 > 200) total *= 1.5;
  return Math.round(total);
}

// ── LANDED COST ───────────────────────────────────────────────
// prixBase_CHF : prix HT CHF (TVA EU déduite si vendeur pro) ou TTC CHF si privé
// tvaMode      : 'A' = sans numéro TVA | 'B' = Sàrl avec numéro TVA
// customTransport : override CHF si devis réel disponible
export function computeLanded(prixBase_CHF, spec, monthsReg, kmCurrent, tvaMode, customTransport, globalTransport) {
  const transport = (customTransport !== undefined && customTransport !== null)
    ? customTransport : globalTransport;

  // Impôt fédéral 4% — coût définitif dans les deux modes
  const autoTax = Math.round(prixBase_CHF * LEGAL.AUTO_TAX);

  // Base de calcul TVA : prix + transport + autoTax + frais fixes
  // Source : BAZG admin.ch
  const vatBase = prixBase_CHF + transport + autoTax + LEGAL.FIXED_FEES;
  const vatAmount = Math.round(vatBase * LEGAL.VAT_CH);

  // Mode A : TVA = coût définitif
  // Mode B : TVA récupérable → CHF 0 net dans le landed
  const vatInLanded = (tvaMode === 'B') ? 0 : vatAmount;

  // CO2 fédéral
  const co2 = computeCO2(spec.co2, spec.kg, monthsReg, kmCurrent);

  const total = prixBase_CHF + transport + autoTax + LEGAL.FIXED_FEES + vatInLanded + co2.penalty;

  return {
    prixBase_CHF,
    transport,
    autoTax,
    fixedFees: LEGAL.FIXED_FEES,
    vatBase,
    vatAmount,
    vatInLanded,
    vatRecovered: (tvaMode === 'B') ? vatAmount : 0,
    co2,
    total: Math.round(total),
    tvaMode,
  };
}

// ── REVENU REVENTE selon mode TVA ─────────────────────────────
// Mode A : revenu = prix TTC annoncé CH (pas redevable TVA)
// Mode B : revenu = prix TTC / 1.081 (TVA reversée AFC)
export function computeRevenue(reventeTTC, tvaMode) {
  if (tvaMode === 'B') return Math.round(reventeTTC / (1 + LEGAL.VAT_CH));
  return reventeTTC;
}

// ── PRIX DE REVENTE — 5 NIVEAUX DE TRIANGULATION ─────────────
// Niveau 1 : Comparables CH filtrés (finition+fuel+année+km) N≥3
// Niveau 2 : Comparables CH fuel+année+km N≥5
// Niveau 3 : Comparables CH élargis N≥5
// Niveau 4 : Comparables CH sans fuel N≥5
// Niveau 5 : Dépréciation depuis MSRP par finition
// Niveau 0 : Eurotax saisi manuellement (prime sur tout)

export function computeResalePrice(spec, year, km, eurotaxOverride, comparablesResult) {
  // Niveau 0 — Eurotax prime toujours
  if (eurotaxOverride && eurotaxOverride > 0) {
    return {
      level: 0,
      price: eurotaxOverride,
      p25: eurotaxOverride, p50: null, p75: null, mean: null,
      n: 1,
      label: 'Cote Eurotax (saisie manuellement)',
      isHypothesis: false,
      comparablesUrl: null,
    };
  }

  // Niveaux 1-4 — Comparables CH depuis Supabase
  if (comparablesResult && comparablesResult.rows?.length >= 1) {
    const { rows, level, label, comparablesUrl } = comparablesResult;
    const sorted = [...rows].sort((a,b)=>a-b);
    const p = (pct) => {
      const k = (pct/100)*(sorted.length-1);
      const f = Math.floor(k); const c = Math.ceil(k);
      return Math.round(f===c ? sorted[f] : sorted[f]+(k-f)*(sorted[c]-sorted[f]));
    };
    const stats = {
      n:    sorted.length,
      p25:  p(25),
      p50:  p(50),
      p75:  p(75),
      mean: Math.round(sorted.reduce((a,b)=>a+b,0)/sorted.length),
    };
    return {
      level,
      price: stats.p25,  // P25 = prix de revente retenu
      ...stats,
      label,
      isHypothesis: false,
      comparablesUrl,
    };
  }

  // Niveau 5 — dépréciation depuis MSRP
  if (!spec?.msrp || spec.msrp <= 0) {
    return { level: 99, price: null, n: 0, label: 'MSRP manquant — saisir Eurotax', isHypothesis: true };
  }

  const currentYear = new Date().getFullYear();
  const ageYears    = Math.max(0, currentYear - (year || currentYear));
  let depreciatedValue = spec.msrp;
  for (let y = 1; y <= ageYears; y++) {
    const rate = DEPRECIATION.rates[y] ?? DEPRECIATION.rateDefault;
    depreciatedValue *= (1 - rate);
  }
  const normKm     = (DEPRECIATION.kmNormPerYear * Math.max(ageYears, 1));
  const excessKm   = Math.max(0, (km || 0) - normKm);
  const kmPenalty  = (excessKm / 10000) * DEPRECIATION.kmExcessFactor;
  depreciatedValue *= (1 - kmPenalty);
  depreciatedValue  = Math.round(depreciatedValue / 500) * 500;

  return {
    level: 5,
    price: depreciatedValue,
    p25: depreciatedValue, p50: null, p75: null, mean: null,
    n: 0,
    label: `Estimation dépréciation — ${ageYears} an${ageYears>1?'s':''} · MSRP CHF ${spec.msrp.toLocaleString('fr-CH')} (${spec.msrpSrc})`,
    isHypothesis: true,
    msrp: spec.msrp,
    ageYears,
    comparablesUrl: null,
  };
}

// ── MARGE NETTE ───────────────────────────────────────────────
export function computeMarge(reventeTTC, landed_total, tvaMode) {
  const revenue = computeRevenue(reventeTTC, tvaMode);
  return Math.round(revenue - landed_total);
}

// ── FONCTION PRINCIPALE — appelée PARTOUT dans l'app ──────────
// Version synchrone (sans comparables CH) — pour la heatmap et listes rapides
export function computeDeal(deal, globalState, comparablesResult = null) {
  const { SPECS } = globalState.config;
  const { FX, TRANSPORT, TVA_MODE_B } = globalState.params;
  const tvaMode = TVA_MODE_B ? 'B' : 'A';

  const spec = SPECS[`${deal.brand} ${deal.model}`];
  if (!spec) return { error: `Modèle inconnu: ${deal.brand} ${deal.model}` };

  const priceTTC_EUR = deal.price_eur_ttc || 0;
  const vatOrigin    = LEGAL.VAT_BY_COUNTRY[deal.country] || 0.20;
  const isPro        = deal.seller_type === 'pro' || deal.seller_type === 'dealer';
  const priceHT_EUR  = isPro ? Math.round(priceTTC_EUR / (1 + vatOrigin)) : priceTTC_EUR;
  const priceHT_CHF  = Math.round(priceHT_EUR * FX);

  let monthsReg = 99;
  if (deal.first_reg_date) {
    const d = new Date(deal.first_reg_date);
    if (!isNaN(d.getTime()))
      monthsReg = Math.round((Date.now() - d.getTime()) / (30 * 24 * 3600 * 1000));
  } else if (deal.year) {
    monthsReg = Math.round((Date.now() - new Date(deal.year, 0, 1).getTime()) / (30 * 24 * 3600 * 1000));
  }

  const landed = computeLanded(priceHT_CHF, spec, monthsReg, deal.km || 0, tvaMode, deal.custom_transport, TRANSPORT);
  const resale  = computeResalePrice(spec, deal.year, deal.km, deal.eurotax_override, comparablesResult);
  const marge   = resale.price !== null ? computeMarge(resale.price, landed.total, tvaMode) : null;
  const isElectric = spec.co2 === 0;
  const taxeGE  = computeTaxeGE(spec.co2, spec.kg, deal.year, isElectric);

  return {
    priceTTC_EUR, priceHT_EUR, priceHT_CHF,
    isPro, vatOrigin, monthsReg, tvaMode,
    landed, resale, marge, taxeGE, spec,
    margeBlocked:     resale.price === null,
    margeBlockReason: resale.price === null ? 'Prix de revente inconnu — saisir Eurotax ou attendre scrape CH' : null,
  };
}

// Version async — charge les comparables CH depuis Supabase
export async function computeDealAsync(deal, globalState, dbModule) {
  const { SPECS } = globalState.config;
  const spec = SPECS[`${deal.brand} ${deal.model}`];

  let comparablesResult = null;
  if (spec && deal.year && deal.km) {
    // Trouver le model_slug depuis le modèle
    const modelSlug = findModelSlug(deal.brand, deal.model);
    if (modelSlug) {
      const { rows, level, label } = await dbModule.getComparablesCH({
        model_slug: modelSlug,
        fuel_type:  deal.fuel_type,
        version:    deal.version,
        year:       deal.year,
        km:         deal.km,
      });
      // Construire l'URL AS24.ch pour les comparables
      const { buildAS24chUrl } = dbModule;
      const urlParams = _levelToUrlParams(level, deal.year, deal.km);
      const comparablesUrl = buildAS24chUrl ? buildAS24chUrl(modelSlug, urlParams) : null;
      comparablesResult = { rows, level, label, comparablesUrl };
    }
  }

  return computeDeal(deal, globalState, comparablesResult);
}

function _levelToUrlParams(level, year, km) {
  const ranges = {
    1: { yearDelta: 1, kmFactor: 0.3 },
    2: { yearDelta: 1, kmFactor: 0.3 },
    3: { yearDelta: 2, kmFactor: 0.5 },
    4: { yearDelta: 2, kmFactor: 0.5 },
  };
  const r = ranges[level] || ranges[4];
  return {
    yearMin: year - r.yearDelta, yearMax: year + r.yearDelta,
    kmMin: Math.round(km * (1 - r.kmFactor)), kmMax: Math.round(km * (1 + r.kmFactor)),
  };
}

// Mapping marque+modèle → slug AS24
function findModelSlug(brand, model) {
  const m = model?.toLowerCase() || '';
  if (m.includes('macan'))   return 'macan';
  if (m.includes('cayenne')) return 'cayenne';
  if (m.includes('defender 90') || m.includes('defender-90')) return 'defender-90';
  if (m.includes('defender 130') || m.includes('defender-130')) return 'defender-130';
  if (m.includes('defender')) return 'defender';
  if (m.includes('evoque'))  return 'range-rover-evoque';
  if (m.includes('sport'))   return 'range-rover-sport';
  if (m.includes('range rover') || m.includes('range-rover')) return 'range-rover';
  return null;
}

// ── NÉGOCIATEUR INVERSÉ ───────────────────────────────────────
// Calcule le prix max HT acceptable pour obtenir une marge cible
export function computeNego(margeCible, reventeTTC, negoPct, tvaMode, globalTransport, spec) {
  const T   = globalTransport;
  const F   = LEGAL.FIXED_FEES;
  const at  = LEGAL.AUTO_TAX;
  const vat = LEGAL.VAT_CH;

  // Mode A : marge = reventeTTC - landed, landed inclut TVA
  // Mode B : marge = reventeTTC/1.081 - landed, landed excl. TVA
  let maxPrixHT_CHF;
  if (tvaMode === 'B') {
    const revHT = reventeTTC / (1 + vat);
    maxPrixHT_CHF = (revHT - margeCible - T - F) / (1 + at);
  } else {
    const constante = (T + F) * (1 + vat);
    maxPrixHT_CHF   = (reventeTTC - margeCible - constante) / ((1 + at) * (1 + vat));
  }

  const revRef       = tvaMode === 'B' ? Math.round(reventeTTC / (1 + vat)) : reventeTTC;
  const landedTarget = revRef - margeCible;

  return {
    maxPrixHT_CHF:   Math.round(maxPrixHT_CHF),
    ouvertureHT_CHF: Math.round(maxPrixHT_CHF * (1 - negoPct)),
    revRef,
    landedTarget:    Math.round(landedTarget),
  };
}
