// Vercel serverless function — NCAA Division I college baseball scores via ESPN's API.
// GET /api/college                 -> most recent date with games (handles offseason gaps)
// GET /api/college?date=YYYY-MM-DD  -> that date's games
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/scoreboard";
const DAY = 86400000;
const STATE = { pre: "Preview", in: "Live", post: "Final" };

function etParts(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {});
}
function etYmd(d) { const p = etParts(d); return `${p.year}-${p.month}-${p.day}`; }
function compact(ymd) { return ymd.replace(/-/g, ""); }

async function fetchDay(ymd) {
  const r = await fetch(`${ESPN}?dates=${compact(ymd)}&limit=200`, {
    headers: { "User-Agent": "Mozilla/5.0 (DiamondDispatch)" },
  });
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  return r.json();
}

function rankOf(c) {
  const n = c?.curatedRank?.current;
  return typeof n === "number" && n > 0 && n <= 25 ? n : null;
}
function side(c) {
  return {
    name: c?.team?.shortDisplayName || c?.team?.name || "TBD",
    full: c?.team?.displayName || "",
    abbr: c?.team?.abbreviation || "",
    score: c?.score != null && c.score !== "" ? Number(c.score) : null,
    rank: rankOf(c),
    record: c?.records?.[0]?.summary || "",
    winner: !!c?.winner,
    logo: c?.team?.logo || "",
    color: c?.team?.color ? `#${c.team.color}` : null,
  };
}

function shape(ev) {
  const c = ev.competitions?.[0] || {};
  const comps = c.competitors || [];
  const away = side(comps.find((x) => x.homeAway === "away"));
  const home = side(comps.find((x) => x.homeAway === "home"));
  const st = c.status?.type || {};
  const note = c.notes?.[0]?.headline || "";
  const sit = c.situation || null;
  return {
    id: ev.id,
    state: STATE[st.state] || "Preview",
    detail: st.shortDetail || st.description || "",
    startTime: ev.date || null,
    venue: c.venue?.fullName || "",
    city: c.venue?.address?.city || "",
    isCWS: /college world series/i.test(note),
    note,
    away, home,
    situation: sit
      ? {
          balls: sit.balls ?? null, strikes: sit.strikes ?? null, outs: sit.outs ?? null,
          bases: { first: !!sit.onFirst, second: !!sit.onSecond, third: !!sit.onThird },
        }
      : null,
  };
}

module.exports = async function handler(req, res) {
  try {
    const date =
      (req.query && req.query.date) ||
      new URL(req.url, "http://localhost").searchParams.get("date");

    let resolvedDate, events;

    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      resolvedDate = date;
      events = (await fetchDay(date)).events || [];
    } else {
      // walk back from today until we find a day with games (offseason-safe)
      let probe = new Date();
      events = [];
      resolvedDate = etYmd(probe);
      for (let i = 0; i < 14; i++) {
        const ymd = etYmd(probe);
        const data = await fetchDay(ymd);
        if (data.events && data.events.length) { resolvedDate = ymd; events = data.events; break; }
        probe = new Date(probe.getTime() - DAY);
      }
    }

    const rank = { Live: 0, Preview: 1, Final: 2 };
    let games = events.map(shape).sort((a, b) => {
      if (a.isCWS !== b.isCWS) return a.isCWS ? -1 : 1;        // CWS first
      return (rank[a.state] ?? 3) - (rank[b.state] ?? 3);      // then live/sched/final
    });

    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ date: resolvedDate, count: games.length, games });
  } catch (e) {
    res.status(502).json({ error: "Failed to load college scores", detail: String(e) });
  }
};
