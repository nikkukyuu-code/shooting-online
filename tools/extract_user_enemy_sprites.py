#!/usr/bin/env python3
"""Extract enemy sprites from the user-supplied sheet for the shop / deck catalog.

Source: tools/source_enemy_sheet.png (user art, 1408x768, blue background,
white name label centered under each unit). Previous sheet kept as
tools/source_enemy_sheet_prev.png.

Crop map is *label-anchored auto-segmentation*:
  * LABELS below holds each unit's name-label box (found once via OCR +
    white-pixel column gaps; see git history / README note). Sprite boxes are
    NOT hand-coded.
  * For each label, the sprite search region is the band between the nearest
    label above (overlapping horizontally) and this label, bounded left/right
    by the blue gutter nearest the midpoint to neighbouring labels.
  * All label boxes are masked out, blue is chroma-keyed to alpha (with blue
    despill on edges), small specks dropped, then the largest connected parts
    are kept.
  * Sprites face right on the sheet -> mirrored to face LEFT (toward the
    player). Per-unit override via NO_FLIP.
  * Fit into 128x128 -> assets/enemies/<id>/0.png, and js/catalog.js CATALOG
    block is regenerated (the rest of catalog.js is preserved).

Run:  .venv/bin/python tools/extract_user_enemy_sprites.py [--debug]
"""
from __future__ import annotations

import argparse
import os
import re

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(ROOT, 'source_enemy_sheet.png')
OUT = os.path.join(ROOT, '..', 'assets', 'enemies')
CATALOG_JS = os.path.join(ROOT, '..', 'js', 'catalog.js')
SIZE = 128
BG_KEY = 40       # |rgb - bg| L1 below this -> fully transparent
BG_SOFT = 70      # L1 between KEY..SOFT -> partial alpha

