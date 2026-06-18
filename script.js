// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, "0");

function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function prettyDate(s) {
  return parseYmd(s).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function localTime(iso) {
  if (!iso) return "TBD";
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  catch { return "TBD"; }
}
function mlbLogo(id) { return id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : ""; }
const BALL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%E2%9A%BE%3C/text%3E%3C/svg%3E";

// ---------- normalization (MLB + College -> one shape) ----------
function finalBadge(inning) {
  if (inning && inning !== "9th") return `Final/${inning.replace(/\D/g, "")}`;
  return "Final";
}
function mlbTeam(t, opp, state) {
  const final = state === "Final";
  return {
    logo: mlbLogo(t.id), abbr: t.abbr || t.name, name: t.name,
    record: t.wins != null ? `${t.wins}-${t.losses}` : "",
    score: t.score, rank: null, won: final && t.isWinner,
    lost: final && t.score != null && opp.score != null && t.score < opp.score,
  };
}
function normMlb(g) {
  return {
    id: g.gamePk, state: g.state, isCWS: false, note: "", venue: g.venue,
    away: mlbTeam(g.away, g.home, g.state),
    home: mlbTeam(g.home, g.away, g.state),
    live: {
      label: `${g.inningState || ""} ${g.inning || ""}`.trim(),
      count: g.balls != null && g.strikes != null ? `${g.balls}-${g.strikes}` : "",
      outs: g.outs, bases: g.bases,
    },
    badge: g.state === "Final" ? finalBadge(g.inning) : g.startTimeTBD ? "TBD" : localTime(g.startTime),
  };
}
function collTeam(t, opp, state) {
  const final = state === "Final";
  return {
    logo: t.logo, abbr: t.abbr || t.name, name: t.name, record: t.record || "",
    score: t.score, rank: t.rank, won: final && t.winner,
    lost: final && t.score != null && opp.score != null && t.score < opp.score,
  };
}
function normColl(g) {
  const s = g.situation;
  return {
    id: g.id, state: g.state, isCWS: g.isCWS, note: g.note,
    venue: g.city ? `${g.venue} · ${g.city}` : g.venue,
    away: collTeam(g.away, g.home, g.state),
    home: collTeam(g.home, g.away, g.state),
    live: {
      label: g.detail,
      count: s && s.balls != null && s.strikes != null ? `${s.balls}-${s.strikes}` : "",
      outs: s ? s.outs : null, bases: s ? s.bases : null,
    },
    badge: g.state === "Final" ? "Final" : localTime(g.startTime),
  };
}

const LEAGUES = {
  mlb:     { url: (d) => (d ? `/api/scores?date=${d}` : `/api/scores`),  norm: normMlb },
  college: { url: (d) => (d ? `/api/college?date=${d}` : `/api/college`), norm: normColl },
};

// ---------- state ----------
let currentLeague = "mlb";
let currentDate = null;
let refreshTimer = null;

// ---------- scores ----------
async function loadScores(date) {
  const grid = $("#gamesGrid");
  const league = currentLeague;        // pin the league this request belongs to
  const lg = LEAGUES[league];
  try {
    const res = await fetch(lg.url(date));
    if (league !== currentLeague) return;   // user switched tabs mid-flight — discard
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (league !== currentLeague) return;   // re-check after awaiting the body
    currentDate = data.date;
    $("#dateText").textContent = prettyDate(data.date);
    $("#todayBtn").hidden = false;
    updateCws(data.games);
    renderGames(data.games.map(lg.norm));
    scheduleRefresh(data.games.map(lg.norm));
  } catch (err) {
    if (league !== currentLeague) return;
    grid.innerHTML = `<div class="state-msg error">Couldn't load scores (${err.message}). <button class="linkbtn" id="retry">Retry</button></div>`;
    const r = $("#retry"); if (r) r.onclick = () => loadScores(currentDate);
  }
}

function updateCws(rawGames) {
  const banner = $("#cwsBanner");
  const cws = currentLeague === "college" && rawGames.some((g) => g.isCWS);
  banner.hidden = !cws;
  if (cws) {
    const live = rawGames.filter((g) => g.isCWS && g.state === "Live").length;
    $("#cwsText").textContent = live
      ? `${live} game${live > 1 ? "s" : ""} live now from Charles Schwab Field, Omaha`
      : "Live & recent games from Charles Schwab Field, Omaha";
  }
}

function teamRow(t) {
  const rec = t.record ? `<span class="rec">${t.record}</span>` : "";
  const rank = t.rank ? `<span class="rank">#${t.rank}</span>` : "";
  return `
    <div class="team ${t.lost ? "team-lost" : ""} ${t.won ? "team-won" : ""}">
      <img class="team-logo" src="${t.logo}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${BALL}'" />
      <span class="team-name">${rank}<span class="abbr">${t.abbr}</span> ${rec}</span>
      <span class="team-score">${t.score != null ? t.score : ""}</span>
    </div>`;
}

function basesSvg(b = {}) {
  const on = (k) => (b && b[k] ? "on" : "");
  return `<svg viewBox="0 0 34 24" width="34" height="24" aria-hidden="true">
    <rect class="base ${on("second")}" x="13" y="2" width="8" height="8" transform="rotate(45 17 6)"/>
    <rect class="base ${on("third")}" x="3" y="12" width="8" height="8" transform="rotate(45 7 16)"/>
    <rect class="base ${on("first")}" x="23" y="12" width="8" height="8" transform="rotate(45 27 16)"/>
  </svg>`;
}

function statusBlock(g) {
  if (g.state === "Live") {
    const outs = g.live.outs != null ? `${g.live.outs} out${g.live.outs === 1 ? "" : "s"}` : "";
    const extra = [g.live.count, outs].filter(Boolean).join(" · ");
    return `
      <div class="status status-live">
        <span class="badge badge-live">● LIVE</span>
        <span class="inning">${g.live.label || ""}</span>
        <div class="bases">${basesSvg(g.live.bases)}</div>
        <span class="count">${extra}</span>
      </div>`;
  }
  if (g.state === "Final") {
    return `<div class="status"><span class="badge badge-final">${g.badge}</span></div>`;
  }
  return `<div class="status"><span class="badge badge-prev">${g.badge}</span><span class="sched">Scheduled</span></div>`;
}

function renderGames(games) {
  const grid = $("#gamesGrid");
  if (!games || !games.length) {
    grid.innerHTML = `<div class="state-msg">No games scheduled for this date.</div>`;
    return;
  }
  grid.innerHTML = games.map((g) => {
    const hasGc = g.id != null && (g.state === "Live" || g.state === "Final");
    return `
    <article class="game ${g.state === "Live" ? "game-live" : ""} ${g.isCWS ? "game-cws" : ""}">
      ${g.isCWS ? `<div class="cws-chip">🏆 ${g.note || "College World Series"}</div>` : ""}
      <div class="teams">${teamRow(g.away)}${teamRow(g.home)}</div>
      ${statusBlock(g)}
      ${g.venue ? `<div class="venue">${g.venue}</div>` : ""}
      ${hasGc ? `<button class="gc-btn" data-gc="${g.id}">${g.state === "Live" ? "📺 Gamecast" : "📋 Box score"}<span class="gc-caret">▾</span></button>
      <div class="gamecast" id="gc-${g.id}" hidden></div>` : ""}
    </article>`;
  }).join("");
  restoreGamecasts();
}

function scheduleRefresh(games) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const anyLive = games.some((g) => g.state === "Live");
  $("#refreshInfo").textContent = anyLive ? "Auto-refreshing live games…" : "";
  if (anyLive) refreshTimer = setTimeout(() => loadScores(currentDate), 30000);
}

