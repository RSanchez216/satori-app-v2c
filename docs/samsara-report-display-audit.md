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
| 7 | Coaching Recommendations – unit line | [samsara-offenders-client.tsx](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx) (`coachingForUnit`) | `Unit <id> had N faults across M different issue types — recommend ...` | (no driver involved — unchanged) | ✓ |
| 8 | Unmapped pill / drilldown panel | [UnmappedEventsPanel.tsx](components/reports/UnmappedEventsPanel.tsx) | (panel = unresolved by definition) — Unit, Alert Type, Count, Last Seen, Assign action | (same) | ✓ |
| 9 | Cross-cat badge tooltip | [samsara-offenders-client.tsx](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx) | (categories list — out of scope) | (categories list — out of scope) | N/A |
| 10 | Driver names in Show-all paginated views | [samsara-offenders-client.tsx](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx) (`useWatchlistPagination` + same row template) | Same row component as top-25 view | Same row component as top-25 view | ✓ |
| 11 | Unit Watchlist – Top Issues column | [samsara-offenders-client.tsx](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx) (`<TopIssues>` helper, line ~140s) | Top 3 decoded `(description, count)` pairs each prefixed with a severity dot, sorted by severity then count; "+N more" with HoverTip listing the rest; `—` when empty | (same — unit-side, not driver-side) | ✓ |

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

## Phase 2 update — fault-code decoding + severity coloring

- New module [lib/samsara/j1939-codes.ts](lib/samsara/j1939-codes.ts) holds
  the J1939 SPN/FMI lookup table, severity mapping, and a `parseFaultPair`
  helper. Starter table covers ~50 entries spanning oil, cooling, engine,
  EGR, aftertreatment (NOx / DPF / DEF / SCR), fuel, electrical, brakes,
  transmission, and tire codes. Discovery work tracked in
  [docs/samsara-fault-discovery.md](docs/samsara-fault-discovery.md).
- "Distinct Codes" column renamed **Issue Types**, with a tooltip on the
  header explaining the count.
- New **Top Issues** column added to the Unit Watchlist between Faults and
  Issue Types — top 3 decoded codes with severity dots, "+N more"
  HoverTip for the rest. Sorted by severity (critical first) then count.
- Critical Events accordion: events with a parseable SPN/FMI in their raw
  payload now render a colored severity dot before the `Driver:` label,
  with a HoverTip showing the decoded description.
- Coaching Recommendations unit line copy follows the rename:
  `Unit M80 had N faults across M different issue types — recommend …`
  (driver coaching copy is unchanged).
- RPC change: `get_samsara_unit_offenders` now returns an additional
  `top_issues jsonb` column — array of `{spn, fmi, count}` objects sorted
  by count desc per unit. Migration:
  [supabase/migrations/20260506_samsara_unit_top_issues.sql](supabase/migrations/20260506_samsara_unit_top_issues.sql).

## Polish pass (post Phase 2)

- J1939 lookup expanded with 15 high-frequency codes from Phase 1
  discovery findings (SCR Reagent Heater 4374-x, SCR Inducement 5443-0 /
  5444-1, SCR Catalyst Service 5298-14, Coolant Pressure 1089-4,
  Water-in-Fuel 97-4, Multi-cylinder Misfire 1322-31, J1939 Network
  639-2 / 639-14, Sensor Supply 3509-3, Brake Air 792-5, Aux Temp 241-1,
  Wheel Speed 84-0). Total entries 53 → 68. Estimated event-volume
  coverage now ~78% on current 30-day window, up from ~11%.
- Proprietary 520xxx codes documented as a known limitation at the top
  of the lookup table (require vehicle-make capture — deferred).
- Top Issues count format: `Description N` → `Description × N` with
  tabular-nums + 0.8 opacity on the count so the description reads as
  primary. Hover tooltip for `+N more` uses the same `× N` style.
- Unit Watchlist now filters `fault_count > 0` — zero-fault / idle-only
  units removed from the list. Companion `count_samsara_unit_offenders`
  RPC also filtered so the `Show all (N)` footer matches the visible
  row count. Migration:
  [supabase/migrations/20260507_samsara_filter_zero_fault_units.sql](supabase/migrations/20260507_samsara_filter_zero_fault_units.sql).
- "Issue Types" header: applied `whiteSpace: 'nowrap'` to the inner
  inline-flex span and bumped the column hint from 110 → 120 so the
  label fits on one line without compressing adjacent columns. (If
  this still wraps in dev, fall back to shortening the visible label
  to "Types" — tooltip content unchanged.)

## Deferred

- **Concern D — Unit Watchlist hides unresolved drivers**: the Unit
  Watchlist Driver(s) column relies on an RPC that returns only resolved
  names. Units with events from unmapped driver IDs show those drivers as
  invisible. Surfacing them as `M80 (unmapped)` chips requires an RPC
  change and a product decision on display format. Tracked separately.
- **OEM-proprietary fault codes (SPN ≥ 520192)** — 22% of fleet fault
  events come from the J1939 manufacturer-proprietary range and won't
  decode against the SAE table. Decoding requires capturing vehicle make
  per message + per-OEM lookup tables (Cummins, Detroit, Volvo, …). Out
  of scope for this round.

## Out of scope (per the prompt)

- Critical Events full message text (already verbatim Samsara payload).
- Cross-cat tooltip content (categories, not driver/unit IDs).
- The unmapped panel intentionally has no driver column — every row is a
  driver-less event.