# (id, display name, label box x0,y0,x1,y1) in sheet reading order.
LABELS = [
    ('basic'                     , 'Sentry Bot Gamma'            , (192, 71, 310, 89)),
    ('gunship_alpha'             , 'Gunship Alpha'               , (405, 71, 498, 89)),
    ('elite'                     , 'Fighter Mk. II'              , (765, 71, 844, 89)),
    ('swarm'                     , 'Drone Swarm Node'            , (1076, 71, 1225, 89)),
    ('drone'                     , 'R-1 Scout Drone'             , (30, 72, 132, 85)),
    ('gunship_alpha_b'           , 'Gunship Alpha B'             , (582, 72, 675, 88)),
    ('fighter_mk2'               , 'Fighter Mk. II B'            , (933, 72, 1012, 89)),
    ('scout_drone'               , 'Scout Drone'                 , (1292, 72, 1368, 85)),
    ('sea_patrol'                , 'Patrol Boat'                 , (1180, 140, 1249, 155)),
    ('scout_frigate'             , 'Scout Frigate'               , (1293, 140, 1376, 158)),
    ('tank'                      , 'Armored Enforcer'            , (25, 171, 137, 184)),
    ('cruiser_class'             , 'Cruiser-Class'               , (451, 173, 536, 187)),
    ('destroyer_class'           , 'Destroyer-Class'             , (587, 173, 686, 190)),
    ('gorgon_mech'               , 'Gorgon Mech'                 , (730, 173, 813, 191)),
    ('mech'                      , 'Heavy Sentinel'              , (837, 173, 929, 191)),
    ('heavy_sentinel_ship'       , 'Heavy Sentinel (Variant)'    , (943, 173, 1035, 213)),
    ('drone_swarm_node_variant'  , 'Drone Swarm Node (Variant)'  , (303, 176, 424, 216)),
    ('combat_walker'             , 'Combat Walker'               , (1076, 176, 1123, 212)),
    ('tracking_sentry'           , 'Tracking Sentry'             , (186, 198, 284, 217)),
    ('assault_transport'         , 'Assault Transport'           , (1277, 199, 1390, 216)),
    ('light_cruiser'             , 'Light Cruiser'               , (41, 284, 121, 302)),
    ('rapid_fire_mech'           , 'Rapid-Fire Mech'             , (185, 284, 285, 302)),
    ('missile_destroyer'         , 'Missile Destroyer'           , (309, 284, 418, 302)),
    ('dreadnought_c1'            , 'Dreadnought Class 1'         , (429, 284, 558, 302)),
    ('golem'                     , 'Dreadnought Class 2'         , (571, 284, 702, 302)),
    ('cruiser_gun'               , 'Cruiser'                     , (750, 284, 794, 298)),
    ('heavy_gunner'              , 'Heavy Gunner'                , (840, 284, 928, 302)),
    ('fleet_carrier'             , 'Fleet Carrier'               , (951, 284, 1027, 298)),
    ('battlecruiser'             , 'Battlecruiser'               , (1061, 284, 1141, 298)),
    ('battlecruiser_b'           , 'Battlecruiser B'             , (1176, 284, 1255, 298)),
    ('siege_mech'                , 'Siege Mech'                  , (1299, 284, 1369, 302)),
    ('plasma_bomber'             , 'Plasma Bomber'               , (33, 381, 132, 395)),
    ('drone_carrier'             , 'Drone Carrier'               , (218, 381, 302, 395)),
    ('shield_frigate'            , 'Shield Frigate'              , (432, 381, 519, 399)),
    ('stealth_corvette'          , 'Stealth Corvette'            , (585, 381, 686, 395)),
    ('railgun_tank'              , 'Railgun Tank'                , (729, 381, 809, 399)),
    ('heavy_mech'                , 'Heavy Mech'                  , (843, 381, 917, 399)),
    ('light_destroyer'           , 'Light Destroyer'             , (940, 381, 1037, 399)),
    ('artillery_platform'        , 'Artillery Platform'          , (1048, 381, 1155, 399)),
    ('orbital_defense'           , 'Orbital Defense'             , (1167, 381, 1264, 395)),
    ('bio_cruiser'               , 'Bio-Cruiser'                 , (1299, 381, 1370, 395)),
    ('heavy_dreadnought'         , 'Heavy Dreadnought'           , (22, 478, 144, 497)),
    ('mobile_fortress'           , 'Mobile Fortress Gamma'       , (182, 478, 331, 493)),
    ('carrier_hive'              , 'Carrier Hive Mother'         , (400, 478, 523, 493)),
    ('siege_destroyer'           , 'Siege Destroyer'             , (586, 478, 686, 497)),
    ('orbital_cannon'            , 'Orbital Cannon'              , (716, 478, 810, 493)),
    ('super_battle_mech'         , 'Super Battle Mech'           , (822, 478, 936, 497)),
    ('fleet_support_ship'        , 'Fleet Support Ship'          , (942, 478, 1023, 497)),
    ('command_carrier'           , 'Command Carrier'             , (1029, 478, 1117, 497)),
    ('planetary_defense_array'   , 'Planetary Defense Array'     , (1123, 478, 1268, 497)),
    ('dreadnought_c3'            , 'Dreadnought Class 3'         , (1274, 478, 1397, 497)),
    ('super_carrier'             , 'Super Carrier'               , (55, 615, 139, 633)),
    ('colony_ship'               , 'Colony Ship'                 , (229, 615, 303, 634)),
    ('siege_fortress'            , 'Siege Fortress'              , (358, 615, 449, 634)),
    ('megamech_alpha'            , 'MegaMech Alpha'              , (468, 615, 575, 634)),
    ('orbital_blaster'           , 'Super Orbital Blaster'       , (581, 615, 713, 634)),
    ('hyper_dreadnought'         , 'Hyper-Dreadnought'           , (822, 615, 945, 634)),
    ('planetary_siege_engine'    , 'Planetary Siege Engine'      , (1043, 615, 1180, 634)),
    ('titan_mech'                , 'Titan Mech'                  , (1186, 615, 1254, 634)),
    ('central_core_defender'     , 'Central Core Defender'       , (1265, 615, 1405, 630)),
    ('super_dreadnought'         , 'Mega Super Dreadnought'      , (35, 748, 196, 766)),
    ('mobile_planet_killer'      , 'Mobile Planet Killer'        , (247, 748, 370, 763)),
    ('colossal_hive_ship'        , 'Colossal Hive Ship'          , (412, 748, 528, 767)),
    ('titan_fortress'            , 'Titan Fortress'              , (576, 748, 665, 762)),
    ('supreme_command_center'    , 'Supreme Command Center'      , (680, 748, 851, 766)),
    ('boss'                      , 'Planet Killer Mk. II'        , (861, 748, 975, 763)),
    ('ai_core'                   , 'Mega AI Core'                , (988, 748, 1105, 766)),
    ('titan_carrier'             , 'Titan Carrier'               , (1160, 748, 1239, 762)),
    ('planet_eater'              , 'Planet Eater'                , (1302, 748, 1379, 762)),
]

