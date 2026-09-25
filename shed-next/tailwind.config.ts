import type { Config } from 'tailwindcss';

/**
 * Shed storefront design tokens.
 * Brand: Outfit + Shed orange (#FF9800). Neutrals are warm and slightly softer
 * than pure black/white so product photos stand out.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FF9800',
          hover: '#F08A00',
          dark: '#B35F00',
          soft: '#FFF3E0',
        },
        ink: '#141414',
        surface: '#FFFFFF',
        canvas: '#F6F5F2',
        line: '#E6E3DD',
        subtle: '#6B6760',
        success: { DEFAULT: '#1E8E3E', soft: '#E6F4EA' },
        danger: { DEFAULT: '#C62828', soft: '#FDECEA' },
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'Outfit', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '14px' },
      boxShadow: {
        card: '0 1px 2px rgba(20,20,20,0.04), 0 4px 16px rgba(20,20,20,0.05)',
        lift: '0 10px 30px rgba(20,20,20,0.10)',
        drawer: '-12px 0 40px rgba(20,20,20,0.18)',
      },
      maxWidth: { site: '1280px' },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'none' } },
        'slide-in': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'none' } },
        'toast-in': { '0%': { opacity: '0', transform: 'translateY(12px) scale(.98)' }, '100%': { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .4s ease both',
        'slide-in': 'slide-in .25s cubic-bezier(.2,.8,.2,1) both',
        'toast-in': 'toast-in .2s ease both',
      },
    },
  },
  plugins: [],
};

export default config;
