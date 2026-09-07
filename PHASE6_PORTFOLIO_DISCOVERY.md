# Phase 6 — Portfolio Trading & Sector Discovery

## Buy/Sell page
- Prominent current cash balance.
- BUY/SELL tabs with distinct visual states.
- Quantity, order type, and limit price controls.
- Dynamic server-backed estimated amount.
- BUY shows estimated amount debited; SELL shows estimated amount credited.
- Estimates include transaction fee plus simulated market slippage and quantity-based price impact for market orders.
- Limit orders use the selected limit price and do not apply market slippage.
- Estimate refreshes whenever quantity/order type/limit price changes.
- Insufficient cash and excess sell quantity are blocked before review.
- Confirmation repeats the server quote, estimated post-trade balance, fee and adjustment bps.
- Successful trades close the modal and refresh the dashboard balance/portfolio immediately.

## Sector discovery
- All sectors are loaded alphabetically from the database.
- Sector search filters the sector tiles.
- Selecting a sector opens a responsive sector detail view.
- Sector detail has its own stock search.
- Each stock shows current price, simulated 24h/reference change, simulated market cap, and trading volume.
- Buy, sell and chart actions are available from sector detail.
- Loading, empty and error states are included.

## Simulated market metadata
The existing Stock Wars engine does not contain an external live-market feed or real market-cap/share-count dataset. Therefore sector market cap and volume are simulated event-market metadata, while current prices remain the Stock Wars server prices. The UI does not claim these values are live exchange data.

## Quote model
For market orders:
`effective price = market price ± (base slippage + quantity/volume price impact)`

The default base slippage is 5 bps and the quantity impact is capped at 50 bps. Both are server-side and can be configured with:
`SLIPPAGE_BPS`
`MAX_IMPACT_BPS`

Fees continue to use `TRADING_FEE_PCT`.

The same quote engine is used for preview and final transaction processing, so the browser cannot choose its own execution amount.
