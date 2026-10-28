import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, jsonLd, badge, spreadByStore, urlSlug, injectLanding, buildSite, slugify, campaignPath, pricePair, endedCampaignPage, landingDeals, dealsBlock, storesBlock, injectBetween, applyLanding, LANDING_DEALS, DEALS_START, DEALS_END, STORES_START, STORES_END } from "./generate.mjs";

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

test("showcase mode: hub, store directory and showcase deals only (2026-10-29)", () => {
  const { pages } = buildSite([row(1, "era", 40), row(2, "bravo", 20, "market")], new Date("2026-10-16T08:00:00Z"));
  // No category pages, and store pages list no deals: the full catalog is the app's.
  assert.deepEqual(Object.keys(pages).sort(), [
    "/endirimler/",
    "/kampaniya/mehsul-1-1/", "/kampaniya/mehsul-2-2/",
    "/magaza/bravo/", "/magaza/era/", "/magazalar/",
  ]);
  assert.match(pages["/magaza/era/"], /<h1>ERA endirimləri<\/h1>/);
  assert.doesNotMatch(pages["/magaza/era/"], /href="\/kampaniya\//);
  // Hub cards lead to our own campaign page; only that page links out to the store.
  assert.match(pages["/endirimler/"], /href="\/kampaniya\/mehsul-1-1\/"/);
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
