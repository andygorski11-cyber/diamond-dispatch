# Diamond Dispatch ⚾

A clean, fast baseball scoreboard — **live and recent MLB scores** plus current division
standings, pulled from the public MLB Stats API through Vercel serverless functions.
Vanilla HTML/CSS/JS frontend, deployed on [Vercel](https://vercel.com).

## Features
- **Live scores** with inning, count, outs, and base runners — auto-refreshing every 30s
- **Date navigation** (prev/next day, jump to latest games)
- **Live division standings** (W-L, PCT, GB, streak) for all six divisions
- Defaults to the most recent day that had games

## API (serverless)
| Route | Returns |
| --- | --- |
| `/api/scores` | Most recent day's games (live/final/scheduled) |
| `/api/scores?date=YYYY-MM-DD` | Games for a specific date |
| `/api/standings` | Current-season division standings |

_Data: [MLB Stats API](https://statsapi.mlb.com). Not affiliated with MLB._

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
| `script.js` | Sortable standings, fun facts, legend cards |

_Standings and player notes are illustrative demo data, not a live feed._
