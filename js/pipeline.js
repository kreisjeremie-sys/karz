// KARZ v10 — pipeline.js — Onglet PIPELINE
// Shortlist active — 5 étapes — ajout URL/manuel — notes horodatées
// Transitions vers My Deals (accord signé) ou Lost (abandon)
// ═══════════════════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { createDeal, updateDeal, deleteDeal as dbDeleteDeal, addNote as dbAddNote, getDeals } from './db.js';
import { computeDeal } from './calc.js';
import { computeListing, renderLandedHTML, renderResaleHTML, renderMargeHTML, renderCashflowHTML, fmt } from './compute.js';
import { PIPELINE_STATUSES, FLAGS, SITE_PATTERNS, MODELS } from './config.js';

export async function initPipeline() {
  await _loadDeals();
  renderPipeline();
}

async function _loadDeals() {
  const all = await getDeals();
  setState({ deals: all }, true);
}

// ── RENDU KANBAN ──────────────────────────────────────────────
export async function renderPipeline() {
  const state      = getState();
  const container  = document.getElementById('pipeline-board');
  if (!container) return;

  const pipelineDeals = state.deals.filter(d => d.status === 'pipeline');

  container.innerHTML = '<div class="loading">Calcul des deals…</div>';
  
  // Pré-calculer chaque deal en async (utilise compute.js)
  const dealsWithCalc = await Promise.all(pipelineDeals.map(async deal => {
    // Convertir deal pipeline vers format listing pour compute.js
    const listing = _dealToListing(deal);
    const result = await computeListing(listing);
    return { deal, result };
  }));
  
  container.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'kanban-board';

  PIPELINE_STATUSES.forEach(status => {
    const col   = document.createElement('div');
    col.className = 'kanban-col';
    const colDeals = dealsWithCalc.filter(({deal}) => (deal.pipeline_status || 'watchlist') === status.id);

    col.innerHTML = `
      <div class="kanban-col-header" style="color:${status.color}">
        <span>${status.label}</span>
        <span class="kanban-count">${colDeals.length}</span>
      </div>
    `;

    colDeals.forEach(({deal, result}) => {
      col.appendChild(_renderPipelineCard(deal, result, status));
    });

    board.appendChild(col);
  });

  container.appendChild(board);

  // Bouton ajout manuel
  const addBtn = document.getElementById('pipeline-add-btn');
  if (addBtn) addBtn.style.display = 'block';
}

// Convertir deal pipeline (format DB) vers format listing (compute.js)
function _dealToListing(deal) {
  // deal.model peut être un label ('Cayenne S') ou un slug ('cayenne-s')
  // Trouver le slug correspondant
  let model_slug = deal.model_slug;
  if (!model_slug && deal.model) {
    const allModels = [...MODELS.porsche, ...MODELS.landrover];
    const found = allModels.find(m => m.label === deal.model || m.slug === deal.model);
    model_slug = found ? found.slug : (deal.model || '').toLowerCase().replace(/\s+/g, '-');
  }
  return {
    listing_url:    deal.listing_url,
    brand:          deal.brand,
    model_slug:     model_slug,
    model_full:     deal.model_full || `${deal.brand} ${deal.model || ''}`.trim(),
    version:        deal.version || deal.model || null,
    year:           deal.year,
    km:             deal.km,
    price_eur_ttc:  deal.price_eur_ttc,
    fuel_type:      deal.fuel_type,
    seller_type:    deal.seller_type,
    seller_name:    deal.seller_name,
    country:        deal.country,
    first_reg_date: deal.first_reg_date,
  };
}

