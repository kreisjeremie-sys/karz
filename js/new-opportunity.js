// js/new-opportunity.js — Module saisie manuelle / par URL d'opportunité
import { getState } from './state.js';
import { computeLanded, computeResalePrice } from './calc.js';
import { getComparablesCH, buildAS24chSearchUrl } from './db.js';
import { FLAGS, COUNTRY_NAMES, MODELS, LEGAL, SPECS, DEFAULTS } from './config.js';

let _rendered = false;
let _currentListing = null;
let _currentResult = null;

export async function initNewOpportunity() {
  if (_rendered) return;
  _rendered = true;
  _buildUI();
}

function _buildUI() {
  const container = document.getElementById('newopp-content');
  if (!container) return;

  const porscheOpts = MODELS.porsche.map(m =>
    `<option value="${m.slug}">${m.label}</option>`).join('');
  const lrOpts = MODELS.landrover.map(m =>
    `<option value="${m.slug}">${m.label}</option>`).join('');

  container.innerHTML = `
    <div class="newopp-section">
      <h3>Analyser une opportunité</h3>
      <p class="newopp-help">Collez l'URL d'une annonce AutoScout24 ou remplissez manuellement.</p>
      
      <div class="newopp-url-row">
        <input type="url" id="newopp-url" placeholder="https://www.autoscout24.com/offers/..." style="flex:1">
        <button class="btn btn-g" id="newopp-fetch">🔍 Analyser l'URL</button>
      </div>
      
      <div id="newopp-fetch-status" class="newopp-status"></div>
    </div>

    <div class="newopp-section">
      <h3>Caractéristiques du véhicule</h3>
      <div class="newopp-grid">
        <div class="newopp-fg">
          <label>Marque</label>
          <select id="newopp-brand" onchange="window.KARZ.newopp.onBrandChange()">
            <option value="">—</option>
            <option value="Porsche">Porsche</option>
            <option value="Land Rover">Land Rover</option>
          </select>
        </div>
        <div class="newopp-fg">
          <label>Modèle</label>
          <select id="newopp-model">
            <option value="">—</option>
            <optgroup label="Porsche">${porscheOpts}</optgroup>
            <optgroup label="Land Rover">${lrOpts}</optgroup>
          </select>
        </div>
        <div class="newopp-fg">
          <label>Version / Finition</label>
          <input type="text" id="newopp-version" placeholder="Cayenne Turbo, GTS, S E-Hybrid…">
        </div>
        <div class="newopp-fg">
          <label>Année</label>
          <input type="number" id="newopp-year" placeholder="2022" min="2010" max="2026">
        </div>
        <div class="newopp-fg">
          <label>Kilométrage</label>
          <input type="number" id="newopp-km" placeholder="50000">
        </div>
        <div class="newopp-fg">
          <label>Carburant</label>
          <select id="newopp-fuel">
            <option value="">—</option>
            <option value="essence">Essence</option>
            <option value="diesel">Diesel</option>
            <option value="hybride">Hybride</option>
            <option value="electrique">Électrique</option>
          </select>
        </div>
        <div class="newopp-fg">
          <label>Prix EUR TTC</label>
          <input type="number" id="newopp-price" placeholder="65000">
        </div>
        <div class="newopp-fg">
          <label>Pays vendeur</label>
          <select id="newopp-country">
            <option value="DE">🇩🇪 Allemagne</option>
            <option value="FR">🇫🇷 France</option>
            <option value="BE">🇧🇪 Belgique</option>
            <option value="ES">🇪🇸 Espagne</option>
            <option value="IT">🇮🇹 Italie</option>
            <option value="NL">🇳🇱 Pays-Bas</option>
            <option value="AT">🇦🇹 Autriche</option>
            <option value="LU">🇱🇺 Luxembourg</option>
          </select>
        </div>
        <div class="newopp-fg">
          <label>Type vendeur</label>
          <select id="newopp-seller">
            <option value="pro">Professionnel</option>
            <option value="private">Particulier</option>
          </select>
        </div>
        <div class="newopp-fg" style="grid-column:span 2">
          <label>Nom du vendeur (optionnel)</label>
          <input type="text" id="newopp-seller-name" placeholder="Porsche Centre Stuttgart">
        </div>
      </div>
      
      <div class="newopp-actions">
        <button class="btn btn-g" id="newopp-calculate">📊 Calculer la marge</button>
        <button class="btn" id="newopp-reset">✕ Réinitialiser</button>
      </div>
    </div>

    <div id="newopp-result" class="newopp-result-section" style="display:none"></div>
  `;

  document.getElementById('newopp-fetch').addEventListener('click', _handleFetchUrl);
  document.getElementById('newopp-calculate').addEventListener('click', _handleCalculate);
  document.getElementById('newopp-reset').addEventListener('click', _handleReset);
}

