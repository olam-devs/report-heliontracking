/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#1e1b4b',
          900: '#1a1a2e',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
