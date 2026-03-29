<template>
  <section id="shop" class="section relative overflow-hidden">
    <!-- Warm ambient blobs -->
    <div class="bg-orb" style="width:500px;height:500px;left:-100px;top:50%;transform:translateY(-50%);background:rgba(192,90,60,0.05);--duration:13s;" />
    <div class="bg-orb" style="width:400px;height:400px;right:-80px;top:20%;background:rgba(169,124,58,0.05);--duration:10s;" />

    <!-- Decorative pixel fridges -->
    <div class="hidden lg:block absolute left-4 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none" style="animation: float 9s ease-in-out infinite;">
      <PixelFridge :px="7" />
    </div>
    <div class="hidden lg:block absolute right-4 bottom-24 opacity-15 pointer-events-none" style="animation: float 11s ease-in-out infinite; animation-delay: -4s;">
      <PixelFridge :px="5" />
    </div>

    <div class="relative z-10 max-w-6xl mx-auto px-6">
      <!-- Heading -->
      <div class="text-center mb-16">
        <p class="font-display text-sm tracking-[0.4em] uppercase text-espresso/35 mb-3 italic">— Select Your Flavour —</p>
        <div class="bistro-rule mb-4" />
        <h2 class="font-display text-5xl md:text-6xl font-bold holo-text">Shop</h2>
        <div class="bistro-rule mt-4" />
      </div>

      <!-- Product cards grid -->
      <div class="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        <ProductCard
          v-for="product in products"
          :key="product.id"
          :product="product"
          @add-to-cart="$emit('addToCart', $event)"
        />
      </div>

      <!-- Mixed pack callout -->
      <div class="mt-12 holo-card p-8 max-w-2xl mx-auto text-center">
        <p class="font-display text-sm tracking-[0.3em] uppercase text-espresso/35 mb-2 italic">Can't choose?</p>
        <h3 class="font-display text-2xl font-bold text-espresso mb-3">Mixed Pack</h3>
        <p class="text-espresso/50 text-sm mb-6">Get both flavours — Peach Lemon &amp; Raspberry Lemon in one pack.</p>
        <button class="btn-holo" @click="addMixed">
          Add Mixed 4-Pack — £{{ (mixedPrice / 100).toFixed(2) }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
const emit = defineEmits(['addToCart'])

const mixedPrice = 1400

const products = [
  {
    id: 'peach-lemon',
    name: 'Peach Lemon',
    tagline: 'Sun-kissed sweetness with a zingy citrus finish',
    abv: '5%',
    colour: 'linear-gradient(160deg, #ff9a56 0%, #ffcc70 30%, #ff6b9d 60%, #c44bdb 100%)',
    glowColour: 'rgba(255,154,86,0.3)',
    accent: '#ffcc70',
    emoji: '🍑',
    priceSingle: 350,
    price4Pack: 1200,
    flavourNotes: ['Peach', 'Lemon', 'Iced Tea']
  },
  {
    id: 'raspberry-lemon',
    name: 'Raspberry Lemon',
    tagline: 'Bold berry with a sharp lemon electric kick',
    abv: '5%',
    colour: 'linear-gradient(160deg, #c0392b 0%, #e91e8c 30%, #9c27b0 60%, #3f0f6e 100%)',
    glowColour: 'rgba(233,30,140,0.3)',
    accent: '#e91e8c',
    emoji: '🫐',
    priceSingle: 350,
    price4Pack: 1200,
    flavourNotes: ['Raspberry', 'Lemon', 'Iced Tea']
  }
]

function addMixed() {
  emit('addToCart', {
    id: 'mixed-4pk',
    name: 'Mixed 4-Pack',
    subtitle: 'Peach Lemon × 2 + Raspberry Lemon × 2',
    price: mixedPrice,
    quantity: 1,
    emoji: '🎁'
  })
}
</script>
