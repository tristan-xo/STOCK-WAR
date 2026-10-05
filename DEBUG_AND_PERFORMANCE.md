# Stock Wars — Sector Click & Page Length Fix

## Root cause
The sector buttons were generated with an inline handler using `JSON.stringify()` inside a double-quoted HTML attribute. A sector such as `Energy & Conglomerates` produced nested double quotes, yielding malformed markup such as `onclick="openSector("Energy & Conglomerates")"`. The card rendered but the click handler was not valid.

## Fix
Sector cards now use `data-sector` and a delegated click listener on `#sectors`. This survives re-rendering after sector search and avoids inline-JavaScript quoting.

```js
const sectorBox = $('#sectors');
if (sectorBox) {
  sectorBox.onclick = e => {
    const card = e.target.closest('.sectorTile');
    if (card) openSector(card.dataset.sector);
  };
}
```

Expected flow: click card -> `openSector()` -> `GET /api/sectors/:sector` -> sector modal -> filtered stock list.

## Page-length audit
The database contains 50 stocks and 20 sectors. Before optimization, all 50 market stock cards could be rendered simultaneously. The page also rendered the sector grid, all holdings, round history, and leaderboard. The largest height drivers are repeated market cards and the holdings table, not image assets.

Static public assets: app.js 55169 bytes; styles.css 24202 bytes; index.html 279 bytes; total public assets 79650 bytes. There are no image assets in `public/`; stock charts are canvas-drawn. A true runtime `document.body.scrollHeight` must be measured in a browser session, but source/database analysis identifies the repeated grids as the dominant cause.

## Page-length changes
- Market initially renders 12 stocks; search still searches all stocks.
- A `Show all` control expands the full market list.
- Holdings initially render 10 positions with `Show all` expansion.
- Sector cards are compact and remain fully searchable.
- Sector details open in a modal rather than adding another long page.
- Stock cards were tightened vertically.

## Browser/device verification
Use Chrome/Edge, Firefox, Safari/iOS, and Chrome Android. DevTools checks:
```js
document.querySelectorAll('.sectorTile').length
document.querySelector('#sectors').onclick
document.querySelector('.sectorTile')?.dataset.sector
```
Network should show HTTP 200 for `/api/sectors` and `/api/sectors/<sector>`.

## Prioritized recommendations
1. Keep the 12-stock initial limit.
2. Keep the 10-position holdings limit.
3. Keep sector details modal-based.
4. Use search instead of rendering all stocks by default.
5. If the market grows beyond 50 stocks, add server-side pagination.
6. Lazy-load charts only when a stock is opened.
7. For very large markets, use a compact sortable table on desktop.

## Validation
`node --check server.js` and `node --check public/app.js` both pass after the fix.
