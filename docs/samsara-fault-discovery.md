# Samsara Fault-Code Discovery (Phase 1)

Prep work for the "decode SPN/FMI + add Top Issues column + severity dots"
feature. Read-only investigation; no code changes in this phase.

## 1a. Parser inspection

**Where parsing actually lives:** server-side, in the
`get_samsara_unit_offenders` RPC. The client component
`app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx` does
**no** SPN/FMI parsing — it consumes pre-aggregated counts
(`fault_count`, `fault_codes_distinct`) returned by the RPC and renders them
into the Unit Watchlist table.

**RPC source:**
[supabase/migrations/20260505_samsara_polish.sql:262-348](supabase/migrations/20260505_samsara_polish.sql#L262-L348)

**Regex used (Postgres):**
```sql
regexp_match(m.message_text, 'SPN\s+(\d+)\s+FMI\s+(\d+)', 'i')
```
Returned as a `text[]` of length 2 — `spn_fmi[1]` is the SPN, `spn_fmi[2]`
is the FMI. Matches one pair per message; not greedy/global. The CTE column
is named `spn_fmi`.

**How counts get derived (line 329-331):**
```sql
COUNT(*) FILTER (WHERE alert_type = 'vehicle_fault')             AS fault_count,
COUNT(DISTINCT spn_fmi[1] || '/' || spn_fmi[2])
  FILTER (WHERE alert_type = 'vehicle_fault' AND spn_fmi IS NOT NULL)::int AS fault_codes_distinct,
```

**Client-side use:**
- [samsara-offenders-client.tsx:48](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L48) — `faultCodesDistinct` field on `UnitRow`.
- [samsara-offenders-client.tsx:632-635](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L632-L635) — render in "Distinct Codes" column (red-bold when ≥5, raw number otherwise, `—` when zero).
- [samsara-offenders-client.tsx:246-250](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L246-L250) — `coachingForUnit` references `u.faultCodesDistinct` in the recommendation copy.
- [samsara-offenders-client.tsx:1057](app/(main)/reports/samsara-offenders/samsara-offenders-client.tsx#L1057) — mapped from RPC field `fault_codes_distinct`.

**Critical implication for Phase 3:** the client **never sees the per-pair
breakdown** — it gets only the count of distinct pairs and the total fault
count. To render a "Top Issues" column showing the top-3 (description, count)
per unit, we need *per-pair counts grouped by unit*, which the current RPC
does not return. See the "Architectural blocker" section below.

## 1b. SQL probe — actual code distribution (last 30 days)

Total `vehicle_fault` events with a parseable SPN/FMI pair: **247**
Distinct (SPN, FMI) pairs observed: **55**
Of those, manufacturer-proprietary range (SPN 520192–524287): **63 events / 7 distinct pairs**

### Top 30 (SPN, FMI) pairs

| Rank | SPN | FMI | Occurrences | Status in starter J1939 lookup |
|----:|----:|----:|------------:|:-------------------------------|
|  1 | 520349 | 14 | 44 | — proprietary |
|  2 |   3216 | 21 | 28 | — (table has 3216-16, 3216-20 only) |
|  3 |   3216 | 16 | 17 | ✓ NOx Inlet High (warning) |
|  4 |   2659 |  0 | 16 | — |
|  5 |   3226 |  2 | 14 | — |
|  6 |   3226 | 13 | 10 | — |
|  7 |   5713 | 20 |  9 | — |
|  8 |    792 |  5 |  7 | — |
|  9 |   4374 |  4 |  7 | — |
| 10 |   1089 |  4 |  6 | — |
| 11 |   4374 |  1 |  6 | — |
| 12 |   5444 |  1 |  6 | — |
| 13 | 520966 |  1 |  6 | — proprietary |
| 14 |    111 |  1 |  5 | ✓ Low Coolant Level (Severe) (critical) |
| 15 |    639 | 14 |  5 | — |
| 16 |   2659 | 17 |  4 | — |
| 17 | 520245 |  1 |  4 | — proprietary |
| 18 | 521031 | 18 |  4 | — proprietary |
| 19 |   1322 | 31 |  3 | — |
| 20 |   3509 |  3 |  3 | — |
| 21 |     97 |  4 |  2 | — |
| 22 |    111 | 18 |  2 | ✓ Low Coolant Level (Moderate) (warning) |
| 23 |    241 |  1 |  2 | — |
| 24 |    639 |  2 |  2 | — |
| 25 |   5298 | 14 |  2 | — |
| 26 |   5443 |  0 |  2 | — |
| 27 | 520240 |  9 |  2 | — proprietary |
| 28 | 520363 |  5 |  2 | — proprietary |
| 29 |     84 |  0 |  1 | — |
| 30 |     96 | 19 |  1 | — (table has 96-1, 96-17 only) |

### Coverage analysis vs. Phase 2's starter J1939 table

The starter table proposed in the prompt contains **45** entries. Of the
30 most-frequent observed pairs:

| Metric | Covered | Total | % |
|---|---:|---:|---:|
| Distinct pairs in top-30 | 3 | 30 | **10%** |
| Event volume from top-30 covered pairs | 24 | 215 | **11%** |
| Distinct pairs in *all* observed (estimate)¹ | ≤ 5 | 55 | ≤ 9% |

¹ Without joining the full 55-pair list to the starter table programmatically,
this is a conservative bound based on which starter entries are even
plausible matches. The 3 confirmed hits are 3216-16, 111-1, 111-18.

### What this means

- **The starter J1939 lookup will leave ~89% of observed fault events
  rendering as `SPN <n>/FMI <n>` in grey** — i.e. as "unknown".
- **22% of all events come from manufacturer-proprietary SPNs** (≥520192)
  that no plain J1939 SAE lookup will cover. Decoding those needs
  OEM-specific tables (Cummins, Detroit, Volvo, etc.) keyed by both
  `make` and `(spn,fmi)`. We do not currently capture vehicle make in
  `messages`.
- The single most frequent code in the fleet (520349-14, 44 occurrences)
  is proprietary and would need OEM data to decode.

## Architectural blocker for Phase 3

The prompt instructs: *"This prompt is **display-only** in spirit — the
only new logic is decoding and counting top issues. No data changes, no
schema changes, no RPC changes."*

That contradicts Phase 3's requirement to render a Top-Issues column
**per unit** with the top-3 (description, count) pairs. The current
unit-offenders RPC returns only `fault_count` and `fault_codes_distinct` —
it does not return the per-pair breakdown grouped by unit. To populate
Top Issues, we need one of:

1. **Modify `get_samsara_unit_offenders`** to additionally return a
   `top_issues jsonb[]` per row (e.g. `[{"spn":3216,"fmi":16,"count":17}, …]`,
   pre-sorted, top-N or all). RPC change required.
2. **Add a new RPC** like `get_samsara_unit_fault_breakdown(p_start, p_end,
   p_unit_id)` and call it client-side per visible unit. N+1 calls; not
   ideal for "Show all" pagination.
3. **Fetch raw `message_text`** for `vehicle_fault` events client-side and
   re-run the regex in TS. Doable but duplicates server logic and ships
   a meaningful payload over the wire.

Option 1 is cleanest. It's a one-line additional aggregate in the existing
CTE plus one extra column in the RETURNS TABLE — minimal blast radius.

**Recommendation:** before starting Phase 2, decide whether the
"no RPC changes" constraint can be relaxed. If yes, plan Option 1 alongside
the J1939 module work. If no, the Top Issues column has to be cut from
this prompt.

## Notes for Phase 2 (when we get there)

- The starter J1939 lookup is still useful — even at 11% coverage of event
  volume, the codes it does cover (cooling, oil, NOx) are exactly the
  **critical/warning** ones that drive coaching decisions. Unknowns
  rendering as raw `SPN x/FMI y` in grey is acceptable as a first cut.
- Worth adding to the lookup based on this discovery (high-frequency,
  publicly-documented J1939):
  - `3216-21` (NOx Inlet Sensor, Out of Range — warning) — 28 events
  - `3216-20` already in starter — but 3216-21 is the most common 3216 variant here
  - `3226-2` / `3226-13` (NOx Outlet Sensor) — combined 24 events
  - `2659-0` / `2659-17` (EGR Mass Flow) — combined 20 events
- Proprietary codes (520xxx range) won't show useful descriptions until we
  capture vehicle make and ship OEM lookups — out of scope here.

## Phase 1 status

- Discovery doc written ✓
- Top-30 codes captured ✓
- Coverage measured ✓
- Architectural blocker identified ⚠ — decision needed before Phase 3.

Stopping here per the prompt's "STOP at the end of Phase 1" instruction.
