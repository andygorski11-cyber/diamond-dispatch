// Favorites + notifications for Diamond Dispatch.
// Logged-in (non-guest) users can favorite teams and players; favorites are saved per account
// in localStorage. A background poller watches favorited teams across MLB + college and raises
// in-app notifications (a bell feed) plus optional native browser alerts when a game goes live,
// the score changes, or it ends. Guests are prompted to sign in.
(function () {
  let user = null;             // current account (set via onAuth)
  let pollTimer = null;
  const POLL_MS = 60000;

  // ---------- keys / storage ----------
  const acctId = (u) => (u && !u.guest ? (u.email || u.sub) : null);
  const favsKey = () => { const id = acctId(user); return id ? `dd_favs_${id}` : null; };
  const feedKey = () => { const id = acctId(user); return id ? `dd_feed_${id}` : null; };
  const snapKey = () => { const id = acctId(user); return id ? `dd_snap_${id}` : null; };

  const readJson = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || fb); } catch { return JSON.parse(fb); } };
  const getFavs = () => { const k = favsKey(); return k ? readJson(k, '{"teams":[],"players":[]}') : { teams: [], players: [] }; };
  const setFavs = (f) => { const k = favsKey(); if (k) localStorage.setItem(k, JSON.stringify(f)); };
  const getFeed = () => { const k = feedKey(); return k ? readJson(k, "[]") : []; };
  const setFeed = (a) => { const k = feedKey(); if (k) localStorage.setItem(k, JSON.stringify(a)); };

  const keyOf = (p) => `${p.lg}:${p.ty}:${p.id}`;

  function isFav(p) {
    const f = getFavs();
    const list = p.ty === "player" ? f.players : f.teams;
    return list.some((x) => keyOf(x) === keyOf(p));
  }

  // ---------- star button (called from script.js during render) ----------
  function star(p, force) {
    if (!acctId(user) && !force) return ""; // hidden in main views unless logged in
    const on = isFav(p);
    const enc = encodeURIComponent(JSON.stringify(p));
    return `<button class="fav-star ${on ? "on" : ""}" data-fav="${enc}"
      aria-pressed="${on}" title="${on ? "Remove favorite" : "Add favorite"}"
      aria-label="${on ? "Remove" : "Add"} favorite ${p.nm}">★</button>`;
  }

  function toggle(p) {
    if (!acctId(user)) { window.ddToast && window.ddToast("Sign in to save favorites."); return; }
    const f = getFavs();
    const list = p.ty === "player" ? f.players : f.teams;
    const i = list.findIndex((x) => keyOf(x) === keyOf(p));
    let added;
    if (i >= 0) { list.splice(i, 1); added = false; }
    else { list.push(p); added = true; }
    setFavs(f);
    // reflect on every matching star currently in the DOM
    document.querySelectorAll(".fav-star").forEach((btn) => {
      try {
        const bp = JSON.parse(decodeURIComponent(btn.dataset.fav));
        if (keyOf(bp) === keyOf(p)) {
          btn.classList.toggle("on", added);
          btn.setAttribute("aria-pressed", String(added));
        }
      } catch {}
    });
    renderSection();
    window.ddToast && window.ddToast(`${added ? "Added" : "Removed"} ${p.nm}${added ? " to favorites" : ""}.`);
    restartPoller();
  }

  // ---------- favorites section ----------
  function chip(p) {
    const enc = encodeURIComponent(JSON.stringify(p));
    const sub = p.ty === "player" ? "Player" : "Team";
    return `<div class="fav-item">
      <div class="fav-row">
        <button class="fav-chip" data-detail="${enc}" aria-expanded="false">
          <img class="mini-logo" src="${p.lo || ""}" alt="" loading="lazy"
               onerror="this.style.visibility='hidden'" />
          <span class="fav-chip-name">${p.nm}</span>
          <span class="fav-chip-tag">${p.lg.toUpperCase()} · ${sub}</span>
          <span class="fav-caret">▾</span>
        </button>
        <button class="fav-remove" data-fav="${enc}" aria-label="Remove ${p.nm}">✕</button>
      </div>
      <div class="fav-detail" hidden></div>
    </div>`;
  }

  // ---------- detail dropdown (stats + next game + starting) ----------
  const detailCache = new Map();
  function detailUrl(p) {
    if (p.ty === "player") {
      return p.pid ? `/api/detail?type=player&id=${encodeURIComponent(p.pid)}`
                   : `/api/detail?type=player&name=${encodeURIComponent(p.nm)}`;
    }
    return `/api/detail?type=team&league=${p.lg}&id=${encodeURIComponent(p.id)}`;
  }
  function fmtWhen(iso) {
    if (!iso) return "TBD";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch { return "TBD"; }
  }
  function startBadge(s) {
    if (!s) return "";
    const cls = { yes: "ok", no: "no", pending: "wait", unknown: "wait" }[s.state] || "wait";
    const dot = { yes: "🟢", no: "⚪", pending: "🟡", unknown: "⚪" }[s.state] || "⚪";
    return `<div class="d-start ${cls}">${dot} ${s.text}</div>`;
  }
  function detailHtml(d) {
    if (d.error) return `<div class="gc-msg error">Couldn't load details.</div>`;
    const stats = (d.statline || []).length
      ? `<div class="d-stats">${d.statline.map((s) => `<div class="d-stat"><span class="d-val">${s.value}</span><span class="d-lbl">${s.label}</span></div>`).join("")}</div>`
      : `<div class="gc-msg">No season stats available.</div>`;
    const g = d.nextGame;
    let next;
    if (g) {
      const vs = `${g.home ? "vs" : "@"} ${g.opponent}`;
      const probs = [];
      if (g.myProbable) probs.push(`${d.name.split(" ").slice(-1)[0] || "Team"} prob: ${g.myProbable.name}`);
      if (g.oppProbable) probs.push(`Opp prob: ${g.oppProbable.name}`);
      const live = g.status === "Live" ? `<span class="d-live">● LIVE</span>` : "";
      next = `<div class="d-next">
        <div class="d-next-h">Next game ${live}</div>
        <div class="d-next-row"><strong>${vs}</strong> · ${fmtWhen(g.startTime)}</div>
        ${g.venue ? `<div class="d-next-sub">${g.venue}</div>` : ""}
        ${probs.length ? `<div class="d-next-sub">${probs.join(" · ")}</div>` : ""}
      </div>`;
    } else {
      next = `<div class="d-next"><div class="d-next-h">Next game</div><div class="d-next-sub">No upcoming game scheduled.</div></div>`;
    }
    const starting = d.type === "player" ? startBadge(d.starting) : "";
    const head = `<div class="d-head">${d.season ? d.season + " season" : ""}${d.position ? " · " + d.position : ""}</div>`;
    return head + stats + next + starting + (d.note ? `<div class="gc-msg">${d.note}</div>` : "");
  }
  async function toggleDetail(btn, p) {
    const item = btn.closest(".fav-item");
    const panel = item && item.querySelector(".fav-detail");
    if (!panel) return;
    const open = !panel.hidden;
    if (open) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.classList.remove("open"); return; }
    btn.setAttribute("aria-expanded", "true"); btn.classList.add("open");
    panel.hidden = false;
    const url = detailUrl(p);
    if (detailCache.has(url)) { panel.innerHTML = detailHtml(detailCache.get(url)); return; }
    panel.innerHTML = `<div class="gc-msg">Loading…</div>`;
    try {
      const r = await fetch(url);
      const d = await r.json();
      detailCache.set(url, d);
      panel.innerHTML = detailHtml(d);
    } catch (e) {
      panel.innerHTML = `<div class="gc-msg error">Couldn't load details (${e.message}).</div>`;
    }
  }
  function renderSection() {
    const sec = document.getElementById("favorites");
    const body = document.getElementById("favBody");
    const logged = !!acctId(user);
    if (sec) sec.hidden = !logged;
    const link = document.querySelector('.nav-links a[href="#favorites"]');
    if (link && link.parentElement) link.parentElement.hidden = !logged;
    if (!logged || !body) return;
    const f = getFavs();
    const all = [...f.teams, ...f.players];
    if (!all.length) {
      body.innerHTML = `<div class="state-msg">No favorites yet — tap the ★ on any team or player to follow them and get game alerts.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="fav-alerts">
        <span id="favAlertState">${notifLabel()}</span>
        <button class="linkbtn" id="favEnable">${("Notification" in window) && Notification.permission === "granted" ? "Alerts on ✓" : "Enable browser alerts"}</button>
      </div>
      <div class="fav-list">${all.map(chip).join("")}</div>`;
  }
  function notifLabel() {
    if (!("Notification" in window)) return "In-app alerts on. (This browser has no native notifications.)";
    if (Notification.permission === "granted") return "You'll get an alert when a favorite goes live, scores, or finishes.";
    if (Notification.permission === "denied") return "Browser alerts are blocked; you'll still see in-app alerts in the bell.";
    return "Turn on browser alerts to get notified even when this tab is in the background.";
  }

  // ---------- notification feed / bell ----------
  function bellEls() { return { wrap: document.getElementById("bellWrap"), bell: document.getElementById("bell"), badge: document.getElementById("bellBadge"), panel: document.getElementById("bellPanel") }; }
  function unread() { return getFeed().filter((n) => !n.read).length; }
  function refreshBell() {
    const { wrap, badge } = bellEls();
    const logged = !!acctId(user);
    if (wrap) wrap.hidden = !logged;
    if (!logged) return;
    const n = unread();
    if (badge) { badge.textContent = n > 9 ? "9+" : String(n); badge.hidden = n === 0; }
  }
  function renderBellPanel() {
    const { panel } = bellEls();
    if (!panel) return;
    const feed = getFeed();
    panel.innerHTML = feed.length
      ? feed.map((n) => `<div class="note ${n.read ? "" : "unread"}"><div class="note-text">${n.text}</div><div class="note-time">${timeAgo(n.ts)}</div></div>`).join("")
      : `<div class="note-empty">No alerts yet. Favorite a team or player to start.</div>`;
  }
  function pushNote(text, tag) {
    const feed = getFeed();
    if (tag && feed.some((n) => n.tag === tag)) return; // dedupe identical events
    feed.unshift({ text, tag: tag || null, ts: Date.now(), read: false });
    setFeed(feed.slice(0, 40));
    refreshBell();
    renderBellPanel();
    window.ddToast && window.ddToast(text);
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification("Diamond Dispatch", { body: text, icon: "/favicon.svg", tag: tag || undefined }); } catch {}
    }
  }
  function timeAgo(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  // ---------- background poller ----------
  function watchedTeams() {
    // map of `${lg}:${id}` -> label (team name, plus any favorited players on it)
    const f = getFavs();
    const map = new Map();
    f.teams.forEach((t) => map.set(`${t.lg}:${t.id}`, { name: t.nm, players: [] }));
    f.players.forEach((p) => {
      if (!p.tid) return;
      const k = `mlb:${p.tid}`;
      if (!map.has(k)) map.set(k, { name: p.nm + "'s team", players: [p.nm] });
      else map.get(k).players.push(p.nm);
    });
    return map;
  }
  function teamKeyFromGame(lg, side) {
    const id = lg === "mlb" ? side.id : (side.abbr || side.name);
    return id != null ? `${lg}:${id}` : null;
  }
  async function pollOnce() {
    const watch = watchedTeams();
    if (!watch.size) return;
    const snap = readJson(snapKey(), "{}");
    const seeded = Object.keys(snap).length > 0;
    const sources = [
      { lg: "mlb", url: "/api/scores" },
      { lg: "college", url: "/api/college" },
    ];
    for (const src of sources) {
      let data;
      try { const r = await fetch(src.url); if (!r.ok) continue; data = await r.json(); }
      catch { continue; }
      for (const g of data.games || []) {
        const gid = g.gamePk != null ? g.gamePk : g.id;
        const ak = teamKeyFromGame(src.lg, g.away);
        const hk = teamKeyFromGame(src.lg, g.home);
        const hit = (ak && watch.has(ak)) ? watch.get(ak) : (hk && watch.has(hk)) ? watch.get(hk) : null;
        if (!hit) continue;
        const an = g.away.abbr || g.away.name, hn = g.home.abbr || g.home.name;
        const as = g.away.score, hs = g.home.score;
        const sk = `${src.lg}:${gid}`;
        const prev = snap[sk];
        const cur = { st: g.state, as, hs };
        const who = hit.players.length ? `${hit.players.join(", ")} — ` : "";
        if (seeded && prev) {
          if (prev.st !== "Live" && cur.st === "Live")
            pushNote(`🔴 ${who}${an} @ ${hn} is now LIVE.`, `${sk}:live`);
          else if (cur.st === "Live" && (prev.as !== as || prev.hs !== hs) && (as != null && hs != null))
            pushNote(`⚾ ${who}${an} ${as}, ${hn} ${hs}`, `${sk}:${as}-${hs}`);
          else if (prev.st !== "Final" && cur.st === "Final")
            pushNote(`🏁 Final — ${an} ${as}, ${hn} ${hs}`, `${sk}:final`);
        }
        snap[sk] = cur;
      }
    }
    if (snapKey()) localStorage.setItem(snapKey(), JSON.stringify(snap));
  }
  function restartPoller() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    const f = getFavs();
    if (!acctId(user) || (!f.teams.length && !f.players.length)) return;
    pollOnce();
    pollTimer = setInterval(pollOnce, POLL_MS);
  }

  // ---------- enable native alerts ----------
  function enableAlerts() {
    if (!("Notification" in window)) { window.ddToast && window.ddToast("This browser doesn't support notifications."); return; }
    Notification.requestPermission().then(() => { renderSection(); window.ddToast && window.ddToast(Notification.permission === "granted" ? "Browser alerts enabled." : "Using in-app alerts."); });
  }

  // ---------- wiring (delegated; survives re-renders) ----------
  document.addEventListener("click", (e) => {
    const starBtn = e.target.closest && e.target.closest(".fav-star");
    if (starBtn) { try { toggle(JSON.parse(decodeURIComponent(starBtn.dataset.fav))); } catch {} return; }
    const rm = e.target.closest && e.target.closest(".fav-remove");
    if (rm) { try { toggle(JSON.parse(decodeURIComponent(rm.dataset.fav))); } catch {} return; }
    const chipBtn = e.target.closest && e.target.closest(".fav-chip");
    if (chipBtn) { try { toggleDetail(chipBtn, JSON.parse(decodeURIComponent(chipBtn.dataset.detail))); } catch {} return; }
    if (e.target.id === "favEnable") { enableAlerts(); return; }
    const { bell, panel } = bellEls();
    if (bell && bell.contains(e.target)) {
      if (panel) {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) { renderBellPanel(); const feed = getFeed().map((n) => ({ ...n, read: true })); setFeed(feed); refreshBell(); }
      }
      return;
    }
    if (panel && !panel.hidden && !panel.contains(e.target)) panel.hidden = true; // click outside closes
  });

  // ---------- auth hook ----------
  function onAuth(u) {
    user = u || null;
    renderSection();
    refreshBell();
    renderBellPanel();
    restartPoller();
  }

  window.Favorites = { star, isFav, onAuth, loggedIn: () => !!acctId(user) };

  // self-init from the current session (auth.js may have booted before this module loaded)
  try { onAuth(JSON.parse(localStorage.getItem("dd_user") || "null")); } catch { onAuth(null); }
})();
