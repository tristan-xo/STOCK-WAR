# Stock Wars Light Mode Style Guide

## Color tokens

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#F4F6F9` | Application background |
| `--panel` | `#FFFFFF` | Cards, modals, inputs |
| `--panel2` | `#F8FAFC` | Secondary surfaces |
| `--line` | `#D6DDE7` | Borders and dividers |
| `--text` | `#172033` | Primary text |
| `--muted` | `#536174` | Secondary text |
| `--accent` | `#1769AA` | Primary actions, links, active states |
| `--accent2` | `#6547A8` | Secondary accent |
| `--green` | `#147A4D` | Positive P/L, buy/success |
| `--red` | `#B42318` | Negative P/L, sell/danger |
| `--yellow` | `#8A5A00` | Warning / paused |

## Status language

- **Green:** positive price movement, buy/success, market-live success states.
- **Red:** negative price movement, sell/danger, critical alerts.
- **Amber:** paused/warning states.
- **Blue:** primary navigation, information, synchronized/active UI.
- **Gray:** neutral/inactive states.

Status colors are paired with text and labels; color is not the only indicator.

## Spacing

The interface uses an 8px spacing grid:

- `8px` — tight control groups, table/list gaps
- `16px` — standard card padding, section gaps
- `24px` — page-level spacing
- `32px` — large visual separation where required

## Components

- Cards: white surface, `1px` border, subtle shadow, 16px radius.
- Inputs: white surface, 1px gray border, 40px minimum height, blue focus ring.
- Buttons: 40px minimum height, strong weight, clear hover/active feedback.
- Tables: high-contrast headers, comfortable 1.45 line-height, scrollable on small screens.
- News/trading/price sections share the same white surface, border and spacing language.

## Scroll preservation

`capturePlayerScroll()` stores the current `scrollY` plus a DOM anchor visible near the upper third of the viewport. `restorePlayerScroll()` runs after the asynchronous player dashboard render and restores the anchor to its previous viewport offset. A numeric `scrollY` fallback is used if the anchor cannot be found.
