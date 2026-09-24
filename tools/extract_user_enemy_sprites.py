#!/usr/bin/env python3
"""Extract enemy sprites from the user-supplied sheet for battle + shop catalog.

Source: tools/source_enemy_sheet.png (user art).
Per-kind `flip` faces sprites **left** (toward the player).

Pipeline:
  1. Crop documented region (sprite body; labels excluded when possible)
  2. Chroma-key solid blue background → transparent PNG
  3. Optional horizontal flip
  4. Fit into 128×128 canvas
  5. Emit frame 0.png (static; sway frames optional via --sway)

Primary look is the user's art only — no low-poly redraw.
"""
from __future__ import annotations

import argparse
import math
import os
from typing import Dict, Tuple

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(ROOT, 'source_enemy_sheet.png')
OUT = os.path.join(ROOT, '..', 'assets', 'enemies')
SIZE = 128
FRAMES = 5

# Inclusive crop boxes (x0, y0, x1, y1). Existing 8 battle kinds keep proven boxes.
# Additional catalog units use cell-aligned crops from the same sheet.
KIND_SPRITES: Dict[str, dict] = {
    # --- Row 0 (starters + light) ---
    'mk3_interceptor': {
        'name': 'MK III Interceptor', 'box': (20, 12, 165, 95), 'flip': False,
        'price': 40, 'rarity': 'common', 'tier': 'basic',
    },
    'mini_hinobunni': {
        'name': 'Mini Hinobunni', 'box': (200, 12, 340, 95), 'flip': False,
        'price': 45, 'rarity': 'common', 'tier': 'basic',
    },
    'ionregon': {
        'name': 'Ionregon Done', 'box': (375, 8, 520, 98), 'flip': False,
        'price': 50, 'rarity': 'common', 'tier': 'drone',
    },
    'gunship_alpha': {
        'name': 'Gunship Alpha', 'box': (555, 10, 710, 130), 'flip': True,
        'price': 70, 'rarity': 'uncommon', 'tier': 'elite',
    },
    'elite': {
        'name': 'Fighter Mk. II', 'box': (756, 15, 876, 89), 'flip': False,
        'price': 0, 'rarity': 'common', 'tier': 'elite', 'starter': True,
    },
    'security_fly': {
        'name': 'Security Fly', 'box': (910, 12, 1045, 130), 'flip': False,
        'price': 55, 'rarity': 'common', 'tier': 'swarm',
    },
    'basic': {
        'name': 'Sentry Bot Gamma', 'box': (1101, 15, 1194, 93), 'flip': True,
        'price': 0, 'rarity': 'common', 'tier': 'basic', 'starter': True,
    },
    'drone': {
        'name': 'R-1 Sooni Donn', 'box': (1274, 15, 1354, 93), 'flip': False,
        'price': 0, 'rarity': 'common', 'tier': 'drone', 'starter': True,
    },
    # --- Row 1 ---
    'tank': {
        'name': 'Armored Enforcer', 'box': (23, 155, 173, 221), 'flip': True,
        'price': 0, 'rarity': 'uncommon', 'tier': 'tank', 'starter': True,
    },
    'missile_cruiser': {
        'name': 'Missile Cruiser', 'box': (200, 148, 360, 235), 'flip': True,
        'price': 90, 'rarity': 'uncommon', 'tier': 'elite',
    },
    'strike_fighter': {
        'name': 'Strike Fighter A', 'box': (400, 148, 528, 230), 'flip': True,
        'price': 75, 'rarity': 'uncommon', 'tier': 'elite',
    },
    'strike_fighter_b': {
        'name': 'Strike Fighter B', 'box': (560, 148, 715, 235), 'flip': True,
        'price': 75, 'rarity': 'uncommon', 'tier': 'elite',
    },
    'gorgon_mech': {
        'name': 'Gorgon Mech', 'box': (745, 148, 890, 245), 'flip': True,
        'price': 110, 'rarity': 'rare', 'tier': 'mech',
    },
    'security_eye': {
        'name': 'Security Eye', 'box': (920, 145, 1060, 250), 'flip': True,
        'price': 100, 'rarity': 'rare', 'tier': 'golem',
    },
    'tracking_sentry': {
        'name': 'Tracking Sentry', 'box': (1095, 148, 1225, 250), 'flip': True,
        'price': 85, 'rarity': 'uncommon', 'tier': 'tank',
    },
    'sea_patrol': {
        'name': 'Sea Patrol Vessel', 'box': (1245, 155, 1390, 235), 'flip': True,
        'price': 80, 'rarity': 'uncommon', 'tier': 'tank',
    },
    # --- Row 2 ---
    'engineer_bot': {
        'name': 'Engineer Bot', 'box': (24, 290, 176, 370), 'flip': True,
        'price': 95, 'rarity': 'uncommon', 'tier': 'mech',
    },
    'emp_disruptor': {
        'name': 'EMP Disruptor', 'box': (215, 280, 350, 385), 'flip': True,
        'price': 120, 'rarity': 'rare', 'tier': 'mech',
    },
    'swarm': {
        'name': 'Drone Swarm Node', 'box': (399, 284, 521, 376), 'flip': True,
        'price': 0, 'rarity': 'common', 'tier': 'swarm', 'starter': True,
    },
    'cruiser_class': {
        'name': 'Cruiser-Class', 'box': (550, 295, 725, 375), 'flip': True,
        'price': 130, 'rarity': 'rare', 'tier': 'tank',
    },
    'destroyer_class': {
        'name': 'Destroyer-Class', 'box': (730, 295, 905, 370), 'flip': True,
        'price': 140, 'rarity': 'rare', 'tier': 'tank',
    },
    'orbital_blaster': {
        'name': 'Orbital Blaster', 'box': (920, 295, 1055, 380), 'flip': True,
        'price': 125, 'rarity': 'rare', 'tier': 'mech',
    },
    'heavy_sentinel_ship': {
        'name': 'Heavy Sentinel Ship', 'box': (1080, 295, 1215, 380), 'flip': True,
        'price': 135, 'rarity': 'rare', 'tier': 'mech',
    },
    'mech': {
        'name': 'Heavy Sentinel', 'box': (1259, 284, 1379, 376), 'flip': True,
        'price': 150, 'rarity': 'rare', 'tier': 'mech',
    },
    # --- Row 3 ---
    'light_cruiser': {
        'name': 'Light Cruiser', 'box': (20, 420, 185, 555), 'flip': True,
        'price': 145, 'rarity': 'rare', 'tier': 'mech',
    },
    'rapid_fire_mech': {
        'name': 'Rapid-Fire Mech', 'box': (200, 415, 360, 560), 'flip': True,
        'price': 160, 'rarity': 'rare', 'tier': 'mech',
    },
    'missile_destroyer': {
        'name': 'Missile Destroyer', 'box': (385, 430, 535, 555), 'flip': True,
        'price': 155, 'rarity': 'rare', 'tier': 'tank',
    },
    'dreadnought_c1': {
        'name': 'Dreadnought Class 1', 'box': (565, 415, 725, 555), 'flip': True,
        'price': 180, 'rarity': 'epic', 'tier': 'golem',
    },
    'golem': {
        'name': 'Dreadnought Class 2', 'box': (745, 425, 894, 541), 'flip': True,
        'price': 200, 'rarity': 'epic', 'tier': 'golem',
    },
    'cruiser_gun': {
        'name': 'Gun Cruiser', 'box': (905, 430, 1065, 540), 'flip': True,
        'price': 170, 'rarity': 'rare', 'tier': 'tank',
    },
    'heavy_gunner': {
        'name': 'Heavy Gunner', 'box': (1085, 415, 1225, 555), 'flip': True,
        'price': 190, 'rarity': 'epic', 'tier': 'golem',
    },
    'fleet_carrier': {
        'name': 'Fleet Carrier', 'box': (1235, 425, 1405, 535), 'flip': True,
        'price': 210, 'rarity': 'epic', 'tier': 'boss',
    },
    # --- Row 4 bosses ---
    'super_dreadnought': {
        'name': 'Super Dreadnought', 'box': (8, 592, 284, 728), 'flip': True,
        'price': 280, 'rarity': 'legendary', 'tier': 'boss',
    },
    'carrier_hive': {
        'name': 'Carrier Hive Ship', 'box': (340, 576, 536, 744), 'flip': True,
        'price': 300, 'rarity': 'legendary', 'tier': 'boss',
    },
    'mobile_fortress': {
        'name': 'Mobile Fortress', 'box': (588, 608, 832, 750), 'flip': True,
        'price': 320, 'rarity': 'legendary', 'tier': 'boss',
    },
    'boss': {
        'name': 'Planet Killer', 'box': (884, 590, 1150, 736), 'flip': True,
        'price': 350, 'rarity': 'legendary', 'tier': 'boss',
    },
    'ai_core': {
        'name': 'Central AI Core', 'box': (1212, 592, 1356, 732), 'flip': False,
        'price': 400, 'rarity': 'legendary', 'tier': 'boss',
    },
}


