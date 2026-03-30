<template>
  <div class="min-h-screen noise" style="background-color: #f2e8d5;">
    <!-- Custom cursor (client only) -->
    <ClientOnly>
      <ShaderBackground />
      <CustomCursor />
    </ClientOnly>

    <!-- Age gate -->
    <AgeGate v-if="!ageVerified" @enter="ageVerified = true" />

    <!-- Main site (shown after age gate) -->
    <template v-if="ageVerified">
      <!-- Cart drawer -->
      <CartDrawer
        :open="cartOpen"
        :items="cartItems"
        @close="cartOpen = false"
        @update-qty="updateCartQty"
        @remove-item="removeCartItem"
      />

      <!-- Navigation -->
      <NavBar :cart-count="cartCount" @open-cart="cartOpen = true" />

      <!-- Page sections -->
      <main>
        <HeroSection :cart-count="cartCount" @shop-now="scrollToShop" @add-to-cart="addToCart" />
        <ShopSection @add-to-cart="addToCart" />
        <AboutSection />
      </main>

      <SiteFooter />

      <!-- Cart added toast -->
      <Transition name="toast">
        <div
          v-if="toastVisible"
          class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[6000] holo-card px-6 py-3 flex items-center gap-3 whitespace-nowrap"
        >
          <span class="text-xl">{{ toastEmoji }}</span>
          <span class="text-sm tracking-wide font-display text-espresso">Added to basket!</span>
        </div>
      </Transition>
    </template>
  </div>
</template>

<script setup>
useHead({
  title: 'Eyes Tea — Alcoholic Iced Tea',
  bodyAttrs: { style: 'background-color: #f2e8d5;' }
})

// Age verification
const ageVerified = ref(false)

// Cart state
const cartOpen = ref(false)
const cartItems = ref([])
let cartIdCounter = 0

const cartCount = computed(() => cartItems.value.reduce((s, i) => s + i.quantity, 0))

function addToCart(item) {
  const existing = cartItems.value.find(i => i.id === item.id)
  if (existing) {
    existing.quantity += item.quantity
  } else {
    cartItems.value.push({ ...item, cartId: ++cartIdCounter })
  }
  cartOpen.value = true
  showToast(item.emoji)
}

function updateCartQty({ cartId, delta }) {
  const item = cartItems.value.find(i => i.cartId === cartId)
  if (!item) return
  item.quantity = Math.max(0, item.quantity + delta)
  if (item.quantity === 0) removeCartItem(cartId)
}

function removeCartItem(cartId) {
  const idx = cartItems.value.findIndex(i => i.cartId === cartId)
  if (idx !== -1) cartItems.value.splice(idx, 1)
}

// Toast
const toastVisible = ref(false)
const toastEmoji = ref('🛒')
let toastTimer = null

function showToast(emoji = '🛒') {
  toastEmoji.value = emoji
  toastVisible.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 2500)
}

// Scroll helpers
function scrollToShop() {
  document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<style scoped>
.toast-enter-active, .toast-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px) scale(0.95);
}


</style>
