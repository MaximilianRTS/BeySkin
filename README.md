# BeySkin

> Free, unofficial sticker & label editor for spinning-top battle gear – design, preview in 3D, print.
> Successor of [BeyBattlePass](https://github.com/MaximilianRTS/BeyBattlePass) (V1).
> Live: https://maximilianrts.github.io/BeySkin/

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](https://www.typescriptlang.org/)

BeySkin is a fan project and is **not affiliated with Takara Tomy, Hasbro or d-rights**.
BEYBLADE is a trademark of its respective owners and is only used to describe compatibility.

## Features

**Editor**
- Templates: Battle Pass label (traced 1:1 from the original) and round gear chip sticker (Ø 17.1 mm) with recolourable vector frames – both measured on the real parts. Each template keeps its own draft; designs can be transferred between templates.
- Layers: images, text (outline, fonts, alignment), solid/gradient backgrounds. Blend modes, opacity, flip, lock, hide, drag-to-reorder.
- Direct manipulation on the canvas: move, scale and rotate handles, pinch & two-finger rotate on touch, snapping to the centre, zoom to cursor.
- Undo/redo, keyboard shortcuts, drop/paste images, automatic save (IndexedDB), DPI warning for low-resolution images.

**Output**
- Print sheet PDF (A4/Letter, 300/600 dpi): packs any number of labels and stickers of mixed sizes onto as few pages as possible (small stickers fill the gaps next to large labels), cut line, crop marks, shape-following bleed, calibration ruler and printer scale correction.
- PNG (300/600 dpi, transparent) and SVG with vector cut path for cutting plotters (Cricut, Silhouette, Brother).
- Project backup/restore as JSON – also imports V1 (BeyBattlePass) project files.

**Sticker library** – original vector shapes (bolts, flames, bursts, crowns, frames …) and pattern backgrounds (speed lines, hex, carbon, halftone …), free to use.

**3D preview** – live texture on a Blender model of the Battle Pass device (measured with calipers: 128.71 × 33.87 × 20.16 mm).

**Sharing without a server** – nothing is ever uploaded:
- *Share link*: the design is compressed into the URL fragment (`#/s/…`), which browsers never send to the web server. Uploaded images are left out and become placeholders the recipient fills with their own pictures (remix).
- *Share file*: PNG or project file via the device's share sheet (Web Share API) or download.

## No hosting of user content – by design

BeySkin stores nothing on a server: no accounts, no uploads, no gallery. That means no moderation, no hosting liability and no backend costs. A complete Supabase gallery (pre-moderation, likes, reports, admin queue, security-reviewed RLS) is archived in [`extras/gallery-supabase/`](extras/gallery-supabase/README.md) in case it is ever needed.

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests (vitest)
npm run build     # type check + production build
```

Requires Node.js ≥ 20.19 or ≥ 22.12.

## Hosting

Static site only – GitHub Pages via `.github/workflows/deploy.yml` (push to `main` runs tests, type check, build and deploys). Free.
Set the repository **variable** `VITE_CONTACT_EMAIL` (Settings → Secrets and variables → Actions → Variables) for the legal pages; locally use `.env.local` (see `.env.example`).

## Project structure

```
src/
  templates/     sticker templates (outline polygons in mm)
  lib/           model, rendering, assets (IndexedDB), PDF/PNG/SVG export, sheet packing,
                 project files, share links; lib/library = built-in shapes & patterns
  stores/        Pinia stores: editor (undo/redo, autosave), library (my designs)
  components/    editor/, common/
  views/         Editor, shared-link view, legal pages
  legal/         imprint, privacy policy, terms, rights notice (DE/EN) – fill in placeholders!
  i18n/locales/  <lang>/<namespace>.json
public/models/   battlepass.glb (built by scripts/blender/build_battlepass.py)
scripts/         outline tracing, Blender model generator
extras/          archived Supabase gallery (not built)
```

### Adding a template

Add an entry to `src/templates/index.ts` (use `roundedRect`, `ellipse` or a traced polygon from `scripts/trace-outline.py`) and a name in `src/i18n/locales/*/templates.json`. Set `measured: true` once the size has been verified on the real part.

### Rebuilding the 3D model

```bash
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python scripts/blender/build_battlepass.py
```

## Before going public

- Fill in the operator address/contact in `src/legal/legalInfo.ts` and `VITE_CONTACT_EMAIL`.
- Have the terms of use and privacy policy checked (see comments in `src/legal/`).

## Credits

- Gear chip frame templates (vectorised in `src/lib/library/chipFrames.ts`): **Blader R** ([u/Dull-Tough-5511](https://www.reddit.com/user/Dull-Tough-5511/)) – all rights remain with the creator.
- Fonts: Bangers, Russo One, Anton (SIL Open Font License, via Fontsource).

## License

MIT – see [LICENSE](LICENSE). Author: **Maximilian Reitsberger** ([@MaximilianRTS](https://github.com/MaximilianRTS)).
