# Samsara Report Display Surfaces — Audit

For each surface, document where driver/unit info is rendered and confirm the
resolved-driver pattern is applied consistently:

- **Resolved**: name on top line (font-medium, primary text, sans-serif), ID
  on second line (text-xs / 12px, monospace, muted) — or inline `Name (ID)`
  where two-line layout doesn't fit.
- **Unresolved**: raw `driver_id` on top line (font-medium, primary text,
  sans-serif — same treatment as the resolved name; do not bump weight or
  switch to monospace), `unmapped` on second line (text-xs / 12px, muted,
  upright — no italic).
- **Null/empty**: render `—` in muted text.

| # | Surface | File | Resolved format | Unresolved format | Status |
|---|---------|------|-----------------|-------------------|--------|
| 1 | Driver Watchlist – Driver column | [samsara-offenders-client.tsx:527-543](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L527-L543) | Name (primary, font-medium, sans-serif) over ID (mono, 12px, muted) | Raw ID (primary, font-medium, sans-serif) over `unmapped` (12px, muted) | ✓ |
| 2 | Driver Watchlist – Unit(s) column | [samsara-offenders-client.tsx:534-536](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L534-L536) | `<ListPreview>` shows up to 3 + "+N more" with hover for full list; `—` when empty | (same) | ✓ |
| 3 | Unit Watchlist – Driver(s) column | [samsara-offenders-client.tsx:619](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L619) | `<ListPreview>` of resolved driver names from RPC; `—` when empty | (RPC returns names only — unresolved drivers excluded by source) | ✓ |
| 4 | Critical Events – event row header | [samsara-offenders-client.tsx:729-749](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L729-L749) | `Driver: Name (ID) · Unit: M80` | `Driver: <raw_id> · Unit: M80` (or `Driver: — · Unit: —` when both null) | ✓ |
| 5 | Critical Events – full message panel | [samsara-offenders-client.tsx:761-778](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L761-L778) | (raw text — out of scope) | (raw text — out of scope) | N/A |
| 6 | Coaching Recommendations – driver line | [samsara-offenders-client.tsx:210-221](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L210-L221) | `Name (ID) on Unit <id> flagged N times — top issue: ...` | `Driver <raw_id> on Unit <id> flagged N times — top issue: ...` | ✓ |
| 7 | Coaching Recommendations – unit line | [samsara-offenders-client.tsx:242-250](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L242-L250) | `Unit <id> had N faults across M different SPN/FMI codes — recommend ...` | (no driver involved — unchanged) | ✓ |
| 8 | Unmapped pill / drilldown panel | [UnmappedEventsPanel.tsx](components/reports/UnmappedEventsPanel.tsx) | (panel = unresolved by definition) — Unit, Alert Type, Count, Last Seen, Assign action | (same) | ✓ |
| 9 | Cross-cat badge tooltip | [samsara-offenders-client.tsx:545-554](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L545-L554) | (categories list — out of scope) | (categories list — out of scope) | N/A |
| 10 | Driver names in Show-all paginated views | [samsara-offenders-client.tsx:514-569](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L514-L569) (`useWatchlistPagination` + same row template) | Same row component as top-25 view | Same row component as top-25 view | ✓ |

## Final state

- **Surface 1** (Driver Watchlist driver column) — aligned to spec. Both
  resolved and unresolved top lines render at `fontWeight: 500` (font-medium),
  primary text, sans-serif default — only the rendered string differs (name
  vs raw id). Sub-line is `fontSize: 12` (text-xs) muted, with monospace
  applied only to the resolved id; the unresolved `unmapped` label is upright
  sans-serif. (Earlier auto-applied draft used 600 + monospace + italic on
  the unresolved branch; reverted to spec.)
- **Surface 4** (Critical Events row header) — kept the
  `Driver: <Name> (<ID>) · Unit: <unit_id>` format with explicit colons and a
  middle-dot separator (replacing the prior colon-less, gap-only form).
- **Surface 6** (Coaching Recommendations driver line) — kept the parallel
  `on Unit X` clause across the resolved and unresolved branches of
  `driverDisplayForCoaching`, so the recommendation copy reads uniformly
  regardless of mapping status.

## Deferred

- **Concern D — Unit Watchlist hides unresolved drivers**: the Unit
  Watchlist Driver(s) column relies on an RPC that returns only resolved
  names. Units with events from unmapped driver IDs show those drivers as
  invisible. Surfacing them as `M80 (unmapped)` chips requires an RPC
  change and a product decision on display format. Tracked separately.

## Out of scope (per the prompt)

- Critical Events full message text (already verbatim Samsara payload).
- Cross-cat tooltip content (categories, not driver/unit IDs).
- The unmapped panel intentionally has no driver column — every row is a
  driver-less event.
