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
const FEED_SELECT =
  "id,title,description,discount_type,discount_value,discount_label,end_date,end_date_estimated,created_at,source_url,image_url,stores(slug,name,logo_url),categories(slug,name_az)";
const HUB_LIMIT = 60;

const AZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];

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

export function isHttpUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u);
}

// ---------- page chrome ----------

function head({ title, description, path, extra = "" }) {
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
    <meta property="og:image" content="${SITE}/assets/icon.png" />
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
          <a class="btn btn-sm" href="${PLAY_URL}" rel="noopener">Tətbiqi yüklə</a>
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
          <span class="soon">App Store — tezliklə</span>
        </div>
      </section>
`;
}

function foot(updatedIso) {
  return `    </main>
    <footer class="foot">
      <div class="wrap">
        <p>Dropy mağazaların öz saytlarındakı aktual endirimləri toplayır. Endirimin şərtləri və qiyməti mağazanın öz səhifəsindədir. Yenilənib: ${esc(azDate(updatedIso))}.</p>
        <p><a href="/">Ana səhifə</a> · <a href="/endirimler/">Endirimlər</a> · <a href="/magazalar/">Mağazalar</a> · <a href="/destek/">Dəstək</a> · <a href="https://legal.dropy.az">Məxfilik</a></p>
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
  const href = isHttpUrl(c.source_url) ? c.source_url : `/magaza/${urlSlug(store.slug)}/`;
  const ends = c.end_date && !c.end_date_estimated ? `<span class="ends">Son tarix: ${esc(azDate(c.end_date))}</span>` : "";
  return `        <article class="card">
          <a class="card-img" href="${esc(href)}" rel="nofollow noopener" target="_blank"><img src="${esc(img)}" alt="${esc(c.title)}" loading="lazy" referrerpolicy="no-referrer" /><span class="badge">${esc(badge(c))}</span></a>
          <div class="card-body">
            ${showStore ? `<a class="store" href="/magaza/${esc(urlSlug(store.slug))}/">${esc(store.name)}</a>` : ""}
            <h3><a href="${esc(href)}" rel="nofollow noopener" target="_blank">${esc(c.title)}</a></h3>
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
      url: isHttpUrl(c.source_url) ? c.source_url : `${SITE}/magaza/${urlSlug(c.stores?.slug)}/`,
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

  // Hub
  {
    const path = "/endirimler/";
    const top = spreadByStore(campaigns).slice(0, HUB_LIMIT);
    const crumbs = breadcrumbs([{ name: "Dropy", path: "/" }, { name: "Endirimlər", path }]);
    pages[path] =
      head({
        title: `Endirimlər və kampaniyalar — bu günün ${campaigns.length} real endirimi | Dropy`,
        description: `${stores.length} mağazanın ${campaigns.length} aktiv endirimi və kampaniyası bir yerdə: elektronika, geyim, market, kosmetika, ev və daha çoxu. Hər gün yenilənir.`,
        path,
        extra: `    ${crumbs.ld}\n    ${itemListLd("Bu günün endirimləri", top)}\n`,
      }) +
      crumbs.html +
      `      <h1>Bu günün endirimləri və kampaniyaları</h1>
      <p class="lead">${stores.length} mağazanın öz saytından toplanmış <b>${campaigns.length}</b> aktiv endirim. Hər endirim mağazanın öz səhifəsinə aparır, hər gün yenilənir.</p>
` +
      chips(catLinks) +
      appBanner() +
      `      <h2>Ən çox endirim olanlar</h2>\n` +
      grid(top) +
      `      <h2>Mağazalar üzrə endirimlər</h2>\n` +
      chips(stores.map((s) => ({ path: `/magaza/${urlSlug(s.slug)}/`, name: s.name, count: s.items.length }))) +
      foot(updated);
  }

  // Categories
  for (const cat of categories) {
    const path = `/endirimler/${cat.slug}/`;
    const items = spreadByStore(cat.items);
    const catStores = [...new Map(items.map((c) => [c.stores.slug, c.stores])).values()];
    const crumbs = breadcrumbs([{ name: "Dropy", path: "/" }, { name: "Endirimlər", path: "/endirimler/" }, { name: cat.name, path }]);
    const storeNames = catStores.slice(0, 6).map((s) => s.name).join(", ");
    pages[path] =
      head({
        title: `${cat.name} endirimləri — ${items.length} aktiv kampaniya | Dropy`,
        description: `${cat.name} üzrə ${items.length} aktiv endirim: ${storeNames}${catStores.length > 6 ? " və digərləri" : ""}. Real qiymətlər, mağazanın öz saytından.`,
        path,
        extra: `    ${crumbs.ld}\n    ${itemListLd(`${cat.name} endirimləri`, items)}\n`,
      }) +
      crumbs.html +
      `      <h1>${esc(cat.name)} endirimləri</h1>
      <p class="lead">${catStores.length} mağazada <b>${items.length}</b> aktiv ${esc(cat.name.toLocaleLowerCase("az"))} endirimi və kampaniyası.</p>
` +
      chips(catStores.map((s) => ({ path: `/magaza/${urlSlug(s.slug)}/`, name: s.name, count: byStore.get(s.slug).items.filter((c) => c.categories.slug === cat.slug).length }))) +
      appBanner() +
      grid(items) +
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
    const crumbs = breadcrumbs([{ name: "Dropy", path: "/" }, { name: "Mağazalar", path: "/magazalar/" }, { name: st.name, path }]);
    pages[path] =
      head({
        title: `${st.name} endirimləri və kampaniyaları (${items.length}) | Dropy`,
        description: `${st.name}-in ${items.length} aktiv endirimi${best ? `, ${best}%-dək` : ""}. Hər endirim ${st.name}-in öz saytına aparır, hər gün yenilənir.`,
        path,
        extra: `    ${crumbs.ld}\n    ${itemListLd(`${st.name} endirimləri`, items)}\n`,
      }) +
      crumbs.html +
      `      <h1>${esc(st.name)} endirimləri</h1>
      <p class="lead"><b>${items.length}</b> aktiv endirim və kampaniya${best ? `, ${best}%-dək` : ""}.</p>
` +
      chips(cats.map((c) => ({ path: `/endirimler/${c.slug}/`, name: c.name_az ?? c.slug, count: byCategory.get(c.slug).items.length }))) +
      appBanner() +
      grid(items, { showStore: false }) +
      foot(updated);
  }

  // Store index
  {
    const path = "/magazalar/";
    const crumbs = breadcrumbs([{ name: "Dropy", path: "/" }, { name: "Mağazalar", path }]);
    pages[path] =
      head({
        title: `Endirim olan mağazalar — ${stores.length} mağaza | Dropy`,
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

  return { pages, categories, stores, updated };
}

function emptyStorePage(slug, name, updated) {
  const path = `/magaza/${urlSlug(slug)}/`;
  const crumbs = breadcrumbs([{ name: "Dropy", path: "/" }, { name: "Mağazalar", path: "/magazalar/" }, { name, path }]);
  return (
    head({
      title: `${name} endirimləri və kampaniyaları | Dropy`,
      description: `${name}-in hazırda aktiv endirimi yoxdur. Yeni endirim çıxanda Dropy tətbiqi bildiriş göndərir.`,
      path,
      extra: `    ${crumbs.ld}\n`,
    }) +
    crumbs.html +
    `      <h1>${esc(name)} endirimləri</h1>
      <p class="lead">Hazırda ${esc(name)}-in aktiv endirimi yoxdur. Mağazanı tətbiqdə izlə — yeni endirim çıxanda bildiriş alacaqsan.</p>
` +
    appBanner() +
    `      <p><a href="/endirimler/">Bu günün bütün endirimlərinə bax →</a></p>\n` +
    foot(updated)
  );
}

// ---------- landing page block ----------

const START = "<!-- seo:start -->";
const END = "<!-- seo:end -->";

export function landingBlock(categories, stores, total) {
  const links = categories.map((c) => `<a href="/endirimler/${c.slug}/">${esc(c.name)} endirimləri <b>${c.items.length}</b></a>`).join("");
  const ld = jsonLd([
    { "@context": "https://schema.org", "@type": "Organization", name: "Dropy", url: SITE, logo: `${SITE}/assets/icon.png`, email: "support@dropy.az" },
    { "@context": "https://schema.org", "@type": "WebSite", name: "Dropy", url: SITE, inLanguage: "az" },
    {
      "@context": "https://schema.org",
      "@type": "MobileApplication",
      name: "Dropy",
      operatingSystem: "ANDROID",
      applicationCategory: "ShoppingApplication",
      installUrl: PLAY_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "AZN" },
    },
  ]);
  return `${START}
      <section style="max-width:72rem;margin:0 auto;padding:2.5rem 1rem;font-family:Manrope,-apple-system,Segoe UI,Roboto,Arial,sans-serif">
        <h2 style="font-family:Fraunces,Georgia,serif;font-size:1.6rem;margin:0 0 .4rem;color:#14213d">Bu günün endirimləri</h2>
        <p style="margin:0 0 1rem;color:#5c6479">${stores.length} mağazada <b>${total}</b> aktiv endirim. <a href="/endirimler/" style="color:#f2643d;font-weight:700">Hamısına bax →</a> · <a href="/magazalar/" style="color:#f2643d;font-weight:700">Mağazalar</a></p>
        <div style="display:flex;flex-wrap:wrap;gap:.5rem">${links.replace(/<a /g, '<a style="padding:.45rem .8rem;border:1px solid #e8dfd1;border-radius:999px;background:#fff;color:#14213d;text-decoration:none;font-size:.85rem" ')}</div>
        ${ld}
      </section>
      ${END}`;
}

export function injectLanding(html, block) {
  if (html.includes(START)) return html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  return html.replace(/(\s*<footer\b)/, `\n      ${block}$1`);
}

// ---------- main ----------

async function main() {
  const res = await fetch(`https://api.dropy.az/feed?select=${encodeURIComponent(FEED_SELECT)}`);
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 50) throw new Error(`feed looks wrong (${Array.isArray(rows) ? rows.length : typeof rows} rows) — refusing to overwrite the site`);

  const { pages, categories, stores, updated } = buildSite(rows);

  // Regenerated wholesale, so a category that disappears doesn't linger.
  rmSync(join(ROOT, "endirimler"), { recursive: true, force: true });
  rmSync(join(ROOT, "magazalar"), { recursive: true, force: true });
  rmSync(join(ROOT, "magaza"), { recursive: true, force: true });
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

  const day = updated.slice(0, 10);
  const urls = ["/", "/destek/", "/endirimler/", "/magazalar/", ...categories.map((c) => `/endirimler/${c.slug}/`), ...Object.keys(registry).map((s) => `/magaza/${urlSlug(s)}/`)];
  writeFileSync(
    join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${day}</lastmod><changefreq>daily</changefreq></url>`)
      .join("\n")}\n</urlset>\n`,
  );
  writeFileSync(join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

  const indexFile = join(ROOT, "index.html");
  writeFileSync(indexFile, injectLanding(readFileSync(indexFile, "utf8"), landingBlock(categories, stores, categories.reduce((n, c) => n + c.items.length, 0))));

  console.log(`${rows.length} campaigns → ${Object.keys(pages).length} pages, ${Object.keys(registry).length} store URLs, ${urls.length} sitemap URLs`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
