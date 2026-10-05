# Player News UI V7

Player portal news now uses the newspaper-style layout independently from the Host page.

Player-visible information:
- story number
- news category
- affected sector
- meaningful headline
- 3–5 line news article

Removed from Player:
- Positive / Negative labels
- Expected market impact / model value
- Any explicit price-impact percentage

Layout fix:
- Player news cards use content-driven height.
- No fixed/minimum story height is imposed.
- Long headlines and 3–5 line bodies wrap naturally.
- Overflow is visible inside each story and cannot overlap the next story.
- Desktop keeps the bulletin compact with internal scrolling; mobile expands naturally.

The underlying news generation and price engine are unchanged.
