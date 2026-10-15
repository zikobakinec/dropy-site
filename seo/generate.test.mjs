import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, jsonLd, badge, spreadByStore, urlSlug, injectLanding, buildSite } from "./generate.mjs";

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

test("builds hub, category, store and store-index pages with real links", () => {
  const { pages } = buildSite([row(1, "era", 40), row(2, "bravo", 20, "market")], new Date("2026-10-16T08:00:00Z"));
  assert.deepEqual(Object.keys(pages).sort(), ["/endirimler/", "/endirimler/elektronika/", "/endirimler/market/", "/magaza/bravo/", "/magaza/era/", "/magazalar/"]);
  assert.match(pages["/magaza/era/"], /<h1>ERA endirimləri<\/h1>/);
  assert.match(pages["/magaza/era/"], /href="https:\/\/shop\.az\/1" rel="nofollow noopener"/);
  assert.match(pages["/endirimler/"], /<link rel="canonical" href="https:\/\/dropy\.az\/endirimler\/" \/>/);
  assert.doesNotMatch(Object.values(pages).join(""), /Bak[ıi]/);
});
