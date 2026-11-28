import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, jsonLd, badge, spreadByStore, urlSlug, injectLanding, buildSite, slugify, campaignPath, pricePair, endedCampaignPage, campaignPage, isThinCampaign, landingDeals, dealsBlock, storesBlock, injectBetween, applyLanding, LANDING_DEALS, DEALS_START, DEALS_END, STORES_START, STORES_END, EVENTS, eventPhase, eventInSeason, shareStubPage, shareLinkPath, storeTitle, storeDescription, redirectPage, buildJurnal, emptyJurnalPage, jurnalPath, manat, JURNAL_HUB, JURNAL_TOP, catalogLinks } from "./generate.mjs";

const row = (id, store, pct, cat = "elektronika") => ({
  id,
  title: `Məhsul ${id}`,
  discount_type: "percent",
  discount_value: String(pct),
  end_date: "2026-10-31T19:59:59Z",
  end_date_estimated: false,
  source_url: `https://shop.az/${id}`,
  image_url: `https://shop.az/${id}.jpg`,
  stores: { slug: `${store}-seed`, name: store.toUpperCase() },
  categories: { slug: cat, name_az: "Elektronika" },
});

test("escapes HTML and never lets JSON-LD close its script tag", () => {
  assert.equal(esc(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  assert.ok(!jsonLd({ name: "</script><script>" }).slice(35, -9).includes("</script>"));
});

test("badge shows percent, amount, or a short label", () => {
  assert.equal(badge({ discount_type: "percent", discount_value: "49.6" }), "-50%");
  assert.equal(badge({ discount_type: "amount", discount_value: "30" }), "-30 ₼");
  assert.equal(badge({ discount_type: "gift", discount_label: "1+1" }), "1+1");
  assert.equal(badge({ discount_type: "gift", discount_label: "çox uzun bir kampaniya etiketi burada" }), "Endirim");
});

test("spreadByStore never puts one store first twice in a row while others remain", () => {
  const out = spreadByStore([row(1, "era", 40), row(2, "era", 30), row(3, "era", 20), row(4, "bravo", 10)]);
  assert.deepEqual(out.map((c) => c.id), [1, 4, 2, 3]);
});

test("store URLs drop the internal -seed suffix", () => {
  assert.equal(urlSlug("kontakt-home-seed"), "kontakt-home");
  assert.equal(urlSlug("myfilter-az-mv24szib"), "myfilter-az-mv24szib");
});

test("landing block is inserted once before the footer and replaced on later runs", () => {
  const html = "<main></main>\n      <footer>x</footer>";
  const once = injectLanding(html, "<!-- seo:start -->A<!-- seo:end -->");
  const twice = injectLanding(once, "<!-- seo:start -->B<!-- seo:end -->");
  assert.ok(once.indexOf("A") < once.indexOf("<footer"));
  assert.equal(twice.match(/seo:start/g).length, 1);
  assert.ok(twice.includes("B") && !twice.includes(">A<"));
});

test("middle way: hub, category and store pages each show their best few deals (2026-10-29)", () => {
  const { pages } = buildSite([row(1, "era", 40), row(2, "bravo", 20, "market")], new Date("2026-10-16T08:00:00Z"));
  assert.deepEqual(Object.keys(pages).sort(), [
    "/endirimler/", "/endirimler/11-11/", "/endirimler/black-friday/", "/endirimler/elektronika/", "/endirimler/market/",
    "/kampaniya/mehsul-1-1/", "/kampaniya/mehsul-2-2/",
    "/magaza/bravo/", "/magaza/era/", "/magazalar/",
  ]);
  assert.match(pages["/magaza/era/"], /<h1>ERA endirimləri və kataloqu<\/h1>/);
  assert.match(pages["/magaza/era/"], /<title>ERA endirimləri 40%-dək — 1 aksiya, kataloq \(Oktyabr 2026\) \| Dropy\.az<\/title>/);
  // Every page's footer links the strongest pages (internal linking, 2026-11-10).
  assert.match(pages["/magaza/era/"], /class="popular"><a href="\/magaza\/bravo\/">BRAVO endirimləri<\/a>/);
  assert.match(pages["/magaza/era/"], /class="intro"/);
  // Cards lead to our own campaign page; only that page links out to the store.
  assert.match(pages["/magaza/era/"], /href="\/kampaniya\/mehsul-1-1\/"/);
  assert.match(pages["/endirimler/"], /\| Dropy\.az</);
  assert.match(pages["/kampaniya/mehsul-1-1/"], /href="https:\/\/shop\.az\/1" rel="nofollow noopener"/);
  assert.match(pages["/endirimler/"], /<link rel="canonical" href="https:\/\/dropy\.az\/endirimler\/" \/>/);
  assert.doesNotMatch(Object.values(pages).join(""), /Bak[ıi]/);
});

test("campaign slugs are readable Latin and stable per id", () => {
  assert.equal(slugify("Qadın köynəyi İPƏK — Şəhər ÇAĞ!"), "qadin-koyneyi-ipek-seher-cag");
  assert.equal(campaignPath({ id: "07f873cf-e1e6", title: "Apple Watch Ultra 2" }), "/kampaniya/apple-watch-ultra-2-07f873cf/");
  assert.equal(campaignPath({ id: "abcdef12-9", title: "!!!" }), "/kampaniya/abcdef12/");
});

test("reads every price format the stores use", () => {
  assert.deepEqual(pricePair("1.688,00 ₼ → 1.343,00 ₼"), { oldPrice: 1688, newPrice: 1343 });
  assert.deepEqual(pricePair("1229.00 ₼ → 825.00 ₼"), { oldPrice: 1229, newPrice: 825 });
  assert.deepEqual(pricePair("27,00 ₼ → 9,50 ₼"), { oldPrice: 27, newPrice: 9.5 });
  assert.equal(pricePair("50%-dək endirim"), undefined);
});

test("a campaign page carries Product data with the real sale price", () => {
  const c = { ...row(1, "era", 25), discount_label: "1000 ₼ → 750 ₼" };
  const { pages } = buildSite([c], new Date("2026-10-16T08:00:00Z"));
  const html = pages[campaignPath(c)];
  assert.match(html, /"@type":"Product"/);
  assert.match(html, /"price":"750.00","priceCurrency":"AZN"/);
  assert.match(html, /<s>1000 ₼<\/s> <b>750 ₼<\/b>/);
});

test("an ended campaign page is noindex and points to live alternatives", () => {
  const html = endedCampaignPage(
    { path: "/kampaniya/x-1/", title: "Köhnə endirim", storeSlug: "era-seed", storeName: "ERA", catName: "Elektronika" },
    [row(2, "bravo", 30)],
    "2026-10-16T08:00:00Z",
  );
  assert.match(html, /<meta name="robots" content="noindex, follow" \/>/);
  assert.match(html, /artıq bitib/);
  assert.match(html, /href="\/kampaniya\/mehsul-2-2\/"/);
});

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

test("a deal that left the showcase but is still live keeps its URL, says 'in the app', and is noindex", () => {
  const entry = { path: "/kampaniya/x-1/", title: "Ütü", storeSlug: "era-seed", storeName: "ERA", catName: "Elektronika" };
  const html = endedCampaignPage(entry, [], "2026-10-31T00:00:00Z", { inApp: true });
  assert.match(html, /noindex, follow/);
  assert.match(html, /Dropy\.az tətbiqində bax/);
  assert.doesNotMatch(html, /bitib/);
  assert.match(html, /href="\/magaza\/era\/"/);
});

test("thin deal pages (no price, almost no text) are noindex; ones with a price are not", () => {
  const thin = { ...row(1, "era", 40), discount_label: "Endirim", description: "" };
  const priced = { ...row(2, "era", 40), discount_label: "100 ₼ → 80 ₼" };
  assert.equal(isThinCampaign(thin), true);
  assert.equal(isThinCampaign(priced), false);
  assert.match(campaignPage(thin, [], "2026-10-31T00:00:00Z"), /noindex, follow/);
  assert.doesNotMatch(campaignPage(priced, [], "2026-10-31T00:00:00Z"), /noindex/);
});

test("event pages always exist, fill with tagged deals and get linked from the hub in season (11.11, 2026-11-01)", () => {
  const rows = [row(1, "era", 40), row(2, "bravo", 30), { ...row(3, "kontakt", 25), event_tag: "11-11" }, { ...row(4, "era", 50), event_tag: "11-11" }];
  const nov5 = new Date("2026-11-05T10:00:00Z");
  const { pages } = buildSite(rows, nov5);
  const p = pages["/endirimler/11-11/"];
  assert.ok(p.includes("<h1>11.11 endirimləri 2026</h1>"));
  assert.ok(p.includes("Məhsul 3") && p.includes("Məhsul 4"));
  // Few tagged deals: the week's other big discounts fill the page under their own heading (2026-11-21).
  assert.ok(p.indexOf("Məhsul 4") < p.indexOf("həftəsinin digər böyük endirimləri") && p.includes("Məhsul 1<"));
  assert.ok(pages[campaignPath(rows[2])], "tagged deals get their own campaign page");
  assert.ok(pages["/endirimler/"].includes('href="/endirimler/11-11/"'));
  assert.ok(!pages["/endirimler/"].includes('href="/endirimler/black-friday/"'));
  const bf = pages["/endirimler/black-friday/"];
  assert.ok(bf.includes("mağazalar elan etdikcə") && bf.includes("Bu günün seçilmiş endirimləri"));
  assert.ok(!bf.includes("Bakı"));
});

test("event dates and phases: Black Friday 2026 is 27 November; 11.11 ends with the day in Baku", () => {
  const bf = EVENTS.find((e) => e.tag === "black-friday");
  assert.equal(bf.day(2026).toISOString().slice(0, 10), "2026-11-27");
  assert.equal(bf.day(2027).toISOString().slice(0, 10), "2027-11-26");
  const ev = EVENTS.find((e) => e.tag === "11-11");
  assert.equal(eventPhase(ev, new Date("2026-11-11T19:00:00Z")), "before");
  assert.equal(eventPhase(ev, new Date("2026-11-11T20:30:00Z")), "after");
  assert.equal(eventInSeason(ev, new Date("2026-10-30T12:00:00Z")), false);
  assert.equal(eventInSeason(ev, new Date("2026-11-01T12:00:00Z")), true);
  assert.equal(eventInSeason(ev, new Date("2026-11-13T12:00:00Z")), false);
});

test("store × category page appears only with enough deals, and the store page links to it (2026-11-10)", () => {
  const rows = [1, 2, 3, 4].map((i) => row(i, "kontakt", 10 * i)).concat([row(5, "kontakt", 15, "geyim"), row(6, "bravo", 20, "market")]);
  const { pages, storeCats } = buildSite(rows, new Date("2026-11-10T08:00:00Z"));
  assert.deepEqual(storeCats.map((sc) => sc.path), ["/magaza/kontakt/elektronika/"]);
  const p = pages["/magaza/kontakt/elektronika/"];
  assert.match(p, /<title>KONTAKT elektronika endirimləri \(Noyabr 2026\) — 4 aktiv, 40%-dək \| Dropy\.az<\/title>/);
  assert.match(p, /<h1>KONTAKT elektronika endirimləri<\/h1>/);
  assert.ok(!pages["/magaza/kontakt/geyim/"], "1 deal is too thin for its own page");
  assert.match(pages["/magaza/kontakt/"], /href="\/magaza\/kontakt\/elektronika\/"/);
  assert.match(pages["/endirimler/elektronika/"], /<title>Elektronika endirimləri \(Noyabr 2026\) — 4 aktiv, 40%-dək/);
});

test("sitemap index lists the three sitemaps", async () => {
  const { sitemapIndexXml, urlsetXml, monthYear } = await import("./generate.mjs");
  const idx = sitemapIndexXml(["sitemap-stores.xml", "sitemap-deals.xml"], "2026-11-10");
  assert.match(idx, /<sitemapindex/);
  assert.match(idx, /<loc>https:\/\/dropy\.az\/sitemap-stores\.xml<\/loc>/);
  assert.match(urlsetXml(["/magaza/era/"], "2026-11-10"), /<loc>https:\/\/dropy\.az\/magaza\/era\/<\/loc>/);
  assert.equal(monthYear(new Date("2026-11-30T21:00:00Z")), "Dekabr 2026"); // Baku is already 1 Dec
});

test("shared deal link page previews the deal's own photo and discount", () => {
  const c = { id: "6fb58678-a39e-4e51-bb22-198823071174", title: "Kukla <Barbie>", discount_type: "percent", discount_value: 40, image_url: "https://img.example/b.jpg", stores: { slug: "supertoys-seed", name: "Supertoys", logo_url: null } };
  assert.equal(shareLinkPath(c), "/a/k/6fb58678-a39e-4e51-bb22-198823071174/");
  const html = shareStubPage(c, "/kampaniya/kukla-barbie-6fb58678/");
  assert.ok(html.includes('<meta property="og:image" content="https://img.example/b.jpg" />'));
  assert.ok(html.includes('<meta property="og:title" content="-40% · Kukla &lt;Barbie&gt;" />'));
  assert.ok(html.includes('href="/kampaniya/kukla-barbie-6fb58678/"'));
  assert.match(html, /noindex/);
  assert.ok(html.includes('<script src="/assets/go.js"></script>'));
});

// assets/go.js: a phone without the app counts the invite code, then goes to
// its store with the code in Google Play's install referrer.
async function runGo(search, ua) {
  const { readFileSync } = await import("node:fs");
  const { runInNewContext } = await import("node:vm");
  const calls = { fetch: [], replace: [] };
  const ctx = {
    URLSearchParams,
    JSON,
    location: { search, replace: (u) => calls.replace.push(u) },
    navigator: { userAgent: ua, platform: "Linux", maxTouchPoints: 0 },
    document: { readyState: "complete", getElementById: () => null },
    fetch: (url, opts) => { calls.fetch.push({ url, body: JSON.parse(opts.body) }); return Promise.resolve(); },
    setTimeout: () => {},
  };
  ctx.window = ctx;
  runInNewContext(readFileSync(new URL("../assets/go.js", import.meta.url), "utf8"), ctx);
  ctx.dropyGo("deal");
  await new Promise((r) => setImmediate(r));
  return calls;
}

test("go.js counts a valid invite code and passes it to Google Play", async () => {
  const calls = await runGo("?r=hm68jd", "Mozilla/5.0 (Linux; Android 14)");
  assert.equal(calls.fetch.length, 1);
  assert.deepEqual(calls.fetch[0].body, { p_code: "HM68JD", p_platform: "android" });
  assert.equal(calls.replace.length, 1);
  assert.ok(decodeURIComponent(calls.replace[0]).endsWith("utm_campaign=deal&r=HM68JD"));
});

test("go.js skips counting without a valid code and still redirects", async () => {
  const calls = await runGo("?r=<bad>", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)");
  assert.equal(calls.fetch.length, 0);
  assert.deepEqual(calls.replace, ["https://apps.apple.com/az/app/id6819821532"]);
});

test("ItemList JSON-LD only links deals that have their own page", () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(`id${String(i).padStart(6, "0")}`, "kontakt", 10 + i));
  const { pages } = buildSite(rows, new Date("2026-11-15T08:00:00Z"));
  for (const [path, html] of Object.entries(pages)) {
    for (const [, url] of html.matchAll(/"url":"https:\/\/dropy\.az(\/kampaniya\/[^"]+)"/g)) {
      assert.ok(pages[url], `${path} links ${url}, which has no page`);
    }
  }
});