// ── CARTE PIPELINE ────────────────────────────────────────────
function _renderPipelineCard(deal, result, currentStatus) {
  const card = document.createElement('div');
  card.className = 'pipeline-card';
  card.dataset.id = deal.id;

  const flag  = FLAGS[deal.country] || '🌍';
  const marge = result.marge;
  const margeStr = marge !== null && marge !== undefined ? `CHF ${(marge >= 0 ? '+' : '') + fmt(marge)}` : '⚠ NC';

  // Boutons de transition de statut
  const transButtons = PIPELINE_STATUSES
    .filter(s => s.id !== currentStatus.id)
    .map(s => `
      <button class="status-btn" style="background:${s.bg};color:${s.color}"
        onclick="window.KARZ.pipeline.moveStatus('${deal.id}','${s.id}')">
        ${s.label}
      </button>
    `).join('');

  const notes  = deal.notes || [];
  const lastN  = notes[0] ? `<div class="last-note">${notes[0].text}</div>` : '';

  card.innerHTML = `
    <div class="pc-header" data-toggle="detail">
      <span class="pc-flag">${flag}</span>
      <div class="pc-info">
        <div class="pc-name">${deal.brand} ${deal.model || deal.model_slug || ''} ${deal.year || ''}</div>
        <div class="pc-meta">${deal.km ? deal.km.toLocaleString('fr-CH') + ' km' : '—'}</div>
      </div>
      <div class="pc-marge ${marge > 0 ? 'profit' : marge < 0 ? 'loss' : ''}">
        ${result.margeBlocked ? '⚠' : margeStr}
      </div>
      <div class="pc-chevron">▼</div>
    </div>
    ${deal.listing_url ? `<a class="pc-link" href="${deal.listing_url}" target="_blank">↗ Annonce</a>` : ''}
    <div class="pc-price">€${(deal.price_eur_ttc || 0).toLocaleString('fr-CH')}</div>
    ${lastN}
    
    <div class="pc-detail">
      ${renderLandedHTML(result)}
      ${renderCashflowHTML(result)}
      ${renderResaleHTML(result)}
      ${renderMargeHTML(result)}
      <div class="pc-detail-actions">
        <a class="btn-as24-ch" href="${result.as24chUrl}" target="_blank">🇨🇭 Voir AS24.ch</a>
      </div>
    </div>

    <div class="pc-actions">
      <div class="status-btns">${transButtons}</div>
      <div class="pc-final-btns">
        <button class="btn-mydeals" onclick="window.KARZ.pipeline.moveTo('${deal.id}','mydeals')">✓ Contrat signé → My Deals</button>
        <button class="btn-lost"    onclick="window.KARZ.pipeline.showLostModal('${deal.id}')">✕ Perdu</button>
      </div>
    </div>

    <div class="pc-notes">
      <div class="notes-list" id="notes-${deal.id}">
        ${notes.map(n => `
          <div class="note-item">
            <span class="note-author">${n.author || '—'}</span>
            <span class="note-at">${new Date(n.at).toLocaleDateString('fr-CH')}</span>
            <span class="note-text">${n.text}</span>
          </div>`).join('')}
      </div>
      <div class="note-input-row">
        <input type="text" id="note-inp-${deal.id}" placeholder="Ajouter une note…" class="note-inp"
          onkeydown="if(event.key==='Enter') window.KARZ.pipeline.addNote('${deal.id}')"/>
        <button class="btn-note" onclick="window.KARZ.pipeline.addNote('${deal.id}')">+</button>
      </div>
    </div>

    <button class="btn-delete-deal" onclick="window.KARZ.pipeline.deleteDeal('${deal.id}')">Supprimer</button>
  `;
  
  // Toggle détail au clic sur le header
  const header = card.querySelector('.pc-header');
  if (header) {
    header.addEventListener('click', e => {
      if (e.target.closest('a') || e.target.closest('button')) return;
      card.classList.toggle('expanded');
    });
  }
  
  return card;
}

// ── ACTIONS ───────────────────────────────────────────────────
export async function moveStatus(id, newStatus) {
  const updated = await updateDeal(id, { pipeline_status: newStatus });
  if (updated) {
    const state = getState();
    setState({ deals: state.deals.map(d => d.id === id ? { ...d, pipeline_status: newStatus } : d) }, true);
    await renderPipeline();
  }
}

