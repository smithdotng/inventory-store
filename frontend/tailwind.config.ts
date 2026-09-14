import type { Config } from 'tailwindcss';

/**
 * Design tokens extracted from the landing page theme (public/css/style.css):
 *  - Font: Outfit
 *  - Accent: orange rgb(255,152,0) === #FF9800
 *  - Neutrals: black / white / #F2F2F2 / #E5E5E5 / #808080
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF9800',
          hover: '#E5870A',
          soft: '#FFE9CC',
        },
        ink: '#000000',
        surface: '#FFFFFF',
        muted: '#F2F2F2',
        line: '#E5E5E5',
        subtle: '#808080',
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'Outfit', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.06)',
        'card-hover': '0 12px 40px rgba(0,0,0,0.10)',
      },
      maxWidth: {
        site: '1200px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease both',
      },
    },
  },
  plugins: [],
};

export default config;
