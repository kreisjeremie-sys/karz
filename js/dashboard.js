// js/dashboard.js — Dashboard d\'accueil avec KPIs
import { getState } from './state.js';
import { getDeals, getListingsEUMeta } from './db.js';
import { computeListing, fmt } from './compute.js';
import { FLAGS, MODELS } from './config.js';

let _rendered = false;

export async function initDashboard() {
  await _loadData();
  _renderUI();
}

async function _loadData() {
  // Données déjà chargées par init() : state.deals
}

function _renderUI() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  const state = getState();
  const deals = state.deals || [];
  const meta  = state.euMeta || {};

  // KPIs principaux
  const pipelineDeals = deals.filter(d => d.status === 'pipeline');
  const myDeals       = deals.filter(d => d.status === 'mydeals');
  const lostDeals     = deals.filter(d => d.status === 'lost');

  const pipelineValue = pipelineDeals.reduce((sum, d) => sum + (d.price_eur_ttc || 0), 0);
  const totalAcquired = myDeals.reduce((sum, d) => sum + (d.price_eur_ttc || 0), 0);
  
  // Calcul marge potentielle pipeline (utilise compute.js async)
  container.innerHTML = `
    <div class="dashboard-header">
      <h2>Dashboard KARZ</h2>
      <div class="dashboard-date">${new Date().toLocaleDateString('fr-CH', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Annonces actives</div>
        <div class="kpi-value">${(meta.totalActive || 0).toLocaleString('fr-CH')}</div>
        <div class="kpi-sub">EU scrape ${meta.lastUpdate ? new Date(meta.lastUpdate).toLocaleDateString('fr-CH') : '—'}</div>
      </div>
      <div class="kpi-card kpi-blue">
        <div class="kpi-label">Pipeline</div>
        <div class="kpi-value">${pipelineDeals.length}</div>
        <div class="kpi-sub">${fmt(pipelineValue)} € engagés</div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-label">My Deals (achetés)</div>
        <div class="kpi-value">${myDeals.length}</div>
        <div class="kpi-sub">${fmt(totalAcquired)} € investis</div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-label">Lost</div>
        <div class="kpi-value">${lostDeals.length}</div>
        <div class="kpi-sub">opportunités perdues</div>
      </div>
    </div>

    <div class="dashboard-section">
      <h3>Top 5 opportunités pipeline (par marge potentielle)</h3>
      <div id="dash-top-pipeline" class="dash-loading">Calcul…</div>
    </div>

    <div class="dashboard-section">
      <h3>Répartition pipeline par statut</h3>
      <div id="dash-pipeline-status"></div>
    </div>

    <div class="dashboard-section">
      <h3>Modèles les plus représentés</h3>
      <div id="dash-models"></div>
    </div>
  `;

  // Async: top pipeline by margin
  _renderTopPipeline(pipelineDeals);
  _renderPipelineStatus(pipelineDeals);
  _renderTopModels(deals);
}

async function _renderTopPipeline(pipelineDeals) {
  const el = document.getElementById('dash-top-pipeline');
  if (!el) return;
  
  if (!pipelineDeals.length) {
    el.innerHTML = '<div class="no-data">Aucun deal en pipeline</div>';
    return;
  }
  
  // Calculer marge pour chaque deal
  const withMarge = await Promise.all(pipelineDeals.slice(0, 20).map(async deal => {
    const allModels = [...MODELS.porsche, ...MODELS.landrover];
    const m = allModels.find(m => m.label === deal.model || m.slug === deal.model);
    const slug = m ? m.slug : (deal.model || '').toLowerCase().replace(/\s+/g, '-');
    const listing = {
      brand: deal.brand,
      model_slug: slug,
      model_full: `${deal.brand} ${deal.model}`,
      version: deal.version || deal.model,
      year: deal.year,
      km: deal.km,
      price_eur_ttc: deal.price_eur_ttc,
      fuel_type: deal.fuel_type,
      seller_type: deal.seller_type,
      seller_name: deal.seller_name,
      country: deal.country,
      first_reg_date: deal.first_reg_date,
    };
    const result = await computeListing(listing);
    return { deal, marge: result.marge };
  }));
  
  // Trier par marge desc
  const sorted = withMarge
    .filter(x => x.marge !== null && x.marge !== undefined)
    .sort((a, b) => b.marge - a.marge)
    .slice(0, 5);
  
  if (!sorted.length) {
    el.innerHTML = '<div class="no-data">Aucune marge calculable</div>';
    return;
  }
  
  el.innerHTML = sorted.map((x, i) => {
    const flag = FLAGS[x.deal.country] || '🌍';
    const margeCls = x.marge >= 0 ? 'profit' : 'loss';
    return `
      <div class="dash-row">
        <span class="dash-rank">#${i+1}</span>
        <span class="dash-flag">${flag}</span>
        <div class="dash-info">
          <div class="dash-name">${x.deal.brand} ${x.deal.model || ''} ${x.deal.year || ''}</div>
          <div class="dash-meta">${x.deal.km ? fmt(x.deal.km) + ' km' : '—'} · €${fmt(x.deal.price_eur_ttc)}</div>
        </div>
        <div class="dash-marge ${margeCls}">CHF ${x.marge >= 0 ? '+' : ''}${fmt(x.marge)}</div>
      </div>`;
  }).join('');
}

function _renderPipelineStatus(deals) {
  const el = document.getElementById('dash-pipeline-status');
  if (!el) return;
  const statuses = ['watchlist','contacted','discussing','offered','agreed'];
  const counts = statuses.map(s => ({
    label: s,
    n: deals.filter(d => (d.pipeline_status || 'watchlist') === s).length
  }));
  const max = Math.max(...counts.map(c => c.n), 1);
  el.innerHTML = `
    <div class="dash-bars">
      ${counts.map(c => `
        <div class="dash-bar">
          <div class="dash-bar-fill" style="width:${(c.n/max)*100}%"></div>
          <span class="dash-bar-label">${c.label} : ${c.n}</span>
        </div>`).join('')}
    </div>`;
}

function _renderTopModels(deals) {
  const el = document.getElementById('dash-models');
  if (!el) return;
  const tally = {};
  deals.forEach(d => {
    const k = `${d.brand} ${d.model || ''}`.trim();
    tally[k] = (tally[k] || 0) + 1;
  });
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!sorted.length) {
    el.innerHTML = '<div class="no-data">Aucune donnée</div>';
    return;
  }
  el.innerHTML = sorted.map(([model, n]) => `
    <div class="dash-row">
      <div class="dash-info"><div class="dash-name">${model}</div></div>
      <div class="dash-marge">${n} deal${n>1?'s':''}</div>
    </div>`).join('');
}
