<template>
  <div>
    <div id="cursor-dot" ref="dotEl" />
    <div id="cursor-ring" ref="ringEl" />
  </div>
</template>

<script setup>
const dotEl = ref(null)
const ringEl = ref(null)

let mouseX = 0, mouseY = 0
let ringX = 0, ringY = 0
let rafId = null
let idleTimer = null

onMounted(() => {
  const dot = dotEl.value
  const ring = ringEl.value

  function onMove(e) {
    mouseX = e.clientX
    mouseY = e.clientY
    dot.style.left = mouseX + 'px'
    dot.style.top  = mouseY + 'px'

    // Start loop on movement, stop after 300ms idle
    if (!rafId) rafId = requestAnimationFrame(animate)
    clearTimeout(idleTimer)
    idleTimer = setTimeout(stop, 300)
  }

  function animate() {
    ringX += (mouseX - ringX) * 0.18
    ringY += (mouseY - ringY) * 0.18
    ring.style.left = ringX + 'px'
    ring.style.top  = ringY + 'px'
    rafId = requestAnimationFrame(animate)
  }

  function stop() {
    cancelAnimationFrame(rafId)
    rafId = null
  }

  // Event delegation — no MutationObserver needed
  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('a, button, [role="button"], .pack-option, .qty-btn')) {
      document.body.classList.add('cursor-hover')
    }
  }, { passive: true })

  document.addEventListener('mouseout', (e) => {
    const to = e.relatedTarget
    if (!to || !to.closest('a, button, [role="button"], .pack-option, .qty-btn')) {
      document.body.classList.remove('cursor-hover')
    }
  }, { passive: true })

  window.addEventListener('mousemove', onMove, { passive: true })

  onUnmounted(() => {
    window.removeEventListener('mousemove', onMove)
    stop()
    clearTimeout(idleTimer)
  })
})
</script>
