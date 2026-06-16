// ---------- Fun facts ----------
const FACTS = [
  "A regulation baseball has exactly 108 double stitches.",
  "The longest pro game lasted 33 innings — Pawtucket vs. Rochester, 1981.",
  "Nolan Ryan threw seven no-hitters, more than anyone in history.",
  "The 'can of corn' is an easy fly ball — slang from old grocers catching cans.",
  "A perfect game (27 up, 27 down) has happened only 24 times in MLB history.",
  "Cy Young won 511 games — a record likely never to be broken.",
  "The seventh-inning stretch tradition dates back well over a century.",
  "The fastest recorded pitch is 105.8 mph, by Aroldis Chapman in 2010.",
  "A 'golden sombrero' is striking out four times in one game.",
  "Home plate is a 17-inch-wide pentagon — the only non-rectangular base.",
];

const factBtn = document.getElementById("factBtn");
const factOut = document.getElementById("factOut");
let lastFact = -1;
if (factBtn) {
  factBtn.addEventListener("click", () => {
    let i;
    do { i = Math.floor(Math.random() * FACTS.length); } while (i === lastFact);
    lastFact = i;
    factOut.textContent = "⚾ " + FACTS[i];
  });
}

// ---------- Standings data ----------
const TEAMS = [
  { team: "River City Rockets", w: 94, l: 68, streak: "W4" },
  { team: "Harbor Hounds", w: 91, l: 71, streak: "W2" },
  { team: "Summit Stags", w: 88, l: 74, streak: "L1" },
  { team: "Delta Dynamos", w: 84, l: 78, streak: "W1" },
  { team: "Coastal Captains", w: 79, l: 83, streak: "L3" },
  { team: "Granite Grizzlies", w: 76, l: 86, streak: "W1" },
  { team: "Prairie Pioneers", w: 70, l: 92, streak: "L5" },
  { team: "Iron Works", w: 67, l: 95, streak: "L2" },
];

function withDerived(rows) {
  const maxW = Math.max(...rows.map((r) => r.w));
  const leader = rows.find((r) => r.w === maxW);
  return rows.map((r) => ({
    ...r,
    pct: r.w / (r.w + r.l),
    gb: ((leader.w - r.w) + (r.l - leader.l)) / 2,
  }));
}

let data = withDerived(TEAMS);
let sortKey = "w";
let sortDir = -1; // -1 desc, 1 asc

function fmtPct(p) { return p.toFixed(3).replace(/^0/, ""); }
function fmtGb(g) { return g === 0 ? "—" : g.toFixed(1); }

function renderTable() {
  const tbody = document.querySelector("#standingsTable tbody");
  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "string") return av.localeCompare(bv) * sortDir;
    return (av - bv) * sortDir;
  });
  tbody.innerHTML = sorted.map((r) => {
    const sc = r.streak.startsWith("W") ? "streak-w" : "streak-l";
    return `<tr>
      <td>${r.team}</td>
      <td>${r.w}</td>
      <td>${r.l}</td>
      <td>${fmtPct(r.pct)}</td>
      <td>${fmtGb(r.gb)}</td>
      <td class="${sc}">${r.streak}</td>
    </tr>`;
  }).join("");

  document.querySelectorAll("#standingsTable thead th").forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.key === sortKey) {
      th.classList.add(sortDir === 1 ? "sorted-asc" : "sorted-desc");
    }
  });
}

document.querySelectorAll("#standingsTable thead th").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (key === sortKey) { sortDir *= -1; }
    else { sortKey = key; sortDir = th.dataset.type === "text" ? 1 : -1; }
    renderTable();
  });
});

renderTable();

// ---------- Legends ----------
const LEGENDS = [
  { emoji: "🦇", name: "Hank Aaron", pos: "Right Field", note: "755 career home runs and a model of quiet excellence over 23 seasons." },
  { emoji: "⚡", name: "Jackie Robinson", pos: "Second Base", note: "Broke baseball's color barrier in 1947 and changed the sport forever." },
  { emoji: "🔥", name: "Nolan Ryan", pos: "Pitcher", note: "Seven no-hitters and 5,714 strikeouts — both all-time records." },
  { emoji: "🧤", name: "Willie Mays", pos: "Center Field", note: "'The Catch' and a five-tool game that defined the position." },
];

const cards = document.getElementById("legendCards");
if (cards) {
  cards.innerHTML = LEGENDS.map((l) => `
    <article class="card">
      <div class="card-emoji">${l.emoji}</div>
      <span class="pos">${l.pos}</span>
      <h3>${l.name}</h3>
      <p>${l.note}</p>
    </article>`).join("");
}

// ---------- Footer year ----------
document.getElementById("year").textContent = new Date().getFullYear();
