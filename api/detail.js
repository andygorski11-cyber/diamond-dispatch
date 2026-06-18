// Vercel serverless function — detail panel for a favorited player or team.
// GET /api/detail?type=player&id={personId}        -> season stats, next game, starting status
// GET /api/detail?type=player&name={fullName}        -> same, resolves id by name (fallback)
// GET /api/detail?type=team&id={teamId}&league=mlb   -> record/stats + next game + probables
// GET /api/detail?type=team&id={abbr}&league=college -> record + next game (ESPN, best effort)
const MLB = "https://statsapi.mlb.com/api/v1";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball";
const DAY = 86400000;

function curYear() { return new Date().getFullYear(); }
function etYmd(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
}
const num = (v) => (v != null && v !== "" && v !== "-.--" ? v : null);

// ---------- MLB schedule helpers ----------
async function teamSchedule(teamId) {
  const start = etYmd();
  const end = etYmd(new Date(Date.now() + 14 * DAY));
  const qs = new URLSearchParams({
    sportId: "1", teamId: String(teamId), startDate: start, endDate: end,
    hydrate: "probablePitcher,lineups,team,linescore",
  });
  const r = await fetch(`${MLB}/schedule?${qs}`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.dates || []).flatMap((x) => x.games || []);
}
function nextGameOf(games) {
  const live = games.find((g) => g.status?.abstractGameState === "Live");
  if (live) return live;
  const upcoming = games.filter((g) => g.status?.abstractGameState !== "Final");
  return upcoming[0] || games[games.length - 1] || null;
}
function gameShape(g, myTeamId) {
  if (!g) return null;
  const home = g.teams?.home || {}, away = g.teams?.away || {};
  const iAmHome = home.team?.id === myTeamId;
  const me = iAmHome ? home : away, opp = iAmHome ? away : home;
  return {
    startTime: g.gameDate || null,
    status: g.status?.abstractGameState || "Preview",
    detailed: g.status?.detailedState || "",
    home: iAmHome,
    venue: g.venue?.name || "",
    opponent: opp.team?.name || "TBD",
    oppId: opp.team?.id ?? null,
    myProbable: me.probablePitcher ? { id: me.probablePitcher.id, name: me.probablePitcher.fullName } : null,
    oppProbable: opp.probablePitcher ? { id: opp.probablePitcher.id, name: opp.probablePitcher.fullName } : null,
    lineups: g.lineups || null,
    iAmHome,
  };
}

// ---------- player ----------
async function resolvePlayerId(name) {
  let season = curYear();
  let r = await fetch(`${MLB}/sports/1/players?season=${season}`);
  let people = r.ok ? (await r.json()).people || [] : [];
  if (!people.length) { season -= 1; r = await fetch(`${MLB}/sports/1/players?season=${season}`); people = r.ok ? (await r.json()).people || [] : []; }
  const lc = name.toLowerCase();
  const hit = people.find((p) => (p.fullName || "").toLowerCase() === lc) || people.find((p) => (p.fullName || "").toLowerCase().includes(lc));
  return hit ? hit.id : null;
}

async function playerDetail(id) {
  const pr = await fetch(`${MLB}/people/${id}?hydrate=currentTeam`);
  if (!pr.ok) throw new Error(`MLB person ${pr.status}`);
  const person = (await pr.json()).people?.[0];
  if (!person) throw new Error("Player not found");
  const isPitcher = person.primaryPosition?.abbreviation === "P";
  const teamId = person.currentTeam?.id ?? null;

  let season = curYear();
  const grp = isPitcher ? "pitching" : "hitting";
  let sr = await fetch(`${MLB}/people/${id}/stats?stats=season&group=${grp}&season=${season}`);
  let stat = sr.ok ? (await sr.json()).stats?.[0]?.splits?.[0]?.stat : null;
  if (!stat) { season -= 1; sr = await fetch(`${MLB}/people/${id}/stats?stats=season&group=${grp}&season=${season}`); stat = sr.ok ? (await sr.json()).stats?.[0]?.splits?.[0]?.stat : null; }
  stat = stat || {};

  const statline = isPitcher
    ? [
        { label: "W-L", value: `${stat.wins ?? 0}-${stat.losses ?? 0}` },
        { label: "ERA", value: num(stat.era) || "—" },
        { label: "SO", value: stat.strikeOuts ?? "—" },
        { label: "WHIP", value: num(stat.whip) || "—" },
        { label: "IP", value: num(stat.inningsPitched) || "—" },
        { label: "SV", value: stat.saves ?? 0 },
      ]
    : [
        { label: "AVG", value: num(stat.avg) || "—" },
        { label: "HR", value: stat.homeRuns ?? "—" },
        { label: "RBI", value: stat.rbi ?? "—" },
        { label: "OPS", value: num(stat.ops) || "—" },
        { label: "R", value: stat.runs ?? "—" },
        { label: "SB", value: stat.stolenBases ?? "—" },
      ];

  const games = teamId ? await teamSchedule(teamId) : [];
  const ng = gameShape(nextGameOf(games), teamId);

  // starting status
  let starting = { state: "unknown", text: "No upcoming game found." };
  if (ng) {
    if (isPitcher) {
      if (ng.myProbable && ng.myProbable.id === id)
        starting = { state: "yes", text: `Probable starter vs ${ng.opponent}` };
      else if (ng.myProbable)
        starting = { state: "no", text: `Not starting — ${ng.myProbable.name} probable` };
      else
        starting = { state: "unknown", text: "Probable pitcher not announced yet." };
    } else {
      const lp = ng.lineups ? (ng.iAmHome ? ng.lineups.homePlayers : ng.lineups.awayPlayers) : null;
      if (lp && lp.length) {
        const idx = lp.findIndex((p) => p.id === id);
        starting = idx >= 0
          ? { state: "yes", text: `In the lineup — batting ${idx + 1}` }
          : { state: "no", text: "Not in today's posted lineup." };
      } else {
        starting = { state: "pending", text: "Lineup not posted yet (set near game time)." };
      }
    }
  }

  return {
    type: "player", id, name: person.fullName,
    position: person.primaryPosition?.abbreviation || "",
    teamId, teamName: person.currentTeam?.name || "",
    season, statline, nextGame: ng, starting,
  };
}

