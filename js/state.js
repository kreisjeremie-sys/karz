// KARZ v10 — state.js
// État global centralisé. Un seul objet, muté via setState().
// Les modules s'abonnent aux changements via subscribe().
// ═══════════════════════════════════════════════════════════════

import { DEFAULTS, SPECS } from './config.js';

const _state = {
  // Connexion
  sbOk:     false,
  apifyOk:  false,
  fxOk:     false,

  // Paramètres opérationnels (persistés dans Supabase karz_config)
  params: {
    FX:         DEFAULTS.FX,
    TRANSPORT:  DEFAULTS.TRANSPORT,
    TVA_MODE_B: DEFAULTS.TVA_MODE_B,
    USER:       '—',
  },

  // Config — référence vers SPECS (mutée par loadBenchmarkCache)
  config: { SPECS },

  // Données
  deals:      [],  // Supabase est la source unique — plus de localStorage
  listingsEU: [],
  euMeta:     { lastUpdate: null, totalActive: 0 },

  // Filtres onglet Recherche
  searchFilters: {
    brand: '', modelSlug: '', country: [], yearMin: null, yearMax: null,
    kmMax: null, priceMax: null, margeMin: null, fuelType: '',
    sellerType: '', domMax: null,
  },

  // Pipeline
  pipelineView: 'watchlist', // onglet actif

  // UI
  currentPage: 'search',
  expandedDeal: null,
  loading: false,
  loadingMsg: '',
};

const _subscribers = [];

export function getState() { return _state; }

export function setState(patch, silent = false) {
  Object.assign(_state, typeof patch === 'function' ? patch(_state) : patch);
  if (!silent) _notify();
}

export function setNestedState(path, value) {
  // path ex: 'params.FX' ou 'searchFilters.brand'
  const parts = path.split('.');
  let obj = _state;
  for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
  obj[parts[parts.length - 1]] = value;
  _notify();
}

export function subscribe(fn) {
  _subscribers.push(fn);
  return () => { const i = _subscribers.indexOf(fn); if (i > -1) _subscribers.splice(i, 1); };
}

function _notify() { _subscribers.forEach(fn => fn(_state)); }

// Helpers
export function getParam(key) { return _state.params[key]; }
export function getTvaMode()  { return _state.params.TVA_MODE_B ? 'B' : 'A'; }
export function getFX()       { return _state.params.FX; }
export function getTransport(){ return _state.params.TRANSPORT; }