test("store title leads with the discount; description names real deals", () => {
  assert.equal(storeTitle("ERA", 50, 43, "Noyabr 2026"), "ERA endirimləri 43%-dək — 50 aksiya, kataloq (Noyabr 2026) | Dropy.az");
  assert.equal(storeTitle("ERA", 3, 0, "Noyabr 2026"), "ERA endirimləri — 3 aksiya, kataloq (Noyabr 2026) | Dropy.az");
  const items = [row("a1", "era", 43), row("a2", "era", 20), row("a3", "era", 10)];
  items[0].title = "Samsung Galaxy A55 smartfonu 8/256 GB qara rəngdə yeni model";
  const d = storeDescription("ERA", items, "Noyabr 2026");
  assert.match(d, /^ERA endirimləri, Noyabr 2026: Samsung Galaxy A55 smartfonu 8\/256 GB…? -43%, Məhsul a2 -20% və daha 1 aksiya\./);
});

test("redirect page forwards instantly and names the target as canonical", () => {
  const html = redirectPage("/kampaniya/yeni-ad-1234abcd/");
  assert.match(html, /http-equiv="refresh" content="0; url=\/kampaniya\/yeni-ad-1234abcd\/"/);
  assert.match(html, /rel="canonical" href="https:\/\/dropy\.az\/kampaniya\/yeni-ad-1234abcd\/"/);
});

