// Builds dropy.az's indexable discount pages from the live feed, so a Google
// search for "endirim", "<mağaza> endirim" or "<kateqoriya> endirimləri" can
// land on Dropy and send people to the app (user ask, 2026-10-16).
//
// Source: the public feed at api.dropy.az (the same rows the app shows — only
// approved, not-yet-ended campaigns; no key needed). Output, all regenerated
// on every run:
//   /endirimler/                 all of today's deals (hub)
//   /endirimler/<kateqoriya>/    one page per category
//   /magazalar/                  every store with a page
//   /magaza/<slug>/              one page per store
//   /kampaniya/<ad>-<id>/        one page per campaign (kept 30 days after it ends)
//   /endirimler/11-11/, /endirimler/black-friday/   shopping-event pages (EVENTS)
//   /sitemap.xml, /robots.txt
// and a marked block of internal links + structured data in /index.html.
//
// A store that once had a page keeps it (seo/stores.json) with an "aktiv
// endirim yoxdur" state, so a URL Google already indexed never turns into a 404.
//
// Run: node seo/generate.mjs   (Node 20+, no dependencies)

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://dropy.az";
const PLAY_URL = "https://play.google.com/store/apps/details?id=az.endirim.aqreqatoru";
// The app is Azerbaijan-only on the App Store: without /az/ the link shows "not found" elsewhere.
const APP_STORE_URL = "https://apps.apple.com/az/app/id6819821532";
const FEED_SELECT =
  "id,title,description,discount_type,discount_value,discount_label,start_date,end_date,end_date_estimated,created_at,source_url,image_url,event_tag,stores(slug,name,logo_url),categories(slug,name_az)";
const HUB_LIMIT = 60;
// Until the site carries its own ads (AdSense), it shows a taste of each shelf,
// not the whole catalog: a visitor who sees every deal on the web has no reason
// to open the app (user, 2026-10-29). Search traffic comes from store and
// category pages ("rahat market endirim", "era electronics"), so those stay,
// each with its best few deals and "the rest is in the app". Only deals shown
// somewhere get a /kampaniya/ page. FULL_CATALOG = true publishes everything.
const FULL_CATALOG = false;
const SHOWCASE_LIMIT = 20;
const PAGE_TOP = 5;
const ENDED_KEEP_DAYS = 30;

// Shopping-event pages (11.11 plan, 2026-11-01). Each page always exists, so
// Google can index it before the day; it fills itself with the campaigns the
// ingestion tagged campaigns.event_tag = tag (migration 0088). `day` is the
// event's date for a year; the hub links the page from `from` days before
// until `to` days after it.
export const EVENTS = [
  {
    tag: "11-11",
    slug: "11-11",
    name: "11.11",
    day: (y) => new Date(Date.UTC(y, 10, 11)),
    from: 10,
    to: 1,
    about:
      "11 noyabr (11.11) ilin ən böyük onlayn alış-veriş günlərindən biridir. Bu tarixdə mağazalar bir günlük və ya bir neçə günlük xüsusi endirimlər, promo kodlar və aksiyalar keçirir: elektronika, geyim, kosmetika, ev əşyaları və daha çox.",
  },
  {
    tag: "black-friday",
    slug: "black-friday",
    name: "Black Friday",
    // The Friday after the fourth Thursday of November.
    day: (y) => {
      const first = new Date(Date.UTC(y, 10, 1)).getUTCDay();
      return new Date(Date.UTC(y, 10, 1 + ((4 - first + 7) % 7) + 21 + 1));
    },
    from: 12,
    to: 3,
    about:
      "Black Friday (Qara Cümə) noyabrın son cüməsidir və ilin ən böyük endirim mövsümünü açır. Mağazalar bu günlərdə elektronika, geyim, məişət texnikası və digər məhsullarda ilin ən böyük endirimlərini edir; bəzi aksiyalar bütün həftə davam edir.",
  },
];

/** "before" until the event day ends (Baku time), "after" from then on. */
export function eventPhase(ev, now = new Date()) {
  const baku = new Date(now.getTime() + 4 * 3600_000);
  const end = ev.day(baku.getUTCFullYear()).getTime() + 24 * 3600_000 + (ev.to - 1) * 24 * 3600_000;
  return baku.getTime() < end ? "before" : "after";
}

/** True while the hub should point at the event page. */
export function eventInSeason(ev, now = new Date()) {
  const baku = new Date(now.getTime() + 4 * 3600_000);
  const day = ev.day(baku.getUTCFullYear()).getTime();
  const t = baku.getTime();
  return t >= day - ev.from * 24 * 3600_000 && t < day + (ev.to + 1) * 24 * 3600_000;
}

const AZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];

/** "Noyabr 2026" (Baku calendar): titles carry the current month (SEO, 2026-11-10). */
export function monthYear(now = new Date()) {
  const d = new Date(now.getTime() + 4 * 3600_000);
  const m = AZ_MONTHS[d.getUTCMonth()];
  return `${m[0].toLocaleUpperCase("az")}${m.slice(1)} ${d.getUTCFullYear()}`;
}

// A store × category page exists only with this many live deals, so it is
// never a near-empty page (programmatic SEO, 2026-11-10).
export const STORE_CAT_MIN = 4;

// Links to the strongest pages, set by buildSite() and shown in every footer
// and on the landing: internal links from the home page (position 2) lift them.
let popularLinks = [];

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON for a <script type="application/ld+json"> block — never lets "</script>" through. */
export function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

