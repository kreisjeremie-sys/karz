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
  const brandRaw = document.getElementById('f-brand')?.value  || '';
  // Normaliser slug → nom exact Supabase
  const brand = brandRaw === 'porsche' ? 'Porsche'
              : brandRaw === 'land-rover' ? 'Land Rover'
              : brandRaw;
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
  const fxUsed = stateRef.params?.FX || 1.05;
  let results = await Promise.all(raw.map(async listing => {
    const deal = _listingToDeal(listing);
    const calc = await window.KARZ.calc.computeDealAsync(deal, stateRef, dbMod);
    return { listing, deal, calc, fxUsed };
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
  const marge    = (calc.marge !== null && calc.marge !== undefined) ? Math.round(calc.marge) : null;
  const margeCls = marge !== null ? (marge > 0 ? 'profit' : 'loss') : '';
  const resale   = calc.resale;
  const landed   = calc.landed;
  const spec     = calc.spec;
  const tvaMode  = calc.tvaMode || 'A';

  // Niveau de confiance du benchmark
  const levelColors = {0:'#185FA5',1:'#0F6E56',2:'#0F6E56',3:'#854F0B',4:'#854F0B',5:'#888',99:'#cc0000'};
  const levelLabels = {0:'Eurotax',1:'Comparables filtrés',2:'Comparables',3:'Comparables élargis',4:'Comparables élargis',5:'Dépréciation estimée',99:'—'};

  // Section landed cost détaillée
  const vatOriginPct  = Math.round((calc.vatOrigin || 0.20) * 100);
  const vatDeduction  = calc.isPro ? Math.round((calc.priceTTC_EUR || 0) - (calc.priceHT_EUR || 0)) : 0;
  const co2           = landed?.co2;

  const landedHTML = landed ? `
    <div class="detail-section">
      <div class="ds-title">LANDED COST</div>
      <div class="ds-row"><span>Prix annonce</span><span>€${(calc.priceTTC_EUR||0).toLocaleString('fr-CH')} TTC</span></div>
      ${calc.isPro ? `
      <div class="ds-row deduct"><span>− TVA ${listing.country||'EU'} ${vatOriginPct}%</span><span>− €${vatDeduction.toLocaleString('fr-CH')}</span></div>
      <div class="ds-row bold"><span>= Prix HT</span><span>€${(calc.priceHT_EUR||0).toLocaleString('fr-CH')} HT</span></div>` : `
      <div class="ds-row note"><span>Vendeur particulier — TVA non déductible</span><span></span></div>`}
      <div class="ds-row"><span>× FX EUR/CHF ${(r.fxUsed||1.05).toFixed(4)}</span><span>= CHF ${(calc.priceHT_CHF||0).toLocaleString('fr-CH')}</span></div>
      <div class="ds-sep"></div>
      <div class="ds-row cost"><span>+ Transport</span><span>+ CHF ${(landed.transport||0).toLocaleString('fr-CH')}</span></div>
      <div class="ds-row cost"><span>+ Impôt fédéral 4% <span class="ds-src">LJAUTO</span></span><span>+ CHF ${(landed.autoTax||0).toLocaleString('fr-CH')}</span></div>
      <div class="ds-row cost"><span>+ Frais fixes <span class="ds-src">OFDF CHF 180</span></span><span>+ CHF ${(landed.fixedFees||0).toLocaleString('fr-CH')}</span></div>
      <div class="ds-row ${tvaMode==='B'?'zero':'cost'}">
        <span>+ TVA CH 8.1% <span class="ds-src">${tvaMode==='B'?'Mode B — récupérable':'Mode A — définitive'}</span></span>
        <span>${tvaMode==='B'?'CHF 0 net':'+ CHF '+(landed.vatInLanded||0).toLocaleString('fr-CH')}</span>
      </div>
      <div class="ds-row ${co2?.penalty>0?'cost':co2?.exempt?'zero':''}">
        <span>+ CO2 fédéral OFEN 2025
          ${co2?.exempt ? `<span class="ds-src ok">✓ Exempté — ${co2.reason}</span>` :
            co2?.couldBeExempt ? `<span class="ds-src warn">⚠ Pire cas — vérifier km &gt;5 000</span>` : ''}
        </span>
        <span>${co2?.penalty>0 ? '+ CHF '+(co2.penalty).toLocaleString('fr-CH') : 'CHF 0'}</span>
      </div>
      <div class="ds-sep"></div>
      <div class="ds-row total"><span>= LANDED NET</span><span>CHF ${(landed.total||0).toLocaleString('fr-CH')}</span></div>
    </div>` : '';

  // Section revente CH
  const resaleHTML = resale ? `
    <div class="detail-section">
      <div class="ds-title">REVENTE CH <span class="ds-level" style="color:${levelColors[resale.level]||'#888'}">${levelLabels[resale.level]||'—'}</span></div>
      ${resale.price ? `
      <div class="ds-note">${resale.label}</div>
      <div class="rs-stats-grid">
        <div class="rs-stat-item primary">
          <div class="rs-stat-l">P25 <span class="rs-cible">cible revente</span></div>
          <div class="rs-stat-v">CHF ${(resale.p25||0).toLocaleString('fr-CH')}</div>
        </div>
        ${resale.p50 ? `<div class="rs-stat-item"><div class="rs-stat-l">Médiane</div><div class="rs-stat-v">CHF ${resale.p50.toLocaleString('fr-CH')}</div></div>` : ''}
        ${resale.mean ? `<div class="rs-stat-item"><div class="rs-stat-l">Moyenne</div><div class="rs-stat-v">CHF ${resale.mean.toLocaleString('fr-CH')}</div></div>` : ''}
        ${resale.p75 ? `<div class="rs-stat-item"><div class="rs-stat-l">P75</div><div class="rs-stat-v">CHF ${resale.p75.toLocaleString('fr-CH')}</div></div>` : ''}
      </div>
      ${resale.isHypothesis ? `<div class="ds-note warn">⚠ Estimation — données CH insuffisantes pour ce profil</div>` : ''}
      ${resale.comparablesUrl ? `<a class="rc-comparables-link" href="${resale.comparablesUrl}" target="_blank">↗ Voir les ${resale.n} annonces comparables sur AutoScout24.ch</a>` : ''}
      ` : `<div class="ds-note warn">⚠ Benchmark CH indisponible — saisir la cote Eurotax après ajout au pipeline</div>`}
    </div>` : '';

  // Marge finale
  const margeHTML = `
    <div class="detail-marge ${margeCls}">
      <span>MARGE ${tvaMode==='B'?'NETTE HT (Mode B)':'NETTE TTC (Mode A)'}</span>
      <span class="marge-val">${
        calc.margeBlocked ? '⚠ Benchmark indisponible' :
        marge !== null ? 'CHF '+(marge>=0?'+':'')+marge.toLocaleString('fr-CH') : '—'
      }</span>
    </div>`;

  const card = document.createElement('div');
  card.className = 'result-card';
  card.style.cursor = 'pointer';

  card.innerHTML = `
    <div class="rc-header">
      <div class="rc-rank">#${idx+1}</div>
      <span class="rc-flag">${flag}</span>
      <div class="rc-info">
        <div class="rc-name">${listing.model_full||listing.brand+' '+listing.model_slug} ${listing.year||'—'}</div>
        <div class="rc-meta">
          ${listing.km ? listing.km.toLocaleString('fr-CH')+' km' : '—'} ·
          ${listing.fuel_type||'—'} ·
          ${listing.seller_type==='pro'?'<span class="badge bpro">Pro</span>':'<span class="badge bpriv">Particulier</span>'}
          ${listing.seller_name&&listing.seller_name!=='—'?' · '+listing.seller_name:''}
        </div>
      </div>
      <div class="rc-right">
        <div class="rc-price">€${(listing.price_eur_ttc||0).toLocaleString('fr-CH')} <span class="rc-ttc">TTC</span></div>
        <div class="rc-marge-preview ${margeCls}">
          ${calc.margeBlocked ? '<span class="warn-sm">⚠ Benchmark indisponible</span>' :
            marge !== null ? 'CHF '+(marge>=0?'+':'')+marge.toLocaleString('fr-CH') : '—'}
        </div>
      </div>
      <div class="rc-chevron">▼</div>
      ${listing.listing_url?`<a class="rc-link" href="${listing.listing_url}" target="_blank" onclick="event.stopPropagation()">↗</a>`:''}
    </div>

    <div class="rc-detail">
      ${landedHTML}
      ${resaleHTML}
      ${margeHTML}
      <div class="rc-actions">
        <button class="btn-add-pipeline" onclick="event.stopPropagation();window.KARZ.pipeline.addFromListing(event,${JSON.stringify(JSON.stringify(listing)).slice(1,-1)})">
          + Ajouter au pipeline
        </button>
      </div>
    </div>
  `;
  // Event listener pour le toggle — plus fiable que onclick inline
  card.querySelector('.rc-header').addEventListener('click', function(e) {
    if (e.target.closest('a') || e.target.closest('button')) return;
    card.classList.toggle('expanded');
  });
  return card;
}

async function _runSearch() { await runSearch(); }
