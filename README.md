# dropy.az

Public site for Dropy: landing page (`/`, App Store marketing URL) and support page (`/destek/`, App Store support URL). Privacy policy / terms live separately at legal.dropy.az (repo `dropy-legal`).

Design source of truth is the Sleek project "Azerbaijan Deals" — screens **Dropy Web: Landing** and **Dropy Web: Support**. `build/sleek-*.html` are those screens' exports.

## Rebuild after a Sleek change

1. Replace `build/sleek-landing.html` / `build/sleek-support.html` with the new exports.
2. `cd build && npm install && npm run build`

`build.py` precompiles Tailwind (no in-browser compiler), inlines the Iconify icons as SVG, vendors images into `assets/`, fixes placeholder links, and applies the few copy corrections documented inline (e.g. both store badges stay "Tezliklə" until the listings are live).

Hosted on GitHub Pages (custom domain in `CNAME`).
