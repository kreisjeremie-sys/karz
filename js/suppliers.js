// js/suppliers.js — Module CRM Fournisseurs
import { FLAGS, COUNTRY_NAMES } from './config.js';

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';

let _suppliers = [];
let _filterCountry = '';
let _searchTerm = '';

// ══════════════════════════════════════════════════════════════
// API Supabase
// ══════════════════════════════════════════════════════════════
async function _sbFetch(path, opts = {}) {
  const headers = window.SB_KEY ? {
    apikey: window.SB_KEY,
    Authorization: `Bearer ${window.SB_KEY}`,
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  } : {};
  const r = await fetch(`${SB_URL}/rest/v1${path}`, { ...opts, headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}

export async function getSuppliers() {
  try {
    const rows = await _sbFetch('/suppliers?order=name.asc');
    return rows || [];
  } catch(e) {
    console.error('getSuppliers:', e);
    return [];
  }
}

export async function upsertSupplier(supplier) {
  try {
    const r = await _sbFetch('/suppliers?on_conflict=name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([supplier]),
    });
    return r?.[0];
  } catch(e) { console.error('upsertSupplier:', e); return null; }
}

export async function updateSupplier(id, patch) {
  try {
    const r = await _sbFetch(`/suppliers?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    return r?.[0];
  } catch(e) { console.error('updateSupplier:', e); return null; }
}

export async function deleteSupplier(id) {
  try {
    await _sbFetch(`/suppliers?id=eq.${id}`, { method: 'DELETE' });
    return true;
  } catch(e) { return false; }
}

// Auto-création depuis un listing
export async function ensureSupplierFromListing(listing) {
  if (!listing.seller_name || listing.seller_name === '—') return null;
  const supplier = {
    name:    listing.seller_name,
    country: listing.country,
    last_seen_at: new Date().toISOString(),
  };
  return await upsertSupplier(supplier);
}

// ══════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════
export async function initSuppliers() {
  await _loadSuppliers();
  _renderUI();
}

async function _loadSuppliers() {
  _suppliers = await getSuppliers();
}

function _renderUI() {
  const container = document.getElementById('suppliers-content');
  if (!container) return;

  const countriesUsed = [...new Set(_suppliers.map(s => s.country).filter(Boolean))];
  const countryOpts = countriesUsed.map(c => `<option value="${c}">${FLAGS[c] || ''} ${COUNTRY_NAMES[c] || c}</option>`).join('');

  container.innerHTML = `
    <div class="suppliers-header">
      <h2>CRM Fournisseurs</h2>
      <span class="suppliers-count">${_suppliers.length} fournisseurs</span>
    </div>
    
    <div class="suppliers-filters">
      <input type="search" id="sup-search" placeholder="🔍 Rechercher par nom…" value="${_searchTerm}">
      <select id="sup-country">
        <option value="">Tous pays</option>
        ${countryOpts}
      </select>
      <button class="btn btn-g" id="sup-add-btn">+ Ajouter manuellement</button>
    </div>
    
    <div class="suppliers-list" id="suppliers-list"></div>
    <div id="supplier-modal-container"></div>
  `;

  document.getElementById('sup-search').addEventListener('input', e => {
    _searchTerm = e.target.value;
    _renderList();
  });
  document.getElementById('sup-country').value = _filterCountry;
  document.getElementById('sup-country').addEventListener('change', e => {
    _filterCountry = e.target.value;
    _renderList();
  });
  document.getElementById('sup-add-btn').addEventListener('click', () => _showAddModal());

  _renderList();
}

function _renderList() {
  const listEl = document.getElementById('suppliers-list');
  if (!listEl) return;

  let filtered = [..._suppliers];
  if (_filterCountry) filtered = filtered.filter(s => s.country === _filterCountry);
  if (_searchTerm) {
    const q = _searchTerm.toLowerCase();
    filtered = filtered.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.contact_name || '').toLowerCase().includes(q)
    );
  }

  if (!filtered.length) {
    listEl.innerHTML = '<div class="no-data">Aucun fournisseur. Ils apparaîtront automatiquement au fil des annonces analysées.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(s => _renderSupplierCard(s)).join('');
  filtered.forEach(s => {
    document.getElementById(`sup-edit-${s.id}`)?.addEventListener('click', () => _showEditModal(s));
    document.getElementById(`sup-del-${s.id}`)?.addEventListener('click', () => _confirmDelete(s));
  });
}

function _renderSupplierCard(s) {
  const flag = FLAGS[s.country] || '🌍';
  const stars = '★'.repeat(s.reliability || 3) + '☆'.repeat(5 - (s.reliability || 3));
  const priceStars = '$'.repeat(s.pricing_score || 3);
  const lastSeen = s.last_seen_at ? new Date(s.last_seen_at).toLocaleDateString('fr-CH') : '—';
  
  return `
    <div class="supplier-card">
      <div class="sc-header">
        <span class="sc-flag">${flag}</span>
        <div class="sc-info">
          <div class="sc-name">${s.name}</div>
          <div class="sc-meta">
            ${s.city ? s.city + ' · ' : ''}${COUNTRY_NAMES[s.country] || s.country || ''}
            ${s.specialties ? ' · ' + s.specialties : ''}
          </div>
        </div>
        <div class="sc-stats">
          <div class="sc-stat"><span class="sc-stat-l">Annonces</span><span class="sc-stat-v">${s.total_listings || 0}</span></div>
          <div class="sc-stat"><span class="sc-stat-l">Deals</span><span class="sc-stat-v">${s.total_won || 0}/${s.total_deals || 0}</span></div>
        </div>
        <div class="sc-rating">
          <div class="sc-stars" title="Fiabilité">${stars}</div>
          <div class="sc-pricing" title="Prix marché">${priceStars}</div>
        </div>
      </div>
      <div class="sc-contact">
        ${s.contact_name ? `<span>👤 ${s.contact_name}</span>` : ''}
        ${s.email ? `<a href="mailto:${s.email}">✉ ${s.email}</a>` : ''}
        ${s.phone ? `<a href="tel:${s.phone}">📞 ${s.phone}</a>` : ''}
        ${s.website ? `<a href="${s.website}" target="_blank">🌐 Site</a>` : ''}
        <span class="sc-lastseen">Vu : ${lastSeen}</span>
      </div>
      ${s.notes ? `<div class="sc-notes">${s.notes}</div>` : ''}
      <div class="sc-actions">
        <button class="btn-sm" id="sup-edit-${s.id}">✎ Éditer</button>
        <button class="btn-sm btn-red" id="sup-del-${s.id}">✕ Supprimer</button>
      </div>
    </div>`;
}

function _showAddModal() {
  _showEditModal(null);
}

function _showEditModal(supplier) {
  const isEdit = !!supplier;
  const s = supplier || { name:'', country:'DE', reliability:3, pricing_score:3 };
  
  const countryOpts = ['DE','FR','BE','ES','IT','NL','AT','LU','CH'].map(c =>
    `<option value="${c}" ${s.country === c ? 'selected' : ''}>${FLAGS[c]} ${COUNTRY_NAMES[c]}</option>`).join('');

  const modal = document.getElementById('supplier-modal-container');
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal modal-wide">
        <div class="modal-title">${isEdit ? 'Éditer fournisseur' : 'Nouveau fournisseur'}</div>
        <div class="form-grid-modal">
          <div class="fg full"><label>Nom (raison sociale)</label><input id="sm-name" value="${s.name || ''}" required></div>
          <div class="fg"><label>Pays</label><select id="sm-country">${countryOpts}</select></div>
          <div class="fg"><label>Ville</label><input id="sm-city" value="${s.city || ''}"></div>
          <div class="fg"><label>Site web</label><input id="sm-website" value="${s.website || ''}" placeholder="https://"></div>
          <div class="fg"><label>Email</label><input id="sm-email" value="${s.email || ''}" type="email"></div>
          <div class="fg"><label>Téléphone</label><input id="sm-phone" value="${s.phone || ''}"></div>
          <div class="fg"><label>Contact</label><input id="sm-contact" value="${s.contact_name || ''}"></div>
          <div class="fg full"><label>Spécialités</label><input id="sm-specialties" value="${s.specialties || ''}" placeholder="Cayenne, Defender 110…"></div>
          <div class="fg"><label>Fiabilité (1-5)</label><input id="sm-reliability" type="number" min="1" max="5" value="${s.reliability || 3}"></div>
          <div class="fg"><label>Pricing (1-5, 5=très bon)</label><input id="sm-pricing" type="number" min="1" max="5" value="${s.pricing_score || 3}"></div>
          <div class="fg full"><label>Notes</label><textarea id="sm-notes" rows="3">${s.notes || ''}</textarea></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-g" id="sm-save">${isEdit ? '💾 Enregistrer' : '+ Ajouter'}</button>
          <button class="btn" id="sm-cancel">Annuler</button>
        </div>
      </div>
    </div>`;

  document.getElementById('sm-cancel').addEventListener('click', () => modal.innerHTML = '');
  document.getElementById('sm-save').addEventListener('click', async () => {
    const data = {
      name:          document.getElementById('sm-name').value.trim(),
      country:       document.getElementById('sm-country').value,
      city:          document.getElementById('sm-city').value.trim() || null,
      website:       document.getElementById('sm-website').value.trim() || null,
      email:         document.getElementById('sm-email').value.trim() || null,
      phone:         document.getElementById('sm-phone').value.trim() || null,
      contact_name:  document.getElementById('sm-contact').value.trim() || null,
      specialties:   document.getElementById('sm-specialties').value.trim() || null,
      reliability:   parseInt(document.getElementById('sm-reliability').value) || 3,
      pricing_score: parseInt(document.getElementById('sm-pricing').value) || 3,
      notes:         document.getElementById('sm-notes').value.trim() || null,
    };
    if (!data.name) { alert('Le nom est obligatoire'); return; }
    
    if (isEdit) {
      await updateSupplier(supplier.id, data);
    } else {
      await upsertSupplier(data);
    }
    modal.innerHTML = '';
    await initSuppliers();
  });
}

function _confirmDelete(s) {
  if (!confirm(`Supprimer le fournisseur "${s.name}" ?`)) return;
  deleteSupplier(s.id).then(() => initSuppliers());
}
