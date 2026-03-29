<template>
  <div class="game-wrapper">
    <!-- Portrait / too-small overlay -->
    <Transition name="portrait-fade">
      <div v-if="isPortrait" class="portrait-overlay">
        <div class="portrait-card">
          <span class="rotate-icon">📱</span>
          <p class="portrait-title">Rotate your phone</p>
          <p class="portrait-sub">Flip to landscape to play</p>
        </div>
      </div>
    </Transition>
    <canvas ref="canvasRef" :width="WIDTH" :height="HEIGHT" class="game-canvas" />
    <!-- Touch L/R buttons (only on touch devices) -->
    <template v-if="isTouchDevice">
      <button
        class="touch-btn touch-btn--left"
        @pointerdown.prevent="keys.left = true"
        @pointerup.prevent="keys.left = false"
        @pointerleave="keys.left = false"
        @pointercancel="keys.left = false"
        aria-label="Move left"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <button
        class="touch-btn touch-btn--right"
        @pointerdown.prevent="keys.right = true"
        @pointerup.prevent="keys.right = false"
        @pointerleave="keys.right = false"
        @pointercancel="keys.right = false"
        aria-label="Move right"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </template>
    <!-- Fullscreen button -->
    <button class="fullscreen-btn" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen">
      <svg v-if="!isFullscreen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
        <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
        <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const isPortrait    = ref(false)
const isFullscreen  = ref(false)
const isTouchDevice = ref(false)

function checkOrientation () {
  const w = window.innerWidth
  const h = window.innerHeight
  isPortrait.value = w < h && w < 768
}

function onFullscreenChange () {
  isFullscreen.value = !!document.fullscreenElement
  checkOrientation()
}

async function toggleFullscreen () {
  const wrapper = canvasRef.value?.closest('.game-wrapper')
  if (!wrapper) return
  if (!document.fullscreenElement) {
    await wrapper.requestFullscreen().catch(() => {})
  } else {
    await document.exitFullscreen().catch(() => {})
  }
}

// ── Canvas dimensions ─────────────────────────────────────────────────────────
const WIDTH  = 1280
const HEIGHT = 720

// ── Sprite sizes ──────────────────────────────────────────────────────────────
const CART_W   = 200
const CART_H   = 160
const CAN_W    = 35
const CAN_H    = 70
const CART_SPD = 11  // pixels per frame

const canvasRef = ref(null)

// ── Game state ────────────────────────────────────────────────────────────────
let ctx         = null
let rafId       = null
let imgs        = {}
let imgsLoaded  = 0
const TOTAL_IMGS = 6  // background, cart, peach, raspberry + crushed variants

// 'start' | 'playing'
let gameState = 'start'

const keys = { left: false, right: false }

// Cart lives at bottom of canvas
const cart = {
  x: WIDTH / 2 - CART_W / 2,
  y: HEIGHT - CART_H - 24,
  w: CART_W,
  h: CART_H,
}

// Falling cans pool
const cans = []
let spawnTimer = 0
const SPAWN_INTERVAL  = 90   // frames between spawns
const MAX_MISSED      = 25   // game over threshold (5 lives)
const MAX_CAUGHT_LOG  = 8    // how many recent catches to show in HUD

function spawnCan () {
  const types = ['peach', 'raspberry']
  const type  = types[Math.floor(Math.random() * types.length)]
  cans.push({
    type,
    x: Math.random() * (WIDTH - CAN_W),
    y: -CAN_H,
    vy: 0.9 + Math.random() * 0.7,
    w: CAN_W,
    h: CAN_H,
    caught: false,
    crushTimer: 0,
    missed: false,
    missTimer: 0,
  })
}

function spawnHazard () {
  hazards.push({
    x:        Math.max(25, Math.random() * (WIDTH - 74)),
    y:        -70,
    vy:       0.65 + Math.random() * 0.4,
    w:        50,
    h:        60,
    frame:    0,
    hit:      false,
    hitTimer: 0,
  })
}

// Score & catch log
let score = 0
let missed = 0
const caughtLog = []   // recent catch types for HUD icons

// Combo, difficulty & effects
let combo               = 0
let comboTimer          = 0       // frames until streak expires
const COMBO_WINDOW      = 360     // 6 s at 60 fps to catch the next can
let shakeFrames         = 0
let difficultyTimer     = 0
let activeSpawnInterval = SPAWN_INTERVAL
let nextMilestoneIdx    = 0
const MILESTONES        = [5, 10, 20]
const particles         = []
const floatTexts        = []

// ── Hazards (bombs) ──────────────────────────────────────────────────────────
const hazards       = []
let hazardTimer     = 0
let bombFlashFrames  = 0
let powerUpFlashFrames = 0
let powerUpFlashColor  = '#ffffff'
let powerUpBanner      = null   // { pu, framesLeft, maxFrames }
const HAZARD_START  = 600   // 10 s grace period before first bomb
const HAZARD_BASE   = 420   // ~7 s between bombs initially

// ── Power-ups ─────────────────────────────────────────────────────────────────
const POWERUPS = [
  { type: 'slow_fall',    label: 'Slow Motion',   icon: '⏳', color: '#a78bfa', frames: 900 },
  { type: 'double_score', label: 'Double Points', icon: '⭐', color: '#fbbf24', frames: 900 },
  { type: 'shield',       label: 'Shield',        icon: '🛡️', color: '#34d399', frames: 0   },
  { type: 'magnet',       label: 'Magnet',        icon: '🧲', color: '#f472b6', frames: 900 },
  { type: 'ghost',        label: 'Ghost Mode',    icon: '👻', color: '#22d3ee', frames: 900 },
  { type: 'score_rain',   label: 'Score Rain',    icon: '💰', color: '#84cc16', frames: 900 },
]
let activePowerUp      = null
let shieldCount        = 0
let globalSpeedMult    = 1.0
let scoreMultiplier    = 1
let streakMult         = 1   // 1 / 2 / 3 based on combo tier
let powerUpNextCombo   = 10

// ── Audio (Web Audio API) ─────────────────────────────────────────────────────
let audioCtx = null

function ensureAudio () {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (audioCtx.state === 'suspended') audioCtx.resume()
}

function playCatch (comboVal = 1) {
  ensureAudio()
  const semitones = Math.min(comboVal - 1, 8) * 2
  const freq = 440 * Math.pow(2, semitones / 12)
  const t = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(audioCtx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t)
  osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.08)
  gain.gain.setValueAtTime(0.18, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
  osc.start(t); osc.stop(t + 0.22)
}

function playMiss () {
  ensureAudio()
  const t = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(audioCtx.destination)
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(200, t)
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.18)
  gain.gain.setValueAtTime(0.1, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  osc.start(t); osc.stop(t + 0.18)
}

function playMilestone () {
  ensureAudio()
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, i) => {
    const t = audioCtx.currentTime + i * 0.1
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.14, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    osc.start(t); osc.stop(t + 0.3)
  })
}

function playGameOverSound () {
  ensureAudio()
  const notes = [392, 349.23, 293.66, 261.63]
  notes.forEach((freq, i) => {
    const t = audioCtx.currentTime + i * 0.2
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.18, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    osc.start(t); osc.stop(t + 0.5)
  })
}

