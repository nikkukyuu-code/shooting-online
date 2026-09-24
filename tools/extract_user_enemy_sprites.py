#!/usr/bin/env python3
"""Extract enemy sprites from the user-supplied sheet and build ゆらゆら frames.

Source: tools/source_enemy_sheet.png (user art).
The sheet mixes orientations (top-row fighters often already face left; many
lower-row units face right; some labels / the AI-core text are mirrored).
Per-kind `flip` is set so the final sprite faces **left** (nose / weapons /
cockpit toward −X), matching js/render.js enemy fallbacks (player faces right).

Pipeline per kind:
  1. Crop documented region (sprite body only — text labels excluded)
  2. Chroma-key solid blue background → transparent PNG
  3. Optional horizontal flip (see KIND_SPRITES['flip'])
  4. Fit into 128×128 canvas
  5. Emit 5 frames via tiny soft sway (tilt ±~3.5°, bob) of THAT same image

Primary look is the user's art only — no low-poly redraw.
"""
from __future__ import annotations

import math
import os
from typing import Dict, Tuple

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(ROOT, 'source_enemy_sheet.png')
OUT = os.path.join(ROOT, '..', 'assets', 'enemies')
SIZE = 128
FRAMES = 5

# Inclusive crop boxes (x0, y0, x1, y1) measured on the source sheet pixels.
# Labels under each sprite are intentionally outside these boxes.
KIND_SPRITES: Dict[str, dict] = {
    'basic': {
        'name': 'Sentry Bot Gamma',
        'box': (1101, 15, 1194, 93),
        'flip': True,   # sheet faces right → flip to face left
        'note': 'small bipedal sentry / light ground unit',
    },
    'drone': {
        'name': 'R-1-Sooni-Donn',
        'box': (1274, 15, 1354, 93),
        'flip': False,  # already faces left on sheet
        'note': 'small flying drone / saucer with green eye',
    },
    'elite': {
        'name': 'Fighter Mk. II',
        'box': (756, 15, 876, 89),
        'flip': False,  # already faces left (green cockpit on −X)
        'note': 'sleek fighter jet with green cockpit',
    },
    'mech': {
        'name': 'Heavy Sentinel (mech)',
        'box': (1259, 284, 1379, 376),
        'flip': True,
        'note': 'bipedal combat mech',
    },
    'tank': {
        'name': 'Armored Enforcer',
        'box': (23, 155, 173, 221),
        'flip': True,   # sheet faces right → face left
        'note': 'heavy armored / tank-like ship',
    },
    'golem': {
        'name': 'Dreadnought Class 2',
        'box': (745, 425, 894, 541),
        'flip': True,   # drills toward player (left)
        'note': 'chunky drill-armed walker',
    },
    'swarm': {
        'name': 'Drone Swarm Node',
        'box': (399, 284, 521, 376),
        'flip': True,   # keep consistent with sheet correction
        'note': 'organic swarm / cluster mass',
    },
    'boss': {
        'name': 'Planet Killer',
        'box': (884, 590, 1150, 736),
        'flip': True,   # capital ship nose left toward player
        'note': 'largest capital ship (bottom row)',
    },
}


def crop_transparent(im: Image.Image, box: Tuple[int, int, int, int], bg) -> Image.Image:
    x0, y0, x1, y1 = box
    tile = im.crop((x0, y0, x1 + 1, y1 + 1)).convert('RGBA')
    pix = tile.load()
    w, h = tile.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            dist = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if dist < 28:
                pix[x, y] = (0, 0, 0, 0)
            elif dist < 55:
                na = max(0, min(255, int((dist - 28) / 27.0 * 255)))
                pix[x, y] = (r, g, b, na)
    bbox = tile.getbbox()
    if bbox:
        tile = tile.crop(bbox)
    return tile


def fit_canvas(sprite: Image.Image, size: int = SIZE, margin: float = 0.92) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    max_dim = int(size * margin)
    sp = sprite.copy()
    sp.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    ox = (size - sp.width) // 2
    oy = (size - sp.height) // 2
    canvas.paste(sp, (ox, oy), sp)
    return canvas


def sway_frame(base: Image.Image, index: int, total: int = FRAMES) -> Image.Image:
    """Tiny soft sway of the same image — tilt ±few degrees + vertical bob."""
    t = (index / total) * 2 * math.pi
    angle = math.sin(t) * 3.5
    bob = math.sin(t) * 3.0
    drift = math.cos(t) * 1.5

    pad = 16
    padded = Image.new('RGBA', (base.width + pad * 2, base.height + pad * 2), (0, 0, 0, 0))
    padded.paste(base, (pad, pad), base)
    rotated = padded.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False)

    out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    src_cx = rotated.width / 2
    src_cy = rotated.height / 2
    dest_cx = SIZE / 2 + drift
    dest_cy = SIZE / 2 + bob
    ox = int(round(dest_cx - src_cx))
    oy = int(round(dest_cy - src_cy))
    out.paste(rotated, (ox, oy), rotated)
    return out


def main():
    if not os.path.isfile(SHEET):
        raise SystemExit(f'Missing sheet: {SHEET}')
    im = Image.open(SHEET).convert('RGBA')
    bg = tuple(im.getpixel((10, 10))[:3])
    print(f'Sheet {im.size}, bg={bg}')

    for kind, meta in KIND_SPRITES.items():
        box = meta['box']
        sprite = crop_transparent(im, box, bg)
        if meta.get('flip', True):
            sprite = ImageOps.mirror(sprite)
        base = fit_canvas(sprite)
        kind_dir = os.path.join(OUT, kind)
        os.makedirs(kind_dir, exist_ok=True)
        for i in range(FRAMES):
            frame = sway_frame(base, i)
            frame.save(os.path.join(kind_dir, f'{i}.png'), 'PNG', optimize=True)
        flip_s = 'flip' if meta.get('flip', True) else 'no-flip'
        print(f'  {kind:6s} ← {meta["name"]:28s} {flip_s:7s} box={box}')

    print(f'Done → {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
