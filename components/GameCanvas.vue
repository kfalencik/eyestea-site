<template>
  <div class="game-wrapper" :class="{ 'game-active': isPlaying }">
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
    <div class="canvas-frame">
      <canvas ref="canvasRef" :width="WIDTH" :height="HEIGHT" class="game-canvas" />
      <!-- Restart button -->
      <button class="restart-btn" @click="goToStart" aria-label="Restart">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
        </svg>
      </button>
      <!-- Mute button -->
      <button class="mute-btn" @click="toggleMute" :aria-label="isMuted ? 'Unmute' : 'Mute'">
        <svg v-if="!isMuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/>
          <line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const isPortrait    = ref(false)
const isTouchDevice = ref(false)
const isPlaying     = ref(false)

function checkOrientation () {
  const w = window.innerWidth
  const h = window.innerHeight
  isPortrait.value = w < h && w < 768
}

// ── Canvas dimensions ─────────────────────────────────────────────────────────
const WIDTH  = 1280
const HEIGHT = 720

// ── Sprite sizes ──────────────────────────────────────────────────────────────
const CART_W   = 200
const CART_H   = 160
const CAN_W    = 35
const CAN_H    = 70
const CART_SPD = 22  // pixels per frame

const canvasRef = ref(null)

// ── Game state ────────────────────────────────────────────────────────────────
let ctx         = null
let rafId       = null
let imgs        = {}  
let imgsLoaded  = 0
let lastTime    = 0
let dt          = 1   // delta-time multiplier, normalised to 60fps
const TOTAL_IMGS = 6  // background, cart, peach, raspberry + crushed variants

// 'start' | 'playing'
let gameState = 'start'

const keys = { left: false, right: false }

// Gyroscope state
let gyroActive = false
let gyroGamma  = 0

// Touch drag state
let dragActive   = false
let dragLastX    = 0   // canvas-space X of last touchmove

// Side-press steering (tap left/right half of screen)
let touchLeft    = false
let touchRight   = false

// Cart bounce on catch
let cartBounceTimer = 0
const CART_BOUNCE_FRAMES = 8  // duration of one bounce

// Cart facing direction: 1 = right (default), -1 = left
let cartDir = 1

function onDeviceOrientation (e) {
  gyroGamma = e.gamma ?? 0
}

async function requestGyro () {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    // iOS 13+ requires explicit permission via a user gesture
    try {
      const perm = await DeviceOrientationEvent.requestPermission()
      if (perm === 'granted') {
        window.addEventListener('deviceorientation', onDeviceOrientation)
        gyroActive = true
      }
    } catch (_) { /* permission denied or unavailable */ }
  } else if (typeof DeviceOrientationEvent !== 'undefined') {
    // Android / desktop — no permission required
    window.addEventListener('deviceorientation', onDeviceOrientation)
    gyroActive = true
  }
}

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
const SPAWN_INTERVAL  = 30   // frames between spawns
const MAX_MISSED      = 25   // game over threshold (5 lives)
const MAX_CAUGHT_LOG  = 8    // how many recent catches to show in HUD

function spawnCan () {
  const r     = Math.random()
  const type  = r < 0.05 ? 'golden' : (r < 0.525 ? 'peach' : 'raspberry')
  cans.push({
    type,
    golden: type === 'golden',
    x: Math.random() * (WIDTH - CAN_W),
    y: -CAN_H,
    vy: 4.2 + Math.random() * 2.0,
    w: CAN_W,
    h: CAN_H,
    caught: false,
    crushTimer: 0,
    missed: false,
    missTimer: 0,
  })
}

function spawnHazard (delay = 0) {
  hazards.push({
    x:        Math.max(25, Math.random() * (WIDTH - 74)),
    y:        -70,
    vy:       3.4 + Math.random() * 1.4,
    w:        50,
    h:        60,
    frame:    0,
    hit:      false,
    hitTimer: 0,
    delay,        // frames to wait before entering play
  })
}

// Score & catch log
let score = 0
let missed = 0
const caughtLog = []   // recent catch types for HUD icons

// End-of-run stats
let totalCaught  = 0
let goldenCaught = 0
let bestCombo    = 0
let bombsHit     = 0
let powerUpsUsed = 0

// Combo, difficulty & effects
let combo               = 0
let comboTimer          = 0       // frames until streak expires
let powerUpProgress     = 0       // catches within current 10-catch power-up cycle
const COMBO_WINDOW      = 360     // 6 s at 60 fps to catch the next can
let shakeFrames         = 0
let difficultyTimer     = 0
let activeSpawnInterval = SPAWN_INTERVAL
let nextMilestoneIdx    = 0
const MILESTONES        = [1000, 2000, 10000]
const particles         = []
const floatTexts        = []

// ── Hazards (bombs) ──────────────────────────────────────────────────────────
const hazards       = []
let hazardTimer        = 0
let scoreRainTimer     = 0
let bombFlashFrames  = 0
let powerUpFlashFrames = 0
let powerUpFlashColor  = '#ffffff'
let powerUpBanner      = null   // { pu, framesLeft, maxFrames }
const HAZARD_START  = 0     // bombs start immediately
const HAZARD_BASE   = 420   // ~7 s between bomb waves initially
const HAZARD_MIN    = 120   // floor — never faster than ~2 s

// ── Power-ups ─────────────────────────────────────────────────────────────────
const POWERUPS = [
  { type: 'slow_fall',    label: 'Slow Motion',   icon: '⏳', color: '#a78bfa', frames: 300 },
  { type: 'double_score', label: 'Double Points', icon: '⭐', color: '#fbbf24', frames: 300 },
  { type: 'shield',       label: 'Shield',        icon: '🛡️', color: '#34d399', frames: 0   },
  { type: 'magnet',       label: 'Magnet',        icon: '🧲', color: '#f472b6', frames: 300 },
  { type: 'ghost',        label: 'Ghost Mode',    icon: '👻', color: '#22d3ee', frames: 300 },
  { type: 'score_rain',   label: 'Score Rain',    icon: '💰', color: '#84cc16', frames: 300 },
]
let activePowerUp      = null
let shieldCount        = 0
let globalSpeedMult    = 1.0
let scoreMultiplier    = 1
let streakMult         = 1   // 1 / 2 / 3 based on combo tier
let powerUpNextCombo   = 10

// ── Audio (Web Audio API) ─────────────────────────────────────────────────────
let audioCtx   = null
let masterGain = null
const muteCookie = useCookie('game-muted', { maxAge: 31536000, sameSite: 'strict', default: () => false })
const isMuted    = computed({
  get: () => !!muteCookie.value,
  set: (v) => { muteCookie.value = v },
})

