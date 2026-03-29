/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Lora', 'serif'],
        display: ['Cormorant Garamond', 'serif']
      },
      colors: {
        parchment: '#f2e8d5',
        'parchment-light': '#faf6ee',
        espresso: '#1a0e06',
        brass: '#a97c3a',
        'brass-light': '#c9a05a',
        terracotta: '#c05a3c',
        sage: '#6e7c5a',
        tile: '#2a1a0c'
      },
      animation: {
        'shimmer-brass': 'shimmerBrass 8s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'subtle-pulse': 'subtlePulse 4s ease-in-out infinite',
        'drift': 'drift 10s ease-in-out infinite',
      }
    }
  },
  plugins: []
}