function playPowerUp (type = 'default') {
  ensureAudio()
  const t = audioCtx.currentTime

  if (type === 'slow_fall') {
    // Dreamy descending harp
    const notes = [880, 698, 587, 523, 440]
    notes.forEach((f, i) => {
      const osc  = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain); gain.connect(audioCtx.destination)
      osc.type = 'sine'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.09, t + i * 0.08)
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.4)
      osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.4)
    })
  } else if (type === 'double_score') {
    // Fanfare riff
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    notes.forEach((f, i) => {
      const osc  = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain); gain.connect(audioCtx.destination)
      osc.type = 'square'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0, t + i * 0.07)
      gain.gain.linearRampToValueAtTime(0.1, t + i * 0.07 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.22)
      osc.start(t + i * 0.07); osc.stop(t + i * 0.07 + 0.22)
    })
  } else if (type === 'magnet') {
    // Rising magnetic hum + sparkle
    const osc  = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(80, t)
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.4)
    gain.gain.setValueAtTime(0.14, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    osc.start(t); osc.stop(t + 0.5)
    const osc2  = audioCtx.createOscillator()
    const gain2 = audioCtx.createGain()
    osc2.connect(gain2); gain2.connect(audioCtx.destination)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, t + 0.2)
    osc2.frequency.exponentialRampToValueAtTime(1200, t + 0.45)
    gain2.gain.setValueAtTime(0.07, t + 0.2)
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    osc2.start(t + 0.2); osc2.stop(t + 0.5)
  } else if (type === 'ghost') {
    // Ethereal whoosh sweep
    const osc  = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(200, t)
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.15)
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.6)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65)
    osc.start(t); osc.stop(t + 0.65)
  } else if (type === 'score_rain') {
    // Coin shower — staccato high plinks
    ;[1047, 1319, 1568, 2093, 2637].forEach((f, i) => {
      const osc  = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain); gain.connect(audioCtx.destination)
      osc.type = 'triangle'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.1, t + i * 0.055)
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.055 + 0.12)
      osc.start(t + i * 0.055); osc.stop(t + i * 0.055 + 0.12)
    })
  } else {
    // Shield — deep resonant bell
    const osc  = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(330, t)
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.8)
    gain.gain.setValueAtTime(0.22, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8)
    osc.start(t); osc.stop(t + 0.8)
  }
}

function playShieldBreak () {
  ensureAudio()
  const t = audioCtx.currentTime
  // Glass-crack: high pitched descending ping + noise burst
  const osc  = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(audioCtx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1400, t)
  osc.frequency.exponentialRampToValueAtTime(300, t + 0.25)
  gain.gain.setValueAtTime(0.28, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
  osc.start(t); osc.stop(t + 0.25)
  // Short crackle
  const buf  = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.18), audioCtx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src  = audioCtx.createBufferSource()
  const ng   = audioCtx.createGain()
  src.buffer = buf
  src.connect(ng); ng.connect(audioCtx.destination)
  ng.gain.setValueAtTime(0.18, t)
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  src.start(t)
}

function playBombHit () {
  ensureAudio()
  const t = audioCtx.currentTime
  // Deep boom
  const osc  = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(audioCtx.destination)
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(90, t)
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.45)
  gain.gain.setValueAtTime(0.28, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
  osc.start(t); osc.stop(t + 0.45)
  // Noise burst
  const buf  = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.28), audioCtx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src   = audioCtx.createBufferSource()
  const nGain = audioCtx.createGain()
  src.buffer = buf
  src.connect(nGain); nGain.connect(audioCtx.destination)
  nGain.gain.setValueAtTime(0.18, t)
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
  src.start(t); src.stop(t + 0.28)
}

function deactivatePowerUp () {
  if (!activePowerUp) return
  if (activePowerUp.type === 'slow_fall')    globalSpeedMult = 1.0
  if (activePowerUp.type === 'double_score') scoreMultiplier = 1
  activePowerUp = null
}

function activatePowerUp (pu) {
  if (activePowerUp) deactivatePowerUp()
  const frames  = pu.frames > 0 ? pu.frames : 180
  activePowerUp = { ...pu, framesLeft: frames, maxFrames: frames }
  if (pu.type === 'slow_fall')    globalSpeedMult = 0.45
  if (pu.type === 'double_score') scoreMultiplier = 2
  if (pu.type === 'shield')       shieldCount = 1

  playPowerUp(pu.type)

  // Screen flash
  powerUpFlashFrames = 45
  powerUpFlashColor  = pu.color

  // Shockwave ring burst
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2
    particles.push({
      x: WIDTH / 2, y: HEIGHT / 2,
      vx: Math.cos(angle) * (5 + Math.random() * 4),
      vy: Math.sin(angle) * (5 + Math.random() * 4),
      life: 50 + Math.floor(Math.random() * 20),
      maxLife: 70,
      color: pu.color,
      size: 5 + Math.random() * 4,
    })
  }

  // Centred banner (replaces float text)
  powerUpBanner = { pu, framesLeft: 210, maxFrames: 210 }
}

// ── Background music — jazz lounge loop (Am › F › C › G) ─────────────────────
let musicInterval = null
let musicBeat     = 0
const BEAT        = 0.145  // seconds per 16th-note (~104 bpm)

const CHORD_PROG = [
  [220,    261.63, 329.63],  // Am
  [174.61, 220,    261.63],  // F
  [261.63, 329.63, 392],     // C
  [196,    246.94, 293.66],  // G
]

const MELODY_NOTES = [
  523.25, 0,      587.33, 523.25, 0,      440,    0,      523.25,
  493.88, 0,      523.25, 493.88, 0,      392,    0,      493.88,
  659.25, 587.33, 523.25, 0,      587.33, 0,      0,      659.25,
  523.25, 0,      493.88, 440,    0,      349.23, 0,      0,
]

function musicTick () {
  if (!audioCtx) return
  const t      = audioCtx.currentTime
  const beat16 = musicBeat % MELODY_NOTES.length
  const barIdx = Math.floor(musicBeat / 16) % CHORD_PROG.length

  // Chord pad every bar
  if (beat16 === 0) {
    CHORD_PROG[barIdx].forEach(freq => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain); gain.connect(audioCtx.destination)
      osc.type = 'triangle'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.025, t)
      gain.gain.setValueAtTime(0.025, t + BEAT * 14)
      gain.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 16)
      osc.start(t); osc.stop(t + BEAT * 16)
    })
  }

  // Bass note every half-bar
  if (beat16 % 4 === 0) {
    const bass = CHORD_PROG[barIdx][0] / 2
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = 'triangle'
    osc.frequency.value = bass
    gain.gain.setValueAtTime(0.065, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 3.5)
    osc.start(t); osc.stop(t + BEAT * 3.5)
  }

  // Melody
  const note = MELODY_NOTES[beat16]
  if (note) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = 'sine'
    osc.frequency.value = note
    gain.gain.setValueAtTime(0.07, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + BEAT * 0.75)
    osc.start(t); osc.stop(t + BEAT * 0.75)
  }

  musicBeat++
}

function startMusic () {
  if (musicInterval) return
  ensureAudio()
  musicBeat = 0
  musicTick()
  musicInterval = setInterval(musicTick, BEAT * 1000)
}

function stopMusic () {
  clearInterval(musicInterval)
  musicInterval = null
}