function ensureAudio () {
  if (!audioCtx) {
    audioCtx   = new (window.AudioContext || window.webkitAudioContext)()
    masterGain = audioCtx.createGain()
    masterGain.gain.value = isMuted.value ? 0 : 1
    masterGain.connect(audioCtx.destination)
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
}

function toggleMute () {
  isMuted.value = !isMuted.value
  if (masterGain) masterGain.gain.value = isMuted.value ? 0 : 1
}

let savedScrollY = 0

function lockScroll () {
  savedScrollY = window.scrollY
  isPlaying.value = true
  document.body.classList.add('game-playing')
  if (canvasRef.value) canvasRef.value.style.cursor = 'none'
}

function unlockScroll () {
  isPlaying.value = false
  document.body.classList.remove('game-playing')
  if (canvasRef.value) canvasRef.value.style.cursor = ''
}

function goToStart () {
  stopMusic()
  if (activePowerUp) deactivatePowerUp()
  cans.length      = 0
  hazards.length   = 0
  particles.length = 0
  floatTexts.length = 0
  gameState = 'start'
  dragActive = false
  touchLeft  = false
  touchRight = false
  unlockScroll()
}

function playCatch (comboVal = 1) {
  ensureAudio()
  const semitones = Math.min(comboVal - 1, 8) * 2
  const freq = 440 * Math.pow(2, semitones / 12)
  const t = audioCtx.currentTime
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(masterGain)
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
  osc.connect(gain); gain.connect(masterGain)
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
    osc.connect(gain); gain.connect(masterGain)
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
    osc.connect(gain); gain.connect(masterGain)
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
      osc.connect(gain); gain.connect(masterGain)
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
      osc.connect(gain); gain.connect(masterGain)
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
    osc.connect(gain); gain.connect(masterGain)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(80, t)
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.4)
    gain.gain.setValueAtTime(0.14, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    osc.start(t); osc.stop(t + 0.5)
    const osc2  = audioCtx.createOscillator()
    const gain2 = audioCtx.createGain()
    osc2.connect(gain2); gain2.connect(masterGain)
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
    osc.connect(gain); gain.connect(masterGain)
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
      osc.connect(gain); gain.connect(masterGain)
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
    osc.connect(gain); gain.connect(masterGain)
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
  osc.connect(gain); gain.connect(masterGain)
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
  src.connect(ng); ng.connect(masterGain)
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
  osc.connect(gain); gain.connect(masterGain)
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
  src.connect(nGain); nGain.connect(masterGain)
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
  powerUpsUsed++
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
  powerUpBanner = { pu, framesLeft: 120, maxFrames: 120 }
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
      osc.connect(gain); gain.connect(masterGain)
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
    osc.connect(gain); gain.connect(masterGain)
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
    osc.connect(gain); gain.connect(masterGain)
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
  totalCaught         = 0
  goldenCaught        = 0
  bestCombo           = 0
  bombsHit            = 0
  powerUpsUsed        = 0
  comboTimer          = 0
  powerUpProgress     = 0
  difficultyTimer     = 0
  activeSpawnInterval = SPAWN_INTERVAL
  nextMilestoneIdx    = 0
  caughtLog.length    = 0
  cans.length         = 0
  particles.length    = 0
  floatTexts.length   = 0
  hazards.length      = 0
  hazardTimer         = 0
  scoreRainTimer      = 0
  bombFlashFrames     = 0
  powerUpBanner       = null
  comboTimer          = 0
  if (activePowerUp) deactivatePowerUp()
  shieldCount      = 0
  globalSpeedMult  = 1.0
  scoreMultiplier  = 1
  streakMult       = 1
  powerUpNextCombo = 10
  lastTime = 0
  spawnTimer          = 0
  cart.x              = WIDTH / 2 - CART_W / 2
  cart.w              = CART_W
  lockScroll()
  startMusic()
  requestGyro()
}

function loop (now) {
  // Delta time, capped at 3 frames to avoid spiral-of-death on tab focus
  const raw = lastTime === 0 ? 16.67 : Math.min(now - lastTime, 50)
  lastTime  = now
  dt = raw / 16.6667  // 1.0 = exactly 60fps; 2.0 = 30fps, etc.

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
  // Difficulty timer
  difficultyTimer += dt
  activeSpawnInterval = SPAWN_INTERVAL

  // Score Rain: +3 pts every 45 frames (use dedicated timer so modulo works with fractional dt)
  if (activePowerUp?.type === 'score_rain') {
    scoreRainTimer += dt
    if (scoreRainTimer >= 45) {
      scoreRainTimer -= 45
      score += 3
      floatTexts.push({ text: '+3 💰', x: WIDTH / 2 + (Math.random() - 0.5) * 300, y: 140, life: 45, maxLife: 45, color: '#84cc16', size: 18 })
    }
  } else {
    scoreRainTimer = 0
  }

  // Tick active power-up
  if (activePowerUp) {
    activePowerUp.framesLeft -= dt
    if (activePowerUp.framesLeft <= 0) deactivatePowerUp()
  }

  // Move cart — keyboard
  if (keys.left  || touchLeft)  { cart.x = Math.max(0, cart.x - CART_SPD * dt); cartDir = -1 }
  if (keys.right || touchRight) { cart.x = Math.min(WIDTH - cart.w, cart.x + CART_SPD * dt); cartDir = 1 }
  // Gyro override on mobile — only when not dragging or side-pressing
  if (gyroActive && !dragActive && !touchLeft && !touchRight) {
    const DEAD = 5
    const tilt = gyroGamma
    if (Math.abs(tilt) > DEAD) {
      const frac = (Math.abs(tilt) - DEAD) / (90 - DEAD)
      const spd  = frac * CART_SPD * 2.2
      if (tilt < 0) { cart.x = Math.max(0, cart.x - spd * dt); cartDir = -1 }
      else          { cart.x = Math.min(WIDTH - cart.w, cart.x + spd * dt); cartDir = 1 }
    }
  }

  // Shake & flash decay
  if (cartBounceTimer > 0) cartBounceTimer -= dt
  if (shakeFrames > 0)        shakeFrames        -= dt
  if (bombFlashFrames > 0)    bombFlashFrames    -= dt
  if (powerUpFlashFrames > 0) powerUpFlashFrames -= dt

  // Combo decay timer — resets streak if no catch within COMBO_WINDOW
  // Slows down alongside globalSpeedMult (e.g. slow_fall power-up)
  if (combo > 0) {
    comboTimer -= globalSpeedMult * dt
    if (comboTimer <= 0) {
      combo           = 0
      comboTimer      = 0
      powerUpProgress = 0
      floatTexts.push({ text: 'STREAK LOST', x: WIDTH - 120, y: 100, life: 55, maxLife: 55, color: 'rgba(255,255,255,0.55)', size: 13 })
    }
  }

  // Spawn cans
  spawnTimer += dt
  if (spawnTimer >= activeSpawnInterval) {
    spawnCan()
    spawnTimer = 0
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x  += p.vx * dt
    p.y  += p.vy * dt
    p.vy += 0.2 * dt
    p.life -= dt
    if (p.life <= 0) particles.splice(i, 1)
  }

  // Update float texts
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i]
    f.y   -= 1.3 * dt
    f.life -= dt
    if (f.life <= 0) floatTexts.splice(i, 1)
  }

  // ── Hazard (bomb) spawn + update ────────────────────────────────────────────
  hazardTimer += dt
  // Every 15 s (900 frames) interval shrinks by 30 frames, floored at HAZARD_MIN
  const diffTier       = Math.floor(difficultyTimer / 900)
  const hazardInterval = Math.max(HAZARD_MIN, HAZARD_BASE - diffTier * 30)
  // Simultaneous bombs: 1 at tiers 0-2, 2 at 3-5, 3 at tier 6+
  const hazardCount    = diffTier >= 6 ? 3 : diffTier >= 3 ? 2 : 1
  if (difficultyTimer >= HAZARD_START && hazardTimer >= hazardInterval) {
    for (let _h = 0; _h < hazardCount; _h++) spawnHazard(_h * 45)
    hazardTimer = 0
  }

  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i]
    h.frame += dt
    if (h.delay > 0) {
      h.delay -= dt
      continue  // off-screen, not yet active
    }
    if (h.hit) {
      h.hitTimer += dt
      if (h.hitTimer > 40) hazards.splice(i, 1)
      continue
    }
    h.y += h.vy * globalSpeedMult * dt
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
        powerUpProgress = 0
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
          bombsHit++
          playBombHit()
          floatTexts.push({ text: `💥 −${penalty} PTS, −1 LIFE!`, x: hCX, y: h.y - 20, life: 80, maxLife: 80, color: '#ef4444', size: 22 })
          if (missed >= MAX_MISSED) {
            gameState = 'gameover'
            stopMusic()
            playGameOverSound()
            unlockScroll()
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
      c.crushTimer += dt
      if (c.crushTimer > 30) cans.splice(i, 1)
      continue
    }

    if (c.missed) {
      c.missTimer += dt
      if (c.missTimer > 180) cans.splice(i, 1)
      continue
    }

    c.y += c.vy * globalSpeedMult * dt

    // Magnet: attract cans toward cart centre
    if (activePowerUp?.type === 'magnet') {
      const cartCX = cart.x + cart.w / 2
      c.x += (cartCX - (c.x + c.w / 2)) * 0.04 * dt
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
      cartBounceTimer = CART_BOUNCE_FRAMES
      totalCaught++
      if (c.golden) goldenCaught++
      if (combo > bestCombo) bestCombo = combo
      powerUpProgress++
      comboTimer = COMBO_WINDOW   // reset window on each catch
      streakMult  = Math.floor(combo / 10) + 1
      const canPts = c.golden ? 50 : scoreMultiplier * streakMult
      score += canPts
      caughtLog.push(c.type)
      if (caughtLog.length > MAX_CAUGHT_LOG) caughtLog.shift()

      playCatch(powerUpProgress)

      // Power-up trigger every 10 consecutive catches
      if (powerUpProgress >= 10) {
        powerUpProgress = 0
        activatePowerUp(POWERUPS[Math.floor(Math.random() * POWERUPS.length)])
      }

      // Milestone check
      while (nextMilestoneIdx < MILESTONES.length && score >= MILESTONES[nextMilestoneIdx]) {
        playMilestone()
        nextMilestoneIdx++
      }

      // Burst particles
      const pColor = c.golden ? '#ffd700' : (c.type === 'peach' ? '#f97316' : '#ef4444')
      const pCount = c.golden ? 18 : 10
      for (let p = 0; p < pCount; p++) {
        const angle = Math.random() * Math.PI * 2
        const spd   = 2 + Math.random() * 3
        particles.push({
          x: c.x + c.w / 2, y: c.y + c.h / 2,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 2,
          life: 28 + Math.floor(Math.random() * 15),
          maxLife: 43,
          color: pColor,
          size: c.golden ? 4 + Math.random() * 4 : 3 + Math.random() * 3,
        })
      }

      // Float text
      const label = c.golden
        ? `★ +50 ★`
        : (combo >= 2 ? `${combo}× STREAK! +${canPts}` : `+${canPts}`)
      floatTexts.push({
        text: label, x: c.x + c.w / 2, y: c.y,
        life: 48, maxLife: 48,
        color:  c.golden ? '#ffd700' : (combo >= 2 ? '#fbbf24' : '#ffffff'),
        size:   c.golden ? 26 : (combo >= 2 ? 22 : 16),
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
  const t = Date.now() / 1000

  // ── Background ──────────────────────────────────────────────────────────
  ctx.drawImage(imgs.bg, 0, 0, WIDTH, HEIGHT)
  const bgOv = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  bgOv.addColorStop(0,   'rgba(8,4,1,0.93)')
  bgOv.addColorStop(0.45,'rgba(8,4,1,0.78)')
  bgOv.addColorStop(1,   'rgba(8,4,1,0.95)')
  ctx.fillStyle = bgOv
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // ── Ambient glow orbs ────────────────────────────────────────────────────
  ;[
    { x: WIDTH * 0.22, y: HEIGHT * 0.38, r: 300, c: 'rgba(169,124,58,0.11)' },
    { x: WIDTH * 0.78, y: HEIGHT * 0.42, r: 260, c: 'rgba(192,90,60,0.09)'  },
  ].forEach(o => {
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
    g.addColorStop(0, o.c); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  })

  // ── Drifting background cans ─────────────────────────────────────────────
  ;[
    { x:  90, bY: 200, ph: 0.0,  img: 'peach',     sz: 52, al: 0.14, rot: -0.18 },
    { x: 215, bY: 490, ph: 1.3,  img: 'raspberry', sz: 40, al: 0.11, rot:  0.22 },
    { x:1080, bY: 215, ph: 0.7,  img: 'raspberry', sz: 52, al: 0.14, rot:  0.15 },
    { x:1165, bY: 465, ph: 2.1,  img: 'peach',     sz: 40, al: 0.11, rot: -0.12 },
    { x: 145, bY: 365, ph: 3.2,  img: 'raspberry', sz: 30, al: 0.08, rot:  0.30 },
    { x:1115, bY: 345, ph: 1.9,  img: 'peach',     sz: 30, al: 0.08, rot: -0.24 },
  ].forEach(c => {
    const img = imgs[c.img]
    ctx.save()
    ctx.globalAlpha = c.al
    ctx.translate(c.x, c.bY + Math.sin(t * 0.7 + c.ph) * 16)
    ctx.rotate(c.rot + Math.sin(t * 0.45 + c.ph) * 0.05)
    ctx.drawImage(img, -c.sz / 2, -c.sz, c.sz, c.sz * 2)
    ctx.restore()
  })

  // ── Centre stage ─────────────────────────────────────────────────────────
  const STAGE_CX = WIDTH  / 2
  const STAGE_Y  = 36
  const STAGE_H  = 248

  // Stage glow
  const sg = ctx.createRadialGradient(STAGE_CX, STAGE_Y + STAGE_H / 2, 10, STAGE_CX, STAGE_Y + STAGE_H / 2, 210)
  sg.addColorStop(0,   'rgba(169,124,58,0.18)')
  sg.addColorStop(0.6, 'rgba(169,124,58,0.05)')
  sg.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = sg; ctx.fillRect(0, STAGE_Y, WIDTH, STAGE_H)

  // Cart
  const CW = 188, CH = 150
  const CX = STAGE_CX - CW / 2
  const cycleLen  = 2.6
  const fallCycle = (t % cycleLen) / cycleLen
  const bounce    = fallCycle > 0.86 ? Math.sin((fallCycle - 0.86) / 0.14 * Math.PI) * 7 : 0
  const CY = STAGE_Y + STAGE_H - CH - 2 + bounce
  ctx.drawImage(imgs.cart, CX, CY, CW, CH)

  // Falling can
  const canType = (Math.floor(t / cycleLen) % 2 === 0) ? 'peach' : 'raspberry'
  const CDW = 40, CDH = 74
  const canY = STAGE_Y + 8 + fallCycle * (STAGE_H - CH - 28)
  if (fallCycle < 0.88) {
    const gp = 0.4 + 0.4 * Math.abs(Math.sin(t * 3.2))
    ctx.save()
    ctx.shadowColor = '#fbbf24'
    ctx.shadowBlur  = 12 * gp
    ctx.drawImage(imgs[canType], STAGE_CX - CDW / 2, canY, CDW, CDH)
    ctx.restore()
  }

  // Ground line
  const gl = ctx.createLinearGradient(STAGE_CX - 120, 0, STAGE_CX + 120, 0)
  gl.addColorStop(0, 'rgba(169,124,58,0)'); gl.addColorStop(0.5, 'rgba(169,124,58,0.4)'); gl.addColorStop(1, 'rgba(169,124,58,0)')
  ctx.strokeStyle = gl; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(STAGE_CX - 120, CY + CH + 5); ctx.lineTo(STAGE_CX + 120, CY + CH + 5); ctx.stroke()

  // ── Title ────────────────────────────────────────────────────────────────
  const titleY = STAGE_Y + STAGE_H + 18

  // Base text with glow
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 80px "Cormorant Garamond", serif'
  ctx.shadowColor  = '#a97c3a'
  ctx.shadowBlur   = 30
  ctx.fillStyle    = '#f2e8d5'
  ctx.fillText('CATCH & COLLECT', STAGE_CX, titleY)
  // Shimmer pass
  const shimX = ((t * 0.34) % 1.35 - 0.15) * WIDTH
  const shim  = ctx.createLinearGradient(shimX - 110, 0, shimX + 110, 0)
  shim.addColorStop(0, 'rgba(255,255,255,0)'); shim.addColorStop(0.5, 'rgba(255,255,255,0.2)'); shim.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = shim; ctx.shadowBlur = 0
  ctx.fillText('CATCH & COLLECT', STAGE_CX, titleY)
  ctx.restore()

  // Subtitle
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'italic 24px "Cormorant Garamond", serif'
  ctx.fillStyle    = 'rgba(192,90,60,0.88)'
  ctx.fillText('an Eyes Tea adventure', STAGE_CX, titleY + 90)
  ctx.restore()

  // ── Brass rule with diamond ───────────────────────────────────────────────
  const ruleY = titleY + 128
  const ruleG = ctx.createLinearGradient(STAGE_CX - 280, 0, STAGE_CX + 280, 0)
  ruleG.addColorStop(0,    'rgba(169,124,58,0)')
  ruleG.addColorStop(0.25, 'rgba(169,124,58,0.8)')
  ruleG.addColorStop(0.5,  'rgba(192,90,60,1)')
  ruleG.addColorStop(0.75, 'rgba(169,124,58,0.8)')
  ruleG.addColorStop(1,    'rgba(169,124,58,0)')
  ctx.strokeStyle = ruleG; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(STAGE_CX - 280, ruleY); ctx.lineTo(STAGE_CX + 280, ruleY); ctx.stroke()
  ctx.save(); ctx.translate(STAGE_CX, ruleY); ctx.rotate(Math.PI / 4)
  ctx.fillStyle = '#a97c3a'; ctx.fillRect(-3.5, -3.5, 7, 7)
  ctx.restore()

  // ── Power-up pills row ───────────────────────────────────────────────────
  const pills  = ['⏳ Slow-Mo', '⭐ ×2 Points', '🛡️ Shield', '🧲 Magnet', '👻 Ghost', '💰 Score Rain']
  const pillW  = 154, pillH2 = 24, pillGap = 10
  const pillY  = ruleY + 14
  const totalPW = pills.length * pillW + (pills.length - 1) * pillGap
  let pX = STAGE_CX - totalPW / 2
  ctx.font = 'bold 11px monospace'
  for (const p of pills) {
    ctx.save()
    ctx.fillStyle   = 'rgba(169,124,58,0.10)'
    ctx.strokeStyle = 'rgba(169,124,58,0.28)'
    ctx.lineWidth   = 0.8
    roundRect(pX, pillY, pillW, pillH2, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle    = 'rgba(242,232,213,0.68)'
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(p, pX + pillW / 2, pillY + pillH2 / 2)
    ctx.restore()
    pX += pillW + pillGap
  }

  // ── Info lines ───────────────────────────────────────────────────────────
  const infoY = pillY + pillH2 + 16
  ;[
    { text: '💣  Dodge bombs — a hit costs one life', color: 'rgba(192,90,60,0.80)' },
    { text: '⚡  Catch 10 in a row to unlock a power-up   •   Streak multiplies your points', color: 'rgba(242,232,213,0.45)' },
  ].forEach((l, i) => {
    ctx.save()
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'top'
    ctx.font         = `italic 15px "Cormorant Garamond", serif`
    ctx.fillStyle    = l.color
    ctx.fillText(l.text, STAGE_CX, infoY + i * 22)
    ctx.restore()
  })

  // ── Pulsing CTA button ───────────────────────────────────────────────────
  const pulse = 0.80 + 0.20 * Math.abs(Math.sin(t * 1.9))
  const btnW  = 320, btnH = 54
  const btnX  = STAGE_CX - btnW / 2
  const btnY2 = HEIGHT - 72

  ctx.save()
  ctx.shadowColor = `rgba(169,124,58,${0.55 * pulse})`
  ctx.shadowBlur  = 26 * pulse
  const bG = ctx.createLinearGradient(btnX, btnY2, btnX + btnW, btnY2 + btnH)
  bG.addColorStop(0, '#2a1a0a'); bG.addColorStop(1, '#1a0e06')
  ctx.fillStyle = bG
  roundRect(btnX, btnY2, btnW, btnH, 6); ctx.fill()
  const bBord = ctx.createLinearGradient(btnX, 0, btnX + btnW, 0)
  bBord.addColorStop(0,   'rgba(169,124,58,0.18)')
  bBord.addColorStop(0.5, `rgba(169,124,58,${0.75 * pulse})`)
  bBord.addColorStop(1,   'rgba(169,124,58,0.18)')
  ctx.strokeStyle = bBord; ctx.lineWidth = 1.5
  roundRect(btnX, btnY2, btnW, btnH, 6); ctx.stroke()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.font         = 'bold 15px monospace'
  ctx.fillStyle    = `rgba(242,232,213,${0.72 + 0.28 * pulse})`
  ctx.shadowColor  = 'transparent'
  ctx.fillText('▶   TAP OR CLICK TO PLAY', STAGE_CX, btnY2 + btnH / 2)
  ctx.restore()
}

function drawGameOverScreen () {
  const t = Date.now() / 1000

  // ── Background (mirrors start screen) ────────────────────────────────────
  ctx.drawImage(imgs.bg, 0, 0, WIDTH, HEIGHT)
  const bgOv = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  bgOv.addColorStop(0,    'rgba(8,4,1,0.95)')
  bgOv.addColorStop(0.45, 'rgba(8,4,1,0.82)')
  bgOv.addColorStop(1,    'rgba(8,4,1,0.97)')
  ctx.fillStyle = bgOv
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // ── Ambient glow orbs ────────────────────────────────────────────────────
  ;[
    { x: WIDTH * 0.20, y: HEIGHT * 0.50, r: 280, c: 'rgba(192,90,60,0.14)' },
    { x: WIDTH * 0.80, y: HEIGHT * 0.45, r: 250, c: 'rgba(169,124,58,0.10)' },
  ].forEach(o => {
    const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
    g.addColorStop(0, o.c); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, WIDTH, HEIGHT)
  })

  // ── Drifting background cans (same as start) ─────────────────────────────
  ;[
    { x:  90, bY: 200, ph: 0.0,  img: 'peach',     sz: 52, al: 0.10, rot: -0.18 },
    { x: 215, bY: 490, ph: 1.3,  img: 'raspberry', sz: 40, al: 0.08, rot:  0.22 },
    { x:1080, bY: 215, ph: 0.7,  img: 'raspberry', sz: 52, al: 0.10, rot:  0.15 },
    { x:1165, bY: 465, ph: 2.1,  img: 'peach',     sz: 40, al: 0.08, rot: -0.12 },
    { x: 145, bY: 365, ph: 3.2,  img: 'raspberry', sz: 30, al: 0.06, rot:  0.30 },
    { x:1115, bY: 345, ph: 1.9,  img: 'peach',     sz: 30, al: 0.06, rot: -0.24 },
  ].forEach(c => {
    ctx.save()
    ctx.globalAlpha = c.al
    ctx.translate(c.x, c.bY + Math.sin(t * 0.7 + c.ph) * 16)
    ctx.rotate(c.rot + Math.sin(t * 0.45 + c.ph) * 0.05)
    ctx.drawImage(imgs[c.img], -c.sz / 2, -c.sz, c.sz, c.sz * 2)
    ctx.restore()
  })

  const CX = WIDTH / 2

  // ── GAME OVER title ───────────────────────────────────────────────────────
  const titleY = 38
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 88px "Cormorant Garamond", serif'
  ctx.shadowColor  = '#c05a3c'
  ctx.shadowBlur   = 36
  ctx.fillStyle    = '#f2e8d5'
  ctx.fillText('GAME OVER', CX, titleY)
  // Shimmer
  const shimX = ((t * 0.38) % 1.35 - 0.15) * WIDTH
  const shim  = ctx.createLinearGradient(shimX - 120, 0, shimX + 120, 0)
  shim.addColorStop(0, 'rgba(255,255,255,0)'); shim.addColorStop(0.5, 'rgba(255,255,255,0.18)'); shim.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = shim; ctx.shadowBlur = 0
  ctx.fillText('GAME OVER', CX, titleY)
  ctx.restore()

  // Subtitle score
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'top'
  ctx.font         = 'italic 26px "Cormorant Garamond", serif'
  ctx.fillStyle    = 'rgba(192,90,60,0.90)'
  ctx.fillText(`${score} point${score !== 1 ? 's' : ''} scored`, CX, titleY + 98)
  ctx.restore()

  // ── Brass rule with diamond ───────────────────────────────────────────────
  const ruleY = titleY + 136
  const ruleG = ctx.createLinearGradient(CX - 300, 0, CX + 300, 0)
  ruleG.addColorStop(0,    'rgba(169,124,58,0)')
  ruleG.addColorStop(0.25, 'rgba(169,124,58,0.8)')
  ruleG.addColorStop(0.5,  'rgba(192,90,60,1)')
  ruleG.addColorStop(0.75, 'rgba(169,124,58,0.8)')
  ruleG.addColorStop(1,    'rgba(169,124,58,0)')
  ctx.strokeStyle = ruleG; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(CX - 300, ruleY); ctx.lineTo(CX + 300, ruleY); ctx.stroke()
  ctx.save(); ctx.translate(CX, ruleY); ctx.rotate(Math.PI / 4)
  ctx.fillStyle = '#a97c3a'; ctx.fillRect(-3.5, -3.5, 7, 7)
  ctx.restore()

  // ── Stats grid (3 × 2) ───────────────────────────────────────────────────
  const survived = Math.floor(difficultyTimer / 60)
  const mins     = Math.floor(survived / 60)
  const secs     = survived % 60
  const timeStr  = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  const statItems = [
    { label: 'CANS CAUGHT',   value: totalCaught,                  icon: '🥤' },
    { label: 'BEST STREAK',   value: `×${bestCombo}`,              icon: '🔥' },
    { label: 'GOLDEN CANS',   value: goldenCaught,                 icon: '★'  },
    { label: 'POWER-UPS',     value: powerUpsUsed,                 icon: '⚡' },
    { label: 'BOMBS HIT',     value: bombsHit,                     icon: '💥' },
    { label: 'TIME SURVIVED', value: timeStr,                      icon: '⏱'  },
  ]

  const cellW = 196, cellH = 72, cellGap = 12
  const gridW = 3 * cellW + 2 * cellGap
  const gridX = CX - gridW / 2
  const gridY = ruleY + 16

  statItems.forEach((s, i) => {
    const col  = i % 3
    const row  = Math.floor(i / 3)
    const cx2  = gridX + col * (cellW + cellGap)
    const cy2  = gridY + row * (cellH + cellGap)

    ctx.save()
    // Card bg
    const cg = ctx.createLinearGradient(cx2, cy2, cx2, cy2 + cellH)
    cg.addColorStop(0, 'rgba(42,26,10,0.72)')
    cg.addColorStop(1, 'rgba(20,10,4,0.72)')
    ctx.fillStyle = cg
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12
    roundRect(cx2, cy2, cellW, cellH, 6); ctx.fill()
    ctx.shadowBlur = 0

    // Gold border
    const highlight = (s.label === 'GOLDEN CANS' && goldenCaught > 0) ||
                      (s.label === 'BEST STREAK'  && bestCombo   >= 20)
    ctx.strokeStyle = highlight ? 'rgba(255,215,0,0.55)' : 'rgba(169,124,58,0.30)'
    ctx.lineWidth   = highlight ? 1.5 : 1
    roundRect(cx2, cy2, cellW, cellH, 6); ctx.stroke()

    // Icon
    ctx.font = '20px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255,255,255,0.70)'
    ctx.fillText(s.icon, cx2 + 12, cy2 + 10)

    // Value
    ctx.font      = 'bold 28px "Cormorant Garamond", serif'
    ctx.fillStyle = highlight ? '#ffd700' : '#f2e8d5'
    ctx.textAlign    = 'right'
    ctx.textBaseline = 'top'
    if (highlight) { ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8 }
    ctx.fillText(s.value, cx2 + cellW - 12, cy2 + 8)
    ctx.shadowBlur = 0

    // Label
    ctx.font      = '10px monospace'
    ctx.fillStyle = 'rgba(169,124,58,0.70)'
    ctx.fillText(s.label, cx2 + cellW - 12, cy2 + cellH - 18)
    ctx.restore()
  })

  // ── Reward rows ───────────────────────────────────────────────────────────
  const milestones = [
    { threshold: 1000,  emoji: '🛒', reward: '5% off your next order' },
    { threshold: 2000,  emoji: '⭐', reward: '10% off your next order' },
    { threshold: 10000, emoji: '🎁', reward: '25% off your next order' },
  ]
  const rewardY  = gridY + 2 * (cellH + cellGap) + 14
  const rewardW  = gridW
  const rewardX  = gridX
  const rowH     = 38

  milestones.forEach((m, i) => {
    const ry       = rewardY + i * (rowH + 4)
    const unlocked = score >= m.threshold
    ctx.save()
    ctx.globalAlpha = unlocked ? 1 : 0.32
    if (unlocked) {
      ctx.fillStyle = 'rgba(169,124,58,0.10)'
      roundRect(rewardX, ry, rewardW, rowH, 4); ctx.fill()
      ctx.strokeStyle = 'rgba(169,124,58,0.25)'; ctx.lineWidth = 0.8
      roundRect(rewardX, ry, rewardW, rowH, 4); ctx.stroke()
    }
    const midY = ry + rowH / 2
    ctx.font = '16px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f2e8d5'
    ctx.fillText(unlocked ? '✅' : '○', rewardX + 14, midY)
    ctx.fillText(m.emoji, rewardX + 44, midY)
    ctx.font      = `bold 15px "Cormorant Garamond", serif`
    ctx.fillStyle = '#f2e8d5'
    ctx.fillText(`${m.threshold} pts`, rewardX + 76, midY - 7)
    ctx.font      = 'italic 13px "Cormorant Garamond", serif'
    ctx.fillStyle = unlocked ? '#c05a3c' : 'rgba(242,232,213,0.5)'
    ctx.fillText('→  ' + m.reward, rewardX + 76, midY + 9)
    ctx.restore()
  })

  // ── Pulsing CTA button (matches start screen) ─────────────────────────────
  const pulse  = 0.80 + 0.20 * Math.abs(Math.sin(t * 1.9))
  const btnW   = 320, btnH = 54
  const btnX   = CX - btnW / 2
  const btnY   = HEIGHT - 72

  ctx.save()
  ctx.shadowColor = `rgba(169,124,58,${0.55 * pulse})`
  ctx.shadowBlur  = 26 * pulse
  const bG = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH)
  bG.addColorStop(0, '#2a1a0a'); bG.addColorStop(1, '#1a0e06')
  ctx.fillStyle = bG
  roundRect(btnX, btnY, btnW, btnH, 6); ctx.fill()
  const bBord = ctx.createLinearGradient(btnX, 0, btnX + btnW, 0)
  bBord.addColorStop(0,   'rgba(169,124,58,0.18)')
  bBord.addColorStop(0.5, `rgba(169,124,58,${0.75 * pulse})`)
  bBord.addColorStop(1,   'rgba(169,124,58,0.18)')
  ctx.strokeStyle = bBord; ctx.lineWidth = 1.5
  roundRect(btnX, btnY, btnW, btnH, 6); ctx.stroke()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.font         = 'bold 15px monospace'
  ctx.fillStyle    = `rgba(242,232,213,${0.72 + 0.28 * pulse})`
  ctx.shadowColor  = 'transparent'
  ctx.fillText('▶   PLAY AGAIN', CX, btnY + btnH / 2)
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
    const baseType = c.golden ? 'peach' : c.type
    if (c.caught) {
      const alpha = 1 - c.crushTimer / 30
      ctx.globalAlpha = Math.max(0, alpha)
      const scale = 1 + c.crushTimer / 60
      ctx.translate(c.x + c.w / 2, c.y + c.h / 2)
      ctx.scale(scale, scale)
      ctx.drawImage(imgs[baseType], -c.w / 2, -c.h / 2, c.w, c.h)
    } else if (c.missed) {
      const alpha = c.missTimer < 120 ? 1 : 1 - (c.missTimer - 120) / 60
      ctx.globalAlpha = Math.max(0, alpha)
      ctx.drawImage(imgs[`${baseType}_crushed`], c.x, c.y, c.w, c.h)
    } else {
      if (c.golden) {
        // Animated glow pulse
        const pulse = 12 + 8 * Math.sin(Date.now() / 200)
        ctx.shadowColor = '#ffd700'
        ctx.shadowBlur  = pulse
        ctx.drawImage(imgs.peach, c.x, c.y, c.w, c.h)
        ctx.shadowBlur  = 0
        ctx.shadowColor = 'transparent'
        // Gold tint overlay
        ctx.globalAlpha = 0.28
        ctx.fillStyle   = '#ffd700'
        ctx.fillRect(c.x, c.y, c.w, c.h)
        ctx.globalAlpha = 1
      } else {
        ctx.drawImage(imgs[c.type], c.x, c.y, c.w, c.h)
      }
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
    if (h.delay > 0) continue   // not yet active, skip drawing
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
  const cartBounceY = cartBounceTimer > 0
    ? Math.sin((1 - cartBounceTimer / CART_BOUNCE_FRAMES) * Math.PI) * 7
    : 0
  ctx.save()
  if (cartDir === 1) {
    ctx.translate(cart.x + cart.w / 2, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(imgs.cart, -cart.w / 2, cart.y + cartBounceY, cart.w, cart.h)
  } else {
    ctx.drawImage(imgs.cart, cart.x, cart.y + cartBounceY, cart.w, cart.h)
  }
  ctx.restore()

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
    const ghostExpiring = activePowerUp.framesLeft <= 180
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
    powerUpBanner.framesLeft -= dt
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

  // Power-up pill floats over the game, just below the HUD bar
  if (activePowerUp) {
    const puProg = activePowerUp.framesLeft / activePowerUp.maxFrames
    const pillW  = 260
    const pillH  = 26
    const pillX  = WIDTH / 2 - pillW / 2
    const pillY  = 96

    ctx.save()
    // background track
    ctx.fillStyle = activePowerUp.color + '22'
    roundRect(pillX, pillY, pillW, pillH, 13)
    ctx.fill()
    // progress fill
    ctx.fillStyle = activePowerUp.color + '55'
    roundRect(pillX, pillY, Math.max(pillW * puProg, 26), pillH, 13)
    ctx.fill()
    // border
    ctx.strokeStyle = activePowerUp.color + 'cc'
    ctx.lineWidth   = 1.5
    roundRect(pillX, pillY, pillW, pillH, 13)
    ctx.stroke()
    // label
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.font         = 'bold 13px monospace'
    ctx.fillStyle    = '#fff'
    ctx.shadowColor  = activePowerUp.color
    ctx.shadowBlur   = 10
    ctx.fillText(`${activePowerUp.icon}  ${activePowerUp.label.toUpperCase()}`, WIDTH / 2, pillY + pillH / 2)
    ctx.restore()
  }
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

  // Active power-up pill moved to draw() — rendered below the HUD bar over the game

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

  // ── RIGHT: STREAK ─────────────────────────────────────────────
  const RX = WIDTH - 28

  // Fixed layout (all right-aligned to RX):
  //   y=9       "STREAK" label
  //   y=22–34   pip dots (r=6), right-aligned
  //   y=38      decay bar under pips
  //   combo number + ×N badge sit to the LEFT of the pip block

  const PIP_R   = 6
  const PIP_GAP = 4
  const pipsW   = 10 * (PIP_R * 2 + PIP_GAP) - PIP_GAP  // 136px
  const pipsX   = RX - pipsW
  const pipsY   = 22

  // "STREAK" label
  ctx.save()
  ctx.textAlign    = 'right'
  ctx.textBaseline = 'top'
  ctx.font         = 'bold 10px monospace'
  ctx.fillStyle    = 'rgba(169,124,58,0.85)'
  ctx.fillText('STREAK', RX, 9)
  ctx.restore()

  // Pip dots — power-up progress
  for (let i = 0; i < 10; i++) {
    const filled = i < powerUpProgress
    const pipX   = pipsX + i * (PIP_R * 2 + PIP_GAP) + PIP_R
    ctx.save()
    if (filled) {
      ctx.shadowColor = '#fbbf24'
      ctx.shadowBlur  = 10
      ctx.fillStyle   = powerUpProgress >= 9 ? '#ff4444' : '#fbbf24'
    } else {
      ctx.fillStyle   = 'rgba(255,255,255,0.12)'
    }
    ctx.beginPath()
    ctx.arc(pipX, pipsY + PIP_R, PIP_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Decay bar — directly under pip row
  if (combo > 0) {
    const timeLeft = comboTimer / COMBO_WINDOW
    const tColor   = timeLeft < 0.3 ? '#ef4444' : timeLeft < 0.6 ? '#f97316' : '#a97c3a'
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.09)'
    roundRect(pipsX, 38, pipsW, 4, 2)
    ctx.fill()
    ctx.fillStyle = tColor
    if (timeLeft < 0.3) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8 }
    roundRect(pipsX, 38, Math.max(pipsW * timeLeft, 3), 4, 2)
    ctx.fill()
    ctx.restore()
  }

  // Combo number + ×N badge — to the LEFT of the pip block
  if (combo > 0) {
    const sColor = streakMult >= 4 ? '#ff6b35' : streakMult >= 3 ? '#ff9b35' : streakMult >= 2 ? '#fbbf24' : 'rgba(242,232,213,0.9)'
    const numX   = pipsX - 14

    ctx.save()
    ctx.textAlign    = 'right'
    ctx.textBaseline = 'middle'
    ctx.font         = 'bold 42px monospace'
    ctx.fillStyle    = sColor
    ctx.shadowColor  = sColor
    ctx.shadowBlur   = 14
    ctx.fillText(String(combo), numX, 43)
    ctx.restore()

    if (streakMult > 1) {
      ctx.save()
      ctx.textAlign    = 'right'
      ctx.textBaseline = 'top'
      ctx.font         = 'bold 11px monospace'
      ctx.fillStyle    = sColor
      ctx.shadowColor  = sColor
      ctx.shadowBlur   = 6
      ctx.fillText(`×${streakMult}`, numX, 9)
      ctx.restore()
    }
  }

  // Controls hint
  ctx.save()
  ctx.font         = '12px monospace'
  ctx.fillStyle    = 'rgba(255,255,255,0.25)'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(gyroActive ? 'Tilt to steer' : '← →  or  A / D  to move', WIDTH / 2, HEIGHT - 10)
  ctx.restore()
}

// Returns true if the event coords land inside the CTA button (accounting for canvas scaling)
function isOnCtaButton (e) {
  const canvas = canvasRef.value
  const rect   = canvas.getBoundingClientRect()
  const scaleX = WIDTH  / rect.width
  const scaleY = HEIGHT / rect.height
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const cx = (clientX - rect.left) * scaleX
  const cy = (clientY - rect.top)  * scaleY
  const btnW = 320, btnH = 54
  const btnX = WIDTH / 2 - btnW / 2
  const btnY = HEIGHT - 72
  return cx >= btnX && cx <= btnX + btnW && cy >= btnY && cy <= btnY + btnH
}

// ── Touch input ─────────────────────────────────────────────────────────────
function getTouchCanvasX (touch) {
  const rect   = canvasRef.value.getBoundingClientRect()
  return (touch.clientX - rect.left) * (WIDTH / rect.width)
}

function getTouchCanvasY (touch) {
  const rect   = canvasRef.value.getBoundingClientRect()
  return (touch.clientY - rect.top) * (HEIGHT / rect.height)
}

function isOnCart (cx) {
  // generous hit-target: full cart width + 32 px padding each side
  return cx >= cart.x - 32 && cx <= cart.x + cart.w + 32
}

function onTouchStart (e) {
  e.preventDefault()
  if (gameState === 'start' || gameState === 'gameover') {
    if (isOnCtaButton(e)) beginPlaying()
    return
  }
  if (gameState !== 'playing') return

  for (const touch of e.changedTouches) {
    const cx = getTouchCanvasX(touch)
    if (isOnCart(cx)) {
      // Cart drag
      dragActive = true
      dragLastX  = cx
    } else {
      // Side-press steering
      if (cx < WIDTH / 2) touchLeft  = true
      else                touchRight = true
    }
  }
}

function onTouchMove (e) {
  e.preventDefault()
  if (gameState !== 'playing') return
  if (!dragActive) return
  const touch = e.touches[0]
  if (!touch) return
  const newX  = getTouchCanvasX(touch)
  const delta = newX - dragLastX
  dragLastX   = newX
  cart.x = Math.max(0, Math.min(WIDTH - cart.w, cart.x + delta))
}

function onTouchEnd (e) {
  e.preventDefault()
  if (gameState !== 'playing') return
  // Release drag
  if (e.touches.length === 0) {
    dragActive = false
    touchLeft  = false
    touchRight = false
    return
  }
  // Recalculate side-press state from remaining touches
  touchLeft  = false
  touchRight = false
  for (const touch of e.touches) {
    const cx = getTouchCanvasX(touch)
    if (!isOnCart(cx)) {
      if (cx < WIDTH / 2) touchLeft  = true
      else                touchRight = true
    }
  }
  // If the dragging finger lifted and another finger remains, switch to side-press
  if (dragActive && e.touches.length > 0) {
    dragActive = false
  }
}

// ── Keyboard input ────────────────────────────────────────────────────────────
function onKeyDown (e) {
  if (gameState === 'start') { beginPlaying(); return }
  if (gameState === 'gameover') return  // no accidental restart before reading score
  if (e.key === 'ArrowLeft'  || e.key === 'a') keys.left  = true
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true
}
function onKeyUp (e) {
  if (e.key === 'ArrowLeft'  || e.key === 'a') keys.left  = false
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false
}
function onClick (e) {
  if (gameState === 'start' || gameState === 'gameover') {
    if (isOnCtaButton(e)) beginPlaying()
  }
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
  window.removeEventListener('resize',             checkOrientation)
  window.removeEventListener('orientationchange',  checkOrientation)
  window.removeEventListener('deviceorientation',  onDeviceOrientation)
  unlockScroll()
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

/* Active play mode — cover the full viewport above everything */
.game-wrapper.game-active {
  position: fixed;
  inset: 0;
  z-index: 8000;
  background: #1a0e06;
  padding: 0;
  margin: 0;
  width: 100vw;
  height: 100dvh;
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

/* Canvas frame — sizes to the canvas so children can be positioned relative to it */
.canvas-frame {
  position: relative;
  display: inline-block;
  line-height: 0; /* collapse whitespace gap below canvas */
  width: min(1280px, 100vw, calc((100vh - 80px) * 1.7778));
}

/* Canvas scales down proportionally to fit both viewport width & height */
.game-canvas {
  display: block;
  width: 100%;
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

/* Restart button */
.restart-btn {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 30;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 14, 6, 0.72);
  border: 1px solid rgba(169, 124, 58, 0.4);
  border-radius: 50%;
  color: rgba(242, 232, 213, 0.85);
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.2s, border-color 0.2s;
  padding: 0;
}
.restart-btn:hover {
  background: rgba(42, 26, 12, 0.9);
  border-color: rgba(169, 124, 58, 0.7);
}
.restart-btn svg {
  width: 18px;
  height: 18px;
  pointer-events: none;
}

/* Mute button */
.mute-btn {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 30;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 14, 6, 0.72);
  border: 1px solid rgba(169, 124, 58, 0.4);
  border-radius: 50%;
  color: rgba(242, 232, 213, 0.85);
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: background 0.2s, border-color 0.2s;
  padding: 0;
}
.mute-btn:hover {
  background: rgba(42, 26, 12, 0.9);
  border-color: rgba(169, 124, 58, 0.7);
}
.mute-btn svg {
  width: 18px;
  height: 18px;
  pointer-events: none;
}

/* Mobile landscape — fill the full screen */
@media (max-width: 900px) and (orientation: landscape) {
  .game-wrapper {
    padding: 0;
    margin-top: 0;
  }
  .canvas-frame {
    width: min(100vw, calc(100dvh * 1.7778));
  }
  .game-canvas {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
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
.touch-btn--right { right: 12px; }
.touch-btn svg {
  width: 38px;
  height: 38px;
  pointer-events: none;
}

.portrait-fade-enter-active,
.portrait-fade-leave-active { transition: opacity 0.3s ease; }
.portrait-fade-enter-from,
.portrait-fade-leave-to     { opacity: 0; }
</style>
