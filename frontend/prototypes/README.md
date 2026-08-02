# Design prototypes (non-production)

Static HTML/CSS/JS spikes under `frontend/prototypes/` — **not** served by the main site (only `frontend/` app assets are deployed).

| Prototype | Intent |
|-----------|--------|
| [index.html](./index.html) | Hub page linking all prototypes |
| [logo-mark1.svg](./logo-mark1.svg) | EPOCH **O** mark: cream + eclipse disk (Inkscape source) |
| [logo-mark1-crescent.svg](./logo-mark1-crescent.svg) | Same mark, **crescent-only** fill (favicon / small glyph) |
| [vfd-column-meter.html](./vfd-column-meter.html) | Segmented bar columns + grid + panel zone (`ecosystem.md` / `brand.md`) |
| [crt-oscilloscope.html](./crt-oscilloscope.html) | P31-style green phosphor CRT face: graticule, glowing trace, persistence + noise sliders |
| [indicator-lights.html](./indicator-lights.html) | 12×8 lamps + **Sync OK** (green); LOCKED / HOLDOVER / FAULT / OFFLINE — click to toggle |
| [dashboard-knobs-buttons.html](./dashboard-knobs-buttons.html) | Car cluster: knobs, rockers, **8-position ivory DIP** (white paddle), push buttons |
| [segments-odometer.html](./segments-odometer.html) | **DSEG7** / **DSEG14** (jsDelivr `dseg@0.46.0` woff2), ghost “8” stack |
| [mfd-a10c-demo.html](./mfd-a10c-demo.html) | **MFD-style**: green phosphor grid, side **OSB** strips, labels on screen (A-10C–inspired) |
| [dash-lunar-sync.html](./dash-lunar-sync.html) | **dash iter 0** — position uncertainty for a lunar reference clock, growing per `Δt ≈ σ · τ` using the picked oscillator's fractional frequency stability. Class list spans the lab/atomic line (H-maser → TCXO) plus everyday & historical clocks (Apollo Guidance Computer, iPhone TCXO, Big Ben, quartz wristwatch, Omega Speedmaster, microwave RC clock). **PING EARTH** simulates the 2.564 s Moon–Earth–Moon light-delay round-trip. Edge copy lives in hover tooltips. Earth (rotating 🌍🌏🌎) and Moon (real lunar phase) glyphs come from [`lib/celestial-emoji.js`](#shared-utilities). |
| [../color-palette.html](../color-palette.html) | Full design system swatches, fonts, logo treatments |

## Shared utilities

Reusable bits live under `lib/` so any prototype can drop them in.

| Module | Drop-in usage |
|--------|---------------|
| [`lib/celestial-emoji.js`](./lib/celestial-emoji.js) | Load once: `<script type="module" src="./lib/celestial-emoji.js"></script>`. Then use `<spinning-earth></spinning-earth>` (cycles 🌍🌏🌎; `period="ms"`, `direction="reverse"`) and `<lunar-phase></lunar-phase>` (real current phase 🌑→🌘; or `phase="full"` / `phase="0.5"` for static, `refresh-ms="ms"` to override hourly poll). Also exports `currentMoonPhase()`, `moonPhaseEmoji()`, `spinEarthInto(el)`, `trackLunarPhaseInto(el)` for imperative use. |

Open [index.html](./index.html) in a browser or run `python -m http.server` from `frontend/prototypes/` and use `http://localhost:8000/…` (not `file://`). Some editor/embedded browsers and extensions throw harmless `postMessage` / `invalid or illegal string` console errors on `file:` URLs.
