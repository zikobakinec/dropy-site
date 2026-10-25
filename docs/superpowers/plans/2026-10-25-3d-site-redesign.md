# dropy.az 3D Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dropy.az landing page (`/`) and the support page (`/destek/`) as a modern, animated 3D site. Everything that already works must keep working: the SEO pages, the twice-daily refresh, `/yukle` and GitHub Pages.

**Architecture:**
- `web/` is a Vite + React + TypeScript project. Its build writes `index.html`, `destek/index.html` and `assets/web/*` into the repo root, which GitHub Pages serves as it does today.
- The pages are hand-written static HTML: all text, CTAs and links are present before any JS runs. React mounts only one "island": a lazy-loaded, fixed, full-screen React Three Fiber canvas, driven by GSAP ScrollTrigger.
- `seo/generate.mjs` renders three marked blocks into the landing page: SEO, deals and stores. It caches them in `seo/landing.json`. `seo/apply-landing.mjs` re-applies them after every build.

**Tech Stack:** Vite 5, React 18, TypeScript 5, three, @react-three/fiber 8, gsap 3 (ScrollTrigger), vitest 2, @fontsource-variable (Fraunces, Manrope), Node `node:test` for `seo/`.

**Spec:** `docs/superpowers/specs/2026-10-25-3d-site-redesign-design.md`

## Global Constraints

- Brand tokens, exactly: primary `#f2643d`, accent `#146b68`, background `#fbf7f0`, foreground `#14213d`, muted `#ede5d8`, border `#e8dfd1`, muted-foreground `#5c6479`.
- Fonts: Fraunces (headings) and Manrope (body), self-hosted through @fontsource-variable. There are no Google Fonts requests.
- Copy rules:
  - The app name is always written "Dropy.az", never bare "Dropy".
  - No user, store or campaign counts. No bragging.
  - No "Bakı" in marketing copy.
  - New copy is shown to the user and approved before merge (Task 6).
- Store links:
  - App Store: `https://apps.apple.com/app/id6819821532`
  - Google Play: `https://play.google.com/store/apps/details?id=az.endirim.aqreqatoru`
- Contacts: `support@dropy.az`; WhatsApp `+994 99 815 15 20` → `https://wa.me/994998151520`.
- Footer line: `© 2026 «OMNİ GATE» MMC · VÖEN 3105969611 · Dropy.az`. The legal link is `https://legal.dropy.az`.
- Untouched: `/endirimler/`, `/magaza/`, `/magazalar/`, `/kampaniya/`, `assets/seo.css`, `/yukle/`, `CNAME`, `robots.txt`, `sitemap.xml`, and `.github/workflows/seo.yml`. The workflow only gets the extra blocks through `generate.mjs`.
- `/destek/` keeps its URL, because App Store Connect uses it as the support URL.
- Performance targets (Lighthouse mobile): Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95.
- The 3D is decorative: `aria-hidden="true"`, and the canvas has no pointer events.
- Respect `prefers-reduced-motion`: show no 3D and no scroll animation.
- Exact dependency versions, pinned with no `^`: `react@18.3.1`, `react-dom@18.3.1`, `three@0.169.0`, `@react-three/fiber@8.17.10`, `gsap@3.12.5`, `@fontsource-variable/fraunces@5.1.0`, `@fontsource-variable/manrope@5.1.0`.
- Exact dev dependency versions: `vite@5.4.10`, `@vitejs/plugin-react@4.3.3`, `typescript@5.6.3`, `vitest@2.1.4`, `@types/react@18.3.12`, `@types/react-dom@18.3.1`, `@types/three@0.169.0`, `@types/node@22.9.0`.

## File Structure

```
seo/generate.mjs           (modify) + landingDeals, dealsBlock, storesBlock, injectBetween, applyLanding; main writes seo/landing.json
seo/apply-landing.mjs      (create) re-applies seo/landing.json to /index.html after a vite build
seo/generate.test.mjs      (modify) tests for the above
seo/landing.json           (generated, committed) cached SEO/deals/stores blocks
web/package.json           (create)
web/tsconfig.json          (create)
web/vite.config.ts         (create) multi-page build into the repo root, assets/web, publicDir off
web/index.html             (create) landing markup with seo/deals/stores markers
web/destek/index.html      (create) support page markup
web/src/ui/tokens.css      (create) brand tokens + fonts — shared with the phase-2 panel
web/src/ui/tokens.ts       (create) the same colors for three.js materials
web/src/styles/site.css    (create) layout and components for both pages
web/src/main.ts            (create) landing entry: tier detection, tilt, reveals, lazy 3D
web/src/destek.ts          (create) support entry: styles and reveals
web/src/tilt.ts            (create) pointer tilt for .deal-card
web/src/scroll.ts          (create) GSAP: initReveals(), trackProgress()
web/src/scene/tier.ts      (create) detectTier, readEnv, OBJECTS
web/src/scene/tier.test.ts (create)
web/src/scene/layout.ts    (create) makeSlots, formation, targetAt (pure)
web/src/scene/layout.test.ts (create)
web/src/scene/geometry.ts  (create) tag / percent / bag meshes, label texture
web/src/scene/Scene.tsx    (create) R3F canvas + floaters
web/src/scene/mount.tsx    (create) createRoot + progress wiring (lazy chunk)
build/                     (delete) old Sleek export pipeline
README.md                  (modify)
```

---

### Task 1: Landing blocks in the SEO generator

**Files:**
- Modify: `seo/generate.mjs`
  - Add the new exports after `injectLanding` (around line 535).
  - In `main()`, replace the single `writeFileSync(indexFile, injectLanding(...))` line, near line 601.
- Create: `seo/apply-landing.mjs`
- Test: `seo/generate.test.mjs`

**Interfaces:**
- Consumes the existing code in `generate.mjs`:
  - `spreadByStore(items)`, `isHttpUrl(u)`, `esc(s)`, `badge(c)`, `campaignPath(c)`, `urlSlug(slug)`;
  - `landingBlock(categories, stores, total)`, `injectLanding(html, block)`;
  - `buildSite(rows)`, which returns `{ pages, categories, stores, campaigns, updated }`. In it, `stores` is `[{ slug, name, items }]` and each item has `.stores.logo_url`.
- Produces:
  - `export const LANDING_DEALS = 8`
  - `export function landingDeals(campaigns): Campaign[]`
  - `export function dealsBlock(items): string`: inner HTML only, without markers.
  - `export function storesBlock(stores): string`: inner HTML only.
  - `export function injectBetween(html, start, end, inner): string`
  - `export function applyLanding(html, { seo, deals, stores }): string`
  - Marker constants `DEALS_START`, `DEALS_END`, `STORES_START`, `STORES_END`.
  - The file `seo/landing.json`, shaped `{ "seo": string, "deals": string, "stores": string }`.

- [ ] **Step 1: Write the failing tests.** Append to `seo/generate.test.mjs`, and extend its import line with `landingDeals, dealsBlock, storesBlock, injectBetween, applyLanding, LANDING_DEALS, DEALS_START, DEALS_END, STORES_START, STORES_END`:

