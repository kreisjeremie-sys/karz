// KARZ v10 — my-deals.js
// Onglet MY DEALS — véhicules achetés (contrat signé)
// Tracking : prix réels, frais réels, prix de vente final, calibration
// ═══════════════════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { updateDeal, deleteDeal as dbDeleteDeal } from './db.js';
import { computeDeal } from './calc.js';
import { FLAGS } from './config.js';

export async function initMyDeals() {
  render();
}

export async function refresh() { render(); }

export function render() {
  const state     = getState();
  const container = document.getElementById('mydeals-content');
  if (!container) return;

  const myDeals = state.deals.filter(d => d.status === 'mydeals');

  if (!myDeals.length) {
    container.innerHTML = '<div class="no-data">Aucun deal acheté pour l\'instant. Quand un deal du pipeline atteint "Contrat signé", il apparaît ici.</div>';
    return;
  }

  // Stats globales
  const stats = _computeStats(myDeals, state);
  container.innerHTML = `
    <div class="mydeals-stats">
      <div class="metric"><div class="ml">Deals achetés</div><div class="mv">${myDeals.length}</div></div>
      <div class="metric"><div class="ml">Marge prévue totale</div><div class="mv g">CHF ${stats.totalMargePrevu.toLocaleString('fr-CH')}</div></div>
      <div class="metric"><div class="ml">Marge réelle (vendus)</div><div class="mv ${stats.totalMargeReelle >= 0 ? 'g' : 'r'}">CHF ${stats.totalMargeReelle.toLocaleString('fr-CH')}</div></div>
      <div class="metric"><div class="ml">Vendus</div><div class="mv">${stats.nSold} / ${myDeals.length}</div></div>
    </div>
    <div id="mydeals-list"></div>
  `;
  const listEl = document.getElementById('mydeals-list');
  myDeals.forEach(d => listEl.appendChild(_renderCard(d, state)));
}

function _computeStats(deals, state) {
  let totalMargePrevu  = 0;
  let totalMargeReelle = 0;
  let nSold            = 0;
  deals.forEach(d => {
    const calc = computeDeal(d, state);
    if (calc.marge !== null) totalMargePrevu += calc.marge;
    if (d.actual_resale_chf && d.actual_total_costs_chf) {
      const tvaMode = state.params.TVA_MODE_B ? 'B' : 'A';
      const revenu  = tvaMode === 'B' ? Math.round(d.actual_resale_chf / 1.081) : d.actual_resale_chf;
      totalMargeReelle += (revenu - d.actual_total_costs_chf);
      nSold++;
    }
  });
  return { totalMargePrevu, totalMargeReelle, nSold };
}

