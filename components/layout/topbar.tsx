'use client'

import { Bell, Settings, User } from 'lucide-react'

export function Topbar() {
  return (
    <header
      className="flex items-center justify-between flex-shrink-0"
      style={{
        height: 48,
        padding: '0 20px',
        background: '#080d14',
        borderBottom: '1px solid #1a2332',
      }}
    >
      {/* Left — intentionally empty, logo lives in sidebar */}
      <div />

      {/* Right controls */}
      <div className="flex items-center" style={{ gap: 8 }}>

        {/* Tori Active pill */}
        <div
          className="flex items-center"
          style={{
            background: 'rgba(62,207,207,0.07)',
            border: '1px solid rgba(62,207,207,0.18)',
            borderRadius: 20,
            padding: '4px 12px',
            gap: 7,
          }}
        >
          {/* Glow dot */}
          <span
            className="relative flex-shrink-0"
            style={{ width: 6, height: 6 }}
          >
            <span
              className="animate-ping absolute inline-flex rounded-full"
              style={{
                width: '100%',
                height: '100%',
                background: '#3ecfcf',
                opacity: 0.5,
              }}
            />
            <span
              className="relative inline-flex rounded-full"
              style={{
                width: 6,
                height: 6,
                background: '#3ecfcf',
                boxShadow: '0 0 6px rgba(62,207,207,0.8)',
              }}
            />
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#3ecfcf',
              letterSpacing: '0.01em',
            }}
          >
            Tori Active
          </span>
        </div>

        {/* Bell */}
        <IconBtn label="Notifications">
          <Bell size={14} />
        </IconBtn>

        {/* Settings */}
        <IconBtn label="Settings">
          <Settings size={14} />
        </IconBtn>

        {/* Avatar */}
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1a2d3e, #0f1e2d)',
            border: '1.5px solid rgba(62,207,207,0.3)',
            color: '#4a6a7a',
          }}
        >
          <User size={13} />
        </div>
      </div>
    </header>
  )
}

function IconBtn({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      aria-label={label}
      className="flex items-center justify-center flex-shrink-0 transition-all duration-150"
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: 'transparent',
        border: '1px solid #1a2332',
        color: '#4a5a6a',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'rgba(255,255,255,0.04)'
        el.style.color = '#8d96a0'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'transparent'
        el.style.color = '#4a5a6a'
      }}
    >
      {children}
    </button>
  )
}
