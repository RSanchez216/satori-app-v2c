'use client'

import { Bell, Settings, User } from 'lucide-react'

export function Topbar() {
  return (
    <header
      className="flex items-center justify-between h-14 px-6 flex-shrink-0"
      style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Left slot — reserved for page breadcrumb via context or slot */}
      <div className="flex items-center gap-3" />

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Tori Active pill */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold"
          style={{
            background: 'rgba(62,207,207,0.08)',
            color: 'var(--accent)',
            border: '1px solid rgba(62,207,207,0.18)',
          }}
        >
          {/* Glow dot */}
          <span
            className="relative flex h-2 w-2"
          >
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: 'var(--accent)' }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: 'var(--accent)' }}
            />
          </span>
          Tori Active
        </div>

        {/* Divider */}
        <div
          className="w-px h-5 mx-1"
          style={{ background: 'var(--border-subtle)' }}
        />

        {/* Notification bell */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-white/[0.04]"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Notifications"
        >
          <Bell size={15} />
        </button>

        {/* Settings */}
        <button
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 hover:bg-white/[0.04]"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Settings"
        >
          <Settings size={15} />
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center ml-1"
          style={{
            background: 'var(--bg-elevated)',
            border: '1.5px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          <User size={13} />
        </div>
      </div>
    </header>
  )
}
