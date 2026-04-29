// js/new-opportunity.js — Saisie manuelle / par URL d\'opportunité
// Refactor : utilise compute.js (même logique que search.js)
import { MODELS } from './config.js';
import { computeListing, fmt, renderLandedHTML, renderResaleHTML, renderMargeHTML, renderCashflowHTML } from './compute.js';
import { startSelectionForOpportunity, consumeSelection } from './benchmark.js';

let _rendered = false;
let _currentResult = null;
let _currentBenchmarkSelection = null;
let _customResalePrice = null;

export async function initNewOpportunity() {
  // Toujours re-initialiser si prefill dans l'URL (bookmarklet redirect)
  const hasPrefill = sessionStorage.getItem('karz_prefill');
  const hasBenchmark = sessionStorage.getItem('karz_benchmark_selection');
  
  if (_rendered && !hasPrefill && !hasBenchmark) return;
  _rendered = true;
  _buildUI();
  
  // Attendre que le DOM soit prêt avant de remplir
  await new Promise(r => setTimeout(r, 50));
  
  if (hasPrefill) _checkPrefill();
  if (hasBenchmark) _checkBenchmarkReturn();
}

function _buildUI() {
  const container = document.getElementById('newopp-content');
  if (!container) return;

  const porscheOpts = MODELS.porsche.map(m =>
    `<option value="${m.slug}">${m.label}</option>`).join('');
  const lrOpts = MODELS.landrover.map(m =>
    `<option value="${m.slug}">${m.label}</option>`).join('');

  // Bookmarklet code (compressé)
  const bookmarkletCode = _buildBookmarkletCode();
  
  container.innerHTML = `
    <div class="newopp-section">
      <h3>1. Importer une annonce</h3>
      <p class="newopp-help">3 méthodes pour analyser une opportunité :</p>
      
      <div class="newopp-method">
        <strong>A. URL AS24.com</strong> (parsing automatique côté serveur)
        <div class="newopp-url-row">
          <input type="url" id="newopp-url" placeholder="https://www.autoscout24.com/offers/..." style="flex:1">
          <button class="btn btn-g" id="newopp-fetch">🔍 Analyser l\'URL</button>
        </div>
        <div id="newopp-fetch-status" class="newopp-status"></div>
      </div>
      
      <div class="newopp-method">
        <strong>B. Bookmarklet "+ KARZ"</strong> (Mobile.de + AS24.ch + tout site)
        <p class="newopp-help-sm">
          Glissez ce bouton dans votre barre de favoris Chrome, puis cliquez-le sur n\'importe quelle annonce auto.
        </p>
        <a class="bookmarklet-btn" href="${bookmarkletCode}" onclick="event.preventDefault(); alert('Glissez ce bouton dans votre barre de favoris (ne pas cliquer)')">
          + KARZ
        </a>
      </div>
      
      <div class="newopp-method">
        <strong>C. Saisie manuelle</strong> (formulaire ci-dessous)
      </div>
    </div>

    <div class="newopp-section">
      <h3>2. Caractéristiques du véhicule</h3>
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
        <div class="newopp-fg" style="grid-column:span 2">
          <label>URL annonce (optionnel)</label>
          <input type="url" id="newopp-listing-url" placeholder="https://...">
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
      status.innerHTML = `<span class="warn">⚠ ${data.error || 'Echec de l\'analyse'}</span>`;
      return;
    }
    _fillForm(data.listing);
    status.innerHTML = '<span class="ok">✓ Données extraites — vérifiez et calculez</span>';
  } catch(e) {
    status.innerHTML = `<span class="warn">⚠ Erreur : ${e.message}</span>`;
  }
}

function _fillForm(listing) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== null && val !== undefined && val !== '') el.value = val;
  };
  setVal('newopp-brand', listing.brand);
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
  setVal('newopp-listing-url', listing.listing_url);
}

function _readForm() {
  return {
    brand:         document.getElementById('newopp-brand').value,
    model_slug:    document.getElementById('newopp-model').value,
    model_full:    document.getElementById('newopp-version').value || document.getElementById('newopp-model').value,
    version:       document.getElementById('newopp-version').value || null,
    year:          parseInt(document.getElementById('newopp-year').value) || null,
    km:            parseInt(document.getElementById('newopp-km').value) || null,
    fuel_type:     document.getElementById('newopp-fuel').value || null,
    price_eur_ttc: parseInt(document.getElementById('newopp-price').value) || null,
    country:       document.getElementById('newopp-country').value || 'DE',
    seller_type:   document.getElementById('newopp-seller').value || 'pro',
    seller_name:   document.getElementById('newopp-seller-name').value || '—',
    listing_url:   document.getElementById('newopp-listing-url').value || null,
  };
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
  
  // UTILISE COMPUTE.JS (avec ou sans sélection benchmark)
  _currentResult = await computeListing(listing, _currentBenchmarkSelection);
  
  // Override prix de revente custom si défini
  if (_customResalePrice && _currentResult.resale) {
    _currentResult.resale.price = _customResalePrice;
    _currentResult.resale.p25 = _customResalePrice;
    _currentResult.resale.label = `Prix retenu manuellement : CHF ${_customResalePrice.toLocaleString('fr-CH')}`;
    // Recalculer marge
    if (_currentResult.landed) {
      const revenu = _currentResult.tvaMode === 'B'
        ? Math.round(_customResalePrice / 1.081)
        : _customResalePrice;
      _currentResult.marge = Math.round(revenu - _currentResult.landed.total);
      _currentResult.margeBlocked = false;
    }
  }
  _renderResult();
}

function _renderResult() {
  const result = _currentResult;
  const resultEl = document.getElementById('newopp-result');
  
  // Section "Prix de revente final" — synthèse M1 (comparables) vs M2 (dépréciation)
  const m1Price = _currentBenchmarkSelection && _currentBenchmarkSelection.length 
    ? Math.round(_currentBenchmarkSelection.map(b => b.price_chf).filter(p => p > 0).sort((a,b) => a-b)[Math.floor(_currentBenchmarkSelection.length * 0.25)])
    : null;
  
  // M2 = dépréciation pure (recalculer si on a un spec)
  const m2Price = result.spec && result.spec.msrp ? _calculateDepreciationOnly(result.spec, result.listing.year, result.listing.km) : null;
  
  const finalPrice = result.resale?.price || null;
  
  const resaleSection = `
    <div class="detail-section resale-methods-section">
      <div class="ds-title">PRIX DE REVENTE — DOUBLE MÉTHODOLOGIE</div>
      
      <div class="resale-methods-grid">
        <div class="resale-method ${m1Price ? 'active' : ''}">
          <div class="rm-label">M1 — Comparables CH ${_currentBenchmarkSelection ? '(' + _currentBenchmarkSelection.length + ' sélectionnés)' : ''}</div>
          <div class="rm-price">${m1Price ? 'CHF ' + fmt(m1Price) : '—'}</div>
          <button class="btn-sm btn-g" id="newopp-select-comparables">📊 ${_currentBenchmarkSelection ? 'Modifier sélection' : 'Choisir comparables'}</button>
        </div>
        
        <div class="resale-method">
          <div class="rm-label">M2 — Dépréciation MSRP</div>
          <div class="rm-price">${m2Price ? 'CHF ' + fmt(m2Price) : '—'}</div>
          <div class="rm-sub">${result.spec ? 'MSRP CHF ' + fmt(result.spec.msrp) : 'Spec non trouvé'}</div>
        </div>
      </div>
      
      <div class="final-price-row">
        <label>Prix de revente retenu (CHF) :</label>
        <input type="number" id="newopp-custom-resale" value="${_customResalePrice || finalPrice || ''}" placeholder="${finalPrice || '—'}">
        <button class="btn btn-g btn-sm" id="newopp-recalc">↻ Recalculer marge</button>
      </div>
      <div class="rm-help">Pré-rempli avec ${_currentBenchmarkSelection ? 'la sélection comparables' : (result.resale ? result.resale.label : 'l\'estimation auto')} — éditable</div>
    </div>`;
  
  resultEl.innerHTML = `
    <h3>Analyse complète</h3>
    ${renderLandedHTML(result)}
    ${renderCashflowHTML(result)}
    ${resaleSection}
    ${renderMargeHTML(result)}
    <div class="newopp-actions">
      <a class="btn-as24-ch" href="${result.as24chUrl}" target="_blank">🇨🇭 Voir AS24.ch</a>
      <button class="btn btn-g" id="newopp-add-pipeline">+ Ajouter au pipeline</button>
    </div>
  `;
  
  document.getElementById('newopp-add-pipeline').addEventListener('click', _handleAddPipeline);
  document.getElementById('newopp-select-comparables').addEventListener('click', _handleSelectComparables);
  document.getElementById('newopp-recalc').addEventListener('click', _handleRecalc);
}

function _calculateDepreciationOnly(spec, year, km) {
  if (!spec || !spec.msrp) return null;
  const currentYear = new Date().getFullYear();
  let ageYears = Math.max(1, currentYear - (year || currentYear));
  const rates = { 1:0.18, 2:0.14, 3:0.11, 4:0.09, 5:0.09 };
  let val = spec.msrp;
  for (let y = 1; y <= ageYears; y++) {
    val *= (1 - (rates[y] || 0.07));
  }
  const normKm = 15000 * Math.max(ageYears, 1);
  const excessKm = Math.max(0, (km || 0) - normKm);
  const kmPenalty = (excessKm / 10000) * 0.003;
  val *= (1 - kmPenalty);
  return Math.round(val / 500) * 500;
}

function _handleSelectComparables() {
  const listing = _readForm();
  startSelectionForOpportunity(listing, 'newopp');
}

function _handleRecalc() {
  const customPrice = parseInt(document.getElementById('newopp-custom-resale').value) || null;
  _customResalePrice = customPrice;
  _handleCalculate();
}

function _checkBenchmarkReturn() {
  const selection = consumeSelection();
  if (selection && selection.length > 0) {
    _currentBenchmarkSelection = selection;
    // Re-trigger calculation if we already have a result
    setTimeout(() => {
      if (document.getElementById('newopp-brand')?.value) {
        _handleCalculate();
      }
    }, 100);
  }
}

async function _handleAddPipeline() {
  if (!_currentResult) return;
  const listingJson = JSON.stringify(_currentResult.listing);
  const fakeEvent = { stopPropagation: () => {} };
  window.KARZ.pipeline.addFromListing(fakeEvent, JSON.stringify(listingJson));
}

function _handleReset() {
  ['newopp-url','newopp-brand','newopp-model','newopp-version','newopp-year',
   'newopp-km','newopp-fuel','newopp-price','newopp-seller-name','newopp-listing-url'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('newopp-country').value = 'DE';
  document.getElementById('newopp-seller').value = 'pro';
  document.getElementById('newopp-fetch-status').innerHTML = '';
  document.getElementById('newopp-result').style.display = 'none';
  _currentResult = null;
}

// ══════════════════════════════════════════════════════════════
// PREFILL depuis URL (?prefill=...) — utilisé par le bookmarklet
// ══════════════════════════════════════════════════════════════
function _checkPrefill() {
  // Lire depuis sessionStorage (mis par le bookmarklet)
  const raw = sessionStorage.getItem('karz_prefill');
  if (!raw) return;
  
  try {
    sessionStorage.removeItem('karz_prefill'); // Consommer
    const data = JSON.parse(raw);
    
    // D'abord setter la marque pour charger les modèles
    const brandEl = document.getElementById('newopp-brand');
    if (brandEl && data.brand) {
      brandEl.value = data.brand;
      onBrandChange();
    }
    
    // Setter l'URL
    const urlEl = document.getElementById('newopp-listing-url');
    if (urlEl && data.url) urlEl.value = data.url;
    
    // Remplir tout le formulaire
    _fillForm(data);
    
    const status = document.getElementById('newopp-fetch-status');
    if (status) status.innerHTML = '<span class="ok">✓ Données importées via bookmarklet — vérifiez et calculez</span>';
    
  } catch(e) {
    console.error('Prefill error:', e);
  }
}

// ══════════════════════════════════════════════════════════════
// BOOKMARKLET — code injecté qui tourne sur AS24/Mobile.de etc.
// ══════════════════════════════════════════════════════════════
function _buildBookmarkletCode() {
  return `javascript:(function(){var h=window.location.href,d={url:h};try{var n=document.getElementById('__NEXT_DATA__');if(n){var p=JSON.parse(n.textContent).props.pageProps,it=p.listingDetails||p.detail||p.listing||p.detailItem||p.vehicleDetails||{},v=it.vehicle||{},t=it.tracking||{},pr=(it.prices&&it.prices.public)||it.price||{},pf=pr.priceFormatted||'',pn=parseInt(pf.replace(/[^0-9]/g,''))||0,fr=t.firstRegistration||v.firstRegistration||'',ym=String(fr).match(/20[12][0-9]/),fm={b:'essence',d:'diesel',e:'electrique',m:'hybride',p:'hybride'},fl=fm[t.fuelType]||(function(){var f=String(v.fuel||'').toLowerCase();return f.includes('diesel')?'diesel':f.includes('elec')||f.includes('elek')?'electrique':f.includes('hybr')?'hybride':f.includes('enz')||f.includes('ess')||f.includes('gas')?'essence':null;})(),mk=String(v.make||'').toLowerCase();d.brand=mk==='porsche'?'Porsche':mk.includes('land')?'Land Rover':v.make||'';d.model_slug=String(v.model||'').toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');d.model_full=((v.make||'')+' '+(v.model||'')+' '+(v.variant||'')).trim();d.version=v.variant||null;d.year=ym?parseInt(ym[0]):null;d.km=parseInt(t.mileage||v.mileageInKm||0)||null;d.fuel_type=fl;d.price_eur_ttc=pf.includes('CHF')?null:pn;d.price_chf_ttc=pf.includes('CHF')?pn:null;d.country=String(((it.location)||{}).countryCode||'DE').toUpperCase();d.seller_type=String(((it.seller)||{}).type||'').toLowerCase().startsWith('d')?'pro':'private';d.seller_name=((it.seller)||{}).companyName||((it.seller)||{}).name||'';}}catch(e){}if(!d.price_eur_ttc&&!d.price_chf_ttc){var px=prompt('Prix non détecté. Entrez le prix :');if(px)d.price_eur_ttc=parseInt(px.replace(/[^0-9]/g,''));}sessionStorage.setItem('karz_prefill',JSON.stringify(d));window.location.href='https://karz-rho.vercel.app/?page=newopp';})();`;
}
