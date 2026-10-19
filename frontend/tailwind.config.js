/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        cream: {
          50: '#fafaf8',
          100: '#f5f5f2',
          200: '#ecece6',
          300: '#e0e0d6',
          400: '#cbcbbd',
        },
        okyai: {
          blue: '#2563eb',
          cyan: '#06b6d4',
          sky: '#0284c7',
          indigo: '#4f46e5',
          glow: '#38bdf8',
          dark: {
            canvas: '#0a0e17',
            card: '#111827',
            surface: '#182234',
            border: '#23324d',
            input: '#131c2e',
          },
          light: {
            canvas: '#f8fafc',
            card: '#ffffff',
            surface: '#f1f5f9',
            border: '#cbd5e1',
            input: '#f4f4f1',
          }
        },
        dark: {
          bg: '#0a0e17',
          surface: '#111827',
          border: '#1f293d',
        }
      },
      boxShadow: {
        'glow-blue': '0 4px 24px -2px rgba(37, 99, 235, 0.35)',
        'glow-cyan': '0 4px 24px -2px rgba(6, 182, 212, 0.35)',
        'glass-card': '0 8px 32px 0 rgba(15, 23, 42, 0.08)',
        'glass-dark': '0 12px 36px -4px rgba(0, 0, 0, 0.5)',
        'glow-pill': '0 2px 14px -1px rgba(37, 99, 235, 0.3)',
        'inner-glow': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.15)',
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      animation: {
        'orb-pulse': 'orbPulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-slow': 'floatSlow 6s ease-in-out infinite',
      },
      keyframes: {
        orbPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.06)', opacity: '1' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        }
      }
    },
  },
  plugins: [],
}