// ---------- gamecast ----------
const openGc = new Set();      // ids with an expanded gamecast
const gcTimers = new Map();    // id -> refresh interval

function playInning(p) {
  if (!p.inning) return "";
  const arrow = p.half === "top" ? "▲" : p.half === "bottom" ? "▼" : "";
  return `${arrow}${p.inning}`;
}

function gcLinescore(g) {
  if (!g.innings || !g.innings.length) return "";
  const head = g.innings.map((i) => `<th>${i.num}</th>`).join("");
  const cell = (v) => `<td>${v != null && v !== "" ? v : ""}</td>`;
  const row = (sideKey, t) => {
    const cells = g.innings.map((i) => cell(i[sideKey])).join("");
    const tot = g.totals[sideKey] || {};
    return `<tr><td class="gc-team">${t.abbr || t.name || ""}</td>${cells}
      <td class="gc-tot">${tot.r != null ? tot.r : ""}</td>
      <td class="gc-tot">${tot.h != null ? tot.h : ""}</td>
      <td class="gc-tot">${tot.e != null ? tot.e : ""}</td></tr>`;
  };
  return `<table class="gc-line">
    <thead><tr><th></th>${head}<th class="gc-tot">R</th><th class="gc-tot">H</th><th class="gc-tot">E</th></tr></thead>
    <tbody>${row("away", g.away)}${row("home", g.home)}</tbody>
  </table>`;
}

