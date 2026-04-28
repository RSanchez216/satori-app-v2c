# Samsara Report Display Surfaces — Audit

For each surface, document where driver/unit info is rendered and confirm the
resolved-driver pattern is applied consistently:

- **Resolved**: name on top line (medium weight, primary text), ID on second
  line (small, monospace, muted) — or inline `Name (ID)` where two-line layout
  doesn't fit.
- **Unresolved**: raw `driver_id` on top line (monospace, primary), `unmapped`
  on second line (small, muted, italic).
- **Null/empty**: render `—` in muted text.

| # | Surface | File | Resolved format | Unresolved format | Status |
|---|---------|------|-----------------|-------------------|--------|
| 1 | Driver Watchlist – Driver column | [samsara-offenders-client.tsx:524-533](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L524-L533) | Name (primary, 600) over ID (mono, 10px, muted) | Raw ID (mono, primary, 600) over `unmapped` (10px, muted, italic) | ✓ |
| 2 | Driver Watchlist – Unit(s) column | [samsara-offenders-client.tsx:534-536](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L534-L536) | `<ListPreview>` shows up to 3 + "+N more" with hover for full list; `—` when empty | (same) | ✓ |
| 3 | Unit Watchlist – Driver(s) column | [samsara-offenders-client.tsx:619](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L619) | `<ListPreview>` of resolved driver names from RPC; `—` when empty | (RPC returns names only — unresolved drivers excluded by source) | ✓ |
| 4 | Critical Events – event row header | [samsara-offenders-client.tsx:729-749](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L729-L749) | `Driver: Name (ID) · Unit: M80` | `Driver: <raw_id> · Unit: M80` (or `Driver: — · Unit: —` when both null) | ✓ |
| 5 | Critical Events – full message panel | [samsara-offenders-client.tsx:761-778](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L761-L778) | (raw text — out of scope) | (raw text — out of scope) | N/A |
| 6 | Coaching Recommendations – driver line | [samsara-offenders-client.tsx:210-221](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L210-L221) | `Name (ID) on Unit <id> flagged N times — top issue: ...` | `Driver <raw_id> on Unit <id> flagged N times — top issue: ...` | ✓ |
| 7 | Coaching Recommendations – unit line | [samsara-offenders-client.tsx:242-250](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L242-L250) | `Unit <id> had N faults across M different SPN/FMI codes — recommend ...` | (no driver involved — unchanged) | ✓ |
| 8 | Unmapped pill / drilldown panel | [UnmappedEventsPanel.tsx](components/reports/UnmappedEventsPanel.tsx) | (panel = unresolved by definition) — Unit, Alert Type, Count, Last Seen, Assign action | (same) | ✓ |
| 9 | Cross-cat badge tooltip | [samsara-offenders-client.tsx:545-554](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L545-L554) | (categories list — out of scope) | (categories list — out of scope) | N/A |
| 10 | Driver names in Show-all paginated views | [samsara-offenders-client.tsx:514-569](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L514-L569) (`useWatchlistPagination` + same row template) | Same row component as top-25 view | Same row component as top-25 view | ✓ |

## Fixes applied

1. **Surface 1** — Top line now monospace + 600 weight in unresolved case (raw
   IDs read better in monospace); sub-line `unmapped` now italic.
2. **Surface 4** — Added `:` after `Driver`/`Unit` labels and a `·` separator
   between the two clauses, matching the spec format.
3. **Surface 6** — `driverDisplayForCoaching` now appends the unit clause for
   the unresolved branch as well, so reports read uniformly.

## Out of scope (per the prompt)

- Critical Events full message text (already verbatim Samsara payload).
- Cross-cat tooltip content (categories, not driver/unit IDs).
- The unmapped panel intentionally has no driver column — every row is a
  driver-less event.