```js
test("landingDeals keeps only deals with a real image, spread by store, at most LANDING_DEALS", () => {
  const rows = [row(1, "era", 50), row(2, "era", 40), row(3, "bravo", 30), { ...row(4, "oba", 20), image_url: null }];
  for (let i = 10; i < 30; i++) rows.push(row(i, `s${i}`, 10));
  const out = landingDeals(rows);
  assert.equal(out.length, LANDING_DEALS);
  assert.ok(out.every((c) => c.image_url.startsWith("https://")));
  assert.notEqual(out[0].stores.slug, out[1].stores.slug);
});

test("dealsBlock links each card to its campaign page and escapes text", () => {
  const deal = { ...row(7, "era", 30), id: "abcdef12-0000", title: `Ütü <b>"Pro"</b>` };
  const html = dealsBlock([deal]);
  assert.ok(html.includes(`href="${campaignPath(deal)}"`));
  assert.match(html, /Ütü &lt;b&gt;&quot;Pro&quot;&lt;\/b&gt;/);
  assert.match(html, /class="deal-card"/);
  assert.match(html, />-30%</);
});

test("storesBlock shows a logo or the store's initials, and links to the store page", () => {
  const html = storesBlock([
    { slug: "era-seed", name: "ERA", items: [{ stores: { logo_url: "https://era.az/l.png" } }] },
    { slug: "bravo-seed", name: "Bravo Market", items: [{ stores: { logo_url: null } }] },
  ]);
  assert.match(html, /href="\/magaza\/era\/"[\s\S]*src="https:\/\/era.az\/l.png"/);
  assert.match(html, /href="\/magaza\/bravo\/"[\s\S]*>BM</);
});

test("injectBetween replaces only the content between markers, and is a no-op without them", () => {
  const html = `a ${DEALS_START}old${DEALS_END} b`;
  assert.equal(injectBetween(html, DEALS_START, DEALS_END, "new"), `a ${DEALS_START}new${DEALS_END} b`);
  assert.equal(injectBetween("plain", DEALS_START, DEALS_END, "new"), "plain");
});

test("applyLanding fills the seo, deals and stores blocks", () => {
  const html = `<main>${DEALS_START}${DEALS_END}${STORES_START}${STORES_END}</main><!-- seo:start --><!-- seo:end --><footer></footer>`;
  const out = applyLanding(html, { seo: "<!-- seo:start -->S<!-- seo:end -->", deals: "D", stores: "T" });
  assert.match(out, /deals:start -->D<!-- deals:end/);
  assert.match(out, /stores:start -->T<!-- stores:end/);
  assert.match(out, /seo:start -->S<!-- seo:end/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**

Run: `node --test seo/generate.test.mjs`
Expected: FAIL with `SyntaxError: The requested module './generate.mjs' does not provide an export named 'landingDeals'`.

- [ ] **Step 3: Implement.** Add this to `seo/generate.mjs`, directly after the `injectLanding` function:

```js
// ---------- landing deals + stores blocks (redesigned landing, 2026-10-25) ----------

export const LANDING_DEALS = 8;
export const DEALS_START = "<!-- deals:start -->";
export const DEALS_END = "<!-- deals:end -->";
export const STORES_START = "<!-- stores:start -->";
export const STORES_END = "<!-- stores:end -->";

/** The landing's "Bu günün endirimləri": real photos only, one store at a time. */
export function landingDeals(campaigns) {
  return spreadByStore(campaigns.filter((c) => isHttpUrl(c.image_url))).slice(0, LANDING_DEALS);
}

export function dealsBlock(items) {
  return items
    .map((c) => {
      const href = esc(campaignPath(c));
      return `
          <a class="deal-card" href="${href}">
            <span class="deal-img"><img src="${esc(c.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" /><span class="deal-badge">${esc(badge(c))}</span></span>
            <span class="deal-store">${esc(c.stores?.name ?? "")}</span>
            <span class="deal-title">${esc(c.title)}</span>
          </a>`;
    })
    .join("");
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function storesBlock(stores) {
  return stores
    .map((s) => {
      const logo = s.items.find((c) => isHttpUrl(c.stores?.logo_url))?.stores.logo_url;
      const mark = logo
        ? `<img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
        : `<span class="store-initials">${esc(initials(s.name))}</span>`;
      return `
          <a class="store-chip" href="/magaza/${esc(urlSlug(s.slug))}/">${mark}<span>${esc(s.name)}</span></a>`;
    })
    .join("");
}

export function injectBetween(html, start, end, inner) {
  const i = html.indexOf(start);
  const j = html.indexOf(end, i + start.length);
  if (i === -1 || j === -1) return html;
  return html.slice(0, i + start.length) + inner + html.slice(j);
}

/** Applies the cached seo/landing.json blocks (also used after each vite build). */
export function applyLanding(html, { seo, deals, stores }) {
  let out = injectLanding(html, seo);
  out = injectBetween(out, DEALS_START, DEALS_END, deals);
  out = injectBetween(out, STORES_START, STORES_END, stores);
  return out;
}
```

Then in `main()`, replace

```js
  const indexFile = join(ROOT, "index.html");
  writeFileSync(indexFile, injectLanding(readFileSync(indexFile, "utf8"), landingBlock(categories, stores, categories.reduce((n, c) => n + c.items.length, 0))));
```

with

```js
  const landing = {
    seo: landingBlock(categories, stores, categories.reduce((n, c) => n + c.items.length, 0)),
    deals: dealsBlock(landingDeals(campaigns)),
    stores: storesBlock(stores),
  };
  writeFileSync(join(ROOT, "seo", "landing.json"), JSON.stringify(landing, null, 2) + "\n");
  const indexFile = join(ROOT, "index.html");
  writeFileSync(indexFile, applyLanding(readFileSync(indexFile, "utf8"), landing));
```

Create `seo/apply-landing.mjs`:

```js
// Re-applies the landing blocks cached by generate.mjs (seo/landing.json) to
// /index.html. Run after every `vite build` in web/, which rewrites index.html
// from web/index.html with empty markers.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyLanding } from "./generate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheFile = join(ROOT, "seo", "landing.json");
if (!existsSync(cacheFile)) {
  console.error("seo/landing.json missing — run `node seo/generate.mjs` once first");
  process.exit(1);
}
const indexFile = join(ROOT, "index.html");
writeFileSync(indexFile, applyLanding(readFileSync(indexFile, "utf8"), JSON.parse(readFileSync(cacheFile, "utf8"))));
console.log("landing blocks applied");
```

- [ ] **Step 4: Run the tests and confirm they pass.**

Run: `node --test seo/generate.test.mjs`
Expected: all tests pass, old and new.

- [ ] **Step 5: Generate the first cache against the live feed.**

Run: `node seo/generate.mjs && node -e "const l=require('./seo/landing.json');console.log(Object.keys(l), l.deals.length>500, l.stores.length>500)"`
Expected: `[ 'seo', 'deals', 'stores' ] true true`. The old `index.html` has no deals or stores markers yet, so only its seo block changes.

- [ ] **Step 6: Commit.**

```bash
git add seo/generate.mjs seo/apply-landing.mjs seo/generate.test.mjs seo/landing.json index.html
git commit -m "seo: render landing deals + stores blocks, cache them in seo/landing.json"
```

---

### Task 2: `web/` scaffold, tokens, static pages, and building into the root

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`
- Create: `web/index.html`, `web/destek/index.html`
- Create: `web/src/ui/tokens.css`, `web/src/ui/tokens.ts`, `web/src/styles/site.css`
- Create: `web/src/main.ts`, `web/src/destek.ts` (minimal for now, filled in by later tasks)
- Modify: `.gitignore`

**Interfaces:**
- Consumes `seo/apply-landing.mjs` from Task 1.
- Produces:
  - DOM ids `#top` (hero), `#how` (steps), `#deals`, `#stores`, `#sellers`, `#get`, `#scene` (empty fixed container for the canvas) and `.scene-fallback` (CSS illustration).
  - The class `.reveal` on animated blocks.
  - `export const COLORS` in `web/src/ui/tokens.ts`.
  - The npm scripts `dev`, `build`, `test` in `web/`.

- [ ] **Step 1: Create `web/package.json`.**

```json
{
  "name": "dropy-site-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "clean": "node -e \"require('fs').rmSync('../assets/web',{recursive:true,force:true})\"",
    "build": "npm run clean && tsc --noEmit && vite build && node ../seo/apply-landing.mjs",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource-variable/fraunces": "5.1.0",
    "@fontsource-variable/manrope": "5.1.0",
    "@react-three/fiber": "8.17.10",
    "gsap": "3.12.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "three": "0.169.0"
  },
  "devDependencies": {
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@types/node": "22.9.0",
    "@types/three": "0.169.0",
    "@vitejs/plugin-react": "4.3.3",
    "typescript": "5.6.3",
    "vite": "5.4.10",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json` and `web/vite.config.ts`.**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Builds straight into the repo root, which GitHub Pages serves. Never
// empties it: the SEO pages, /yukle and assets/seo.css live there too.
export default defineConfig({
  root: __dirname,
  base: "/",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, ".."),
    emptyOutDir: false,
    assetsDir: "assets/web",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        destek: resolve(__dirname, "destek/index.html"),
      },
    },
  },
});
```

- [ ] **Step 3: Create the tokens, shared with the phase-2 panel.**

`web/src/ui/tokens.css`:

```css
@import "@fontsource-variable/fraunces";
@import "@fontsource-variable/manrope";

