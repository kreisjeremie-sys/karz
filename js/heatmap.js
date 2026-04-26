// KARZ v10 — heatmap.js — Onglet HEATMAP
// Vue d'ensemble écart EU/CH par modèle, années
// ═══════════════════════════════════════════════════════════════

import { getState } from './state.js';
import { computeDeal } from './calc.js';
import { CH_SCRAPE_SLUGS } from './config.js';

export async function initHeatmap() {
  render();
}

export function render() {
  const state     = getState();
  const container = document.getElementById('heatmap-content');
  if (!container) return;

  const years = [2020, 2021, 2022, 2023, 2024];
  const models = [
    { brand:'Porsche',     model:'Cayenne',                key:'Porsche Cayenne'              },
    { brand:'Porsche',     model:'Cayenne Turbo',          key:'Porsche Cayenne Turbo'        },
    { brand:'Porsche',     model:'Macan',                  key:'Porsche Macan'                },
    { brand:'Land Rover',  model:'Defender 110 D300',      key:'Land Rover Defender 110 D300' },
    { brand:'Land Rover',  model:'Range Rover Sport',      key:'Land Rover Range Rover Sport' },
    { brand:'Land Rover',  model:'Range Rover',            key:'Land Rover Range Rover'       },
    { brand:'Land Rover',  model:'Range Rover Evoque',     key:'Land Rover Range Rover Evoque'},
  ];

  let html = '<div class="heatmap-grid"><div class="hm-corner">Modèle</div>';
  years.forEach(y => html += `<div class="hm-year">${y}</div>`);

  models.forEach(m => {
    const spec = state.config.SPECS[m.key];
    if (!spec) return;
    html += `<div class="hm-model">${m.model}</div>`;
    years.forEach(y => {
      const km = (2025 - y) * 15000;
      // Estimation prix HT EU = (revente CH / 1.05) * 0.78 (proxy gros écart)
      // Ce calcul est approximatif — c'est juste pour visualiser le potentiel
      const tmpDeal = {
        brand: m.brand, model: m.model, year: y, km,
        price_eur_ttc: spec.msrp ? Math.round(spec.msrp * 0.55 / 1.05) : 50000,
        country:'DE', seller_type:'pro',
      };
      const calc = computeDeal(tmpDeal, state);
      const marge = calc.marge;
      let cls = 'low';
      if (marge !== null) {
        if (marge >= 15000) cls = 'high';
        else if (marge >= 8000) cls = 'mid';
      }
      html += `<div class="hm-cell ${cls}">
        ${marge !== null ? '+' + Math.round(marge / 1000) + 'k' : '—'}
      </div>`;
    });
  });
  html += '</div>';

  html += `
    <div class="hm-legend">
      <span class="hm-leg-cell low">&lt; 8k</span>
      <span class="hm-leg-cell mid">8–15k</span>
      <span class="hm-leg-cell high">&gt; 15k CHF</span>
    </div>
    <div class="hm-note">
      Estimation basée sur MSRP × 55% pour le prix EU et le mode TVA actif.
      Calcul indicatif — toujours vérifier avec un benchmark CH réel avant décision.
    </div>
  `;

  container.innerHTML = html;
}
