'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface TipProps {
  text:      string
  children:  React.ReactNode
  side?:     'top' | 'bottom' | 'left' | 'right'
  maxWidth?: number
}

export function Tip({ text, children, side = 'top', maxWidth = 220 }: TipProps) {
  const [show, setShow] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, left: 0, tx: '-50%', ty: '-100%' })
  const ref   = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  function enter() {
    timer.current = setTimeout(() => {
      if (!ref.current) return
      const r  = ref.current.getBoundingClientRect()
      const cx = r.left + r.width  / 2
      const cy = r.top  + r.height / 2
      if (side === 'top')    setPos({ top: r.top  - 7,   left: cx,         tx: '-50%',  ty: '-100%' })
      if (side === 'bottom') setPos({ top: r.bottom + 7, left: cx,         tx: '-50%',  ty: '0%'    })
      if (side === 'left')   setPos({ top: cy,           left: r.left - 7, tx: '-100%', ty: '-50%'  })
      if (side === 'right')  setPos({ top: cy,           left: r.right + 7,tx: '0%',    ty: '-50%'  })
      setShow(true)
    }, 420)
  }

  function leave() {
    clearTimeout(timer.current)
    setShow(false)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <span
      ref={ref}
      style={{ display: 'inline-flex', position: 'relative' }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {children}
      {show && createPortal(
        <div
          style={{
            position: 'fixed',
            top:       pos.top,
            left:      pos.left,
            transform: `translate(${pos.tx}, ${pos.ty})`,
            zIndex:    9999,
            background:   'var(--bg-elevated)',
            color:        'var(--text-secondary)',
            border:       '1px solid var(--border-default)',
            borderRadius: 7,
            padding:      '5px 10px',
            fontSize:     11,
            fontWeight:   500,
            lineHeight:   1.45,
            maxWidth,
            textAlign:    'center',
            boxShadow:    '0 4px 16px rgba(0,0,0,0.35)',
            pointerEvents:'none',
            whiteSpace:   'normal',
          }}
        >
          {text}
        </div>,
        document.body,
      )}
    </span>
  )
}