function gamecastHtml(g) {
  let now = "";
  if (g.state === "Live") {
    const outs = g.count.outs != null ? `${g.count.outs} out${g.count.outs === 1 ? "" : "s"}` : "";
    const cnt = g.count.balls != null && g.count.strikes != null ? `${g.count.balls}-${g.count.strikes}` : "";
    const meta = [cnt && `${cnt} count`, outs].filter(Boolean).join(" · ");
    now = `
      <div class="gc-now">
        <div class="gc-matchup">
          <div class="gc-inning">${g.inningLabel || "Live"}</div>
          ${g.batter ? `<div class="gc-role"><span>AB</span>${g.batter}</div>` : ""}
          ${g.pitcher ? `<div class="gc-role"><span>P</span>${g.pitcher}</div>` : ""}
        </div>
        <div class="gc-state">
          <div class="bases gc-bases">${basesSvg(g.bases)}</div>
          ${meta ? `<div class="gc-count">${meta}</div>` : ""}
        </div>
      </div>
      ${g.lastPlay ? `<div class="gc-last"><span>Last play</span>${g.lastPlay}</div>` : ""}`;
  }
  const line = g.innings && g.innings.length
    ? `<div class="gc-block"><h4>Line score</h4>${gcLinescore(g)}</div>` : "";
  const plays = g.recent && g.recent.length
    ? `<div class="gc-block"><h4>Recent plays</h4>${g.recent.map((p) =>
        `<div class="gc-play ${p.scoring ? "scoring" : ""}">
           <span class="gc-pi">${playInning(p)}</span><span class="gc-pd">${p.desc}</span>
         </div>`).join("")}</div>`
    : "";
  if (!now && !line && !plays) return `<div class="gc-msg">No gamecast detail available yet.</div>`;
  return `${now}${line}${plays}`;
}

async function renderGamecast(id) {
  const panel = document.getElementById(`gc-${id}`);
  if (!panel) return;
  const league = currentLeague;        // pin the league this gamecast belongs to
  try {
    const res = await fetch(`/api/gamecast?league=${league}&id=${id}`);
    if (league !== currentLeague || !openGc.has(id)) return;  // tab switched / panel closed
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (league !== currentLeague || !openGc.has(id)) return;
    panel.innerHTML = gamecastHtml(data);
  } catch (err) {
    if (league !== currentLeague || !openGc.has(id)) return;
    panel.innerHTML = `<div class="gc-msg error">Gamecast unavailable (${err.message}).</div>`;
  }
}

function openGamecast(id) {
  openGc.add(id);
  const panel = document.getElementById(`gc-${id}`);
  const btn = document.querySelector(`.gc-btn[data-gc="${id}"]`);
  if (btn) btn.classList.add("open");
  if (panel) { panel.hidden = false; panel.innerHTML = `<div class="gc-msg">Loading gamecast…</div>`; }
  renderGamecast(id);
  if (gcTimers.has(id)) clearInterval(gcTimers.get(id));
  gcTimers.set(id, setInterval(() => renderGamecast(id), 12000));
}

