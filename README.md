# dropy.az

Public site for Dropy: landing page (`/`, App Store marketing URL) and support page (`/destek/`, App Store support URL). Privacy policy / terms live separately at legal.dropy.az (repo `dropy-legal`).

Design source of truth is the Sleek project "Azerbaijan Deals" — screens **Dropy Web: Landing** and **Dropy Web: Support**. `build/sleek-*.html` are those screens' exports.

## Rebuild after a Sleek change

1. Replace `build/sleek-landing.html` / `build/sleek-support.html` with the new exports.
2. `cd build && npm install && npm run build`

`build.py` precompiles Tailwind (no in-browser compiler), inlines the Iconify icons as SVG, vendors images into `assets/`, fixes placeholder links, and applies the few copy corrections documented inline (e.g. both store badges stay "Tezliklə" until the listings are live).

Hosted on GitHub Pages (custom domain in `CNAME`).

## Discount pages (SEO)

`seo/generate.mjs` builds Google-indexable pages from the live feed (`api.dropy.az/feed`, the same rows the app shows):

- `/endirimler/`: all of today's deals
- `/endirimler/<kateqoriya>/`: one page per category
- `/magazalar/` and `/magaza/<slug>/`: the store index and one page per store
- `sitemap.xml` and `robots.txt`
- a marked `<!-- seo:start -->` block of links and structured data in `index.html`

Every card links to the store's own page, and every page has the Google Play button.

A store keeps its URL after its discounts end (`seo/stores.json`), showing an empty state rather than a 404.

`.github/workflows/seo.yml` reruns the generator at 11:30 and 22:30 Baku, each time after ingestion, and commits any change. Run locally: `node seo/generate.mjs`. Tests: `node --test seo/generate.test.mjs`.

