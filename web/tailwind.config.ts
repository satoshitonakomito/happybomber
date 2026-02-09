import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'neon-green': '#39ff14',
        'neon-pink': '#ff1493',
        'neon-yellow': '#ffff00',
        'neon-blue': '#00bfff',
        'danger-red': '#ff3333',
        'bg-dark': '#0d0d0d',
        'bg-card': '#1a1a1a',
      },
      fontFamily: {
        'mono': ['VT323', 'monospace'],
        'pixel': ['"Press Start 2P"', 'cursive'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flicker': 'flicker 3s infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '92%': { opacity: '1' },
          '93%': { opacity: '0.8' },
          '94%': { opacity: '1' },
          '96%': { opacity: '0.9' },
          '97%': { opacity: '1' },
        },
        blink: {
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
export default config