function closeGamecast(id) {
  openGc.delete(id);
  if (gcTimers.has(id)) { clearInterval(gcTimers.get(id)); gcTimers.delete(id); }
  const panel = document.getElementById(`gc-${id}`);
  const btn = document.querySelector(`.gc-btn[data-gc="${id}"]`);
  if (btn) btn.classList.remove("open");
  if (panel) { panel.hidden = true; panel.innerHTML = ""; }
}

function toggleGamecast(id) {
  if (openGc.has(id)) closeGamecast(id);
  else openGamecast(id);
}

function closeAllGamecasts() {
  for (const id of [...openGc]) closeGamecast(id);
}

// after a re-render of the grid, re-open any gamecasts that were expanded
function restoreGamecasts() {
  for (const id of [...openGc]) {
    const panel = document.getElementById(`gc-${id}`);
    if (!panel) {  // game dropped off this view
      if (gcTimers.has(id)) { clearInterval(gcTimers.get(id)); gcTimers.delete(id); }
      openGc.delete(id);
      continue;
    }
    panel.hidden = false;
    const btn = document.querySelector(`.gc-btn[data-gc="${id}"]`);
    if (btn) btn.classList.add("open");
    renderGamecast(id);
    if (!gcTimers.has(id)) gcTimers.set(id, setInterval(() => renderGamecast(id), 12000));
  }
}

function shiftDay(delta) {
  if (!currentDate) return;
  const d = parseYmd(currentDate);
  d.setDate(d.getDate() + delta);
  loadScores(ymd(d));
}

$("#prevDay").onclick = () => { closeAllGamecasts(); shiftDay(-1); };
$("#nextDay").onclick = () => { closeAllGamecasts(); shiftDay(1); };
$("#todayBtn").onclick = () => { closeAllGamecasts(); loadScores(null); };

// expand/collapse a game's gamecast (event delegation survives grid re-renders)
$("#gamesGrid").addEventListener("click", (e) => {
  const btn = e.target.closest(".gc-btn");
  if (btn) toggleGamecast(btn.dataset.gc);
});

document.querySelectorAll(".lg-btn").forEach((btn) => {
  btn.onclick = () => {
    if (btn.dataset.league === currentLeague) return;
    closeAllGamecasts();
    currentLeague = btn.dataset.league;
    document.querySelectorAll(".lg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    $("#gamesGrid").innerHTML = `<div class="state-msg">Loading scores…</div>`;
    loadScores(null);
  };
});

// ---------- MLB standings ----------
async function loadStandings() {
  const wrap = $("#divisions");
  try {
    const res = await fetch("/api/standings");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    $("#standingsSub").textContent = `${data.season} season · updated from the live MLB feed.`;
    wrap.innerHTML = data.divisions.map(divisionCard).join("");
  } catch (err) {
    wrap.innerHTML = `<div class="state-msg error">Couldn't load standings (${err.message}).</div>`;
  }
}
function divisionCard(div) {
  const rows = div.teams.map((t, i) => `
    <tr class="${i === 0 ? "leader" : ""}">
      <td class="t-team">
        <img class="mini-logo" src="${mlbLogo(t.id)}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${BALL}'" />${t.abbr || t.name}
      </td>
      <td>${t.wins}</td><td>${t.losses}</td><td>${t.pct}</td><td>${t.gb}</td>
      <td class="${t.streak.startsWith("W") ? "streak-w" : "streak-l"}">${t.streak}</td>
    </tr>`).join("");
  return `
    <div class="division">
      <h3>${div.name}</h3>
      <table class="stand-table">
        <thead><tr><th>Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>STRK</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ---------- College Top 25 ----------
async function loadRankings() {
  const wrap = $("#rankings");
  try {
    const res = await fetch("/api/college-rankings");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    $("#rankSub").textContent = `${data.poll} · NCAA Division I baseball`;
    wrap.innerHTML = data.teams.map((t) => {
      const trend = t.trend
        ? `<span class="trend ${t.trend.startsWith("-") ? "down" : "up"}">${t.trend.startsWith("-") ? "▼" : "▲"}${t.trend.replace(/\D/g, "")}</span>`
        : "";
      return `
        <div class="rank-row">
          <span class="rk">${t.rank}</span>
          <img class="mini-logo" src="${t.logo}" alt="" loading="lazy"
               onerror="this.onerror=null;this.src='${BALL}'" />
          <span class="rk-name">${t.name}</span>
          <span class="rk-rec">${t.record}</span>
          ${trend}
        </div>`;
    }).join("");
  } catch (err) {
    wrap.innerHTML = `<div class="state-msg error">Couldn't load rankings (${err.message}).</div>`;
  }
}

