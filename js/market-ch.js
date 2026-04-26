// KARZ v10 — market-ch.js — Onglet MARCHÉ CH
// Stats P10/P25/P50/P75 par modèle, time-to-sell, lecture base scrape CH
// ═══════════════════════════════════════════════════════════════

import { getCHMarketStats } from './db.js';

export async function initMarketCH() {
  await render();
}

export async function render() {
  const container = document.getElementById('market-ch-content');
  if (!container) return;

  container.innerHTML = '<div class="loading">Chargement des statistiques marché CH…</div>';
  const stats = await getCHMarketStats();

  if (!stats?.length) {
    container.innerHTML = `
      <div class="no-data">
        Aucune donnée — lancez un scrape global CH depuis l'onglet Admin.
        <br><br>
        <small>Le scrape CH est exécuté automatiquement le 1er et 15 du mois via GitHub Actions.</small>
      </div>`;
    return;
  }

  let lastUpdate = stats.reduce((max, r) => r.last_updated > max ? r.last_updated : max, '');
  lastUpdate = lastUpdate ? new Date(lastUpdate).toLocaleDateString('fr-CH') : '—';

  container.innerHTML = `
    <div class="market-header">
      <div class="metric"><div class="ml">Modèles couverts</div><div class="mv">${stats.length}</div></div>
      <div class="metric"><div class="ml">Annonces actives</div><div class="mv">${stats.reduce((s,r)=>s+(r.n_active||0), 0)}</div></div>
      <div class="metric"><div class="ml">Vendus (historique)</div><div class="mv">${stats.reduce((s,r)=>s+(r.n_sold||0), 0)}</div></div>
      <div class="metric"><div class="ml">Dernière maj</div><div class="mv" style="font-size:14px">${lastUpdate}</div></div>
    </div>

    <table class="market-table">
      <thead>
        <tr>
          <th>Modèle</th>
          <th>Actives</th>
          <th>P10</th>
          <th>P25</th>
          <th>Médiane</th>
          <th>P75</th>
          <th>Time-to-sell</th>
          <th>Vendus</th>
        </tr>
      </thead>
      <tbody>
        ${stats.map(r => `
          <tr>
            <td><b>${r.brand} ${r.model}</b></td>
            <td class="num">${r.n_active || 0}${(r.n_active || 0) < 5 ? ' <span class="warn-sm">⚠</span>' : ''}</td>
            <td class="num">${r.price_p10 ? 'CHF ' + r.price_p10.toLocaleString('fr-CH') : '—'}</td>
            <td class="num"><b>${r.price_p25 ? 'CHF ' + r.price_p25.toLocaleString('fr-CH') : '—'}</b></td>
            <td class="num">${r.price_p50 ? 'CHF ' + r.price_p50.toLocaleString('fr-CH') : '—'}</td>
            <td class="num">${r.price_p75 ? 'CHF ' + r.price_p75.toLocaleString('fr-CH') : '—'}</td>
            <td class="num">${r.avg_days_to_sell ? r.avg_days_to_sell + ' j' : '—'}</td>
            <td class="num">${r.n_sold || 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="market-note">
      <b>P25 = prix de revente cible</b> (75% du marché plus cher).
      Si N &lt; 5 → fallback dépréciation depuis MSRP utilisé automatiquement.
    </div>
  `;
}