# Existing starter ids keep their slot (saves keep working); art now from new sheet.
STARTERS = {'basic', 'drone', 'elite', 'swarm', 'tank'}

# Manual region tweaks where the sheet layout is ambiguous (unlabeled extra art
# touching a labeled unit). Keys: top / x0 / x1 override the auto region.
REGION_OVERRIDES: dict[str, dict] = {
    'combat_walker': {'top': 144},     # skip unlabeled gunboat above the walker
    'battlecruiser_b': {'top': 216},   # skip unlabeled green walker above
}

# Sheet watermark (4-point sparkle) near Titan Carrier / Planet Eater:
# box + colour rule (desaturated light blue) -> treated as background.
WATERMARK_BOXES = [(1256, 626, 1320, 678)]

# Sprites that should NOT be mirrored (already face left / symmetric front view).
NO_FLIP: set[str] = set()


def tier_for(kid: str, name: str, row: int, area: int) -> str:
    n = name.lower()
    if kid in ('basic', 'drone', 'elite', 'swarm', 'tank'):
        return kid
    if row == 0:
        if 'swarm' in n:
            return 'swarm'
        if 'drone' in n:
            return 'drone'
        return 'basic' if 'gunship' in n else 'elite'
    if row == 1:
        if 'swarm' in n or 'scout' in n:
            return 'swarm' if 'swarm' in n else 'drone'
        if 'mech' in n or 'walker' in n or 'sentinel' in n:
            return 'mech' if 'sentinel' in n else 'elite'
        if 'sentry' in n or 'transport' in n or 'patrol' in n:
            return 'tank'
        return 'elite'
    if row == 2:
        if 'dreadnought' in n:
            return 'golem'
        if 'mech' in n or 'gunner' in n:
            return 'mech'
        return 'tank'
    if row == 3:
        if 'mech' in n or 'platform' in n or 'defense' in n:
            return 'mech'
        return 'tank'
    if row == 4:
        return 'golem'
    return 'boss'


ROW_EDGES = [0, 120, 260, 340, 440, 560, 700]  # label y0 -> unit row index
PRICE_BY_ROW = [(40, 70), (60, 110), (100, 160), (120, 190), (180, 260), (260, 360), (320, 450)]
RARITY_BY_ROW = ['common', 'uncommon', 'rare', 'rare', 'epic', 'legendary', 'legendary']


def unit_row(label_y0: int) -> int:
    r = 0
    for i, e in enumerate(ROW_EDGES):
        if label_y0 >= e:
            r = i
    return r


def load_sheet():
    im = Image.open(SHEET).convert('RGB')
    arr = np.array(im).astype(np.int16)
    h, w = arr.shape[:2]
    corners = np.array([arr[4, 4], arr[4, w - 5], arr[h - 5, 4], arr[h - 5, w - 5]])
    bg = np.median(corners, axis=0).astype(np.int16)
    return im, arr, bg


def build_masks(arr, bg):
    dist = np.abs(arr - bg).sum(axis=2)
    label_mask = np.zeros(dist.shape, bool)
    for _, _, (x0, y0, x1, y1) in LABELS:
        label_mask[max(0, y0 - 3):y1 + 4, max(0, x0 - 4):x1 + 5] = True
    for (x0, y0, x1, y1) in WATERMARK_BOXES:
        sub = arr[y0:y1, x0:x1]
        r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
        wm = (b > r + 20) & (r > 70) & (np.abs(r - g) < 40)
        dist[y0:y1, x0:x1][wm] = 0
    solid = (dist >= BG_KEY) & ~label_mask
    return dist, label_mask, solid


