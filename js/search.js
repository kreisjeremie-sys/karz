// KARZ v10 — search.js — Onglet RECHERCHE
// Lit uniquement Supabase (base locale).
// Aucun scrape on-demand ici — les scrapes sont dans admin.js.
// ═══════════════════════════════════════════════════════════════

import { getState, setState, setNestedState } from './state.js';
import { getListingsEU, getListingsEUMeta } from './db.js';
import { computeDeal, computeDealAsync } from './calc.js';
import { FLAGS, COUNTRY_NAMES, MODELS } from './config.js';

let _rendered = false;

export async function initSearch() {
  const filtersEl = document.getElementById('search-filters');
  if (_rendered && filtersEl && filtersEl.children.length > 0) return;
  _rendered = true;
  _buildFilters();
  await _loadMeta();
  await _runSearch();
}

export async function refreshSearch() {
  await _loadMeta();
  await _runSearch();
}

// ── STATUT BASE ───────────────────────────────────────────────
async function _loadMeta() {
  const meta = await getListingsEUMeta();
  setState({ euMeta: meta }, true);
  const el = document.getElementById('search-status');
  if (!el) return;
  const d = meta.lastUpdate ? new Date(meta.lastUpdate).toLocaleDateString('fr-CH', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  el.innerHTML = `
    <span class="status-dot ok"></span>
    <b>${(meta.totalActive || 0).toLocaleString('fr-CH')}</b> annonces actives en base ·
    Dernier scrape : <b>${d}</b>
  `;
}

// ── FILTRES ───────────────────────────────────────────────────
function _buildFilters() {
  const container = document.getElementById('search-filters');
  if (!container) return;

  // Options modèles par marque
  const porscheOpts = MODELS.porsche.map(m => `<option value="${m.slug}">${m.label}</option>`).join('');
  const lrOpts      = MODELS.landrover.map(m => `<option value="${m.slug}">${m.label}</option>`).join('');

  container.innerHTML = `
    <div class="filter-grid">
      <div class="fg">
        <label>Marque</label>
        <select id="f-brand" onchange="window.KARZ.search.onBrandChange()">
          <option value="">Toutes</option>
          <option value="porsche">Porsche</option>
          <option value="land-rover">Land Rover</option>
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
      <div class="fg"><label>Année min</label><input type="number" id="f-ymin" placeholder="2019" min="2015" max="2025"></div>
      <div class="fg"><label>Année max</label><input type="number" id="f-ymax" placeholder="2024" min="2015" max="2025"></div>
      <div class="fg"><label>Km max</label><input type="number" id="f-kmax" placeholder="80000"></div>
      <div class="fg"><label>Prix max (EUR)</label><input type="number" id="f-pmax" placeholder="200000"></div>
      <div class="fg"><label>Marge min (CHF)</label><input type="number" id="f-mmin" placeholder="5000"></div>
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
      <span id="search-count" style="font-size:11px;color:var(--color-text-tertiary)"></span>
    </div>
  `;
}

export function onBrandChange() {
  const brand = document.getElementById('f-brand')?.value;
  const modelSel = document.getElementById('f-model');
  if (!modelSel) return;

  const filteredModels = brand === 'porsche' ? MODELS.porsche
    : brand === 'land-rover' ? MODELS.landrover
    : [...MODELS.porsche, ...MODELS.landrover];

  modelSel.innerHTML = '<option value="">Tous</option>' +
    filteredModels.map(m => `<option value="${m.slug}">${m.label}</option>`).join('');
}

export function resetFilters() {
  ['f-brand','f-model','f-fuel','f-seller'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['f-ymin','f-ymax','f-kmax','f-pmax','f-mmin'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.querySelectorAll('#f-countries input[type=checkbox]').forEach(cb => cb.checked = true);
  runSearch();
}

// ── RECHERCHE ─────────────────────────────────────────────────
export async function runSearch() {
  const state   = getState();
  const countEl = document.getElementById('search-count');
  const listEl  = document.getElementById('search-results');
  if (!listEl) return;

  // Lire les filtres
  const brand    = document.getElementById('f-brand')?.value  || '';
  const modelSlug= document.getElementById('f-model')?.value  || '';
  const yearMin  = parseInt(document.getElementById('f-ymin')?.value)  || null;
  const yearMax  = parseInt(document.getElementById('f-ymax')?.value)  || null;
  const kmMax    = parseInt(document.getElementById('f-kmax')?.value)  || null;
  const priceMax = parseInt(document.getElementById('f-pmax')?.value)  || null;
  const margeMin = parseInt(document.getElementById('f-mmin')?.value)  || 0;
  const fuelType = document.getElementById('f-fuel')?.value   || '';
  const sellerT  = document.getElementById('f-seller')?.value || '';
  const countries= [...document.querySelectorAll('#f-countries input:checked')].map(cb => cb.value);

  if (!countries.length) {
    listEl.innerHTML = '<div class="no-data">Sélectionnez au moins un pays.</div>';
    return;
  }

  listEl.innerHTML = '<div class="loading">Chargement…</div>';

  // Lire Supabase
  const raw = await getListingsEU({
    brand: brand || null,
    modelSlug: modelSlug || null,
    country: countries,
    yearMin, yearMax, kmMax, priceMax,
  });

  if (!raw) {
    listEl.innerHTML = '<div class="no-data error">Erreur de connexion Supabase.</div>';
    return;
  }

  // Calcul avec comparables CH async
  const stateRef = state;
  const dbMod = window.KARZ.db;
  let results = await Promise.all(raw.map(async listing => {
    const deal = _listingToDeal(listing);
    // computeDealAsync charge les comparables CH depuis Supabase
    const calc = await window.KARZ.calc.computeDealAsync(deal, stateRef, dbMod);
    return { listing, deal, calc };
  }));

  // Filtre carburant côté client
  if (fuelType) {
    results = results.filter(r => {
      const f = (r.listing.fuel_type || '').toLowerCase();
      return f.includes(fuelType);
    });
  }

  // Filtre vendeur côté client
  if (sellerT) {
    results = results.filter(r => {
      const st = r.listing.seller_type || '';
      return sellerT === 'pro' ? (st === 'pro' || st === 'dealer') : st === 'private';
    });
  }

  // Filtre marge min (uniquement si prix revente disponible)
  if (margeMin > 0) {
    results = results.filter(r => r.calc.marge === null || r.calc.marge >= margeMin);
  }

  // Trier par marge décroissante (null en dernier)
  results.sort((a, b) => {
    if (a.calc.marge === null && b.calc.marge === null) return 0;
    if (a.calc.marge === null) return 1;
    if (b.calc.marge === null) return -1;
    return b.calc.marge - a.calc.marge;
  });

  if (countEl) countEl.textContent = `${results.length} résultat${results.length !== 1 ? 's' : ''}`;

  if (!results.length) {
    listEl.innerHTML = '<div class="no-data">Aucun résultat pour ces filtres.</div>';
    return;
  }

  listEl.innerHTML = '';
  results.forEach((r, i) => {
    listEl.appendChild(_renderResultCard(r, i));
  });
}

// ── HELPERS ───────────────────────────────────────────────────
function _listingToDeal(listing) {
  return {
    brand: _normalizeBrand(listing.brand),
    model: listing.model_full || listing.model_slug,
    year:  listing.year,
    km:    listing.km,
    price_eur_ttc: listing.price_eur_ttc,
    seller_type: listing.seller_type,
    country: listing.country,
    first_reg_date: listing.first_reg_date || null,
    fuel_type: listing.fuel_type,
  };
}

function _normalizeBrand(b) {
  if (!b) return '';
  const l = b.toLowerCase();
  if (l === 'porsche')   return 'Porsche';
  if (l.includes('land')) return 'Land Rover';
  return b;
}

function _renderResultCard(r, idx) {
  const { listing, calc } = r;
  const flag     = FLAGS[listing.country] || '🌍';
  const marge    = calc.marge;
  const margeCls = (marge && marge > 0) ? 'profit' : (marge && marge < 0) ? 'loss' : '';
  const resale   = calc.resale;

  // Badges niveau de fiabilité du prix de revente
  const levelColors = { 0:'#185FA5',1:'#0F6E56',2:'#0F6E56',3:'#854F0B',4:'#854F0B',5:'#888',99:'#cc0000' };
  const levelLabels = { 0:'Eurotax',1:'Comparables',2:'Comparables',3:'Comparables élargis',4:'Comparables élargis',5:'Dépréciation',99:'—' };

  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML = `
    <div class="rc-header">
      <div class="rc-rank">#${idx + 1}</div>
      <span class="rc-flag">${flag}</span>
      <div class="rc-info">
        <div class="rc-name">${listing.model_full || listing.brand + ' ' + listing.model_slug} ${listing.year || '—'}</div>
        <div class="rc-meta">
          ${listing.km ? listing.km.toLocaleString('fr-CH') + ' km' : '—'} ·
          ${listing.fuel_type ? listing.fuel_type : ''} ·
          ${listing.days_online ? listing.days_online + 'j' : ''} ·
          ${listing.seller_type === 'pro' ? '<span class="badge bpro">Pro</span>' : '<span class="badge bpriv">Particulier</span>'}
          ${listing.seller_name && listing.seller_name !== '—' ? '· ' + listing.seller_name : ''}
        </div>
      </div>
      <div class="rc-right">
        <div class="rc-price">€${(listing.price_eur_ttc || 0).toLocaleString('fr-CH')}</div>
        <div class="rc-marge ${margeCls}">
          ${calc.margeBlocked
            ? '<span class="warn-sm">⚠ Données insuffisantes</span>'
            : (marge !== null && marge !== undefined)
              ? `CHF ${Math.round(marge).toLocaleString('fr-CH')}`
              : '—'}
        </div>
      </div>
      ${listing.listing_url ? `<a class="rc-link" href="${listing.listing_url}" target="_blank" onclick="event.stopPropagation()">↗</a>` : ''}
    </div>

    ${resale && resale.price ? `
    <div class="rc-resale-detail">
      <div class="rc-resale-header">
        <span class="resale-level-badge" style="color:${levelColors[resale.level]||'#888'}">
          ${levelLabels[resale.level]||'—'} · ${resale.n > 0 ? resale.n + ' annonces' : 'estimation'}
        </span>
        <span class="resale-label-detail">${resale.label}</span>
        ${resale.isHypothesis ? '<span class="hyp-badge">⚠ Estimation</span>' : ''}
      </div>
      <div class="rc-resale-stats">
        <div class="rs-stat">
          <div class="rs-l">P25 <span class="rs-note">(cible)</span></div>
          <div class="rs-v primary">CHF ${(resale.p25||0).toLocaleString('fr-CH')}</div>
        </div>
        ${resale.p50 ? `<div class="rs-stat">
          <div class="rs-l">Médiane</div>
          <div class="rs-v">CHF ${resale.p50.toLocaleString('fr-CH')}</div>
        </div>` : ''}
        ${resale.mean ? `<div class="rs-stat">
          <div class="rs-l">Moyenne</div>
          <div class="rs-v">CHF ${resale.mean.toLocaleString('fr-CH')}</div>
        </div>` : ''}
        ${resale.p75 ? `<div class="rs-stat">
          <div class="rs-l">P75</div>
          <div class="rs-v">CHF ${resale.p75.toLocaleString('fr-CH')}</div>
        </div>` : ''}
      </div>
      ${resale.comparablesUrl ? `
      <a class="rc-comparables-link" href="${resale.comparablesUrl}" target="_blank">
        ↗ Voir les ${resale.n} annonces comparables sur AutoScout24.ch
      </a>` : ''}
    </div>` : `
    <div class="rc-resale-detail missing">
      ⚠ Prix de revente non disponible — saisir la cote Eurotax après ajout au pipeline
    </div>`}

    ${calc.landed?.co2?.couldBeExempt ? '<div class="rc-warn">⚠ CO2 calculé en pire cas — vérifier km &gt; 5 000</div>' : ''}
    <button class="btn-add-pipeline" onclick="window.KARZ.pipeline.addFromListing(event, ${JSON.stringify(JSON.stringify(listing)).slice(1,-1)})">
      + Ajouter au pipeline
    </button>
  `;
  return card;
}

async function _runSearch() { await runSearch(); }
