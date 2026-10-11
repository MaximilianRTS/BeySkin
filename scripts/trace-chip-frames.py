"""Vectorise the round Gear Chip sticker frame PNGs into SVG path data.

Usage:
    python scripts/trace-chip-frames.py [--preview DIR]

Reads the four frame templates from StickerBilder/ and writes
src/lib/library/chipFrames.ts. Each frame is split into four separately
paintable regions (all coordinates in a 100x100 box, circle centre 50,50,
radius 50, meant to be filled with fill-rule evenodd):

  ring    all opaque pixels (alpha > 127): the black frame INCLUDING the white
          elements. Painted first; accent goes on top -> no hairline gaps.
  accent  opaque light pixels (alpha > 127 and luminance > 127): the white
          lines, bars, triangles.
  center  the transparent connected component containing the image centre
          (inner opening).
  band    everything transparent inside the circle (radius <= 0.998 R) that is
          not part of `center` (the colour band).

band and center are dilated by ~0.5 original px so they tuck under the ring.
band and center are genuinely separate transparent components in all four
templates (the black ring fully separates them, centre opening reaches only
~0.70 R while the band starts beyond ~0.86 R), so no artificial split along
the inner ring radius is needed; the script verifies this and aborts if not.

Tracing: alpha / white-coverage (alpha*luma) are lightly smoothed, bilinearly
upsampled 8x and thresholded at 0.5 (sub-pixel accurate edges), traced with
cv2.findContours (RETR_CCOMP, holes become own subpaths), simplified with
approxPolyDP (<= ~0.15 original px) and shifted outward by half a hi-res pixel
to undo the pixel-centre bias of findContours.

Needs opencv-python, numpy, pillow (and pymupdf for --preview / IoU report).
Frame templates by Blader R (u/Dull-Tough-5511).
"""
import argparse
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC_DIR = os.path.join(ROOT, 'StickerBilder')
OUT_TS = os.path.join(ROOT, 'src', 'lib', 'library', 'chipFrames.ts')

FRAMES = [
    ('chip-textless-left', 'Gear Chip Sticker Template [Textless toy version] (Left).png'),
    ('chip-textless-right', 'Gear Chip Sticker Template [Textless toy version] (Right).png'),
    ('chip-anime-left', 'Gear Chip Sticker Template [Anime version] (Left).png'),
    ('chip-anime-right', 'Gear Chip Sticker Template [Anime version] (Right).png'),
]

S = 8               # hi-res upscale factor
EPS_PX = 0.18      # approxPolyDP tolerance in original pixels
MIN_AREA_PX = 4.0   # drop specks smaller than this (original px^2)
SMOOTH = 0.25       # gaussian sigma (original px) applied before upscaling
DILATE_PX = 0.5     # band/center grow under the ring (original px)
BAND_R = 0.998      # band is clipped at this fraction of the circle radius


# --------------------------------------------------------------------------
# masks
# --------------------------------------------------------------------------
def load_fields(path):
    """Return (alpha, white) float32 [0,1] fields, square-normalised size N."""
    img = np.array(Image.open(path).convert('RGBA')).astype(np.float32) / 255.0
    h, w = img.shape[:2]
    n = max(w, h)
    alpha = img[..., 3]
    lum = 0.299 * img[..., 0] + 0.587 * img[..., 1] + 0.114 * img[..., 2]
    white = alpha * lum  # coverage of "white" paint (works at white/black and white/transparent edges)
    if SMOOTH > 0:
        alpha = cv2.GaussianBlur(alpha, (0, 0), SMOOTH)
        white = cv2.GaussianBlur(white, (0, 0), SMOOTH)
    return alpha, white, (w, h), n


def upscale(field, n):
    m = n * S
    return cv2.resize(field, (m, m), interpolation=cv2.INTER_LINEAR)


