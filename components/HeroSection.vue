<template>
  <section class="mt-6 hero">
    <!-- ── Logo lockup ─────────────────────────────────────────── -->
    <div class="logo-lockup">
      <!-- thin rule -->
      <div class="rule" />

      <div class="text-center">
        <!-- emblem -->
        <img :src="'/Logo_Full_MAIN.svg'" alt="" class="emblem" aria-hidden="true" />
         <p class="brand-sub">Alcoholic Iced Tea</p>
        <!-- wordmark -->
        <div class="wordmark">
         
        </div>
      </div>

      <!-- thin rule -->
      <div class="rule" />

      <!-- tagline -->
      <p class="tagline">Steeped in mischief.</p>
    </div>

    <!-- ── Game canvas ─────────────────────────────────────────── -->
    <div class="canvas-wrap">
      <GameCanvas />
    </div>

    <!-- ── Footer row ──────────────────────────────────────────── -->
    <div class="hero-footer">
      <button class="btn-holo" @click="$emit('scrollToShop')">
        <span class="btn-icon">🛒</span> Shop Now
      </button>
      <p class="hero-hint">Scroll down to browse all flavours</p>
    </div>
  </section>
</template>

<script setup>
defineEmits(['scrollToShop', 'addToCart'])
</script>

<style scoped>
/* ── Section shell ───────────────────────────────────────────────── */
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 56px 24px 64px;
  background-color: #f2e8d5;
  overflow: hidden;
}

/* ── Logo lockup ────────────────────────────────────────────────── */
.logo-lockup {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-bottom: 36px;
  width: 100%;
  max-width: 900px;
}

.rule {
  width: 100%;
  max-width: 560px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(169, 124, 58, 0.45) 30%,
    rgba(192, 90, 60, 0.55) 50%,
    rgba(169, 124, 58, 0.45) 70%,
    transparent 100%
  );
}

.logo-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.emblem {
  width: clamp(200px, 28vw, 340px);
  height: auto;
  /* Recolour the black paths to brass */
  filter: brightness(0) sepia(1) saturate(3) hue-rotate(10deg) brightness(0.62);
  animation: float 7s ease-in-out infinite;
}

.wordmark {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.brand-name {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(3.4rem, 7vw, 6rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.04em;
  margin: 0;
}

.brand-sub {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(0.75rem, 1.5vw, 1rem);
  letter-spacing: 0.45em;
  text-transform: uppercase;
  color: rgba(26, 14, 6, 0.45);
  margin: 0;
  font-style: italic;
}

.tagline {
  font-family: 'Cormorant Garamond', serif;
  font-size: clamp(1rem, 2vw, 1.25rem);
  font-style: italic;
  letter-spacing: 0.08em;
  color: rgba(26, 14, 6, 0.55);
  margin: 0;
}

/* ── Canvas area ─────────────────────────────────────────────────── */
.canvas-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
}

/* ── Footer row ──────────────────────────────────────────────────── */
.hero-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin-top: 40px;
}

.btn-icon {
  margin-right: 4px;
}

.hero-hint {
  font-family: 'Lora', serif;
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  color: rgba(26, 14, 6, 0.4);
  margin: 0;
}
</style>