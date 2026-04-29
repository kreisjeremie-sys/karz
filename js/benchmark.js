// js/benchmark.js — Module Benchmark (sélection comparables CH manuelle)
import { getBenchmarks, addBenchmark, deleteBenchmark, updateBenchmark } from './db.js';
import { buildAS24chSearchUrl } from './db.js';
import { fmt, normFuel } from './compute.js';
import { MODELS, FLAGS } from './config.js';

let _benchmarks = [];
let _filters = {
  brand:      '',
  modelSlug:  '',
  yearMin:    null,
  yearMax:    null,
  kmMax:      null,
  fuelType:   '',
};
let _selectedIds = new Set();
let _contextOpportunity = null;  // listing actuellement analysé (si arrivé depuis newopp/search)

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
export async function initBenchmark() {
  // Lire le contexte depuis sessionStorage si arrivé depuis une opportunité
  const ctx = sessionStorage.getItem('karz_benchmark_context');
  if (ctx) {
    try {
      _contextOpportunity = JSON.parse(ctx);
      // Pré-remplir les filtres (élargi : pas trop strict)
      _filters.brand     = _contextOpportunity.brand || '';
      _filters.modelSlug = _contextOpportunity.model_slug || '';
      // Pas de filtre année/km par défaut (élargi)
    } catch(e) {}
  }
  
  await _loadBenchmarks();
  _renderUI();
}

async function _loadBenchmarks() {
  // Charger TOUS les benchmarks (filtrage côté client pour réactivité)
  _benchmarks = await getBenchmarks({});
}

// ══════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════
function _renderUI() {
  const container = document.getElementById('benchmark-content');
  if (!container) return;

  const porscheOpts = MODELS.porsche.map(m =>
    `<option value="${m.slug}" ${_filters.modelSlug === m.slug ? 'selected' : ''}>${m.label}</option>`).join('');
  const lrOpts = MODELS.landrover.map(m =>
    `<option value="${m.slug}" ${_filters.modelSlug === m.slug ? 'selected' : ''}>${m.label}</option>`).join('');

  const ctxBanner = _contextOpportunity ? `
    <div class="bench-context-banner">
      <span>📌 Sélection pour : <b>${_contextOpportunity.brand} ${_contextOpportunity.model_full || _contextOpportunity.model_slug || ''} ${_contextOpportunity.year || ''}</b> · ${_contextOpportunity.km ? fmt(_contextOpportunity.km) + ' km' : ''}</span>
      <button class="btn btn-g" id="bench-validate">✓ Valider la sélection (${_selectedIds.size})</button>
      <button class="btn" id="bench-cancel">Annuler</button>
    </div>` : '';

  container.innerHTML = `
    <div class="bench-header">
      <h2>Benchmark CH</h2>
      <span class="bench-count">${_benchmarks.length} comparables stockés</span>
    </div>
    
    ${ctxBanner}
    
    <div class="bench-actions-row">
      <button class="btn btn-g" id="bench-import-btn">+ Importer URL AS24.ch</button>
      <a class="btn-as24-ch" id="bench-search-link" target="_blank">🇨🇭 Rechercher sur AS24.ch</a>
    </div>
    
    <div class="bench-filters">
      <div class="fg">
        <label>Marque</label>
        <select id="bench-brand">
          <option value="">Toutes</option>
          <option value="Porsche" ${_filters.brand === 'Porsche' ? 'selected' : ''}>Porsche</option>
          <option value="Land Rover" ${_filters.brand === 'Land Rover' ? 'selected' : ''}>Land Rover</option>
        </select>
      </div>
      <div class="fg">
        <label>Modèle</label>
        <select id="bench-model">
          <option value="">Tous</option>
          <optgroup label="Porsche">${porscheOpts}</optgroup>
          <optgroup label="Land Rover">${lrOpts}</optgroup>
        </select>
      </div>
      <div class="fg"><label>Année min</label><input type="number" id="bench-ymin" value="${_filters.yearMin || ''}"></div>
      <div class="fg"><label>Année max</label><input type="number" id="bench-ymax" value="${_filters.yearMax || ''}"></div>
      <div class="fg"><label>Km max</label><input type="number" id="bench-kmax" value="${_filters.kmMax || ''}"></div>
      <div class="fg">
        <label>Carburant</label>
        <select id="bench-fuel">
          <option value="">Tous</option>
          <option value="diesel" ${_filters.fuelType === 'diesel' ? 'selected' : ''}>Diesel</option>
          <option value="essence" ${_filters.fuelType === 'essence' ? 'selected' : ''}>Essence</option>
          <option value="hybride" ${_filters.fuelType === 'hybride' ? 'selected' : ''}>Hybride</option>
          <option value="electrique" ${_filters.fuelType === 'electrique' ? 'selected' : ''}>Électrique</option>
        </select>
      </div>
    </div>
    
    <div class="bench-stats" id="bench-stats"></div>
    <div class="bench-list" id="bench-list"></div>
    <div id="bench-modal-container"></div>
  `;

  // Listeners
  ['bench-brand','bench-model','bench-ymin','bench-ymax','bench-kmax','bench-fuel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', _readFiltersAndRender);
    if (el && el.tagName === 'INPUT') el.addEventListener('input', _readFiltersAndRender);
  });
  document.getElementById('bench-import-btn').addEventListener('click', _showImportModal);
  
  // Update AS24.ch search link
  _updateSearchLink();
  
  if (_contextOpportunity) {
    document.getElementById('bench-validate')?.addEventListener('click', _validateSelection);
    document.getElementById('bench-cancel')?.addEventListener('click', _cancelSelection);
  }
  
  _renderList();
}