def build_masks(alpha, white, n):
    m = n * S
    ring = upscale(alpha, n) > 0.5
    accent = upscale(white, n) > 0.5
    accent &= ring

    transparent = (~ring).astype(np.uint8)
    num, labels = cv2.connectedComponents(transparent, connectivity=4)
    c = m // 2
    cl = labels[c, c]
    if cl == 0:
        raise SystemExit('image centre is not transparent')
    center = labels == cl
    yy, xx = np.ogrid[:m, :m]
    r2 = (xx + 0.5 - m / 2) ** 2 + (yy + 0.5 - m / 2) ** 2
    disk = r2 <= (BAND_R * m / 2) ** 2
    band = (transparent > 0) & disk & ~center

    # separation check: centre must stay well inside, band well outside
    r = np.sqrt(r2)
    c_max = r[center].max() / (m / 2)
    b_min = r[band].min() / (m / 2)
    info = {'center_rmax': c_max, 'band_rmin': b_min,
            'touch': bool((cv2.dilate(center.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & band).any())}
    if info['touch']:
        raise SystemExit('band and center touch - needs a radial split')

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    it = int(round(DILATE_PX * S))
    band_d = cv2.dilate(band.astype(np.uint8), k, iterations=it).astype(bool) & disk
    center_d = cv2.dilate(center.astype(np.uint8), k, iterations=it).astype(bool)
    return {'band': band_d, 'center': center_d, 'ring': ring, 'accent': accent}, \
        {'band': band, 'center': center}, info


# --------------------------------------------------------------------------
# tracing
# --------------------------------------------------------------------------
def offset_polygon(pts, d, mask, pad):
    """Shift polygon outward (towards the non-mask side) by d px with mitres."""
    n = len(pts)
    p = pts.astype(np.float64)
    prev = np.roll(p, 1, axis=0)
    nxt = np.roll(p, -1, axis=0)
    e1 = p - prev
    e2 = nxt - p
    l1 = np.linalg.norm(e1, axis=1, keepdims=True)
    l2 = np.linalg.norm(e2, axis=1, keepdims=True)
    e1 = e1 / np.maximum(l1, 1e-9)
    e2 = e2 / np.maximum(l2, 1e-9)
    n1 = np.stack([e1[:, 1], -e1[:, 0]], axis=1)
    n2 = np.stack([e2[:, 1], -e2[:, 0]], axis=1)
    # choose handedness: probe beside the longest edge
    i = int(np.argmax(l2[:, 0]))
    mid = (p[i] + nxt[i]) / 2
    probe = mid + n2[i] * 1.5
    px, py = int(round(probe[0])), int(round(probe[1]))
    inside = False
    if 0 <= py < mask.shape[0] and 0 <= px < mask.shape[1]:
        inside = bool(mask[py, px])
    sgn = -1.0 if inside else 1.0
    num = n1 + n2
    den = np.maximum(1.0 + (n1 * n2).sum(axis=1, keepdims=True), 0.35)
    return p + sgn * d * num / den


def trace_mask(mask, n):
    """Mask (hi-res bool) -> SVG path string in the 100x100 box."""
    m = n * S
    pad = 4
    padded = np.pad(mask.astype(np.uint8), pad)
    contours, hier = cv2.findContours(padded, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    min_area = MIN_AREA_PX * S * S
    for c in contours:
        area = cv2.contourArea(c) + len(c) / 2.0  # + pixel-boundary correction
        if area < min_area:
            continue
        a = cv2.approxPolyDP(c, EPS_PX * S, True)[:, 0, :]
        if len(a) < 3:
            continue
        a = offset_polygon(a, 0.5, padded, pad)
        a = (a - pad + 0.5) / m * 100.0
        parts.append(a)

    out = []
    for a in parts:
        fmt = [f'{x:.2f}'.rstrip('0').rstrip('.') + ' ' + f'{y:.2f}'.rstrip('0').rstrip('.') for x, y in a]
        # drop consecutive duplicates after rounding
        dedup = [fmt[0]]
        for s in fmt[1:]:
            if s != dedup[-1]:
                dedup.append(s)
        if len(dedup) < 3:
            continue
        out.append('M' + dedup[0] + 'L' + ' '.join(dedup[1:]) + 'Z')
    return ''.join(out)


# --------------------------------------------------------------------------
# preview / evaluation (needs pymupdf)
# --------------------------------------------------------------------------
def svg_doc(paths, colors):
    body = ''.join(f'<path fill="{colors[k]}" fill-rule="evenodd" d="{paths[k]}"/>' for k in ('band', 'center', 'ring', 'accent') if k in colors)
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
            + body + '</svg>')


def render_svg(svg, size, clip=None):
    import pymupdf
    doc = pymupdf.open(stream=svg.encode(), filetype='svg')
    page = doc[0]
    z = size / page.rect.width
    kw = {'matrix': pymupdf.Matrix(z, z), 'alpha': False}
    if clip is not None:
        kw['clip'] = pymupdf.Rect(*[v * page.rect.width / 100.0 for v in clip])
    pix = page.get_pixmap(**kw)
    arr = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)
    return arr[..., :3].copy()


