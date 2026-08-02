import {
  GPS_OFFSET,
  taiFromUtc,
  ttFromTai,
  tcgFromTT,
  tcbFromTT,
  tclFromTT,
  gpsFromTai,
  unixFromUtc,
  formatSeconds,
  formatDelta,
} from "./time-scales.js";

// NOTE (2026-08-02): the Rust API worker was removed from this repo along with
// all wrangler configs and CI workflows — the site is now static files on
// Cloudflare Pages. These endpoints are external and no longer built or
// deployed from here. If the worker is torn down in the Cloudflare dashboard,
// the NETWORK TIME panel on the clock prototype degrades to OFFLINE /
// "WORKER UNREACHABLE", which is handled below. Nothing else on the site
// depends on it: index.html and technology.html make no API calls.
const PRODUCTION_WORKER_TIME_URL =
  "https://epoch-worker.philiplinden.workers.dev/api/time";
const STAGING_WORKER_TIME_URL =
  "https://epoch-worker-staging.philiplinden.workers.dev/api/time";
const LOCAL_WORKER_TIME_URL = "http://localhost:8787/api/time";

function workerTimeUrlForPage() {
  if (typeof location === "undefined") {
    return PRODUCTION_WORKER_TIME_URL;
  }
  const h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1") {
    return LOCAL_WORKER_TIME_URL;
  }
  if (
    /^epochlunar-com-staging\./.test(h) ||
    h === "staging.epochlunar.com"
  ) {
    return STAGING_WORKER_TIME_URL;
  }
  return PRODUCTION_WORKER_TIME_URL;
}

const WORKER_URL = workerTimeUrlForPage();

// Magic numbers
const MAX_HISTORY_POINTS = 60;
const SYNC_INTERVAL_MS = 30000;
const HOLDOVER_SAMPLE_INTERVAL_MS = 500;
const MS_TO_KM = 300; // 1 ms = 300 km at c

// State
const ATOMIC_KEYS = ["utc", "tai", "gps", "unix"];
const COORD_KEYS = ["tcb", "tcg", "tcl"];

let currentAtomicScale = localStorage.getItem("atomicScale") || "utc";
let currentCoordScale = localStorage.getItem("coordScale") || "tcl";

let workerSync = null; // { serverMs, offsetMs, rttMs, scales, syncedAt }
let driftHistory = []; // [{t, offset_ms}]
let holdoverActive = false;
let lastHoldoverSample = 0;
let workerSyncInterval = null;

// Scale colors
const SCALE_COLORS = {
  tcb: "#ffaa00",
  tcg: "#33ff66",
  tcl: "#00ddff",
  tai: "#33ff66",
  utc: "#cc66ff",
  gps: "#ff1a1a",
  unix: "#cccccc",
};

const SCALE_INFO = {
  tcb: "Barycentric Coordinate Time",
  tcg: "Geocentric Coordinate Time",
  tcl: "Lunar Coordinate Time",
  tai: "International Atomic Time",
  utc: "Coordinated Universal Time",
  gps: "GPS Time",
  unix: "UNIX / POSIX",
};

// DOM helper
function el(id) {
  return document.getElementById(id);
}

// ============================
// Scale control
// ============================

export function setAtomicFmt(i) {
  currentAtomicScale = ATOMIC_KEYS[i];
  localStorage.setItem("atomicScale", currentAtomicScale);

  document.querySelectorAll("#atomic-selector .scale-btn").forEach((btn, idx) => {
    btn.classList.toggle("on", idx === i);
  });
  document.querySelectorAll("#atomic-selector .scale-led").forEach((led, idx) => {
    led.classList.toggle("active", idx === i);
  });
}

export function setCoordFmt(i) {
  currentCoordScale = COORD_KEYS[i];
  localStorage.setItem("coordScale", currentCoordScale);

  document.querySelectorAll("#coord-selector .scale-btn").forEach((btn, idx) => {
    btn.classList.toggle("on", idx === i);
  });
  document.querySelectorAll("#coord-selector .scale-led").forEach((led, idx) => {
    led.classList.toggle("active", idx === i);
  });
}