export async function moveTo(id, newStatus) {
  // newStatus: 'mydeals' ou 'lost'
  const patch = {
    status: newStatus,
    pipeline_status: null,
    ...(newStatus === 'mydeals' ? { bought_at: new Date().toISOString() } : {}),
  };
  const updated = await updateDeal(id, patch);
  if (updated) {
    const state = getState();
    setState({ deals: state.deals.map(d => d.id === id ? { ...d, ...patch } : d) }, true);
    await renderPipeline();
    if (newStatus === 'mydeals') window.KARZ.mydeals?.refresh();
    if (newStatus === 'lost')    window.KARZ.lost?.refresh();
  }
}

export function showLostModal(dealId) {
  // Modal inline pour saisir la raison
  const { LOST_REASONS } = window.KARZ_CONFIG;
  const opts = LOST_REASONS.map((r, i) => `
    <label class="lost-reason-opt">
      <input type="radio" name="lost-reason" value="${r}" ${i === 0 ? 'checked' : ''}> ${r}
    </label>`).join('');

  const modal = document.getElementById('modal-container');
  if (!modal) return;
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-title">Raison de l'abandon</div>
        <div class="lost-reasons">${opts}</div>
        <div class="modal-note">
          <input type="text" id="lost-note" placeholder="Précisions (optionnel)">
        </div>
        <div class="modal-actions">
          <button class="btn btn-red" onclick="window.KARZ.pipeline.confirmLost('${dealId}')">Confirmer — Deal Lost</button>
          <button class="btn" onclick="document.getElementById('modal-container').innerHTML=''">Annuler</button>
        </div>
      </div>
    </div>`;
}

export async function confirmLost(dealId) {
  const reason = document.querySelector('input[name="lost-reason"]:checked')?.value || 'Autre';
  const note   = document.getElementById('lost-note')?.value || '';
  await updateDeal(dealId, {
    status: 'lost',
    pipeline_status: null,
    lost_reason: reason,
    lost_note:   note,
    lost_at:     new Date().toISOString(),
  });
  document.getElementById('modal-container').innerHTML = '';
  await initPipeline();
  window.KARZ.lost?.refresh();
}

export async function addNote(dealId) {
  const inp  = document.getElementById(`note-inp-${dealId}`);
  const text = inp?.value?.trim();
  if (!text) return;
  const state = getState();
  const updated = await dbAddNote(dealId, text, state.params.USER || '—');
  if (updated) {
    setState({ deals: state.deals.map(d => d.id === dealId ? updated : d) }, true);
    inp.value = '';
    await renderPipeline();
  }
}

export async function deleteDeal(id) {
  if (!confirm('Supprimer ce deal définitivement ?')) return;
  await dbDeleteDeal(id);
  const state = getState();
  setState({ deals: state.deals.filter(d => d.id !== id) }, true);
  await renderPipeline();
}

// ── AJOUT MANUEL VIA URL ──────────────────────────────────────
export function showAddModal() {
  const modal = document.getElementById('modal-container');
  if (!modal) return;
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal modal-wide">
        <div class="modal-title">Ajouter une opportunité</div>

        <div class="add-url-section">
          <label>URL de l'annonce (AutoScout24, Mobile.de…)</label>
          <div class="url-row">
            <input type="text" id="add-url-inp" placeholder="https://www.autoscout24.de/angebote/..." class="url-inp">
            <button class="btn btn-b" onclick="window.KARZ.pipeline.fetchFromUrl()">↗ Charger</button>
          </div>
          <div id="url-status" style="font-size:11px;margin-top:4px"></div>
        </div>

        <div id="add-form" class="add-form">
          ${_buildAddForm()}
        </div>

        <div id="add-calc-preview" class="calc-preview-modal" style="display:none"></div>

        <div class="modal-actions">
          <button class="btn btn-g" onclick="window.KARZ.pipeline.confirmAdd()">+ Ajouter au pipeline</button>
          <button class="btn" onclick="document.getElementById('modal-container').innerHTML=''">Annuler</button>
          <span id="add-result" style="font-size:11px"></span>
        </div>
      </div>
    </div>`;
}

