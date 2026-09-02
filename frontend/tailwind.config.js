/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // McGill burgundy — the platform's one chromatic accent, ported from
        // the sibling Shelf-Life Studio app's design system. mcgill-red/#C8102E
        // stays defined for any spot still referencing the older brighter red,
        // but primary/mcgill.500 now drive the actual UI.
        mcgill: {
          red:    '#7A1B2E',
          dark:   '#4E0F1C',
          light:  '#F1E3E6',
          50:     '#FBF0F1',
          100:    '#F1DCDF',
          200:    '#E0B7BE',
          500:    '#7A1B2E',
          600:    '#661523',
          700:    '#4E0F1C',
          900:    '#2E0812',
        },
        primary: {
          50:  '#FBF0F1',
          100: '#F1DCDF',
          200: '#E0B7BE',
          500: '#7A1B2E',
          600: '#661523',
          700: '#4E0F1C',
          800: '#3B0B15',
          900: '#2E0812',
        },
        science: {
          50:  '#f0f9ff',
          500: '#0ea5e9',
          700: '#0369a1',
          900: '#0c4a6e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        DEFAULT: '9px',
        md: '9px',
        lg: '12px',
        xl: '18px',
        '2xl': '24px',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(23, 19, 26, 0.05)',
        sm: '0 1px 3px rgba(23, 19, 26, 0.06), 0 1px 2px rgba(23, 19, 26, 0.04)',
        DEFAULT: '0 1px 3px rgba(23, 19, 26, 0.06), 0 1px 2px rgba(23, 19, 26, 0.04)',
        md: '0 4px 12px -2px rgba(23, 19, 26, 0.08), 0 2px 4px -2px rgba(23, 19, 26, 0.05)',
        lg: '0 12px 32px -8px rgba(23, 19, 26, 0.14), 0 4px 8px -4px rgba(23, 19, 26, 0.06)',
      },
    },
  },
  plugins: [],
}
