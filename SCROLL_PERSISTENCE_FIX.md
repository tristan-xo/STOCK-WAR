# Player Scroll Persistence Fix

## Root cause

The previous player renderer captured the scroll position **after** awaiting `/api/player/dashboard`. During a full browser refresh, the new document had already begun rebuilding and the old element-anchor calculation could therefore be based on an incomplete DOM. The anchor method also did not explicitly preserve distance from the bottom of a dynamically sized page. When stock/sector cards finished rendering, the saved coordinate could land in the middle of the page.

A second problem was that live SSE refreshes could reuse an older `sessionStorage` snapshot. That is particularly noticeable after browsing the sector grid: a previous viewport could win over the user's current location.

## Fix

The player page now:

1. Sets `history.scrollRestoration = 'manual'` so the browser does not compete with the application.
2. Saves scroll state continuously with a throttled handler and on `pagehide`/`beforeunload`.
3. Captures the current viewport **before** every asynchronous dashboard request.
4. Stores both `scrollY` and `distanceFromBottom`.
5. Detects an actual browser reload using the Navigation Timing API and only then uses the persistent `sessionStorage` snapshot.
6. Waits for several consecutive stable layout frames before restoring.
7. For bottom-of-page positions, restores `finalMaxScroll - savedDistanceFromBottom` rather than an outdated absolute Y coordinate.
8. Clamps every restored value to the final scrollable range.
9. Performs a final animation-frame correction for late layout changes.
10. Keeps live SSE updates based on the in-memory viewport capture, preventing stale sector/page positions from being reapplied.

## Expected behavior

- Refresh at top → returns to top.
- Refresh in the middle → returns to the same viewport location.
- Refresh at the bottom → remains at the bottom, even if dynamic content height changes.
- Scroll through the sector grid → live updates do not jump back to an older sector position.
- Open/close a sector modal → the underlying player-page viewport remains unchanged.
