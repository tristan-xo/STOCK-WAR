# Next Round Start Fix

## Root cause
The 7-story autonomous news generator inserted every story into `market_news_events`. The original schema accidentally declared `round_id INTEGER NOT NULL UNIQUE`, which allowed only one news row per round. Story #1 inserted successfully; story #2 violated the UNIQUE constraint and `/api/admin/start-round` failed.

## Fix
- `market_news_events.round_id` is now non-unique.
- Existing deployed databases are migrated automatically at server startup by rebuilding the table without the unique constraint while preserving existing news rows.
- The generator can now insert all 7 stories for a round.
- Existing dashboard/API queries already return all news rows for the round.

## Deployment
Push the updated `server.js` with the rest of this build. Restart/redeploy the service. The one-time migration runs automatically against the existing SQLite database.
