// api/trigger-workflow.js — Déclenche un workflow GitHub Actions
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.GITHUB_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: 'GITHUB_TOKEN manquant' });

  const { workflow } = req.body || {};
  if (!workflow) return res.status(400).json({ error: 'workflow requis' });

  const OWNER = 'kreisjeremie-sys';
  const REPO  = 'karz';

  try {
    const r = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );
    if (r.status === 204) return res.status(200).json({ success: true });
    const txt = await r.text();
    return res.status(r.status).json({ error: txt });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
