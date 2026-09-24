# Turns the Sleek "Dropy Web: Landing" / "Dropy Web: Support" exports into a
# static site: precompiled Tailwind CSS instead of the in-browser compiler,
# Iconify icons inlined as SVG, remote image vendored, real links/metadata.
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
# Output = the site root (this build/ folder's parent) unless given.
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(HERE)

PAGES = [
    ("sleek-landing.html", "index.html", {
        "title": "Dropy — Azərbaycandakı bütün endirimlər bir tətbiqdə",
        "description": "Dropy mağazaların öz saytlarındakı aktual endirim və kampaniyaları bir tətbiqdə toplayır. Pulsuz.",
        "path": "/",
    }),
    ("sleek-support.html", "destek/index.html", {
        "title": "Dəstək — Dropy",
        "description": "Dropy tətbiqi ilə bağlı suallar və əlaqə: support@dropy.az",
        "path": "/destek/",
    }),
]

icon_cache = {}


def icon_svg(name, attrs):
    if name not in icon_cache:
        prefix, icon = name.split(":")
        url = f"https://api.iconify.design/{prefix}/{icon}.svg"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 dropy-site-build"})
        with urllib.request.urlopen(req) as r:
            icon_cache[name] = r.read().decode("utf-8")
    svg = icon_cache[name]
    w = re.search(r'width="([^"]+)"', attrs)
    h = re.search(r'height="([^"]+)"', attrs)
    cls = re.search(r'class="([^"]+)"', attrs, re.S)
    size = f'width="{w.group(1) if w else "1em"}" height="{h.group(1) if h else "1em"}"'
    svg = re.sub(r'\swidth="[^"]*"', "", svg, count=1)
    svg = re.sub(r'\sheight="[^"]*"', "", svg, count=1)
    extra = f' class="{" ".join(cls.group(1).split())} shrink-0"' if cls else ' class="shrink-0"'
    return svg.replace("<svg", f'<svg {size}{extra} aria-hidden="true" focusable="false"', 1)


GOOGLE_PLAY_BADGE = re.compile(
    r'<a\s+href="#"\s+class="h-12 px-4 rounded-xl bg-card border border-border hover:border-primary/50 text-foreground flex items-center gap-3 transition-colors shadow-2xs"\s*>(.*?Google Play.*?</div>)</a\s*>',
    re.S,
)
SOON_PILL = (
    '<span class="ml-1 text-[9px] font-black uppercase tracking-wider bg-primary/10 '
    'text-primary px-2 py-0.5 rounded-full border border-primary/20">Tezliklə</span>'
)

os.makedirs(os.path.join(OUT, "assets"), exist_ok=True)
tailwind_input = None

