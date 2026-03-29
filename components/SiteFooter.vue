<template>
  <footer class="relative overflow-hidden border-t border-espresso/10 py-16" style="background: #1a0e06;">
    <div class="relative z-10 max-w-6xl mx-auto px-6">
      <div class="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
        <LogoWordmark class="w-40" style="filter: brightness(0) invert(1) opacity(0.7);" />
        <div class="flex flex-col sm:flex-row items-center gap-6 text-parchment/40 text-xs font-display tracking-[0.2em] uppercase">
          <a href="#" class="hover:text-parchment transition-colors">Privacy</a>
          <a href="#" class="hover:text-parchment transition-colors">Terms</a>
          <a href="#" class="hover:text-parchment transition-colors">Contact</a>
          <a href="#" class="hover:text-parchment transition-colors">Instagram</a>
        </div>
      </div>

      <!-- Brass rule -->
      <div class="bistro-rule mb-8" style="background: linear-gradient(90deg, transparent, rgba(169,124,58,0.4), transparent);" />

      <!-- Drink responsibly -->
      <div class="text-center space-y-2">
        <p class="text-parchment/25 text-xs leading-relaxed max-w-2xl mx-auto">
          🔞 Eyes Tea contains alcohol (5% ABV). Available to over 18s only. Please drink responsibly.
          Do not drink and drive. For help with alcohol problems visit
          <a href="https://www.drinkaware.co.uk/" class="underline hover:text-parchment/50 transition-colors" target="_blank" rel="noopener noreferrer">drinkaware.co.uk</a>
        </p>
        <p class="text-parchment/15 text-xs font-display tracking-widest">
          © {{ new Date().getFullYear() }} Eyes Tea. All rights reserved.
        </p>
      </div>
    </div>
  </footer>
</template>
