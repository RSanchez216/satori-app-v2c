'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Bot,
  AlertTriangle,
  BookOpen,
  Inbox,
  Bell,
  FileText,
  Radio,
  Tag,
  ChevronRight,
} from 'lucide-react'

const navSections = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
      { href: '/briefing',   label: 'Tori Briefing', icon: Bot },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/situations',     label: 'Situations',    icon: AlertTriangle },
      { href: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
      { href: '/inbox',          label: 'Context Inbox',  icon: Inbox },
      { href: '/alerts',         label: 'Alerts',         icon: Bell },
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
      className="flex flex-col w-58 flex-shrink-0"
      style={{
        width: 228,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-2.5 px-5 py-4"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <Image
          src="/logo.png"
          alt="SATORI"
          width={30}
          height={30}
          className="rounded-lg"
          priority
        />
        <span
          className="font-black text-base tracking-widest"
          style={{ color: 'var(--accent)', letterSpacing: '0.18em' }}
        >
          SATORI
        </span>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="label-xs px-2 mb-2">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + '/')

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 group relative"
                    style={{
                      background: active
                        ? 'linear-gradient(90deg, rgba(62,207,207,0.14) 0%, rgba(62,207,207,0.04) 100%)'
                        : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      borderLeft: active
                        ? '2px solid var(--accent)'
                        : '2px solid transparent',
                    }}
                  >
                    <Icon
                      size={15}
                      style={{
                        flexShrink: 0,
                        opacity: active ? 1 : 0.7,
                      }}
                    />
                    <span className="flex-1">{item.label}</span>
                    {active && (
                      <ChevronRight
                        size={11}
                        className="opacity-50 transition-transform duration-150 group-hover:translate-x-0.5"
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom status ── */}
      <div
        className="px-4 py-3.5"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        {/* Sources live indicator */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-2 h-2 rounded-full tori-pulse flex-shrink-0"
            style={{ background: '#56d364' }}
          />
          <span
            className="text-[11px] font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            0 sources · Live
          </span>
        </div>

        {/* Tori identity row */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: 'var(--accent-dim)',
              border: '1.5px solid rgba(62,207,207,0.3)',
            }}
          >
            <Bot size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              Tori
            </p>
            <p
              className="text-[10px] truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              AI Operations Agent
            </p>
          </div>
          <span
            className="w-1.5 h-1.5 rounded-full tori-pulse flex-shrink-0"
            style={{ background: 'var(--accent)' }}
          />
        </div>
      </div>
    </aside>
  )
}