export function toggleHoldover() {
  holdoverActive = !holdoverActive;
  const btn = el("holdover-btn");

  if (holdoverActive) {
    clearInterval(workerSyncInterval);
    workerSyncInterval = null;
    if (btn) {
      btn.textContent = "ACQUIRE LOCK";
      btn.classList.add("active");
    }
    setWorkerStatus("holdover");
    lastHoldoverSample = 0;
  } else {
    if (btn) {
      btn.textContent = "SIMULATE HOLDOVER";
      btn.classList.remove("active");
    }
    driftHistory = [];
    syncWorker();
    workerSyncInterval = setInterval(syncWorker, SYNC_INTERVAL_MS);
  }
}

// ============================
// Worker sync
// ============================

async function syncWorker() {
  const indEl = el("ind-worker");
  const metaEl = el("worker-meta");

  if (indEl) indEl.className = "indicator querying";
  if (metaEl) metaEl.textContent = "SYNCING...";

  try {
    const t0 = performance.now();
    const t0w = Date.now();

    const res = await fetch(WORKER_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();

    const rttMs = performance.now() - t0;
    const serverMs = j.server_ms;
    const offsetMs = t0w + rttMs / 2 - serverMs;

    workerSync = {
      serverMs,
      offsetMs,
      rttMs,
      scales: {
        tcl_drift_us: j.tcl_drift_us,
        tai_ms: j.tai_ms,
        gps_week: j.gps_week,
        gps_tow_s: j.gps_tow_s,
        tdb_ms: j.tdb_ms,
      },
      syncedAt: Date.now(),
    };

    driftHistory.push({ t: Date.now(), offset_ms: offsetMs });
    if (driftHistory.length > MAX_HISTORY_POINTS) driftHistory.shift();

    setWorkerStatus("locked");
    drawSparkline();
  } catch (e) {
    console.warn("Worker sync failed:", e);
    setWorkerStatus("fault");
    if (metaEl) metaEl.textContent = "WORKER UNREACHABLE";
  }
}

function setWorkerStatus(state) {
  const indEl = el("ind-worker");
  const slEl = el("sl-worker");

  const states = {
    locked: {
      ind: "indicator active",
      sl: "status-light lit-green",
      label: "LOCKED",
    },
    holdover: {
      ind: "indicator active warning",
      sl: "status-light lit-amber",
      label: "HOLDOVER",
    },
    fault: {
      ind: "indicator active error",
      sl: "status-light lit-red",
      label: "FAULT",
    },
    off: {
      ind: "indicator",
      sl: "status-light",
      label: "OFFLINE",
    },
  };

  const s = states[state] || states.off;
  if (indEl) indEl.className = s.ind;
  if (slEl) {
    slEl.className = s.sl;
    slEl.textContent = s.label;
  }
}

// ============================
// Worker diagnostic display
// ============================

function updateWorkerDiagnostic() {
  const offEl = el("off-worker");
  const kmEl = el("off-worker-km");
  const metaEl = el("worker-meta");

  if (!workerSync) return;

  const now = Date.now();
  const elapsed_s = (now - workerSync.syncedAt) / 1000;

  if (holdoverActive) {
    const drift_ms = now - (workerSync.serverMs + (now - workerSync.syncedAt));
    const abs_ms = Math.abs(drift_ms);
    const km = Math.round(abs_ms * MS_TO_KM);

    if (offEl) {
      const sign = drift_ms >= 0 ? "+" : "";
      offEl.textContent = `${sign}${drift_ms.toFixed(2)}ms`;
      offEl.className =
        "source-offset " +
        (abs_ms >= 1000 ? "error" : abs_ms >= 250 ? "warning" : "ok");
    }
    if (kmEl) kmEl.textContent = `≈ ${km.toLocaleString()} km`;
    if (metaEl) {
      metaEl.textContent = `NO EPOCH SYNC • DEAD RECKONING • ${elapsed_s.toFixed(0)}s`;
    }

    if (now - lastHoldoverSample > HOLDOVER_SAMPLE_INTERVAL_MS) {
      driftHistory.push({ t: now, offset_ms: drift_ms });
      if (driftHistory.length > MAX_HISTORY_POINTS) driftHistory.shift();
      lastHoldoverSample = now;
      drawSparkline();
    }
  } else {
    const drift_ms = workerSync.offsetMs;
    const abs_ms = Math.abs(drift_ms);

    if (offEl) {
      const sign = drift_ms >= 0 ? "+" : "";
      offEl.textContent = `${sign}${drift_ms.toFixed(2)}ms`;
      offEl.className =
        "source-offset " +
        (abs_ms >= 1000 ? "error" : abs_ms >= 250 ? "warning" : "ok");
    }
    if (kmEl) kmEl.textContent = "";
    if (metaEl) {
      metaEl.textContent = `EPOCH WORKER • ${workerSync.rttMs.toFixed(0)}ms RTT • ${elapsed_s.toFixed(0)}s ago`;
    }
  }
}

// ============================
// Sparkline
// ============================

function drawSparkline() {
  const svg = el("sparkline");
  if (!svg || driftHistory.length < 2) return;

  const W = 300,
    H = 48,
    pad = 4;
  const offsets = driftHistory.map((p) => p.offset_ms);
  const minV = Math.min(0, ...offsets);
  const maxV = Math.max(0, ...offsets);
  const range = maxV - minV || 0.001;

  function scaleY(v) {
    return H - pad - ((v - minV) / range) * (H - 2 * pad);
  }

  const n = offsets.length;
  const pts = offsets
    .map((v, i) => `${(i / (n - 1)) * W},${scaleY(v).toFixed(1)}`)
    .join(" ");
  const zeroY = scaleY(0).toFixed(1);

  const maxAbs = Math.max(...offsets.map(Math.abs));
  const color =
    maxAbs >= 1000
      ? "var(--red)"
      : maxAbs >= 250
        ? "var(--amber)"
        : "var(--green)";

  const lastX = W;
  const lastY = scaleY(offsets[n - 1]).toFixed(1);

  svg.innerHTML =
    `<line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="#222" stroke-width="1"/>` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.85"/>` +
    `<circle cx="${lastX}" cy="${lastY}" r="2.5" fill="${color}" opacity="0.9"/>`;
}

// ============================
// Render loop
// ============================

function render() {
  const utc = workerSync ? Date.now() - workerSync.offsetMs : Date.now();
  const tai = taiFromUtc(utc);
  const tt = ttFromTai(tai);

  const tcg = tcgFromTT(tt);
  const tcb = tcbFromTT(tt);
  const tcl = tclFromTT(tt);

  const gps = gpsFromTai(tai);
  const unix = unixFromUtc(utc);

  // Atomic clock
  const tvalAtomic = el("tval-atomic");
  const snameAtomic = el("sname-atomic");

  if (tvalAtomic) {
    const sc = SCALE_COLORS[currentAtomicScale];
    tvalAtomic.style.color = sc;
    tvalAtomic.style.textShadow = `0 0 8px ${sc},0 0 20px ${sc}40`;

    let displayValue;
    switch (currentAtomicScale) {
      case "tai":
        displayValue = formatISO(tai);
        snameAtomic.textContent = SCALE_INFO.tai;
        break;
      case "utc":
        displayValue = formatISO(utc);
        snameAtomic.textContent = SCALE_INFO.utc;
        break;
      case "gps":
        displayValue = `W${gps.week} ${gps.sec}s`;
        snameAtomic.textContent = SCALE_INFO.gps;
        break;
      case "unix":
        displayValue = unix;
        snameAtomic.textContent = SCALE_INFO.unix;
        break;
    }
    tvalAtomic.textContent = displayValue;
    snameAtomic.style.color = sc;
  }

  // Coordinate clock
  const tvalCoord = el("tval-coord");
  const snameCoord = el("sname-coord");

  if (tvalCoord) {
    const sc = SCALE_COLORS[currentCoordScale];
    tvalCoord.style.color = sc;
    tvalCoord.style.textShadow = `0 0 8px ${sc},0 0 20px ${sc}40`;

    let displayValue;
    switch (currentCoordScale) {
      case "tcb":
        displayValue = formatSeconds(tcb / 1000) + " s";
        snameCoord.textContent = SCALE_INFO.tcb;
        break;
      case "tcg":
        displayValue = formatSeconds(tcg / 1000) + " s";
        snameCoord.textContent = SCALE_INFO.tcg;
        break;
      case "tcl":
        displayValue = formatSeconds(tcl / 1000) + " s";
        snameCoord.textContent = SCALE_INFO.tcl;
        break;
    }
    tvalCoord.textContent = displayValue;
    snameCoord.style.color = sc;

    const citationEl = el("scale-citation-coord");
    if (citationEl) {
      if (currentCoordScale === "tcl") {
        citationEl.innerHTML =
          'Ashby & Patla (2024) — <a href="https://arxiv.org/abs/2402.11150" target="_blank" rel="noopener" style="color: #666;">arXiv:2402.11150</a>';
      } else {
        citationEl.textContent = "";
      }
    }
  }

  // Delta display
  const deltaEl = el("delta-val");
  if (deltaEl) {
    let coordTime, atomicTime;
    switch (currentCoordScale) {
      case "tcb":
        coordTime = tcb;
        break;
      case "tcg":
        coordTime = tcg;
        break;
      case "tcl":
        coordTime = tcl;
        break;
    }
    switch (currentAtomicScale) {
      case "tai":
        atomicTime = tai;
        break;
      case "utc":
        atomicTime = utc;
        break;
      case "gps":
        atomicTime = tai - GPS_OFFSET * 1000;
        break;
      case "unix":
        atomicTime = unix * 1000;
        break;
    }
    const delta = (coordTime - atomicTime) / 1000;
    deltaEl.textContent = formatDelta(delta);
  }

  updateWorkerDiagnostic();
  requestAnimationFrame(render);
}

function formatISO(ms) {
  const d = new Date(ms);
  return d.toISOString().replace("T", " ").slice(0, 23);
}

// ============================
// Init
// ============================

function initSelectorUI() {
  const atomicIdx = ATOMIC_KEYS.indexOf(currentAtomicScale);
  document.querySelectorAll("#atomic-selector .scale-btn").forEach((btn, idx) => {
    btn.classList.toggle("on", idx === atomicIdx);
  });
  document.querySelectorAll("#atomic-selector .scale-led").forEach((led, idx) => {
    led.classList.toggle("active", idx === atomicIdx);
  });

  const coordIdx = COORD_KEYS.indexOf(currentCoordScale);
  document.querySelectorAll("#coord-selector .scale-btn").forEach((btn, idx) => {
    btn.classList.toggle("on", idx === coordIdx);
  });
  document.querySelectorAll("#coord-selector .scale-led").forEach((led, idx) => {
    led.classList.toggle("active", idx === coordIdx);
  });
}

function initEventListeners() {
  document.querySelectorAll("#atomic-selector .scale-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.i, 10);
      setAtomicFmt(i);
    });
  });

  document.querySelectorAll("#coord-selector .scale-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.i, 10);
      setCoordFmt(i);
    });
  });

  const holdoverBtn = el("holdover-btn");
  if (holdoverBtn) {
    holdoverBtn.addEventListener("click", toggleHoldover);
  }
}

window.addEventListener("load", () => {
  console.log("Epoch clock initialized");

  initSelectorUI();
  initEventListeners();
  render();

  syncWorker();
  workerSyncInterval = setInterval(syncWorker, SYNC_INTERVAL_MS);
});
