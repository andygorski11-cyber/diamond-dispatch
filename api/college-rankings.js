// Vercel serverless function — NCAA D1 college baseball Top 25 (D1Baseball.com poll) via ESPN.
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/rankings";

module.exports = async function handler(req, res) {
  try {
    const r = await fetch(ESPN, { headers: { "User-Agent": "Mozilla/5.0 (DiamondDispatch)" } });
    if (!r.ok) throw new Error(`ESPN ${r.status}`);
    const data = await r.json();

    // prefer the Top 25 poll over tournament seedings
    const poll =
      (data.rankings || []).find((p) => /top\s*25/i.test(p.name)) ||
      (data.rankings || [])[0] || {};

    const teams = (poll.ranks || []).map((t) => ({
      rank: t.current,
      prev: t.previous ?? null,
      trend: t.trend && t.trend !== "-" ? t.trend : null,
      name: t.team?.location || t.team?.name || "",
      abbr: t.team?.abbreviation || "",
      record: t.recordSummary || "",
      logo: t.team?.logos?.[0]?.href || "",
    }));

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ poll: poll.name || "Top 25", updated: poll.lastUpdated || null, teams });
  } catch (e) {
    res.status(502).json({ error: "Failed to load rankings", detail: String(e) });
  }
};
