'use client'

import Link from 'next/link'
import { ChevronRight, Truck, FileText } from 'lucide-react'

const REPORTS = [
  {
    href: '/reports/samsara-offenders',
    title: 'Samsara Repeat Offender Report',
    description: 'Drivers and units with recurring alerts. Risk-scored watchlists, critical events, and coaching recommendations.',
    icon: Truck,
    accent: 'var(--severity-critical)',
    status: 'Available',
  },
]

export default function ReportsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Reports
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>
          Operational reports for fleet, safety, and compliance review.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {REPORTS.map((report) => {
          const Icon = report.icon
          return (
            <Link key={report.href} href={report.href} style={{ textDecoration: 'none' }}>
              <div
                className="rounded-xl flex items-start gap-4 transition-all"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  padding: '18px 20px',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-default)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)' }}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${report.accent}15`, color: report.accent,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                      {report.title}
                    </h2>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        background: 'rgba(86,211,100,0.1)', color: 'var(--severity-low)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}
                    >
                      {report.status}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.55 }}>
                    {report.description}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 12 }} />
              </div>
            </Link>
          )
        })}

        <div
          className="rounded-xl flex items-center gap-3"
          style={{
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-subtle)',
            padding: '16px 20px',
            opacity: 0.7,
          }}
        >
          <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            More reports coming — daily/weekly digests, KB compliance, source health. PDF export and scheduled email delivery in a future release.
          </p>
        </div>
      </div>
    </div>
  )
}