function _buildAddForm() {
  const { MODELS, FLAGS, COUNTRY_NAMES } = window.KARZ_CONFIG;
  const porscheOpts  = MODELS.porsche.map(m    => `<option value="${m.label}">${m.label}</option>`).join('');
  const lrOpts       = MODELS.landrover.map(m  => `<option value="${m.label}">${m.label}</option>`).join('');
  const countryOpts  = ['DE','FR','BE','ES','NL','AT','PT','UK'].map(c =>
    `<option value="${c}">${FLAGS[c]} ${COUNTRY_NAMES[c]}</option>`).join('');

  return `
    <div class="form-grid-modal">
      <div class="fg"><label>Marque</label>
        <select id="af-brand" onchange="window.KARZ.pipeline.onAddBrandChange()">
          <option value="">—</option>
          <option value="Porsche">Porsche</option>
          <option value="Land Rover">Land Rover</option>
        </select>
      </div>
      <div class="fg"><label>Modèle</label>
        <select id="af-model" onchange="window.KARZ.pipeline.calcAddPreview()">
          <option value="">—</option>
          <optgroup label="Porsche">${porscheOpts}</optgroup>
          <optgroup label="Land Rover">${lrOpts}</optgroup>
        </select>
      </div>
      <div class="fg"><label>Année</label><input type="number" id="af-year" placeholder="2022" oninput="window.KARZ.pipeline.calcAddPreview()"></div>
      <div class="fg"><label>Km</label><input type="number" id="af-km" placeholder="45000" oninput="window.KARZ.pipeline.calcAddPreview()"></div>
      <div class="fg"><label>Prix EUR TTC</label><input type="number" id="af-price" placeholder="85000" oninput="window.KARZ.pipeline.calcAddPreview()"></div>
      <div class="fg"><label>Pays</label><select id="af-country">${countryOpts}</select></div>
      <div class="fg"><label>Vendeur</label>
        <select id="af-sellertype">
          <option value="pro">Pro / Dealer</option>
          <option value="private">Particulier</option>
        </select>
      </div>
      <div class="fg"><label>Nom vendeur</label><input type="text" id="af-sellername" placeholder="Porsche Zentrum Berlin"></div>
      <div class="fg"><label>Date 1ère immat.</label><input type="date" id="af-firstreg"></div>
      <div class="fg"><label>Carburant</label>
        <select id="af-fuel">
          <option value="diesel">Diesel</option>
          <option value="essence">Essence</option>
          <option value="hybride">Hybride</option>
          <option value="electrique">Électrique</option>
        </select>
      </div>
      <div class="fg full"><label>URL annonce</label><input type="text" id="af-url" placeholder="https://…"></div>
      <div class="fg"><label>MSRP neuf CHF (optionnel)</label><input type="number" id="af-msrp" placeholder="Pré-rempli si connu"></div>
      <div class="fg"><label>Cote Eurotax CHF (optionnel)</label><input type="number" id="af-eurotax"></div>
    </div>
    <div id="af-missing" class="missing-fields" style="display:none"></div>
  `;
}

export function onAddBrandChange() {
  const brand  = document.getElementById('af-brand')?.value;
  const sel    = document.getElementById('af-model');
  if (!sel) return;
  const { MODELS } = window.KARZ_CONFIG;
  const opts = brand === 'Porsche' ? MODELS.porsche
    : brand === 'Land Rover' ? MODELS.landrover
    : [...MODELS.porsche, ...MODELS.landrover];
  sel.innerHTML = '<option value="">—</option>' + opts.map(m => `<option value="${m.label}">${m.label}</option>`).join('');
  calcAddPreview();
}

export function calcAddPreview() {
  const state    = getState();
  const brand    = document.getElementById('af-brand')?.value;
  const model    = document.getElementById('af-model')?.value;
  const year     = parseInt(document.getElementById('af-year')?.value);
  const km       = parseInt(document.getElementById('af-km')?.value) || 0;
  const price    = parseFloat(document.getElementById('af-price')?.value) || 0;
  const country  = document.getElementById('af-country')?.value || 'DE';
  const sellerT  = document.getElementById('af-sellertype')?.value || 'pro';
  const firstReg = document.getElementById('af-firstreg')?.value || null;
  const eurotax  = parseFloat(document.getElementById('af-eurotax')?.value) || null;
  const prevEl   = document.getElementById('add-calc-preview');
  if (!prevEl) return;

  if (!brand || !model || !price) {
    prevEl.style.display = 'none';
    return;
  }

  const deal = { brand, model, year, km, price_eur_ttc: price, country, seller_type: sellerT, first_reg_date: firstReg, eurotax_override: eurotax };
  const calc = computeDeal(deal, state);
  if (calc.error) { prevEl.style.display = 'none'; return; }

  prevEl.style.display = 'block';
  prevEl.innerHTML = _renderCalcSummary(calc, state.params.TVA_MODE_B ? 'B' : 'A');
}

