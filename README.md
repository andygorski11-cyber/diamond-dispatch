# Diamond Dispatch ⚾

A clean, fast baseball scoreboard — **live and recent scores for MLB and NCAA Division I
college baseball** (including the College World Series), plus standings and the Top 25 —
pulled from the public MLB Stats API and ESPN's college feed through Vercel serverless
functions. Vanilla HTML/CSS/JS frontend, deployed on [Vercel](https://vercel.com).

## Features
- **Live scores** for MLB and college with inning, count, outs, and base runners — auto-refreshing every 30s
- **Gamecast** — expand any live or finished game for the current at-bat (batter/pitcher),
  an inning-by-inning line score (R/H/E), and a running play-by-play; live gamecasts refresh on their own
- **Date navigation** (prev/next day, jump to latest games)
- **College World Series** spotlight when CWS games are on the slate
- **Live MLB division standings** (W-L, PCT, GB, streak) for all six divisions
- **College Top 25** poll with movement trend
- Defaults to the most recent day that had games (offseason-safe)

## API (serverless)
| Route | Returns |
| --- | --- |
| `/api/scores` · `?date=YYYY-MM-DD` | MLB games for the latest day / a specific date |
| `/api/college` · `?date=YYYY-MM-DD` | College games for the latest day / a specific date |
| `/api/standings` | Current-season MLB division standings |
| `/api/college-rankings` | NCAA D1 Top 25 poll |
| `/api/gamecast?league=mlb&id={gamePk}` | Per-game line score, at-bat, and play-by-play (MLB) |
| `/api/gamecast?league=college&id={eventId}` | Per-game line score, at-bat, and play-by-play (college) |

_Data: [MLB Stats API](https://statsapi.mlb.com) & ESPN. Not affiliated with MLB or the NCAA._

**🔗 Live:** https://diamond-dispatch-beige.vercel.app
**📦 Source:** https://github.com/andygorski11-cyber/diamond-dispatch

## Run locally

It's a static site — just open `index.html`, or serve it:

```bash
npx serve .
```

## Deploy

Pushing to the `main` branch on GitHub triggers an automatic production deploy on Vercel.

## Structure

| File | Purpose |
| --- | --- |
| `index.html` | Markup and content |
| `styles.css` | Theme, layout, responsive styles |
| `script.js` | Scores, gamecast, standings, and Top 25 rendering |
| `api/*.js` | Serverless proxies for the MLB Stats API and ESPN |
