'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Bot, AlertTriangle, BookOpen,
  Inbox, Bell, FileText, Radio, Tag,
} from 'lucide-react'

const NAV = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
      { href: '/briefing',   label: 'Tori Briefing',  icon: Bot },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/situations',     label: 'Situations',     icon: AlertTriangle },
      { href: '/knowledge-base', label: 'Knowledge Base',  icon: BookOpen },
      { href: '/inbox',          label: 'Context Inbox',   icon: Inbox },
      { href: '/alerts',         label: 'Alerts',          icon: Bell },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/reports', label: 'Reports', icon: FileText },
      { href: '/sources', label: 'Sources', icon: Radio },
      { href: '/topics',  label: 'Topics',  icon: Tag },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: 220,
        background: '#0a0f18',
        borderRight: '1px solid #1a2332',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* ── Logo zone ── */}
      <div
        className="flex items-center flex-shrink-0"
        style={{
          height: 52,
          borderBottom: '1px solid #1a2332',
          padding: '0 16px',
          gap: 10,
        }}
      >
        <Image
          src="/logo.png"
          alt="SATORI"
          width={22}
          height={22}
          className="rounded-md flex-shrink-0"
          priority
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: '0.15em',
            color: '#3ecfcf',
          }}
        >
          SATORI
        </span>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map((section) => (
          <div key={section.label}>
            {/* Section label */}
            <p
              style={{
                padding: '16px 16px 6px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#2a3a4a',
              }}
            >
              {section.label}
            </p>

            {/* Items */}
            {section.items.map((item) => {
              const Icon  = item.icon
              const active =
                pathname === item.href || pathname.startsWith(item.href + '/')

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 transition-all duration-150"
                  style={{
                    padding: active ? '6px 10px 6px 14px' : '6px 10px',
                    margin: active ? '1px 6px 1px 0' : '1px 6px',
                    borderRadius: active ? '0 7px 7px 0' : 7,
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 500,
                    color: active ? '#3ecfcf' : '#5a6a7a',
                    background: active
                      ? 'linear-gradient(90deg, rgba(62,207,207,0.12) 0%, rgba(62,207,207,0.04) 100%)'
                      : 'transparent',
                    borderLeft: active ? '2px solid #3ecfcf' : '2px solid transparent',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.background = 'rgba(255,255,255,0.035)'
                      el.style.color = '#a0b0c0'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.background = 'transparent'
                      el.style.color = '#5a6a7a'
                    }
                  }}
                >
                  <Icon
                    size={14}
                    style={{ flexShrink: 0, opacity: active ? 1 : 0.65 }}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Bottom status ── */}
      <div
        className="flex-shrink-0 space-y-3"
        style={{
          borderTop: '1px solid #1a2332',
          padding: '12px 16px',
        }}
      >
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 tori-pulse"
            style={{ background: '#56d364' }}
          />
          <span style={{ fontSize: 10, color: '#3a4555', fontWeight: 500 }}>
            0 sources · Live
          </span>
        </div>

        {/* Tori row */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] leading-none"
            style={{
              background: 'linear-gradient(135deg, #1a2d3e, #0f1e2d)',
              border: '1px solid rgba(62,207,207,0.3)',
            }}
          >
            🤖
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 12, fontWeight: 600, color: '#3ecfcf', lineHeight: 1.3 }}>
              Tori
            </p>
            <p style={{ fontSize: 10, color: '#3a4555', lineHeight: 1.3 }}>
              AI Operations Agent
            </p>
          </div>
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 tori-pulse"
            style={{ background: '#3ecfcf' }}
          />
        </div>
      </div>
    </aside>
  )
}