for src, dest, meta in PAGES:
    html = open(os.path.join(HERE, src), encoding="utf-8").read()

    style = re.search(r'<style type="text/tailwindcss">(.*?)</style>', html, re.S).group(1)
    tailwind_input = tailwind_input or style
    html = re.sub(r'\s*<style type="text/tailwindcss">.*?</style>', "", html, flags=re.S)
    html = re.sub(r'\s*<script src="https://cdn\.jsdelivr\.net/npm/@tailwindcss/browser@4"></script>', "", html)
    html = re.sub(r'\s*<script src="https://code\.iconify\.design/[^"]+"></script>', "", html)
    html = html.replace("</head>", '    <link rel="stylesheet" href="/assets/site.css" />\n  </head>', 1)

    html = re.sub(
        r'<iconify-icon\s+icon="([^"]+)"([^>]*)>\s*</iconify-icon\s*>',
        lambda m: icon_svg(m.group(1), m.group(2)),
        html,
        flags=re.S,
    )

    for url in set(re.findall(r'src="(https://[^"]+\.(?:jpe?g|png|webp))"', html)):
        name = url.rsplit("/", 1)[1]
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 dropy-site-build"})
        with urllib.request.urlopen(req) as r, open(os.path.join(OUT, "assets", name), "wb") as f:
            f.write(r.read())
        html = html.replace(url, f"/assets/{name}")

    # Neither store listing is live yet: Google Play gets the same
    # non-link "Tezliklə" treatment the design already gives App Store.
    html, n = GOOGLE_PLAY_BADGE.subn(
        lambda m: '<div class="h-12 px-4 rounded-xl bg-card border border-border text-foreground '
        'flex items-center gap-3 shadow-2xs opacity-85 relative">'
        + m.group(1).replace(">Mövcuddur<", ">Yükləmə<")
        + SOON_PILL + "</div>",
        html,
    )
    if dest == "index.html":
        assert n == 1, "Google Play badge not found"

    # Copy/mockup corrections: no unverifiable reach claims before launch,
    # and the hero mockup's Bravo card shows Bravo's real current campaign
    # (its own banner, its real "Yeni endirim" label and end date) instead
    # of a stock cosmetics photo under a groceries caption.
    if dest == "index.html":
        fixes = [
            ("minlərlə real alıcıya çatdırın", "birbaşa alıcılara çatdırın"),
            ('alt="Bravo Həftəlik Endirimlər"', 'alt="Bravo-da Brend Festival"'),
            (">-30%</span", ">Yeni endirim</span"),
            ("Həftəlik seçilmiş ərzaq və məişət endirimləri", "Bravo-da Brend Festival!"),
            (">3 gün qalıb</span", ">30 sentyabradək</span"),
        ]
        for old, new in fixes:
            assert old in html, old
            html = html.replace(old, new, 1)
        bravo = "https://www.bravosupermarket.az/site/assets/files/4060/artboard_2.png"
        req = urllib.request.Request(bravo, headers={"User-Agent": "Mozilla/5.0 dropy-site-build"})
        with urllib.request.urlopen(req) as r, open(os.path.join(OUT, "assets", "bravo-brend-festival.png"), "wb") as f:
            f.write(r.read())
        html = re.sub(r'src="/assets/[^"]+\.jpe?g"', 'src="/assets/bravo-brend-festival.png"', html, count=1)

    html = html.replace('<html lang="en">', '<html lang="az">', 1)
    html = re.sub(r"<title>.*?</title>", f"<title>{meta['title']}</title>", html, count=1)
    head_meta = (
        f'    <meta name="description" content="{meta["description"]}" />\n'
        f'    <link rel="canonical" href="https://dropy.az{meta["path"]}" />\n'
        f'    <meta property="og:title" content="{meta["title"]}" />\n'
        f'    <meta property="og:description" content="{meta["description"]}" />\n'
        f'    <meta property="og:url" content="https://dropy.az{meta["path"]}" />\n'
        '    <meta property="og:type" content="website" />\n'
        '    <link rel="icon" href="/assets/icon.png" />\n'
    )
    html = html.replace("<title>", head_meta + "    <title>", 1)

    # Real destinations for the design's placeholder anchors, chosen by the
    # link's own visible text. The web seller portal doesn't exist yet, so
    # "Mağazanı əlavə et" sends people to the app download section for now.
    html = html.replace('href="#destek"', 'href="/destek/"')
    if dest != "index.html":
        html = html.replace('href="#biznes"', 'href="/#biznes"').replace('href="#yukle"', 'href="/#yukle"')
    targets = [("Mağazanı əlavə et", "/#yukle"), ("Tətbiqi yüklə", "/#yukle"),
               ("Biznes üçün", "/#biznes"), ("Dəstək", "/destek/"), ("Dropy", "/")]

    def real_href(m):
        text = re.sub(r"<[^>]+>|\s+", " ", m.group(2))
        for label, href in targets:
            if label in text:
                return f'<a href="{href}"{m.group(1)}{m.group(2)}</a'
        return m.group(0)

    html = re.sub(r'<a\s+href="#"(.*?>)(.*?)</a', real_href, html, flags=re.S)

    path = os.path.join(OUT, dest)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(html)
    print("wrote", dest, "remaining href=#:", html.count('href="#"'))

# Tailwind v4 CLI input: the design's own theme/tokens, minus the mockup-only
# global scrollbar hiding (a real site must keep its scrollbars).
tailwind_input = re.sub(r"/\* Hide scrollbars \*/.*?display: none;\s*}", "", tailwind_input, flags=re.S)
tailwind_input = tailwind_input.replace("iconify-icon:not([width]):not([height])", "svg:not([width]):not([height])")
# The design uses `font-heading` / `font-sans` classes against :root font
# variables, which Sleek's renderer resolves but a plain Tailwind build
# doesn't generate — define them explicitly, with real fallback stacks.
font_utilities = """
@utility font-heading { font-family: var(--font-heading), Georgia, "Times New Roman", serif; }
@utility font-sans { font-family: var(--font-sans), -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
body { font-family: var(--font-sans), -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
"""
open(os.path.join(HERE, "input.css"), "w", encoding="utf-8").write(
    '@import "tailwindcss" source(none);\n@source "' + OUT.replace("\\", "/") + '/**/*.html";\n' + tailwind_input + font_utilities
)
print("icons inlined:", len(icon_cache))

# Drop vendored images no page references any more (e.g. the design's stock
# photo the Bravo mockup fix replaced).
pages_html = "".join(open(os.path.join(OUT, d), encoding="utf-8").read() for _, d, _ in PAGES)
for name in os.listdir(os.path.join(OUT, "assets")):
    if name not in ("site.css", "icon.png") and f"/assets/{name}" not in pages_html:
        os.remove(os.path.join(OUT, "assets", name))
        print("removed unused", name)
