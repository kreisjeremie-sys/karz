// KARZ v10 — search.js
// Réécriture COMPLÈTE propre — Aucune duplication
// ══════════════════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { getListingsEU, getListingsEUMeta, getComparablesCH, buildAS24chUrl, buildAS24chSearchUrl } from './db.js';
import { computeLanded, computeResalePrice, computeCO2, computeMarge } from './calc.js';
import { FLAGS, COUNTRY_NAMES, MODELS, LEGAL, SPECS, DEPRECIATION, DEFAULTS } from './config.js';

let _rendered = false;

// ══════════════════════════════════════════════════════════════
// INITIALISATION
// ══════════════════════════════════════════════════════════════
export async function initSearch() {
  const filtersEl = document.getElementById('search-filters');
  if (_rendered && filtersEl && filtersEl.children.length > 0) {
    await _loadMeta();
    return;
  }
  _rendered = true;
  _buildFilters();
  await _loadMeta();
  await runSearch();
}

export async function refreshSearch() {
  await _loadMeta();
  await runSearch();
}

// ══════════════════════════════════════════════════════════════
// STATUT (header annonces actives)
// ══════════════════════════════════════════════════════════════
async function _loadMeta() {
  const meta = await getListingsEUMeta();
  setState({ euMeta: meta }, true);
  const el = document.getElementById('search-status');
  if (!el) return;
  const d = meta.lastUpdate
    ? new Date(meta.lastUpdate).toLocaleString('fr-CH', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '—';
  el.innerHTML = `<span class="status-dot ok"></span>
    <b>${(meta.totalActive || 0).toLocaleString('fr-CH')}</b> annonces actives ·
    Dernier scrape : <b>${d}</b>`;
}

// ══════════════════════════════════════════════════════════════
// BUILD FILTRES
// ══════════════════════════════════════════════════════════════
function _buildFilters() {
  const container = document.getElementById('search-filters');
  if (!container) return;

  const porscheOpts = MODELS.porsche.map(m =>
    `<option value="${m.slug}">${m.label}</option>`).join('');
  const lrOpts = MODELS.landrover.map(m =>
    `<option value="${m.slug}">${m.label}</option>`).join('');

  container.innerHTML = `
    <div class="filter-grid">
      <div class="fg">
        <label>Marque</label>
        <select id="f-brand" onchange="window.KARZ.search.onBrandChange()">
          <option value="">Toutes</option>
          <option value="Porsche">Porsche</option>
          <option value="Land Rover">Land Rover</option>
        </select>
      </div>
      <div class="fg">
        <label>Modèle</label>
        <select id="f-model">
          <option value="">Tous</option>
          <optgroup label="Porsche">${porscheOpts}</optgroup>
          <optgroup label="Land Rover">${lrOpts}</optgroup>
        </select>
      </div>
      <div class="fg">
        <label>Pays</label>
        <div class="countries-check" id="f-countries">
          ${['DE','FR','BE','ES'].map(c => `
            <label class="cc-label">
              <input type="checkbox" value="${c}" checked>
              ${FLAGS[c]} ${COUNTRY_NAMES[c]}
            </label>`).join('')}
        </div>
      </div>
      <div class="fg"><label>Année min</label><input type="number" id="f-ymin" placeholder="2020" min="2015" max="2026"></div>
      <div class="fg"><label>Année max</label><input type="number" id="f-ymax" placeholder="2024" min="2015" max="2026"></div>
      <div class="fg"><label>Km max</label><input type="number" id="f-kmax" placeholder="80000"></div>
      <div class="fg"><label>Prix max EUR</label><input type="number" id="f-pmax" placeholder="200000"></div>
      <div class="fg"><label>Marge min CHF</label><input type="number" id="f-mmin" placeholder="5000"></div>
      <div class="fg">
        <label>Carburant</label>
        <select id="f-fuel">
          <option value="">Tous</option>
          <option value="diesel">Diesel</option>
          <option value="essence">Essence</option>
          <option value="hybride">Hybride</option>
          <option value="electrique">Électrique</option>
        </select>
      </div>
      <div class="fg">
        <label>Vendeur</label>
        <select id="f-seller">
          <option value="">Tous</option>
          <option value="pro">Pro uniquement</option>
          <option value="private">Particulier</option>
        </select>
      </div>
    </div>
    <div class="filter-actions">
      <button class="btn btn-g" onclick="window.KARZ.search.runSearch()">🔍 Filtrer</button>
      <button class="btn" onclick="window.KARZ.search.resetFilters()">✕ Réinitialiser</button>
      <span id="search-count" style="font-size:11px;color:var(--text3)"></span>
    </div>`;
}

export function onBrandChange() {
  const brand = document.getElementById('f-brand')?.value || '';
  const modelSel = document.getElementById('f-model');
  if (!modelSel) return;
  const models = brand === 'Porsche' ? MODELS.porsche
    : brand === 'Land Rover' ? MODELS.landrover
    : [...MODELS.porsche, ...MODELS.landrover];
  modelSel.innerHTML = '<option value="">Tous</option>' +
    models.map(m => `<option value="${m.slug}">${m.label}</option>`).join('');
}

export function resetFilters() {
  ['f-brand','f-model','f-fuel','f-seller'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['f-ymin','f-ymax','f-kmax','f-pmax','f-mmin'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.querySelectorAll('#f-countries input').forEach(cb => cb.checked = true);
  runSearch();
}

// ══════════════════════════════════════════════════════════════
// LECTURE FILTRES
// ══════════════════════════════════════════════════════════════
function _readFilters() {
  return {
    brand:     document.getElementById('f-brand')?.value || '',
    modelSlug: document.getElementById('f-model')?.value || '',
    yearMin:   parseInt(document.getElementById('f-ymin')?.value) || null,
    yearMax:   parseInt(document.getElementById('f-ymax')?.value) || null,
    kmMax:     parseInt(document.getElementById('f-kmax')?.value) || null,
    priceMax:  parseInt(document.getElementById('f-pmax')?.value) || null,
    margeMin:  parseInt(document.getElementById('f-mmin')?.value) || null,
    fuelType:  document.getElementById('f-fuel')?.value || '',
    sellerT:   document.getElementById('f-seller')?.value || '',
    countries: [...document.querySelectorAll('#f-countries input:checked')].map(cb => cb.value),
  };
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function _normFuel(fuel) {
  if (!fuel) return '';
  const f = fuel.toLowerCase();
  if (f.includes('diesel') || f === 'd') return 'diesel';
  if (f.includes('electric') || f.includes('elektr') || f.includes('électr') || f === 'e') return 'electrique';
  if (f.includes('hybrid') || f.includes('hybride') || f.includes('plug') || f === 'm') return 'hybride';
  if (f.includes('essence') || f.includes('petrol') || f.includes('gasolin') || f.includes('benzin') || f === 'b') return 'essence';
  return f;
}

function _normFuelLabel(fuel) {
  const f = _normFuel(fuel);
  return { diesel:'Diesel', essence:'Essence', hybride:'Hybride', electrique:'Électrique' }[f] || fuel || '—';
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('fr-CH');
}

function _escJson(obj) {
  return JSON.stringify(JSON.stringify(obj)).slice(1, -1);
}

function _levelToUrlParams(level, year, km) {
  const cfg = { 1:{y:1,k:0.3}, 2:{y:1,k:0.3}, 3:{y:2,k:0.5}, 4:{y:2,k:0.5} };
  const c = cfg[level] || cfg[4];
  return {
    yearMin: year - c.y, yearMax: year + c.y,
    kmMin: Math.round(km * (1 - c.k)), kmMax: Math.round(km * (1 + c.k))
  };
}

// ══════════════════════════════════════════════════════════════
// MATCHING SPECS — Stratégie:
// 1. Variant AS24 exact (ex: "Cayenne Turbo" → "Porsche Cayenne Turbo")
// 2. Variant AS24 partiel (ex: "Cayenne Turbo*UNFALL" → "Porsche Cayenne Turbo")
// 3. model_slug → label MODELS → SPECS
// 4. model_slug → version de base (clé la plus courte)
// ══════════════════════════════════════════════════════════════
function _findSpec(listing) {
  const brand = listing.brand || '';
  if (!brand) return null;

  const specKeys = Object.keys(SPECS).filter(k => k.startsWith(brand + ' '));
  
  // Check explicite sur model_full pour des sous-modèles spécifiques
  // Ex: model_full="Range Rover Velar P250" → Land Rover Range Rover Velar
  const modelFull = (listing.model_full || '').toLowerCase();
  const subModels = ['Velar', 'Evoque', 'Sport', 'Autobiography', 'SV'];
  for (const sub of subModels) {
    if (modelFull.includes(sub.toLowerCase())) {
      // Chercher le SPEC le plus court contenant ce sous-modèle
      const subKey = specKeys
        .filter(k => k.includes(sub))
        .sort((a, b) => a.length - b.length)[0];
      if (subKey) {
        return SPECS[subKey];
      }
    }
  }
  
  // Sanity check: rejeter un spec si le prix annonce est trop éloigné du MSRP
  // Un Range Rover neuf CHF 148k ne peut pas être à €30k même 5 ans plus tard
  // Règle: prix EUR doit être >= 20% du MSRP CHF (équivalent ~22% en EUR)
  function _isPlausible(spec) {
    if (!spec || !spec.msrp) return true;
    const priceEur = listing.price_eur_ttc || 0;
    if (!priceEur) return true;
    // Conversion approximative MSRP CHF → EUR (FX 0.94)
    const msrpEur = spec.msrp * 1.06; // 1/0.94
    // Rejeter si prix < 20% MSRP (rachat très improbable)
    // ou si prix > 130% MSRP (pas une occasion)
    return priceEur >= msrpEur * 0.20 && priceEur <= msrpEur * 1.30;
  }

  // 1+2. Match par variant
  if (listing.version) {
    const variant = listing.version
      .replace(/\*.*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Match exact "Brand Variant"
    const keyExact = `${brand} ${variant}`;
    if (SPECS[keyExact] && _isPlausible(SPECS[keyExact])) return SPECS[keyExact];

    // Match partiel : variant commence par le suffixe SPECS
    const sortedKeys = [...specKeys].sort((a, b) => b.length - a.length);
    for (const specKey of sortedKeys) {
      const specSuffix = specKey.slice(brand.length + 1);
      const variantLow = variant.toLowerCase();
      const specLow = specSuffix.toLowerCase();
      if (variantLow.startsWith(specLow) && _isPlausible(SPECS[specKey])) {
        return SPECS[specKey];
      }
    }
  }

  // 3. Match par model_slug → label exact dans MODELS
  if (listing.model_slug) {
    const allModels = [...MODELS.porsche, ...MODELS.landrover];
    const m = allModels.find(m => m.slug === listing.model_slug);
    if (m) {
      const key = `${brand} ${m.label}`;
      if (SPECS[key] && _isPlausible(SPECS[key])) return SPECS[key];
    }

    // 4. Fallback : version de BASE (clé la plus courte) — avec sanity check
    const slug = listing.model_slug.toLowerCase().replace(/-/g, ' ');
    const candidates = specKeys
      .filter(k => k.toLowerCase().includes(slug))
      .sort((a, b) => a.length - b.length);
    
    // Tester chaque candidat dans l'ordre, garder le premier plausible
    for (const cand of candidates) {
      if (_isPlausible(SPECS[cand])) return SPECS[cand];
    }
    
    // Si aucun candidat n'est plausible, retourner le premier mais on a un problème
    // Mieux: retourner null pour que la marge soit "non calculable"
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// CALCUL PAR ANNONCE
// ══════════════════════════════════════════════════════════════
async function _calcListing(listing, fxSafe, TVA_MODE_B, TRANSPORT) {
  const tvaMode = TVA_MODE_B ? 'B' : 'A';
  const spec = _findSpec(listing);

  const vatOrigin   = LEGAL.VAT_BY_COUNTRY[listing.country] || 0.20;
  const isPro       = listing.seller_type === 'pro';
  const priceTTC    = listing.price_eur_ttc || 0;
  const priceHT_EUR = isPro ? Math.round(priceTTC / (1 + vatOrigin)) : priceTTC;
  const priceHT_CHF = Math.round(priceHT_EUR * fxSafe);

  // Mois depuis immatriculation
  let monthsReg = 99;
  if (listing.first_reg_date) {
    const d = new Date(listing.first_reg_date);
    if (!isNaN(d.getTime()))
      monthsReg = Math.round((Date.now() - d.getTime()) / (30 * 24 * 3600 * 1000));
  } else if (listing.year) {
    monthsReg = Math.round((Date.now() - new Date(listing.year, 6, 1).getTime()) / (30 * 24 * 3600 * 1000));
  }

  // Landed cost (null si spec absent)
  const landed = spec
    ? computeLanded(priceHT_CHF, spec, monthsReg, listing.km || 0, tvaMode, null, TRANSPORT)
    : null;

  // Comparables CH
  let comparablesResult = null;
  if (listing.model_slug && listing.year && listing.km) {
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
    } catch(e) { /* silent */ }
  }

  // Revente
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
    monthsReg, landed, resale, marge, spec,
    margeBlocked: !resale || resale.price === null,
  };
}

// ══════════════════════════════════════════════════════════════
// RUN SEARCH (point d'entrée principal)
// ══════════════════════════════════════════════════════════════
export async function runSearch() {
  const state  = getState();
  const listEl = document.getElementById('search-results');
  const countEl= document.getElementById('search-count');
  if (!listEl) return;

  const f = _readFilters();

  if (!f.countries.length) {
    listEl.innerHTML = '<div class="no-data">Sélectionnez au moins un pays.</div>';
    return;
  }

  listEl.innerHTML = '<div class="loading">Chargement des annonces…</div>';

  // 1. Fetch Supabase
  const raw = await getListingsEU({
    brand:     f.brand     || null,
    modelSlug: f.modelSlug || null,
    country:   f.countries,
    yearMin:   f.yearMin,
    yearMax:   f.yearMax,
    kmMax:     f.kmMax,
    priceMax:  f.priceMax,
  });

  if (!raw) {
    listEl.innerHTML = '<div class="no-data error">Erreur de connexion Supabase.</div>';
    return;
  }
  if (!raw.length) {
    listEl.innerHTML = '<div class="no-data">Aucun résultat pour ces filtres.</div>';
    if (countEl) countEl.textContent = '0 résultat';
    return;
  }

  listEl.innerHTML = `<div class="loading">Calcul des ${raw.length} annonces…</div>`;

  // 2. Préparer les paramètres de calcul
  const FX_RAW = state.params?.FX || DEFAULTS.FX;
  const fxSafe = (FX_RAW > 0.80 && FX_RAW < 1.20) ? FX_RAW : DEFAULTS.FX;
  const TVA_MODE_B = state.params?.TVA_MODE_B || DEFAULTS.TVA_MODE_B;
  const TRANSPORT  = state.params?.TRANSPORT  || DEFAULTS.TRANSPORT;

  // 3. Calcul async
  const results = await Promise.all(raw.map(listing =>
    _calcListing(listing, fxSafe, TVA_MODE_B, TRANSPORT)
  ));

  // 4. Filtres côté client
  let filtered = results;
  if (f.fuelType) {
    filtered = filtered.filter(r => _normFuel(r.listing.fuel_type) === f.fuelType);
  }
  if (f.sellerT) {
    filtered = filtered.filter(r =>
      f.sellerT === 'pro' ? r.listing.seller_type === 'pro' : r.listing.seller_type === 'private'
    );
  }
  if (f.margeMin !== null && f.margeMin > 0) {
    filtered = filtered.filter(r =>
      r.marge !== null && r.marge !== undefined && r.marge >= f.margeMin
    );
  }

  // 5. Tri par marge décroissante
  filtered.sort((a, b) => {
    if (a.marge === null && b.marge === null) return 0;
    if (a.marge === null) return 1;
    if (b.marge === null) return -1;
    return b.marge - a.marge;
  });

  if (countEl) countEl.textContent = `${filtered.length} résultat${filtered.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    listEl.innerHTML = '<div class="no-data">Aucun résultat pour ces filtres.</div>';
    return;
  }

  // 6. Render
  listEl.innerHTML = '';
  filtered.forEach((r, i) => listEl.appendChild(_renderCard(r, i, fxSafe)));
}

// ══════════════════════════════════════════════════════════════
// RENDER CARD
// ══════════════════════════════════════════════════════════════
function _renderCard(r, idx, fxSafe) {
  const { listing, tvaMode, isPro, vatOrigin, priceTTC, priceHT_EUR, priceHT_CHF, landed, resale, marge } = r;

  const flag      = FLAGS[listing.country] || '🌍';
  const margeNum  = (marge !== null && marge !== undefined && !isNaN(marge)) ? Math.round(marge) : null;
  const margeCls  = margeNum === null ? '' : margeNum >= 0 ? 'profit' : 'loss';
  const vatPct    = Math.round(vatOrigin * 100);
  const vatDeduct = isPro ? Math.round(priceTTC - priceHT_EUR) : 0;
  const co2       = landed?.co2;

  const isQuasiNeuf = listing.year >= 2025 && (listing.km || 0) < 10000;

  // ── LANDED HTML ───────────────────────────────────────────
  const landedHTML = landed ? `
    <div class="detail-section">
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
      <div class="ds-row ${co2?.penalty > 0 ? 'cost' : 'zero'}">
        <span>+ CO2 fédéral OFEN 2025
          ${co2?.exempt ? `<span class="ds-src ok">✓ Exempté — ${co2.reason}</span>`
          : co2?.couldBeExempt ? `<span class="ds-src warn">⚠ Pire cas — vérifier km > 5 000</span>`
          : ''}
        </span>
        <span>${co2?.penalty > 0 ? '+ CHF ' + fmt(co2.penalty) : 'CHF 0 — Exempté'}</span>
      </div>
      <div class="ds-sep"></div>
      <div class="ds-row total"><span>= LANDED NET</span><span>CHF ${fmt(landed.total)}</span></div>
    </div>` : `
    <div class="detail-section">
      <div class="ds-note warn">⚠ Modèle non identifié dans la base KARZ — landed cost non calculable.<br>Modèle reçu : ${listing.model_full || listing.model_slug}</div>
    </div>`;

  // ── RESALE HTML ───────────────────────────────────────────
  const levelColor = {0:'#185FA5',1:'#0F6E56',2:'#0F6E56',3:'#854F0B',4:'#854F0B',5:'#888'}[resale?.level] || '#888';
  const levelLabel = {0:'Eurotax',1:'Comparables filtrés',2:'Comparables',3:'Comparables élargis',4:'Comparables élargis',5:'Estimation dépréciation'}[resale?.level] || '—';

  const resaleHTML = resale && resale.price ? `
    <div class="detail-section">
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
    </div>` : `
    <div class="detail-section">
      <div class="ds-title">REVENTE CH</div>
      <div class="ds-note warn">⚠ Benchmark CH indisponible pour ce profil — saisir la cote Eurotax après ajout au pipeline</div>
    </div>`;

  // ── MARGE HTML ────────────────────────────────────────────
  const margeHTML = `
    <div class="detail-marge ${margeCls}">
      <span>MARGE ${tvaMode === 'B' ? 'NETTE HT (Mode B)' : 'NETTE TTC (Mode A)'}</span>
      <span class="marge-val">${
        r.margeBlocked ? '⚠ Benchmark CH indisponible'
        : margeNum !== null ? 'CHF ' + (margeNum >= 0 ? '+' : '') + fmt(margeNum)
        : '—'
      }</span>
    </div>`;

  // ── ASSEMBLAGE ────────────────────────────────────────────
  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML = `
    <div class="rc-header">
      <div class="rc-rank">#${idx + 1}</div>
      <span class="rc-flag">${flag}</span>
      <div class="rc-info">
        <div class="rc-name">${listing.model_full || listing.brand + ' ' + listing.model_slug} ${listing.year || ''}</div>
        <div class="rc-meta">
          ${listing.km ? fmt(listing.km) + ' km' : '—'} ·
          ${_normFuelLabel(listing.fuel_type)} ·
          ${listing.seller_type === 'pro' ? '<span class="badge bpro">Pro</span>' : '<span class="badge bpriv">Particulier</span>'}
          ${isQuasiNeuf ? '<span class="badge" style="background:#FEE2E2;color:#991B1B;margin-left:4px">Quasi-neuf</span>' : ''}
          ${listing.seller_name && listing.seller_name !== '—' ? ' · ' + listing.seller_name : ''}
          ${listing.days_online ? ' · ' + listing.days_online + 'j en ligne' : ''}
        </div>
      </div>
      <div class="rc-right">
        <div class="rc-price">€${fmt(priceTTC)} <span class="rc-ttc">TTC</span></div>
        <div class="rc-marge-preview ${margeCls}">
          ${r.margeBlocked
            ? '<span class="warn-sm">⚠ Benchmark requis</span>'
            : margeNum !== null ? 'CHF ' + (margeNum >= 0 ? '+' : '') + fmt(margeNum) : '—'}
        </div>
      </div>
      <div class="rc-chevron">▼</div>
      ${listing.listing_url
        ? `<a class="rc-link" href="${listing.listing_url}" target="_blank" onclick="event.stopPropagation()">↗</a>`
        : ''}
    </div>
    <div class="rc-detail">
      ${landedHTML}
      ${resaleHTML}
      ${margeHTML}
      <div class="rc-actions">
        <a class="btn-as24-ch" href="${buildAS24chSearchUrl(listing)}" target="_blank" onclick="event.stopPropagation()">
          🇨🇭 Voir le marché CH (AS24.ch)
        </a>
        <button class="btn-add-pipeline" data-listing="${_escJson(listing)}">+ Ajouter au pipeline</button>
      </div>
    </div>`;

  // Event listeners
  card.querySelector('.rc-header').addEventListener('click', e => {
    if (e.target.closest('a') || e.target.closest('button')) return;
    card.classList.toggle('expanded');
  });
  card.querySelector('.btn-add-pipeline').addEventListener('click', e => {
    e.stopPropagation();
    const data = e.currentTarget.dataset.listing;
    window.KARZ.pipeline.addFromListing(e, data);
  });

  return card;
}