test("Black Friday page answers when it is, names stores, and every page links to it in season (2026-11-21)", () => {
  const rows = [row(1, "era", 40), { ...row(2, "bravo", 30), event_tag: "black-friday" }];
  const { pages } = buildSite(rows, new Date("2026-11-21T08:00:00Z"));
  const bf = pages["/endirimler/black-friday/"];
  assert.match(bf, /<title>Black Friday 2026 — endirimlər, kampaniyalar, tarix \| Dropy\.az<\/title>/);
  assert.match(bf, /<h1>Black Friday endirimləri 2026 \(Qara Cümə\)<\/h1>/);
  assert.match(bf, /Black Friday 2026 nə vaxtdır\?/);
  assert.match(bf, /<b>27 noyabr, cümə<\/b>/);
  assert.match(bf, /30 noyabr — Kiber Bazar ertəsi \(Cyber Monday\) günü bitir/);
  assert.match(bf, /Hansı mağazalarda Black Friday endirimi var\?/);
  assert.match(bf, /"dateModified"/);
  assert.ok(!bf.includes("Bakı"));
  assert.ok(!bf.includes('class="season-bar"'), "no bar linking the page to itself");
  for (const path of ["/endirimler/", "/magaza/era/", campaignPath(rows[0])]) {
    assert.match(pages[path], /class="season-bar"><a href="\/endirimler\/black-friday\/">Black Friday 2026 endirimləri — 1 aksiya →/, path);
  }
  const off = buildSite(rows, new Date("2026-12-10T08:00:00Z")).pages;
  assert.ok(!off["/endirimler/"].includes("season-bar"));
});

