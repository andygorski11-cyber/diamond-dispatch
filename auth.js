// Google Sign-In gate for Diamond Dispatch.
// Shows a full-screen login/sign-up screen on first open, persists the session
// in localStorage so the user stays signed in across visits, and reveals the app
// once authenticated. New Google accounts are recorded the first time they sign in.
(function () {
  const CLIENT_ID = (window.AUTH_CONFIG && window.AUTH_CONFIG.googleClientId) || "";
  const configured = CLIENT_ID && !/PASTE_YOUR|YOUR_CLIENT|xxxx/i.test(CLIENT_ID);

  const USER_KEY = "dd_user";        // current signed-in profile (persists the session)
  const ACCTS_KEY = "dd_accounts";   // every account that has ever signed up on this device

  const gate = document.getElementById("authGate");
  const chip = document.getElementById("userChip");

  // ---------- storage helpers ----------
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch { return null; }
  }
  function getAccounts() {
    try { return JSON.parse(localStorage.getItem(ACCTS_KEY) || "[]"); }
    catch { return []; }
  }
  function recordAccount(user) {
    const accts = getAccounts();
    const isNew = !accts.some((a) => a.email === user.email);
    if (isNew) {
      accts.push({ email: user.email, name: user.name, created: new Date().toISOString() });
      localStorage.setItem(ACCTS_KEY, JSON.stringify(accts));
    }
    return isNew;
  }

  // ---------- JWT decode (display only; no secret needed) ----------
  function decodeJwt(token) {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
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
      const nameEl = document.getElementById("userName");
      if (nameEl) nameEl.textContent = user.given_name || user.name || "Fan";
      const pic = document.getElementById("userPic");
      if (pic) {
        if (user.picture) { pic.src = user.picture; pic.hidden = false; }
        else pic.hidden = true;
      }
    }
  }
  function showGate() {
    document.body.classList.add("gated");
    if (gate) gate.hidden = false;
    if (chip) chip.hidden = true;
  }

  function toast(msg) {
    let t = document.getElementById("ddToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "ddToast";
      t.className = "dd-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 4000);
  }

  // ---------- Google credential callback ----------
  function handleCredential(response) {
    let profile;
    try { profile = decodeJwt(response.credential); }
    catch (e) { toast("Sign-in failed — please try again."); return; }

    const user = {
      sub: profile.sub,
      name: profile.name,
      given_name: profile.given_name,
      email: profile.email,
      picture: profile.picture,
    };
    const isNew = recordAccount(user);
    localStorage.setItem(USER_KEY, JSON.stringify(user)); // persists the session
    showApp(user);
    toast(isNew
      ? `Welcome, ${user.given_name || user.name}! Your account is saved.`
      : `Welcome back, ${user.given_name || user.name}!`);
  }
  window.handleCredential = handleCredential;

  function signOut() {
    localStorage.removeItem(USER_KEY);
    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    showGate();
    initGoogle();
  }

  // ---------- Google Identity Services ----------
  let inited = false;
  function initGoogle() {
    if (!configured) return;
    if (!(window.google && google.accounts && google.accounts.id)) return;
    if (!inited) {
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
        auto_select: false,
        cancel_on_tap_outside: false,
      });
      inited = true;
    }
    const wrap = document.getElementById("gBtn");
    if (wrap) {
      wrap.innerHTML = "";
      google.accounts.id.renderButton(wrap, {
        theme: "filled_blue", size: "large", shape: "pill",
        text: "continue_with", logo_alignment: "center", width: 280,
      });
    }
    // One Tap prompt for returning users (only when gate is showing)
    if (document.body.classList.contains("gated")) google.accounts.id.prompt();
  }

  // ---------- unconfigured fallback (temporary, until Client ID is set) ----------
  function showSetupFallback() {
    const note = document.getElementById("authNote");
    if (note) {
      note.hidden = false;
      note.innerHTML =
        `Google sign-in is being set up. <button id="ddBypass" class="linkbtn">Continue to site</button>`;
    }
    const wrap = document.getElementById("gBtn");
    if (wrap) {
      wrap.innerHTML =
        `<button class="g-placeholder" disabled>Continue with Google</button>`;
    }
  }

  // ---------- boot ----------
  const existing = getUser();
  if (existing) {
    showApp(existing);
  } else {
    showGate();
    if (!configured) showSetupFallback();
  }

  // sign-out + bypass (delegated so it works regardless of render timing)
  document.addEventListener("click", (e) => {
    const id = e.target && e.target.id;
    if (id === "signOut") signOut();
    if (id === "ddBypass") { if (gate) gate.hidden = true; document.body.classList.remove("gated"); }
  });

  // GIS script loads async — init as soon as it's ready
  if (configured) {
    window.addEventListener("load", initGoogle);
    let tries = 0;
    const poll = setInterval(() => {
      if (window.google && google.accounts && google.accounts.id) { clearInterval(poll); initGoogle(); }
      else if (++tries > 50) clearInterval(poll);
    }, 100);
  }
})();