export function onBrandChange() {
  const brand = document.getElementById('newopp-brand')?.value || '';
  const modelSel = document.getElementById('newopp-model');
  if (!modelSel) return;
  const models = brand === 'Porsche' ? MODELS.porsche
    : brand === 'Land Rover' ? MODELS.landrover
    : [...MODELS.porsche, ...MODELS.landrover];
  modelSel.innerHTML = '<option value="">—</option>' +
    models.map(m => `<option value="${m.slug}">${m.label}</option>`).join('');
}

async function _handleFetchUrl() {
  const url = document.getElementById('newopp-url').value.trim();
  const status = document.getElementById('newopp-fetch-status');
  
  if (!url) {
    status.innerHTML = '<span class="warn">Saisissez une URL</span>';
    return;
  }
  
  status.innerHTML = '<span class="loading">⏳ Analyse en cours…</span>';
  
  try {
    const res = await fetch('/api/fetch-listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    
    if (!data.success) {
      status.innerHTML = `<span class="warn">⚠ ${data.error || "Échec de l'analyse"}</span>`;
      return;
    }
    
    // Remplir le formulaire avec les données extraites
    _fillForm(data.listing);
    status.innerHTML = '<span class="ok">✓ Données extraites — vérifiez et calculez</span>';
  } catch(e) {
    status.innerHTML = `<span class="warn">⚠ Erreur : ${e.message}</span>`;
  }
}

function _fillForm(listing) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== null && val !== undefined) el.value = val;
  };
  
  setVal('newopp-brand', listing.brand);
  // Trigger model select rebuild
  if (listing.brand) onBrandChange();
  setVal('newopp-model', listing.model_slug);
  setVal('newopp-version', listing.version);
  setVal('newopp-year', listing.year);
  setVal('newopp-km', listing.km);
  setVal('newopp-fuel', listing.fuel_type);
  setVal('newopp-price', listing.price_eur_ttc);
  setVal('newopp-country', listing.country);
  setVal('newopp-seller', listing.seller_type);
  setVal('newopp-seller-name', listing.seller_name);
  
  _currentListing = listing;
}

