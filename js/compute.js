// js/compute.js — Logique centralisée de calcul + rendu
// Utilisé par search.js (recherche), new-opportunity.js (saisie manuelle), pipeline.js
// AUCUNE duplication — un seul endroit pour fixer les bugs

import { getState } from './state.js';
import { computeLanded, computeResalePrice } from './calc.js';
import { getComparablesCH, buildAS24chUrl, buildAS24chSearchUrl } from './db.js';
import { LEGAL, SPECS, MODELS, DEFAULTS } from './config.js';

// ══════════════════════════════════════════════════════════════
// MATCHING SPEC — un seul endroit
// Stratégie:
// 1. brand + variant exact (ex: "Cayenne Turbo" → "Porsche Cayenne Turbo")
// 2. brand + variant prefix (ex: "Cayenne Turbo S E-Hybrid" → "Porsche Cayenne Turbo")
// 3. model_full contient sous-modèle (Velar, Evoque, Sport, etc.)
// 4. model_slug → label MODELS → SPECS
// 5. Fallback: clé SPECS la plus courte contenant le slug
// + sanity check: prix annonce >= 15% du MSRP (sinon match incorrect)
// ══════════════════════════════════════════════════════════════
export function findSpec(listing) {
  const brand = listing.brand || '';
  if (!brand) return null;
  const specKeys = Object.keys(SPECS).filter(k => k.startsWith(brand + ' '));
  if (!specKeys.length) return null;

  // Sanity check
  function isPlausible(spec) {
    if (!spec || !spec.msrp) return true;
    const priceEur = listing.price_eur_ttc || 0;
    if (!priceEur) return true;
    const msrpEur = spec.msrp * 1.06; // CHF→EUR approx
    return priceEur >= msrpEur * 0.15 && priceEur <= msrpEur * 1.30;
  }

  // 1+2. Match par variant
  if (listing.version) {
    const variant = listing.version.replace(/\*.*$/, '').replace(/\s+/g, ' ').trim();
    const keyExact = `${brand} ${variant}`;
    if (SPECS[keyExact] && isPlausible(SPECS[keyExact])) return SPECS[keyExact];
    
    const sortedKeys = [...specKeys].sort((a, b) => b.length - a.length);
    for (const specKey of sortedKeys) {
      const specSuffix = specKey.slice(brand.length + 1);
      if (variant.toLowerCase().startsWith(specSuffix.toLowerCase()) && isPlausible(SPECS[specKey])) {
        return SPECS[specKey];
      }
    }
  }

  // 3. model_full contient sous-modèle
  const modelFull = (listing.model_full || '').toLowerCase();
  const subModels = ['Velar', 'Evoque', 'Sport', 'Autobiography', 'SV'];
  for (const sub of subModels) {
    if (modelFull.includes(sub.toLowerCase())) {
      const subKey = specKeys.filter(k => k.includes(sub)).sort((a, b) => a.length - b.length)[0];
      if (subKey && isPlausible(SPECS[subKey])) return SPECS[subKey];
    }
  }

  // 4. slug → label MODELS
  if (listing.model_slug) {
    const allModels = [...MODELS.porsche, ...MODELS.landrover];
    const m = allModels.find(m => m.slug === listing.model_slug);
    if (m) {
      const key = `${brand} ${m.label}`;
      if (SPECS[key] && isPlausible(SPECS[key])) return SPECS[key];
    }
    // 5. Fallback: clé la plus courte
    const slug = listing.model_slug.toLowerCase().replace(/-/g, ' ');
    const candidates = specKeys
      .filter(k => k.toLowerCase().includes(slug))
      .sort((a, b) => a.length - b.length);
    for (const cand of candidates) {
      if (isPlausible(SPECS[cand])) return SPECS[cand];
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// CALCUL COMPLET D'UNE ANNONCE
// Retourne tout ce qu'il faut pour afficher : landed, resale, marge, params
// ══════════════════════════════════════════════════════════════
export async function computeListing(listing, benchmarkSelection = null) {
  const state = getState();
  const FX_RAW = state.params?.FX || DEFAULTS.FX;
  const fxSafe = (FX_RAW > 0.80 && FX_RAW < 1.20) ? FX_RAW : DEFAULTS.FX;
  const TVA_MODE_B = state.params?.TVA_MODE_B || DEFAULTS.TVA_MODE_B;
  const TRANSPORT  = state.params?.TRANSPORT  || DEFAULTS.TRANSPORT;
  const tvaMode = TVA_MODE_B ? 'B' : 'A';

  const spec = findSpec(listing);

  const vatOrigin   = LEGAL.VAT_BY_COUNTRY[listing.country] || 0.20;
  const isPro       = listing.seller_type === 'pro';
  const priceTTC    = listing.price_eur_ttc || 0;
  const priceHT_EUR = isPro ? Math.round(priceTTC / (1 + vatOrigin)) : priceTTC;
  const priceHT_CHF = Math.round(priceHT_EUR * fxSafe);

  // Mois depuis immatriculation (pour exemption CO2)
  let monthsReg = 99;
  if (listing.first_reg_date) {
    const d = new Date(listing.first_reg_date);
    if (!isNaN(d.getTime()))
      monthsReg = Math.round((Date.now() - d.getTime()) / (30 * 24 * 3600 * 1000));
  } else if (listing.year) {
    monthsReg = Math.round((Date.now() - new Date(listing.year, 6, 1).getTime()) / (30 * 24 * 3600 * 1000));
  }

  const landed = spec
    ? computeLanded(priceHT_CHF, spec, monthsReg, listing.km || 0, tvaMode, null, TRANSPORT)
    : null;

  // Comparables CH — priorité 1 : sélection manuelle de benchmarks
  let comparablesResult = null;
  if (benchmarkSelection && benchmarkSelection.length > 0) {
    const rows = benchmarkSelection.map(b => b.price_chf).filter(p => p > 0);
    comparablesResult = {
      rows,
      level: 1,
      label: `${rows.length} comparables CH sélectionnés manuellement`,
      comparablesUrl: buildAS24chSearchUrl(listing),
    };
  } else if (listing.model_slug && listing.year && listing.km) {
    // Priorité 2 : comparables auto depuis listings_eu/ch
    try {
      const { rows, level, label } = await getComparablesCH({
        model_slug: listing.model_slug,
        fuel_type:  listing.fuel_type,
        version:    listing.version,
        year:       listing.year,
        km:         listing.km,
      });
      const urlParams = _levelToUrlParams(level, listing.year, listing.km);
      const comparablesUrl = buildAS24chUrl(listing.model_slug, {
        ...urlParams,
        fuel: _normFuel(listing.fuel_type)
      });
      comparablesResult = { rows, level, label, comparablesUrl };
    } catch(e) {}
  }

  const resale = spec
    ? computeResalePrice(spec, listing.year, listing.km, null, comparablesResult)
    : null;

  // Marge
  let marge = null;
  if (landed && resale && resale.price !== null) {
    const revenu = tvaMode === 'B'
      ? Math.round(resale.price / (1 + LEGAL.VAT_CH))
      : resale.price;
    marge = Math.round(revenu - landed.total);
  }

  return {
    listing, tvaMode, isPro, vatOrigin,
    priceTTC, priceHT_EUR, priceHT_CHF,
    monthsReg, landed, resale, marge, spec, fxSafe,
    margeBlocked: !resale || resale.price === null,
    as24chUrl: buildAS24chSearchUrl(listing),
  };
}

function _levelToUrlParams(level, year, km) {
  const cfg = { 1:{y:1,k:0.3}, 2:{y:1,k:0.3}, 3:{y:2,k:0.5}, 4:{y:2,k:0.5} };
  const c = cfg[level] || cfg[4];
  return {
    yearMin: year - c.y, yearMax: year + c.y,
    kmMin: Math.round(km * (1 - c.k)), kmMax: Math.round(km * (1 + c.k))
  };
}

export function normFuel(fuel) {
  if (!fuel) return '';
  const f = fuel.toLowerCase();
  if (f.includes('diesel') || f === 'd') return 'diesel';
  if (f.includes('electric') || f.includes('elektr') || f.includes('électr') || f === 'e') return 'electrique';
  if (f.includes('hybrid') || f.includes('hybride') || f.includes('plug') || f === 'm') return 'hybride';
  if (f.includes('essence') || f.includes('petrol') || f.includes('gasolin') || f.includes('benzin') || f === 'b') return 'essence';
  return f;
}
const _normFuel = normFuel;

export function normFuelLabel(fuel) {
  const f = normFuel(fuel);
  return { diesel:'Diesel', essence:'Essence', hybride:'Hybride', electrique:'Électrique' }[f] || fuel || '—';
}

export function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('fr-CH');
}

// ══════════════════════════════════════════════════════════════
// HTML RENDERS — réutilisables partout
// ══════════════════════════════════════════════════════════════
export function renderLandedHTML(result) {
  const { listing, isPro, priceTTC, priceHT_EUR, priceHT_CHF, vatOrigin, fxSafe, landed, tvaMode } = result;
  if (!landed) {
    return `<div class="detail-section">
      <div class="ds-note warn">⚠ Modèle non identifié dans la base KARZ — landed cost non calculable.<br>Modèle reçu : ${listing.model_full || listing.model_slug || '—'}</div>
    </div>`;
  }
  const vatPct = Math.round(vatOrigin * 100);
  const vatDeduct = isPro ? Math.round(priceTTC - priceHT_EUR) : 0;
  const co2 = landed.co2;
  
  return `<div class="detail-section">
    <div class="ds-title">LANDED COST</div>
    <div class="ds-row"><span>Prix annonce</span><span>€${fmt(priceTTC)} TTC</span></div>
    ${isPro ? `
    <div class="ds-row deduct"><span>− TVA ${listing.country} ${vatPct}%</span><span>− €${fmt(vatDeduct)}</span></div>
    <div class="ds-row bold"><span>= Prix HT export</span><span>€${fmt(priceHT_EUR)} HT</span></div>` : `
    <div class="ds-row note"><span>Vendeur particulier — TVA non déductible</span><span></span></div>`}
    <div class="ds-row"><span>× FX EUR/CHF ${fxSafe.toFixed(4)}</span><span>= CHF ${fmt(priceHT_CHF)}</span></div>
    <div class="ds-sep"></div>
    <div class="ds-row cost"><span>+ Transport <span class="ds-src">estimation prudente haute</span></span><span>+ CHF ${fmt(landed.transport)}</span></div>
    <div class="ds-row cost"><span>+ Impôt fédéral 4% <span class="ds-src">LJAUTO / OFDF</span></span><span>+ CHF ${fmt(landed.autoTax)}</span></div>
    <div class="ds-row cost"><span>+ Frais fixes <span class="ds-src">CHF 20 douane + CHF 60 expertise + CHF 100 test</span></span><span>+ CHF ${fmt(landed.fixedFees)}</span></div>
    <div class="ds-row ${tvaMode === 'B' ? 'zero' : 'cost'}">
      <span>+ TVA CH 8.1% <span class="ds-src">${tvaMode === 'B' ? 'Mode B — récupérable' : 'Mode A — coût définitif'}</span></span>
      <span>${tvaMode === 'B' ? 'CHF 0 net' : '+ CHF ' + fmt(landed.vatInLanded)}</span>
    </div>
    <div class="ds-row ${co2 && co2.penalty > 0 ? 'cost' : 'zero'}">
      <span>+ CO2 fédéral OFEN 2025
        ${co2 && co2.exempt ? `<span class="ds-src ok">✓ Exempté — ${co2.reason}</span>` : ''}
        ${co2 && co2.couldBeExempt ? `<span class="ds-src warn">⚠ Pire cas — vérifier km > 5 000</span>` : ''}
      </span>
      <span>${co2 && co2.penalty > 0 ? '+ CHF ' + fmt(co2.penalty) : 'CHF 0 — Exempté'}</span>
    </div>
    <div class="ds-sep"></div>
    <div class="ds-row total"><span>= LANDED NET</span><span>CHF ${fmt(landed.total)}</span></div>
  </div>`;
}

export function renderResaleHTML(result) {
  const { resale } = result;
  if (!resale || !resale.price) {
    return `<div class="detail-section">
      <div class="ds-title">REVENTE CH</div>
      <div class="ds-note warn">⚠ Benchmark CH indisponible pour ce profil — saisir la cote Eurotax après ajout au pipeline</div>
    </div>`;
  }
  const levelColor = {0:'#185FA5',1:'#0F6E56',2:'#0F6E56',3:'#854F0B',4:'#854F0B',5:'#888'}[resale.level] || '#888';
  const levelLabel = {0:'Eurotax',1:'Comparables filtrés',2:'Comparables',3:'Comparables élargis',4:'Comparables élargis',5:'Estimation dépréciation'}[resale.level] || '—';
  
  return `<div class="detail-section">
    <div class="ds-title">REVENTE CH
      <span class="ds-level" style="color:${levelColor}">
        ${levelLabel}${resale.n > 0 ? ' · ' + resale.n + ' annonces' : ' · estimation'}
      </span>
    </div>
    <div class="ds-note">${resale.label || ''}</div>
    <div class="rs-stats-grid">
      <div class="rs-stat-item primary">
        <div class="rs-stat-l">P25 <span class="rs-cible">cible revente</span></div>
        <div class="rs-stat-v">CHF ${fmt(resale.p25)}</div>
      </div>
      ${resale.p50 ? `<div class="rs-stat-item"><div class="rs-stat-l">Médiane</div><div class="rs-stat-v">CHF ${fmt(resale.p50)}</div></div>` : ''}
      ${resale.mean ? `<div class="rs-stat-item"><div class="rs-stat-l">Moyenne</div><div class="rs-stat-v">CHF ${fmt(resale.mean)}</div></div>` : ''}
      ${resale.p75 ? `<div class="rs-stat-item"><div class="rs-stat-l">P75</div><div class="rs-stat-v">CHF ${fmt(resale.p75)}</div></div>` : ''}
    </div>
    ${resale.isHypothesis ? `<div class="ds-note warn">⚠ Estimation — données CH insuffisantes pour ce profil exact</div>` : ''}
    ${resale.comparablesUrl ? `<a class="rc-comparables-link" href="${resale.comparablesUrl}" target="_blank">↗ Voir les ${resale.n} annonces comparables sur AutoScout24.ch</a>` : ''}
  </div>`;
}

export function renderMargeHTML(result) {
  const { marge, margeBlocked, tvaMode } = result;
  const margeNum = (marge !== null && marge !== undefined && !isNaN(marge)) ? marge : null;
  const margeCls = margeNum === null ? '' : margeNum >= 0 ? 'profit' : 'loss';
  return `<div class="detail-marge ${margeCls}">
    <span>MARGE ${tvaMode === 'B' ? 'NETTE HT (Mode B)' : 'NETTE TTC (Mode A)'}</span>
    <span class="marge-val">${
      margeBlocked ? '⚠ Benchmark CH indisponible'
      : margeNum !== null ? 'CHF ' + (margeNum >= 0 ? '+' : '') + fmt(margeNum)
      : '—'
    }</span>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// PEAK EQUITY — Capital max immobilisé pendant le cycle deal
// Détaille TVA EU avancée puis remboursée + TVA CH avancée puis remboursée
// ══════════════════════════════════════════════════════════════
export function computePeakEquity(result) {
  const { listing, isPro, vatOrigin, priceTTC, priceHT_EUR, priceHT_CHF, landed, fxSafe, tvaMode } = result;
  if (!landed) return null;
  
  // TVA EU avancée si vendeur PRO (récupérable via export EX-W)
  const vatEUAdvanced_EUR = isPro ? Math.round(priceTTC - priceHT_EUR) : 0;
  const vatEUAdvanced_CHF = Math.round(vatEUAdvanced_EUR * fxSafe);
  
  // Capital initial = prix TTC EUR converti CHF (vous payez le TTC d'abord)
  const initialPayment_CHF = isPro
    ? Math.round(priceTTC * fxSafe)  // payé TTC, puis remboursé TVA EU
    : Math.round(priceTTC * fxSafe); // particulier: pas de TVA déductible
  
  // Au moment de l'import en CH (avant remboursement TVA CH Mode B):
  // Capital = initialPayment - vatEU_recovered + landed_extras
  const landedExtras_CHF = landed.transport + landed.autoTax + landed.fixedFees + landed.vatAmount + (landed.co2?.penalty || 0);
  
  // PEAK EQUITY = max capital immobilisé à un moment du cycle
  // Scénario 1: vendeur pro, TVA EU pas encore remboursée
  //   = priceTTC en CHF + landed_extras = priceHT_CHF + vatEU_CHF + landed_extras
  // Scénario 2: TVA EU remboursée, TVA CH pas encore (Mode B)
  //   = priceHT_CHF + landed_extras (incl. TVA CH)
  // Scénario 3: TVA CH remboursée (Mode B steady state)
  //   = priceHT_CHF + transport + autoTax + frais + co2 = landed.total - landed.vatAmount
  
  const peakBeforeAnyRefund = isPro
    ? initialPayment_CHF + landedExtras_CHF
    : initialPayment_CHF + landedExtras_CHF;
  
  const peakAfterEURefund = priceHT_CHF + landedExtras_CHF;
  
  const finalCapitalModeB = priceHT_CHF + landed.transport + landed.autoTax + landed.fixedFees + (landed.co2?.penalty || 0);
  const finalCapitalModeA = landed.total; // TVA non récupérable
  
  // Le PEAK = max des étapes
  const peak = Math.max(peakBeforeAnyRefund, peakAfterEURefund);
  const finalCapital = tvaMode === 'B' ? finalCapitalModeB : finalCapitalModeA;
  
  return {
    initialPayment_CHF,    // Décaissement initial total
    vatEUAdvanced_EUR,     // TVA EU avancée (à récupérer)
    vatEUAdvanced_CHF,     // En CHF
    vatCHAdvanced_CHF: tvaMode === 'B' ? landed.vatAmount : 0, // TVA CH avancée (Mode B)
    landedExtras_CHF,
    peak,                  // PEAK EQUITY (capital max immobilisé)
    finalCapital,          // Capital après tous remboursements
    tvaEURecoverable: vatEUAdvanced_CHF,
    tvaCHRecoverable: tvaMode === 'B' ? landed.vatAmount : 0,
  };
}

// Render HTML du bloc cashflow
export function renderCashflowHTML(result) {
  const peak = computePeakEquity(result);
  if (!peak) return '';
  const { tvaMode, isPro } = result;
  
  return `<div class="detail-section cashflow-section">
    <div class="ds-title">SIMULATION CASHFLOW</div>
    <div class="ds-row"><span>Décaissement initial (achat TTC en CHF)</span><span>CHF ${fmt(peak.initialPayment_CHF)}</span></div>
    ${isPro ? `<div class="ds-row deduct"><span>TVA EU avancée (récupérable export)</span><span>CHF ${fmt(peak.vatEUAdvanced_CHF)}</span></div>` : ''}
    <div class="ds-row"><span>+ Frais import + TVA CH</span><span>+ CHF ${fmt(peak.landedExtras_CHF)}</span></div>
    <div class="ds-sep"></div>
    <div class="ds-row total" style="background:#FEF3C7;color:#92400E">
      <span>⚡ PEAK EQUITY (capital max immobilisé)</span>
      <span>CHF ${fmt(peak.peak)}</span>
    </div>
    ${tvaMode === 'B' ? `
    <div class="ds-row deduct"><span>TVA CH récupérable (Mode B)</span><span>− CHF ${fmt(peak.tvaCHRecoverable)}</span></div>` : ''}
    <div class="ds-row"><span>Capital net (steady state)</span><span>CHF ${fmt(peak.finalCapital)}</span></div>
    <div class="ds-note" style="margin-top:8px;font-size:10px;color:var(--text3)">
      Durée de portage estimée : 60 jours · ROI annualisé sur le peak : voir Marge ÷ Peak × (365÷60)
    </div>
  </div>`;
}
