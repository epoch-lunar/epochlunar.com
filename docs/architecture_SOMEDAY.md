# EPOCH System Architecture

This document explains how the EPOCH lunar timekeeping site works, written for developers familiar with Python and Rust but not necessarily JavaScript or web development.

## Overview

EPOCH is hosted on **Cloudflare Pages** and uses **Cloudflare Workers** for backend logic. The architecture has three main parts:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Browser                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   index.html                            │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │  styles.css │  │  script.js  │  │   Cloudflare    │  │    │
│  │  │  (styling)  │  │ (frontend   │  │    Worker       │  │    │
│  │  │             │  │  logic)     │  │  (Rust/WASM)    │◄─│────│─── Fetch time data
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
        │                                       │
        │ HTTPS (static files)                  │ HTTPS (API calls)
        ▼                                       ▼
┌───────────────────────┐     ┌─────────────────────────────────────┐
│   Cloudflare Pages    │     │         Cloudflare Edge             │
│   (static hosting)    │     │  ┌───────────────────────────────┐  │
│                       │     │  │      epoch-worker             │  │
│   Serves:             │     │  │  Rust code → WASM             │  │
│   - index.html        │     │  │  Endpoint: /api/time          │  │
│   - styles.css        │     │  └───────────────────────────────┘  │
│   - script.js         │     └─────────────────────────────────────┘
└───────────────────────┘
```

**Cloudflare Pages** serves the static files (HTML, CSS, JS). **Cloudflare Workers** handles the API endpoint for computing time scales. Both run on Cloudflare's edge network, so the site loads fast worldwide.

## The Three Main Files

### 1. `index.html` — The Page Structure

Think of this like a Jinja2 template in Python, but static. It defines the structure of the page:

```html
<!doctype html>
<html lang="en">
    <head>
        <!-- Meta tags, fonts, CSS links -->
    </head>
    <body>
        <!-- Page content goes here -->
        <div class="clock-housing">
            <!-- Time displays, buttons, etc. -->
        </div>
        <script src="script.js"></script>
    </body>
</html>
```

The `index.html` doesn't contain any logic — it's just the skeleton. Elements have `id` attributes so JavaScript can find and manipulate them.

**For Python developers**: This is like the HTML skeleton that Jinja2 would normally inject content into, except here JavaScript handles the dynamic updates instead of Python on the server.

### 2. `styles.css` — Visual Styling

Controls the look of everything. Uses CSS variables for colors, Flexbox for layout, etc. Similar to how you might separate styling from logic in any well-structured application.

### 3. `script.js` — The Frontend Logic

This is where most of the user-facing logic lives. In Python terms, it's like the "controller" that:

- Fetches time data from the backend
- Computes derived time scales (TAI, TCB, TCL, etc.)
- Updates the DOM elements
- Handles user interactions (clicking time scale buttons)

## The Backend: Cloudflare Worker (Rust)

The `backend/` directory contains a Cloudflare Worker written in Rust. This is different from a traditional backend server:

| Traditional Server | Cloudflare Worker |
|-------------------|-------------------|
| Runs on your own machines or a VPS | Runs on Cloudflare's edge servers |
| Always on, handles many requests | Serverless: runs only when called |
| Can run any code | Runs in a constrained WASM environment |

### How It Works

1. **You (the browser) call** `https://epoch-worker.workers.dev/api/time`
2. **Cloudflare routes** your request to the nearest edge server
3. **The Rust/WASM code runs**, computes the time scales
4. **JSON response** is returned to your browser

### The Rust Code (`backend/src/lib.rs`)

This is the main entry point:

```rust
#[event(fetch)]
pub async fn main(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    // Handle CORS preflight requests
    if req.method() == Method::Options {
        // ...
    }
    
    // Only accept GET requests to /api/time
    if path != "/api/time" {
        return Response::error("Not Found", 404);
    }
    
    // Get current time from the JS runtime
    let server_ms = js_sys::Date::now();
    
    // Compute time scales using hifitime crate
    let tai_ms = /* TAI computation */;
    let tdb_ms = /* TDB computation */;
    let gps_week = /* GPS week number */;
    let tcl_drift = /* lunar clock drift */;
    
    // Return JSON response
    Ok(Response::ok(body)?)
}
```

### Key Dependencies

- **`worker`**: The Cloudflare Workers runtime for Rust. Provides `Request`, `Response`, `Headers`, etc.
- **`js-sys`**: Rust bindings to JavaScript built-ins like `Date`.
- **`hifitime`**: A timekeeping library (similar to Python's `astropy.time` or Rust's `time` crate) that handles time scale conversions correctly.

## Time Scales Explained

The site displays several time scales. Here's what they mean:

### Atomic Time Scales (Earth-based)

| Scale | Full Name | What it is |
|-------|-----------|------------|
| UTC | Coordinated Universal Time | The time your computer shows. Has leap seconds. |
| TAI | International Atomic Time | Uniform atomic time, no leap seconds. UTC + 37s (as of 2026). |
| GPS | GPS Time | Used by GPS satellites. TAI - 19s. |