function _renderCalcSummary(calc, tvaMode) {
  const { landed, resale, marge } = calc;
  const mStr = marge !== null ? `<b style="color:${marge > 0 ? '#0F6E56' : '#cc0000'}">CHF ${marge.toLocaleString('fr-CH')}</b>` : '⚠ Benchmark CH requis';
  return `
    <div class="calc-rows">
      <div class="cr"><span>Prix HT CHF (×${calc.priceHT_CHF && calc.priceTTC_EUR ? (calc.priceHT_CHF / (calc.priceTTC_EUR * (calc.priceHT_EUR ? calc.priceHT_CHF / calc.priceHT_EUR : 1))).toFixed(4) : '—'})</span><span>CHF ${(landed.prixBase_CHF || 0).toLocaleString('fr-CH')}</span></div>
      <div class="cr"><span>Transport</span><span>+CHF ${landed.transport.toLocaleString('fr-CH')}</span></div>
      <div class="cr"><span>Impôt fédéral 4%</span><span>+CHF ${landed.autoTax.toLocaleString('fr-CH')}</span></div>
      <div class="cr"><span>Frais fixes</span><span>+CHF ${landed.fixedFees}</span></div>
      <div class="cr"><span>TVA CH 8.1% <span class="badge b${tvaMode}">${tvaMode === 'B' ? 'Récupérable' : 'Définitive'}</span></span>
        <span>${tvaMode === 'B' ? 'CHF 0 net' : '+CHF ' + landed.vatInLanded.toLocaleString('fr-CH')}</span></div>
      <div class="cr"><span>CO2 OFEN</span><span class="${landed.co2.penalty > 0 ? 'cost' : ''}">
        ${landed.co2.exempt ? 'Exempté' : landed.co2.penalty > 0 ? '+CHF ' + landed.co2.penalty.toLocaleString('fr-CH') : 'CHF 0'}
      </span></div>
      <div class="cr total"><span>= Landed NET</span><span>CHF ${landed.total.toLocaleString('fr-CH')}</span></div>
      <div class="cr"><span>Revente (${resale.label})</span><span>${resale.price ? 'CHF ' + resale.price.toLocaleString('fr-CH') : '—'}</span></div>
      <div class="cr marge"><span>MARGE NETTE ${tvaMode === 'B' ? 'HT' : 'TTC'}</span><span>${mStr}</span></div>
    </div>`;
}

// Fetch __NEXT_DATA__ via api/fetch-listing.js (gratuit, fallback formulaire)
export async function fetchFromUrl() {
  const url     = document.getElementById('add-url-inp')?.value?.trim();
  const statusEl = document.getElementById('url-status');
  if (!url || !statusEl) return;

  // Détecter la source
  let siteInfo = null;
  for (const p of SITE_PATTERNS) {
    const m = url.match(p.re);
    if (m) {
      const cc = p.ccMap ? (p.ccMap[m[1]?.toLowerCase()] || 'DE') : p.cc;
      siteInfo = { name: p.name, cc };
      break;
    }
  }

  statusEl.innerHTML = `⟳ Tentative de chargement depuis ${siteInfo?.name || 'le site'}…`;

  try {
    const resp = await fetch('/api/fetch-listing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    if (data.success && data.listing) {
      _prefillForm(data.listing, url, siteInfo?.cc || 'DE');
      statusEl.innerHTML = `<span style="color:#0F6E56">✓ Formulaire pré-rempli depuis ${siteInfo?.name}</span>`;
    } else {
      throw new Error(data.error || 'Données non extraites');
    }
  } catch(e) {
    statusEl.innerHTML = `<span style="color:#854F0B">⚠ Chargement auto échoué (${e.message}) — remplissez le formulaire manuellement.</span>`;
    // Le formulaire reste disponible pour saisie manuelle
    if (siteInfo?.cc) {
      const el = document.getElementById('af-country'); if (el) el.value = siteInfo.cc;
    }
    if (url) {
      const el = document.getElementById('af-url'); if (el) el.value = url;
    }
  }
  calcAddPreview();
}

