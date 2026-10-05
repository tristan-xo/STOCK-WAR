# Stock Wars Portfolio Management System

## Portfolio holdings
Each open position displays:
- Stock symbol/name
- Total purchased
- Current shares held
- Average purchase price
- Current market price
- Cost basis
- Market value
- Unrealized P/L

Average purchase price on BUY:
`((old avg × old quantity) + (purchase price × new quantity)) / total quantity`

## Trading
Players can submit:
- BUY / SELL
- Whole-share quantity
- MARKET order
- LIMIT order

Limit orders execute immediately only when the limit is marketable against the simulated current price:
- BUY: limit >= current market price
- SELL: limit <= current market price

This avoids creating an unfilled order book that could conflict with the six-round event engine.

## Fees
Default fee is `0.10%` per executed order and is configurable with:
`TRADING_FEE_PCT=0.10`

Fees are stored separately from the execution price and shown in the confirmation and transaction history.

## Cost basis
The host chooses the cost-basis method before the first trade:
- FIFO — oldest purchase lots are consumed first
- AVERAGE — remaining shares retain the weighted average cost

Once trading has started, the cost-basis method is locked to prevent inconsistent historical accounting.

## Transaction records
Each executed order records:
- Timestamp
- Round
- Side
- Quantity
- Execution price
- Order type
- Limit price, when applicable
- Gross value
- Fee
- Net cash impact
- Realized P/L for sells

## Validation
The server rejects:
- Zero/negative quantities
- Fractional quantities
- Negative/zero limit prices
- Invalid order types
- Non-marketable limit orders
- Insufficient cash
- Selling more shares than held
- Orders outside the active trading window
- Duplicate client nonces

## Player UI
- Sortable holdings table
- Buy/Sell actions on every position
- Market search
- Stock chart
- Two-step order flow: Order → Review → Confirm & Execute
- Fee-inclusive confirmation
- Transaction history modal
- CSV transaction export
- Round performance history
