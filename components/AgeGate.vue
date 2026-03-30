<template>
  <Transition name="age-gate-fade">
    <div v-if="visible" class="age-gate noise">
      <!-- Checkered background -->
      <div class="age-gate-bg" />

      <!-- Warm ambient blobs -->
      <div class="bg-orb" style="width:500px;height:500px;left:-100px;top:-100px;background:rgba(192,90,60,0.06);--duration:14s;" />
      <div class="bg-orb" style="width:400px;height:400px;right:-80px;bottom:-80px;background:rgba(169,124,58,0.06);--duration:11s;" />

      <!-- Content card -->
      <div class="relative z-10 text-center px-6 max-w-md w-full mx-auto">

        <!-- Eye logo / icon -->
        <div class="mb-8 flex justify-center">
          <div class="relative w-24 h-24 eye-logo">
            <img :src="'/Logo_Contained.svg'" alt="Eye Logo" class="absolute inset-0 w-full h-full object-contain" style="filter: brightness(0) sepia(1) saturate(2) hue-rotate(10deg) brightness(0.4);" />
          </div>
        </div>

        <!-- Brand name -->
        <h1 class="font-display text-4xl font-bold tracking-widest mb-2 holo-text">Eyes Tea</h1>
        <p class="text-espresso/40 text-sm tracking-[0.3em] uppercase mb-10 font-display italic">Alcoholic Iced Tea</p>

        <!-- Warning -->
        <div class="holo-card p-8 mb-8">
          <div class="text-5xl mb-4 select-none">🔞</div>
          <h2 class="font-display text-xl font-bold text-espresso mb-3 tracking-wider">Are you of legal drinking age?</h2>
          <p class="text-espresso/50 text-sm leading-relaxed italic">
            You must be 18 years or older to enter this site.<br />
            Please drink responsibly.
          </p>
        </div>

        <!-- Buttons -->
        <div class="flex gap-4 justify-center">
          <button class="btn-holo" @click="enter">
            Yes, I'm 18+
          </button>
          <button class="btn-outline" @click="deny">
            No, exit
          </button>
        </div>

        <p class="text-espresso/25 text-xs mt-8 leading-relaxed">
          By entering you confirm you are of legal drinking age in your country.
          Eyes Tea contains alcohol. Drink responsibly.
        </p>
      </div>
    </div>
  </Transition>
</template>

<script setup>
const emit = defineEmits(['enter'])

const ageVerified = useCookie('age-verified', {
  maxAge: 60 * 60 * 24 * 365, // 1 year
  sameSite: 'strict',
})

const visible = ref(!ageVerified.value)

if (ageVerified.value) {
  emit('enter')
}

function enter() {
  ageVerified.value = 'true'
  visible.value = false
  emit('enter')
}

function deny() {
  window.location.href = 'https://www.drinkaware.co.uk/'
}
</script>

<style scoped>
.age-gate-fade-leave-active {
  transition: opacity 0.8s ease, transform 0.8s ease;
}
.age-gate-fade-leave-to {
  opacity: 0;
  transform: scale(1.05);
  filter: blur(8px);
}
</style>