def iou(a, b):
    u = (a | b).sum()
    return (a & b).sum() / u if u else 1.0


def evaluate(paths, masks_hi, n):
    """IoU of rasterised single-class vectors vs hi-res masks (traced regions)."""
    res = {}
    size = n * 4
    for k in ('band', 'center', 'ring', 'accent'):
        svg = svg_doc(paths, {k: '#000'})
        svg = svg.replace('<svg ', '<svg style="background:#fff" ', 1)
        img = render_svg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
                         '<rect width="100" height="100" fill="#fff"/>'
                         f'<path fill="#000" fill-rule="evenodd" d="{paths[k]}"/></svg>', size)
        vec = img[..., 0] < 128
        ref = cv2.resize(masks_hi[k].astype(np.uint8) * 255, (size, size), interpolation=cv2.INTER_AREA) > 127
        res[k] = iou(vec, ref)
    return res


def evaluate_orig(paths, alpha_raw_masks, n):
    """IoU at original resolution against the plain spec masks (alpha>127, lum>127)."""
    res = {}
    for k in ('band', 'center', 'ring', 'accent'):
        img = render_svg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
                         '<rect width="100" height="100" fill="#fff"/>'
                         f'<path fill="#000" fill-rule="evenodd" d="{paths[k]}"/></svg>', n)
        res[k] = iou(img[..., 0] < 128, alpha_raw_masks[k])
    return res


