// api/search.js — KARZ v9
// Proxy Vercel → Apify. Résout le blocage CORS navigateur.
// mode=search    → sourcing annonces EU (AutoScout24 DE/FR/IT/ES/NL/BE/AT)
// mode=benchmark → benchmark revente CH (AutoScout24.ch)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.APIFY_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'APIFY_TOKEN manquant dans Vercel Environment Variables' });

  const { searchUrl, maxItems = 25, mode = 'search' } = req.body;
  if (!searchUrl) return res.status(400).json({ error: 'searchUrl manquant' });

  const input = {
    startUrls: [{ url: searchUrl }],
    maxItems: Math.min(maxItems, mode === 'benchmark' ? 30 : 50),
  };

  const ACTORS = [
    'automation-lab~autoscout24-scraper',
    'solidcode~autoscout24-scraper',
    'misceres~autoscout24-scraper',
  ];

  let lastError = null;
  for (const actor of ACTORS) {
    try {
      const r = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN}&timeout=120&memory=512`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
      );
      if (r.status === 402) return res.status(402).json({ error: 'Crédits Apify insuffisants — vérifiez console.apify.com/billing' });
      if (r.status === 404) { lastError = `Actor ${actor} non trouvé`; continue; }
      if (!r.ok) { const t = await r.text().catch(() => ''); lastError = `HTTP ${r.status} — ${t.slice(0,200)}`; continue; }
      const data = await r.json();
      return res.status(200).json({ success: true, items: data, actor, mode });
    } catch (e) { lastError = e.message; continue; }
  }
  return res.status(500).json({ error: `Tous les actors Apify ont échoué. Dernière erreur: ${lastError}`, searchUrl });
}
