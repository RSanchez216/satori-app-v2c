'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggle: () => {},
})

function applyTheme(theme: Theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

/** Persist theme to both localStorage and a cookie (so the server can read it). */
function persistTheme(theme: Theme) {
  localStorage.setItem('satori-theme', theme)
  document.cookie = `satori-theme=${theme}; path=/; max-age=31536000; SameSite=Lax`
}

export function ThemeProvider({ children, initialTheme }: {
  children: React.ReactNode
  initialTheme?: Theme
}) {
  // Initialise from the prop the server passed (cookie-derived), so the
  // React state matches the already-correct class on <html> from the start.
  const [theme, setTheme] = useState<Theme>(initialTheme ?? 'dark')

  // On mount, sync cookie ← localStorage in case cookie is stale/missing.
  useEffect(() => {
    const stored = localStorage.getItem('satori-theme') as Theme | null
    const resolved = stored ?? initialTheme ?? 'dark'
    if (resolved !== theme) {
      setTheme(resolved)
      applyTheme(resolved)
    }
    // Keep cookie in sync with localStorage
    persistTheme(resolved)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      persistTheme(next)
      applyTheme(next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
