// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, "0");

function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function prettyDate(s) {
  const d = parseYmd(s);
  return d.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
function localTime(iso) {
  if (!iso) return "TBD";
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return "TBD"; }
}
function logoUrl(id) {
  return id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : "";
}
const BALL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%E2%9A%BE%3C/text%3E%3C/svg%3E";

// ---------- state ----------
let currentDate = null;     // "YYYY-MM-DD" currently displayed
let refreshTimer = null;

// ---------- scores ----------
async function loadScores(date) {
  const grid = $("#gamesGrid");
  const url = date ? `/api/scores?date=${date}` : "/api/scores";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentDate = data.date;
    $("#dateText").textContent = prettyDate(data.date);
    $("#todayBtn").hidden = false;
    renderGames(data.games);
    scheduleRefresh(data.games);
  } catch (err) {
    grid.innerHTML = `<div class="state-msg error">Couldn't load scores (${err.message}). <button class="linkbtn" id="retry">Retry</button></div>`;
    const r = $("#retry");
    if (r) r.onclick = () => loadScores(currentDate);
  }
}

function teamRow(t, opp, state) {
  const decided = state === "Final";
  const lost = decided && opp.score != null && t.score != null && t.score < opp.score;
  const won = decided && t.isWinner;
  const rec = t.wins != null ? `<span class="rec">${t.wins}-${t.losses}</span>` : "";
  const score = t.score != null ? t.score : "";
  return `
    <div class="team ${lost ? "team-lost" : ""} ${won ? "team-won" : ""}">
      <img class="team-logo" src="${logoUrl(t.id)}" alt="" loading="lazy"
           onerror="this.onerror=null;this.src='${BALL}'" />
      <span class="team-name"><span class="abbr">${t.abbr || t.name}</span> ${rec}</span>
      <span class="team-score">${score}</span>
    </div>`;
}

function statusBlock(g) {
  if (g.state === "Live") {
    const half = g.inningState ? `${g.inningState} ${g.inning || ""}`.trim() : (g.inning || "Live");
    const count = g.balls != null && g.strikes != null ? `${g.balls}-${g.strikes}` : "";
    const outs = g.outs != null ? `${g.outs} out${g.outs === 1 ? "" : "s"}` : "";
    return `
      <div class="status status-live">
        <span class="badge badge-live">● LIVE</span>
        <span class="inning">${half}</span>
        <div class="bases">${basesSvg(g.bases)}</div>
        <span class="count">${[count, outs].filter(Boolean).join(" · ")}</span>
      </div>`;
  }
  if (g.state === "Final") {
    const extra = g.inning && g.inning !== "9th" ? `/${g.inning.replace(/\D/g, "")}` : "";
    return `<div class="status"><span class="badge badge-final">Final${extra}</span></div>`;
  }
  const time = g.startTimeTBD ? "TBD" : localTime(g.startTime);
  return `<div class="status"><span class="badge badge-prev">${time}</span><span class="sched">Scheduled</span></div>`;
}

function basesSvg(b = {}) {
  const f = b.first ? "on" : "", s = b.second ? "on" : "", t = b.third ? "on" : "";
  return `<svg viewBox="0 0 34 24" width="34" height="24" aria-hidden="true">
    <rect class="base ${s}" x="13" y="2" width="8" height="8" transform="rotate(45 17 6)"/>
    <rect class="base ${t}" x="3" y="12" width="8" height="8" transform="rotate(45 7 16)"/>
    <rect class="base ${f}" x="23" y="12" width="8" height="8" transform="rotate(45 27 16)"/>
  </svg>`;
}

function renderGames(games) {
  const grid = $("#gamesGrid");
  if (!games || !games.length) {
    grid.innerHTML = `<div class="state-msg">No games scheduled for this date.</div>`;
    return;
  }
  grid.innerHTML = games.map((g) => `
    <article class="game ${g.state === "Live" ? "game-live" : ""}">
      <div class="teams">
        ${teamRow(g.away, g.home, g.state)}
        ${teamRow(g.home, g.away, g.state)}
      </div>
      ${statusBlock(g)}
      ${g.venue ? `<div class="venue">${g.venue}</div>` : ""}
    </article>`).join("");
}

// auto-refresh every 30s when any game is live
function scheduleRefresh(games) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const anyLive = games.some((g) => g.state === "Live");
  const info = $("#refreshInfo");
  if (anyLive) {
    info.textContent = "Auto-refreshing live games…";
    refreshTimer = setTimeout(() => loadScores(currentDate), 30000);
  } else {
    info.textContent = "";
  }
}

function shiftDay(delta) {
  if (!currentDate) return;
  const d = parseYmd(currentDate);
  d.setDate(d.getDate() + delta);
  loadScores(ymd(d));
}

$("#prevDay").onclick = () => shiftDay(-1);
$("#nextDay").onclick = () => shiftDay(1);
$("#todayBtn").onclick = () => loadScores(null);

// ---------- standings ----------
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
        <img class="mini-logo" src="${logoUrl(t.id)}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${BALL}'" />
        ${t.abbr || t.name}
      </td>
      <td>${t.wins}</td>
      <td>${t.losses}</td>
      <td>${t.pct}</td>
      <td>${t.gb}</td>
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

// ---------- boot ----------
$("#year").textContent = new Date().getFullYear();
loadScores(null);
loadStandings();
// refresh standings every 10 min
setInterval(loadStandings, 600000);