/** Baku calendar date ("16 oktyabr 2026") for a timestamp. */
export function azDate(iso) {
  const d = new Date(new Date(iso).getTime() + 4 * 3600_000);
  return `${d.getUTCDate()} ${AZ_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The short badge a card shows: "-50%", "-30 ₼", or the store's own label. */
export function badge(c) {
  const v = Number(c.discount_value);
  if (c.discount_type === "percent" && v > 0) return `-${Math.round(v)}%`;
  if (c.discount_type === "amount" && v > 0) return `-${v} ₼`;
  const label = (c.discount_label ?? "").trim();
  return label && label.length <= 22 ? label : "Endirim";
}

function percentOf(c) {
  return c.discount_type === "percent" ? Number(c.discount_value) || 0 : 0;
}

/** One store at a time (biggest discount first within each), so no single catalog fills a page. */
export function spreadByStore(items) {
  const queues = new Map();
  for (const c of [...items].sort((a, b) => percentOf(b) - percentOf(a))) {
    const key = c.stores?.slug ?? "";
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(c);
  }
  const out = [];
  while (out.length < items.length) {
    for (const q of queues.values()) {
      const next = q.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

/** Public URL segment for a store: internal "-seed" suffixes stay out of the address. */
export function urlSlug(slug) {
  return String(slug ?? "").replace(/-seed$/, "");
}

const AZ_LATIN = { ə: "e", ı: "i", ö: "o", ü: "u", ş: "s", ç: "c", ğ: "g", i̇: "i" };

/** URL-safe, readable slug from an Azerbaijani title ("Qadın köynəyi" → "qadin-koyneyi"). */
export function slugify(text) {
  return String(text ?? "")
    .toLocaleLowerCase("az")
    .replace(/[əıöüşçğ]/g, (ch) => AZ_LATIN[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Stable page path for a campaign: readable title slug + the id's first 8 chars. */
export function campaignPath(c) {
  const slug = slugify(c.title);
  return `/kampaniya/${slug ? `${slug}-` : ""}${String(c.id).slice(0, 8)}/`;
}

/** Old → new price from a "1800 ₼ → 1650 ₼" label, or undefined. */
export function pricePair(text) {
  const m = String(text ?? "").match(/([\d][\d\s.,]*)\s*(?:₼|AZN)?\s*→\s*([\d][\d\s.,]*)/i);
  if (!m) return undefined;
  const num = (s) => {
    let t = s.replace(/\s/g, "").replace(/[.,]$/, "");
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
    return Number(t);
  };
  const oldPrice = num(m[1]);
  const newPrice = num(m[2]);
  return Number.isFinite(oldPrice) && Number.isFinite(newPrice) && newPrice > 0 && newPrice < oldPrice ? { oldPrice, newPrice } : undefined;
}

export function isHttpUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

// ---------- page chrome ----------

function head({ title, description, path, extra = "", image = `${SITE}/assets/icon.png` }) {
  return `<!DOCTYPE html>
<html lang="az">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${SITE}${path}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${SITE}${path}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${esc(image)}" />
    <meta name="google-play-app" content="app-id=az.endirim.aqreqatoru" />
    <link rel="icon" href="/assets/icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Fraunces:wght@600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/assets/seo.css" />
${extra}  </head>
  <body>
    <header class="top">
      <div class="wrap top-row">
        <a class="brand" href="/"><img src="/assets/icon.png" alt="" width="32" height="32" /><span>Dropy</span></a>
        <nav class="nav">
          <a href="/endirimler/">Endirimlər</a>
          <a href="/magazalar/">Mağazalar</a>
          <a class="btn btn-sm" href="/yukle/">Tətbiqi yüklə</a>
        </nav>
      </div>
    </header>
    <main class="wrap">
`;
}

function appBanner() {
  return `      <section class="app-banner">
        <div>
          <strong>Bütün endirimlər bir tətbiqdə</strong>
          <p>Sevdiyin mağazaları izlə, yeni endirim çıxanda bildiriş al. Pulsuz.</p>
        </div>
        <div class="stores">
          <a class="btn" href="${PLAY_URL}" rel="noopener">Google Play-dən yüklə</a>
          <a class="btn" href="${APP_STORE_URL}" rel="noopener">App Store-dan yüklə</a>
        </div>
      </section>
`;
}

function foot(updatedIso) {
  return `    </main>
    <footer class="foot">
      <div class="wrap">
        <p>Dropy mağazaların öz saytlarındakı aktual endirimləri toplayır. Endirimin şərtləri və qiyməti mağazanın öz səhifəsindədir. Yenilənib: ${esc(azDate(updatedIso))}.</p>
${popularLinks.length ? `        <p class="popular">${popularLinks.map((l) => `<a href="${l.path}">${esc(l.name)}</a>`).join(" · ")}</p>\n` : ""}        <p><a href="/">Ana səhifə</a> · <a href="/endirimler/">Endirimlər</a> · <a href="/magazalar/">Mağazalar</a> · <a href="/destek/">Dəstək</a> · <a href="https://legal.dropy.az">Məxfilik</a></p>
      </div>
    </footer>
  </body>
</html>
`;
}

function breadcrumbs(trail) {
  const html = trail
    .map((t, i) => (i < trail.length - 1 ? `<a href="${t.path}">${esc(t.name)}</a>` : `<span>${esc(t.name)}</span>`))
    .join(" › ");
  const ld = jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: `${SITE}${t.path}` })),
  });
  return { html: `      <nav class="crumbs">${html}</nav>\n`, ld };
}

function card(c, { showStore = true } = {}) {
  const store = c.stores ?? {};
  const img = isHttpUrl(c.image_url) ? c.image_url : isHttpUrl(store.logo_url) ? store.logo_url : "/assets/icon.png";
  const href = campaignPath(c);
  const ends = c.end_date && !c.end_date_estimated ? `<span class="ends">Son tarix: ${esc(azDate(c.end_date))}</span>` : "";
  return `        <article class="card">
          <a class="card-img" href="${esc(href)}"><img src="${esc(img)}" alt="${esc(c.title)}" loading="lazy" referrerpolicy="no-referrer" /><span class="badge">${esc(badge(c))}</span></a>
          <div class="card-body">
            ${showStore ? `<a class="store" href="/magaza/${esc(urlSlug(store.slug))}/">${esc(store.name)}</a>` : ""}
            <h3><a href="${esc(href)}">${esc(c.title)}</a></h3>
            ${ends}
          </div>
        </article>
`;
}

function grid(items, opts) {
  return `      <div class="grid">\n${items.map((c) => card(c, opts)).join("")}      </div>\n`;
}

function itemListLd(name, items) {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 100).map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${c.title} — ${badge(c)}`,
      url: `${SITE}${campaignPath(c)}`,
    })),
  });
}

function chips(links) {
  return `      <div class="chips">${links.map((l) => `<a href="${l.path}">${esc(l.name)} <b>${l.count}</b></a>`).join("")}</div>\n`;
}

