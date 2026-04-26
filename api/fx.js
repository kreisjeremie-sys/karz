export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=CHF');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const rate = data?.rates?.CHF;
    if (!rate || rate < 0.8 || rate > 1.5) throw new Error('Taux hors plage');
    return res.status(200).json({ success: true, rate, date: data.date });
  } catch(e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
