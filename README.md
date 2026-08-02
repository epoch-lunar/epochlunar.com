# epochlunar.com

The website for **Epoch** — open-source precision timing infrastructure for lunar and cislunar missions, developed under the [Open Lunar Foundation](https://openlunar.org).

Static HTML and CSS. No build step, no framework, no backend.

## Pages

| Page | Purpose |
|------|---------|
| `frontend/index.html` | Landing page — what the Space Time Card is, spec numbers, adoption modes, whitepaper download, Substack signup |
| `frontend/technology.html` | Architecture, oscillator trade space, flight heritage |

Shared design system in `frontend/ds.css` — the EPOCH VFD screen mode, ported from the project's design system. `docs/brand.md` is the source of truth for colour and type.

## Prototypes

`frontend/prototypes/` holds design spikes and experiments — VFD meters, CRT phosphor, instrument panels, and the multi-timescale clock that was this site's homepage until August 2026. They ship with the site but nothing links to them from the main pages.

The clock and its time scale engine (`frontend/script.js`, `frontend/time-scales.js`, `frontend/styles.css`) are documented in [`frontend/prototypes/README.md`](frontend/prototypes/README.md), including the TAI/UTC/GPS/TCG/TCB/TCL derivations and the IAU references behind them.

## Running locally

The site is static files. No build step, no toolchain.

```bash
cd frontend
python -m http.server 8080
```

Then open `http://localhost:8080`. Serve over HTTP rather than opening `file://` URLs — `script.js` is an ES module and the clock prototype won't load otherwise.

## Deploying

GitHub Pages, published by `.github/workflows/deploy-pages.yml` on every push to `main` that touches `frontend/`.

The site lives in a subdirectory, and Pages' built-in "deploy from branch" only supports the repo root or `/docs` — hence the workflow, which uploads `frontend/` as the Pages artifact.

**Repo settings → Pages → Source must be set to "GitHub Actions".** Without it the workflow runs and then fails at the deploy step.

### Custom domain

`frontend/CNAME` claims `epochlunar.com`. DNS must point at GitHub:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `epoch-lunar.github.io` |

If DNS stays on Cloudflare, set these records to **DNS only** (grey cloud, not proxied). GitHub cannot complete its ACME challenge through Cloudflare's proxy, so "Enforce HTTPS" will stay greyed out until the cert issues.

`frontend/.nojekyll` disables Jekyll processing. Without it Pages silently drops any path beginning with an underscore.

### History

Until 2026-08 the site was served by a Cloudflare Worker with assets (root `wrangler.toml`), alongside a Rust API Worker in `backend/` that exposed `/api/time`, plus GitHub Actions for both. All of that was removed: the landing and technology pages make no API calls, and static hosting needs none of it.

The clock prototype still calls the old `epoch-worker` endpoint for its NETWORK TIME panel. That worker is no longer built or deployed from this repo; if it is torn down, the panel degrades to OFFLINE and nothing else is affected.