function _updateSearchLink() {
  const link = document.getElementById('bench-search-link');
  if (!link) return;
  
  const listing = _contextOpportunity || {
    brand: _filters.brand,
    model_slug: _filters.modelSlug,
    year: _filters.yearMin || _filters.yearMax,
    km: _filters.kmMax,
    fuel_type: _filters.fuelType,
  };
  link.href = buildAS24chSearchUrl(listing);
}

function _readFiltersAndRender() {
  _filters.brand     = document.getElementById('bench-brand').value;
  _filters.modelSlug = document.getElementById('bench-model').value;
  _filters.yearMin   = parseInt(document.getElementById('bench-ymin').value) || null;
  _filters.yearMax   = parseInt(document.getElementById('bench-ymax').value) || null;
  _filters.kmMax     = parseInt(document.getElementById('bench-kmax').value) || null;
  _filters.fuelType  = document.getElementById('bench-fuel').value;
  _updateSearchLink();
  _renderList();
}

function _renderList() {
  const listEl = document.getElementById('bench-list');
  const statsEl = document.getElementById('bench-stats');
  if (!listEl) return;
  
  // Filtre côté client
  let filtered = _benchmarks.filter(b => {
    if (_filters.brand && b.brand !== _filters.brand) return false;
    if (_filters.modelSlug && b.model_slug !== _filters.modelSlug) return false;
    if (_filters.yearMin && b.year < _filters.yearMin) return false;
    if (_filters.yearMax && b.year > _filters.yearMax) return false;
    if (_filters.kmMax && b.km > _filters.kmMax) return false;
    if (_filters.fuelType && b.fuel_type !== _filters.fuelType) return false;
    return true;
  });
  
  // Stats sur le filtre actuel
  const prices = filtered.map(b => b.price_chf).filter(p => p > 0).sort((a,b) => a-b);
  const selectedFromFilter = filtered.filter(b => _selectedIds.has(b.id));
  const selPrices = selectedFromFilter.map(b => b.price_chf).filter(p => p > 0).sort((a,b) => a-b);
  
  const calcStats = (arr) => {
    if (!arr.length) return null;
    const p = (pct) => {
      const k = (pct/100) * (arr.length - 1);
      const f = Math.floor(k); const c = Math.ceil(k);
      return Math.round(f === c ? arr[f] : arr[f] + (k-f)*(arr[c]-arr[f]));
    };
    return {
      n: arr.length,
      min: arr[0], max: arr[arr.length-1],
      p25: p(25), p50: p(50), p75: p(75),
      mean: Math.round(arr.reduce((s,v) => s+v, 0) / arr.length),
    };
  };
  
  const allStats = calcStats(prices);
  const selStats = calcStats(selPrices);
  
  statsEl.innerHTML = `
    <div class="bench-stats-grid">
      <div class="bench-stat-block">
        <div class="bench-stat-l">Filtre actuel — ${prices.length} annonces</div>
        ${allStats ? `
          <div class="bench-stat-row">
            <span>P25 : <b>CHF ${fmt(allStats.p25)}</b></span>
            <span>Médiane : <b>CHF ${fmt(allStats.p50)}</b></span>
            <span>P75 : <b>CHF ${fmt(allStats.p75)}</b></span>
          </div>` : '<div class="bench-stat-row no-data">—</div>'}
      </div>
      <div class="bench-stat-block ${_selectedIds.size > 0 ? 'highlight' : ''}">
        <div class="bench-stat-l">Sélection actuelle — ${selPrices.length} cochés</div>
        ${selStats ? `
          <div class="bench-stat-row">
            <span>P25 : <b>CHF ${fmt(selStats.p25)}</b> ⭐</span>
            <span>Médiane : <b>CHF ${fmt(selStats.p50)}</b></span>
            <span>P75 : <b>CHF ${fmt(selStats.p75)}</b></span>
          </div>` : '<div class="bench-stat-row no-data">Cochez des comparables pour calculer</div>'}
      </div>
    </div>`;
  
  if (!filtered.length) {
    listEl.innerHTML = '<div class="no-data">Aucun benchmark pour ce filtre. Cliquez "+ Importer URL AS24.ch" pour en ajouter.</div>';
    return;
  }
  
  listEl.innerHTML = filtered.map(b => _renderBenchmarkRow(b)).join('');
  
  // Listeners
  filtered.forEach(b => {
    const cb = document.getElementById(`bench-cb-${b.id}`);
    if (cb) cb.addEventListener('change', () => _toggleSelection(b.id));
    document.getElementById(`bench-del-${b.id}`)?.addEventListener('click', () => _confirmDelete(b));
  });
}

