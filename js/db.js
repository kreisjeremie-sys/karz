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
    if (yearMin)  q = q.gte('year', yearMin);
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

// ── STATUT CONNEXION ─────────────────────────────────────────

export async function checkConnection() {
  try {
    const { error } = await sb().from('karz_config').select('key').limit(1);
    return !error;
  } catch(e) { return false; }
}
