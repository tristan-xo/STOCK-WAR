# Stock Wars — Autonomous News & Price Engine

## Round pipeline
1. Host starts the next round.
2. The server generates one simulated financial-news event using weighted templates.
3. The event is classified as positive/negative and market-wide/sector-specific.
4. A per-stock impact map is generated and stored before the round becomes live.
5. News phase runs for `NEWS_SECONDS`.
6. Trading phase opens automatically for `TRADE_SECONDS`.
7. When trading closes, one SQLite transaction applies every news-driven stock price update, records the old/new prices, marks the round applied, snapshots every portfolio, increments `market_version`, and moves the event to the next state.
8. SSE broadcasts the committed state so clients refresh after the price update.

## Timing bug fix
The old trade endpoint read the stock and calculated its quote before entering the transaction. At a round boundary, the timer could commit a price update after that read but before the trade transaction committed. The trade could therefore use a stale price.

The new trade path reads the current event state, stock row, account/holding, and quote inside the same SQLite transaction that commits the order. If the price engine has already committed, the trade sees the new price; if the trade transaction wins first, it belongs to the still-open old round. A closed round is rejected.

## News categories
The generator includes earnings surprises/misses, regulatory shifts, policy support, commodity shocks, demand changes, major contracts, supply disruptions, and broad market risk/rally events. Sector events apply strongest to their target sector with smaller spillover elsewhere; market events affect the full market with dispersion.

## Verification
The host console exposes a `News → Price → Portfolio` audit view. `market_news_events` records the generated story, `round_impacts` records the exact per-stock model impact, `round_price_events` records before/after prices, and `round_snapshots` records the portfolio after the committed update.