// ---------- stat leaders ----------
let currentStatLeague = "mlb";

async function loadLeaders(league) {
  const body = $("#statsBody");
  body.innerHTML = `<div class="state-msg">Loading stats…</div>`;
  try {
    const res = await fetch(`/api/leaders?league=${league}`);
    if (league !== currentStatLeague) return;   // tab switched mid-flight — discard
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (league !== currentStatLeague) return;   // re-check after awaiting the body

    if (data.available === false) {
      $("#statsSub").textContent = "Season hitting and team leaders, straight from the live feed.";
      body.innerHTML = `<div class="state-msg">${data.note || "Stat leaders aren't available for this league yet."}</div>`;
      return;
    }
    $("#statsSub").textContent = `${data.season} season · top hitters and teams from the live MLB feed.`;
    body.innerHTML = leadersHtml(data);
  } catch (err) {
    if (league !== currentStatLeague) return;
    body.innerHTML = `<div class="state-msg error">Couldn't load stats (${err.message}). <button class="linkbtn" id="statRetry">Retry</button></div>`;
    const r = $("#statRetry");
    if (r) r.onclick = () => loadLeaders(currentStatLeague);
  }
}

function leaderCard(block) {
  const rows = (block.leaders || []).map((l) => `
    <li class="lr-row">
      <span class="lr-rank">${l.rank ?? ""}</span>
      <img class="mini-logo" src="${mlbLogo(l.teamId)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${BALL}'" />
      <span class="lr-name">${l.name}</span>
      <span class="lr-val">${l.value}</span>
    </li>`).join("");
  return `
    <div class="leader-card">
      <h3>${block.label}</h3>
      <ol class="leader-list">${rows || `<li class="lr-row"><span class="lr-name">No data.</span></li>`}</ol>
    </div>`;
}

function teamPctTable(teams) {
  const rows = (teams || []).map((t) => `
    <tr class="${t.rank === 1 ? "leader" : ""}">
      <td class="t-rank">${t.rank}</td>
      <td class="t-team">
        <img class="mini-logo" src="${mlbLogo(t.id)}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${BALL}'" />${t.name}
      </td>
      <td>${t.wins}</td><td>${t.losses}</td><td class="t-pct">${t.pct}</td>
    </tr>`).join("");
  return `
    <div class="leader-card team-leader">
      <h3>Team Win %</h3>
      <table class="stand-table pct-table">
        <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PCT</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function leadersHtml(data) {
  const p = data.players || {};
  return `
    <div class="leaders-grid">
      ${["avg", "ops", "slg"].map((k) => (p[k] ? leaderCard(p[k]) : "")).join("")}
      ${teamPctTable(data.teams)}
    </div>`;
}

document.querySelectorAll(".slg-btn").forEach((btn) => {
  btn.onclick = () => {
    if (btn.dataset.league === currentStatLeague) return;
    currentStatLeague = btn.dataset.league;
    document.querySelectorAll(".slg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    loadLeaders(currentStatLeague);
  };
});

// ---------- boot ----------
$("#year").textContent = new Date().getFullYear();
loadScores(null);
loadStandings();
loadRankings();
loadLeaders(currentStatLeague);
setInterval(loadStandings, 600000);
