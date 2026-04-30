# Dashboard Live Data

How `/dashboard` stays fresh without a manual page refresh, plus design
constraints to keep in mind when changing this.

## Wiring

- One `useLiveData` at the top of [DashboardClient](app/(main)/dashboard/dashboard-client.tsx)
  replaces the previous manual `useEffect` + 60-second `setInterval` +
  separate `lastUpdated` / `refreshing` state machine.
- **Fetcher:** the existing `/api/dashboard/stats?from=&to=` endpoint —
  no API change. Closure over current `dateRange` so date-range pill
  changes trigger a refetch via the dedicated dependency-watch effect.
- **Subscription:** `public.messages` on `INSERT` (channel name
  `dashboard-live`). Every cascading data change in this product
  originates from a message insert (alerts, contexts, violations, Tori
  activity all derive from `messages`), so a single subscription on
  `messages` covers every tile via the SSR refetch path. Adding
  per-tile subscriptions would multiply channels for the same trigger
  with no new information delivered.
- **Live windows only.** When `dateRange.preset` is `today` / `7d` /
  `30d`, Realtime + focus refetch are wired. For `yesterday` and
  `custom` (fixed periods that don't change), the hook is constructed
  with `realtime: null` and `refetchOnFocus: false`; the Refresh button
  is the only freshness affordance.
- **Debounce:** 1500ms. Bursts of inserts batch into a single refetch.
- **Pause guard:** `shouldPause: undefined`. The Dashboard has no
  modals, drawers, or accordion-expand patterns where a refetch would
  jar the user; data updates always settle in place.

## UI

- Per-tile [`<LiveDot>`](components/ui/live-dot.tsx) in each tile
  header — 6×6 circle, green pulse when connected, amber when
  reconnecting, returns `null` when realtime is `disabled` (fixed-window
  date ranges). Hovering reveals the status word via `title`.
- No page-level `LiveStatusBar` — intentionally omitted to keep the
  dashboard visually calm. The dots alone are the freshness signal.
- Existing "Updated Xs ago" + Refresh button row at the page header
  is preserved and now reads `lastUpdated` / `isLoading` / `refetch`
  from the hook. The 1-second ticker for the seconds counter is kept
  for sub-minute granularity (sharper than `RelativeTime`'s 15s tick).

## Tile coverage

| Tile | LiveDot | Subscription | Notes |
|---|:---:|---|---|
| Open Situations (StatCard) | ✓ | `messages` | Fed by `message_contexts`; refresh cascades from `messages` |
| Resolved Today (StatCard) | ✓ | `messages` | Same |
| Health Score (StatCard) | ✓ | `messages` | Computed from `kb_violations` |
| KB Violations (StatCard) | ✓ | `messages` | From `alerts` table |
| Violations Card | ✓ | `messages` | RPC over `kb_violations` |
| Operations Health (HealthRing) | ✓ | `messages` | RPC over `kb_violations` |
| Samsara Alerts | ✓ | `messages` | RPC over Samsara messages |
| Brain Status | ✓ | `messages` | KB rule changes also matter; covered by cascade |
| Top Violated Rules | ✓ | `messages` | RPC over `kb_violations` |
| Open Situations list | ✓ | `messages` | From `message_contexts` |
| Recent Alerts | ✓ | `messages` | From `alerts` |
| Tori Activity | ✓ | `messages` | From `tori_activity_log` |

## Constraint flagged at design time

`message_contexts`, `alerts`, `tori_activity_log`, and `kb_violations`
are NOT in the `supabase_realtime` publication — out of scope per the
prompt. Subscribing each tile to its "true" upstream table would have
required a publication migration. Subscribing to `messages` only is
sufficient because every data change starts there and the SSR refetch
path re-runs all 13 dashboard queries on each trigger. If you ever
add a tile whose data does NOT cascade from a `messages` insert, you'll
need a new subscription target.

## Migration footprint

None. The existing `20260508_enable_realtime_subscriptions.sql` already
publishes `messages`; this work just consumed what was already there.
