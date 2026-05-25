# RevForgeHQ — Logo Asset Pack · v2

## Wired on revforgehq.com
- Nav: svg/lockup-horizontal-light.svg (transparent, compact — no tagline)
- Favicon: svg/mark-light.svg (also copied to site root favicon.svg)
- Source exports: png/favicon/, png/social/, png/*-source/
- Source pack: ~/Downloads/revforge-logo 2

The complete "Triad" mark, matched to the typography and palette of
**revforgehq.com**. All marks are vector SVG (scalable to any size); favicons
and social assets are also provided as rasterized PNG.

> **What changed in v2** — the wordmark is now one word (`RevForgeHQ`),
> typography is Playfair Display + Inter (matching the live site), and the
> palette has shifted from oxblood to a warm cream / gold / bronze system to
> match the site's dark-first hero treatment.

---

## What's in here

### `marks/` — the mark, on its own
The Triad mark with no wordmark. Use for square contexts (avatars, app icons).

- `triad-primary.svg` — **Default for dark surfaces.** Cream + gold + bronze. Includes ink background.
- `triad-primary-light.svg` — **For cream/paper surfaces.** Ink + bronze + gold (no background).
- `triad-tonal-gold.svg` — All-warm. Quietest option when color must not compete.
- `triad-mono-ink.svg` — Solid ink. Single-color print (engraving, deboss).
- `triad-mono-gold.svg` — Solid gold. Brand accent · single color.
- `triad-mono-cream.svg` — Solid cream on ink. For dark surfaces, single color.
- `triad-outline.svg` — Line only (on light). Embroidery, foil, screen print.
- `triad-outline-cream.svg` — Line only (on dark).
- `triad-knockout.svg` — Solid silhouette. Stickers, dies, debossing.

### `lockups/` — mark + wordmark
The mark paired with the **RevForgeHQ** wordmark. The default for nav bars,
business cards, deck masters.

- `lockup-horizontal-on-dark.svg` — **Default.** For the live site's dark hero.
- `lockup-horizontal-on-light.svg` — For cream / paper surfaces.
- `lockup-horizontal-mono-ink.svg` — Single color, light surface.
- `lockup-horizontal-mono-cream.svg` — Single color, dark surface.
- `lockup-vertical-on-dark.svg` / `lockup-vertical-on-light.svg` — Stacked.

### `wordmark/` — wordmark only
- `wordmark-on-dark.svg` / `wordmark-on-light.svg` — Primary, both surfaces.
- `wordmark-mono-ink.svg` / `wordmark-mono-cream.svg` — Single color.

### `favicon/`
- `favicon.svg` — **Modern browsers.** Cream-on-ink Triad, rendered at any size.
- `favicon-light.svg` — Light-mode app contexts.
- `favicon-16.png` / `favicon-32.png` / `favicon-64.png` — Browser tabs.
- `favicon-180.png` — `apple-touch-icon` (iOS home screen).
- `favicon-192.png` / `favicon-512.png` — PWA manifest icons.

### `social/`
- `avatar-1080-on-dark.svg/.png` — **LinkedIn / X / Instagram profile pic.** 1080×1080.
- `avatar-1080-on-light.svg/.png` — Same, cream surface.
- `og-image-1200x630-dark.svg/.png` — **Open Graph / Twitter card.** Default dark.
- `og-image-1200x630-light.svg/.png` — Light surface variant.

---

## Typography (matches revforgehq.com)

| Use            | Family             | Where         |
| -------------- | ------------------ | ------------- |
| Display / wordmark | **Playfair Display** 700 (italic for "Forge") | Headlines, lockups, wordmark |
| Body / nav         | **Inter** 400–700  | Body text, nav, UI |
| Technical / mono   | **JetBrains Mono** 500 | Eyebrows, tagline, technical |

All three are free on Google Fonts. **Install them locally** if you'll be
exporting from design tools (Figma, Illustrator) — without the fonts, the
SVG wordmark will fall back to the closest system serif/mono.

For web use, link in `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## Color palette (matches revforgehq.com)

| Name        | Hex       | Use                                          |
| ----------- | --------- | -------------------------------------------- |
| **Ink**     | `#0d0c0a` | Page background (dark-first), type on light  |
| **Cream**   | `#f4ede0` | Foreground text on ink, alt page background  |
| **Gold**    | `#d4b878` | Brand accent (italic "Forge", CTAs)          |
| **Bronze**  | `#8a7444` | Third Triad facet, supporting accent         |
| **Muted**   | `#a09682` | Subdued text, dividers, eyebrows             |

---

## Quick HTML snippet — full favicon + OG kit

```html
<head>
  <link rel="icon" type="image/svg+xml" href="/favicon/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon/favicon-180.png">
  <meta property="og:image" content="/social/og-image-1200x630-dark.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="/social/og-image-1200x630-dark.png">
</head>
```

---

RevForgeHQ · Brand Kit · v2 · site-matched
