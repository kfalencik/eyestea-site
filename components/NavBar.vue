<template>
  <!-- Top nav -->
  <header class="nav-bar" :class="{ 'nav-bar--hidden': navHidden }">
    <div class="flex items-center gap-3">
      <img :src="'/Emblem.svg'" alt="Eyes Tea" class="w-9 h-9" style="filter: brightness(0) sepia(1) saturate(2) hue-rotate(10deg) brightness(0.4);" />
    </div>

    <nav class="hidden md:flex items-center gap-8">
      <a
        v-for="link in links"
        :key="link.href"
        :href="link.href"
        class="font-display text-sm tracking-[0.18em] uppercase text-espresso/50 hover:text-espresso transition-colors"
      >{{ link.label }}</a>
    </nav>

    <button
      class="relative btn-outline text-xs py-2 px-5"
      @click="$emit('openCart')"
      aria-label="Open basket"
    >
      <span>Basket</span>
      <span
        v-if="cartCount > 0"
        class="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-display font-bold text-parchment-light"
        style="background: #a97c3a"
      >{{ cartCount > 9 ? '9+' : cartCount }}</span>
    </button>
  </header>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

defineProps({ cartCount: { type: Number, default: 0 } })
defineEmits(['openCart'])

const links = [
  { href: '#shop', label: 'Shop' },
  { href: '#flavours', label: 'Flavours' },
  { href: '#about', label: 'About' }
]

const navHidden = ref(false)
let lastScrollY = 0

function onScroll () {
  const y = window.scrollY
  navHidden.value = y > lastScrollY && y > 60
  lastScrollY = y
}

onMounted  (() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<style scoped>
.nav-bar {
  transition: transform 0.3s ease;
}
.nav-bar--hidden {
  transform: translateY(-110%);
}

:global(body.game-playing) .nav-bar {
  transform: translateY(-110%);
}
</style>
