# Stock Wars — Security & Trading UI Fixes

## Sector stock detail
Stock detail now includes large Buy and Sell actions directly below the chart. Both actions open the existing order flow with the selected stock pre-populated. The controls are responsive for desktop and mobile.

## Player authentication
Player Login now uses `/api/auth/player-login`, which:
1. Finds the supplied account.
2. Verifies the password.
3. Explicitly requires `role === 'player'`.
4. Rejects host/admin credentials with HTTP 403 and a clear message.
5. Rejects suspended player accounts.
6. Records rejected host attempts in the audit trail.

Host login remains isolated at `/api/auth/admin-login` and requires `role='admin'`.

There is no longer a role-agnostic `/api/auth/login` endpoint.

## Transaction amount simplification
The user-facing order and transaction views show the transaction total and balance only. Brokerage/fee breakdowns have been removed from the UI.

The active quote engine no longer applies a brokerage charge; transaction total equals execution price × quantity. Legacy database fee columns remain only for backward-compatible storage of old databases and are set to zero for new transactions.

## Security scope
All player trading APIs continue to enforce session login, player role, active account status, trading-window state, cash/share constraints, and server-side quotes.
