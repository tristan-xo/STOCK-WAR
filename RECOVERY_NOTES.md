# Stock Wars Recovery Notes

This package was rebuilt from the uploaded Stock Wars files.

## Repairs made

- Restored the missing player/host frontend files under `public/`.
- Rebuilt `STOCK_LIST.csv` from the 50 stocks stored in the uploaded database because the uploaded CSV contained only its header.
- Preserved the uploaded database state in a checkpointed `stockwars.db`.
- Preserved the uploaded `.env` configuration.
- Prevented player-facing stock API responses from exposing the host-only news impact percentages.
- Fixed pause behavior so trading is blocked while the event is paused.
- Fixed round progression so the next round cannot start until the previous round's price changes have been applied.
- Added a separate admin stock endpoint for impact management.

## Current database state

The uploaded database contains the administrator account, 50 stocks, six rounds and 300 configured round-impact records. It is currently at Round 1 / live according to the uploaded event state.

## Run

1. Install Node.js 20+.
2. Run `npm install` in this folder.
3. Start with `npm start`.
4. Open `http://localhost:3000`.

Before the real event, change the admin password and session secret in `.env`.
