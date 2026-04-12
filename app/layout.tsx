import type { Metadata } from 'next'
import { Inter, Rajdhani } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
})

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SATORI — AI Operations Intelligence',
  description: 'Proactive AI operations intelligence for trucking companies',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${rajdhani.variable}`}>
      <head>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&display=swap');
          .satori-wordmark {
            font-family: 'Rajdhani', var(--font-rajdhani), sans-serif !important;
            font-weight: 700 !important;
            font-size: 24px !important;
            letter-spacing: 0.25em !important;
            color: #3ecfcf !important;
            line-height: 1 !important;
          }
        `}</style>
      </head>
      <body className="antialiased font-inter">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0d1117',
              border: '1px solid #1e2530',
              color: '#e6edf3',
            },
          }}
        />
      </body>
    </html>
  )
}
