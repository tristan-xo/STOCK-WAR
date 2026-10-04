# Autonomous News V3 — 3–5 Line Financial Stories

Each generated story now contains four deliberate, contextual lines rather than a one-line headline/body.

Every story:
- names the affected stock where applicable;
- identifies the relevant sector;
- explains the business development;
- describes the expected operational/financial consequence;
- gives investors a follow-up point to watch.

The frontend renders the line breaks with `white-space: pre-line`, while remaining responsive on mobile.

The price-impact pipeline is unchanged: news is published first, players trade during the trading window, and the stored impact map is applied only after trading closes.
