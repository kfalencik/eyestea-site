<template>
  <div class="holo-card p-6 md:p-8 flex flex-col gap-6">

    <!-- Can visual + info -->
    <div class="flex gap-6 items-start">
      <!-- Pixel can -->
      <div class="flex-shrink-0 can-visual" :style="`animation-delay: ${Math.random() * -6}s`">
        <PixelCan
          :flavor="product.id.startsWith('peach') ? 'peach' : 'raspberry'"
          :px="8"
        />
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-2xl">{{ product.emoji }}</span>
          <h3 class="font-display text-xl font-bold text-espresso">{{ product.name }}</h3>
        </div>
        <p class="text-espresso/50 text-sm leading-relaxed mb-3 italic">{{ product.tagline }}</p>
        <div class="flex gap-2 flex-wrap">
          <span
            v-for="note in product.flavourNotes"
            :key="note"
            class="text-xs px-3 py-1 rounded-sm border border-espresso/10 text-espresso/45 font-display"
          >{{ note }}</span>
          <span class="text-xs px-3 py-1 rounded-sm font-display"
            :style="`background: ${product.glowColour}; color: ${product.accent}; border: 1px solid ${product.accent}40`">
            {{ product.abv }} ABV
          </span>
        </div>
      </div>
    </div>

    <!-- Pack selector -->
    <div>
      <p class="font-display text-[10px] tracking-[0.3em] uppercase text-espresso/30 mb-3">Pack Size</p>
      <div class="flex gap-3 flex-wrap">
        <button
          :class="['pack-option', packType === 'single' ? 'active' : '']"
          @click="packType = 'single'"
        >Single — £{{ (product.priceSingle / 100).toFixed(2) }}</button>
        <button
          :class="['pack-option', packType === '4pack' ? 'active' : '']"
          @click="packType = '4pack'"
        >4-Pack — £{{ (product.price4Pack / 100).toFixed(2) }}</button>
      </div>
    </div>

    <!-- Quantity selector -->
    <div class="flex items-center justify-between">
      <div>
        <p class="font-display text-[10px] tracking-[0.3em] uppercase text-espresso/30 mb-3">Quantity</p>
        <div class="flex items-center gap-4">
          <button class="qty-btn" @click="decrease">−</button>
          <span class="font-display text-xl font-bold text-espresso w-8 text-center">{{ qty }}</span>
          <button class="qty-btn" @click="increase">+</button>
        </div>
      </div>
      <div class="text-right">
        <p class="font-display text-[10px] tracking-[0.3em] uppercase text-espresso/30 mb-1">Total</p>
        <p class="font-display text-2xl font-bold holo-text">£{{ lineTotal }}</p>
      </div>
    </div>

    <!-- Add to cart -->
    <button class="btn-holo w-full" @click="addToCart">
      Add to Basket
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  product: { type: Object, required: true }
})
const emit = defineEmits(['addToCart'])

const packType = ref('single')
const qty = ref(1)

const unitPrice = computed(() => packType.value === 'single' ? props.product.priceSingle : props.product.price4Pack)
const lineTotal = computed(() => ((unitPrice.value * qty.value) / 100).toFixed(2))

function decrease() { if (qty.value > 1) qty.value-- }
function increase() { if (qty.value < 10) qty.value++ }

function addToCart() {
  emit('addToCart', {
    id: `${props.product.id}-${packType.value}`,
    name: props.product.name,
    subtitle: packType.value === 'single' ? '1 Can' : '4-Pack',
    price: unitPrice.value,
    quantity: qty.value,
    emoji: props.product.emoji,
    colour: props.product.colour,
    accent: props.product.accent
  })
  qty.value = 1
}
</script>
