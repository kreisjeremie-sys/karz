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

// ── PRIX DE REVENTE — TRIANGULATION 3 NIVEAUX ─────────────────
// Niveau 1 : P25 scrape AS24.ch (N≥5) — données réelles
// Niveau 2 : Dépréciation depuis MSRP (si N<5)
// Niveau 3 : Cote Eurotax saisie manuellement (prime sur tout)
export function computeResalePrice(spec, year, km, eurotaxOverride) {
  // Niveau 3 — Eurotax prime toujours
  if (eurotaxOverride && eurotaxOverride > 0) {
    return {
      level: 3,
      price: eurotaxOverride,
      label: 'Eurotax (saisi manuellement)',
      isHypothesis: false,
      details: null,
    };
  }

  // Niveau 1 — benchmark AS24.ch
  if (spec.resale_p25 && spec.resale_p25 > 0) {
    return {
      level: 1,
      price: spec.resale_p25,
      label: `P25 AS24.ch — ${spec.resale_src || 'scrape CH'}`,
      isHypothesis: false,
      details: null,
    };
  }

  // Niveau 2 — dépréciation depuis MSRP
  if (!spec.msrp || spec.msrp <= 0) {
    return {
      level: 0,
      price: null,
      label: 'Prix de revente inconnu — MSRP manquant',
      isHypothesis: true,
      details: null,
    };
  }

  const currentYear = new Date().getFullYear();
  const ageYears    = Math.max(0, currentYear - (year || currentYear));

  // Dépréciation cumulée
  let depreciatedValue = spec.msrp;
  for (let y = 1; y <= ageYears; y++) {
    const rate = DEPRECIATION.rates[y] ?? DEPRECIATION.rateDefault;
    depreciatedValue *= (1 - rate);
  }

  // Facteur km
  const normKm      = (DEPRECIATION.kmNormPerYear * ageYears) || 1;
  const excessKm    = Math.max(0, (km || 0) - normKm);
  const kmPenalty   = (excessKm / 10000) * DEPRECIATION.kmExcessFactor;
  depreciatedValue *= (1 - kmPenalty);
  depreciatedValue  = Math.round(depreciatedValue / 500) * 500; // arrondi au 500 CHF

  return {
    level: 2,
    price: depreciatedValue,
    label: `Estimation dépréciation (${ageYears} ans, MSRP CHF ${spec.msrp.toLocaleString('fr-CH')})`,
    isHypothesis: true,
    msrp: spec.msrp,
    msrpSrc: spec.msrpSrc,
    ageYears,
    excessKm: Math.round(excessKm),
    details: { msrp:spec.msrp, ageYears, excessKm:Math.round(excessKm), depreciatedValue },
  };
}

// ── MARGE NETTE ───────────────────────────────────────────────
export function computeMarge(reventeTTC, landed_total, tvaMode) {
  const revenue = computeRevenue(reventeTTC, tvaMode);
  return Math.round(revenue - landed_total);
}

// ── FONCTION PRINCIPALE — appelée PARTOUT dans l'app ──────────
// Input : deal object (voir db.js pour le schéma)
// Output : objet complet avec tous les calculs
export function computeDeal(deal, globalState) {
  const { SPECS } = globalState.config;
  const { FX, TRANSPORT, TVA_MODE_B } = globalState.params;
  const tvaMode = TVA_MODE_B ? 'B' : 'A';

  const spec = SPECS[`${deal.brand} ${deal.model}`];
  if (!spec) return { error: `Modèle inconnu: ${deal.brand} ${deal.model}` };

  // Prix base CHF selon type vendeur et mode TVA
  const priceTTC_EUR = deal.price_eur_ttc || 0;
  const vatOrigin    = LEGAL.VAT_BY_COUNTRY[deal.country] || 0.20;
  const isPro        = deal.seller_type === 'pro' || deal.seller_type === 'dealer';

  // Si vendeur pro → déduction TVA pays d'origine (export B2B UE→CH)
  const priceHT_EUR  = isPro ? Math.round(priceTTC_EUR / (1 + vatOrigin)) : priceTTC_EUR;
  const priceHT_CHF  = Math.round(priceHT_EUR * FX);

  // Mois d'immatriculation (pour exemption CO2)
  let monthsReg = 99; // défaut = vieux = exempté
  if (deal.first_reg_date) {
    const d = new Date(deal.first_reg_date);
    if (!isNaN(d.getTime()))
      monthsReg = Math.round((Date.now() - d.getTime()) / (30 * 24 * 3600 * 1000));
  } else if (deal.year) {
    monthsReg = Math.round((Date.now() - new Date(deal.year, 0, 1).getTime()) / (30 * 24 * 3600 * 1000));
  }

  // Landed cost
  const landed = computeLanded(
    priceHT_CHF, spec,
    monthsReg, deal.km || 0,
    tvaMode, deal.custom_transport, TRANSPORT
  );

  // Prix de revente (triangulation 3 niveaux)
  const resale = computeResalePrice(spec, deal.year, deal.km, deal.eurotax_override);

  // Marge
  const marge = resale.price !== null
    ? computeMarge(resale.price, landed.total, tvaMode)
    : null;

  // Taxe GE (info acheteur)
  const isElectric = spec.co2 === 0;
  const taxeGE     = computeTaxeGE(spec.co2, spec.kg, deal.year, isElectric);

  return {
    // Inputs résumés
    priceTTC_EUR, priceHT_EUR, priceHT_CHF,
    isPro, vatOrigin, monthsReg,
    tvaMode,
    // Calculs
    landed,
    resale,
    marge,
    taxeGE,
    spec,
    // Flags
    margeBlocked: resale.price === null,
    margeBlockReason: resale.price === null ? 'Prix de revente inconnu — lancer benchmark CH ou saisir Eurotax' : null,
  };
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
