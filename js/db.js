// KARZ v10 — db.js
// Point d'entrée UNIQUE pour toutes les opérations Supabase.
// Aucun autre module n'appelle supabase.from() directement.
// ═══════════════════════════════════════════════════════════════

const SB_URL = 'https://kkytyznvqwptdnsgodlo.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtreXR5em52cXdwdGRuc2dvZGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzUyNzksImV4cCI6MjA5MjQ1MTI3OX0.XLYgXXUkxAkHXaWCc4diAclSpLxLpsZV_NYohr9cSlg';

let _sb = null;
function sb() {
  if (!_sb && window.supabase)
    _sb = window.supabase.createClient(SB_URL, SB_KEY);
  return _sb;
}

// ── GESTION D'ERREUR CENTRALISÉE ─────────────────────────────
function handleError(context, error) {
  console.error(`[DB] ${context}:`, error?.message || error);
  return null;
}

// ── SCHÉMA DEAL ───────────────────────────────────────────────
// Un deal représente une opportunité identifiée, quelle que soit son origine
// (scrape EU, ajout manuel URL, saisie manuelle)
// status: 'pipeline' | 'mydeals' | 'lost'
// pipeline_status: voir PIPELINE_STATUSES dans config.js
// seller_type: 'pro' | 'dealer' | 'private' | 'unknown'

// ── DEALS ────────────────────────────────────────────────────

