# Design tokens (shared by web and Android)

Restrained, no gradients, no glow, no glassmorphism. One primary colour, one neutral scale, one status colour family for verdicts.

## Colour

| Token | Light | Use |
|---|---|---|
| `--color-primary` | `#1E3A5F` | brand, primary actions, links |
| `--color-primary-hover` | `#16304F` | hover |
| `--color-primary-active` | `#102640` | pressed |
| `--color-on-primary` | `#FFFFFF` | text on primary |
| `--color-neutral-0` | `#FFFFFF` | surface |
| `--color-neutral-50` | `#F6F5F2` | page background (warm) |
| `--color-neutral-100` | `#ECEAE4` | subtle fill, dividers |
| `--color-neutral-300` | `#C9C5BA` | borders |
| `--color-neutral-500` | `#7A766B` | secondary text (use only at 4.5:1 or larger sizes) |
| `--color-neutral-700` | `#46433B` | body text |
| `--color-neutral-900` | `#1B1A17` | headings |
| `--color-safe` | `#2E6B4F` | safe verdict |
| `--color-caution` | `#8A5A00` | caution verdict |
| `--color-danger` | `#B3261E` | danger verdict, destructive actions |

Dark theme is optional; if shipped it must be a token swap with AA contrast.

## Type

Display: Fraunces (variable, SIL OFL). Text: Inter (SIL OFL). Mono: JetBrains Mono (SIL OFL). Self-hosted files only. Scale (px, line height): 12/16, 14/20, 16/24, 20/28, 24/32, 32/40, 44/52. Tabular numerals (`font-variant-numeric: tabular-nums`) for every amount.

## Space, radius, motion

Space: 4, 8, 12, 16, 24, 32, 48, 64. Radius: 4, 8, 12. Motion: 120 ms, 200 ms, 320 ms; ease-out for entrances, spring for state changes; all disabled under `prefers-reduced-motion`. Nothing loops forever.

## Brand

Name Selvedge. Mark: a hand-built SVG of a woven edge, a square field of vertical warp threads closed on the right by a continuous looped weft (the selvedge). Wordmark in Fraunces. The mark must read at 16 px. No emoji and no icon-library glyphs for the brand; functional UI icons are custom SVG on a 24-unit grid with a 1.75 stroke and round joins.