function write(path, html) {
  const file = join(ROOT, path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

// ---------- pages ----------

export function buildSite(rows, now = new Date()) {
  const updated = now.toISOString();
  const campaigns = rows.filter((c) => c.stores?.slug && c.categories?.slug && c.title);

  const byCategory = new Map();
  const byStore = new Map();
  for (const c of campaigns) {
    const cat = c.categories.slug;
    if (!byCategory.has(cat)) byCategory.set(cat, { slug: cat, name: c.categories.name_az ?? cat, items: [] });
    byCategory.get(cat).items.push(c);
    const st = c.stores.slug;
    if (!byStore.has(st)) byStore.set(st, { slug: st, name: c.stores.name ?? st, items: [] });
    byStore.get(st).items.push(c);
  }
  const categories = [...byCategory.values()].sort((a, b) => b.items.length - a.items.length);
  const stores = [...byStore.values()].sort((a, b) => a.name.localeCompare(b.name, "az"));
  const catLinks = categories.map((c) => ({ path: `/endirimler/${c.slug}/`, name: c.name, count: c.items.length }));
  const pages = {};
  const best = (items) => [...items].sort((a, b) => percentOf(b) - percentOf(a)).slice(0, PAGE_TOP);
  const hubDeals = spreadByStore(campaigns).slice(0, FULL_CATALOG ? HUB_LIMIT : SHOWCASE_LIMIT);
  const shownById = new Map(hubDeals.map((c) => [c.id, c]));
  for (const st of stores) for (const c of best(st.items)) shownById.set(c.id, c);
  for (const cat of categories) for (const c of spreadByStore(cat.items).slice(0, PAGE_TOP)) shownById.set(c.id, c);
  const eventItems = new Map(EVENTS.map((ev) => [ev.tag, spreadByStore(campaigns.filter((c) => c.event_tag === ev.tag))]));
  for (const items of eventItems.values()) for (const c of items.slice(0, SHOWCASE_LIMIT)) shownById.set(c.id, c);
  const seasonal = EVENTS.filter((ev) => eventInSeason(ev, now));
  const month = monthYear(now);

  // Store × category ("Kontakt Home telefon endirimləri"): long-tail searches
  // with buyers ready to buy and almost no competition.
  const storeCats = [];
  for (const st of stores) {
    const groups = new Map();
    for (const c of st.items) {
      if (!groups.has(c.categories.slug)) groups.set(c.categories.slug, { cat: c.categories, items: [] });
      groups.get(c.categories.slug).items.push(c);
    }
    for (const g of groups.values()) {
      // All of a store's deals in one category = the store page itself; a copy would be duplicate content.
      if (g.items.length < STORE_CAT_MIN || g.items.length === st.items.length) continue;
      storeCats.push({ store: st, cat: g.cat, items: [...g.items].sort((a, b) => percentOf(b) - percentOf(a)), path: `/magaza/${urlSlug(st.slug)}/${g.cat.slug}/` });
    }
  }
  for (const sc of storeCats) for (const c of sc.items.slice(0, PAGE_TOP)) shownById.set(c.id, c);
  const storeCatPath = new Map(storeCats.map((sc) => [`${sc.store.slug}|${sc.cat.slug}`, sc.path]));

  popularLinks = [
    ...seasonal.map((ev) => ({ path: `/endirimler/${ev.slug}/`, name: `${ev.name} endirimləri` })),
    ...[...stores].sort((a, b) => b.items.length - a.items.length).slice(0, 8).map((s) => ({ path: `/magaza/${urlSlug(s.slug)}/`, name: `${s.name} endirimləri` })),
    ...categories.slice(0, 5).map((c) => ({ path: `/endirimler/${c.slug}/`, name: `${c.name} endirimləri` })),
  ];

  const shown = FULL_CATALOG ? campaigns : [...shownById.values()];
  const inApp = (total, listed) =>
    total > listed
      ? `      <p class="lead"><b>Qalan ${total - listed} endirim Dropy.az tətbiqində.</b> Yeni endirim çıxanda tətbiq bildiriş göndərir.</p>\n`
      : "";

  // Hub
  {
    const path = "/endirimler/";
    const top = hubDeals;
    const crumbs = breadcrumbs([{ name: "Dropy.az", path: "/" }, { name: "Endirimlər", path }]);
    pages[path] =
      head({
        title: `Endirimlər, kampaniyalar və aksiyalar — ${stores.length} mağaza | Dropy.az`,
        description: `${stores.length} mağazanın ${campaigns.length} aktiv endirimi və kampaniyası bir yerdə: elektronika, geyim, market, kosmetika, ev və daha çoxu. Hər gün yenilənir.`,
        path,
        extra: `    ${crumbs.ld}\n    ${itemListLd("Bu günün endirimləri", top)}\n`,
      }) +
      crumbs.html +
      `      <h1>Bu günün endirimləri və kampaniyaları</h1>
      <p class="lead">${stores.length} mağazanın öz saytından toplanmış <b>${campaigns.length}</b> aktiv endirim. Hər endirim mağazanın öz səhifəsinə aparır, hər gün yenilənir.</p>
` +
      (seasonal.length
        ? chips(seasonal.map((ev) => ({ path: `/endirimler/${ev.slug}/`, name: `${ev.name} endirimləri`, count: eventItems.get(ev.tag).length || "yeni" })))
        : "") +
      chips(catLinks) +
      appBanner() +
      `      <h2>${FULL_CATALOG ? "Ən çox endirim olanlar" : "Seçilmiş endirimlər — hamısı Dropy.az tətbiqində"}</h2>\n` +
      grid(top) +
      `      <h2>Mağazalar üzrə endirimlər</h2>\n` +
      chips(stores.map((s) => ({ path: `/magaza/${urlSlug(s.slug)}/`, name: s.name, count: s.items.length }))) +
      foot(updated);
  }

  // Categories
  for (const cat of categories) {
    const path = `/endirimler/${cat.slug}/`;
    const all = spreadByStore(cat.items);
    const items = FULL_CATALOG ? all : all.slice(0, PAGE_TOP);
    const catStores = [...new Map(all.map((c) => [c.stores.slug, c.stores])).values()];
    const crumbs = breadcrumbs([{ name: "Dropy.az", path: "/" }, { name: "Endirimlər", path: "/endirimler/" }, { name: cat.name, path }]);
    const storeNames = catStores.slice(0, 6).map((s) => s.name).join(", ");
    const catBest = all.reduce((m, c) => Math.max(m, percentOf(c)), 0);
    pages[path] =
      head({
        title: `${cat.name} endirimləri (${month}) — ${all.length} aktiv${catBest ? `, ${catBest}%-dək` : ""} | Dropy.az`,
        description: `${cat.name} üzrə ${all.length} aktiv endirim: ${storeNames}${catStores.length > 6 ? " və digərləri" : ""}. Real qiymətlər, mağazanın öz saytından.`,
        path,
        extra: `    ${crumbs.ld}\n    ${itemListLd(`${cat.name} endirimləri`, items)}\n`,
      }) +
      crumbs.html +
      `      <h1>${esc(cat.name)} endirimləri</h1>
      <p class="lead">${catStores.length} mağazada <b>${all.length}</b> aktiv ${esc(cat.name.toLocaleLowerCase("az"))} endirimi və kampaniyası.</p>
` +
      chips(catStores.map((s) => ({ path: `/magaza/${urlSlug(s.slug)}/`, name: s.name, count: byStore.get(s.slug).items.filter((c) => c.categories.slug === cat.slug).length }))) +
      appBanner() +
      grid(items) +
      inApp(all.length, items.length) +
      `      <h2>Digər kateqoriyalar</h2>\n` +
      chips(catLinks.filter((l) => l.path !== path)) +
      foot(updated);
  }

  // Stores
  for (const st of stores) {
    const path = `/magaza/${urlSlug(st.slug)}/`;
    const items = [...st.items].sort((a, b) => percentOf(b) - percentOf(a));
    const cats = [...new Map(items.map((c) => [c.categories.slug, c.categories])).values()];
    const best = items.reduce((m, c) => Math.max(m, percentOf(c)), 0);
    const crumbs = breadcrumbs([{ name: "Dropy.az", path: "/" }, { name: "Mağazalar", path: "/magazalar/" }, { name: st.name, path }]);
    pages[path] =
      head({
        title: `${st.name} endirimləri və kataloqu (${month}) — ${items.length} aktiv${best ? `, ${best}%-dək` : ""} | Dropy.az`,
        description: `${st.name} endirim jurnalı və kataloqu, ${month}: bu həftənin ${items.length} aktiv aksiyası${best ? `, ${best}%-dək endirim` : ""}. Siyahı hər gün yenilənir.`,
        path,
        extra: `    ${crumbs.ld}\n    ${itemListLd(`${st.name} endirimləri`, items)}\n`,
      }) +
      crumbs.html +
      `      <h1>${esc(st.name)} endirimləri və kataloqu</h1>
      <p class="lead"><b>${items.length}</b> aktiv endirim və kampaniya${best ? `, ${best}%-dək` : ""}.</p>
` +
      storeIntro(st.name) +
      chips(cats.map((c) => {
        const own = items.filter((o) => o.categories.slug === c.slug).length;
        const sub = storeCatPath.get(`${st.slug}|${c.slug}`);
        return sub
          ? { path: sub, name: `${st.name} ${(c.name_az ?? c.slug).toLocaleLowerCase("az")}`, count: own }
          : { path: `/endirimler/${c.slug}/`, name: c.name_az ?? c.slug, count: byCategory.get(c.slug).items.length };
      })) +
      appBanner() +
      grid(FULL_CATALOG ? items : items.slice(0, PAGE_TOP), { showStore: false }) +
      (FULL_CATALOG ? "" : inApp(items.length, Math.min(items.length, PAGE_TOP))) +
      foot(updated);
  }

  // Store × category
  for (const sc of storeCats) {
    pages[sc.path] = storeCatPage(sc, month, updated, inApp);
  }

  // Store index
  {
    const path = "/magazalar/";
    const crumbs = breadcrumbs([{ name: "Dropy.az", path: "/" }, { name: "Mağazalar", path }]);
    pages[path] =
      head({
        title: `Endirim olan mağazalar — ${stores.length} mağaza | Dropy.az`,
        description: `Hazırda endirimi olan ${stores.length} mağaza: hər birinin aktiv endirim və kampaniyaları bir səhifədə.`,
        path,
        extra: `    ${crumbs.ld}\n`,
      }) +
      crumbs.html +
      `      <h1>Endirim olan mağazalar</h1>
      <p class="lead">Hazırda <b>${stores.length}</b> mağazada aktiv endirim var.</p>
` +
      chips(stores.map((s) => ({ path: `/magaza/${urlSlug(s.slug)}/`, name: s.name, count: s.items.length }))) +
      appBanner() +
      foot(updated);
  }

  // Shopping events
  for (const ev of EVENTS) {
    pages[`/endirimler/${ev.slug}/`] = eventPage(ev, eventItems.get(ev.tag), hubDeals, updated, now);
  }

  // Campaigns
  for (const c of shown) {
    const pool = FULL_CATALOG ? byCategory.get(c.categories.slug).items : shown;
    const similar = spreadByStore(pool.filter((o) => o.id !== c.id && o.stores.slug !== c.stores.slug)).slice(0, 4);
    pages[campaignPath(c)] = campaignPage(c, similar, updated);
  }

  return { pages, categories, stores, storeCats, campaigns: shown, updated };
}

export function storeCatPage({ store, cat, items, path }, month, updated, inApp) {
  const catName = cat.name_az ?? cat.slug;
  const lower = catName.toLocaleLowerCase("az");
  const best = items.reduce((m, c) => Math.max(m, percentOf(c)), 0);
  const listed = FULL_CATALOG ? items : items.slice(0, PAGE_TOP);
  const crumbs = breadcrumbs([
    { name: "Dropy.az", path: "/" },
    { name: "Mağazalar", path: "/magazalar/" },
    { name: store.name, path: `/magaza/${urlSlug(store.slug)}/` },
    { name: catName, path },
  ]);
  return (
    head({
      title: `${store.name} ${lower} endirimləri (${month}) — ${items.length} aktiv${best ? `, ${best}%-dək` : ""} | Dropy.az`,
      description: `${store.name} — ${lower} üzrə ${items.length} aktiv endirim${best ? `, ${best}%-dək` : ""}: ${items.slice(0, 3).map((c) => c.title).join(", ")}. Siyahı hər gün yenilənir.`,
      path,
      extra: `    ${crumbs.ld}\n    ${itemListLd(`${store.name} ${lower} endirimləri`, items)}\n`,
    }) +
    crumbs.html +
    `      <h1>${esc(store.name)} ${esc(lower)} endirimləri</h1>
      <p class="lead"><b>${items.length}</b> aktiv ${esc(lower)} endirimi${best ? `, ${best}%-dək` : ""}.</p>
      <p class="intro">Bu səhifədə ${esc(store.name)}-in ${esc(lower)} kateqoriyasındakı bu həftəki endirim və aksiyaları toplanıb. Siyahı hər gün mağazanın öz saytından yenilənir, bitmiş aksiyalar avtomatik çıxarılır.</p>
` +
    appBanner() +
    grid(listed, { showStore: false }) +
    inApp(items.length, listed.length) +
    `      <p><a href="/magaza/${esc(urlSlug(store.slug))}/">${esc(store.name)}-in bütün endirimləri →</a> · <a href="/endirimler/${esc(cat.slug)}/">Bütün ${esc(lower)} endirimləri →</a></p>
` +
    foot(updated)
  );
}

export function eventPage(ev, all, fallback, updated, now = new Date()) {
  const path = `/endirimler/${ev.slug}/`;
  const year = new Date(now.getTime() + 4 * 3600_000).getUTCFullYear();
  const items = FULL_CATALOG ? all : all.slice(0, SHOWCASE_LIMIT);
  const eventStores = [...new Map(all.map((c) => [c.stores.slug, c.stores])).values()];
  const dayText = azDate(ev.day(year).toISOString()).replace(/ \d{4}$/, "");
  const after = eventPhase(ev, now) === "after";
  const crumbs = breadcrumbs([{ name: "Dropy.az", path: "/" }, { name: "Endirimlər", path: "/endirimler/" }, { name: `${ev.name} endirimləri`, path }]);
  const lead = all.length
    ? `      <p class="lead">${eventStores.length} mağazada <b>${all.length}</b> ${esc(ev.name)} endirimi və kampaniyası. Siyahı hər gün yenilənir.</p>
`
    : after
      ? `      <p class="lead">Bu ilin ${esc(ev.name)} kampaniyaları bitib. Aşağıda bu günün aktiv endirimləri var; növbəti böyük endirimlərdən xəbər tutmaq üçün Dropy.az tətbiqini yüklə.</p>
`
      : `      <p class="lead">${esc(ev.name)} (${esc(dayText)}) kampaniyaları mağazalar elan etdikcə bu səhifəyə əlavə olunur. Sevdiyin mağazaları Dropy.az tətbiqində izlə — yeni endirim çıxanda bildiriş alacaqsan.</p>
`;
  return (
    head({
      title: `${ev.name} endirimləri ${year} — kampaniyalar və aksiyalar | Dropy.az`,
      description: all.length
        ? `${ev.name} ${year}: ${eventStores.length} mağazanın ${all.length} endirimi və kampaniyası bir yerdə. ${eventStores.slice(0, 5).map((s) => s.name).join(", ")}${eventStores.length > 5 ? " və digərləri" : ""}.`
        : `${ev.name} ${year} endirimləri, kampaniyaları və aksiyaları bir yerdə: mağazalar elan etdikcə bu səhifəyə əlavə olunur, hər gün yenilənir.`,
      path,
      extra: `    ${crumbs.ld}
${items.length ? `    ${itemListLd(`${ev.name} endirimləri`, items)}
` : ""}`,
    }) +
    crumbs.html +
    `      <h1>${esc(ev.name)} endirimləri ${year}</h1>
` +
    lead +
    `      <p class="intro">${esc(ev.about)} Dropy.az mağazaların öz saytlarındakı ${esc(ev.name)} kampaniyalarını bir səhifəyə toplayır, ayrı-ayrı saytları gəzməyə ehtiyac qalmır.</p>
` +
    (all.length ? chips(eventStores.map((s) => ({ path: `/magaza/${urlSlug(s.slug)}/`, name: s.name, count: all.filter((c) => c.stores.slug === s.slug).length }))) : "") +
    appBanner() +
    (items.length
      ? grid(items) + (FULL_CATALOG ? "" : all.length > items.length ? `      <p class="lead"><b>Qalan ${all.length - items.length} ${esc(ev.name)} endirimi Dropy.az tətbiqində.</b></p>
` : "")
      : `      <h2>Bu günün seçilmiş endirimləri</h2>
` + grid(fallback.slice(0, 8))) +
    `      <p><a href="/endirimler/">Bu günün bütün endirimləri →</a></p>
` +
    foot(updated)
  );
}

// A few lines of real text: store pages are what people find on Google
// ("rahat market endirim jurnalı", "era electronics"), and a page that is only
// a grid of cards reads as thin (Search Console, 2026-10-31).
export function storeIntro(name) {
  const n = esc(name);
  return `      <p class="intro">Bu səhifədə ${n}-in bu həftəki endirimləri, aksiyaları və kampaniyaları bir yerə toplanıb — ayrıca endirim jurnalı və ya kataloq axtarmağa ehtiyac yoxdur. Siyahı hər gün yenilənir, bitmiş aksiyalar avtomatik çıxarılır. ${n}-in bütün endirimlərini görmək və yeni aksiya çıxanda bildiriş almaq üçün Dropy.az tətbiqində mağazanı izlə.</p>
`;
}

function emptyStorePage(slug, name, updated) {
  const path = `/magaza/${urlSlug(slug)}/`;
  const crumbs = breadcrumbs([{ name: "Dropy.az", path: "/" }, { name: "Mağazalar", path: "/magazalar/" }, { name, path }]);
  return (
    head({
      title: `${name} endirimləri, aksiyaları və kataloqu | Dropy.az`,
      description: `${name}-in hazırda aktiv endirimi yoxdur. Yeni endirim çıxanda Dropy tətbiqi bildiriş göndərir.`,
      path,
      extra: `    ${crumbs.ld}\n`,
    }) +
    crumbs.html +
    `      <h1>${esc(name)} endirimləri və kataloqu</h1>
      <p class="lead">Hazırda ${esc(name)}-in aktiv endirimi yoxdur. Mağazanı tətbiqdə izlə — yeni endirim çıxanda bildiriş alacaqsan.</p>
` +
    appBanner() +
    `      <p><a href="/endirimler/">Bu günün bütün endirimlərinə bax →</a></p>\n` +
    foot(updated)
  );
}


// ---------- campaign pages ----------

function cleanDescription(text, title) {
  const t = String(text ?? "").replace(/#\S+/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!t || t === title) return "";
  return t.length > 700 ? `${t.slice(0, 700).replace(/\s+\S*$/, "")}…` : t;
}

// A deal page with no price pair and almost no text is what Google files under
// "crawled, not indexed" and counts against the site (Search Console,
// 2026-10-31: 171 such pages). Those stay reachable for visitors but carry
// noindex and stay out of the sitemap.
export function isThinCampaign(c) {
  if (pricePair(c.discount_label) ?? pricePair(c.description)) return false;
  return cleanDescription(c.description, c.title).length < 80;
}

export function campaignPage(c, similar, updated) {
  const path = campaignPath(c);
  const store = c.stores;
  const cat = c.categories;
  const b = badge(c);
  const img = isHttpUrl(c.image_url) ? c.image_url : isHttpUrl(store.logo_url) ? store.logo_url : `${SITE}/assets/icon.png`;
  const realEnd = c.end_date && !c.end_date_estimated;
  const prices = pricePair(c.discount_label) ?? pricePair(c.description);
  const desc = cleanDescription(c.description, c.title);
  const crumbs = breadcrumbs([
    { name: "Dropy.az", path: "/" },
    { name: "Endirimlər", path: "/endirimler/" },
    { name: cat.name_az ?? cat.slug, path: `/endirimler/${cat.slug}/` },
    { name: c.title.length > 50 ? `${c.title.slice(0, 50)}…` : c.title, path },
  ]);
  const productLd = prices
    ? jsonLd({
        "@context": "https://schema.org",
        "@type": "Product",
        name: c.title,
        image: img,
        brand: { "@type": "Brand", name: store.name },
        offers: {
          "@type": "Offer",
          price: prices.newPrice.toFixed(2),
          priceCurrency: "AZN",
          availability: "https://schema.org/InStock",
          url: isHttpUrl(c.source_url) ? c.source_url : `${SITE}${path}`,
          seller: { "@type": "Organization", name: store.name },
          ...((c.start_date ?? c.created_at) ? { validFrom: String(c.start_date ?? c.created_at).slice(0, 10) } : {}),
          ...(realEnd ? { priceValidUntil: c.end_date.slice(0, 10) } : {}),
        },
      })
    : "";
  const priceLine = prices
    ? `<p class="price"><s>${prices.oldPrice} ₼</s> <b>${prices.newPrice} ₼</b></p>`
    : "";
  return (
    head({
      title: `${c.title} — ${b} endirim | ${store.name} | Dropy.az`,
      description: `${store.name}: ${c.title}${prices ? ` — ${prices.oldPrice} ₼ əvəzinə ${prices.newPrice} ₼` : ` — ${b}`}.${realEnd ? ` Son tarix: ${azDate(c.end_date)}.` : ""} Endirimə mağazanın öz saytında bax.`,
      path,
      image: img,
      extra: `${isThinCampaign(c) ? `    <meta name="robots" content="noindex, follow" />
` : ""}    ${crumbs.ld}
${productLd ? `    ${productLd}
` : ""}`,
    }) +
    crumbs.html +
    `      <article class="deal">
        <div class="deal-img"><img src="${esc(img)}" alt="${esc(c.title)}" referrerpolicy="no-referrer" /><span class="badge">${esc(b)}</span></div>
        <div class="deal-body">
          <a class="store" href="/magaza/${esc(urlSlug(store.slug))}/">${esc(store.name)}</a>
          <h1>${esc(c.title)}</h1>
          ${priceLine}
          <p class="meta">${realEnd ? `Son tarix: <b>${esc(azDate(c.end_date))}</b> · ` : ""}Kateqoriya: <a href="/endirimler/${esc(cat.slug)}/">${esc(cat.name_az ?? cat.slug)}</a></p>
          ${isHttpUrl(c.source_url) ? `<a class="btn" href="${esc(c.source_url)}" rel="nofollow noopener" target="_blank">${esc(store.name)} saytında bax →</a>` : ""}
          ${desc ? `<div class="desc">${esc(desc)}</div>` : ""}
        </div>
      </article>
` +
    appBanner() +
    (similar.length ? `      <h2>Oxşar endirimlər</h2>
${grid(similar)}` : "") +
    `      <p><a href="/endirimler/${esc(cat.slug)}/">Bütün ${esc((cat.name_az ?? cat.slug).toLocaleLowerCase("az"))} endirimləri →</a></p>
` +
    foot(updated)
  );
}

// `inApp`: the deal is still running but left the web showcase (FULL_CATALOG
// off), so the page says where to find it instead of "bitib". Either way the
// URL keeps answering (noindex, follow) for ENDED_KEEP_DAYS instead of turning
// into a 404 for a page Google already indexed (2026-10-31: the showcase switch
// on 10-29 had dropped ~1,700 such pages).
// ---------- shared-deal link pages (/a/k/<id>/) ----------

// The app shares a deal as dropy.az/a/k/<id>/ (2026-11-12). With Dropy.az
// installed, App Links / Universal Links (/a and /a/* — app.json,
// .well-known) open the deal in the app. Without it, this small page gives
// WhatsApp/Telegram a preview with the deal's own photo, discount and store,
// then sends the phone to its store; a computer sees the deal and the links.
export function shareLinkPath(c) {
  return `/a/k/${c.id}/`;
}

export function shareStubPage(c, webPath) {
  const store = c.stores;
  const b = badge(c);
  const img = isHttpUrl(c.image_url) ? c.image_url : isHttpUrl(store.logo_url) ? store.logo_url : `${SITE}/assets/icon.png`;
  const title = `${b} · ${c.title}`;
  const desc = `${store.name} — Dropy.az tətbiqində bax`;
  const path = shareLinkPath(c);
  return `<!DOCTYPE html>
<html lang="az">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>${esc(title)}</title>
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${SITE}${path}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${esc(img)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/assets/icon.png" />
    <link rel="stylesheet" href="/assets/seo.css" />
    <script>
      (function () {
        var ref = "utm_source=share&utm_medium=app&utm_campaign=deal";
        var play = "${PLAY_URL}&referrer=" + encodeURIComponent(ref);
        var ua = navigator.userAgent || "";
        var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        if (/Android/i.test(ua)) location.replace(play);
        else if (isIOS) location.replace("${APP_STORE_URL}");
      })();
    </script>
  </head>
  <body>
    <main class="wrap">
      <p class="lead">${esc(store.name)} · ${esc(b)}</p>
      <h1>${esc(c.title)}</h1>
      <p><img src="${esc(img)}" alt="" style="max-width:100%;max-height:360px" referrerpolicy="no-referrer" /></p>
      <p>
        <a class="btn" href="${PLAY_URL}">Google Play-dən yüklə</a>
        <a class="btn" href="${APP_STORE_URL}">App Store-dan yüklə</a>
      </p>
      <p><a href="${webPath ?? "/endirimler/"}">${webPath ? "Endirimə saytda bax →" : "Bu günün endirimlərinə bax →"}</a></p>
    </main>
  </body>
</html>
`;
}

export function endedCampaignPage(entry, similar, updated, { inApp = false } = {}) {
  const crumbs = breadcrumbs([
    { name: "Dropy.az", path: "/" },
    { name: "Endirimlər", path: "/endirimler/" },
    { name: entry.title.length > 50 ? `${entry.title.slice(0, 50)}…` : entry.title, path: entry.path },
  ]);
  return (
    head({
      title: inApp ? `${entry.title} | ${entry.storeName} | Dropy.az` : `${entry.title} — endirim bitib | ${entry.storeName} | Dropy.az`,
      description: inApp
        ? `${entry.storeName}-in bu endirimi Dropy.az tətbiqində. ${entry.catName ?? ""} üzrə digər endirimlərə də bax.`
        : `${entry.storeName}-in bu endirimi artıq bitib. ${entry.catName ?? ""} üzrə aktiv endirimlərə Dropy-də bax.`,
      path: entry.path,
      extra: `    <meta name="robots" content="noindex, follow" />
    ${crumbs.ld}
`,
    }) +
    crumbs.html +
    `      <h1>${esc(entry.title)}</h1>
      <p class="lead">${inApp ? "Bu endirimə Dropy.az tətbiqində bax." : "Bu endirim artıq bitib."} <a href="/magaza/${esc(urlSlug(entry.storeSlug))}/">${esc(entry.storeName)}-in digər endirimlərinə</a> və aşağıdakı oxşar təkliflərə bax.</p>
` +
    appBanner() +
    (similar.length ? `      <h2>Oxşar aktiv endirimlər</h2>
${grid(similar)}` : "") +
    foot(updated)
  );
}

// ---------- landing page block ----------

const START = "<!-- seo:start -->";
const END = "<!-- seo:end -->";

export function landingBlock(categories, stores, _total) {
  const links = categories.map((c) => `<a href="/endirimler/${c.slug}/">${esc(c.name)} endirimləri</a>`).join("");
  const ld = jsonLd([
    { "@context": "https://schema.org", "@type": "Organization", name: "Dropy.az", url: SITE, logo: `${SITE}/assets/icon.png`, email: "support@dropy.az" },
    { "@context": "https://schema.org", "@type": "WebSite", name: "Dropy.az", url: SITE, inLanguage: "az" },
    {
      "@context": "https://schema.org",
      "@type": "MobileApplication",
      name: "Dropy.az",
      operatingSystem: "ANDROID, IOS",
      applicationCategory: "ShoppingApplication",
      installUrl: PLAY_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "AZN" },
    },
  ]);
  return `${START}
      <section style="max-width:72rem;margin:0 auto;padding:2.5rem 1rem;font-family:'Manrope Variable',Manrope,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
        <h2 style="font-family:'Fraunces Variable',Fraunces,Georgia,serif;font-size:1.6rem;margin:0 0 .4rem;color:#14213d">Kateqoriyalar üzrə endirimlər</h2>
        <p style="margin:0 0 .8rem;color:#5c6479;line-height:1.6">Dropy.az Azərbaycandakı mağazaların endirim, kampaniya və aksiyalarını bir yerdə toplayır: elektronika, məişət texnikası, geyim, market, kosmetika, uşaq məhsulları və daha çox. Endirimlər hər gün mağazaların öz saytlarından yenilənir, hamısı ödənişsiz Dropy.az tətbiqində.</p>
        <p style="margin:0 0 1rem;color:#5c6479"><a href="/endirimler/" style="color:#f2643d;font-weight:700">Hamısına bax →</a> · <a href="/magazalar/" style="color:#f2643d;font-weight:700">Mağazalar</a></p>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem">${links.replace(/<a /g, '<a style="padding:.45rem .8rem;border:1px solid #e8dfd1;border-radius:999px;background:#fff;color:#14213d;text-decoration:none;font-size:.85rem" ')}</div>
${popularLinks.length ? `        <h2 style="font-family:'Fraunces Variable',Fraunces,Georgia,serif;font-size:1.3rem;margin:1.6rem 0 .6rem;color:#14213d">Ən çox baxılan endirimlər</h2>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem">${popularLinks.map((l) => `<a href="${l.path}" style="padding:.45rem .8rem;border:1px solid #f2643d;border-radius:999px;background:#fff;color:#14213d;text-decoration:none;font-size:.85rem">${esc(l.name)}</a>`).join("")}</div>` : ""}
        ${ld}
      </section>
      ${END}`;
}

export function injectLanding(html, block) {
  if (html.includes(START)) return html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  return html.replace(/(\s*<footer\b)/, `\n      ${block}$1`);
}

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
    .map((w) => w[0].toLocaleUpperCase("az"))
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
  let out = injectLanding(html, seo ?? "");
  out = injectBetween(out, DEALS_START, DEALS_END, deals ?? "");
  out = injectBetween(out, STORES_START, STORES_END, stores ?? "");
  return out;
}

export function urlsetXml(paths, day) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${day}</lastmod><changefreq>daily</changefreq></url>`)
    .join("\n")}\n</urlset>\n`;
}

export function sitemapIndexXml(files, day) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files
    .map((f) => `  <sitemap><loc>${SITE}/${f}</loc><lastmod>${day}</lastmod></sitemap>`)
    .join("\n")}\n</sitemapindex>\n`;
}