function _renderBenchmarkRow(b) {
  const checked = _selectedIds.has(b.id) ? 'checked' : '';
  const flag = '🇨🇭';
  
  return `
    <div class="bench-row ${checked ? 'selected' : ''}">
      <input type="checkbox" id="bench-cb-${b.id}" ${checked} class="bench-cb">
      <span class="bench-flag">${flag}</span>
      <div class="bench-info">
        <div class="bench-name">${b.brand} ${b.model_full || b.version || b.model_slug} ${b.year || ''}</div>
        <div class="bench-meta">
          ${b.km ? fmt(b.km) + ' km' : '—'} ·
          ${b.fuel_type || '—'} ·
          ${b.seller_name || '—'}
          ${b.city ? ' · ' + b.city : ''}
        </div>
      </div>
      <div class="bench-price">CHF ${fmt(b.price_chf)}</div>
      <a class="bench-link" href="${b.listing_url}" target="_blank" title="Voir sur AS24.ch">↗</a>
      <button class="btn-sm btn-red" id="bench-del-${b.id}" title="Supprimer">✕</button>
    </div>`;
}

function _toggleSelection(id) {
  if (_selectedIds.has(id)) _selectedIds.delete(id);
  else _selectedIds.add(id);
  _renderList();
  // Update validate button
  const btn = document.getElementById('bench-validate');
  if (btn) btn.textContent = `✓ Valider la sélection (${_selectedIds.size})`;
}

