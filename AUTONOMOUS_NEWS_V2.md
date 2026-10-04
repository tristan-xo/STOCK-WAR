# Autonomous News V2

Each round now publishes **8 distinct market stories**. The generator intentionally diversifies the round instead of repeatedly producing generic sector headlines.

## Composition
- 8 stories per round
- 8 different news categories where available
- At least 6 different sectors in normal rounds
- Each sector story names one real stock from that sector
- Up to 2 market-wide stories are reserved for the final slots
- Stock-specific impact is strongest for the named stock
- Peer stocks in the same sector receive a smaller related impact
- Unrelated sectors receive only small spillover

## Example round
1. TCS — earnings surprise — IT
2. Tata Motors — demand surge — Automobile
3. Sun Pharma — regulatory update — Pharma
4. HDFC Bank — policy/rules — Banking
5. Reliance Industries — commodity/input shock — Energy & Conglomerates
6. Hindalco — supply disruption — Metals
7. Market risk — broad Indian equities
8. Market rally — broad Indian equities

The actual stock and sector are randomized from the database each round.

## Timing
News and impacts are generated and stored when the host starts the round. Prices remain unchanged during the news/trading window. At trading close, all stored impacts are applied in one atomic transaction.