function loadImages () {
  const sources = {
    bg:               '/images/shop.png',
    cart:             '/images/cart.png',
    peach:            '/images/peach.png',
    raspberry:        '/images/raspberry.png',
    peach_crushed:    '/images/peach_crushed.png',
    raspberry_crushed:'/images/raspberry_crushed.png',
  }
  for (const [key, src] of Object.entries(sources)) {
    const img = new Image()
    img.src = src
    img.onload = () => {
      imgsLoaded++
      if (imgsLoaded === TOTAL_IMGS) startGame()
    }
    imgs[key] = img
  }
}

function startGame () {
  rafId = requestAnimationFrame(loop)
}

function beginPlaying () {
  if (gameState !== 'start' && gameState !== 'gameover') return
  gameState           = 'playing'
  score               = 0
  missed              = 0
  combo               = 0
  shakeFrames         = 0
  difficultyTimer     = 0
  activeSpawnInterval = SPAWN_INTERVAL
  nextMilestoneIdx    = 0
  caughtLog.length    = 0
  cans.length         = 0
  particles.length    = 0
  floatTexts.length   = 0
  hazards.length      = 0
  hazardTimer         = 0
  bombFlashFrames     = 0
  powerUpBanner       = null
  comboTimer          = 0
  if (activePowerUp) deactivatePowerUp()
  shieldCount      = 0
  globalSpeedMult  = 1.0
  scoreMultiplier  = 1
  streakMult       = 1
  powerUpNextCombo = 10
  spawnTimer          = 0
  cart.x              = WIDTH / 2 - CART_W / 2
  cart.w              = CART_W
  startMusic()
}

function loop () {
  if (gameState === 'start') {
    drawStartScreen()
  } else if (gameState === 'gameover') {
    drawGameOverScreen()
  } else {
    update()
    draw()
  }
  rafId = requestAnimationFrame(loop)
}

function update () {
  // Difficulty timer (kept for level display; no longer affects speed or spawn rate)
  difficultyTimer++
  activeSpawnInterval = SPAWN_INTERVAL

  // Score Rain: +3 pts every 45 frames
  if (activePowerUp?.type === 'score_rain' && difficultyTimer % 45 === 0) {
    score += 3
    floatTexts.push({ text: '+3 💰', x: WIDTH / 2 + (Math.random() - 0.5) * 300, y: 140, life: 45, maxLife: 45, color: '#84cc16', size: 18 })
  }

  // Tick active power-up
  if (activePowerUp) {
    activePowerUp.framesLeft--
    if (activePowerUp.framesLeft <= 0) deactivatePowerUp()
  }

  // Move cart
  if (keys.left)  cart.x = Math.max(0, cart.x - CART_SPD)
  if (keys.right) cart.x = Math.min(WIDTH - cart.w, cart.x + CART_SPD)

  // Shake & flash decay
  if (shakeFrames > 0)        shakeFrames--
  if (bombFlashFrames > 0)    bombFlashFrames--
  if (powerUpFlashFrames > 0) powerUpFlashFrames--

  // Combo decay timer — resets streak if no catch within COMBO_WINDOW
  // Slows down alongside globalSpeedMult (e.g. slow_fall power-up)
  if (combo > 0) {
    comboTimer -= globalSpeedMult
    if (comboTimer <= 0) {
      combo      = 0
      comboTimer = 0
      floatTexts.push({ text: 'STREAK LOST', x: WIDTH - 120, y: 100, life: 55, maxLife: 55, color: 'rgba(255,255,255,0.55)', size: 13 })
    }
  }

  // Spawn cans
  spawnTimer++
  if (spawnTimer >= activeSpawnInterval) {
    spawnCan()
    spawnTimer = 0
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x  += p.vx
    p.y  += p.vy
    p.vy += 0.2
    p.life--
    if (p.life <= 0) particles.splice(i, 1)
  }

  // Update float texts
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i]
    f.y   -= 1.3
    f.life--
    if (f.life <= 0) floatTexts.splice(i, 1)
  }

  // ── Hazard (bomb) spawn + update ────────────────────────────────────────────
  hazardTimer++
  const hazardInterval = HAZARD_BASE
  if (difficultyTimer >= HAZARD_START && hazardTimer >= hazardInterval) {
    spawnHazard()
    hazardTimer = 0
  }

  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i]
    h.frame++
    if (h.hit) {
      h.hitTimer++
      if (h.hitTimer > 40) hazards.splice(i, 1)
      continue
    }
    h.y += h.vy * globalSpeedMult
    const hBottom     = h.y + h.h
    const hCX         = h.x + h.w / 2
    const hCatchTop   = cart.y
    const hCatchBot   = cart.y + cart.h * 0.6
    const hCatchLeft  = cart.x + cart.w * 0.1
    const hCatchRight = cart.x + cart.w * 0.9
    if (
      hBottom >= hCatchTop &&
      hBottom <= hCatchBot + h.vy * 2 &&
      hCX >= hCatchLeft &&
      hCX <= hCatchRight
    ) {
      h.hit = true
      if (activePowerUp?.type === 'ghost') {
        floatTexts.push({ text: '👻 PHASED!', x: hCX, y: h.y, life: 60, maxLife: 60, color: '#22d3ee', size: 22 })
      } else {
        combo           = 0
        comboTimer      = 0
        shakeFrames     = 22
        bombFlashFrames = 38
        if (activePowerUp) deactivatePowerUp()
        if (shieldCount > 0) {
          shieldCount = 0
          playShieldBreak()
          floatTexts.push({ text: '🛡️ BLOCKED!', x: hCX, y: h.y, life: 60, maxLife: 60, color: '#34d399', size: 22 })
        } else {
          const penalty = Math.min(score, 10)
          score   = Math.max(0, score - penalty)
          missed  = Math.min(MAX_MISSED, missed + 5)
          playBombHit()
          floatTexts.push({ text: `💥 −${penalty} PTS, −5 LIVES!`, x: hCX, y: h.y - 20, life: 80, maxLife: 80, color: '#ef4444', size: 22 })
          if (missed >= MAX_MISSED) {
            gameState = 'gameover'
            stopMusic()
            playGameOverSound()
          }
        }
      }
    } else if (h.y > HEIGHT) {
      hazards.splice(i, 1)
    }
  }

  // Move & collide cans
  for (let i = cans.length - 1; i >= 0; i--) {
    const c = cans[i]

    if (c.caught) {
      c.crushTimer++
      if (c.crushTimer > 30) cans.splice(i, 1)
      continue
    }

    if (c.missed) {
      c.missTimer++
      if (c.missTimer > 180) cans.splice(i, 1)
      continue
    }

    c.y += c.vy * globalSpeedMult

    // Magnet: attract cans toward cart centre
    if (activePowerUp?.type === 'magnet') {
      const cartCX = cart.x + cart.w / 2
      c.x += (cartCX - (c.x + c.w / 2)) * 0.04
    }

    // AABB catch — check if can lands in cart opening (upper 60% of cart)
    const catchTop    = cart.y
    const catchBottom = cart.y + cart.h * 0.6
    const catchLeft   = cart.x + cart.w * 0.1
    const catchRight  = cart.x + cart.w * 0.9
    const canBottom   = c.y + c.h
    const canCX       = c.x + c.w / 2

    if (
      canBottom >= catchTop &&
      canBottom <= catchBottom + c.vy * 2 &&
      canCX >= catchLeft &&
      canCX <= catchRight
    ) {
      c.caught = true
      combo++
      comboTimer = COMBO_WINDOW   // reset window on each catch
      streakMult  = combo <= 3 ? 1 : combo <= 6 ? 2 : 3
      score += scoreMultiplier * streakMult
      caughtLog.push(c.type)
      if (caughtLog.length > MAX_CAUGHT_LOG) caughtLog.shift()

      playCatch(combo)

      // Power-up trigger every 10 consecutive catches
      if (combo >= 10) {
        combo = 0
        comboTimer = 0
        activatePowerUp(POWERUPS[Math.floor(Math.random() * POWERUPS.length)])
      }

      // Milestone check
      while (nextMilestoneIdx < MILESTONES.length && score >= MILESTONES[nextMilestoneIdx]) {
        playMilestone()
        nextMilestoneIdx++
      }

      // Burst particles
      const pColor = c.type === 'peach' ? '#f97316' : '#ef4444'
      for (let p = 0; p < 10; p++) {
        const angle = Math.random() * Math.PI * 2
        const spd   = 2 + Math.random() * 3
        particles.push({
          x: c.x + c.w / 2, y: c.y + c.h / 2,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 2,
          life: 28 + Math.floor(Math.random() * 15),
          maxLife: 43,
          color: pColor,
          size: 3 + Math.random() * 3,
        })
      }

      // Float text
      const pts   = scoreMultiplier * streakMult
      const label = combo >= 3 ? `${combo}× COMBO! +${pts}` : `+${pts}`
      floatTexts.push({
        text: label, x: c.x + c.w / 2, y: c.y,
        life: 48, maxLife: 48,
        color:  combo >= 3 ? '#fbbf24' : '#ffffff',
        size:   combo >= 3 ? 22 : 16,
      })
    } else if (c.y > HEIGHT) {
      c.missed    = true
      c.missTimer = 0
      c.y = HEIGHT - c.h - 10
      c.x = Math.max(0, Math.min(WIDTH - c.w, c.x))
      playMiss()
    }
  }
}

