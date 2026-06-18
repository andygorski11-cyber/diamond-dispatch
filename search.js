// Search bar — look up any MLB player or any MLB/college team and favorite them inline.
// Loads a compact index once (cached), then filters locally as you type.
(function () {
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");
  if (!input || !results) return;

  const mlbLogo = (id) => (id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : "");
  const BALL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%E2%9A%BE%3C/text%3E%3C/svg%3E";

  let index = null;     // { players, mlbTeams, collegeTeams }
  let loading = null;   // in-flight promise
  let debounce = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = fetch("/api/search-index")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { index = d; return d; })
      .catch((e) => { loading = null; throw e; });
    return loading;
  }

  // rank: exact/startsWith before substring matches
  function score(name, q) {
    const n = name.toLowerCase();
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    const word = n.split(/\s+/).some((w) => w.startsWith(q));
    if (word) return 2;
    return n.includes(q) ? 3 : 99;
  }

  function search(q) {
    const out = [];
    for (const p of index.players) {
      const s = score(p.n, q);
      if (s < 99) out.push({ s, type: "player", lg: "mlb", id: p.id, name: p.n,
        sub: [p.pos, p.ta].filter(Boolean).join(" · ") || "MLB", logo: mlbLogo(p.t), tid: p.t, ab: p.ta });
    }
    for (const t of index.mlbTeams) {
      const s = score(t.n, q);
      if (s < 99) out.push({ s, type: "team", lg: "mlb", id: t.id, name: t.n, sub: "MLB team", logo: mlbLogo(t.id), ab: t.ab });
    }
    for (const t of index.collegeTeams) {
      const s = score(t.n, q);
      if (s < 99) out.push({ s, type: "team", lg: "college", id: t.id, name: t.n, sub: "College team", logo: t.lo, ab: t.ab });
    }
    out.sort((a, b) => a.s - b.s || a.name.length - b.name.length);
    return out.slice(0, 10);
  }

  function favPayload(r) {
    return r.type === "player"
      ? { lg: "mlb", ty: "player", id: r.name, nm: r.name, ab: r.ab || "", lo: r.logo, tid: String(r.tid), pid: r.id != null ? String(r.id) : "" }
      : { lg: r.lg, ty: "team", id: String(r.id), nm: r.name, ab: r.ab || "", lo: r.logo };
  }

  function render(list) {
    if (!list.length) {
      results.innerHTML = `<div class="sr-empty">No players or teams match that.</div>`;
      results.hidden = false;
      return;
    }
    results.innerHTML = list.map((r) => {
      const p = favPayload(r);
      const stars = window.Favorites ? window.Favorites.star(p, true) : "";
      return `<div class="sr-row">
        <img class="sr-logo" src="${r.logo || BALL}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${BALL}'" />
        <span class="sr-text"><span class="sr-name">${r.name}</span><span class="sr-sub">${r.sub}</span></span>
        ${stars}
      </div>`;
    }).join("");
    results.hidden = false;
  }

  function run() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; results.innerHTML = ""; return; }
    results.innerHTML = `<div class="sr-empty">Searching…</div>`;
    results.hidden = false;
    loadIndex()
      .then(() => render(search(q)))
      .catch((e) => { results.innerHTML = `<div class="sr-empty">Search unavailable (${e.message}).</div>`; });
  }

  input.addEventListener("focus", () => { loadIndex().catch(() => {}); });
  input.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(run, 160); });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { results.hidden = true; input.blur(); } });

  // keep results open when interacting; close on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) { results.hidden = true; }
  });
})();
