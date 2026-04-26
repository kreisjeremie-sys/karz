// KARZ v10 — lost.js — Onglet DEALS LOST
// Deals abandonnés avec raison + apprentissage
// ═══════════════════════════════════════════════════════════════

import { getState } from './state.js';
import { FLAGS } from './config.js';
import { computeDeal } from './calc.js';

export async function initLost() { render(); }
export async function refresh()  { render(); }

export function render() {
  const state     = getState();
  const container = document.getElementById('lost-content');
  if (!container) return;

  const lostDeals = state.deals.filter(d => d.status === 'lost');

  if (!lostDeals.length) {
    container.innerHTML = '<div class="no-data">Aucun deal perdu pour l\'instant.</div>';
    return;
  }

  // Stats par raison
  const byReason = {};
  lostDeals.forEach(d => {
    const r = d.lost_reason || 'Autre';
    byReason[r] = (byReason[r] || 0) + 1;
  });

  const reasonsList = Object.entries(byReason)
    .sort(([,a],[,b]) => b - a)
    .map(([r,n]) => `<div class="reason-row"><span class="reason-bar" style="width:${(n/lostDeals.length)*100}%"></span><span class="reason-label">${r}</span><span class="reason-count">${n}</span></div>`)
    .join('');

  container.innerHTML = `
    <div class="lost-summary">
      <div class="metric"><div class="ml">Total deals perdus</div><div class="mv">${lostDeals.length}</div></div>
    </div>
    <div class="reasons-breakdown">
      <div class="rb-title">Raisons d'abandon</div>
      <div class="rb-list">${reasonsList}</div>
    </div>
    <div id="lost-list"></div>
  `;

  const listEl = document.getElementById('lost-list');
  lostDeals.forEach(d => listEl.appendChild(_renderCard(d, state)));
}

function _renderCard(deal, state) {
  const calc = computeDeal(deal, state);
  const flag = FLAGS[deal.country] || '🌍';
  const card = document.createElement('div');
  card.className = 'lost-card';
  card.innerHTML = `
    <div class="lost-header">
      <span class="lost-flag">${flag}</span>
      <div class="lost-info">
        <div class="lost-name">${deal.brand} ${deal.model} ${deal.year || ''}</div>
        <div class="lost-meta">${deal.km ? deal.km.toLocaleString('fr-CH') + ' km' : '—'} · Perdu le ${deal.lost_at ? new Date(deal.lost_at).toLocaleDateString('fr-CH') : '—'}</div>
      </div>
      <div class="lost-marge ${calc.marge > 0 ? 'g' : 'r'}">${calc.marge !== null ? 'CHF ' + calc.marge.toLocaleString('fr-CH') : '—'}</div>
    </div>
    <div class="lost-reason"><span class="reason-tag">${deal.lost_reason || 'Autre'}</span></div>
    ${deal.lost_note ? `<div class="lost-note">${deal.lost_note}</div>` : ''}
    ${deal.listing_url ? `<a class="lost-link" href="${deal.listing_url}" target="_blank">↗ Annonce</a>` : ''}
  `;
  return card;
}
