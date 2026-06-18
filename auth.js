// Auth gate for Diamond Dispatch — email/password (local), Google Sign-In, and guest mode.
// Sessions persist in localStorage so the user stays signed in across visits; accounts created
// on first sign-up are saved on the device. Passwords are stored hashed (display-only product;
// no backend), never in plaintext.
(function () {
  const CLIENT_ID = (window.AUTH_CONFIG && window.AUTH_CONFIG.googleClientId) || "";
  const configured = CLIENT_ID && !/PASTE_YOUR|YOUR_CLIENT|xxxx/i.test(CLIENT_ID);

  const USER_KEY = "dd_user";        // current session
  const ACCTS_KEY = "dd_accounts";   // every account ever created on this device

  const gate = document.getElementById("authGate");
  const chip = document.getElementById("userChip");
  let mode = "login"; // "login" | "signup"

  // ---------- storage ----------
  const readJson = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k) || fallback); } catch { return JSON.parse(fallback); }
  };
  const getUser = () => readJson(USER_KEY, "null");
  const getAccounts = () => readJson(ACCTS_KEY, "[]");
  const saveAccounts = (a) => localStorage.setItem(ACCTS_KEY, JSON.stringify(a));
  const setSession = (u) => { localStorage.setItem(USER_KEY, JSON.stringify(u)); };

  // ---------- crypto ----------
  async function hashPassword(pw) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("dd:" + pw));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // fallback (insecure, only if SubtleCrypto is unavailable, e.g. file://)
    let h = 0;
    for (let i = 0; i < pw.length; i++) h = (h * 31 + pw.charCodeAt(i)) | 0;
    return "x" + (h >>> 0).toString(16);
  }

  function decodeJwt(token) {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
    return JSON.parse(json);
  }

  // ---------- UI ----------
  function showApp(user) {
    document.body.classList.remove("gated");
    if (gate) gate.hidden = true;
    if (chip && user) {
      chip.hidden = false;
      const label = user.given_name || user.name || (user.guest ? "Guest" : "Fan");
      const nameEl = document.getElementById("userName");
      if (nameEl) nameEl.textContent = label;
      const pic = document.getElementById("userPic");
      const initial = document.getElementById("userInitial");
      if (user.picture && pic) {
        pic.src = user.picture; pic.hidden = false;
        if (initial) initial.hidden = true;
      } else {
        if (pic) pic.hidden = true;
        if (initial) { initial.textContent = (label[0] || "?").toUpperCase(); initial.hidden = false; }
      }
    }
  }
  function showGate() {
    document.body.classList.add("gated");
    if (gate) gate.hidden = false;
    if (chip) chip.hidden = true;
  }
  function msg(text, kind) {
    const el = document.getElementById("authMsg");
    if (!el) return;
    el.textContent = text;
    el.className = "auth-msg " + (kind || "error");
    el.hidden = !text;
  }
  function toast(text) {
    let t = document.getElementById("ddToast");
    if (!t) { t = document.createElement("div"); t.id = "ddToast"; t.className = "dd-toast"; document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 4000);
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll(".auth-tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    const isSignup = mode === "signup";
    const nameField = document.getElementById("nameField");
    if (nameField) nameField.hidden = !isSignup;
    document.getElementById("authSubmit").textContent = isSignup ? "Create account" : "Log in";
    document.getElementById("fPass").setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
    const sub = document.getElementById("authSub");
    if (sub) sub.textContent = isSignup
      ? "Create your account to follow scores, gamecasts, standings, and stat leaders."
      : "Log in to follow live scores, gamecasts, standings, and stat leaders.";
    msg("", "error");
  }

  // ---------- email / password ----------
  async function submitForm(e) {
    e.preventDefault();
    const name = (document.getElementById("fName").value || "").trim();
    const email = (document.getElementById("fEmail").value || "").trim().toLowerCase();
    const pass = document.getElementById("fPass").value || "";

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msg("Enter a valid email address.");
    if (pass.length < 6) return msg("Password must be at least 6 characters.");

    const accts = getAccounts();
    const found = accts.find((a) => a.email === email);
    const hash = await hashPassword(pass);

    if (mode === "signup") {
      if (!name) return msg("Enter your name.");
      if (found) return msg("An account with that email already exists — log in instead.");
      const acct = { name, email, passHash: hash, provider: "local", created: new Date().toISOString() };
      accts.push(acct);
      saveAccounts(accts);
      const user = { name, given_name: name.split(" ")[0], email, provider: "local" };
      setSession(user); showApp(user);
      toast(`Welcome, ${user.given_name}! Your account is saved.`);
    } else {
      if (!found) return msg("No account found for that email — sign up first.");
      if (found.provider === "google") return msg("That email uses Google — choose “Continue with Google”.");
      if (found.passHash !== hash) return msg("Incorrect email or password.");
      const user = { name: found.name, given_name: found.name.split(" ")[0], email, provider: "local" };
      setSession(user); showApp(user);
      toast(`Welcome back, ${user.given_name}!`);
    }
  }

  // ---------- guest ----------
  function continueAsGuest() {
    const user = { name: "Guest", given_name: "Guest", provider: "guest", guest: true };
    setSession(user);
    showApp(user);
    toast("Browsing as a guest. Sign in any time to save your spot.");
  }

  // ---------- Google ----------
  function handleCredential(response) {
    let profile;
    try { profile = decodeJwt(response.credential); }
    catch { toast("Google sign-in failed — please try again."); return; }
    const email = (profile.email || "").toLowerCase();
    const user = {
      name: profile.name, given_name: profile.given_name, email,
      picture: profile.picture, provider: "google",
    };
    const accts = getAccounts();
    const existing = accts.find((a) => a.email === email);
    let isNew = false;
    if (!existing) {
      accts.push({ name: profile.name, email, provider: "google", created: new Date().toISOString() });
      saveAccounts(accts); isNew = true;
    }
    setSession(user); showApp(user);
    toast(isNew
      ? `Welcome, ${user.given_name || user.name}! Your account is saved.`
      : `Welcome back, ${user.given_name || user.name}!`);
  }
  window.handleCredential = handleCredential;

  function signOut() {
    localStorage.removeItem(USER_KEY);
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    setMode("login");
    showGate();
    initGoogle();
  }

  let inited = false;
  function initGoogle() {
    if (!configured || !(window.google && google.accounts && google.accounts.id)) return;
    if (!inited) {
      google.accounts.id.initialize({
        client_id: CLIENT_ID, callback: handleCredential,
        auto_select: false, cancel_on_tap_outside: false,
      });
      inited = true;
    }
    const wrap = document.getElementById("gBtn");
    if (wrap) {
      wrap.innerHTML = "";
      google.accounts.id.renderButton(wrap, {
        theme: "outline", size: "large", shape: "pill",
        text: "continue_with", logo_alignment: "center", width: 280,
      });
    }
    if (document.body.classList.contains("gated")) google.accounts.id.prompt();
  }

  function showGooglePlaceholder() {
    const wrap = document.getElementById("gBtn");
    if (wrap) wrap.innerHTML = `<button class="g-placeholder" type="button" disabled>Continue with Google</button>`;
    const note = document.getElementById("authNote");
    if (note) { note.hidden = false; note.textContent = "Google sign-in is being set up — use email or guest for now."; }
  }

  // ---------- wiring ----------
  document.querySelectorAll(".auth-tab").forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
  const form = document.getElementById("authForm");
  if (form) form.addEventListener("submit", submitForm);
  document.addEventListener("click", (e) => {
    const id = e.target && e.target.id;
    if (id === "signOut") signOut();
    if (id === "guestBtn") continueAsGuest();
  });

  // ---------- boot ----------
  setMode("login");
  const existing = getUser();
  if (existing) {
    showApp(existing);
  } else {
    showGate();
    if (configured) {
      window.addEventListener("load", initGoogle);
      let tries = 0;
      const poll = setInterval(() => {
        if (window.google && google.accounts && google.accounts.id) { clearInterval(poll); initGoogle(); }
        else if (++tries > 50) clearInterval(poll);
      }, 100);
    } else {
      showGooglePlaceholder();
    }
  }
})();
