// KARZ v10 — admin.js — Onglet ADMIN
// Config TVA, FX, transport, prénom + déclencher scrapes manuellement
// ═══════════════════════════════════════════════════════════════

import { getState, setState } from './state.js';
import { setConfig } from './db.js';

export async function initAdmin() {
  render();
}

export function render() {
  const state     = getState();
  const container = document.getElementById('admin-content');
  if (!container) return;

  const p = state.params;

  container.innerHTML = `
    <div class="admin-section">
      <div class="as-title">Configuration</div>
      <div class="admin-grid">
        <div class="fg">
          <label>Votre prénom</label>
          <input type="text" id="adm-user" value="${p.USER || ''}" placeholder="Jérémie"
            onblur="window.KARZ.admin.saveParam('USER', this.value)">
        </div>
        <div class="fg">
          <label>Taux EUR/CHF</label>
          <div class="fx-row">
            <input type="number" id="adm-fx" step="0.0001" value="${p.FX}"
              onblur="window.KARZ.admin.saveParam('FX', parseFloat(this.value))">
            <button class="btn btn-b" onclick="window.KARZ.admin.fetchFX()">↻ Auto BCE</button>
            <span id="fx-source" style="font-size:10px;color:var(--color-text-tertiary)">
              ${state.fxOk ? '● BCE auto' : '⚠ Manuel'}
            </span>
          </div>
        </div>
        <div class="fg">
          <label>Transport CHF (par défaut)</label>
          <input type="number" id="adm-transport" value="${p.TRANSPORT}"
            onblur="window.KARZ.admin.saveParam('TRANSPORT', parseFloat(this.value))">
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="as-title">Mode TVA</div>
      <div class="tva-cards">
        <div class="tva-card ${!p.TVA_MODE_B ? 'active' : ''}" onclick="window.KARZ.admin.setTvaMode(false)">
          <div class="tva-card-title">Mode A — Sans numéro TVA</div>
          <div class="tva-card-desc">
            TVA import 8.1% = coût définitif<br>
            Pas de TVA sur revente<br>
            <b>Phase initiale</b>
          </div>
        </div>
        <div class="tva-card ${p.TVA_MODE_B ? 'active' : ''}" onclick="window.KARZ.admin.setTvaMode(true)">
          <div class="tva-card-title">Mode B — Sàrl avec n° TVA CH</div>
          <div class="tva-card-desc">
            TVA 8.1% récupérable → CHF 0 net<br>
            TVA collectée et reversée AFC<br>
            <b>Activité établie</b>
          </div>
        </div>
      </div>
    </div>

    <div class="admin-section">
      <div class="as-title">Scrapes</div>
      <div class="scrape-grid">
        <div class="scrape-card">
          <div class="sc-title">EU — hebdomadaire</div>
          <div class="sc-info">
            DE + FR + BE + ES · AS24 + Mobile.de DE<br>
            Auto chaque lundi 06h00 (GitHub Actions)<br>
            <span id="scrape-eu-status">Statut : —</span>
          </div>
          <button class="btn btn-g" onclick="window.KARZ.admin.runScrapeEU()">▶ Lancer manuellement</button>
        </div>
        <div class="scrape-card">
          <div class="sc-title">CH — bi-mensuel</div>
          <div class="sc-info">
            6 modèles génériques · AutoScout24.ch<br>
            Auto le 1er et 15 du mois (GitHub Actions)<br>
            <span id="scrape-ch-status">Statut : —</span>
          </div>
          <button class="btn btn-g" onclick="window.KARZ.admin.runScrapeCH()">▶ Lancer manuellement</button>
        </div>
      </div>
      <div class="admin-note">
        Les scrapes automatiques sont gérés par GitHub Actions — aucun coût Apify pour vous tant que c'est en quotas gratuits.
        Lancez manuellement uniquement en cas de besoin urgent (cf. budget Apify).
      </div>
    </div>
  `;
}

export async function saveParam(key, value) {
  const state = getState();
  setState({ params: { ...state.params, [key]: value } }, true);
  await setConfig(key, value);
  // Re-rendre la page courante pour propager
  if (state.currentPage === 'pipeline') window.KARZ.pipeline?.renderPipeline();
  if (state.currentPage === 'mydeals')  window.KARZ.mydeals?.render();
  if (state.currentPage === 'search')   window.KARZ.search?.runSearch();
}

export async function setTvaMode(modeB) {
  await saveParam('TVA_MODE_B', modeB);
  render();
}

export async function fetchFX() {
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=CHF');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const rate = data?.rates?.CHF;
    if (!rate || rate < 0.8 || rate > 1.5) throw new Error('Taux hors plage');
    const rounded = Math.round(rate * 10000) / 10000;
    await saveParam('FX', rounded);
    setState({ fxOk: true });
    document.getElementById('adm-fx').value = rounded;
    document.getElementById('fx-source').textContent = '● BCE auto · ' + new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  } catch(e) {
    setState({ fxOk: false });
    document.getElementById('fx-source').textContent = '⚠ Erreur fetch — saisie manuelle';
  }
}

export async function runScrapeEU() {
  const status = document.getElementById('scrape-eu-status');
  if (status) status.textContent = '⟳ Scrape EU en cours…';
  try {
    const r = await fetch('/api/scrape-eu', { method: 'POST' });
    const data = await r.json();
    if (data.success) {
      if (status) status.textContent = `✓ ${data.totalSaved} annonces sauvegardées · ${new Date().toLocaleTimeString('fr-CH')}`;
    } else {
      throw new Error(data.error || 'Erreur scrape');
    }
  } catch(e) {
    if (status) status.textContent = `✗ ${e.message}`;
  }
}

export async function runScrapeCH() {
  const status = document.getElementById('scrape-ch-status');
  if (status) status.textContent = '⟳ Scrape CH en cours…';
  try {
    const r = await fetch('/api/scrape-ch', { method: 'POST' });
    const data = await r.json();
    if (data.success) {
      if (status) status.textContent = `✓ ${data.totalSaved} annonces sauvegardées · ${new Date().toLocaleTimeString('fr-CH')}`;
      window.KARZ.marketCH?.render();
    } else {
      throw new Error(data.error || 'Erreur scrape');
    }
  } catch(e) {
    if (status) status.textContent = `✗ ${e.message}`;
  }
}