// ---------- MLB team ----------
async function mlbTeamDetail(teamId) {
  let season = curYear();
  const qs = (s) => new URLSearchParams({ leagueId: "103,104", season: String(s), standingsTypes: "regularSeason" });
  let r = await fetch(`${MLB}/standings?${qs(season)}`);
  let recs = r.ok ? (await r.json()).records?.flatMap((x) => x.teamRecords || []) || [] : [];
  if (!recs.length) { season -= 1; r = await fetch(`${MLB}/standings?${qs(season)}`); recs = r.ok ? (await r.json()).records?.flatMap((x) => x.teamRecords || []) || [] : []; }
  const t = recs.find((x) => x.team?.id === teamId);

  const last10 = t?.records?.splitRecords?.find((s) => s.type === "lastTen");
  const statline = t ? [
    { label: "Record", value: `${t.wins}-${t.losses}` },
    { label: "PCT", value: t.winningPercentage || "—" },
    { label: "Streak", value: t.streak?.streakCode || "—" },
    { label: "Last 10", value: last10 ? `${last10.wins}-${last10.losses}` : "—" },
    { label: "RS", value: t.runsScored ?? "—" },
    { label: "RA", value: t.runsAllowed ?? "—" },
  ] : [];

  const games = await teamSchedule(teamId);
  const ng = gameShape(nextGameOf(games), teamId);

  return { type: "team", league: "mlb", id: teamId, name: t?.team?.name || "", season, statline, nextGame: ng };
}

// ---------- college team (best effort) ----------
async function collegeTeamDetail(abbr) {
  try {
    const r = await fetch(`${ESPN}/teams/${abbr}/schedule`, { headers: { "User-Agent": "Mozilla/5.0 (DiamondDispatch)" } });
    if (!r.ok) return { type: "team", league: "college", id: abbr, name: abbr, statline: [], nextGame: null, note: "Schedule unavailable." };
    const d = await r.json();
    const team = d.team || {};
    const events = d.events || [];
    const now = Date.now();
    const next = events.find((e) => new Date(e.date).getTime() >= now) || null;
    let ng = null;
    if (next) {
      const comp = next.competitions?.[0] || {};
      const comps = comp.competitors || [];
      const opp = comps.find((c) => c.team?.id !== team.id);
      ng = {
        startTime: next.date, status: comp.status?.type?.state === "post" ? "Final" : "Preview",
        detailed: comp.status?.type?.shortDetail || "",
        home: (comps.find((c) => c.homeAway === "home")?.team?.id) === team.id,
        venue: comp.venue?.fullName || "", opponent: opp?.team?.displayName || "TBD",
        myProbable: null, oppProbable: null, lineups: null,
      };
    }
    const rec = team.recordSummary || (team.record?.items?.[0]?.summary) || "";
    const statline = rec ? [{ label: "Record", value: rec }] : [];
    return { type: "team", league: "college", id: abbr, name: team.displayName || abbr, statline, nextGame: ng };
  } catch (e) {
    return { type: "team", league: "college", id: abbr, name: abbr, statline: [], nextGame: null, note: "Schedule unavailable." };
  }
}

module.exports = async function handler(req, res) {
  try {
    const q = req.query || new URL(req.url, "http://localhost").searchParams;
    const get = (k) => (q.get ? q.get(k) : q[k]);
    const type = (get("type") || "").toLowerCase();
    const league = (get("league") || "mlb").toLowerCase();
    const id = get("id");
    const name = get("name");

    let data;
    if (type === "player") {
      let pid = id && /^\d+$/.test(id) ? Number(id) : null;
      if (!pid && name) pid = await resolvePlayerId(name);
      if (!pid) { res.status(404).json({ error: "Player not found" }); return; }
      data = await playerDetail(pid);
    } else if (type === "team" && league === "college") {
      data = await collegeTeamDetail(id);
    } else if (type === "team") {
      data = await mlbTeamDetail(Number(id));
    } else {
      res.status(400).json({ error: "Bad request" }); return;
    }

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "Failed to load detail", detail: String(e) });
  }
};
