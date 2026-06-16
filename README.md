# Diamond Dispatch ⚾

A clean, fast, single-page baseball site — sample standings (sortable), legends of the
game, a "know the rules" primer, and a random fun-fact generator. Pure HTML/CSS/JS, no
build step, deployed on [Vercel](https://vercel.com).

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
