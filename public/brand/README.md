# AutoL10n — Icon Assets

SVG icons are fully scalable — one file works at any size. Recommended
display sizes: **16 · 24 · 32 · 48 · 64 · 128 · 256 px**.

## Files

| File | Background | Globe | Arrow | Use when… |
|---|---|---|---|---|
| `icon-light.svg` | Cream `#fffdf7` | Ink `#2b2d42` | Orange `#fb8500` | Default; light pages, favicons |
| `icon-dark.svg` | Ink `#2b2d42` | Cream `#fffdf7` | Orange `#fb8500` | Dark-mode pages, dark cards |
| `icon-orange.svg` | Orange `#fb8500` | Cream `#fffdf7` | Ink `#2b2d42` | Matching the navbar brand colour |
| `icon-mark.svg` | Transparent | Ink `#2b2d42` | Orange `#fb8500` | Inline embedding over light surfaces |
| `icon-mark-white.svg` | Transparent | White | White | Over dark or photo backgrounds |
| `icon-monochrome.svg` | Cream `#fffdf7` | Ink `#2b2d42` | Ink `#2b2d42` | Print, single-colour use |

## Brand colours

| Token | Hex | Usage |
|---|---|---|
| Ink | `#2b2d42` | Text, borders, dark backgrounds |
| Canvas | `#fffdf7` | Page background |
| Primary (Orange) | `#fb8500` | Arrow, primary buttons |
| Secondary (Lime) | `#70e000` | Success states, download button |

## Embedding in HTML

```html
<!-- As an <img> tag -->
<img src="/brand/icon-light.svg" width="32" height="32" alt="AutoL10n">

<!-- Inline (allows CSS colour overrides) -->
<!-- Copy the SVG source directly into your HTML -->
```

## Converting to PNG

If you need raster versions, open any SVG in a browser and use the
DevTools to screenshot at the desired pixel density, or use a tool such
as [Squoosh](https://squoosh.app/) or `rsvg-convert`:

```bash
rsvg-convert -w 512 -h 512 icon-light.svg -o icon-512.png
```