export async function getDeals() {
  try {
    const { data, error } = await sb()
      .from('deals_v10')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch(e) { return handleError('getDeals', e) ?? []; }
}

export async function createDeal(deal) {
  try {
    const { data, error } = await sb()
      .from('deals_v10')
      .insert({ ...deal, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch(e) { return handleError('createDeal', e); }
}

export async function updateDeal(id, patch) {
  try {
    const { data, error } = await sb()
      .from('deals_v10')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch(e) { return handleError('updateDeal', e); }
}

export async function deleteDeal(id) {
  try {
    const { error } = await sb().from('deals_v10').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch(e) { return handleError('deleteDeal', e) ?? false; }
}

// Ajouter une note horodatée à un deal
export async function addNote(dealId, text, author) {
  try {
    // Lire les notes existantes
    const { data: deal } = await sb()
      .from('deals_v10').select('notes').eq('id', dealId).single();
    const notes = deal?.notes || [];
    const newNote = {
      text, author,
      at: new Date().toISOString(),
      id: Date.now().toString(),
    };
    const { data, error } = await sb()
      .from('deals_v10')
      .update({ notes: [newNote, ...notes], updated_at: new Date().toISOString() })
      .eq('id', dealId)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch(e) { return handleError('addNote', e); }
}

// ── LISTING EU (base locale scrape) ──────────────────────────

export async function getListingsEU({ brand, modelSlug, country, yearMin, yearMax, kmMax, priceMax }) {
  try {
    let q = sb()
      .from('listings_eu')
      .select('*')
      .is('sold_at', null) // actives uniquement
      .order('first_seen_at', { ascending: false });

    if (brand)    q = q.eq('brand', brand);
    if (modelSlug)q = q.eq('model_slug', modelSlug);
    if (country)  q = q.in('country', Array.isArray(country) ? country : [country]);
    if (yearMin) {
      q = q.gte('year', yearMin);
      q = q.not('year', 'is', null); // exclure annonces sans année
    }
    if (yearMax)  q = q.lte('year', yearMax);
    if (kmMax)    q = q.lte('km', kmMax);
    if (priceMax) q = q.lte('price_eur_ttc', priceMax);

    const { data, error } = await q.limit(500);
    if (error) throw error;
    return data || [];
  } catch(e) { return handleError('getListingsEU', e) ?? []; }
}

export async function getListingsEUMeta() {
  try {
    const { data, error } = await sb()
      .from('listings_eu')
      .select('brand, model_slug, country, first_seen_at, last_seen_at')
      .is('sold_at', null)
      .order('first_seen_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const { count } = await sb()
      .from('listings_eu')
      .select('*', { count: 'exact', head: true })
      .is('sold_at', null);
    return {
      lastUpdate: data?.[0]?.last_seen_at || null,
      totalActive: count || 0,
    };
  } catch(e) { return handleError('getListingsEUMeta', e) ?? { lastUpdate:null, totalActive:0 }; }
}

// ── BENCHMARK CH ─────────────────────────────────────────────

export async function getBenchmarkCH(brand, model) {
  try {
    // Cache valide 14 jours
    const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await sb()
      .from('benchmark_ch')
      .select('*')
      .eq('brand', brand)
      .eq('model', model)
      .gte('scraped_at', cutoff)
      .order('scraped_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch(e) { return handleError('getBenchmarkCH', e); }
}

export async function saveBenchmarkCH(record) {
  try {
    const { data, error } = await sb()
      .from('benchmark_ch')
      .upsert(record, { onConflict: 'brand,model,year_min,km_max' })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch(e) { return handleError('saveBenchmarkCH', e); }
}

// ── STATS MARCHÉ CH ───────────────────────────────────────────

export async function getCHMarketStats() {
  try {
    const { data, error } = await sb()
      .from('ch_market_stats') // vue SQL
      .select('*')
      .order('brand').order('model');
    if (error) throw error;
    return data || [];
  } catch(e) { return handleError('getCHMarketStats', e) ?? []; }
}

// ── CONFIGURATION ─────────────────────────────────────────────

export async function getConfig() {
  try {
    const { data, error } = await sb()
      .from('karz_config')
      .select('*');
    if (error) throw error;
    const result = {};
    (data || []).forEach(row => { result[row.key] = row.value; });
    return result;
  } catch(e) { return handleError('getConfig', e) ?? {}; }
}

export async function setConfig(key, value) {
  try {
    const { error } = await sb()
      .from('karz_config')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return true;
  } catch(e) { return handleError('setConfig', e) ?? false; }
}


// ── COMPARABLES CH — filtrage intelligent par véhicule ───────
// Retourne les annonces CH comparables avec dégradation progressive
export async function getComparablesCH({ model_slug, fuel_type, version, year, km }) {
  if (!model_slug || !year || !km) return { rows: [], level: 0, label: 'Données insuffisantes' };

  // Extraire la finition principale du champ version
  // Ex: "D300 SE" → "SE" | "P400e HSE" → "HSE" | "Turbo GT" → "Turbo"
  const FINITIONS = ['X-Dynamic HSE','X-Dynamic SE','X-Dynamic','Autobiography','SVR','SV','HSE','SE','GTS','Turbo S E-Hybrid','Turbo E-Hybrid','Turbo','GTS','S E-Hybrid','E-Hybrid','S','X'];
  let finition = null;
  if (version) {
    const vUp = version.toUpperCase();
    for (const f of FINITIONS) {
      if (vUp.includes(f.toUpperCase())) { finition = f; break; }
    }
  }

  // Normaliser le carburant pour le matching
  const fuelNorm = normalizeFuel(fuel_type);

  const levels = [
    // Niveau 1 : finition + fuel + ±1 an + ±30% km (N≥3)
    finition ? {
      label: `${finition} · ${fuelNorm || 'Tous carburants'} · ${year-1}–${year+1} · ${Math.round(km*0.7/1000)}k–${Math.round(km*1.3/1000)}k km`,
      levelN: 1,
      minN: 3,
      filters: { finition, fuel: fuelNorm, yearMin: year-1, yearMax: year+1, kmMin: Math.round(km*0.7), kmMax: Math.round(km*1.3) }
    } : null,
    // Niveau 2 : fuel + ±1 an + ±30% km (N≥5)
    {
      label: `${fuelNorm || 'Tous carburants'} · ${year-1}–${year+1} · ${Math.round(km*0.7/1000)}k–${Math.round(km*1.3/1000)}k km · Finition non filtrée`,
      levelN: 2,
      minN: 5,
      filters: { fuel: fuelNorm, yearMin: year-1, yearMax: year+1, kmMin: Math.round(km*0.7), kmMax: Math.round(km*1.3) }
    },
    // Niveau 3 : fuel + ±2 ans + ±50% km (N≥5)
    {
      label: `${fuelNorm || 'Tous carburants'} · ${year-2}–${year+2} · ${Math.round(km*0.5/1000)}k–${Math.round(km*1.5/1000)}k km · Comparables élargis`,
      levelN: 3,
      minN: 5,
      filters: { fuel: fuelNorm, yearMin: year-2, yearMax: year+2, kmMin: Math.round(km*0.5), kmMax: Math.round(km*1.5) }
    },
    // Niveau 4 : ±2 ans + ±50% km sans filtre fuel (N≥5)
    {
      label: `${year-2}–${year+2} · ${Math.round(km*0.5/1000)}k–${Math.round(km*1.5/1000)}k km · Tous carburants`,
      levelN: 4,
      minN: 5,
      filters: { yearMin: year-2, yearMax: year+2, kmMin: Math.round(km*0.5), kmMax: Math.round(km*1.5) }
    },
  ].filter(Boolean);

  for (const lvl of levels) {
    const rows = await _queryCH(model_slug, lvl.filters);
    if (rows.length >= lvl.minN) {
      return { rows, level: lvl.levelN, label: lvl.label, finition, fuelNorm };
    }
  }
  return { rows: [], level: 5, label: 'Trop peu d\'annonces — depreciation utilisee', finition, fuelNorm };
}

function normalizeFuel(fuel) {
  if (!fuel) return null;
  const f = fuel.toLowerCase();
  if (f.includes('diesel') || f === 'd') return 'diesel';
  if (f.includes('electric') || f.includes('électr') || f === 'e') return 'electrique';
  if (f.includes('hybrid') || f.includes('hybride') || f === 'h') return 'hybride';
  if (f.includes('essence') || f.includes('petrol') || f.includes('gasoline') || f === 'b') return 'essence';
  return null;
}

async function _queryCH(model_slug, { finition, fuel, yearMin, yearMax, kmMin, kmMax }) {
  try {
    let q = sb()
      .from('listings_ch')
      .select('price_chf_ttc, year, km, version, fuel_type, listing_url')
      .is('sold_at', null)
      .eq('model_slug', model_slug)
      .gte('year', yearMin).lte('year', yearMax)
      .gte('km', kmMin).lte('km', kmMax)
      .gt('price_chf_ttc', 0);

    const { data, error } = await q.limit(100);
    if (error || !data) return [];

    let rows = data;

    // Filtre finition côté client (matching flexible)
    if (finition) {
      const finUp = finition.toUpperCase();
      const withFin = rows.filter(r => r.version?.toUpperCase().includes(finUp));
      if (withFin.length > 0) rows = withFin;
    }

    // Filtre carburant côté client
    if (fuel) {
      const withFuel = rows.filter(r => normalizeFuel(r.fuel_type) === fuel);
      if (withFuel.length > 0) rows = withFuel;
    }

    // Note: les prix dans listings_ch scrape cy=D,F,B,A sont en EUR
    // On les convertit en CHF approximatif pour le benchmark
    const FX_APPROX = 0.94; // EUR/CHF approximatif — sera corrigé par le taux BCE
    return rows.map(r => {
      const p = r.price_chf_ttc;
      if (!p || p <= 0) return 0;
      // Si le prix semble être en EUR (< 200000 et pays non CH), convertir
      return Math.round(p * FX_APPROX);
    }).filter(p => p > 0);
  } catch(e) { return []; }
}

// ── STATS depuis un tableau de prix ─────────────────────────
export function computePriceStats(prices) {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a,b)=>a-b);
  const p = (pct) => {
    const k = (pct/100)*(sorted.length-1);
    const f = Math.floor(k); const c = Math.ceil(k);
    return Math.round(f===c ? sorted[f] : sorted[f]+(k-f)*(sorted[c]-sorted[f]));
  };
  return {
    n:    sorted.length,
    p25:  p(25),
    p50:  p(50),
    p75:  p(75),
    mean: Math.round(sorted.reduce((a,b)=>a+b,0)/sorted.length),
    min:  sorted[0],
    max:  sorted[sorted.length-1],
  };
}

// ── URL AutoScout24.ch pour les comparables ──────────────────
// Génère une URL de recherche AS24.ch ciblée sur un véhicule similaire
export function buildAS24chUrl(model_slug, { yearMin, yearMax, kmMin, kmMax, fuel } = {}) {
  // Mapping slug → marque + slug AS24.ch
  const makeMap = {
    'macan':'porsche','cayenne':'porsche',
    'defender-90':'land-rover','defender-110':'land-rover','defender-130':'land-rover',
    'range-rover':'land-rover','range-rover-sport':'land-rover',
    'range-rover-evoque':'land-rover','range-rover-velar':'land-rover',
  };
  const make = makeMap[model_slug] || 'land-rover';

  // Fuel mapping AS24.ch : D=diesel, B=essence, E=electrique, M=hybride
  const fuelMap = { diesel:'D', essence:'B', electrique:'E', hybride:'M' };
  const fuelParam = fuel && fuelMap[fuel] ? `&fuel=${fuelMap[fuel]}` : '';

  // Année par défaut : 2018-2026 si non spécifié
  const yMin = yearMin || 2018;
  const yMax = yearMax || 2026;
  // Km par défaut : 0-200000 si non spécifié
  const kMin = kmMin !== undefined ? kmMin : 0;
  const kMax = kmMax || 200000;

  return `https://www.autoscout24.ch/lst/${make}/${model_slug}?atype=C&cy=CH&ustate=U,N&fregfrom=${yMin}&fregto=${yMax}&kmfrom=${kMin}&kmto=${kMax}${fuelParam}&sort=price&desc=0`;
}

// URL plus simple : recherche directe d'un véhicule sur AS24.ch
// Utilisé par le bouton "Voir sur AS24.ch" dans les cartes
export function buildAS24chSearchUrl(listing) {
  if (!listing) return 'https://www.autoscout24.ch';
  
  const makeMap = {
    'macan':'porsche','cayenne':'porsche',
    'defender-90':'land-rover','defender-110':'land-rover','defender-130':'land-rover',
    'range-rover':'land-rover','range-rover-sport':'land-rover',
    'range-rover-evoque':'land-rover','range-rover-velar':'land-rover',
  };
  const make = makeMap[listing.model_slug] || 'land-rover';
  const slug = listing.model_slug || '';
  
  const fuelMap = { diesel:'D', essence:'B', electrique:'E', hybride:'M' };
  const fuelNorm = (() => {
    const f = (listing.fuel_type || '').toLowerCase();
    if (f.includes('diesel')) return 'diesel';
    if (f.includes('electric') || f.includes('elektr')) return 'electrique';
    if (f.includes('hybrid')) return 'hybride';
    if (f.includes('essence') || f.includes('petrol') || f.includes('benzin') || f.includes('gas')) return 'essence';
    return null;
  })();
  const fuelParam = fuelNorm && fuelMap[fuelNorm] ? `&fuel=${fuelMap[fuelNorm]}` : '';
  
  // Année ±2 ans autour de l'année du véhicule
  const year = listing.year;
  const yMin = year ? year - 2 : 2018;
  const yMax = year ? year + 2 : 2026;
  
  // Km ±30% autour du km actuel
  const km = listing.km || 0;
  const kMin = km ? Math.max(0, Math.round(km * 0.7)) : 0;
  const kMax = km ? Math.round(km * 1.3) : 200000;
  
  return `https://www.autoscout24.ch/lst/${make}/${slug}?atype=C&cy=CH&ustate=U,N&fregfrom=${yMin}&fregto=${yMax}&kmfrom=${kMin}&kmto=${kMax}${fuelParam}&sort=price&desc=0`;
}

// ── STATUT CONNEXION ─────────────────────────────────────────

export async function checkConnection() {
  try {
    const { error } = await sb().from('karz_config').select('key').limit(1);
    return !error;
  } catch(e) { return false; }
}

// ══════════════════════════════════════════════════════════════
// BENCHMARKS — Comparables CH validés manuellement
// ══════════════════════════════════════════════════════════════
export async function getBenchmarks(filters = {}) {
  try {
    let q = sb().from('benchmarks').select('*').eq('is_active', true);
    if (filters.model_slug) q = q.eq('model_slug', filters.model_slug);
    if (filters.brand)      q = q.eq('brand', filters.brand);
    if (filters.yearMin)    q = q.gte('year', filters.yearMin);
    if (filters.yearMax)    q = q.lte('year', filters.yearMax);
    if (filters.kmMax)      q = q.lte('km', filters.kmMax);
    if (filters.fuel_type)  q = q.eq('fuel_type', filters.fuel_type);
    q = q.order('year', { ascending: false }).order('km', { ascending: true });
    const { data, error } = await q;
    if (error) { console.error('getBenchmarks:', error); return []; }
    return data || [];
  } catch(e) { console.error('getBenchmarks:', e); return []; }
}

export async function addBenchmark(benchmark) {
  try {
    const { data, error } = await sb()
      .from('benchmarks')
      .upsert([benchmark], { onConflict: 'listing_url' })
      .select();
    if (error) { console.error('addBenchmark:', error); return null; }
    return data?.[0];
  } catch(e) { console.error('addBenchmark:', e); return null; }
}

export async function deleteBenchmark(id) {
  try {
    const { error } = await sb()
      .from('benchmarks')
      .update({ is_active: false })
      .eq('id', id);
    return !error;
  } catch(e) { return false; }
}

export async function updateBenchmark(id, patch) {
  try {
    const { data, error } = await sb()
      .from('benchmarks')
      .update(patch)
      .eq('id', id)
      .select();
    if (error) return null;
    return data?.[0];
  } catch(e) { return null; }
}