def region_for(idx, solid):
    """Search rectangle (x0,y0,x1,y1) for the sprite above LABELS[idx]."""
    h, w = solid.shape
    _, _, (lx0, ly0, lx1, ly1) = LABELS[idx]
    cx = (lx0 + lx1) / 2
    # Neighbours: labels on (roughly) the same line.
    left_c, right_c = None, None
    for j, (_, _, (ox0, oy0, ox1, oy1)) in enumerate(LABELS):
        if j == idx or abs(oy0 - ly0) > 45:
            continue
        ocx = (ox0 + ox1) / 2
        if ocx < cx and (left_c is None or ocx > left_c):
            left_c = ocx
        if ocx > cx and (right_c is None or ocx < right_c):
            right_c = ocx
    left_b = 0 if left_c is None else int((cx + left_c) / 2)
    right_b = w - 1 if right_c is None else int((cx + right_c) / 2)
    # Top: nearest label above that horizontally overlaps [left_b, right_b].
    top = 0
    for j, (_, _, (ox0, oy0, ox1, oy1)) in enumerate(LABELS):
        if j == idx or oy1 >= ly0:
            continue
        if min(ox1, right_b) - max(ox0, left_b) > 10:
            top = max(top, oy1 + 3)
    ov = REGION_OVERRIDES.get(LABELS[idx][0], {})
    top = ov.get('top', top)
    bottom = ly0 - 2

    # Snap to a real blue gutter anywhere between the two label centres
    # (closest empty column to the midpoint); else least-occupied near mid.
    def snap(mid, lo, hi):
        lo = int(max(0, lo)); hi = int(min(w - 1, hi))
        if hi <= lo:
            return mid
        occ = solid[top:bottom + 1, lo:hi + 1].sum(axis=0)
        empty = np.where(occ == 0)[0] + lo
        if len(empty):
            return int(empty[np.argmin(np.abs(empty - mid))])
        near_lo, near_hi = max(lo, mid - 28), min(hi, mid + 28)
        occ2 = solid[top:bottom + 1, near_lo:near_hi + 1].sum(axis=0)
        cand = np.where(occ2 == occ2.min())[0] + near_lo
        return int(cand[np.argmin(np.abs(cand - mid))])

    if left_c is not None:
        left_b = snap(left_b, left_c + 12, cx - 12)
    if right_c is not None:
        right_b = snap(right_b, cx + 12, right_c - 12)
    left_b = ov.get('x0', left_b)
    right_b = ov.get('x1', right_b)
    return left_b, top, right_b, bottom