// Hex colour → [r, g, b] helper
function hexToRgb (hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function roundRect (x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawStartScreen () {
  // Background
  ctx.drawImage(imgs.bg, 0, 0, WIDTH, HEIGHT)

  // Dim overlay
  ctx.fillStyle = 'rgba(10, 6, 2, 0.72)'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // ── Card ──────────────────────────────────────────────────────────
  const cardW = 720
  const cardH = 480
  const cardX = (WIDTH  - cardW) / 2
  const cardY = (HEIGHT - cardH) / 2

  // Card shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur  = 48
  ctx.fillStyle   = '#faf6ee'
  roundRect(cardX, cardY, cardW, cardH, 10)
  ctx.fill()
  ctx.restore()

  // Card border — brass top rule
  const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY)
  grad.addColorStop(0,    'rgba(169,124,58,0)')
  grad.addColorStop(0.3,  'rgba(169,124,58,1)')
  grad.addColorStop(0.5,  'rgba(192,90,60,1)')
  grad.addColorStop(0.7,  'rgba(169,124,58,1)')
  grad.addColorStop(1,    'rgba(169,124,58,0)')
  ctx.fillStyle = grad
  ctx.fillRect(cardX, cardY, cardW, 2)

  // ── Title ─────────────────────────────────────────────────────────
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 52px "Cormorant Garamond", serif'
  // Brass gradient text simulation via solid colour
  ctx.fillStyle    = '#a97c3a'
  ctx.fillText('Catch & Collect', WIDTH / 2, cardY + 36)
  ctx.restore()

  // Sub-title
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'italic 20px "Cormorant Garamond", serif'
  ctx.fillStyle    = 'rgba(26,14,6,0.55)'
  ctx.fillText('Steeped in mischief — fill your cart, earn your rewards', WIDTH / 2, cardY + 102)
  ctx.restore()

  // Divider
  ctx.strokeStyle = 'rgba(169,124,58,0.3)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(cardX + 60,  cardY + 136)
  ctx.lineTo(cardX + cardW - 60, cardY + 136)
  ctx.stroke()

  // ── Reward rows ───────────────────────────────────────────────────
  const rewards = [
    { icon: '🛒', label: '5 cans caught',  reward: '5% off your next order' },
    { icon: '⭐', label: '10 cans caught', reward: 'Free can in your basket'  },
    { icon: '🎉', label: '20 cans caught', reward: 'Unlock a secret flavour'  },
  ]

  const rowH   = 66
  const startY = cardY + 156

  rewards.forEach((r, i) => {
    const ry = startY + i * rowH
    const col = i % 2 === 0 ? 'rgba(169,124,58,0.06)' : 'transparent'
    ctx.fillStyle = col
    ctx.fillRect(cardX + 40, ry, cardW - 80, rowH - 6)

    // Icon
    ctx.font         = '26px serif'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(r.icon, cardX + 60, ry + (rowH - 6) / 2)

    // Label
    ctx.font      = 'bold 18px "Cormorant Garamond", serif'
    ctx.fillStyle = '#1a0e06'
    ctx.fillText(r.label, cardX + 104, ry + (rowH - 6) / 2 - 10)

    // Reward
    ctx.font      = 'italic 16px "Cormorant Garamond", serif'
    ctx.fillStyle = '#c05a3c'
    ctx.fillText('→  ' + r.reward, cardX + 104, ry + (rowH - 6) / 2 + 14)
  })

  // Divider
  ctx.strokeStyle = 'rgba(169,124,58,0.3)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(cardX + 60,  cardY + cardH - 90)
  ctx.lineTo(cardX + cardW - 60, cardY + cardH - 90)
  ctx.stroke()

  // Bomb warning line
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.font         = 'italic 15px "Cormorant Garamond", serif'
  ctx.fillStyle    = '#c05a3c'
  ctx.fillText('💣  Dodge the bombs — they cost 5 lives!', WIDTH / 2, cardY + cardH - 66)
  ctx.restore()

  // ── CTA button ────────────────────────────────────────────────────
  const btnW = 260
  const btnH = 48
  const btnX = (WIDTH  - btnW) / 2
  const btnY = cardY + cardH - 72

  ctx.fillStyle = '#1a0e06'
  roundRect(btnX, btnY, btnW, btnH, 4)
  ctx.fill()

  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.font         = 'bold 17px "Cormorant Garamond", serif'
  ctx.fillStyle    = '#faf6ee'
  ctx.letterSpacing = '0.15em'
  ctx.fillText('PRESS ANY KEY OR CLICK TO PLAY', WIDTH / 2, btnY + btnH / 2)
  ctx.restore()
}

function drawGameOverScreen () {
  ctx.drawImage(imgs.bg, 0, 0, WIDTH, HEIGHT)

  ctx.fillStyle = 'rgba(10,6,2,0.78)'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // ── Card ──────────────────────────────────────────────────────────
  const cardW = 680
  const cardH = 440
  const cardX = (WIDTH  - cardW) / 2
  const cardY = (HEIGHT - cardH) / 2

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur  = 48
  ctx.fillStyle   = '#faf6ee'
  roundRect(cardX, cardY, cardW, cardH, 10)
  ctx.fill()
  ctx.restore()

  // Terracotta top rule
  const goGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0)
  goGrad.addColorStop(0,   'rgba(192,90,60,0)')
  goGrad.addColorStop(0.3, 'rgba(192,90,60,1)')
  goGrad.addColorStop(0.7, 'rgba(192,90,60,1)')
  goGrad.addColorStop(1,   'rgba(192,90,60,0)')
  ctx.fillStyle = goGrad
  ctx.fillRect(cardX, cardY, cardW, 3)

  // Title
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 58px "Cormorant Garamond", serif'
  ctx.fillStyle    = '#c05a3c'
  ctx.fillText('Game Over', WIDTH / 2, cardY + 28)
  ctx.restore()

  // Score line
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'italic 22px "Cormorant Garamond", serif'
  ctx.fillStyle    = 'rgba(26,14,6,0.6)'
  ctx.fillText(`You caught ${score} can${score !== 1 ? 's' : ''}`, WIDTH / 2, cardY + 96)
  ctx.restore()

  // Divider
  ctx.strokeStyle = 'rgba(169,124,58,0.3)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(cardX + 60, cardY + 132)
  ctx.lineTo(cardX + cardW - 60, cardY + 132)
  ctx.stroke()

  // ── Reward rows ───────────────────────────────────────────────────
  const milestones = [
    { threshold: 5,  emoji: '🛒', reward: '5% off your next order' },
    { threshold: 10, emoji: '⭐', reward: 'Free can in your basket' },
    { threshold: 20, emoji: '🎉', reward: 'Unlock a secret flavour' },
  ]
  const rowH   = 62
  const startY = cardY + 148

  milestones.forEach((m, i) => {
    const ry       = startY + i * rowH
    const unlocked = score >= m.threshold

    ctx.save()
    ctx.globalAlpha = unlocked ? 1 : 0.35

    if (unlocked) {
      ctx.fillStyle = 'rgba(169,124,58,0.08)'
      ctx.fillRect(cardX + 40, ry, cardW - 80, rowH - 6)
    }

    const midY = ry + (rowH - 6) / 2
    ctx.font         = '22px serif'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(unlocked ? '✅' : '❌', cardX + 54, midY)
    ctx.fillText(m.emoji, cardX + 94, midY)

    ctx.font      = 'bold 17px "Cormorant Garamond", serif'
    ctx.fillStyle = '#1a0e06'
    ctx.fillText(`${m.threshold} cans`, cardX + 136, midY - 9)

    ctx.font      = 'italic 15px "Cormorant Garamond", serif'
    ctx.fillStyle = unlocked ? '#c05a3c' : '#1a0e06'
    ctx.fillText('→  ' + m.reward, cardX + 136, midY + 13)

    ctx.restore()
  })

  // Divider
  ctx.strokeStyle = 'rgba(169,124,58,0.3)'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(cardX + 60, cardY + cardH - 78)
  ctx.lineTo(cardX + cardW - 60, cardY + cardH - 78)
  ctx.stroke()

  // Play Again button
  const btnW = 220
  const btnH = 46
  const btnX = (WIDTH  - btnW) / 2
  const btnY = cardY + cardH - 60

  ctx.fillStyle = '#1a0e06'
  roundRect(btnX, btnY, btnW, btnH, 4)
  ctx.fill()

  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.font         = 'bold 16px "Cormorant Garamond", serif'
  ctx.fillStyle    = '#faf6ee'
  ctx.fillText('PLAY AGAIN', WIDTH / 2, btnY + btnH / 2)
  ctx.restore()
}

