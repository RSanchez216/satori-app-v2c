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
        width: 232,
        background: '#0a0f18',
        borderRight: '1px solid #1a2332',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* ── Logo zone ── */}
      <div className="flex items-center gap-3 flex-shrink-0 px-4 border-b border-[#1a2332]" style={{ paddingTop: 18, paddingBottom: 18 }}>
        <Image
          src="/logo2.png"
          alt="SATORI"
          width={32}
          height={32}
          className="rounded-xl flex-shrink-0"
          priority
        />
        <span
          className="leading-none text-[#3ecfcf]"
          style={{
            fontFamily: "'Rajdhani', var(--font-rajdhani), sans-serif",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '0.22em',
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
                padding: '16px 16px 5px',
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#2a3545',
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
                    letterSpacing: '0.01em',
                    color: active ? '#e6edf3' : '#4a5a6a',
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
                      el.style.color = '#4a5a6a'
                    }
                  }}
                >
                  <Icon
                    size={13}
                    style={{ flexShrink: 0, opacity: active ? 1 : 0.55 }}
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
        className="flex-shrink-0"
        style={{ borderTop: '1px solid #1a2332', padding: '10px 10px 12px' }}
      >
        {/* Live indicator */}
        <div className="flex items-center gap-2 px-2 mb-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 tori-pulse"
            style={{ background: '#56d364' }}
          />
          <span style={{ fontSize: 10, color: '#3a4555', fontWeight: 500 }}>
            0 sources · Live
          </span>
        </div>

        {/* Tori row */}
        <div
          className="flex items-center gap-2.5 rounded-lg cursor-pointer transition-all"
          style={{ padding: '8px 10px' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
        >
          <div className="relative flex-shrink-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm leading-none"
              style={{
                background: 'linear-gradient(135deg, #1a2d3e, #0f1e2d)',
                border: '1px solid rgba(62,207,207,0.3)',
              }}
            >
              🤖
            </div>
            <div
              className="absolute rounded-full"
              style={{
                bottom: -1,
                right: -1,
                width: 9,
                height: 9,
                background: '#56d364',
                border: '2px solid #0a0f18',
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12, fontWeight: 600, color: '#3ecfcf', lineHeight: 1 }}>
              Tori
            </div>
            <div style={{ fontSize: 10, color: '#3a4555', lineHeight: 1, marginTop: 3 }}>
              AI Operations Agent
            </div>
          </div>
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
            style={{ background: '#56d364' }}
          />
        </div>
      </div>
    </aside>
  )
}