def extract_unit(im, dist, solid, region):
    x0, y0, x1, y1 = region
    sub = solid[y0:y1 + 1, x0:x1 + 1].copy()
    sub = ndimage.binary_opening(sub, structure=np.ones((2, 2), bool))
    lab, n = ndimage.label(sub, structure=np.ones((3, 3), bool))
    if n == 0:
        return None, None
    sizes = ndimage.sum(sub, lab, range(1, n + 1))
    big = sizes.max()
    keep = np.zeros_like(sub)
    objs = ndimage.find_objects(lab)
    hh, ww = sub.shape
    for i, s in enumerate(sizes, start=1):
        if s < max(25, big * 0.04):
            continue
        sl = objs[i - 1]
        touches = sl[1].start == 0 or sl[1].stop >= ww or sl[0].start == 0
        if touches and s < big * 0.2:
            continue  # neighbour fragment poking into the region
        keep |= lab == i
    # Grow back 2px so antialiased edges / thin details survive the opening.
    keep = ndimage.binary_dilation(keep, iterations=2) & (dist[y0:y1 + 1, x0:x1 + 1] >= 22)
    ys, xs = np.where(keep)
    bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
    rgb = np.array(im)[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
    d = dist[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
    alpha = np.clip((d - BG_KEY * 0.55) / (BG_SOFT - BG_KEY * 0.55), 0, 1)
    alpha[~keep] = 0
    # Despill: pull blue down on semi-transparent edge pixels.
    edge = (alpha > 0) & (alpha < 1)
    b = rgb[..., 2]
    cap = np.maximum(rgb[..., 0], rgb[..., 1]) + 10
    rgb[..., 2] = np.where(edge, np.minimum(b, cap), b)
    rgba = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    tile = Image.fromarray(rgba[by0:by1 + 1, bx0:bx1 + 1], 'RGBA')
    box = (x0 + int(bx0), y0 + int(by0), x0 + int(bx1), y0 + int(by1))
    return tile, box


def fit_canvas(sprite, size=SIZE, margin=0.92):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    sp = sprite.copy()
    m = int(size * margin)
    scale = min(m / sp.width, m / sp.height)
    sp = sp.resize((max(1, round(sp.width * scale)), max(1, round(sp.height * scale))),
                   Image.Resampling.LANCZOS)
    canvas.paste(sp, ((size - sp.width) // 2, (size - sp.height) // 2), sp)
    return canvas


def emit_catalog(units):
    lines = ['export const CATALOG = [']
    for u in units:
        name = u['name'].replace("'", "\\'")
        lines.append(
            f"  {{ id: '{u['id']}', name: '{name}', price: {u['price']}, "
            f"rarity: '{u['rarity']}', tier: '{u['tier']}', starter: {'true' if u['starter'] else 'false'} }},"
        )
    lines.append('];')
    block = '\n'.join(lines)
    with open(CATALOG_JS, encoding='utf-8') as f:
        js = f.read()
    new_js, n = re.subn(r'export const CATALOG = \[.*?\n\];', lambda _m: block, js, count=1, flags=re.S)
    if n != 1:
        raise SystemExit('CATALOG block not found in js/catalog.js')
    with open(CATALOG_JS, 'w', encoding='utf-8') as f:
        f.write(new_js)
    print(f'Wrote {os.path.normpath(CATALOG_JS)} ({len(units)} units)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--debug', action='store_true', help='write tools/_sheet_cells.png + tools/_contact.png')
    args = ap.parse_args()

    im, arr, bg = load_sheet()
    dist, label_mask, solid = build_masks(arr, bg)
    print(f'Sheet {im.size}, bg={tuple(int(v) for v in bg)}, units={len(LABELS)}')

    units, boxes, tiles = [], [], []
    for idx, (kid, name, lbox) in enumerate(LABELS):
        region = region_for(idx, solid)
        tile, box = extract_unit(im, dist, solid, region)
        if tile is None:
            print(f'  !! {kid}: no sprite found in {region}')
            continue
        if kid not in NO_FLIP:
            tile = tile.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        base = fit_canvas(tile)
        d = os.path.join(OUT, kid)
        os.makedirs(d, exist_ok=True)
        for fn in os.listdir(d):
            if fn.endswith('.png'):
                os.remove(os.path.join(d, fn))
        base.save(os.path.join(d, '0.png'), 'PNG', optimize=True)
        area = int((np.array(tile)[..., 3] > 128).sum())
        row = unit_row(lbox[1])
        starter = kid in STARTERS
        units.append(dict(id=kid, name=name, row=row, area=area, starter=starter,
                          tier=tier_for(kid, name, row, area)))
        boxes.append((kid, region, box))
        tiles.append(base)

    # Price: within each row, scale by relative sprite area.
    for r in range(len(PRICE_BY_ROW)):
        members = [u for u in units if u['row'] == r]
        if not members:
            continue
        lo, hi = PRICE_BY_ROW[r]
        amin = min(u['area'] for u in members); amax = max(u['area'] for u in members)
        for u in members:
            t = 0 if amax == amin else (u['area'] - amin) / (amax - amin)
            u['price'] = 0 if u['starter'] else int(round((lo + (hi - lo) * t) / 5) * 5)
            u['rarity'] = 'common' if u['starter'] else RARITY_BY_ROW[r]
    for u in units:
        tag = 'STARTER' if u['starter'] else f"{u['price']}PT"
        print(f"  {u['id']:26s} {u['name']:28s} {u['tier']:6s} {tag}")
    emit_catalog(units)

    if args.debug:
        prev = im.copy(); dr = ImageDraw.Draw(prev)
        for i, (kid, reg, box) in enumerate(boxes):
            dr.rectangle(reg, outline=(255, 0, 255))
            dr.rectangle(box, outline=(0, 255, 80), width=2)
            dr.text((box[0] + 1, box[1] + 1), str(i), fill=(255, 255, 0))
        prev.save(os.path.join(ROOT, '_sheet_cells.png'))
        cols, t = 10, 128
        rows = (len(tiles) + cols - 1) // cols
        cs = Image.new('RGBA', (cols * t, rows * (t + 14)), (24, 24, 32, 255)); dr = ImageDraw.Draw(cs)
        for i, tile in enumerate(tiles):
            r, c = divmod(i, cols)
            cs.alpha_composite(tile, (c * t, r * (t + 14)))
            dr.text((c * t + 2, r * (t + 14) + t), f"{i} {units[i]['id'][:18]}", fill=(255, 220, 80))
        cs.save(os.path.join(ROOT, '_contact.png'))
        print('debug previews written')
    print(f'Done -> {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
