// Vercel serverless function — a lightweight search index for the favorites search bar.
// GET /api/search-index -> { season, players:[...], mlbTeams:[...], collegeTeams:[...] }
// MLB players + teams come from the MLB Stats API; college teams from ESPN.
const MLB = "https://statsapi.mlb.com/api/v1";
const ESPN_TEAMS =
  "https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/teams?limit=500";

function curYear() { return new Date().getFullYear(); }

async function mlbPlayers(season) {
  const r = await fetch(`${MLB}/sports/1/players?season=${season}`);
  if (!r.ok) throw new Error(`MLB players ${r.status}`);
  return (await r.json()).people || [];
}
async function mlbTeams(season) {
  const r = await fetch(`${MLB}/teams?sportId=1&season=${season}`);
  if (!r.ok) throw new Error(`MLB teams ${r.status}`);
  return (await r.json()).teams || [];
}
async function collegeTeams() {
  try {
    const r = await fetch(ESPN_TEAMS, { headers: { "User-Agent": "Mozilla/5.0 (DiamondDispatch)" } });
    if (!r.ok) return [];
    const d = await r.json();
    const list = d.sports?.[0]?.leagues?.[0]?.teams || [];
    return list.map((x) => x.team).filter(Boolean).map((t) => ({
      id: t.abbreviation || t.id,
      n: t.displayName || t.name || "",
      ab: t.abbreviation || "",
      lo: t.logos?.[0]?.href || "",
    }));
  } catch { return []; }
}

module.exports = async function handler(req, res) {
  try {
    let season = curYear();
    let people = await mlbPlayers(season);
    if (!people.length) { season -= 1; people = await mlbPlayers(season); }
    const teams = await mlbTeams(season);

    const abbrById = {};
    teams.forEach((t) => { abbrById[t.id] = t.abbreviation || ""; });

    const players = people.map((p) => ({
      id: p.id,
      n: p.fullName || "",
      t: p.currentTeam?.id ?? null,
      ta: abbrById[p.currentTeam?.id] || "",
      pos: p.primaryPosition?.abbreviation || "",
    }));

    const mlbTeamList = teams
      .map((t) => ({ id: t.id, n: t.name || "", ab: t.abbreviation || "" }))
      .sort((a, b) => a.n.localeCompare(b.n));

    const college = await collegeTeams();

    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ season, players, mlbTeams: mlbTeamList, collegeTeams: college });
  } catch (e) {
    res.status(502).json({ error: "Failed to build search index", detail: String(e) });
  }
};
