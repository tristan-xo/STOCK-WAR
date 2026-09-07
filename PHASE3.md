# Stock Wars Phase 3 — Host Competition Operations

Phase 3 adds the competition-operations layer without changing the Phase 1 event engine or Phase 2 player trading terminal.

## Host control room
- Dashboard remains the primary live event screen.
- Players, orders, current round and phase are visible.
- Existing Pause / Resume and Force Lock controls are retained.
- Live leaderboard is shown in the host dashboard.

## Analytics
- Player performance with ranking.
- Tie-break ordering: portfolio value, cash, fewer trades, earlier registration.
- Sector activity and turnover.
- Top traded stocks.
- Round-by-round turnover.
- Automatic burst-trading review signals (20+ trades in one round).

## Anti-cheat / review
- Host can manually flag a player with a reason.
- Open flags can be resolved from Audit & Flags.
- Existing audit log remains available.
- Future news and impacts remain server-side.

## Exports
The Analytics page can export:
- Leaderboard CSV
- Full trade CSV

## Health / reliability
A server health endpoint reports current event state, player count, trade count and server time for host diagnostics.

## Event engine unchanged
Normal flow remains:

1. Start Round
2. News phase — 2 minutes
3. Trading phase — 3 minutes
4. Automatic trading close
5. Automatic price impact application
6. Next round

Pause / Resume remains the emergency control and freezes the server-authoritative timer.