:root {
  --primary: #f2643d;
  --primary-foreground: #ffffff;
  --accent: #146b68;
  --background: #fbf7f0;
  --foreground: #14213d;
  --muted: #ede5d8;
  --muted-foreground: #5c6479;
  --border: #e8dfd1;
  --font-heading: "Fraunces Variable", Georgia, serif;
  --font-sans: "Manrope Variable", -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  --radius: 18px;
  --shadow: 0 18px 40px -18px rgba(20, 33, 61, 0.35);
}
```

`web/src/ui/tokens.ts`:

```ts
// Same values as tokens.css, for three.js materials.
export const COLORS = {
  primary: "#f2643d",
  accent: "#146b68",
  background: "#fbf7f0",
  foreground: "#14213d",
  muted: "#ede5d8",
  paper: "#e9dcc6",
} as const;
```

- [ ] **Step 4: Create `web/src/styles/site.css`.**

```css
@import "../ui/tokens.css";

*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--background); color: var(--foreground); font-family: var(--font-sans); line-height: 1.55; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
img { max-width: 100%; display: block; }
a { color: inherit; }
h1, h2, h3 { font-family: var(--font-heading); line-height: 1.1; margin: 0; letter-spacing: -0.01em; }
.wrap { position: relative; z-index: 1; max-width: 72rem; margin: 0 auto; padding: 0 1rem; }
.skip { position: absolute; left: -999px; } .skip:focus { left: 1rem; top: 1rem; z-index: 10; background: #fff; padding: .5rem 1rem; }

/* 3D canvas: fixed behind everything, decorative */
#scene { position: fixed; inset: 0; z-index: 0; pointer-events: none; transition: opacity .4s; }
.scene-fallback { position: absolute; right: 4%; top: 18%; width: min(46vw, 520px); aspect-ratio: 1; pointer-events: none; z-index: 0; display: none; }
html[data-tier="none"] .scene-fallback { display: block; }
.scene-fallback i { position: absolute; display: grid; place-items: center; font: 800 1.4rem var(--font-sans); color: #fff; background: var(--primary); border-radius: 14px 40px 40px 14px; width: 9rem; height: 5rem; box-shadow: var(--shadow); }
.scene-fallback i:nth-child(1) { left: 8%; top: 10%; transform: rotate(-14deg); }
.scene-fallback i:nth-child(2) { left: 46%; top: 38%; transform: rotate(9deg); background: var(--accent); }
.scene-fallback i:nth-child(3) { left: 14%; top: 64%; transform: rotate(-4deg); }
.scene-fallback b { position: absolute; right: 6%; top: 4%; font: 800 7rem var(--font-heading); color: var(--primary); transform: rotate(12deg); }

/* header */
.top { position: sticky; top: 0; z-index: 5; backdrop-filter: blur(12px); background: color-mix(in srgb, var(--background) 78%, transparent); border-bottom: 1px solid var(--border); }
.top .wrap { display: flex; align-items: center; justify-content: space-between; height: 4rem; }
.brand { display: flex; align-items: center; gap: .5rem; font: 800 1.2rem var(--font-heading); text-decoration: none; }
.brand img { width: 2rem; height: 2rem; border-radius: 9px; }
.nav { display: flex; gap: 1.25rem; align-items: center; font-weight: 600; font-size: .95rem; }
.nav a { text-decoration: none; }
.nav .hide-sm { display: none; }
@media (min-width: 720px) { .nav .hide-sm { display: inline; } }

/* buttons */
.btn { display: inline-flex; align-items: center; gap: .6rem; padding: .85rem 1.3rem; border-radius: 999px; font-weight: 700; text-decoration: none; transition: transform .2s, box-shadow .2s; }
.btn:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.btn-dark { background: var(--foreground); color: #fff; }
.btn-primary { background: var(--primary); color: var(--primary-foreground); }
.btn-ghost { border: 1.5px solid var(--foreground); }
.btn svg { width: 1.4rem; height: 1.4rem; flex: none; }
.btn small { display: block; font-size: .7rem; font-weight: 600; opacity: .8; line-height: 1; }
.btn span { line-height: 1.1; }
.stores { display: flex; flex-wrap: wrap; gap: .75rem; }

/* sections */
section { position: relative; padding: 5rem 0; }
.eyebrow { display: inline-block; font-weight: 700; font-size: .85rem; color: var(--accent); background: #fff; border: 1px solid var(--border); padding: .35rem .8rem; border-radius: 999px; margin-bottom: 1.25rem; }
.lead { font-size: 1.1rem; color: var(--muted-foreground); max-width: 36rem; }
.h2 { font-size: clamp(1.9rem, 4vw, 2.8rem); margin-bottom: .75rem; }

.hero { min-height: calc(100svh - 4rem); display: flex; align-items: center; padding: 3rem 0 5rem; }
.hero h1 { font-size: clamp(2.6rem, 7vw, 5rem); max-width: 14ch; margin-bottom: 1.25rem; }
.hero h1 em { font-style: normal; color: var(--primary); }
.hero .lead { margin-bottom: 2rem; }
.hero .note { margin-top: 1rem; font-size: .9rem; color: var(--muted-foreground); }

.steps { display: grid; gap: 0; }
.step { min-height: 70vh; display: flex; flex-direction: column; justify-content: center; max-width: 30rem; }
.step .num { font: 800 1rem var(--font-sans); color: #fff; background: var(--primary); width: 2.4rem; height: 2.4rem; border-radius: 50%; display: grid; place-items: center; margin-bottom: 1rem; }
.step h3 { font-size: clamp(1.6rem, 3vw, 2.2rem); margin-bottom: .5rem; }
.step p { color: var(--muted-foreground); font-size: 1.05rem; }

.panel { background: color-mix(in srgb, #fff 82%, transparent); backdrop-filter: blur(8px); border: 1px solid var(--border); border-radius: calc(var(--radius) + 8px); padding: 2.5rem 1.5rem; }
@media (min-width: 720px) { .panel { padding: 3rem; } }
.head-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 1rem; margin-bottom: 2rem; }
.more { font-weight: 700; color: var(--primary); text-decoration: none; }

.deals-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
@media (min-width: 900px) { .deals-grid { grid-template-columns: repeat(4, 1fr); } }
.deal-card { display: flex; flex-direction: column; gap: .35rem; text-decoration: none; background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: .6rem .6rem 1rem; transition: transform .25s ease, box-shadow .25s; will-change: transform; }
.deal-card:hover { box-shadow: var(--shadow); }
.deal-img { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: var(--muted); }
.deal-img img { width: 100%; height: 100%; object-fit: cover; }
.deal-badge { position: absolute; left: .5rem; top: .5rem; background: var(--primary); color: #fff; font-weight: 800; font-size: .85rem; padding: .2rem .55rem; border-radius: 999px; }
.deal-store { font-size: .78rem; font-weight: 700; color: var(--accent); padding: 0 .3rem; }
.deal-title { font-weight: 600; font-size: .92rem; padding: 0 .3rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.marquee { overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
.marquee-track { display: flex; gap: .75rem; width: max-content; animation: marquee 60s linear infinite; }
.marquee:hover .marquee-track { animation-play-state: paused; }
@keyframes marquee { to { transform: translateX(-50%); } }
.store-chip { display: inline-flex; align-items: center; gap: .6rem; padding: .5rem 1rem .5rem .5rem; background: #fff; border: 1px solid var(--border); border-radius: 999px; text-decoration: none; font-weight: 600; white-space: nowrap; }
.store-chip img, .store-initials { width: 2.2rem; height: 2.2rem; border-radius: 50%; object-fit: contain; background: var(--muted); }
.store-initials { display: grid; place-items: center; font-size: .8rem; font-weight: 800; color: var(--accent); }

.sellers { display: grid; gap: 2rem; align-items: center; }
@media (min-width: 900px) { .sellers { grid-template-columns: 1.2fr 1fr; } }
.contact-list { display: grid; gap: .75rem; }

.cta { text-align: center; }
.cta .stores { justify-content: center; margin-top: 1.5rem; }

footer { position: relative; z-index: 1; border-top: 1px solid var(--border); padding: 2rem 0 3rem; font-size: .9rem; color: var(--muted-foreground); }
footer .wrap { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; }
footer nav { display: flex; gap: 1.25rem; }

/* support page */
.faq { display: grid; gap: 1rem; }
.faq details { background: #fff; border: 1px solid var(--border); border-radius: var(--radius); padding: 1.1rem 1.3rem; }
.faq summary { cursor: pointer; font-weight: 700; font-size: 1.05rem; }
.faq p { color: var(--muted-foreground); margin: .75rem 0 0; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .marquee-track { animation: none; flex-wrap: wrap; width: auto; }
  .btn, .deal-card { transition: none; }
}
```

- [ ] **Step 5: Create `web/index.html`.** All copy here is a draft for the Task 6 review.

```html
<!doctype html>
<html lang="az">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dropy.az — Azərbaycandakı bütün endirimlər bir tətbiqdə</title>
    <meta name="description" content="Dropy.az mağazaların öz saytlarındakı aktual endirim və kampaniyaları bir tətbiqdə toplayır. Pulsuz." />
    <link rel="canonical" href="https://dropy.az/" />
    <link rel="icon" href="/assets/icon.png" />
    <meta name="theme-color" content="#fbf7f0" />
    <meta name="apple-itunes-app" content="app-id=6819821532" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Dropy.az — Azərbaycandakı bütün endirimlər bir tətbiqdə" />
    <meta property="og:description" content="Mağazaların aktual endirim və kampaniyaları bir tətbiqdə." />
    <meta property="og:url" content="https://dropy.az/" />
    <meta property="og:image" content="https://dropy.az/assets/icon.png" />
    <script type="module" src="/src/main.ts"></script>
  </head>
  <body>
    <a class="skip" href="#main">Əsas məzmuna keç</a>
    <div id="scene" aria-hidden="true"></div>

    <header class="top">
      <div class="wrap">
        <a class="brand" href="/"><img src="/assets/icon.png" alt="" width="32" height="32" />Dropy.az</a>
        <nav class="nav" aria-label="Əsas menyu">
          <a class="hide-sm" href="/endirimler/">Endirimlər</a>
          <a class="hide-sm" href="/magazalar/">Mağazalar</a>
          <a href="/destek/">Dəstək</a>
          <a class="btn btn-primary" href="/yukle/">Yüklə</a>
        </nav>
      </div>
    </header>

    <main id="main">
      <section class="hero" id="top">
        <div class="scene-fallback" aria-hidden="true"><i>-30%</i><i>-50%</i><i>-20%</i><b>%</b></div>
        <div class="wrap">
          <span class="eyebrow">Pulsuz endirim tətbiqi</span>
          <h1>Azərbaycandakı bütün <em>endirimlər</em> bir tətbiqdə</h1>
          <p class="lead">Dropy.az mağazaların öz rəsmi səhifələrindəki və sosial şəbəkələrindəki aktual kampaniyaları toplayır, kateqoriyalara ayırır və bir yerdə təqdim edir. Onlarla səhifəni ayrı-ayrı gəzməyə ehtiyac yoxdur.</p>
          <div class="stores">
            <a class="btn btn-dark" href="https://apps.apple.com/app/id6819821532" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.65.8-3.33.8-.7 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.18-1.54 2.67-.39 6.62 1.1 8.79.74 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.19-.02 1.94-1.07 2.66-2.14.84-1.23 1.19-2.42 1.2-2.48-.03-.01-2.3-.88-2.3-3.53zM14.2 6.15c.6-.74 1.01-1.75.9-2.77-.87.04-1.94.58-2.56 1.31-.56.65-1.05 1.69-.92 2.69.97.07 1.97-.49 2.58-1.23z"/></svg>
              <span><small>Yükləyin</small>App Store</span>
            </a>
            <a class="btn btn-dark" href="https://play.google.com/store/apps/details?id=az.endirim.aqreqatoru" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.6 2.2a1.5 1.5 0 0 0-.6 1.25v17.1c0 .52.23.98.6 1.25l9.6-9.8-9.6-9.8zm10.65 8.73 2.7-2.76L5.43 1.55l8.82 9.38zm0 2.14-8.82 9.38 11.52-6.62-2.7-2.76zm6.1-2.34-2.47-1.42-2.95 3.02 2.95 3.02 2.47-1.42c.78-.45.78-1.75 0-2.2z"/></svg>
              <span><small>Yükləyin</small>Google Play</span>
            </a>
          </div>
          <p class="note">Qeydiyyatsız baxış · tam pulsuz</p>
        </div>
      </section>

      <section id="how" aria-labelledby="how-title">
        <div class="wrap">
          <h2 class="h2 reveal" id="how-title">Necə işləyir?</h2>
          <div class="steps">
            <div class="step reveal" data-step="0">
              <span class="num">1</span>
              <h3>Kateqoriyanı seç</h3>
              <p>Supermarket, geyim, elektronika, restoran və ya gözəllik — axtardığın sahəni bir toxunuşla filtrlə.</p>
            </div>
            <div class="step reveal" data-step="1">
              <span class="num">2</span>
              <h3>Endirimlərə bax</h3>
              <p>Endirim faizlərini və bitmə tarixlərini müqayisə et, ən sərfəli təklifi tap.</p>
            </div>
            <div class="step reveal" data-step="2">
              <span class="num">3</span>
              <h3>Mağazaya keç və ya saxla</h3>
              <p>Təklifi sevimliyə əlavə et və ya "Mağazaya get" düyməsi ilə birbaşa satıcının rəsmi ünvanına yönəl.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="deals" aria-labelledby="deals-title">
        <div class="wrap">
          <div class="panel reveal">
            <div class="head-row">
              <div>
                <h2 class="h2" id="deals-title">Bu günün endirimləri</h2>
                <p class="lead">Tətbiqdəki real endirimlərdən seçmələr. Hər gün yenilənir.</p>
              </div>
              <a class="more" href="/endirimler/">Hamısına bax →</a>
            </div>
            <div class="deals-grid"><!-- deals:start --><!-- deals:end --></div>
          </div>
        </div>
      </section>

      <section id="stores" aria-labelledby="stores-title">
        <div class="wrap">
          <div class="head-row reveal">
            <div>
              <h2 class="h2" id="stores-title">Mağazalar</h2>
              <p class="lead">Sevdiyiniz mağazaları izləyin, yeni endirim çıxanda bildiriş alın.</p>
            </div>
            <a class="more" href="/magazalar/">Bütün mağazalar →</a>
          </div>
        </div>
        <div class="marquee" aria-label="Tətbiqdəki mağazalar">
          <div class="marquee-track"><!-- stores:start --><!-- stores:end --></div>
        </div>
      </section>

      <section id="sellers" aria-labelledby="sellers-title">
        <div class="wrap">
          <div class="panel sellers reveal">
            <div>
              <span class="eyebrow">Mağaza sahibləri üçün</span>
              <h2 class="h2" id="sellers-title">Mağazanızı ödənişsiz qeydiyyatdan keçirin</h2>
              <p class="lead">Endirimlərinizi paylaşın, daha çox müştəri cəlb edin. Qoşulmaq istəsəniz və ya əlavə suallarınız olarsa, bizimlə əlaqə saxlayın.</p>
            </div>
            <div class="contact-list">
              <a class="btn btn-primary" href="mailto:support@dropy.az">support@dropy.az</a>
              <a class="btn btn-ghost" href="https://wa.me/994998151520" rel="noopener">WhatsApp: +994 99 815 15 20</a>
            </div>
          </div>
        </div>
      </section>

      <section class="cta" id="get" aria-labelledby="get-title">
        <div class="wrap reveal">
          <h2 class="h2" id="get-title">Endirimləri qaçırmayın</h2>
          <p class="lead" style="margin: 0 auto">Dropy.az-ı yükləyin, bütün endirimlər cibinizdə olsun.</p>
          <div class="stores">
            <a class="btn btn-dark" href="https://apps.apple.com/app/id6819821532" rel="noopener"><span><small>Yükləyin</small>App Store</span></a>
            <a class="btn btn-dark" href="https://play.google.com/store/apps/details?id=az.endirim.aqreqatoru" rel="noopener"><span><small>Yükləyin</small>Google Play</span></a>
          </div>
        </div>
      </section>
    </main>

    <!-- seo:start --><!-- seo:end -->
    <footer>
      <div class="wrap">
        <span>© 2026 «OMNİ GATE» MMC · VÖEN 3105969611 · Dropy.az</span>
        <nav aria-label="Hüquqi">
          <a href="https://legal.dropy.az">Məxfilik siyasəti</a>
          <a href="https://legal.dropy.az">İstifadə qaydaları</a>
          <a href="/destek/">Dəstək</a>
          <a href="mailto:support@dropy.az">support@dropy.az</a>
        </nav>
      </div>
    </footer>
  </body>
</html>
```

- [ ] **Step 6: Create `web/destek/index.html`.** It uses the same header and footer as `web/index.html`, copied verbatim, but has no `#scene` and no `.scene-fallback`. The `<title>` is `Dəstək — Dropy.az`, the description is `Dropy.az tətbiqi ilə bağlı suallar və əlaqə: support@dropy.az`, and the canonical is `https://dropy.az/destek/`. The script tag is `<script type="module" src="/src/destek.ts"></script>`. The `<main id="main">` body:

```html
      <section class="hero" style="min-height:auto">
        <div class="wrap">
          <span class="eyebrow">Kömək Mərkəzi</span>
          <h1>Dəstək və tez-tez verilən suallar</h1>
          <p class="lead">Dropy.az tətbiqi, mağaza qeydiyyatı və ya endirim kampaniyaları ilə bağlı suallarınıza ən qısa zamanda cavab tapın.</p>
          <div class="stores" style="margin-top:1.5rem">
            <a class="btn btn-primary" href="mailto:support@dropy.az">support@dropy.az</a>
            <a class="btn btn-ghost" href="https://wa.me/994998151520" rel="noopener">WhatsApp: +994 99 815 15 20</a>
          </div>
          <p class="note">Müraciətlərə adətən 1-2 iş günü ərzində baxılır və cavablandırılır.</p>
        </div>
      </section>
      <section style="padding-top:0">
        <div class="wrap faq">
          <details class="reveal" open><summary>Dropy.az nədir və necə işləyir?</summary><p>Dropy.az müstəqil endirim və kampaniya aqreqatorudur. Platforma mağazaların rəsmi saytlarındakı və sosial şəbəkələrindəki aktual endirim təkliflərini toplayır və istifadəçilərə rahat şəkildə təqdim edir. Dropy.az birbaşa satış həyata keçirmir, alıcını rəsmi mağazaya istiqamətləndirir.</p></details>
          <details class="reveal"><summary>Endirim məlumatı səhvdirsə və ya vaxtı bitibsə nə edim?</summary><p>Hər bir kampaniya kartının və ya detallarının içindəki bayraq (şikayət) düyməsi vasitəsilə dərhal bizə xəbər verə bilərsiniz. Moderatorlarımız ən qısa zamanda məlumatı yoxlayaraq düzəliş edir və ya bitmiş kampaniyanı arxivləşdirir.</p></details>
          <details class="reveal"><summary>Mağazamı platformaya necə əlavə edə bilərəm?</summary><p>Mağazanızı mobil tətbiqdə Profil → Satıcı Ol / Mağazam bölməsindən pulsuz əlavə edə bilərsiniz, və ya support@dropy.az və WhatsApp vasitəsilə bizimlə əlaqə saxlayın. Məlumatlar moderatorlarımız tərəfindən təsdiqləndikdən sonra kampaniyalarınız tətbiqdə aktivləşəcək.</p></details>
          <details class="reveal"><summary>Hesabımı necə silə bilərəm?</summary><p>Mobil tətbiqdə Profil → Hesabı Sil seçiminə daxil olaraq hesabınızı və qeydiyyat zamanı yadda saxlanılmış bütün fərdi məlumatlarınızı dərhal və birdəfəlik silə bilərsiniz.</p></details>
          <details class="reveal"><summary>Bildirişləri necə tənzimləyə və ya bağlaya bilərəm?</summary><p>Mobil tətbiqin Profil → Bildiriş Ayarları bölməsinə daxil olaraq yalnız izlədiyiniz mağazalar və ya maraqlandığınız kateqoriyalar üzrə bildirişləri aktivləşdirə və ya istədiyiniz zaman tamamilə söndürə bilərsiniz.</p></details>
          <details class="reveal"><summary>Tətbiqdən istifadə ödənişlidirmi?</summary><p>Xeyr, Dropy.az tətbiqi istifadəçilər və mağaza sahibləri üçün tamamilə pulsuzdur. Platforma daxilində yerləşdirilən rəsmi tərəfdaş reklamları hesabına fəaliyyət göstərir.</p></details>
          <p class="reveal">Məxfilik siyasəti və hüquqi qaydalarla tanış olmaq istəyirsiniz? <a class="more" href="https://legal.dropy.az">legal.dropy.az səhifəsinə keç</a></p>
        </div>
      </section>
```

- [ ] **Step 7: Create the minimal entries, which Tasks 3–5 extend.**

`web/src/main.ts`:

```ts
import "./styles/site.css";
```

`web/src/destek.ts`:

```ts
import "./styles/site.css";
```

- [ ] **Step 8: Install and build. Check that the root output keeps the markers and the blocks are filled.**

Add `web/node_modules/` to `.gitignore`. The file already has `node_modules/`, which covers it, so only add the line if it is missing.

Run: `cd web && npm install && npm run build && cd .. && node -e "const h=require('fs').readFileSync('index.html','utf8');for(const m of ['seo','deals','stores'])console.log(m,h.includes('<!-- '+m+':start -->'), h.split('<!-- '+m+':start -->')[1].split('<!-- '+m+':end -->')[0].length>100)" && ls assets/web destek`
Expected:
- `seo true true`, `deals true true`, `stores true true`;
- `assets/web/` contains hashed `.js` and `.css` files and the font `.woff2` files;
- `destek/index.html` exists.

- [ ] **Step 9: Run the SEO tests again and check that a full regeneration still works on the new page.**

Run: `node --test seo/generate.test.mjs && node seo/generate.mjs && git diff --stat -- index.html`
Expected: tests pass. The `index.html` diff touches only the content inside the three blocks.

- [ ] **Step 10: Commit.** This commits the source and the built output.

```bash
git add .gitignore web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/index.html web/destek/index.html web/src index.html destek/index.html assets/web seo/landing.json
git commit -m "web: Vite scaffold, brand tokens, static landing + support pages built into the root"
```

---

### Task 3: Device tier and scene layout (pure logic, TDD)

**Files:**
- Create: `web/src/scene/tier.ts`, `web/src/scene/tier.test.ts`
- Create: `web/src/scene/layout.ts`, `web/src/scene/layout.test.ts`

**Interfaces:**
- Produces:
  - `type Tier = "high" | "low" | "none"`
  - `interface TierEnv { webgl: boolean; reducedMotion: boolean; cores?: number; memoryGb?: number; width: number }`
  - `detectTier(e: TierEnv): Tier`
  - `readEnv(): TierEnv`
  - `const OBJECTS: { high: 16; low: 9; none: 0 }`
  - `type Kind = "tag" | "percent" | "bag"`
  - `type Vec3 = [number, number, number]`
  - `interface Slot { kind: Kind; label: string; home: Vec3; spin: Vec3; scale: number; phase: number }`
  - `makeSlots(count: number, seed?: number): Slot[]`
  - `formation(step: number, i: number, count: number, narrow: boolean): Vec3`
  - `scatterOf(slot: Slot): Vec3`
  - `targetAt(slot: Slot, i: number, count: number, progress: number, narrow: boolean): Vec3`

- [ ] **Step 1: Write the failing tests.**

`web/src/scene/tier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectTier, OBJECTS } from "./tier";

const base = { webgl: true, reducedMotion: false, cores: 8, memoryGb: 8, width: 1440 };

describe("detectTier", () => {
  it("is none without WebGL or with reduced motion", () => {
    expect(detectTier({ ...base, webgl: false })).toBe("none");
    expect(detectTier({ ...base, reducedMotion: true })).toBe("none");
  });
  it("is low on weak or small devices", () => {
    expect(detectTier({ ...base, cores: 4 })).toBe("low");
    expect(detectTier({ ...base, memoryGb: 2 })).toBe("low");
    expect(detectTier({ ...base, width: 390 })).toBe("low");
  });
  it("is high on a capable desktop, and treats unknown hardware as capable", () => {
    expect(detectTier(base)).toBe("high");
    expect(detectTier({ webgl: true, reducedMotion: false, width: 1280 })).toBe("high");
  });
  it("draws fewer objects on low", () => {
    expect(OBJECTS.low).toBeLessThan(OBJECTS.high);
    expect(OBJECTS.none).toBe(0);
  });
});
```

`web/src/scene/layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeSlots, targetAt, formation, scatterOf } from "./layout";

describe("makeSlots", () => {
  it("is deterministic for a seed and mixes all three kinds", () => {
    const a = makeSlots(9, 3);
    expect(a).toEqual(makeSlots(9, 3));
    expect(a).toHaveLength(9);
    expect(new Set(a.map((s) => s.kind))).toEqual(new Set(["tag", "percent", "bag"]));
  });
});

describe("targetAt", () => {
  const slots = makeSlots(12, 7);
  const s = slots[4]!;
  it("holds the hero pose at the top of the page", () => {
    expect(targetAt(s, 4, 12, 0, false)).toEqual(s.home);
    expect(targetAt(s, 4, 12, 0.2, false)).toEqual(s.home);
  });
  it("is fully scattered when the steps begin", () => {
    expect(targetAt(s, 4, 12, 0.35, false)).toEqual(scatterOf(s));
  });
  it("ends in the last step's formation and clamps beyond", () => {
    const end = formation(2, 4, 12, false);
    targetAt(s, 4, 12, 1, false).forEach((v, k) => expect(v).toBeCloseTo(end[k]!, 5));
    expect(targetAt(s, 4, 12, 5, false)).toEqual(targetAt(s, 4, 12, 1, false));
  });
  it("centres formations on narrow screens", () => {
    expect(formation(1, 0, 12, true)[0]).toBe(0);
    expect(formation(1, 0, 12, false)[0]).toBeGreaterThan(2);
  });
  it("always returns finite numbers", () => {
    for (let p = -0.5; p <= 1.5; p += 0.05) targetAt(s, 4, 12, p, true).forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**

Run: `cd web && npx vitest run src/scene`
Expected: FAIL with `Failed to resolve import "./tier"` and `"./layout"`.

- [ ] **Step 3: Implement.**

`web/src/scene/tier.ts`:

```ts
export type Tier = "high" | "low" | "none";
export interface TierEnv { webgl: boolean; reducedMotion: boolean; cores?: number; memoryGb?: number; width: number }

export const OBJECTS = { high: 16, low: 9, none: 0 } as const;

/** none = static CSS fallback; low = fewer objects, no shadows, capped DPR. */
export function detectTier(e: TierEnv): Tier {
  if (!e.webgl || e.reducedMotion) return "none";
  if ((e.cores ?? 8) <= 4 || (e.memoryGb ?? 8) <= 4 || e.width < 768) return "low";
  return "high";
}

export function readEnv(): TierEnv {
  let webgl = false;
  try {
    webgl = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    webgl = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    webgl,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    cores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    width: window.innerWidth,
  };
}
```

`web/src/scene/layout.ts`:

```ts
export type Kind = "tag" | "percent" | "bag";
export type Vec3 = [number, number, number];
export interface Slot { kind: Kind; label: string; home: Vec3; spin: Vec3; scale: number; phase: number }

const KINDS: Kind[] = ["tag", "percent", "bag"];
const LABELS = ["-30%", "-50%", "-20%", "-40%", "-70%"];
export const STEP_COUNT = 3;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Hero arrangement: a loose ellipse around the headline, deterministic per seed. */
export function makeSlots(count: number, seed = 7): Slot[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + r() * 0.4;
    const radius = 2.2 + r() * 1.6;
    return {
      kind: KINDS[i % KINDS.length]!,
      label: LABELS[i % LABELS.length]!,
      home: [Math.cos(angle) * radius * 1.4, Math.sin(angle) * radius * 0.8, -r() * 2.5],
      spin: [r() * Math.PI, r() * Math.PI, r() * Math.PI],
      scale: 0.7 + r() * 0.5,
      phase: r() * Math.PI * 2,
    };
  });
}

/** Where object i sits during step 0 (ring), 1 (column) or 2 (tight pack, "into the bag"). */
export function formation(step: number, i: number, count: number, narrow: boolean): Vec3 {
  const cx = narrow ? 0 : 3.2;
  const z = narrow ? -3 : -1;
  const a = (i / count) * Math.PI * 2;
  if (step <= 0) return [cx + Math.cos(a) * 1.3, Math.sin(a) * 1.3, z];
  if (step === 1) return [cx + (i % 2 ? 0.5 : -0.5), (i - count / 2) * 0.42, z - (i % 3) * 0.4];
  return [cx + Math.cos(a) * 0.35, Math.sin(a) * 0.35, z + 0.5];
}

export function scatterOf(slot: Slot): Vec3 {
  return [slot.home[0] * 2.2, slot.home[1] * 2.2, slot.home[2] - 2];
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** progress 0..1 across hero → steps: hold, scatter (0.2–0.35), then one formation per step. */
export function targetAt(slot: Slot, i: number, count: number, progress: number, narrow: boolean): Vec3 {
  const p = Math.min(1, Math.max(0, progress));
  if (p <= 0.2) return slot.home;
  const scattered = scatterOf(slot);
  if (p <= 0.35) return lerp3(slot.home, scattered, smooth((p - 0.2) / 0.15));
  const stepsP = ((p - 0.35) / 0.65) * STEP_COUNT;
  const step = Math.min(STEP_COUNT - 1, Math.floor(stepsP));
  const local = smooth(Math.min(1, (stepsP - step) * 2));
  const from = step === 0 ? scattered : formation(step - 1, i, count, narrow);
  return lerp3(from, formation(step, i, count, narrow), local);
}
```

- [ ] **Step 4: Run the tests and confirm they pass.**

Run: `cd web && npx vitest run src/scene`
Expected: all tests pass.

- [ ] **Step 5: Commit.**

```bash
git add web/src/scene/tier.ts web/src/scene/tier.test.ts web/src/scene/layout.ts web/src/scene/layout.test.ts
git commit -m "web: device tier detection and scroll-driven scene layout"
```

---

### Task 4: The 3D scene (geometry, R3F canvas, lazy mount)

**Files:**
- Create: `web/src/scene/geometry.ts`, `web/src/scene/Scene.tsx`, `web/src/scene/mount.tsx`
- Modify: `web/src/main.ts`

**Interfaces:**
- Consumes:
  - `COLORS` (Task 2);
  - `Tier`, `OBJECTS`, `readEnv`, `detectTier` (Task 3);
  - `Slot`, `makeSlots`, `targetAt` (Task 3).
- Produces:
  - `export async function mountScene(tier: "high" | "low", progress: { current: number }): Promise<void>` in `mount.tsx`.
  - The shared progress object `progress.current ∈ [0, 1]`, which Task 5 writes.

- [ ] **Step 1: Create `web/src/scene/geometry.ts`.**

```ts
import * as THREE from "three";
import { COLORS } from "../ui/tokens";

// All objects are built in code (no model files) to keep the 3D chunk small.

export function tagGeometry(): THREE.ExtrudeGeometry {
  const w = 1.1, h = 0.62, r = 0.12, tip = 0.32;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - tip, -h / 2);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2 - tip, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const hole = new THREE.Path();
  hole.absarc(w / 2 - tip, 0, 0.07, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3, curveSegments: 12 });
  g.center();
  return g;
}

/** White "-30%"-style text for the tag face. Call after fonts are ready. */
export function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = '800 76px "Manrope Variable", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 112, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const geo = {
  tag: tagGeometry(),
  ring: new THREE.TorusGeometry(0.17, 0.065, 16, 40),
  slash: new THREE.CapsuleGeometry(0.06, 0.78, 6, 16),
  bag: new THREE.BoxGeometry(0.8, 0.9, 0.38),
  handle: new THREE.TorusGeometry(0.2, 0.03, 10, 28, Math.PI),
  label: new THREE.PlaneGeometry(0.9, 0.45),
};

export const mat = {
  coral: new THREE.MeshStandardMaterial({ color: COLORS.primary, roughness: 0.45 }),
  coralGloss: new THREE.MeshStandardMaterial({ color: COLORS.primary, roughness: 0.18 }),
  teal: new THREE.MeshStandardMaterial({ color: COLORS.accent, roughness: 0.4 }),
  paper: new THREE.MeshStandardMaterial({ color: COLORS.paper, roughness: 0.85 }),
};
```

- [ ] **Step 2: Create `web/src/scene/Scene.tsx`.**

```tsx
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { geo, mat, labelTexture } from "./geometry";
import { makeSlots, targetAt, type Slot } from "./layout";
import { OBJECTS } from "./tier";

export interface SceneProps { tier: "high" | "low"; progress: { current: number } }

function Shape({ slot }: { slot: Slot }) {
  const label = useMemo(() => (slot.kind === "tag" ? labelTexture(slot.label) : null), [slot]);
  if (slot.kind === "tag")
    return (
      <group>
        <mesh geometry={geo.tag} material={slot.label === "-50%" ? mat.teal : mat.coral} castShadow receiveShadow />
        <mesh geometry={geo.label} position={[-0.1, 0, 0.08]}>
          <meshBasicMaterial map={label} transparent toneMapped={false} />
        </mesh>
      </group>
    );
  if (slot.kind === "percent")
    return (
      <group>
        <mesh geometry={geo.ring} material={mat.coralGloss} position={[-0.26, 0.26, 0]} castShadow />
        <mesh geometry={geo.ring} material={mat.coralGloss} position={[0.26, -0.26, 0]} castShadow />
        <mesh geometry={geo.slash} material={mat.coralGloss} rotation={[0, 0, -Math.PI / 4]} castShadow />
      </group>
    );
  return (
    <group>
      <mesh geometry={geo.bag} material={mat.paper} castShadow receiveShadow />
      <mesh geometry={geo.handle} material={mat.teal} position={[0, 0.45, 0]} />
    </group>
  );
}

function Floater({ slot, i, count, progress }: { slot: Slot; i: number; count: number; progress: { current: number } }) {
  const ref = useRef<THREE.Group>(null);
  const { pointer, viewport } = useThree();
  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const narrow = viewport.aspect < 1;
    const [x, y, z] = targetAt(slot, i, count, progress.current, narrow);
    const k = 1 - Math.exp(-dt * 3);
    const t = state.clock.elapsedTime;
    g.position.x += (x + pointer.x * 0.3 - g.position.x) * k;
    g.position.y += (y + Math.sin(t * 0.8 + slot.phase) * 0.15 + pointer.y * 0.2 - g.position.y) * k;
    g.position.z += (z - g.position.z) * k;
    g.rotation.x = slot.spin[0] + t * 0.15 + pointer.y * 0.4;
    g.rotation.y = slot.spin[1] + t * 0.2 + pointer.x * 0.5;
  });
  return (
    <group ref={ref} position={slot.home} scale={slot.scale}>
      <Shape slot={slot} />
    </group>
  );
}

export function Scene({ tier, progress }: SceneProps) {
  const count = OBJECTS[tier];
  const slots = useMemo(() => makeSlots(count), [count]);
  const [active, setActive] = useState(true);

  // Stop rendering in a background tab.
  useEffect(() => {
    const onVis = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <Canvas
      dpr={tier === "high" ? [1, 2] : [1, 1.25]}
      shadows={tier === "high"}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 8], fov: 40 }}
      gl={{ antialias: tier === "high", alpha: true, powerPreference: "high-performance" }}
      eventSource={document.body}
      eventPrefix="client"
    >
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#fff6ea", "#146b68", 0.5]} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} castShadow={tier === "high"} shadow-mapSize={[1024, 1024]} />
      {slots.map((s, i) => (
        <Floater key={i} slot={s} i={i} count={count} progress={progress} />
      ))}
    </Canvas>
  );
}
```

- [ ] **Step 3: Create `web/src/scene/mount.tsx`, the lazy chunk entry.**

```tsx
import { createRoot } from "react-dom/client";
import { Scene } from "./Scene";

export async function mountScene(tier: "high" | "low", progress: { current: number }): Promise<void> {
  const el = document.getElementById("scene");
  if (!el) return;
  // Tag labels are drawn on a canvas, so the font must be ready first.
  await document.fonts.load('800 76px "Manrope Variable"').catch(() => undefined);
  createRoot(el).render(<Scene tier={tier} progress={progress} />);
}
```

- [ ] **Step 4: Wire up `web/src/main.ts`.** Task 5 adds scroll tracking to this progress object.

```ts
import "./styles/site.css";
import { detectTier, readEnv } from "./scene/tier";

export const progress = { current: 0 };

const tier = detectTier(readEnv());
document.documentElement.dataset.tier = tier;

if (tier !== "none") {
  const start = () => import("./scene/mount").then((m) => m.mountScene(tier, progress));
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2000 });
  else setTimeout(start, 600);
}
```

- [ ] **Step 5: Build, then look at the scene in Chrome.**

Run: `cd web && npm run build && cd .. && python -m http.server 8080`. Run the server in the background.
Then open `http://localhost:8080/` in Chrome. Check:
- the hero text is visible immediately;
- floating coral tags with labels, "%" signs and bags appear within about 1 s;
- the objects lean with the mouse;
- the console has no errors.

Then run `ls assets/web` and confirm a separate `mount-*.js` chunk exists. That is the lazy 3D bundle.

- [ ] **Step 6: Commit.**

```bash
git add web/src index.html destek/index.html assets/web
git commit -m "web: lazy-loaded R3F hero scene with code-built tags, % signs and bags"
```

---

### Task 5: Scroll choreography, reveals and card tilt

**Files:**
- Create: `web/src/scroll.ts`, `web/src/tilt.ts`
- Modify: `web/src/main.ts`, `web/src/destek.ts`

**Interfaces:**
- Consumes the `progress` object from `main.ts` (Task 4), the DOM ids `#top`, `#how`, `#deals`, `#scene` and the `.reveal` class (Task 2), and `.deal-card` (Task 1 markup).
- Produces:
  - `initReveals(): void`
  - `trackProgress(progress: { current: number }): void`
  - `initTilt(root?: ParentNode): void`

- [ ] **Step 1: Create `web/src/scroll.ts`.**

```ts
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Fade-up for every .reveal block. Not called when the user prefers reduced motion. */
export function initReveals(): void {
  gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
    gsap.from(el, { y: 36, opacity: 0, duration: 0.8, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
  });
}

/** Maps hero → end of "Necə işləyir" to progress 0..1 for the 3D scene, then dims the canvas. */
export function trackProgress(progress: { current: number }): void {
  ScrollTrigger.create({
    trigger: "#top",
    start: "top top",
    endTrigger: "#how",
    end: "bottom center",
    onUpdate: (s) => {
      progress.current = s.progress;
    },
  });
  gsap.to("#scene", { opacity: 0.18, ease: "none", scrollTrigger: { trigger: "#deals", start: "top bottom", end: "top 30%", scrub: true } });
}
```

- [ ] **Step 2: Create `web/src/tilt.ts`.**

```ts
/** Subtle 3D tilt on deal cards. Skipped on touch screens and with reduced motion. */
export function initTilt(root: ParentNode = document): void {
  if (matchMedia("(hover: none), (prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll<HTMLElement>(".deal-card").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(700px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateY(-4px)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  });
}
```

- [ ] **Step 3: Update `web/src/main.ts`** (the full file):

```ts
import "./styles/site.css";
import { detectTier, readEnv } from "./scene/tier";
import { initTilt } from "./tilt";

const progress = { current: 0 };
const env = readEnv();
const tier = detectTier(env);
document.documentElement.dataset.tier = tier;

initTilt();

if (!env.reducedMotion) {
  import("./scroll").then((m) => {
    m.initReveals();
    if (tier !== "none") m.trackProgress(progress);
  });
}

if (tier !== "none") {
  const start = () => import("./scene/mount").then((m) => m.mountScene(tier, progress));
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2000 });
  else setTimeout(start, 600);
}
```

And `web/src/destek.ts`:

```ts
import "./styles/site.css";

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  import("./scroll").then((m) => m.initReveals());
}
```

- [ ] **Step 4: Run the unit tests, build, and check in Chrome.**

Run: `cd web && npm test && npm run build`
Expected: tests pass and the build is clean.

With the local server on `:8080`, check:
- scrolling from the hero scatters the objects;
- each of the 3 steps forms a ring, then a column, then a tight pack on the right on desktop and centred on mobile;
- the canvas dims at "Bu günün endirimləri";
- deal cards tilt under the mouse;
- sections fade up.

Then turn on DevTools > Rendering > `prefers-reduced-motion: reduce` and reload. Expect no canvas, the CSS fallback tags in the hero, and all text visible.

- [ ] **Step 5: Commit.**

```bash
git add web/src index.html destek/index.html assets/web
git commit -m "web: scroll-driven scene choreography, section reveals, deal card tilt"
```

---

### Task 6: Copy review with the user (gate)

**Files:**
- Modify: `web/index.html` and `web/destek/index.html`, only if the user asks for changes.

- [ ] **Step 1: Show the user, in Azerbaijani, every new or changed string, and list each deviation from the old site.**
  - New strings:
    - eyebrow "Pulsuz endirim tətbiqi";
    - note "Qeydiyyatsız baxış · tam pulsuz", which replaces "100% pulsuz";
    - deals heading and sub;
    - stores heading and sub;
    - seller block;
    - final CTA "Endirimləri qaçırmayın" / "Dropy.az-ı yükləyin, bütün endirimlər cibinizdə olsun.".
  - Every "Dropy" becomes "Dropy.az".
  - Step 2 drops "keçərli filialları". The distance feature is deferred, and the old features section is not carried over: "Yaxınlıqdakı filiallar" and "Meta / Instagram Bağlantısı" are not live.
  - /destek FAQ 3 replaces the non-existent website "Mağazanı əlavə et" button with e-mail and WhatsApp.
- [ ] **Step 2: Apply the user's edits verbatim, rebuild with `cd web && npm run build`, and commit.**

```bash
git add web index.html destek/index.html assets/web
git commit -m "web: copy approved by the user"
```

Do not continue to Task 7 until the user has approved the copy.

---

### Task 7: Remove the old build pipeline, update the README, and verify

**Files:**
- Delete: `build/`
- Modify: `README.md`

- [ ] **Step 1: Delete the Sleek pipeline and rewrite the top of the README.**

Run: `git rm -r build`

In `README.md`, replace the first two paragraphs and the "## Rebuild after a Sleek change" section with:

```markdown
# dropy.az

Public site for Dropy.az: landing page (`/`, App Store marketing URL) and support page (`/destek/`, App Store support URL). Privacy policy / terms live separately at legal.dropy.az (repo `dropy-legal`).

## Landing + support pages (web/)

Source is `web/` (Vite + React + TypeScript; the 3D hero is React Three Fiber + GSAP ScrollTrigger, lazy-loaded). The pages themselves are static HTML in `web/index.html` and `web/destek/index.html`; React mounts only the decorative canvas.

    cd web && npm install
    npm run dev     # local preview (deals/stores/seo blocks are empty in dev)
    npm test        # scene layout + device tier unit tests
    npm run build   # writes index.html, destek/index.html, assets/web/ into the repo root, then re-applies seo/landing.json

`web/src/ui/` (tokens) is meant to be shared with the planned seller panel (`/panel`, phase 2).
```

Keep the "## Discount pages (SEO)" section. Add this bullet to its list:

```markdown
- the landing's `<!-- deals:start -->` (8 deal cards) and `<!-- stores:start -->` (logo marquee) blocks, cached in `seo/landing.json` and re-applied by `seo/apply-landing.mjs` after each `web` build
```

- [ ] **Step 2: Do the full verification.**

Run: `node --test seo/generate.test.mjs && cd web && npm test && npm run build && cd ..`
Expected: everything passes and the build is clean.

With `python -m http.server 8080` running from the repo root, capture these screenshots in Chrome:
- `/` at 1440×900 and at 390×844, the hero plus each section;
- `/destek/`;
- `/` with reduced motion;
- `/endirimler/`, to check that the SEO pages are untouched.

Check the links: both store buttons, `/yukle/`, `/destek/`, legal.dropy.az, the `mailto` and the WhatsApp link.

Run: `npx lighthouse@12.2.1 http://localhost:8080/ --form-factor=mobile --only-categories=performance,accessibility,seo --output=json --output-path=./lh.json --chrome-flags="--headless" && node -e "const r=require('./lh.json').categories;for(const k in r)console.log(k, Math.round(r[k].score*100))" && rm lh.json`
Expected: performance ≥ 85, accessibility ≥ 95, seo ≥ 95. If performance falls short, the first lever is lowering the `low` tier DPR or the object count.

- [ ] **Step 3: Commit.**

```bash
git add -A README.md build
git commit -m "Remove the Sleek export pipeline; document the web/ build"
```

---

### Task 8: User review and publish (gate)

- [ ] **Step 1: Send the user the Task 7 screenshots and the Lighthouse scores, with a one-line summary per section.**
- [ ] **Step 2: Publish only after an explicit "hə".**

```bash
git push -u origin feat/3d-redesign
git switch main && git pull --ff-only && git merge --no-ff feat/3d-redesign -m "3D redesign of dropy.az (landing + support)" && git push
```

- [ ] **Step 3: Check the live site.** Wait about 1 minute for Pages, then confirm that `https://dropy.az/` and `https://dropy.az/destek/` load in Chrome with the new design and that `https://dropy.az/endirimler/` is unchanged.
- [ ] **Step 4: Prepare the rollback, but do not run it unless the user asks.** The command is `git revert -m 1 <merge-sha> && git push`.
