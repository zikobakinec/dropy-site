# dropy.az 3D redesign: design

Date: 2026-10-25. Status: approved in chat, section by section.

## Goal

Replace the plain Sleek-export landing page with a modern, animated 3D site that matches the Dropy.az brand. Remove the old app mockup image. Swap the "Tezliklə" store badges for the live App Store and Google Play links. Keep everything that already works: the SEO discount pages, the sitemap, `/yukle` and the twice-daily refresh.

Phase 2, which is not part of this work: a seller panel at `dropy.az/panel`. Store owners will register their store and add discounts there, signing in with Supabase e-mail OTP like the app does. This phase only sets up the structure so that panel can reuse the UI.

## Scope

In scope:
- `/` (landing) rebuilt.
- `/destek/` rebuilt in the new design. Its text and URL stay the same, because App Store Connect uses it as the support URL.
- `seo/generate.mjs` also writes `data/today.json`.

Out of scope:
- The design of the SEO pages (`/endirimler`, `/magaza`, `/kampaniya`, `/magazalar`, `assets/seo.css`).
- `/yukle`.
- legal.dropy.az.
- The seller panel.

## Visual direction

- Brand tokens are unchanged from the app:

  | Token | Hex |
  |---|---|
  | primary (coral) | `#f2643d` |
  | accent (teal) | `#146b68` |
  | background (cream) | `#fbf7f0` |
  | foreground (navy) | `#14213d` |
  | muted | `#ede5d8` |
  | border | `#e8dfd1` |
  | muted-foreground | `#5c6479` |

- Fonts: Fraunces (headings) and Manrope (body), self-hosted woff2.
- Hero 3D scene, concept A:
  - 12–16 floating objects: coral price tags labelled "-30%"/"-50%", glossy 3D "%" signs, and paper shopping bags.
  - Soft studio lighting, matte-plastic materials.
  - All geometry is built in code, with no external models.
  - Objects lean toward the pointer or finger.
  - On scroll they scatter. In "Necə işləyir" they regroup and act out each step: a bag fills, a tag flies to a phone.
- Content and CTAs are plain HTML, rendered before the 3D. The 3D canvas is a decorative background (`aria-hidden`).

## Page sections (landing)

1. Hero: 3D scene, headline, App Store and Google Play buttons with real links.
2. Necə işləyir: 3 steps, driven by scroll, with the 3D objects regrouping.
3. Bu günün endirimləri: 6–8 real deal cards from `data/today.json`, with a tilt effect.
4. Mağazalar: an endless marquee of store logos.
5. Mağaza sahibləri üçün: "Mağazanızı ödənişsiz qeydiyyatdan keçirin…", support@dropy.az and WhatsApp +994 99 815 15 20. Phase 2 adds a "Panelə daxil ol" button here.
6. Final CTA, then the footer with legal links (legal.dropy.az) and /destek.

## Architecture

- `web/` is a Vite + React + TypeScript project, using React Three Fiber, drei and GSAP ScrollTrigger.
- `npm run build` in `web/` emits to the repo root:
  - `index.html` and `destek/index.html`;
  - hashed bundles in `assets/web/`.

  GitHub Pages serves the root as it does today, so the CNAME, HTTPS and DNS are untouched.
- The 3D bundle is a lazy-loaded chunk (`React.lazy`), mounted after first paint and idle time. The HTML shell, CSS and CTAs ship in the initial load.
- `web/src/ui/` holds the shared primitives (Button, Card, Input, StoreBadge, tokens). The phase-2 panel reuses them as another route or entry in the same Vite project.
- The landing `index.html` keeps the `<!-- seo:start --> … <!-- seo:end -->` block, so `seo/generate.mjs`'s `injectLanding` keeps working after every build.
- `build/` (the Sleek export pipeline) is removed and the README is updated.

## Data: today's deals

- `seo/generate.mjs` already reads `api.dropy.az/feed` at 11:30 and 22:30 Baku. It will also write `data/today.json`: the top 8 active deals. For each deal it writes:
  - title, store name, store slug;
  - price, old_price, discount_label;
  - the image URL, and the campaign page path on dropy.az.
- The landing page fetches `/data/today.json` from the same origin, so there is no CORS and no extra API load.
- Fallback: the build embeds the latest snapshot into the HTML, so the section never renders empty when the fetch fails or JS is off.

## Performance and accessibility

- Device tiers:
  - High: full scene with shadows.
  - Low (low `hardwareConcurrency` or `deviceMemory`, or a small screen): fewer objects, no shadows, capped DPR.
  - No WebGL: a static fallback image.
- `prefers-reduced-motion`: no scroll animation, and a static scene frame.
- Targets (Lighthouse mobile): Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95. The hero text must be visible in under 3 s on mid-range Android.
- Pause rendering when the canvas is offscreen or the tab is hidden.

## Copy

- Reused from the current site: the hero, the steps and /destek.
- New copy goes to the user for approval before publishing:
  - deals heading, stores heading, seller block, final CTA.
  - The seller block uses the already-approved sentence.
- Rules:
  - always "Dropy.az";
  - no numbers or bragging;
  - no "Bakı".

## Testing

- `node --test` for the `today.json` writer, alongside the existing `seo/generate.test.mjs`.
- The `web/` build must pass `tsc --noEmit` and `vite build` cleanly.
- In Chrome, check desktop and mobile widths, reduced-motion, and the no-WebGL fallback, with screenshots.
- Lighthouse mobile run against the targets above.
- Links: the App Store and Google Play buttons, `/yukle`, `/destek`, legal.dropy.az.

## Rollout

- All work happens on `feat/3d-redesign`. The user reviews it locally through screenshots.
- On the user's yes, merge to `main`, and GitHub Pages publishes.
- Rollback: revert the merge commit.
