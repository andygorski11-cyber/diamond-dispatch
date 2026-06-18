// Vercel serverless function — per-game "gamecast" detail for MLB and college.
// GET /api/gamecast?league=mlb&id={gamePk}     -> MLB live feed (statsapi)
// GET /api/gamecast?league=college&id={eventId} -> ESPN college summary
const MLB = (id) => `https://statsapi.mlb.com/api/v1.1/game/${id}/feed/live`;
const ESPN = (id) =>
  `https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/summary?event=${id}`;
const STATE = { pre: "Preview", in: "Live", post: "Final" };

// ---------- MLB ----------
async function mlbGamecast(id) {
  const r = await fetch(MLB(id));
  if (!r.ok) throw new Error(`MLB ${r.status}`);
  const d = await r.json();

  const gd = d.gameData || {};
  const live = d.liveData || {};
  const ls = live.linescore || {};
  const plays = live.plays || {};
  const cur = plays.currentPlay || {};
  const m = cur.matchup || {};
  const c = cur.count || {};
  const off = ls.offense || {};

  const innings = (ls.innings || []).map((i) => ({
    num: i.num,
    away: i.away?.runs ?? null,
    home: i.home?.runs ?? null,
  }));

  const recent = (plays.allPlays || [])
    .filter((p) => p.result?.description || p.result?.event)
    .slice(-7)
    .reverse()
    .map((p) => ({
      half: p.about?.halfInning || null,
      inning: p.about?.inning ?? null,
      desc: p.result?.description || p.result?.event || "",
      scoring: !!p.about?.isScoringPlay,
    }));

  return {
    league: "mlb",
    state: gd.status?.abstractGameState || "Preview",
    inningLabel:
      ls.inningState && ls.currentInningOrdinal
        ? `${ls.inningState} ${ls.currentInningOrdinal}`
        : gd.status?.detailedState || "",
    count: { balls: c.balls ?? null, strikes: c.strikes ?? null, outs: c.outs ?? null },
    bases: { first: !!off.first, second: !!off.second, third: !!off.third },
    batter: m.batter?.fullName || null,
    pitcher: m.pitcher?.fullName || null,
    lastPlay: cur.result?.description || "",
    away: { abbr: gd.teams?.away?.abbreviation || "", name: gd.teams?.away?.teamName || "" },
    home: { abbr: gd.teams?.home?.abbreviation || "", name: gd.teams?.home?.teamName || "" },
    innings,
    totals: {
      away: {
        r: ls.teams?.away?.runs ?? null,
        h: ls.teams?.away?.hits ?? null,
        e: ls.teams?.away?.errors ?? null,
      },
      home: {
        r: ls.teams?.home?.runs ?? null,
        h: ls.teams?.home?.hits ?? null,
        e: ls.teams?.home?.errors ?? null,
      },
    },
    recent,
  };
}

// ---------- College (ESPN) ----------
async function collGamecast(id) {
  const r = await fetch(ESPN(id), {
    headers: { "User-Agent": "Mozilla/5.0 (DiamondDispatch)" },
  });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  const d = await r.json();

  const comp = d.header?.competitions?.[0] || {};
  const comps = comp.competitors || [];
  const find = (ha) => comps.find((x) => x.homeAway === ha) || {};
  const away = find("away");
  const home = find("home");
  const team = (x) => ({
    abbr: x.team?.abbreviation || "",
    name: x.team?.shortDisplayName || x.team?.name || "",
  });

  const n = Math.max((away.linescores || []).length, (home.linescores || []).length);
  const innings = [];
  for (let i = 0; i < n; i++) {
    innings.push({
      num: i + 1,
      away: away.linescores?.[i]?.value ?? away.linescores?.[i]?.displayValue ?? null,
      home: home.linescores?.[i]?.value ?? home.linescores?.[i]?.displayValue ?? null,
    });
  }

  const sit = d.situation || comp.situation || {};
  const st = comp.status?.type || d.header?.competitions?.[0]?.status?.type || {};
  const num = (v) => (v != null && v !== "" ? Number(v) : null);

  const recent = (d.plays || [])
    .filter((p) => p.text)
    .slice(-7)
    .reverse()
    .map((p) => ({
      half: null,
      inning: p.period?.number ?? null,
      desc: p.text || "",
      scoring: !!p.scoringPlay,
    }));

  const pName = (o) =>
    o?.athlete?.displayName || o?.athlete?.shortName || o?.playerName || null;

  return {
    league: "college",
    state: STATE[st.state] || "Preview",
    inningLabel: st.shortDetail || st.detail || st.description || "",
    count: { balls: sit.balls ?? null, strikes: sit.strikes ?? null, outs: sit.outs ?? null },
    bases: { first: !!sit.onFirst, second: !!sit.onSecond, third: !!sit.onThird },
    batter: pName(sit.batter),
    pitcher: pName(sit.pitcher),
    lastPlay: sit.lastPlay?.text || (recent[0] ? recent[0].desc : ""),
    away: team(away),
    home: team(home),
    innings,
    totals: {
      away: { r: num(away.score), h: num(away.hits), e: num(away.errors) },
      home: { r: num(home.score), h: num(home.hits), e: num(home.errors) },
    },
    recent,
  };
}

module.exports = async function handler(req, res) {
  try {
    const q = req.query || new URL(req.url, "http://localhost").searchParams;
    const get = (k) => (q.get ? q.get(k) : q[k]);
    const league = (get("league") || "mlb").toLowerCase();
    const id = get("id");
    if (!id) {
      res.status(400).json({ error: "Missing id" });
      return;
    }

    const data = league === "college" ? await collGamecast(id) : await mlbGamecast(id);

    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "Failed to load gamecast", detail: String(e) });
  }
};
