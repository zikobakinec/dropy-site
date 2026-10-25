# dropy.az

Public site for Dropy.az: landing page (`/`, App Store marketing URL) and support page (`/destek/`, App Store support URL). Privacy policy / terms live separately at legal.dropy.az (repo `dropy-legal`).

## Landing + support pages (web/)

Source is `web/` (Vite + React + TypeScript; the 3D hero is React Three Fiber + GSAP ScrollTrigger, lazy-loaded). The pages themselves are static HTML in `web/index.html` and `web/destek/index.html`; React mounts only the decorative canvas.

    cd web && npm install
    npm run dev     # local preview (deals/stores/seo blocks are empty in dev)
    npm test        # scene layout + device tier unit tests
    npm run build   # writes index.html, destek/index.html, assets/web/ into the repo root, then re-applies seo/landing.json

`web/src/ui/` (tokens) is meant to be shared with the planned seller panel (`/panel`, phase 2).

Hosted on GitHub Pages (custom domain in `CNAME`).

## Discount pages (SEO)

`seo/generate.mjs` builds Google-indexable pages from the live feed (`api.dropy.az/feed`, the same rows the app shows):

- `/endirimler/`: all of today's deals
- `/endirimler/<kateqoriya>/`: one page per category
- `/magazalar/` and `/magaza/<slug>/`: the store index and one page per store
- `/kampaniya/<ad>-<id>/`: one page per campaign, with Product data when a price pair is known
- `sitemap.xml` and `robots.txt`
- the landing's `<!-- deals:start -->` (8 deal cards) and `<!-- stores:start -->` (logo marquee) blocks, cached in `seo/landing.json` and re-applied by `seo/apply-landing.mjs` after each `web` build
- a marked `<!-- seo:start -->` block of links and structured data in `index.html`

Cards link to the campaign page, and that page links out to the store. Every page has the Google Play button.

A store keeps its URL after its discounts end (`seo/stores.json`), showing an empty state rather than a 404. An ended campaign keeps its page for 30 days (`seo/campaigns.json`), marked noindex and showing live alternatives, before it is dropped.

`.github/workflows/seo.yml` reruns the generator at 11:30 and 22:30 Baku, each time after ingestion, and commits any change. Run locally: `node seo/generate.mjs`. Tests: `node --test seo/generate.test.mjs`.

