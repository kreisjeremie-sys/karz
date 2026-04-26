// api/search.js — Proxy Vercel → Apify
// Utilisé par scrape-eu.js et scrape-ch.js + ajout manuel via URL
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.APIFY_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'APIFY_TOKEN manquant dans Vercel Environment Variables' });

  const { searchUrl, maxItems = 25, source = 'as24' } = req.body || {};
  if (!searchUrl) return res.status(400).json({ error: 'searchUrl requis' });

  const actors = source === 'mobilede'
    ? ['misceres~mobile-de-scraper', 'epctex~mobile-de-scraper']
    : ['automation-lab~autoscout24-scraper', 'misceres~autoscout24-scraper', 'solidcode~autoscout24-scraper'];

  const input = {
    startUrls: [{ url: searchUrl }],
    maxItems: Math.min(maxItems, 50),
  };

  let lastError = null;
  for (const actor of actors) {
    try {
      const r = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN}&timeout=120&memory=512`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
      );
      if (r.status === 402) return res.status(402).json({ error: 'Crédits Apify insuffisants — vérifiez console.apify.com/billing' });
      if (!r.ok) { lastError = `HTTP ${r.status}`; continue; }
      const data = await r.json();
      if (!data?.length) { lastError = '0 résultats'; continue; }
      return res.status(200).json({ success: true, items: data, actor, source, searchUrl });
    } catch(e) { lastError = e.message; continue; }
  }
  return res.status(500).json({ error: `Tous actors ont échoué : ${lastError}`, searchUrl });
}