function _prefillForm(listing, url, cc) {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
  setVal('af-brand',      listing.brand);
  setVal('af-model',      listing.model);
  setVal('af-year',       listing.year);
  setVal('af-km',         listing.km);
  setVal('af-price',      listing.price_eur_ttc);
  setVal('af-country',    listing.country || cc);
  setVal('af-sellertype', listing.seller_type);
  setVal('af-sellername', listing.seller_name);
  setVal('af-firstreg',   listing.first_reg_date);
  setVal('af-fuel',       listing.fuel_type);
  setVal('af-url',        url);

  // Signaler les champs manquants
  const missing = [];
  if (!listing.km)    missing.push('km');
  if (!listing.year)  missing.push('année');
  if (!listing.model) missing.push('modèle');
  const misEl = document.getElementById('af-missing');
  if (misEl && missing.length) {
    misEl.style.display = 'block';
    misEl.innerHTML = `⚠ Champs à compléter manuellement : <b>${missing.join(', ')}</b>`;
  }
  onAddBrandChange(); // rebuild model options
}

export async function confirmAdd() {
  const brand    = document.getElementById('af-brand')?.value;
  const model    = document.getElementById('af-model')?.value;
  const year     = parseInt(document.getElementById('af-year')?.value)    || null;
  const km       = parseInt(document.getElementById('af-km')?.value)      || null;
  const price    = parseFloat(document.getElementById('af-price')?.value) || 0;
  const country  = document.getElementById('af-country')?.value  || 'DE';
  const sellerT  = document.getElementById('af-sellertype')?.value || 'pro';
  const sellerN  = document.getElementById('af-sellername')?.value || '—';
  const firstReg = document.getElementById('af-firstreg')?.value  || null;
  const fuel     = document.getElementById('af-fuel')?.value      || null;
  const url      = document.getElementById('af-url')?.value       || null;
  const msrp     = parseFloat(document.getElementById('af-msrp')?.value)    || null;
  const eurotax  = parseFloat(document.getElementById('af-eurotax')?.value) || null;

  const resultEl = document.getElementById('add-result');

  if (!brand || !model || !price) {
    if (resultEl) resultEl.textContent = '⚠ Marque, modèle et prix sont obligatoires.';
    return;
  }

  const state   = getState();
  const newDeal = {
    brand, model, year, km,
    price_eur_ttc:  price,
    country, seller_type: sellerT, seller_name: sellerN,
    first_reg_date: firstReg,
    fuel_type:      fuel,
    listing_url:    url,
    msrp_override:  msrp,
    eurotax_override: eurotax,
    status:          'pipeline',
    pipeline_status: 'watchlist',
    added_by:        state.params.USER || '—',
    source:          'manual',
    notes:           [],
  };

  const created = await createDeal(newDeal);
  if (created) {
    setState({ deals: [created, ...state.deals] }, true);
    document.getElementById('modal-container').innerHTML = '';
    await renderPipeline();
    if (resultEl) resultEl.textContent = '✓ Deal ajouté au pipeline !';
  } else {
    if (resultEl) resultEl.textContent = '✗ Erreur Supabase — réessayer.';
  }
}

export function addFromListing(event, listingJson) {
  event.stopPropagation();
  let listing;
  try {
    // listingJson peut être un string simple ou un string double-encodé
    const parsed = JSON.parse(listingJson);
    listing = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch(e) {
    console.error('addFromListing parse error:', e);
    return;
  }
  showAddModal();
  setTimeout(() => {
    _prefillForm(listing, listing.listing_url, listing.country);
    calcAddPreview();
  }, 50);
}
