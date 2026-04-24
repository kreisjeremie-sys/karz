// api/search.js
// Fonction serverless Vercel — proxy entre KARZ et Apify
// Résout le problème CORS : c'est le serveur qui appelle Apify, pas le navigateur

export default async function handler(req, res) {
  // CORS headers — permet à karz-rho.vercel.app d'appeler cette fonction
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return res.status(500).json({ error: 'APIFY_TOKEN non configuré dans Vercel' });
  }

  const { searchUrl, maxItems = 25 } = req.body;
  if (!searchUrl) {
    return res.status(400).json({ error: 'searchUrl manquant' });
  }

  const input = {
    startUrls: [{ url: searchUrl }],
    maxItems: Math.min(maxItems, 50),
  };

  // Liste d'actors Apify à essayer dans l'ordre
  const ACTORS = [
    'automation-lab~autoscout24-scraper',
    'solidcode~autoscout24-scraper',
    'blackfalcondata~autoscout24-scraper',
  ];

  let lastError = null;

  for (const actor of ACTORS) {
    try {
      const apifyResp = await fetch(
        `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120&memory=512`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      );

      if (apifyResp.status === 402) {
        return res.status(402).json({ error: 'Crédits Apify insuffisants. Vérifiez console.apify.com/billing' });
      }

      if (apifyResp.status === 404) {
        // Actor not found, try next
        lastError = `Actor ${actor} non trouvé`;
        continue;
      }

      if (!apifyResp.ok) {
        const errText = await apifyResp.text().catch(() => '');
        lastError = `HTTP ${apifyResp.status} — ${errText.slice(0, 200)}`;
        continue;
      }

      const data = await apifyResp.json();
      return res.status(200).json({ success: true, items: data, actor });

    } catch (e) {
      lastError = e.message;
      continue;
    }
  }

  return res.status(500).json({
    error: `Tous les actors Apify ont échoué. Dernière erreur : ${lastError}`,
    searchUrl,
  });
}
