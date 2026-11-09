import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, jsonLd, badge, spreadByStore, urlSlug, injectLanding, buildSite, slugify, campaignPath, pricePair, endedCampaignPage, campaignPage, isThinCampaign, landingDeals, dealsBlock, storesBlock, injectBetween, applyLanding, LANDING_DEALS, DEALS_START, DEALS_END, STORES_START, STORES_END, EVENTS, eventPhase, eventInSeason } from "./generate.mjs";

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
  assert.match(pages["/magaza/era/"], /<title>ERA endirimləri və kataloqu \(Oktyabr 2026\) — 1 aktiv, 40%-dək \| Dropy\.az<\/title>/);
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
  assert.ok(p.includes("Məhsul 3") && p.includes("Məhsul 4") && !p.includes("Məhsul 1<"));
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
