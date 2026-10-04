# Player UX Refactor — Scroll Preservation + Light Mode

## Scroll preservation

The player dashboard is refreshed whenever the server sends a meaningful state change, including news publication, phase transitions, and committed market-price updates. The dashboard uses a full DOM render, so a normal `innerHTML` replacement resets the browser viewport.

The refactor adds three safeguards:

1. **Visual anchor capture:** before replacing the player dashboard, the client records the element visible around the upper third of the viewport and its offset from that viewport point.
2. **Post-layout restoration:** after the asynchronous dashboard render finishes, two animation frames are allowed for layout/content to settle, then the anchor is restored to the same viewport offset. This handles changes in news text height above the user's position.
3. **Fallback + stale-render guard:** if the anchor disappears, the exact previous `scrollY` is restored. A monotonically increasing `playerRenderSeq` prevents an older, slower dashboard request from overwriting a newer state update.

The mechanism does not use `window.location`, reload the page, or require the player to manually navigate back to their previous position.

## Light mode

The complete UI is visually unified around white/off-white surfaces, gray borders, dark readable text, blue primary actions, green positive states, red negative states, and amber warning states. The 8px spacing grid is used as the primary rhythm for cards, controls, grids and dense data sections.
