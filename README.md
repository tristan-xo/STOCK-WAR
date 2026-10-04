# Stock Wars — Phase 1 Event Reliability

Phase 1 hardens the six-round Stock Wars simulation for a live college event.

## Automatic round lifecycle

When the host starts a round:

1. News is published.
2. 2-minute news phase begins.
3. Trading opens automatically.
4. 3-minute trading phase begins.
5. Trading closes automatically.
6. The server generates a per-stock news impact map automatically.
7. Trading closes and all price changes are committed atomically.
8. Portfolio snapshots are taken only after the new prices are committed.
9. The round is recorded as applied.
10. The next round can be started.

The host does not need to manually apply prices during normal operation.

## Pause / Resume

The host can pause at any point during an active news or trading phase.

- The timer is frozen on the server.
- Player orders are blocked while paused.
- Resume continues from the exact remaining time.
- This is the emergency control and does not reset the phase.

## Server-authoritative timing

The countdown is stored in the database as absolute server timestamps. Browser clocks do not control trading.

The server runs a transition loop and also performs startup recovery. If the Node process restarts, it reads the persisted phase/timestamps and continues or completes the phase automatically.

If the server was offline long enough to pass the entire remaining phase, it catches up rather than restarting the round from the beginning.

## Real-time synchronization

The host and players use Server-Sent Events (SSE). Connected browsers receive phase, timer, pause/resume and completion updates without refreshing.

The browser timer uses the server timestamp sent by SSE, reducing clock drift.

## Phase 1 reliability protections

### Trade safety
- Server checks that the phase is actually trading.
- The same trading check is performed again inside the database transaction.
- Trade price is read from the server database inside the same transaction that commits the trade.
- A market version is incremented only after a complete price-update transaction commits.
- Duplicate client order nonces are rejected.
- Players are limited to 30 order attempts per minute.
- Buy/sell validation happens server-side.

### Audit trail
The system records:
- logins/logouts
- player registrations
- trades
- host round starts
- pause/resume
- emergency locks
- price applications
- event resets
- player browser visibility changes

Host → **Audit Log** displays the latest 500 events.

### Database recovery
Before applying a round and before a full event reset, the server creates a SQLite backup under `backups/` and keeps the newest 10 backups.

Price history is also recorded after each market update.

## Configuration

Copy `.env.example` to `.env` and set your own credentials.

```text
NEWS_SECONDS=120
TRADE_SECONDS=180
```

For testing, you can temporarily use smaller values, for example 10 and 15 seconds. Restore 120 and 180 seconds before the event.

## Run

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

For a LAN event, run the server on the host laptop and have players connect to the host laptop's local IP, for example:

```text
http://192.168.1.10:3000
```

Allow Node.js through the host computer firewall for the private/local network.

## Database

SQLite is suitable for a small/medium college event. For a very large event, migrate the database to PostgreSQL before production.

This application is a simulation and does not place real stock-market orders.


## Phase 5
Adds event-day operations: registration locking, live player presence, host broadcasts, player suspension/reactivation, round performance snapshots, and full event-package export. Run `npm install` after extraction so dependencies are synchronized.


## Portfolio Management System
Adds detailed holdings accounting, weighted average price, FIFO/Average cost basis, market/limit orders, transaction fees, realized/unrealized P&L, sortable holdings, confirmation screens, transaction history and CSV export.


## Phase 6 — Trading & Discovery
Adds dynamic fee/slippage/price-impact estimates, prominent balance tracking, BUY/SELL visual separation, searchable alphabetical sectors, sector stock discovery with simulated market cap/volume, and responsive loading/empty/error states.

## Autonomous news engine

By default (`AUTO_NEWS=true`), each round receives a newly generated simulated financial story. The engine uses weighted categories such as earnings surprise/miss, policy support, regulation, commodity shock, demand surge, major contracts, supply disruption, and broad market risk/rally. Events can be market-wide or sector-specific.

The news event immediately produces the round's impact map, but the actual stock-price commitment remains at the end of the trading phase so players can trade on the revealed information. The host does not need to enter news or impacts manually.

The host's **News & Rounds** tab shows the causal audit trail: generated news → model impact → old price → new price → timestamp.
