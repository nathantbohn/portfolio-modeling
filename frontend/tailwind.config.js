/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
          'Segoe UI', 'sans-serif',
        ],
        mono: [
          'JetBrains Mono', 'SF Mono', 'Cascadia Code', 'Fira Code',
          'ui-monospace', 'monospace',
        ],
      },
      colors: {
        surface: {
          0: '#FFF1E5',
          1: '#FFF8F0',
          2: '#F2DFCE',
          3: '#E8D2BF',
        },
        border: '#E0C9B1',
        accent: {
          DEFAULT: '#990F3D',
          hover: '#B31248',
        },
        warm: {
          50:  '#33302E',
          100: '#4A4541',
          200: '#7D7168',
          300: '#9E9489',
          400: '#BEB0A3',
          500: '#D4C4B0',
        },
      },
      transitionTimingFunction: {
        snappy: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
