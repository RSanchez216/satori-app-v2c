import type { Metadata } from 'next'
import { Inter, Rajdhani } from 'next/font/google'
import { cookies } from 'next/headers'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
})

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: '700',
  variable: '--font-rajdhani',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SATORI — AI Operations Intelligence',
  description: 'Proactive AI operations intelligence for trucking companies',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the theme cookie so the server renders the correct class from the
  // very first byte of HTML — no flash, no hydration mismatch.
  const cookieStore = cookies()
  const themeCookie = cookieStore.get('satori-theme')?.value
  const initialTheme = themeCookie === 'light' ? 'light' : 'dark'
  const themeClass   = initialTheme === 'dark' ? 'dark' : ''

  return (
    <html
      lang="en"
      className={`${inter.variable} ${rajdhani.variable} ${themeClass}`.trim()}
      suppressHydrationWarning
    >
      <head>
        {/* Fallback no-flash script for first visit (before cookie is set) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('satori-theme');if(t==='light'){document.documentElement.classList.remove('dark')}else if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased font-inter">
        <ThemeProvider initialTheme={initialTheme}>
          {children}
          <Toaster
            theme="system"
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