async function _handleCalculate() {
  const listing = _readForm();
  
  if (!listing.brand || !listing.model_slug || !listing.price_eur_ttc) {
    alert('Marque, modèle et prix sont obligatoires.');
    return;
  }
  
  const resultEl = document.getElementById('newopp-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML = '<div class="loading">Calcul en cours…</div>';
  
  // Calcul similaire à search.js
  const state = getState();
  const FX_RAW = state.params?.FX || DEFAULTS.FX;
  const fxSafe = (FX_RAW > 0.80 && FX_RAW < 1.20) ? FX_RAW : DEFAULTS.FX;
  const TVA_MODE_B = state.params?.TVA_MODE_B || DEFAULTS.TVA_MODE_B;
  const TRANSPORT  = state.params?.TRANSPORT  || DEFAULTS.TRANSPORT;
  const tvaMode = TVA_MODE_B ? 'B' : 'A';
  
  // Find spec
  const spec = _findSpec(listing);
  
  const vatOrigin = LEGAL.VAT_BY_COUNTRY[listing.country] || 0.20;
  const isPro = listing.seller_type === 'pro';
  const priceTTC = listing.price_eur_ttc;
  const priceHT_EUR = isPro ? Math.round(priceTTC / (1 + vatOrigin)) : priceTTC;
  const priceHT_CHF = Math.round(priceHT_EUR * fxSafe);
  
  // Months
  let monthsReg = 99;
  if (listing.year) {
    monthsReg = Math.round((Date.now() - new Date(listing.year, 6, 1).getTime()) / (30 * 24 * 3600 * 1000));
  }
  
  const landed = spec
    ? computeLanded(priceHT_CHF, spec, monthsReg, listing.km || 0, tvaMode, null, TRANSPORT)
    : null;
  
  // Comparables CH
  let comparablesResult = null;
  if (listing.model_slug && listing.year && listing.km) {
    try {
      const { rows, level, label } = await getComparablesCH({
        model_slug: listing.model_slug,
        fuel_type: listing.fuel_type,
        version: listing.version,
        year: listing.year,
        km: listing.km,
      });
      comparablesResult = { rows, level, label };
    } catch(e) {}
  }
  
  const resale = spec
    ? computeResalePrice(spec, listing.year, listing.km, null, comparablesResult)
    : null;
  
  let marge = null;
  if (landed && resale && resale.price !== null) {
    const revenu = tvaMode === 'B'
      ? Math.round(resale.price / (1 + LEGAL.VAT_CH))
      : resale.price;
    marge = Math.round(revenu - landed.total);
  }
  
  _currentResult = { listing, spec, landed, resale, marge, fxSafe, tvaMode, priceHT_EUR, priceHT_CHF, vatOrigin, isPro, monthsReg };
  _renderResult();
}

function _readForm() {
  return {
    brand:         document.getElementById('newopp-brand').value,
    model_slug:    document.getElementById('newopp-model').value,
    version:       document.getElementById('newopp-version').value || null,
    year:          parseInt(document.getElementById('newopp-year').value) || null,
    km:            parseInt(document.getElementById('newopp-km').value) || null,
    fuel_type:     document.getElementById('newopp-fuel').value || null,
    price_eur_ttc: parseInt(document.getElementById('newopp-price').value) || null,
    country:       document.getElementById('newopp-country').value || 'DE',
    seller_type:   document.getElementById('newopp-seller').value || 'pro',
    seller_name:   document.getElementById('newopp-seller-name').value || '—',
    listing_url:   document.getElementById('newopp-url').value || null,
  };
}

function _findSpec(listing) {
  const brand = listing.brand || '';
  if (!brand) return null;
  const specKeys = Object.keys(SPECS).filter(k => k.startsWith(brand + ' '));

  if (listing.version) {
    const variant = listing.version.replace(/\*.*$/, '').replace(/\s+/g, ' ').trim();
    const keyExact = `${brand} ${variant}`;
    if (SPECS[keyExact]) return SPECS[keyExact];
    const sortedKeys = [...specKeys].sort((a, b) => b.length - a.length);
    for (const specKey of sortedKeys) {
      const specSuffix = specKey.slice(brand.length + 1);
      if (variant.toLowerCase().startsWith(specSuffix.toLowerCase())) {
        return SPECS[specKey];
      }
    }
  }
  if (listing.model_slug) {
    const allModels = [...MODELS.porsche, ...MODELS.landrover];
    const m = allModels.find(m => m.slug === listing.model_slug);
    if (m) {
      const key = `${brand} ${m.label}`;
      if (SPECS[key]) return SPECS[key];
    }
    const slug = listing.model_slug.toLowerCase().replace(/-/g, ' ');
    const candidates = specKeys.filter(k => k.toLowerCase().includes(slug)).sort((a, b) => a.length - b.length);
    if (candidates.length) return SPECS[candidates[0]];
  }
  return null;
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('fr-CH');
}

function _renderResult() {
  const { listing, spec, landed, resale, marge, fxSafe, tvaMode, priceHT_EUR, priceHT_CHF, vatOrigin, isPro, monthsReg } = _currentResult;
  const resultEl = document.getElementById('newopp-result');
  
  const margeNum = (marge !== null && !isNaN(marge)) ? marge : null;
  const margeCls = margeNum === null ? '' : margeNum >= 0 ? 'profit' : 'loss';
  const vatPct = Math.round(vatOrigin * 100);
  const vatDeduct = isPro ? priceHT_EUR ? Math.round(listing.price_eur_ttc - priceHT_EUR) : 0 : 0;
  const co2 = landed?.co2;
  
  const as24chUrl = buildAS24chSearchUrl(listing);
  
  const landedHTML = landed ? `
    <div class="newopp-block">
      <div class="newopp-block-title">LANDED COST</div>
      <div class="ds-row"><span>Prix annonce</span><span>€${fmt(listing.price_eur_ttc)} TTC</span></div>
      ${isPro ? `<div class="ds-row deduct"><span>− TVA ${listing.country} ${vatPct}%</span><span>− €${fmt(vatDeduct)}</span></div>
      <div class="ds-row bold"><span>= Prix HT export</span><span>€${fmt(priceHT_EUR)} HT</span></div>` : 
      `<div class="ds-row note"><span>Vendeur particulier — TVA non déductible</span><span></span></div>`}
      <div class="ds-row"><span>× FX EUR/CHF ${fxSafe.toFixed(4)}</span><span>= CHF ${fmt(priceHT_CHF)}</span></div>
      <div class="ds-sep"></div>
      <div class="ds-row cost"><span>+ Transport</span><span>+ CHF ${fmt(landed.transport)}</span></div>
      <div class="ds-row cost"><span>+ Impôt fédéral 4%</span><span>+ CHF ${fmt(landed.autoTax)}</span></div>
      <div class="ds-row cost"><span>+ Frais fixes</span><span>+ CHF ${fmt(landed.fixedFees)}</span></div>
      <div class="ds-row ${tvaMode === 'B' ? 'zero' : 'cost'}">
        <span>+ TVA CH 8.1% ${tvaMode === 'B' ? '(Mode B récupérable)' : '(Mode A définitif)'}</span>
        <span>${tvaMode === 'B' ? 'CHF 0' : '+ CHF ' + fmt(landed.vatInLanded)}</span>
      </div>
      <div class="ds-row ${co2?.penalty > 0 ? 'cost' : 'zero'}">
        <span>+ CO2 OFEN ${co2?.exempt ? `<span class="ds-src ok">✓ Exempté</span>` : ''}</span>
        <span>${co2?.penalty > 0 ? '+ CHF ' + fmt(co2.penalty) : 'CHF 0'}</span>
      </div>
      <div class="ds-sep"></div>
      <div class="ds-row total"><span>= LANDED NET</span><span>CHF ${fmt(landed.total)}</span></div>
    </div>` : 
    `<div class="newopp-block warn">⚠ Modèle non identifié — landed non calculable</div>`;
  
  const resaleHTML = resale && resale.price ? `
    <div class="newopp-block">
      <div class="newopp-block-title">REVENTE CH</div>
      <div class="ds-note">${resale.label || 'Estimation'}</div>
      <div class="rs-stats-grid">
        <div class="rs-stat-item primary">
          <div class="rs-stat-l">P25 cible</div>
          <div class="rs-stat-v">CHF ${fmt(resale.p25)}</div>
        </div>
        ${resale.p50 ? `<div class="rs-stat-item"><div class="rs-stat-l">Médiane</div><div class="rs-stat-v">CHF ${fmt(resale.p50)}</div></div>` : ''}
        ${resale.p75 ? `<div class="rs-stat-item"><div class="rs-stat-l">P75</div><div class="rs-stat-v">CHF ${fmt(resale.p75)}</div></div>` : ''}
      </div>
    </div>` :
    `<div class="newopp-block warn">⚠ Benchmark CH indisponible</div>`;
  
  const margeHTML = `
    <div class="newopp-block detail-marge ${margeCls}">
      <span>MARGE ${tvaMode === 'B' ? 'NETTE HT (Mode B)' : 'NETTE TTC (Mode A)'}</span>
      <span class="marge-val">${
        margeNum !== null ? 'CHF ' + (margeNum >= 0 ? '+' : '') + fmt(margeNum)
        : '— Benchmark requis'
      }</span>
    </div>`;
  
  resultEl.innerHTML = `
    <h3>Analyse complète</h3>
    ${landedHTML}
    ${resaleHTML}
    ${margeHTML}
    <div class="newopp-actions">
      <a class="btn-as24-ch" href="${as24chUrl}" target="_blank">🇨🇭 Voir le marché CH (AS24.ch)</a>
      <button class="btn btn-g" id="newopp-add-pipeline">+ Ajouter au pipeline</button>
    </div>
  `;
  
  document.getElementById('newopp-add-pipeline').addEventListener('click', _handleAddPipeline);
}

async function _handleAddPipeline() {
  if (!_currentResult) return;
  // Réutiliser pipeline.addFromListing
  const listingJson = JSON.stringify(_currentResult.listing);
  const fakeEvent = { stopPropagation: () => {} };
  window.KARZ.pipeline.addFromListing(fakeEvent, JSON.stringify(listingJson));
}

function _handleReset() {
  ['newopp-url','newopp-brand','newopp-model','newopp-version','newopp-year',
   'newopp-km','newopp-fuel','newopp-price','newopp-seller-name'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('newopp-country').value = 'DE';
  document.getElementById('newopp-seller').value = 'pro';
  document.getElementById('newopp-fetch-status').innerHTML = '';
  document.getElementById('newopp-result').style.display = 'none';
  _currentListing = null;
  _currentResult = null;
}
