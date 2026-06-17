// Vercel serverless function — live MLB division standings via the MLB Stats API.
// GET /api/standings           -> current season
// GET /api/standings?season=2025
const API = "https://statsapi.mlb.com/api/v1/standings";

const DIVISIONS = {
  200: { name: "AL West", league: "American League" },
  201: { name: "AL East", league: "American League" },
  202: { name: "AL Central", league: "American League" },
  203: { name: "NL West", league: "National League" },
  204: { name: "NL East", league: "National League" },
  205: { name: "NL Central", league: "National League" },
};
const ORDER = [201, 202, 200, 204, 205, 203]; // AL E/C/W, NL E/C/W

function curYear() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric",
  }).format(new Date());
  return parseInt(p, 10);
}

async function fetchStandings(season) {
  const qs = new URLSearchParams({
    leagueId: "103,104",
    season: String(season),
    standingsTypes: "regularSeason",
    hydrate: "team",
  });
  const r = await fetch(`${API}?${qs}`);
  if (!r.ok) throw new Error(`MLB API ${r.status}`);
  return r.json();
}

function shapeTeam(t) {
  return {
    id: t.team?.id ?? null,
    name: t.team?.name ?? "",
    abbr: t.team?.abbreviation ?? "",
    wins: t.wins ?? 0,
    losses: t.losses ?? 0,
    pct: t.winningPercentage ?? "",
    gb: t.gamesBack ?? "-",
    streak: t.streak?.streakCode ?? "",
    rank: parseInt(t.divisionRank, 10) || 99,
    runDiff: (t.runsScored ?? 0) - (t.runsAllowed ?? 0),
  };
}

module.exports = async function handler(req, res) {
  try {
    const qSeason =
      (req.query && req.query.season) ||
      new URL(req.url, "http://localhost").searchParams.get("season");
    let season = parseInt(qSeason, 10) || curYear();

    let data = await fetchStandings(season);
    if (!data.records?.length) {
      season -= 1;
      data = await fetchStandings(season);
    }

    const divisions = (data.records || [])
      .map((rec) => {
        const meta = DIVISIONS[rec.division?.id] || { name: "Division", league: "" };
        return {
          id: rec.division?.id,
          name: meta.name,
          league: meta.league,
          teams: (rec.teamRecords || [])
            .map(shapeTeam)
            .sort((a, b) => a.rank - b.rank),
        };
      })
      .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ season, divisions });
  } catch (e) {
    res.status(502).json({ error: "Failed to load standings", detail: String(e) });
  }
};
