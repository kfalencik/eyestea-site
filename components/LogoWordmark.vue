<template>
  <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
    <defs>
      <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ff00e5">
          <animate attributeName="stop-color" values="#ff00e5;#00f5ff;#b8ff00;#ffd700;#ff00e5" dur="4s" repeatCount="indefinite"/>
        </stop>
        <stop offset="50%" stop-color="#00f5ff">
          <animate attributeName="stop-color" values="#00f5ff;#b8ff00;#ffd700;#ff00e5;#00f5ff" dur="4s" repeatCount="indefinite"/>
        </stop>
        <stop offset="100%" stop-color="#b8ff00">
          <animate attributeName="stop-color" values="#b8ff00;#ffd700;#ff00e5;#00f5ff;#b8ff00" dur="4s" repeatCount="indefinite"/>
        </stop>
      </linearGradient>
      <filter id="logoGlow">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- Eye icon -->
    <g transform="translate(10, 10)" filter="url(#logoGlow)">
      <!-- Outer eye -->
      <ellipse cx="50" cy="50" rx="46" ry="28" fill="none" stroke="url(#logoGrad)" stroke-width="3"/>
      <!-- Iris -->
      <circle cx="50" cy="50" r="16" fill="none" stroke="url(#logoGrad)" stroke-width="2.5"/>
      <!-- Pupil -->
      <circle cx="50" cy="50" r="8" fill="url(#logoGrad)"/>
      <!-- Shine -->
      <circle cx="55" cy="44" r="3.5" fill="rgba(255,255,255,0.7)"/>
      <!-- Lashes top -->
      <line x1="20" y1="32" x2="15" y2="23" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
      <line x1="33" y1="24" x2="31" y2="15" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
      <line x1="50" y1="22" x2="50" y2="13" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
      <line x1="67" y1="24" x2="69" y2="15" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
      <line x1="80" y1="32" x2="85" y2="23" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round"/>
    </g>

    <!-- EYES TEA wordmark -->
    <text
      x="125" y="72"
      font-family="Orbitron, sans-serif"
      font-size="44"
      font-weight="900"
      fill="url(#logoGrad)"
      letter-spacing="6"
      filter="url(#logoGlow)"
    >EYES TEA</text>

    <!-- Tagline -->
    <text
      x="126" y="95"
      font-family="Space Grotesk, sans-serif"
      font-size="11"
      fill="rgba(255,255,255,0.4)"
      letter-spacing="6"
    >ALCOHOLIC ICED TEA</text>
  </svg>
</template>
