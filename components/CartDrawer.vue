<template>
  <!-- Overlay -->
  <div :class="['cart-overlay', open ? 'open' : '']" @click="$emit('close')" />

  <!-- Drawer -->
  <div :class="['cart-drawer', open ? 'open' : '']">
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-espresso/08">
        <div>
          <h2 class="font-display text-lg font-bold text-espresso tracking-wider">Basket</h2>
          <p class="text-espresso/40 text-xs mt-0.5 italic">{{ totalItems }} item{{ totalItems !== 1 ? 's' : '' }}</p>
        </div>
        <button class="w-10 h-10 rounded-sm border border-espresso/12 flex items-center justify-center text-espresso/50 hover:text-espresso hover:border-espresso/30 transition-all" @click="$emit('close')">
          ✕
        </button>
      </div>

      <!-- Items -->
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <div v-if="items.length === 0" class="text-center py-16">
          <PixelCart :px="6" class="mx-auto mb-4" />
          <p class="font-display text-sm text-espresso/30 tracking-wider">Your basket is empty</p>
          <p class="text-espresso/25 text-xs mt-2 italic">Add some tea!</p>
        </div>

        <TransitionGroup name="cart-item" tag="div" class="space-y-4">
          <div
            v-for="item in items"
            :key="item.cartId"
            class="holo-card p-4 flex items-center gap-4"
          >
            <!-- Emoji / thumbnail -->
            <div class="w-12 h-12 rounded-sm flex items-center justify-center text-2xl flex-shrink-0"
              :style="`background: ${item.colour || 'rgba(169,124,58,0.08)'}`">
              {{ item.emoji }}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="font-display text-sm font-bold text-espresso truncate">{{ item.name }}</p>
              <p class="text-espresso/40 text-xs italic">{{ item.subtitle }}</p>
              <p class="font-display text-sm mt-1" :style="`color: ${item.accent || '#a97c3a'}`">
                £{{ (item.price / 100).toFixed(2) }} each
              </p>
            </div>

            <!-- Qty + remove -->
            <div class="flex flex-col items-end gap-2">
              <div class="flex items-center gap-2">
                <button class="qty-btn" style="width:28px;height:28px;font-size:0.9rem;" @click="$emit('updateQty', { cartId: item.cartId, delta: -1 })">−</button>
                <span class="font-display text-sm text-espresso w-6 text-center">{{ item.quantity }}</span>
                <button class="qty-btn" style="width:28px;height:28px;font-size:0.9rem;" @click="$emit('updateQty', { cartId: item.cartId, delta: 1 })">+</button>
              </div>
              <button class="text-espresso/25 hover:text-terracotta text-xs transition-colors font-display" @click="$emit('removeItem', item.cartId)">
                Remove
              </button>
            </div>
          </div>
        </TransitionGroup>
      </div>

      <!-- Footer -->
      <div class="p-6 border-t border-espresso/08 space-y-4" v-if="items.length > 0">
        <!-- Subtotal -->
        <div class="flex justify-between items-center">
          <span class="text-espresso/50 text-sm">Subtotal</span>
          <span class="font-display text-xl font-bold holo-text">£{{ subtotal }}</span>
        </div>
        <p class="text-espresso/30 text-xs italic">Shipping calculated at checkout. Must be 18+ to purchase alcohol.</p>
        <button class="btn-holo w-full text-sm" @click="checkout">
          Checkout — £{{ subtotal }}
        </button>
        <button class="btn-outline w-full text-sm" @click="$emit('close')">
          Continue Shopping
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  open: Boolean,
  items: { type: Array, default: () => [] }
})
defineEmits(['close', 'updateQty', 'removeItem'])

const totalItems = computed(() => props.items.reduce((sum, i) => sum + i.quantity, 0))
const subtotal = computed(() =>
  (props.items.reduce((sum, i) => sum + i.price * i.quantity, 0) / 100).toFixed(2)
)

function checkout() {
  alert('Checkout coming soon! 🍵✨')
}
</script>

<style scoped>
.cart-item-enter-active,
.cart-item-leave-active {
  transition: all 0.3s ease;
}
.cart-item-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.cart-item-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
