# RevForgeHQ — Brand Guidelines

**Single source of truth for every page on revforgehq.com.** When you build a
new page, link [`/brand/brand.css`](../brand/brand.css) and use the canonical
markup below. Do **not** hand-roll the wordmark, colors, or fonts per page —
that drift is exactly what produced the off-brand report header (orange "Forge").

Live reference: **https://www.revforgehq.com/brand/**

---

## 1. The wordmark

`RevForgeHQ` is **one word**. "Forge" is **gold (`#d4b878`) and italic**; "Rev"
and "HQ" are cream (`#f4ede0`). Display font is **Playfair Display 700**
(Georgia is the system fallback).

✅ **Canonical HTML** (copy this exactly):

```html
<link rel="stylesheet" href="/brand/brand.css">

<span class="rfhq-lockup">
  <span class="rfhq-wm">Rev<i>Forge</i>HQ</span>
  <span class="rfhq-pill">RADAR</span>   <!-- optional product pill; omit for the parent brand -->
</span>
```

- Resize by setting `font-size` on `.rfhq-lockup` (default `19px`) — everything
  inside (gap, pill) scales with it.
- The wordmark **must** stay wrapped in `.rfhq-wm` (one flex item) so the
  lockup's gap doesn't split `Rev` / `Forge` / `HQ`.
- On a light surface add `class="rfhq-lockup on-light"`.

### Don't
- ❌ Don't color "Forge" with the orange accent (`#ff6b35`). Orange is for
  CTAs/links only. "Forge" is **gold**.
- ❌ Don't make "Forge" upright. It is always italic.
- ❌ Don't add spaces: it's `RevForgeHQ`, never `Rev Forge HQ`.
- ❌ Don't put the wordmark in the sans/UI font.

### Logo (mark + wordmark) as an image
For nav bars and larger marks, use the vector lockup instead of text:
`/assets/brand/svg/lockup-horizontal-light.svg`. Square/avatar contexts use the
Triad cube mark: `/assets/brand/svg/mark-light.svg`. Full asset pack and all
variants: [`/assets/brand/README.txt`](../assets/brand/README.txt).

---

## 2. Color

| Token | Hex | Use |
|-------|-----|-----|
| `--rfhq-cream` | `#f4ede0` | Wordmark Rev/HQ, primary text on dark |
| `--rfhq-gold` | `#d4b878` | Wordmark "Forge", highlights, KPI values |
| `--rfhq-bronze` | `#8a7444` | Tertiary, cube left face |
| `--rfhq-ink` | `#0b0e14` | Primary dark background |
| `--rfhq-ink-2` | `#121723` | Elevated panels/cards |
| `--rfhq-line` | `#232c3f` | Hairline borders |
| `--rfhq-muted` | `#8b97ad` | Secondary text |
| `--rfhq-accent` | `#ff6b35` | **CTAs, links, UI accents only** |
| `--rfhq-accent-2` | `#ffa06b` | Hover / secondary accent |

The cube Triad: top face cream `#f4ede0`, right face gold `#d4b878`, left face
bronze `#8a7444`.

---

## 3. Typography

| Role | Family | Notes |
|------|--------|-------|
| Display / wordmark | **Playfair Display** 700 (italic for "Forge") | `--rfhq-font-display`; Georgia fallback |
| Body / UI / nav | **Inter** 400–700 | `--rfhq-font-sans` |
| Eyebrow / technical | **JetBrains Mono** 500 | `--rfhq-font-mono`; uppercase, letter-spaced |

Web font link (optional but recommended for the display face):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&display=swap">
```

---

## 4. Favicon / app icons

Already standardized and wired site-wide (see `scripts/gen-favicons.mjs`): the
Triad cube on the brand indigo→navy gradient. Block for `<head>`:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
```

---

## 5. New-page checklist

1. `<link rel="stylesheet" href="/brand/brand.css">` in `<head>`.
2. Favicon block (above).
3. Use `.rfhq-lockup` for the wordmark — never reinvent it.
4. Use the `--rfhq-*` tokens for color; reserve orange for CTAs/links.
5. Body/UI in Inter; any wordmark/headline serif in Playfair Display.

## 6. Conformance status

- ✅ Radar app/auth pages (`/radar/*`) — gold-italic lockup, matches spec.
- ✅ Generated AI-visibility reports (`make_reports.py`) — fixed to gold-italic
  (was orange-upright).
- ▶ Going forward, prefer linking `/brand/brand.css` over per-page inline copies
  so there is exactly one definition to change.