function draw () {
  ctx.save()

  // Screen shake
  if (shakeFrames > 0) {
    const s = shakeFrames * 1.8
    ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s)
  }

  // Background
  ctx.drawImage(imgs.bg, 0, 0, WIDTH, HEIGHT)

  // Falling / floor cans
  for (const c of cans) {
    ctx.save()
    if (c.caught) {
      const alpha = 1 - c.crushTimer / 30
      ctx.globalAlpha = Math.max(0, alpha)
      const scale = 1 + c.crushTimer / 60
      ctx.translate(c.x + c.w / 2, c.y + c.h / 2)
      ctx.scale(scale, scale)
      ctx.drawImage(imgs[c.type], -c.w / 2, -c.h / 2, c.w, c.h)
    } else if (c.missed) {
      const alpha = c.missTimer < 120 ? 1 : 1 - (c.missTimer - 120) / 60
      ctx.globalAlpha = Math.max(0, alpha)
      ctx.drawImage(imgs[`${c.type}_crushed`], c.x, c.y, c.w, c.h)
    } else {
      ctx.drawImage(imgs[c.type], c.x, c.y, c.w, c.h)
    }
    ctx.restore()
  }

  // Catch particles
  for (const p of particles) {
    ctx.save()
    ctx.globalAlpha = p.life / p.maxLife
    ctx.fillStyle   = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // ── Bombs ─────────────────────────────────────────────────────────────────
  for (const h of hazards) {
    const cx = h.x + h.w / 2
    const cy = h.y + h.h * 0.62
    const r  = h.w * 0.44

    if (h.hit) {
      const ef = h.hitTimer / 40
      ctx.save()
      ctx.globalAlpha = 1 - ef
      const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 80 * ef)
      eg.addColorStop(0,    'rgba(255,240,80,1)')
      eg.addColorStop(0.35, 'rgba(255,100,20,0.85)')
      eg.addColorStop(1,    'rgba(160,20,0,0)')
      ctx.fillStyle = eg
      ctx.beginPath()
      ctx.arc(cx, cy, r + 80 * ef, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      continue
    }

    const pulse = 0.35 + 0.35 * Math.abs(Math.sin(h.frame * 0.1))

    // Body
    ctx.save()
    ctx.shadowColor = '#ff2200'
    ctx.shadowBlur  = 18 + pulse * 22
    const bg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.28, r * 0.06, cx, cy, r)
    bg.addColorStop(0,   '#5a5a5a')
    bg.addColorStop(0.5, '#1e1e1e')
    bg.addColorStop(1,   '#0a0a0a')
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Rim highlight
    ctx.save()
    ctx.globalAlpha = 0.16
    ctx.fillStyle   = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx - r * 0.2, cy - r * 0.24, r * 0.26, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Skull
    ctx.save()
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.font         = `bold ${Math.round(r * 1.05)}px serif`
    ctx.globalAlpha  = 0.9
    ctx.fillText('💀', cx, cy + 1)
    ctx.restore()

    // Fuse
    const fuseX0 = cx + r * 0.54
    const fuseY0 = cy - r * 0.68
    const tipX   = fuseX0 + 8
    const tipY   = fuseY0 - 24
    ctx.save()
    ctx.strokeStyle = '#9e6b1f'
    ctx.lineWidth   = 3
    ctx.lineCap     = 'round'
    ctx.beginPath()
    ctx.moveTo(fuseX0, fuseY0)
    ctx.bezierCurveTo(fuseX0 + 7, fuseY0 - 8, fuseX0 + 2, fuseY0 - 17, tipX, tipY)
    ctx.stroke()
    ctx.restore()

    // Sparks
    if (h.frame % 8 < 5) {
      ctx.save()
      ctx.fillStyle   = '#ffe040'
      ctx.shadowColor = '#ff8800'
      ctx.shadowBlur  = 14
      ctx.beginPath()
      ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2)
      ctx.fill()
      for (let s = 0; s < 4; s++) {
        const sa = h.frame * 0.55 + s * 1.57
        ctx.beginPath()
        ctx.arc(tipX + Math.cos(sa) * 6, tipY + Math.sin(sa) * 5, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // AVOID! label
    ctx.save()
    ctx.font         = 'bold 11px monospace'
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle    = `rgba(255,68,68,${0.5 + 0.5 * pulse})`
    ctx.shadowColor  = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur   = 5
    ctx.fillText('AVOID!', cx, h.y + h.h + 3)
    ctx.restore()

    // Ghost mode: dim bomb to show it's harmless
    if (activePowerUp?.type === 'ghost') {
      ctx.save()
      ctx.globalAlpha = 0.65
      ctx.fillStyle   = 'rgba(0,20,24,0.8)'
      ctx.beginPath()
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.55
      const gv = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 6)
      gv.addColorStop(0, 'rgba(34,211,238,0.5)')
      gv.addColorStop(1, 'rgba(34,211,238,0)')
      ctx.fillStyle = gv
      ctx.beginPath()
      ctx.arc(cx, cy, r + 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // Cart
  ctx.drawImage(imgs.cart, cart.x, cart.y, cart.w, cart.h)

  // Floating score texts
  for (const f of floatTexts) {
    const alpha = f.life / f.maxLife
    ctx.save()
    ctx.globalAlpha  = alpha
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.font         = `bold ${f.size}px monospace`
    ctx.fillStyle    = f.color
    ctx.shadowColor  = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur   = 5
    ctx.fillText(f.text, f.x, f.y)
    ctx.restore()
  }

  ctx.restore()  // end shake transform

  // Slow-motion purple vignette while active
  if (activePowerUp?.type === 'slow_fall') {
    const vm = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, HEIGHT*0.25, WIDTH/2, HEIGHT/2, HEIGHT*0.72)
    vm.addColorStop(0, 'rgba(0,0,0,0)')
    vm.addColorStop(1, 'rgba(100,60,180,0.22)')
    ctx.fillStyle = vm
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }

  // Magnet pink glow around cart
  if (activePowerUp?.type === 'magnet') {
    const pulse = 0.1 + 0.08 * Math.abs(Math.sin(Date.now() / 160))
    ctx.save()
    const mg = ctx.createRadialGradient(cart.x + cart.w / 2, cart.y + cart.h / 2, 0, cart.x + cart.w / 2, cart.y + cart.h / 2, cart.w * 0.85)
    mg.addColorStop(0, `rgba(244,114,182,${pulse * 2})`)
    mg.addColorStop(1, 'rgba(244,114,182,0)')
    ctx.fillStyle = mg
    ctx.fillRect(cart.x - 30, cart.y - 30, cart.w + 60, cart.h + 60)
    ctx.restore()
  }

  // Ghost cyan room vignette (bomb immunity) — flashes in last 2s
  if (activePowerUp?.type === 'ghost') {
    const ghostExpiring = activePowerUp.framesLeft <= 300
    const ghostVisible  = !ghostExpiring || (activePowerUp.framesLeft % 16 < 10)
    if (ghostVisible) {
      const ghostAlpha = ghostExpiring ? 0.22 : 0.14
      const cv = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, HEIGHT*0.3, WIDTH/2, HEIGHT/2, HEIGHT*0.75)
      cv.addColorStop(0, 'rgba(0,0,0,0)')
      cv.addColorStop(1, `rgba(34,211,238,${ghostAlpha})`)
      ctx.fillStyle = cv
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
  }

  // Score Rain golden top shimmer
  if (activePowerUp?.type === 'score_rain') {
    const pulse = 0.04 + 0.03 * Math.abs(Math.sin(Date.now() / 350))
    const sg = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.35)
    sg.addColorStop(0, `rgba(132,204,22,${pulse * 2})`)
    sg.addColorStop(1, 'rgba(132,204,22,0)')
    ctx.fillStyle = sg
    ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.35)
  }

  // Bomb hit red flash
  if (bombFlashFrames > 0) {
    ctx.fillStyle = `rgba(220,30,30,${(bombFlashFrames / 38) * 0.48})`
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }

  // Power-up activation flash
  if (powerUpFlashFrames > 0) {
    const prog  = powerUpFlashFrames / 45
    const vg = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, HEIGHT*0.1, WIDTH/2, HEIGHT/2, HEIGHT*0.8)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    const [r, g, b] = hexToRgb(powerUpFlashColor)
    vg.addColorStop(1, `rgba(${r},${g},${b},${prog * 0.55})`)
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const burst = Math.max(0, prog - 0.5) * 2
    if (burst > 0) {
      ctx.fillStyle = `rgba(255,255,255,${burst * 0.18})`
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
  }

  // ── Power-up banner ───────────────────────────────────────────────────
  if (powerUpBanner) {
    powerUpBanner.framesLeft--
    if (powerUpBanner.framesLeft <= 0) {
      powerUpBanner = null
    } else {
      const { pu, framesLeft, maxFrames } = powerUpBanner
      const progress = framesLeft / maxFrames
      // Fade in fast, hold, fade out
      const alpha = progress > 0.85
        ? (1 - progress) / 0.15          // fade in over first 15%
        : progress < 0.25
          ? progress / 0.25              // fade out over last 25%
          : 1

      const bW   = 600
      const bH   = 110
      const bX   = (WIDTH  - bW) / 2
      const bY   = (HEIGHT / 2) - bH / 2 - 30
      const [r, g, b] = hexToRgb(pu.color)

      ctx.save()
      ctx.globalAlpha = alpha

      // Dark backdrop
      ctx.fillStyle = 'rgba(8,4,2,0.88)'
      roundRect(bX, bY, bW, bH, 14)
      ctx.fill()

      // Glowing border
      ctx.shadowColor = pu.color
      ctx.shadowBlur  = 28
      ctx.strokeStyle = pu.color
      ctx.lineWidth   = 2
      roundRect(bX, bY, bW, bH, 14)
      ctx.stroke()
      ctx.shadowBlur = 0

      // Top rule
      const gr = ctx.createLinearGradient(bX, 0, bX + bW, 0)
      gr.addColorStop(0,   'rgba(0,0,0,0)')
      gr.addColorStop(0.3, pu.color)
      gr.addColorStop(0.7, pu.color)
      gr.addColorStop(1,   'rgba(0,0,0,0)')
      ctx.fillStyle = gr
      ctx.fillRect(bX, bY, bW, 2)

      // Icon
      ctx.font         = '46px serif'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(pu.icon, bX + 66, bY + bH / 2)

      // Title
      ctx.font      = `bold 32px monospace`
      ctx.fillStyle = pu.color
      ctx.shadowColor = pu.color
      ctx.shadowBlur  = 12
      ctx.textAlign    = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(pu.label.toUpperCase(), bX + 114, bY + bH / 2 - 14)
      ctx.shadowBlur = 0

      // Sub-label
      ctx.font      = 'bold 13px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText('POWER UP ACTIVATED', bX + 114, bY + bH / 2 + 20)

      // Drain bar (how long is left on this power-up)
      if (activePowerUp) {
        const puProg = activePowerUp.framesLeft / activePowerUp.maxFrames
        const dW = bW - 128 - 28
        const dX = bX + 114
        const dY = bY + bH - 20
        ctx.fillStyle = `rgba(${r},${g},${b},0.18)`
        roundRect(dX, dY, dW, 5, 3)
        ctx.fill()
        ctx.fillStyle = pu.color
        roundRect(dX, dY, Math.max(dW * puProg, 4), 5, 3)
        ctx.fill()
      }

      ctx.restore()
    }
  }

  // HUD drawn last so it sits on top
  drawHUD()
}