// ══════════════════════════════════════════════════════════════
// IMPORT URL AS24.ch
// ══════════════════════════════════════════════════════════════
function _showImportModal() {
  const modal = document.getElementById('bench-modal-container');
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal modal-wide">
        <div class="modal-title">Importer un benchmark depuis AS24.ch</div>
        
        <div class="bench-import-section">
          <label>URL de l'annonce AS24.ch</label>
          <div class="newopp-url-row">
            <input type="url" id="bench-url" placeholder="https://www.autoscout24.ch/de/d/..." style="flex:1">
            <button class="btn btn-g" id="bench-fetch">🔍 Auto-import</button>
          </div>
          <div id="bench-fetch-status" class="newopp-status"></div>
        </div>
        
        <div class="bench-manual-form" id="bench-manual-form">
          <p class="newopp-help">Si l'auto-import échoue, remplissez manuellement :</p>
          <div class="newopp-grid">
            <div class="newopp-fg">
              <label>Marque</label>
              <select id="bm-brand">
                <option value="">—</option>
                <option value="Porsche">Porsche</option>
                <option value="Land Rover">Land Rover</option>
              </select>
            </div>
            <div class="newopp-fg">
              <label>Modèle (slug)</label>
              <input id="bm-model" placeholder="cayenne, defender-110…">
            </div>
            <div class="newopp-fg">
              <label>Version / Finition</label>
              <input id="bm-version" placeholder="Cayenne Turbo">
            </div>
            <div class="newopp-fg"><label>Année</label><input type="number" id="bm-year" placeholder="2022"></div>
            <div class="newopp-fg"><label>Km</label><input type="number" id="bm-km" placeholder="50000"></div>
            <div class="newopp-fg">
              <label>Carburant</label>
              <select id="bm-fuel">
                <option value="">—</option>
                <option value="essence">Essence</option>
                <option value="diesel">Diesel</option>
                <option value="hybride">Hybride</option>
                <option value="electrique">Électrique</option>
              </select>
            </div>
            <div class="newopp-fg"><label>Prix CHF</label><input type="number" id="bm-price" placeholder="65000" required></div>
            <div class="newopp-fg"><label>Ville (optionnel)</label><input id="bm-city" placeholder="Zürich"></div>
            <div class="newopp-fg" style="grid-column:span 2"><label>Vendeur</label><input id="bm-seller" placeholder="Garage Schmid"></div>
          </div>
        </div>
        
        <div class="modal-actions">
          <button class="btn btn-g" id="bench-save">+ Ajouter au benchmark</button>
          <button class="btn" id="bench-cancel-modal">Annuler</button>
        </div>
      </div>
    </div>`;
  
  document.getElementById('bench-fetch').addEventListener('click', _handleFetch);
  document.getElementById('bench-save').addEventListener('click', _handleSave);
  document.getElementById('bench-cancel-modal').addEventListener('click', () => modal.innerHTML = '');
}

async function _handleFetch() {
  const url = document.getElementById('bench-url').value.trim();
  const status = document.getElementById('bench-fetch-status');
  if (!url) {
    status.innerHTML = '<span class="warn">Saisissez une URL</span>';
    return;
  }
  status.innerHTML = '<span class="loading">⏳ Tentative auto-import…</span>';
  
  try {
    const res = await fetch('/api/fetch-listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    
    if (data.success && data.listing) {
      _fillManualForm(data.listing);
      status.innerHTML = '<span class="ok">✓ Données extraites — vérifiez puis ajoutez</span>';
    } else {
      status.innerHTML = `<span class="warn">⚠ ${data.error || 'AS24.ch bloque le serveur'} — utilisez le bookmarklet ou remplissez manuellement</span>`;
    }
  } catch(e) {
    status.innerHTML = `<span class="warn">⚠ Erreur — remplissez manuellement</span>`;
  }
}

function _fillManualForm(listing) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== null && val !== undefined && val !== '') el.value = val;
  };
  setVal('bm-brand',   listing.brand);
  setVal('bm-model',   listing.model_slug);
  setVal('bm-version', listing.version || listing.model_full);
  setVal('bm-year',    listing.year);
  setVal('bm-km',      listing.km);
  setVal('bm-fuel',    listing.fuel_type);
  setVal('bm-price',   listing.price_chf || listing.price_chf_ttc);
  setVal('bm-city',    listing.city);
  setVal('bm-seller',  listing.seller_name);
}

async function _handleSave() {
  const url = document.getElementById('bench-url').value.trim();
  const benchmark = {
    listing_url:  url,
    brand:        document.getElementById('bm-brand').value,
    model_slug:   document.getElementById('bm-model').value,
    version:      document.getElementById('bm-version').value || null,
    model_full:   document.getElementById('bm-version').value || document.getElementById('bm-model').value,
    year:         parseInt(document.getElementById('bm-year').value) || null,
    km:           parseInt(document.getElementById('bm-km').value) || null,
    fuel_type:    document.getElementById('bm-fuel').value || null,
    price_chf:    parseInt(document.getElementById('bm-price').value) || null,
    city:         document.getElementById('bm-city').value || null,
    seller_name:  document.getElementById('bm-seller').value || null,
    is_active:    true,
  };
  
  if (!benchmark.listing_url || !benchmark.price_chf || !benchmark.brand || !benchmark.model_slug) {
    alert('URL, marque, modèle et prix sont obligatoires.');
    return;
  }
  
  const result = await addBenchmark(benchmark);
  if (result) {
    document.getElementById('bench-modal-container').innerHTML = '';
    await _loadBenchmarks();
    _renderUI();
  } else {
    alert('Erreur lors de l\'ajout. Vérifiez la table benchmarks dans Supabase.');
  }
}

// ══════════════════════════════════════════════════════════════
// VALIDATION (retour à l'opportunité avec prix sélectionné)
// ══════════════════════════════════════════════════════════════
function _validateSelection() {
  const selected = _benchmarks.filter(b => _selectedIds.has(b.id));
  if (!selected.length) {
    if (!confirm('Aucun benchmark sélectionné. Continuer sans sélection ?')) return;
  }
  
  // Stocker la sélection pour récupération côté newopp/search
  sessionStorage.setItem('karz_benchmark_selection', JSON.stringify(selected));
  sessionStorage.removeItem('karz_benchmark_context');
  
  // Retour à la page d'origine
  const returnPage = sessionStorage.getItem('karz_benchmark_return') || 'newopp';
  sessionStorage.removeItem('karz_benchmark_return');
  
  if (window.KARZ?.showPage) {
    window.KARZ.showPage(returnPage);
  }
}

function _cancelSelection() {
  sessionStorage.removeItem('karz_benchmark_context');
  sessionStorage.removeItem('karz_benchmark_return');
  _selectedIds.clear();
  _contextOpportunity = null;
  
  const returnPage = sessionStorage.getItem('karz_benchmark_return_cancel') || 'newopp';
  if (window.KARZ?.showPage) {
    window.KARZ.showPage(returnPage);
  }
}

function _confirmDelete(b) {
  if (!confirm(`Supprimer ce benchmark ?\n${b.brand} ${b.model_slug} ${b.year} CHF ${fmt(b.price_chf)}`)) return;
  deleteBenchmark(b.id).then(() => {
    _loadBenchmarks().then(() => _renderUI());
  });
}

// ══════════════════════════════════════════════════════════════
// API publique pour autres modules
// ══════════════════════════════════════════════════════════════
// Appelé depuis newopp/search/pipeline pour démarrer la sélection
export function startSelectionForOpportunity(listing, returnPage = 'newopp') {
  sessionStorage.setItem('karz_benchmark_context', JSON.stringify(listing));
  sessionStorage.setItem('karz_benchmark_return', returnPage);
  sessionStorage.setItem('karz_benchmark_return_cancel', returnPage);
  if (window.KARZ?.showPage) {
    window.KARZ.showPage('benchmark');
  }
}

// Récupérer la sélection après validation (à appeler depuis newopp/search au retour)
export function consumeSelection() {
  const raw = sessionStorage.getItem('karz_benchmark_selection');
  if (!raw) return null;
  sessionStorage.removeItem('karz_benchmark_selection');
  try { return JSON.parse(raw); } catch(e) { return null; }
}