def spec_masks(path, n):
    """Binary masks at original (square-normalised) resolution, exactly as specified."""
    img = np.array(Image.open(path).convert('RGBA'))
    img = cv2.resize(img, (n, n), interpolation=cv2.INTER_LINEAR)
    alpha = img[..., 3]
    lum = 0.299 * img[..., 0] + 0.587 * img[..., 1] + 0.114 * img[..., 2]
    ring = alpha > 127
    accent = ring & (lum > 127)
    transparent = (~ring).astype(np.uint8)
    _, labels = cv2.connectedComponents(transparent, connectivity=4)
    center = labels == labels[n // 2, n // 2]
    yy, xx = np.ogrid[:n, :n]
    disk = (xx + 0.5 - n / 2) ** 2 + (yy + 0.5 - n / 2) ** 2 <= (BAND_R * n / 2) ** 2
    band = (transparent > 0) & disk & ~center
    return {'ring': ring, 'accent': accent, 'center': center, 'band': band}


PINK = (255, 61, 139)
COLORS = {'band': '#ff3d8b', 'center': '#cccccc', 'ring': '#000000', 'accent': '#ffffff'}


def make_previews(fid, path, paths, n, outdir):
    os.makedirs(outdir, exist_ok=True)
    size = 1400
    orig = Image.open(path).convert('RGBA').resize((size, size), Image.LANCZOS)
    base = Image.new('RGBA', (size, size), PINK + (255,))
    base.alpha_composite(orig)
    left = np.array(base.convert('RGB'))
    svg = svg_doc(paths, COLORS)
    vec = render_svg(svg.replace('viewBox="0 0 100 100">', 'viewBox="0 0 100 100"><rect width="100" height="100" fill="#ff3d8b"/>', 1), size)
    # diff of black/non-black ring silhouette and accent
    o = np.array(orig)
    o_ring = o[..., 3] > 127
    o_acc = o_ring & ((0.299 * o[..., 0] + 0.587 * o[..., 1] + 0.114 * o[..., 2]) > 127)
    v_lum = vec.mean(axis=2)
    v_black = v_lum < 60
    v_white = v_lum > 200
    v_ring = v_black | v_white
    diff = np.full((size, size, 3), 255, np.uint8)
    diff[o_ring & v_ring] = (170, 170, 170)
    diff[o_ring & ~v_ring] = (255, 0, 0)    # original only
    diff[~o_ring & v_ring] = (0, 0, 255)    # vector only
    diff[o_acc & ~v_white] = (255, 160, 0)
    diff[~o_acc & v_white & ~o_ring] = (0, 160, 255)
    Image.fromarray(np.hstack([left, vec, diff])).resize((size * 3 // 2, size // 2), Image.LANCZOS).save(
        os.path.join(outdir, f'{fid}_compare.png'))
    Image.fromarray(vec).save(os.path.join(outdir, f'{fid}_vector.png'))

    # zoom crop around the small accent pieces (arrows / bars)
    spec = spec_masks(path, n)['accent'].astype(np.uint8)
    num, lab, stats, cent = cv2.connectedComponentsWithStats(spec, connectivity=8)
    boxes = [stats[i] for i in range(1, num) if stats[i][4] < 2500 and stats[i][4] > 8]
    x0 = min(b[0] for b in boxes) - 12
    y0 = min(b[1] for b in boxes) - 12
    x1 = max(b[0] + b[2] for b in boxes) + 12
    y1 = max(b[1] + b[3] for b in boxes) + 12
    # keep the crop reasonably small: take the densest half if huge
    w, h = x1 - x0, y1 - y0
    s = max(w, h)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    x0, y0 = int(max(0, cx - s / 2)), int(max(0, cy - s / 2))
    x1, y1 = int(min(n, x0 + s)), int(min(n, y0 + s))
    zoom_px = 1100
    crop_o = Image.open(path).convert('RGBA').resize((n, n), Image.LANCZOS).crop((x0, y0, x1, y1)).resize(
        (zoom_px, zoom_px), Image.LANCZOS)
    cb = Image.new('RGBA', crop_o.size, PINK + (255,))
    cb.alpha_composite(crop_o)
    clip = (x0 / n * 100, y0 / n * 100, x1 / n * 100, y1 / n * 100)
    zv = render_svg(svg.replace('viewBox="0 0 100 100">', 'viewBox="0 0 100 100"><rect width="100" height="100" fill="#ff3d8b"/>', 1),
                    zoom_px * 100 / (clip[2] - clip[0]), clip=clip)
    zv = Image.fromarray(zv).resize((zoom_px, zoom_px), Image.LANCZOS)
    Image.fromarray(np.hstack([np.array(cb.convert('RGB')), np.array(zv)])).save(
        os.path.join(outdir, f'{fid}_zoom.png'))


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', metavar='DIR', help='write comparison images + IoU report to DIR')
    args = ap.parse_args()

    frames = []
    for fid, fname in FRAMES:
        path = os.path.join(SRC_DIR, fname)
        alpha, white, (w, h), n = load_fields(path)
        masks, raw, info = build_masks(alpha, white, n)
        paths = {k: trace_mask(masks[k], n) for k in ('band', 'center', 'ring', 'accent')}
        frames.append((fid, paths))
        sizes = {k: len(v) for k, v in paths.items()}
        print(f'{fid}: src {w}x{h} -> {n}x{n}; centre rmax {info["center_rmax"]:.3f} R, '
              f'band rmin {info["band_rmin"]:.3f} R, touching: {info["touch"]}; path bytes {sizes}')
        if args.preview:
            try:
                hi = evaluate(paths, masks, n)
                orig = evaluate_orig(paths, spec_masks(path, n), n)
                print('   IoU vs traced hi-res masks :', {k: round(v, 4) for k, v in hi.items()})
                print('   IoU vs 1x spec masks       :', {k: round(v, 4) for k, v in orig.items()})
                make_previews(fid, path, paths, n, args.preview)
            except ImportError:
                print('   (pymupdf missing - preview skipped)')

    lines = [
        '/**',
        ' * generated by scripts/trace-chip-frames.py â€“ frame templates by Blader R (u/Dull-Tough-5511)',
        ' *',
        ' * Vector version of the round Gear Chip frames, split into separately',
        ' * paintable regions. Paint order: band, center, ring, accent (all evenodd).',
        ' */',
        '',
        'export interface ChipFrameDef {',
        '  id: string',
        '  /** SVG path data in a 100Ã—100 box (circle centre 50,50, radius 50); fill with evenodd. */',
        '  band: string',
        '  center: string',
        '  ring: string',
        '  accent: string',
        '}',
        '',
        'export const CHIP_FRAMES: ChipFrameDef[] = [',
    ]
    for fid, p in frames:
        lines.append('  {')
        lines.append(f"    id: '{fid}',")
        for k in ('band', 'center', 'ring', 'accent'):
            lines.append(f"    {k}:")
            lines.append(f"      '{p[k]}',")
        lines.append('  },')
    lines += [
        ']',
        '',
        'export function getChipFrame(id: string): ChipFrameDef | undefined {',
        '  return CHIP_FRAMES.find((f) => f.id === id)',
        '}',
        '',
    ]
    with open(OUT_TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print(f'wrote {OUT_TS} ({os.path.getsize(OUT_TS) / 1024:.1f} KB)')


if __name__ == '__main__':
    sys.exit(main())
