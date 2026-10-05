# Stock Wars Phase 5 — Event-Day Operations & Hardening

Phase 5 turns the project into an event-day operations platform.

## Added

### Registration control
- Host can open/lock player registration.
- Registration automatically locks when Round 1 starts.
- Registration cannot be reopened after the event has started.
- Player registration page reflects the current registration state.

### Live presence
- Player heartbeat every 15 seconds.
- Online/offline status in Host Operations.
- Last seen time.
- Visible/hidden tab state.
- Visibility-event count.

### Host broadcast
- Host can send a synchronized announcement to every connected portal.
- Info / success / warning / critical severity.
- Clear active announcement.
- Announcement appears above the synchronized timer.

### Player account control
- Host can suspend/reactivate a player's trading access.
- Suspended players can still view the event but cannot submit trades.
- Status is visible in the player and host portals.
- Every suspend/reactivate action is audited.

### Round performance snapshots
At every automatic price update, the server records each player's:
- Portfolio value
- Cash
- Market value
- Profit
- Round number

Players see their round history. Hosts can inspect a player's round history.

### Full event package
Host Operations includes a one-click JSON export containing:
- Event state
- Rounds
- Stocks
- Price impacts
- Players
- Trades
- Round snapshots
- Flags
- Audit history
- Announcements

## Existing controls preserved
- Server-authoritative 2-minute news window
- Server-authoritative 3-minute trading window
- Automatic price application
- Pause / Resume
- Emergency Force Lock
- Reset Event
- Groww-style player terminal
- Charts
- Anti-cheat audit/flags
- Finale / presentation mode