function emptyStoreCatPage(path, e, updated) {
  const lower = String(e.cat).toLocaleLowerCase("az");
  const storePath = `/magaza/${urlSlug(e.storeSlug)}/`;
  const crumbs = breadcrumbs([{ name: "Dropy.az", path: "/" }, { name: "Mağazalar", path: "/magazalar/" }, { name: e.store, path: storePath }, { name: e.cat, path }]);
  return (
    head({
      title: `${e.store} ${lower} endirimləri | Dropy.az`,
      description: `${e.store} — ${lower} üzrə hazırda az aktiv endirim var. Mağazanın bütün endirimlərinə Dropy-də bax.`,
      path,
      extra: `    <meta name="robots" content="noindex, follow" />\n    ${crumbs.ld}\n`,
    }) +
    crumbs.html +
    `      <h1>${esc(e.store)} ${esc(lower)} endirimləri</h1>
      <p class="lead">Hazırda bu kateqoriyada az endirim var. <a href="${storePath}">${esc(e.store)}-in bütün endirimlərinə</a> və ya <a href="/endirimler/${esc(e.catSlug)}/">bütün ${esc(lower)} endirimlərinə</a> bax.</p>
` +
    appBanner() +
    foot(updated)
  );
}

// ---------- main ----------

async function main() {
  const res = await fetch(`https://api.dropy.az/feed?select=${encodeURIComponent(FEED_SELECT)}`);
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 50) throw new Error(`feed looks wrong (${Array.isArray(rows) ? rows.length : typeof rows} rows) — refusing to overwrite the site`);

  const { pages, categories, stores, storeCats, campaigns, updated } = buildSite(rows);

  // Regenerated wholesale, so a category that disappears doesn't linger.
  rmSync(join(ROOT, "endirimler"), { recursive: true, force: true });
  rmSync(join(ROOT, "magazalar"), { recursive: true, force: true });
  rmSync(join(ROOT, "magaza"), { recursive: true, force: true });
  rmSync(join(ROOT, "kampaniya"), { recursive: true, force: true });
  for (const [path, html] of Object.entries(pages)) write(path, html);

  // Stores keep their URL forever (see header comment).
  const registryFile = join(ROOT, "seo", "stores.json");
  const registry = existsSync(registryFile) ? JSON.parse(readFileSync(registryFile, "utf8")) : {};
  for (const s of stores) registry[s.slug] = s.name;
  const active = new Set(stores.map((s) => s.slug));
  for (const [slug, name] of Object.entries(registry)) {
    if (!active.has(slug)) write(`/magaza/${urlSlug(slug)}/`, emptyStorePage(slug, name, updated));
  }
  writeFileSync(registryFile, JSON.stringify(Object.fromEntries(Object.entries(registry).sort()), null, 2) + "\n");

  // A store × category page that drops under STORE_CAT_MIN deals keeps its URL
  // (noindex, follow) and points to the store page instead of turning into a 404.
  const scFile = join(ROOT, "seo", "store-cats.json");
  const scRegistry = existsSync(scFile) ? JSON.parse(readFileSync(scFile, "utf8")) : {};
  for (const sc of storeCats) scRegistry[sc.path] = { store: sc.store.name, storeSlug: sc.store.slug, cat: sc.cat.name_az ?? sc.cat.slug, catSlug: sc.cat.slug };
  const liveSc = new Set(storeCats.map((sc) => sc.path));
  for (const [path, e] of Object.entries(scRegistry)) {
    if (!liveSc.has(path)) write(path, emptyStoreCatPage(path, e, updated));
  }
  writeFileSync(scFile, JSON.stringify(Object.fromEntries(Object.entries(scRegistry).sort()), null, 2) + "\n");

  // Ended campaigns keep their page for ENDED_KEEP_DAYS ("bitib" + live
  // alternatives, noindex) so a visitor from Google doesn't hit a 404 the
  // day after a deal ends; then the page is dropped.
  const campaignFile = join(ROOT, "seo", "campaigns.json");
  const seen = existsSync(campaignFile) ? JSON.parse(readFileSync(campaignFile, "utf8")) : {};
  const nowMs = Date.parse(updated);
  for (const c of campaigns) {
    seen[c.id] = {
      path: campaignPath(c),
      title: c.title,
      storeSlug: c.stores.slug,
      storeName: c.stores.name,
      catSlug: c.categories.slug,
      catName: c.categories.name_az,
      lastSeen: updated,
    };
  }
  const activeIds = new Set(campaigns.map((c) => c.id));
  const liveInFeed = new Set(rows.map((r) => r.id));
  for (const [id, entry] of Object.entries(seen)) {
    if (activeIds.has(id)) continue;
    if (nowMs - Date.parse(entry.lastSeen) > ENDED_KEEP_DAYS * 24 * 3600_000) {
      delete seen[id];
      continue;
    }
    const similar = spreadByStore(campaigns.filter((o) => o.categories.slug === entry.catSlug)).slice(0, 8);
    write(entry.path, endedCampaignPage(entry, similar, updated, { inApp: liveInFeed.has(id) }));
  }
  writeFileSync(campaignFile, JSON.stringify(seen, null, 1) + "\n");
  // A deal's title can change after Google indexed it, which changes its slug
  // (…-coox-… → …-cooox-…) while the trailing id stays. /404.html uses this map
  // to send such old URLs to the current page (Search Console, 2026-10-31).
  const idMap = {};
  for (const c of campaigns) idMap[c.id.slice(0, 8)] = campaignPath(c);
  for (const [id, entry] of Object.entries(seen)) if (!idMap[id.slice(0, 8)]) idMap[id.slice(0, 8)] = entry.path;
  writeFileSync(join(ROOT, "kampaniya", "ids.json"), JSON.stringify(idMap) + "\n");

  // Preview pages for links shared from the app, one per live deal (every
  // feed row, not only the ones with an SEO page). Regenerated wholesale.
  rmSync(join(ROOT, "a", "k"), { recursive: true, force: true });
  const webPaths = new Map(campaigns.map((c) => [c.id, campaignPath(c)]));
  for (const c of rows) if (c.stores) write(shareLinkPath(c), shareStubPage(c, webPaths.get(c.id)));

  // Three sitemaps under one index (2026-11-10): stores and event pages change
  // daily and matter most, so Google sees them separately from short-lived deals.
  const day = updated.slice(0, 10);
  const sitemaps = {
    "sitemap-stores.xml": ["/", "/destek/", "/endirimler/", ...EVENTS.map((ev) => `/endirimler/${ev.slug}/`), "/magazalar/", ...Object.keys(registry).map((s) => `/magaza/${urlSlug(s)}/`), ...storeCats.map((sc) => sc.path)],
    "sitemap-categories.xml": categories.map((c) => `/endirimler/${c.slug}/`),
    "sitemap-deals.xml": campaigns.filter((c) => !isThinCampaign(c)).map((c) => campaignPath(c)),
  };
  for (const [file, list] of Object.entries(sitemaps)) {
    writeFileSync(join(ROOT, file), urlsetXml(list, day));
  }
  writeFileSync(join(ROOT, "sitemap.xml"), sitemapIndexXml(Object.keys(sitemaps), day));
  const urls = Object.values(sitemaps).flat();
  writeFileSync(join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /web/\n\nSitemap: ${SITE}/sitemap.xml\n`);

  const landing = {
    seo: landingBlock(categories, stores, categories.reduce((n, c) => n + c.items.length, 0)),
    deals: dealsBlock(landingDeals(campaigns)),
    stores: storesBlock(stores),
  };
  writeFileSync(join(ROOT, "seo", "landing.json"), JSON.stringify(landing, null, 2) + "\n");
  const indexFile = join(ROOT, "index.html");
  writeFileSync(indexFile, applyLanding(readFileSync(indexFile, "utf8"), landing));

  console.log(`${rows.length} campaigns → ${Object.keys(pages).length} pages, ${Object.keys(registry).length} store URLs, ${urls.length} sitemap URLs`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