function _renderCard(deal, state) {
  const calc = computeDeal(deal, state);
  const flag = FLAGS[deal.country] || '🌍';
  const card = document.createElement('div');
  card.className = 'mydeal-card';

  const isSold = !!deal.actual_resale_chf;
  const tvaMode = state.params.TVA_MODE_B ? 'B' : 'A';

  // Marge réelle si vendu
  let margeReelle = null;
  if (isSold && deal.actual_total_costs_chf) {
    const revenu = tvaMode === 'B' ? Math.round(deal.actual_resale_chf / 1.081) : deal.actual_resale_chf;
    margeReelle  = revenu - deal.actual_total_costs_chf;
  }

  // Delta vs hypothèses
  const margePrevue = calc.marge;
  const delta       = (margeReelle !== null && margePrevue !== null) ? margeReelle - margePrevue : null;

  card.innerHTML = `
    <div class="md-header">
      <span class="md-flag">${flag}</span>
      <div class="md-info">
        <div class="md-name">${deal.brand} ${deal.model} ${deal.year || ''}</div>
        <div class="md-meta">
          ${deal.km ? deal.km.toLocaleString('fr-CH') + ' km' : '—'} ·
          Acheté le ${deal.bought_at ? new Date(deal.bought_at).toLocaleDateString('fr-CH') : '—'} ·
          ${deal.added_by || '—'}
        </div>
      </div>
      <div class="md-status ${isSold ? 'sold' : 'holding'}">${isSold ? '✓ Vendu' : 'En portefeuille'}</div>
    </div>

    <div class="md-section">
      <div class="md-section-title">Hypothèses initiales (au moment de l'achat)</div>
      <div class="md-hyp-grid">
        <div><span class="lbl">Prix achat</span><span class="val">€${(deal.price_eur_ttc || 0).toLocaleString('fr-CH')} TTC</span></div>
        <div><span class="lbl">Landed estimé</span><span class="val">CHF ${(calc.landed?.total || 0).toLocaleString('fr-CH')}</span></div>
        <div><span class="lbl">Revente estimée</span><span class="val">CHF ${(calc.resale?.price || 0).toLocaleString('fr-CH')}</span></div>
        <div><span class="lbl">Marge prévue</span><span class="val ${margePrevue > 0 ? 'g' : 'r'}">CHF ${(margePrevue || 0).toLocaleString('fr-CH')}</span></div>
      </div>
    </div>

    <div class="md-section">
      <div class="md-section-title">Tracking réel — à compléter au fil du temps</div>
      <div class="md-real-grid">
        <div class="fg">
          <label>Prix achat réel CHF (incl. négo)</label>
          <input type="number" value="${deal.actual_purchase_chf || ''}" placeholder="Prix final négocié"
            onblur="window.KARZ.mydeals.updateField('${deal.id}', 'actual_purchase_chf', this.value)">
        </div>
        <div class="fg">
          <label>Transport réel CHF</label>
          <input type="number" value="${deal.actual_transport_chf || ''}" placeholder="${calc.landed?.transport || 1500}"
            onblur="window.KARZ.mydeals.updateField('${deal.id}', 'actual_transport_chf', this.value)">
        </div>
        <div class="fg">
          <label>Homologation/COC CHF</label>
          <input type="number" value="${deal.actual_coc_chf || ''}" placeholder="60–2000 selon véhicule"
            onblur="window.KARZ.mydeals.updateField('${deal.id}', 'actual_coc_chf', this.value)">
        </div>
        <div class="fg">
          <label>Total frais réels CHF</label>
          <input type="number" value="${deal.actual_total_costs_chf || ''}" placeholder="Somme tous frais"
            onblur="window.KARZ.mydeals.updateField('${deal.id}', 'actual_total_costs_chf', this.value)">
        </div>
        <div class="fg">
          <label>Prix vente final CHF TTC</label>
          <input type="number" value="${deal.actual_resale_chf || ''}" placeholder="Prix vendu"
            onblur="window.KARZ.mydeals.updateField('${deal.id}', 'actual_resale_chf', this.value)">
        </div>
        <div class="fg">
          <label>Date vente</label>
          <input type="date" value="${deal.sold_at_date || ''}"
            onblur="window.KARZ.mydeals.updateField('${deal.id}', 'sold_at_date', this.value)">
        </div>
      </div>
    </div>

    ${margeReelle !== null ? `
    <div class="md-section result">
      <div class="md-section-title">Bilan réel</div>
      <div class="md-bilan-grid">
        <div><span class="lbl">Marge réelle</span><span class="val ${margeReelle > 0 ? 'g' : 'r'}">CHF ${margeReelle.toLocaleString('fr-CH')}</span></div>
        <div><span class="lbl">Δ vs prévision</span><span class="val ${(delta || 0) >= 0 ? 'g' : 'r'}">${(delta || 0) >= 0 ? '+' : ''}CHF ${(delta || 0).toLocaleString('fr-CH')}</span></div>
      </div>
    </div>` : ''}

    <div class="md-actions">
      <button class="btn btn-red" onclick="window.KARZ.mydeals.deleteDeal('${deal.id}')">Supprimer</button>
    </div>
  `;
  return card;
}

export async function updateField(dealId, field, valueRaw) {
  const value = valueRaw === '' ? null : (isNaN(parseFloat(valueRaw)) ? valueRaw : parseFloat(valueRaw));
  const updated = await updateDeal(dealId, { [field]: value });
  if (updated) {
    const state = getState();
    setState({ deals: state.deals.map(d => d.id === dealId ? { ...d, [field]: value } : d) }, true);
    render();
  }
}

export async function deleteDeal(id) {
  if (!confirm('Supprimer ce deal du suivi My Deals ?')) return;
  await dbDeleteDeal(id);
  const state = getState();
  setState({ deals: state.deals.filter(d => d.id !== id) }, true);
  render();
}
