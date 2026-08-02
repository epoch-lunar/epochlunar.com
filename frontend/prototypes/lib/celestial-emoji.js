/**
 * celestial-emoji.js — drop-in Earth-rotation and lunar-phase glyph helpers.
 *
 * Load once per page, then use the custom elements anywhere:
 *
 *   <script type="module" src="./lib/celestial-emoji.js"></script>
 *
 *   <spinning-earth></spinning-earth>
 *   <spinning-earth period="8000" direction="reverse"></spinning-earth>
 *
 *   <lunar-phase></lunar-phase>            <!-- real current phase, refreshes hourly -->
 *   <lunar-phase phase="full"></lunar-phase>
 *   <lunar-phase phase="0.5"></lunar-phase>
 *   <lunar-phase refresh-ms="60000"></lunar-phase>
 *
 * The elements are unstyled and inherit font-size / color from their parent,
 * so you can drop them into any container — e.g. give the surrounding element
 * `position: absolute; font-size: 1.25rem;` and it Just Works.
 *
 * Imperative API (for bespoke wiring):
 *
 *   import {
 *     spinEarthInto, trackLunarPhaseInto,
 *     currentMoonPhase, moonPhaseEmoji,
 *     EARTH_FACES, MOON_PHASES,
 *   } from "./lib/celestial-emoji.js";
 *
 *   const stop = spinEarthInto(document.querySelector("#globe"), { period: 4000 });
 *   // ... later: stop();
 */

// ─── Glyph tables ────────────────────────────────────────────────────────────

/**
 * Earth globe glyphs in east→west order (W→E rotation as seen by a fixed
 * observer above the north pole): Europe-Africa → Asia-Australia → Americas.
 */
export const EARTH_FACES = Object.freeze([
  "\u{1F30D}", // 🌍 Europe-Africa
  "\u{1F30F}", // 🌏 Asia-Australia
  "\u{1F30E}", // 🌎 Americas
]);

/** Eight lunar phase glyphs from new (0.0) through waning crescent (0.875). */
export const MOON_PHASES = Object.freeze([
  "\u{1F311}", // 🌑 new
  "\u{1F312}", // 🌒 waxing crescent
  "\u{1F313}", // 🌓 first quarter
  "\u{1F314}", // 🌔 waxing gibbous
  "\u{1F315}", // 🌕 full
  "\u{1F316}", // 🌖 waning gibbous
  "\u{1F317}", // 🌗 last quarter
  "\u{1F318}", // 🌘 waning crescent
]);

/** Named phase shortcuts accepted by `<lunar-phase phase="...">`. */
const PHASE_NAMES = Object.freeze({
  "new":              0 / 8,
  "waxing-crescent":  1 / 8,
  "first-quarter":    2 / 8,
  "waxing-gibbous":   3 / 8,
  "full":             4 / 8,
  "waning-gibbous":   5 / 8,
  "last-quarter":     6 / 8,
  "waning-crescent":  7 / 8,
});

const SYNODIC_MONTH_DAYS = 29.530588853;
// Reference new moon: 2000-01-06 18:14 UTC (commonly cited epoch).
const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** Fraction 0..1 of the synodic month at `date`. 0 = new, 0.5 = full. */
export function currentMoonPhase(date = new Date()) {
  const elapsedDays = (date.getTime() - REF_NEW_MOON_MS) / 86_400_000;
  return ((elapsedDays / SYNODIC_MONTH_DAYS) % 1 + 1) % 1;
}

/** Glyph closest to `phase` (default = current real moon phase). */
export function moonPhaseEmoji(phase = currentMoonPhase()) {
  const idx = Math.floor(phase * MOON_PHASES.length + 0.5) % MOON_PHASES.length;
  return MOON_PHASES[idx];
}

// ─── Imperative wiring ───────────────────────────────────────────────────────

/**
 * Cycle Earth glyphs into `el` to suggest rotation.
 * Returns a cleanup function that stops the timer.
 *
 * @param {HTMLElement} el
 * @param {{ period?: number, direction?: "forward" | "reverse" }} [opts]
 *   period:    ms per face (default 4000 → 12 s per full rotation)
 *   direction: "forward" mimics W→E rotation; "reverse" inverts the order.
 */
export function spinEarthInto(el, { period = 4000, direction = "forward" } = {}) {
  const order = direction === "reverse" ? [...EARTH_FACES].reverse() : EARTH_FACES;
  let i = 0;
  const tick = () => {
    el.textContent = order[i];
    i = (i + 1) % order.length;
  };
  tick();
  const handle = setInterval(tick, period);
  return () => clearInterval(handle);
}

/**
 * Track lunar phase by writing the right glyph into `el`. With no `phase`
 * option the element follows the real current phase and refreshes every
 * `refreshMs`. With `phase` set (number 0..1 or named string) the element is
 * static and no timer is installed.
 *
 * Returns a cleanup function.
 *
 * @param {HTMLElement} el
 * @param {{ phase?: number | keyof typeof PHASE_NAMES, refreshMs?: number }} [opts]
 */
export function trackLunarPhaseInto(el, { phase, refreshMs = 60 * 60 * 1000 } = {}) {
  const resolvePhase = () => {
    if (typeof phase === "number") return phase;
    if (typeof phase === "string" && phase in PHASE_NAMES) return PHASE_NAMES[phase];
    return currentMoonPhase();
  };
  const update = () => { el.textContent = moonPhaseEmoji(resolvePhase()); };
  update();
  // Static override → no need to poll
  if (phase !== undefined) return () => {};
  const handle = setInterval(update, refreshMs);
  return () => clearInterval(handle);
}

// ─── Custom elements ─────────────────────────────────────────────────────────

class SpinningEarth extends HTMLElement {
  connectedCallback() {
    const period = Number(this.getAttribute("period")) || 4000;
    const direction = this.getAttribute("direction") === "reverse" ? "reverse" : "forward";
    this._cleanup = spinEarthInto(this, { period, direction });
  }
  disconnectedCallback() {
    this._cleanup?.();
    this._cleanup = null;
  }
}

class LunarPhase extends HTMLElement {
  connectedCallback() {
    const refreshAttr = this.getAttribute("refresh-ms");
    const refreshMs = refreshAttr !== null ? Number(refreshAttr) : 60 * 60 * 1000;
    const phaseAttr = this.getAttribute("phase");
    let phase;
    if (phaseAttr === null || phaseAttr === "auto" || phaseAttr === "") {
      phase = undefined;
    } else if (!Number.isNaN(Number(phaseAttr))) {
      phase = Number(phaseAttr);
    } else {
      phase = phaseAttr; // named, e.g. "full"
    }
    this._cleanup = trackLunarPhaseInto(this, { phase, refreshMs });
  }
  disconnectedCallback() {
    this._cleanup?.();
    this._cleanup = null;
  }
}

// Idempotent registration so the script can be loaded more than once safely.
if (!customElements.get("spinning-earth")) {
  customElements.define("spinning-earth", SpinningEarth);
}
if (!customElements.get("lunar-phase")) {
  customElements.define("lunar-phase", LunarPhase);
}
