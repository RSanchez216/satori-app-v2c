'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Bot, AlertTriangle, BookOpen,
  Inbox, Bell, FileText, Radio, Tag,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/theme-provider'

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
  const [activeCount, setActiveCount] = useState(0)
  const { theme } = useTheme()

  useEffect(() => {
    const supabase = createClient()

    async function fetchCount() {
      const { count } = await supabase
        .from('sources')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
      setActiveCount(count ?? 0)
    }

    fetchCount()

    const channel = supabase
      .channel('sidebar-sources-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sources' }, fetchCount)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const logoSrc = theme === 'light' ? '/logo3.jpg' : '/logo.png'

  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{
        width: 232,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-subtle)',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* ── Logo zone ── */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ padding: '16px 16px', gap: 12, borderBottom: '1px solid var(--border-subtle)' }}
      >
        <Image
          src={logoSrc}
          alt="SATORI"
          width={44}
          height={44}
          className="rounded-xl flex-shrink-0"
          priority
        />
        <span
          className="satori-brand"
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: '26px',
            letterSpacing: '0.28em',
            color: 'var(--accent)',
            lineHeight: 1,
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
                color: 'var(--nav-section-color)',
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
                    color: active ? 'var(--nav-active-color)' : 'var(--nav-item-color)',
                    background: active ? 'var(--nav-active-bg)' : 'transparent',
                    borderLeft: active ? '2px solid var(--nav-active-border)' : '2px solid transparent',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.background = 'var(--nav-item-hover-bg)'
                      el.style.color = 'var(--nav-item-hover-color)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.background = 'transparent'
                      el.style.color = 'var(--nav-item-color)'
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
        style={{ borderTop: '1px solid var(--border-subtle)', padding: '10px 10px 12px' }}
      >
        {/* Live indicator */}
        <div className="flex items-center gap-2 px-2 mb-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 tori-pulse"
            style={{ background: 'var(--severity-low)' }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
            {activeCount} source{activeCount !== 1 ? 's' : ''} · Live
          </span>
        </div>

        {/* Tori row */}
        <div
          className="flex items-center gap-2.5 rounded-lg cursor-pointer transition-all"
          style={{ padding: '8px 10px' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
        >
          <div className="relative flex-shrink-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm leading-none"
              style={{
                background: 'var(--accent-dim)',
                border: '1px solid rgba(var(--accent-rgb), 0.3)',
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
                background: 'var(--severity-low)',
                border: '2px solid var(--bg-sidebar)',
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>
              Tori
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1, marginTop: 3 }}>
              AI Operations Agent
            </div>
          </div>
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
            style={{ background: 'var(--severity-low)' }}
          />
        </div>
      </div>
    </aside>
  )
}