function drawHUD () {
  const BAR_H = 86

  // Persistent active-powerup tint strip along the HUD separator line
  if (activePowerUp) {
    const [r, g, b] = hexToRgb(activePowerUp.color)
    const pulse = 0.18 + 0.12 * Math.abs(Math.sin(Date.now() / 300))
    ctx.fillStyle = `rgba(${r},${g},${b},${pulse})`
    ctx.fillRect(0, 0, WIDTH, BAR_H)
  }

  // ── Full-width backdrop ──────────────────────────────────────────
  ctx.save()
  const backdrop = ctx.createLinearGradient(0, 0, 0, BAR_H)
  backdrop.addColorStop(0, 'rgba(10,6,2,0.96)')
  backdrop.addColorStop(1, 'rgba(10,6,2,0.72)')
  ctx.fillStyle = backdrop
  ctx.fillRect(0, 0, WIDTH, BAR_H)

  // Separator line
  const sep = ctx.createLinearGradient(0, 0, WIDTH, 0)
  sep.addColorStop(0,   'rgba(169,124,58,0)')
  sep.addColorStop(0.2, 'rgba(169,124,58,0.8)')
  sep.addColorStop(0.5, 'rgba(192,90,60,1)')
  sep.addColorStop(0.8, 'rgba(169,124,58,0.8)')
  sep.addColorStop(1,   'rgba(169,124,58,0)')
  ctx.fillStyle = sep
  ctx.fillRect(0, BAR_H - 2, WIDTH, 2)
  ctx.restore()

  // ── LEFT: SCORE ──────────────────────────────────────────────────
  const LX = 28
  const level = Math.floor(difficultyTimer / 800) + 1

  ctx.save()
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 10px monospace'
  ctx.fillStyle    = 'rgba(169,124,58,0.85)'
  ctx.fillText('SCORE', LX, 11)
  ctx.restore()

  ctx.save()
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 42px monospace'
  ctx.fillStyle    = '#ffffff'
  ctx.shadowColor  = 'rgba(169,124,58,0.7)'
  ctx.shadowBlur   = 14
  ctx.fillText(String(score).padStart(5, '0'), LX, 24)
  ctx.restore()

  // Score multiplier badge (when double score active)
  if (scoreMultiplier > 1) {
    ctx.save()
    ctx.fillStyle    = '#fbbf24'
    ctx.font         = 'bold 13px monospace'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'top'
    ctx.shadowColor  = '#fbbf24'
    ctx.shadowBlur   = 8
    ctx.fillText(`×${scoreMultiplier}`, LX + 168, 30)
    ctx.restore()
  }

  // Active power-up pill (bottom-left)
  if (activePowerUp) {
    const puProg = activePowerUp.framesLeft / activePowerUp.maxFrames
    const pillX  = LX + 64
    const pillW  = 200
    const pillH  = 14
    const pillY  = 70

    ctx.save()
    ctx.fillStyle   = activePowerUp.color + '22'
    roundRect(pillX, pillY, pillW, pillH, 7)
    ctx.fill()
    ctx.strokeStyle = activePowerUp.color + 'aa'
    ctx.lineWidth   = 1
    roundRect(pillX, pillY, pillW, pillH, 7)
    ctx.stroke()
    ctx.fillStyle   = activePowerUp.color + '44'
    roundRect(pillX, pillY, Math.max(pillW * puProg, 14), pillH, 7)
    ctx.fill()
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.font         = 'bold 9px monospace'
    ctx.fillStyle    = '#fff'
    ctx.fillText(`${activePowerUp.icon} ${activePowerUp.label.toUpperCase()}`, pillX + 8, pillY + pillH / 2)
    ctx.restore()
  }

  // ── CENTRE: LIVES ────────────────────────────────────────────────
  const LIFE_N   = 5
  const LIFE_W   = 22
  const LIFE_H   = 32
  const LIFE_GAP = 8
  const livesRow = LIFE_N * (LIFE_W + LIFE_GAP) - LIFE_GAP
  const livesX   = (WIDTH - livesRow) / 2
  const livesY   = 30
  const remaining = Math.max(0, MAX_MISSED - missed)
  const pulse     = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() / 180))

  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 10px monospace'
  ctx.fillStyle    = remaining <= 5 ? `rgba(239,68,68,${0.6 + 0.4 * pulse})` : 'rgba(169,124,58,0.85)'
  ctx.fillText('LIVES', WIDTH / 2, 11)
  ctx.restore()

  for (let i = 0; i < LIFE_N; i++) {
    const threshold = (i + 1) * 5
    const depleted  = missed >= threshold
    const x = livesX + i * (LIFE_W + LIFE_GAP)

    ctx.save()
    if (depleted) {
      ctx.globalAlpha = 0.15
    } else if (remaining <= 5) {
      ctx.globalAlpha = 0.4 + 0.6 * pulse
    }
    ctx.drawImage(imgs['peach'], x, livesY, LIFE_W, LIFE_H)
    ctx.restore()

    if (depleted) {
      ctx.save()
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth   = 1.8
      ctx.lineCap     = 'round'
      ctx.beginPath()
      ctx.moveTo(x + 3,          livesY + 4)
      ctx.lineTo(x + LIFE_W - 3, livesY + LIFE_H - 4)
      ctx.moveTo(x + LIFE_W - 3, livesY + 4)
      ctx.lineTo(x + 3,          livesY + LIFE_H - 4)
      ctx.stroke()
      ctx.restore()
    }
  }

  // Shield indicator — small glowing badge on the lives row
  if (shieldCount > 0) {
    const shieldPulse = 0.7 + 0.3 * Math.abs(Math.sin(Date.now() / 300))
    ctx.save()
    // Soft green glow border around the lives section
    ctx.strokeStyle = `rgba(52,211,153,${shieldPulse * 0.6})`
    ctx.lineWidth   = 1.5
    ctx.shadowColor = '#34d399'
    ctx.shadowBlur  = 10
    const lPad = 10
    roundRect(livesX - lPad, livesY - 4, livesRow + lPad * 2, LIFE_H + 8, 6)
    ctx.stroke()
    // Small shield icon centred at the bottom of the lives row
    ctx.shadowBlur   = 8
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'top'
    ctx.font         = `bold 11px monospace`
    ctx.fillStyle    = `rgba(52,211,153,${shieldPulse})`
    ctx.fillText('🛡️', WIDTH / 2, livesY + LIFE_H + 2)
    ctx.restore()
  }

  // ── RIGHT: STREAK 1–10 ──────────────────────────────────────────
  const RX = WIDTH - 28

  // Label + streak multiplier badge
  ctx.save()
  ctx.textAlign    = 'right'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 10px monospace'
  ctx.fillStyle    = 'rgba(169,124,58,0.85)'
  ctx.fillText('STREAK', RX, 11)
  if (streakMult > 1) {
    const mColor = streakMult >= 3 ? '#ff6b35' : '#fbbf24'
    ctx.font      = 'bold 12px monospace'
    ctx.fillStyle = mColor
    ctx.shadowColor = mColor
    ctx.shadowBlur  = 8
    ctx.textAlign   = 'left'
    ctx.fillText(`×${streakMult}`, RX - 190, 9)
  }
  ctx.restore()

  // 10 pip dots
  const PIP_R   = 7
  const PIP_GAP = 5
  const pipsW   = 10 * (PIP_R * 2 + PIP_GAP) - PIP_GAP
  const pipsX   = RX - pipsW
  const pipsY   = 26
  for (let i = 0; i < 10; i++) {
    const filled = i < combo
    const pipX   = pipsX + i * (PIP_R * 2 + PIP_GAP) + PIP_R
    ctx.save()
    if (filled) {
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur  = 10
      ctx.fillStyle   = combo >= 9 ? '#ff4444' : '#fbbf24'
    } else {
      ctx.fillStyle   = 'rgba(255,255,255,0.12)'
    }
    ctx.beginPath()
    ctx.arc(pipX, pipsY + PIP_R, PIP_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Streak decay timer bar
  if (combo > 0) {
    const barW     = pipsW
    const barX2    = RX - barW
    const timeLeft = comboTimer / COMBO_WINDOW
    const tColor   = timeLeft < 0.3 ? '#ef4444' : timeLeft < 0.6 ? '#f97316' : '#a97c3a'
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.09)'
    roundRect(barX2, 50, barW, 5, 3)
    ctx.fill()
    ctx.fillStyle = tColor
    if (timeLeft < 0.3) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8 }
    roundRect(barX2, 50, Math.max(barW * timeLeft, 3), 5, 3)
    ctx.fill()
    ctx.restore()
  }

  // Controls hint
  ctx.save()
  ctx.font         = '12px monospace'
  ctx.fillStyle    = 'rgba(255,255,255,0.25)'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(isTouchDevice.value ? 'Use buttons or drag to move' : '← →  or  A / D  to move', WIDTH / 2, HEIGHT - 10)
  ctx.restore()
}

