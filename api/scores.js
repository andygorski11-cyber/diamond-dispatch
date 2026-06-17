// Vercel serverless function — proxies & shapes the public MLB Stats API.
// GET /api/scores            -> most recent date that has games (last 10 days)
// GET /api/scores?date=YYYY-MM-DD -> that exact date's games
const API = "https://statsapi.mlb.com/api/v1/schedule";
const DAY = 86400000;

function etDate(d = new Date()) {
  // YYYY-MM-DD in US Eastern time (MLB schedules by ET calendar day)
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

async function fetchSchedule(params) {
  const qs = new URLSearchParams({
    sportId: "1",
    hydrate: "team,linescore,venue",
    ...params,
  });
  const r = await fetch(`${API}?${qs}`);
  if (!r.ok) throw new Error(`MLB API ${r.status}`);
  return r.json();
}

function side(s) {
  return {
    id: s?.team?.id ?? null,
    name: s?.team?.name ?? "TBD",
    abbr: s?.team?.abbreviation ?? "",
    score: typeof s?.score === "number" ? s.score : null,
    wins: s?.leagueRecord?.wins ?? null,
    losses: s?.leagueRecord?.losses ?? null,
    isWinner: !!s?.isWinner,
  };
}

function shape(g) {
  const ls = g.linescore || {};
  const off = ls.offense || {};
  return {
    gamePk: g.gamePk,
    state: g.status?.abstractGameState || "Preview", // Preview | Live | Final
    detailed: g.status?.detailedState || "",
    startTime: g.gameDate || null,
    startTimeTBD: !!g.status?.startTimeTBD,
    venue: g.venue?.name || "",
    away: side(g.teams?.away),
    home: side(g.teams?.home),
    inning: ls.currentInningOrdinal || null,
    inningState: ls.inningState || null,
    outs: typeof ls.outs === "number" ? ls.outs : null,
    balls: typeof ls.balls === "number" ? ls.balls : null,
    strikes: typeof ls.strikes === "number" ? ls.strikes : null,
    bases: { first: !!off.first, second: !!off.second, third: !!off.third },
  };
}

module.exports = async function handler(req, res) {
  try {
    const date =
      (req.query && req.query.date) ||
      new URL(req.url, "http://localhost").searchParams.get("date");

    let resolvedDate, games;

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const data = await fetchSchedule({ date });
      resolvedDate = date;
      games = data.dates?.[0]?.games || [];
    } else {
      const today = etDate();
      const start = etDate(new Date(Date.now() - 10 * DAY));
      const data = await fetchSchedule({ startDate: start, endDate: today });
      const withGames = (data.dates || []).filter((d) => d.games?.length);
      const last = withGames[withGames.length - 1];
      resolvedDate = last ? last.date : today;
      games = last ? last.games : [];
    }

    // sort: live first, then scheduled, then final
    const rank = { Live: 0, Preview: 1, Final: 2 };
    games = games.map(shape).sort(
      (a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3)
    );

    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ date: resolvedDate, count: games.length, games });
  } catch (e) {
    res.status(502).json({ error: "Failed to load scores", detail: String(e) });
  }
};