def crop_transparent(im: Image.Image, box: Tuple[int, int, int, int], bg) -> Image.Image:
    x0, y0, x1, y1 = box
    x0 = max(0, x0); y0 = max(0, y0)
    x1 = min(im.width - 1, x1); y1 = min(im.height - 1, y1)
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


def emit_catalog_js(path: str):
    """Write js/catalog.js so runtime shares the same shop catalog."""
    lines = [
        '/** Auto-generated from tools/extract_user_enemy_sprites.py — shop / deck catalog. */',
        'export const CATALOG = [',
    ]
    for kid, meta in KIND_SPRITES.items():
        name = meta['name'].replace("'", "\\'")
        starter = 'true' if meta.get('starter') else 'false'
        lines.append(
            f"  {{ id: '{kid}', name: '{name}', price: {meta['price']}, "
            f"rarity: '{meta['rarity']}', tier: '{meta['tier']}', starter: {starter} }},"
        )
    lines.append('];')
    lines.append('')
    lines.append("/** Fixed order: 5 free starters always equipped at first launch. */")
    lines.append("export const STARTER_DECK = ['basic', 'drone', 'elite', 'swarm', 'tank'];")
    lines.append('export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((u) => [u.id, u]));')
    lines.append('export const ALL_KIND_IDS = CATALOG.map((u) => u.id);')
    lines.append('')
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'Wrote {path} ({len(KIND_SPRITES)} units)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sway', action='store_true', help='Also emit frames 1-4 sway (default: frame 0 only)')
    ap.add_argument('--catalog-js', default=os.path.join(ROOT, '..', 'js', 'catalog.js'))
    args = ap.parse_args()

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
        n = FRAMES if args.sway else 1
        for i in range(n):
            frame = sway_frame(base, i) if args.sway else base
            if not args.sway and i == 0:
                frame = base
            frame.save(os.path.join(kind_dir, f'{i}.png'), 'PNG', optimize=True)
        if not args.sway:
            base.save(os.path.join(kind_dir, '0.png'), 'PNG', optimize=True)
        flip_s = 'flip' if meta.get('flip', True) else 'no-flip'
        tag = 'STARTER' if meta.get('starter') else f"¥{meta['price']}"
        print(f'  {kind:22s} ← {meta["name"]:24s} {flip_s:7s} {tag}')

    emit_catalog_js(args.catalog_js)
    print(f'Done → {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
