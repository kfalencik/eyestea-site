/**
 * Firebase integration for Eyes Tea — Catch & Collect leaderboard.
 *
 * ── How to configure ────────────────────────────────────────────────────────
 * 1. Go to https://console.firebase.google.com → your project → Project settings → Your apps
 * 2. Copy the firebaseConfig object and paste it into FIREBASE_CONFIG below.
 * 3. In the Firebase console enable Firestore (or Realtime Database).
 *    Collection name used: "leaderboard"
 * ────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps } from 'firebase/app'
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore'

// ── PASTE YOUR FIREBASE CONFIG HERE ──────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCWyriyKTiMq7JAs4UyBjaDPLJlT1chLfQ",
  authDomain: "eyestea-game.firebaseapp.com",
  projectId: "eyestea-game",
  storageBucket: "eyestea-game.firebasestorage.app",
  messagingSenderId: "915248577622",
  appId: "1:915248577622:web:5f0ef45a69ee0011f20ff7",
  measurementId: "G-8D1L52GSZ6"
};

// ─────────────────────────────────────────────────────────────────────────────

let _app = null
let _db  = null

function getDb () {
  if (!_db) {
    _app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG)
    _db  = getFirestore(_app)
  }
  return _db
}

/**
 * Save a completed game run to the "leaderboard" collection.
 *
 * @param {string} playerName   — display name (1–10 chars, already sanitised)
 * @param {object} stats        — all tracked game stats
 * @returns {Promise<string>}   — the new Firestore document ID
 */
export async function saveScore (playerName, stats) {
  const db = getDb()
  const doc = await addDoc(collection(db, 'leaderboard'), {
    name:          playerName.trim().slice(0, 10),
    score:         stats.score,
    totalCaught:   stats.totalCaught,
    goldenCaught:  stats.goldenCaught,
    bestCombo:     stats.bestCombo,
    bombsHit:      stats.bombsHit,
    powerUpsUsed:  stats.powerUpsUsed,
    timeSurvived:  stats.timeSurvived,   // seconds
    earnedDiscount:stats.earnedDiscount, // 0 | 5 | 10 | 25
    // ── analytics ─────────────────────────────────────────
    device:        typeof navigator !== 'undefined' ? (
                     /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
                   ) : 'unknown',
    platform:      typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    lang:          typeof navigator !== 'undefined' ? navigator.language : 'unknown',
    screenW:       typeof screen    !== 'undefined' ? screen.width  : 0,
    screenH:       typeof screen    !== 'undefined' ? screen.height : 0,
    createdAt:     serverTimestamp(),
  })
  return doc.id
}

/**
 * Fetch the top N scores from the leaderboard.
 *
 * @param {number} n  — how many results to return (default 10)
 * @returns {Promise<Array>}
 */
export async function getTopScores (n = 10) {
  const db = getDb()
  const q  = query(
    collection(db, 'leaderboard'),
    orderBy('score', 'desc'),
    limit(n)
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}
