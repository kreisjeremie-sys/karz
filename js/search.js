// KARZ v10 — search.js
// Refactor : utilise js/compute.js pour calculs + rendu (centralisé)
// ══════════════════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { getListingsEU, getListingsEUMeta } from './db.js';
import { FLAGS, COUNTRY_NAMES, MODELS } from './config.js';
import { computeListing, normFuel, normFuelLabel, fmt, renderLandedHTML, renderResaleHTML, renderMargeHTML } from './compute.js';

let _rendered = false;

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

function _escJson(obj) {
  return JSON.stringify(JSON.stringify(obj)).slice(1, -1);
}

export async function runSearch() {
  const listEl = document.getElementById('search-results');
  const countEl= document.getElementById('search-count');
  if (!listEl) return;

  const f = _readFilters();
  if (!f.countries.length) {
    listEl.innerHTML = '<div class="no-data">Sélectionnez au moins un pays.</div>';
    return;
  }

  listEl.innerHTML = '<div class="loading">Chargement des annonces…</div>';

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

  // Calcul async via compute.js (centralisé)
  const results = await Promise.all(raw.map(listing => computeListing(listing)));

  // Filtres côté client
  let filtered = results;
  if (f.fuelType) {
    filtered = filtered.filter(r => normFuel(r.listing.fuel_type) === f.fuelType);
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

  listEl.innerHTML = '';
  filtered.forEach((r, i) => listEl.appendChild(_renderCard(r, i)));
}

function _renderCard(result, idx) {
  const { listing, marge, margeBlocked, priceTTC, as24chUrl } = result;
  const flag = FLAGS[listing.country] || '🌍';
  const margeNum = (marge !== null && marge !== undefined && !isNaN(marge)) ? Math.round(marge) : null;
  const margeCls = margeNum === null ? '' : margeNum >= 0 ? 'profit' : 'loss';
  const isQuasiNeuf = listing.year >= 2025 && (listing.km || 0) < 10000;

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
          ${normFuelLabel(listing.fuel_type)} ·
          ${listing.seller_type === 'pro' ? '<span class="badge bpro">Pro</span>' : '<span class="badge bpriv">Particulier</span>'}
          ${isQuasiNeuf ? '<span class="badge" style="background:#FEE2E2;color:#991B1B;margin-left:4px">Quasi-neuf</span>' : ''}
          ${listing.seller_name && listing.seller_name !== '—' ? ' · ' + listing.seller_name : ''}
          ${listing.days_online ? ' · ' + listing.days_online + 'j' : ''}
        </div>
      </div>
      <div class="rc-right">
        <div class="rc-price">€${fmt(priceTTC)} <span class="rc-ttc">TTC</span></div>
        <div class="rc-marge-preview ${margeCls}">
          ${margeBlocked
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
      ${renderLandedHTML(result)}
      ${renderResaleHTML(result)}
      ${renderMargeHTML(result)}
      <div class="rc-actions">
        <a class="btn-as24-ch" href="${as24chUrl}" target="_blank" onclick="event.stopPropagation()">
          🇨🇭 Voir le marché CH (AS24.ch)
        </a>
        <button class="btn-add-pipeline" data-listing="${_escJson(listing)}">+ Ajouter au pipeline</button>
      </div>
    </div>`;

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