// ── Touch input ──────────────────────────────────────────────────────────────
function getTouchCanvasX (touch) {
  const rect = canvasRef.value.getBoundingClientRect()
  return (touch.clientX - rect.left) * (WIDTH / rect.width)
}

function onTouchStart (e) {
  e.preventDefault()
  if (gameState === 'start' || gameState === 'gameover') { beginPlaying(); return }
  const x = getTouchCanvasX(e.touches[0])
  cart.x = Math.max(0, Math.min(WIDTH - cart.w, x - cart.w / 2))
}

function onTouchMove (e) {
  e.preventDefault()
  if (gameState !== 'playing') return
  const x = getTouchCanvasX(e.touches[0])
  cart.x = Math.max(0, Math.min(WIDTH - cart.w, x - cart.w / 2))
}

function onTouchEnd (e) {
  e.preventDefault()
}

// ── Keyboard input ────────────────────────────────────────────────────────────
function onKeyDown (e) {
  if (gameState === 'start' || gameState === 'gameover') { beginPlaying(); return }
  if (e.key === 'ArrowLeft'  || e.key === 'a') keys.left  = true
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true
}
function onKeyUp (e) {
  if (e.key === 'ArrowLeft'  || e.key === 'a') keys.left  = false
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false
}
function onClick () {
  if (gameState === 'start' || gameState === 'gameover') beginPlaying()
}

