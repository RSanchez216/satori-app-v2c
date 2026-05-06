'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { pluralize } from '@/lib/utils'
import type {
  WatchlistPayload, WatchlistRow, CriticalEventRow, CoachingRecommendation,
  Severity,
} from '@/lib/briefings/types'

// Project severity tokens. The Samsara report uses these same vars at
// `--severity-{critical,high,medium,low}` — keeping the briefing renderer
// in the same visual language (red / amber / cyan / green dots).
function severityVar(s: Severity): string {
  switch (s) {
    case 'critical': return 'var(--severity-critical)'
    case 'high':     return 'var(--severity-high)'
    case 'medium':   return 'var(--severity-medium)'
    case 'low':      return 'var(--severity-low)'
  }
}

function SeverityDot({ severity, size = 8 }: { severity: Severity; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block', flexShrink: 0,
        width: size, height: size, borderRadius: '50%',
        background: severityVar(severity),
      }}
    />
  )
}

// ─── Top-level renderer ────────────────────────────────────────────────────

export function WatchlistRenderer({ payload }: { payload: WatchlistPayload }) {
  // Defensive — bump unknown schema versions to a notice rather than rendering
  // potentially-mismatched fields. Future-proofs Phase 6+ shape changes.
  if (payload.schema_version !== 1) {
    return (
      <div style={{
        padding: '14px 16px', borderRadius: 8,
        background: 'rgba(227,179,65,0.08)', border: '1px solid rgba(227,179,65,0.25)',
        fontSize: 12, color: 'var(--severity-high)',
      }}>
        Payload schema version {String(payload.schema_version)} is newer than this UI knows how to render.
        Update the app or open this run in a fresh deploy.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <RangeStrip payload={payload} />
      <WhatsNew payload={payload} />
      <DriverWatchlist payload={payload} />
      <UnitWatchlist payload={payload} />
      <CriticalEvents payload={payload} />
      <CoachingSection payload={payload} />
    </div>
  )
}

/* ─── Sections ─────────────────────────────────────────────────────────── */

function RangeStrip({ payload }: { payload: WatchlistPayload }) {
  const from = new Date(payload.range.from)
  const to   = new Date(payload.range.to)
  const fmt  = (d: Date) => format(d, 'MMM d, h:mm a')
  return (
    <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
      Window: {fmt(from)} → {fmt(to)} ·
      Generated {format(new Date(payload.generated_at), 'MMM d, h:mm a')}
      {payload.previous_run_at && (
        <> · Previous {format(new Date(payload.previous_run_at), 'MMM d, h:mm a')}</>
      )}
    </p>
  )
}

function WhatsNew({ payload }: { payload: WatchlistPayload }) {
  const w = payload.whats_new

  if (w.is_first_run) {
    return (
      <SectionCard title="What's New" accent="var(--severity-low)">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          First briefing — no comparison data yet. Future runs will show what&apos;s changed
          since the last briefing.
        </p>
      </SectionCard>
    )
  }

  // Suppress empty bullets so a quiet briefing doesn't show 6 zero rows.
  const bullets: Array<{ severity: Severity; text: string }> = []
  if (w.new_critical_events > 0) {
    bullets.push({
      severity: 'critical',
      text: `${pluralize(w.new_critical_events, 'new critical event')}`,
    })
  }
  for (const d of w.new_watchlist_drivers) {
    bullets.push({
      severity: 'high',
      text: `Added to driver watchlist: ${d.driver_name ?? d.driver_id ?? '—'}${d.driver_id && d.driver_name ? ` (#${d.driver_id})` : ''}`,
    })
  }
  for (const d of w.resolved_drivers) {
    bullets.push({
      severity: 'low',
      text: `Dropped off driver watchlist: ${d.driver_name ?? d.driver_id ?? '—'}${d.driver_id && d.driver_name ? ` (#${d.driver_id})` : ''}`,
    })
  }
  for (const u of w.new_watchlist_units) {
    bullets.push({ severity: 'high', text: `Added to unit watchlist: ${u.unit_name ?? u.unit_id ?? '—'}` })
  }
  for (const u of w.resolved_units) {
    bullets.push({ severity: 'low', text: `Dropped off unit watchlist: ${u.unit_name ?? u.unit_id ?? '—'}` })
  }

  return (
    <SectionCard title="What's New" accent="var(--severity-low)">
      {bullets.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          No changes since the last briefing.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <SeverityDot severity={b.severity} size={6} />
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function DriverWatchlist({ payload }: { payload: WatchlistPayload }) {
  const { rows, total_on_watchlist } = payload.driver_watchlist
  return (
    <SectionCard
      title={`Driver Watchlist (top ${rows.length} of ${total_on_watchlist})`}
      headerRight={total_on_watchlist > rows.length
        ? <ViewMoreLink href="/reports/samsara-offenders" />
        : null}
    >
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No drivers on watchlist in this window.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <WatchlistRowItem key={r.id} row={r} kind="driver"
              isLast={i === rows.length - 1} />
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function UnitWatchlist({ payload }: { payload: WatchlistPayload }) {
  const { rows, total_on_watchlist } = payload.unit_watchlist
  return (
    <SectionCard
      title={`Unit Watchlist (top ${rows.length} of ${total_on_watchlist})`}
      headerRight={total_on_watchlist > rows.length
        ? <ViewMoreLink href="/reports/samsara-offenders" />
        : null}
    >
      {rows.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No units on watchlist in this window.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <WatchlistRowItem key={r.id} row={r} kind="unit"
              isLast={i === rows.length - 1} />
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function WatchlistRowItem({ row, kind, isLast }: { row: WatchlistRow; kind: 'driver' | 'unit'; isLast: boolean }) {
  const showName = row.is_resolved && row.name
  const idLabel  = row.id || '—'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '10px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SeverityDot severity={row.severity} />
        {showName ? (
          <>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              {row.name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              #{idLabel}
            </span>
          </>
        ) : (
          // Unresolved drivers / units render the raw id sans-serif on the
          // top line — same convention as the Samsara report's watchlist.
          <>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
              {kind === 'driver' ? `Driver: ${idLabel}` : `Unit ${idLabel}`}
            </span>
            {kind === 'driver' && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(unresolved)</span>
            )}
          </>
        )}
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: 'var(--text-muted)', marginLeft: 'auto',
        }}>
          {pluralize(row.issue_count, 'issue')}
          {row.delta_vs_prior !== null && row.delta_vs_prior !== 0 && (
            <span style={{
              marginLeft: 6,
              color: row.delta_vs_prior > 0 ? 'var(--severity-critical)' : 'var(--severity-low)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {row.delta_vs_prior > 0 ? '↑' : '↓'}{Math.abs(row.delta_vs_prior)}
            </span>
          )}
        </span>
      </div>

      {row.top_issues.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: 16 }}>
          {row.top_issues.slice(0, 3).map((it, i) => (
            <span
              key={`${it.label}-${i}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
            >
              <SeverityDot severity={it.severity} size={6} />
              <span>
                {it.label}{' '}
                <span className="tabular-nums" style={{ opacity: 0.8 }}>× {it.count}</span>
              </span>
            </span>
          ))}
          {row.top_issues.length > 3 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              +{row.top_issues.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function CriticalEvents({ payload }: { payload: WatchlistPayload }) {
  const events = payload.critical_events
  return (
    <SectionCard title={`Critical Events · last 24h (${events.length})`}>
      {events.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          No critical events in this window — clean window.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
          {events.map((e, i) => (
            <CriticalEventItem key={e.message_id} event={e} isLast={i === events.length - 1} />
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function CriticalEventItem({ event, isLast }: { event: CriticalEventRow; isLast: boolean }) {
  const ts    = new Date(event.message_ts)
  const driver = event.driver_name ?? event.driver_id ?? '—'
  const unit   = event.unit_id ?? '—'
  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <SeverityDot severity={event.severity} size={6} />
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 64 }}>
        {format(ts, 'h:mm a')}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
        {event.fault_label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
        Unit {unit} · {driver}
      </span>
    </li>
  )
}

function CoachingSection({ payload }: { payload: WatchlistPayload }) {
  const recs = payload.coaching
  return (
    <SectionCard title={`Coaching Recommendations (${recs.length})`}>
      {recs.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No coaching items.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recs.map((r, i) => (
            <CoachingItem key={`${r.behavior_label}-${i}`} rec={r} />
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function CoachingItem({ rec }: { rec: CoachingRecommendation }) {
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SeverityDot severity={rec.severity} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {rec.behavior_label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {pluralize(rec.affected_count, 'event')}
        </span>
        {rec.delta_pct_vs_prior !== null && rec.delta_pct_vs_prior !== 0 && (
          <span style={{
            fontSize: 11,
            color: rec.delta_pct_vs_prior > 0 ? 'var(--severity-critical)' : 'var(--severity-low)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {rec.delta_pct_vs_prior > 0 ? '↑' : '↓'}{Math.abs(rec.delta_pct_vs_prior)}% vs prior
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginLeft: 16 }}>
        {rec.suggested_action}
      </p>
    </li>
  )
}

/* ─── Layout primitives ───────────────────────────────────────────────── */

function SectionCard({
  title, accent, headerRight, children,
}: {
  title: string
  accent?: string
  headerRight?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={{
      background: 'var(--bg-surface)',
      border: `1px solid var(--border-subtle)`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {accent && <div style={{ height: 2, background: accent, opacity: 0.45 }} />}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <h2 style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--text-muted)', margin: 0,
        }}>
          {title}
        </h2>
        {headerRight}
      </div>
      <div style={{ padding: '14px 16px' }}>
        {children}
      </div>
    </section>
  )
}

function ViewMoreLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 11, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none',
      }}
    >
      View full <ChevronRight size={11} />
    </Link>
  )
}
