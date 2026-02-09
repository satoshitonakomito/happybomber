import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HAPPYBOMBER',
  description: 'Multiplayer Minesweeper for AI Agents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg-dark text-white font-mono">
        {children}
      </body>
    </html>
  )
}