onMounted(() => {
  ctx = canvasRef.value.getContext('2d')
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  canvasRef.value.addEventListener('click',       onClick)
  canvasRef.value.addEventListener('touchstart',  onTouchStart,  { passive: false })
  canvasRef.value.addEventListener('touchmove',   onTouchMove,   { passive: false })
  canvasRef.value.addEventListener('touchend',    onTouchEnd,    { passive: false })
  canvasRef.value.addEventListener('touchcancel', onTouchEnd,    { passive: false })
  window.addEventListener('keydown',          onKeyDown)
  window.addEventListener('keyup',            onKeyUp)
  window.addEventListener('resize',           checkOrientation)
  window.addEventListener('orientationchange',checkOrientation)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  checkOrientation()
  loadImages()
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  stopMusic()
  if (audioCtx) { audioCtx.close(); audioCtx = null }
  canvasRef.value?.removeEventListener('click',       onClick)
  canvasRef.value?.removeEventListener('touchstart',  onTouchStart)
  canvasRef.value?.removeEventListener('touchmove',   onTouchMove)
  canvasRef.value?.removeEventListener('touchend',    onTouchEnd)
  canvasRef.value?.removeEventListener('touchcancel', onTouchEnd)
  window.removeEventListener('keydown',           onKeyDown)
  window.removeEventListener('keyup',             onKeyUp)
  window.removeEventListener('resize',            checkOrientation)
  window.removeEventListener('orientationchange', checkOrientation)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<style scoped>
.game-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 24px 0;
  margin-top: 50px;
}

/* In fullscreen mode, fill the screen and centre the canvas */
.game-wrapper:fullscreen,
.game-wrapper:-webkit-full-screen {
  background: #1a0e06;
  padding: 0;
  margin: 0;
  width: 100vw;
  height: 100vh;
}

/* Canvas scales down proportionally to fit both viewport width & height */
.game-canvas {
  display: block;
  /* Never wider than viewport, never taller than (viewport - 80px nav) at 16:9 */
  width: min(1280px, 100vw, calc((100vh - 80px) * 1.7778));
  height: auto;
  aspect-ratio: 16 / 9;
  image-rendering: pixelated;
  border: 3px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  touch-action: none; /* prevent browser scroll/zoom on canvas touch */
}

/* ── Portrait overlay ────────────────────────────────────────────────────── */
.portrait-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 14, 6, 0.94);
  backdrop-filter: blur(8px);
  border-radius: 6px;
}

.portrait-card {
  text-align: center;
  padding: 32px 24px;
}

.rotate-icon {
  display: block;
  font-size: 3.5rem;
  margin-bottom: 18px;
  animation: rotate-hint 1.4s ease-in-out infinite alternate;
  transform-origin: center;
}

.portrait-title {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 1.75rem;
  font-weight: 700;
  color: #f2e8d5;
  margin: 0 0 8px;
}

.portrait-sub {
  font-family: monospace;
  font-size: 0.8rem;
  color: rgba(242, 232, 213, 0.5);
  margin: 0;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

@keyframes rotate-hint {
  from { transform: rotate(-5deg); }
  to   { transform: rotate(85deg); }
}

/* ── Touch D-pad buttons ──────────────────────────────────────────────────── */
.touch-btn {
  position: absolute;
  bottom: 36px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(26, 14, 6, 0.55);
  border: 2px solid rgba(169, 124, 58, 0.45);
  color: rgba(242, 232, 213, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
  backdrop-filter: blur(6px);
  transition: background 0.1s, border-color 0.1s, transform 0.08s;
  z-index: 10;
}
.touch-btn:active {
  background: rgba(169, 124, 58, 0.35);
  border-color: rgba(169, 124, 58, 0.9);
  transform: scale(0.92);
}
.touch-btn--left  { left: 12px; }
.touch-btn--right { right: 56px; }
.touch-btn svg {
  width: 38px;
  height: 38px;
  pointer-events: none;
}

/* ── Fullscreen button ──────────────────────────────────────────────────── */
.fullscreen-btn {
  position: absolute;
  bottom: 36px;
  right: 8px;
  width: 34px;
  height: 34px;
  padding: 7px;
  background: rgba(26, 14, 6, 0.6);
  border: 1px solid rgba(169, 124, 58, 0.35);
  border-radius: 6px;
  color: rgba(242, 232, 213, 0.7);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}
.fullscreen-btn:hover {
  background: rgba(169, 124, 58, 0.25);
  color: #f2e8d5;
  border-color: rgba(169, 124, 58, 0.7);
}
.fullscreen-btn svg {
  width: 100%;
  height: 100%;
}

.portrait-fade-enter-active,
.portrait-fade-leave-active { transition: opacity 0.3s ease; }
.portrait-fade-enter-from,
.portrait-fade-leave-to     { opacity: 0; }
</style>
