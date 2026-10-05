# Stock Wars Phase 2

Phase 2 upgrades the event interface without changing the server-authoritative event engine.

## Player experience
- Brokerage-style Stock Wars dashboard
- Portfolio KPIs
- Searchable stock cards
- Buy/Sell order modal
- Current price and simulated return from base price
- Stock detail modal with round-by-round price chart
- Holdings panel
- Recent orders
- Live leaderboard
- Server-synchronized event timer remains visible
- News headline/body promoted into the round hero

## Host experience
- Dedicated control-room layout
- Live event timer inside the host dashboard
- Event-engine steps: News → Trading → Price Update
- Pause/Resume emergency control retained
- Force Lock retained
- Live top-player ranking
- News editor
- Price-impact matrix
- Audit log

## No change to the core rules
Normal flow remains:
1. Start round
2. News phase for 2 minutes
3. Trading phase for 3 minutes
4. Trading closes automatically
5. Price impacts apply automatically
6. Next round becomes available

Pause/Resume remains server-side and freezes the timer.

## Testing
Install dependencies and run the app normally:

```bash
npm install
npm start
```

For quick UI/timing testing, set:

```env
NEWS_SECONDS=10
TRADE_SECONDS=15
```

Restore 120/180 seconds for the actual event.