const mItem = (i, pct, price, old) => ({
  id: `m${i}`, title: `Məhsul ${i}`, discount_type: "percent", discount_value: pct,
  discount_label: "", price, old_price: old, image_url: i % 2 ? `https://x.test/${i}.jpg` : null,
});
const market = (slug, name, n) => ({
  store: { slug, name, logo_url: "https://x.test/logo.png" },
  total: n,
  endsAt: "2026-12-02T19:59:59.999+00:00",
  subcats: [{ name: "Süd məhsulları və yumurta", count: 40 }],
  items: Array.from({ length: Math.min(n, 30) }, (_, i) => mItem(i, 60 - i, 3.49, 9.55)),
});

test("market jurnal pages: title with count and end day, prices, taste only, links between markets (2026-11-28)", () => {
  const now = new Date("2026-11-28T08:00:00Z");
  const { pages, live } = buildJurnal([market("araz-market-seed", "Araz Market", 593), market("bravo-seed", "Bravo", 562), market("empty-seed", "Boş", 0)], now);
  assert.equal(live.length, 2);
  const araz = pages[jurnalPath("araz-market-seed")];
  assert.equal(jurnalPath("araz-market-seed"), "/endirim-jurnali/araz-market/");
  assert.match(araz, /<title>Araz Market endirim jurnalı — 593 məhsul, 2 dekabrdək \(Noyabr 2026\) \| Dropy\.az<\/title>/);
  assert.match(araz, /<h1>Araz Market endirim jurnalı<\/h1>/);
  assert.match(araz, /<s>9,55 ₼<\/s> <b>3,49 ₼<\/b>/);
  assert.equal((araz.match(/<article class="card">/g) || []).length, JURNAL_TOP);
  assert.match(araz, /Qalan 569 məhsul Dropy\.az tətbiqində/);
  assert.match(araz, /href="\/endirim-jurnali\/bravo\/">Bravo <b>562<\/b>/);
  assert.match(araz, /Süd məhsulları və yumurta <b>40<\/b>/);
  assert.ok(!araz.includes("/kampaniya/"), "market items have no deal pages");
  assert.ok(!araz.includes("Bakı"));
  assert.ok(!pages[jurnalPath("empty-seed")], "no page for a market without a live catalog");
  const hub = pages[JURNAL_HUB];
  assert.match(hub, /<h1>Market endirim jurnalları<\/h1>/);
  assert.match(hub, /cəmi <b>1155<\/b> endirimli məhsul/);
  assert.match(hub, /href="\/endirim-jurnali\/araz-market\/">Araz Market endirim jurnalı<\/a>/);
});