### Relativistic Time Scales

These exist because gravity and velocity affect time (as predicted by Einstein's relativity):

| Scale | Full Name | Notes |
|-------|-----------|-------|
| TCB | Barycentric Coordinate Time | Time at the solar system barycenter. Runs fast relative to Earth. |
| TCG | Geocentric Coordinate Time | Time at Earth's center of mass. |
| TCL | Lunar Coordinate Time | Time on the Moon's surface. Uses a simplified Keplerian model. |

### The Delta Display

The "TIME DIFFERENCE" section shows the difference between the selected coordinate time (TCB/TCG/TCL) and atomic time (UTC/TAI/GPS/UNIX). This demonstrates how relativity affects timekeeping at different locations.

## Data Flow

```
Browser loads page
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│ script.js: render() runs continuously (~60fps)          │
│                                                         │
│   Every 30 seconds:                                      │
│   ┌──────────────────────────────────────────────┐     │
│   │ syncWorker()                                 │     │
│   │   ↓                                          │     │
│   │   fetch('/api/time')                         │     │
│   │   ↓                                          │     │
│   │   {server_ms, tai_ms, gps_week, tcl_drift}  │     │
│   └──────────────────────────────────────────────┘     │
│                                                         │
│   Every frame:                                           │
│   ┌──────────────────────────────────────────────┐     │
│   │ 1. Get corrected UTC from Worker             │     │
│   │ 2. Compute TAI, TT, TCB, TCG, TCL            │     │
│   │ 3. Update DOM elements with new values        │     │
│   │ 4. Update sparkline graph                     │     │
│   └──────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## The Holdover Feature

The "SIMULATE HOLDOVER" button demonstrates what happens when a lunar asset loses contact with Earth time references:

1. **Normal mode**: Browser syncs with Worker every 30 seconds, correcting for clock drift
2. **Holdover mode**: Sync stops, and the browser's local clock is used directly. The sparkline shows how much the local clock drifts over time.

This is analogous to an oscillator in a GPS-disconnected device — it keeps ticking but accumulates error.

## Deployment

The site is deployed via **Cloudflare Pages** connected to this GitHub repository:

1. **Cloudflare Pages** monitors the `main` branch for changes
2. On push, Pages builds and deploys the static files automatically
3. The **Cloudflare Worker** is deployed separately via `wrangler deploy`

```
GitHub (main branch)
        │
        │ push
        ▼
Cloudflare Pages
  - Builds static site
  - Deploys to: epochlunar.com
        │
        ▼
Cloudflare Workers
  - Deployed via: cd backend && npx wrangler deploy
  - Endpoint: epoch-worker.workers.dev/api/time
```

## Directory Structure

```
epoch-lunar.github.io/
├── frontend/           # Site files (served by Cloudflare Pages)
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── backend/            # Cloudflare Worker (Rust/WASM)
│   ├── Cargo.toml      # Rust dependencies
│   ├── wrangler.toml   # Cloudflare Worker config
│   ├── package.json    # Node.js dependencies (wrangler CLI)
│   ├── src/
│   │   └── lib.rs      # Main Rust source code
│   └── tests/          # Unit tests
├── .github/workflows/  # CI/CD
├── docs/               # Documentation
└── .gitignore
```

## Key Technologies

### For the Frontend
- **Vanilla JavaScript**: No framework (React, Vue, etc.) — keeps it simple
- **CSS Variables**: For theming, like CSS custom properties
- **requestAnimationFrame**: For smooth 60fps rendering loop
- **fetch API**: For making HTTP requests to the Worker

### For the Backend
- **Rust**: Chosen for precision and safety
- **wasm-bindgen**: Allows Rust to interface with JavaScript
- **hifitime**: Handles time scale conversions correctly
- **Cloudflare Workers**: Serverless edge hosting for the API
- **Cloudflare Pages**: Static site hosting

## How to Run Locally

### Frontend Only
Just open `index.html` in a browser. It will work, but without Worker sync (you'll see "WORKER UNREACHABLE").

### With Worker
```bash
cd backend
npm install          # Install wrangler
npx wrangler dev    # Start local Worker on port 8787
```

Then visit `http://localhost:8787` — the frontend will connect to the local Worker.

## Key Concepts for Python/Rust Developers

| Concept | Python Equivalent | Rust/Web Equivalent |
|---------|------------------|---------------------|
| DOM element | Template rendering | `document.getElementById()` + direct manipulation |
| Continuous loop | `while True: time.sleep()` | `requestAnimationFrame()` |
| HTTP server | Flask/FastAPI `@app.route` | Cloudflare Worker `#[event(fetch)]` |
| Time handling | `datetime`, `astropy.time` | `hifitime` crate |
| Package manager | pip | Cargo (Rust) + npm (Node) |

## Further Reading

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [wasm-bindgen Book](https://rustwasm.github.io/docs/wasm-bindgen/)
- [hifitime on GitHub](https://github.com/aldebaran/hifitime)
- [TCL Paper (Ashby & Patla)](https://arxiv.org/abs/2402.11150)
