// ── Google Sign-In configuration ───────────────────────────────────────────
// Paste your Google OAuth *Web application* Client ID below (it ends in
// ".apps.googleusercontent.com"). Until a real value is set, the site shows the
// sign-in screen with a temporary "Continue to site" link so it stays usable.
//
// Create one at: https://console.cloud.google.com/apis/credentials
//   • Authorized JavaScript origins must include:
//       https://diamond-dispatch-beige.vercel.app
//       http://localhost:3000
window.AUTH_CONFIG = {
  googleClientId: "PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com",
};
