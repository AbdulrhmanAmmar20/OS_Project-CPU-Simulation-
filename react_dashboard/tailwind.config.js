/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cyber: {
          950: '#030710',
          900: '#05080f',
          800: '#080d1a',
          700: '#0d1226',
          600: '#111a33',
          500: '#1a2540',
          400: '#253559',
          300: '#3a4f7a',
          200: '#6b82b5',
          100: '#a0b0d0',
        },
      },
      boxShadow: {
        'neon-violet': '0 0 8px rgba(139, 92, 246, 0.6), 0 0 24px rgba(139, 92, 246, 0.3)',
        'neon-cyan':   '0 0 8px rgba(34, 211, 238, 0.6), 0 0 24px rgba(34, 211, 238, 0.3)',
        'neon-green':  '0 0 8px rgba(74, 222, 128, 0.6), 0 0 24px rgba(74, 222, 128, 0.3)',
        'neon-pink':   '0 0 8px rgba(244, 114, 182, 0.6), 0 0 24px rgba(244, 114, 182, 0.3)',
        'neon-amber':  '0 0 8px rgba(251, 191, 36, 0.6), 0 0 24px rgba(251, 191, 36, 0.3)',
        'glass':       '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      animation: {
        'pulse-neon':  'pulse-neon 2.5s ease-in-out infinite',
        'pulse-red':   'pulse-red 1s ease-in-out infinite',
        'float':       'float 3s ease-in-out infinite',
        'scanline':    'scanline 4s linear infinite',
        'data-in':     'data-in 0.3s ease-out forwards',
        'spin-slow':   'spin 8s linear infinite',
      },
      keyframes: {
        'pulse-neon': {
          '0%,100%': { boxShadow: '0 0 10px rgba(139,92,246,0.4), 0 0 30px rgba(139,92,246,0.15)' },
          '50%':      { boxShadow: '0 0 20px rgba(139,92,246,0.8), 0 0 60px rgba(139,92,246,0.4), 0 0 100px rgba(139,92,246,0.2)' },
        },
        'pulse-red': {
          '0%,100%': { boxShadow: '0 0 10px rgba(239,68,68,0.5)' },
          '50%':      { boxShadow: '0 0 30px rgba(239,68,68,1), 0 0 60px rgba(239,68,68,0.5)' },
        },
        'float': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-5px)' },
        },
        'scanline': {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'data-in': {
          '0%':   { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },
    },
  },
  plugins: [],
}