test("store page links its jurnal and the footer links the hub when markets exist", () => {
  const { pages } = buildSite([row(1, "bravo", 20, "market")], new Date("2026-11-28T08:00:00Z"), { jurnalStores: new Map([["bravo-seed", 562]]) });
  assert.match(pages["/magaza/bravo/"], /href="\/endirim-jurnali\/bravo\/">BRAVO endirim jurnalı — 562 məhsul →/);
  assert.match(pages["/endirimler/"], /href="\/endirim-jurnali\/">Market endirim jurnalları<\/a>/);
  assert.ok(!buildSite([row(1, "bravo", 20)], new Date("2026-11-28T08:00:00Z")).pages["/endirimler/"].includes("/endirim-jurnali/"));
});

test("empty jurnal page keeps the URL but is noindex; manat uses comma", () => {
  assert.match(emptyJurnalPage("neptun-seed", "Neptun"), /noindex, follow/);
  assert.equal(manat(12.99), "12,99 ₼");
  assert.equal(manat(null), "");
});

test("catalog buttons: one PDF reads 'Jurnalı yüklə (PDF)', several show their titles, nofollow to the store's own file", () => {
  const one = catalogLinks([{ title: "Arazın Tıq-Tıq Xanımı", source_url: "https://araz.test/j.pdf", end_date: "2026-12-02T19:59:59Z" }], "Araz Market");
  assert.match(one, /<h2>Araz Market endirim jurnalını vərəqlə<\/h2>/);
  assert.match(one, /href="https:\/\/araz\.test\/j\.pdf" target="_blank" rel="nofollow noopener">Jurnalı yüklə \(PDF\)<\/a>/);
  const many = catalogLinks([
    { title: "Bravo- Hiper", source_url: "https://bravo.test/leaflet-5/", end_date: null },
    { title: "Bravo- Super", source_url: "https://bravo.test/s.pdf", end_date: null },
  ], "Bravo");
  assert.match(many, />Hiper jurnalı<\/a>/);
  assert.match(many, />Super jurnalı \(PDF\)<\/a>/);
  assert.match(catalogLinks([{ title: "Rahat Kataloqu (rahat_19_noyabr)", source_url: "https://r.test/a.pdf" }, { title: "Rahat 24-29", source_url: "https://r.test/b.pdf" }], "Rahat"), />Rahat Kataloqu \(PDF\)<\/a>/);
  assert.equal(catalogLinks([], "X"), "");
  assert.equal(catalogLinks([{ title: "bad", source_url: "javascript:alert(1)" }], "X"), "");
  const page = buildJurnal([{ ...market("oba-seed", "OBA Market", 40), catalogs: [{ title: "J", source_url: "https://oba.test/j.pdf", end_date: null }] }], new Date("2026-11-28T08:00:00Z")).pages["/endirim-jurnali/oba/"];
  assert.match(page, /class="catalogs"/);
});
