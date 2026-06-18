// Vercel serverless function — season stat leaders.
// GET /api/leaders?league=mlb      -> top hitters (AVG/OPS/SLG) + top teams by win%
// GET /api/leaders?league=college  -> note (NCAA stat leaders not published by the feed)
const STATS = "https://statsapi.mlb.com/api/v1/stats/leaders";
const STAND = "https://statsapi.mlb.com/api/v1/standings";

const CATS = [
  { key: "avg", cat: "battingAverage", label: "Batting Average" },
  { key: "ops", cat: "onBasePlusSlugging", label: "OPS" },
  { key: "slg", cat: "sluggingPercentage", label: "Slugging %" },
];

function curYear() {
  return new Date().getFullYear();
}

async function fetchLeaders(season) {
  const qs = new URLSearchParams({
    leaderCategories: CATS.map((c) => c.cat).join(","),
    statGroup: "hitting",
    season: String(season),
    sportId: "1",
    limit: "10",
  });
  const r = await fetch(`${STATS}?${qs}`);
  if (!r.ok) throw new Error(`MLB leaders ${r.status}`);
  return r.json();
}

function shapeLeaders(data) {
  const byCat = {};
  for (const c of CATS) {
    const block = (data.leagueLeaders || []).find((b) => b.leaderCategory === c.cat);
    byCat[c.key] = {
      label: c.label,
      leaders: (block?.leaders || []).map((l) => ({
        rank: Number(l.rank) || null,
        value: l.value,
        name: l.person?.fullName || "",
        teamId: l.team?.id ?? null,
        teamName: l.team?.name || "",
      })),
    };
  }
  return byCat;
}

async function fetchTeamPct(season) {
  const qs = new URLSearchParams({
    leagueId: "103,104",
    season: String(season),
    standingsTypes: "regularSeason",
  });
  const r = await fetch(`${STAND}?${qs}`);
  if (!r.ok) throw new Error(`MLB standings ${r.status}`);
  const d = await r.json();
  const teams = (d.records || []).flatMap((x) => x.teamRecords || []);
  return teams
    .map((t) => ({
      id: t.team?.id ?? null,
      name: t.team?.name || "",
      wins: t.wins ?? null,
      losses: t.losses ?? null,
      pct: t.winningPercentage || "",
    }))
    .sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct))
    .slice(0, 10)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

module.exports = async function handler(req, res) {
  try {
    const q = req.query || new URL(req.url, "http://localhost").searchParams;
    const get = (k) => (q.get ? q.get(k) : q[k]);
    const league = (get("league") || "mlb").toLowerCase();

    if (league === "college") {
      res.setHeader("Cache-Control", "s-maxage=3600");
      res.status(200).json({
        league: "college",
        available: false,
        note: "NCAA stat leaders aren't published in the public college-baseball feed. Player and team leaders appear here for MLB; college leaders return when the feed exposes them in-season.",
      });
      return;
    }

    // try current season, fall back to the previous one in the early offseason
    let season = curYear();
    let raw = await fetchLeaders(season);
    let hasData = (raw.leagueLeaders || []).some((b) => (b.leaders || []).length);
    if (!hasData) {
      season -= 1;
      raw = await fetchLeaders(season);
    }

    const players = shapeLeaders(raw);
    let teams = [];
    try {
      teams = await fetchTeamPct(season);
    } catch (_) {
      teams = [];
    }

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ league: "mlb", season, players, teams });
  } catch (e) {
    res.status(502).json({ error: "Failed to load leaders", detail: String(e) });
  }
};
