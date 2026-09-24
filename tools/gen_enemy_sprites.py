#!/usr/bin/env python3
"""Generate 5 low-poly turntable PNG frames per enemy kind."""
from __future__ import annotations
import math
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'enemies')
SIZE = 128  # square canvas; game scales via e.w/e.h
FRAMES = 5
ANGLES = [i * (360 / FRAMES) for i in range(FRAMES)]  # 0,72,144,216,288


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vscale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def vnorm(a):
    L = math.sqrt(vdot(a, a)) or 1.0
    return (a[0] / L, a[1] / L, a[2] / L)


def rotate_y(p, deg):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    x, y, z = p
    return (x * c + z * s, y, -x * s + z * c)


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(rgb, factor):
    return tuple(max(0, min(255, int(c * factor))) for c in rgb)


def tri(a, b, c, color):
    return (a, b, c, color)


def box(cx, cy, cz, sx, sy, sz, color):
    """Axis-aligned box as 12 triangles. sx/sy/sz are half-extents."""
    x0, x1 = cx - sx, cx + sx
    y0, y1 = cy - sy, cy + sy
    z0, z1 = cz - sz, cz + sz
    # 8 corners
    p = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    faces = [
        (0, 1, 2, 3),  # -Z
        (5, 4, 7, 6),  # +Z
        (4, 0, 3, 7),  # -X
        (1, 5, 6, 2),  # +X
        (3, 2, 6, 7),  # +Y
        (4, 5, 1, 0),  # -Y
    ]
    # Face shade factors for flat look
    face_f = [0.72, 0.95, 0.80, 0.88, 1.05, 0.55]
    out = []
    base = hex_rgb(color) if isinstance(color, str) else color
    for fi, (a, b, c, d) in enumerate(faces):
        col = shade(base, face_f[fi])
        out.append(tri(p[a], p[b], p[c], col))
        out.append(tri(p[a], p[c], p[d], col))
    return out


def pyramid(apex, base_pts, color):
    """Triangular/quad pyramid sides + base."""
    out = []
    base = hex_rgb(color) if isinstance(color, str) else color
    n = len(base_pts)
    for i in range(n):
        a = base_pts[i]
        b = base_pts[(i + 1) % n]
        f = 0.7 + 0.25 * ((i % 3) / 2)
        out.append(tri(apex, a, b, shade(base, f)))
    # base
    if n == 3:
        out.append(tri(base_pts[0], base_pts[2], base_pts[1], shade(base, 0.5)))
    elif n == 4:
        out.append(tri(base_pts[0], base_pts[1], base_pts[2], shade(base, 0.5)))
        out.append(tri(base_pts[0], base_pts[2], base_pts[3], shade(base, 0.5)))
    return out


def mesh_basic():
    """Gray bipedal mech — low poly walker facing -X (toward player in game)."""
    g = '#9aa0a8'
    gd = '#5a5e68'
    eye = '#e02028'
    tris = []
    tris += box(0, 0.15, 0, 0.28, 0.32, 0.22, g)       # torso
    tris += box(0, 0.55, 0, 0.22, 0.14, 0.18, g)       # head
    tris += box(-0.45, 0.1, 0, 0.22, 0.06, 0.06, gd)   # gun arm left
    tris += box(0.38, 0.05, 0, 0.1, 0.12, 0.1, gd)     # right arm
    tris += box(-0.12, -0.45, 0.08, 0.1, 0.28, 0.1, gd)  # left leg
    tris += box(0.12, -0.45, -0.08, 0.1, 0.28, 0.1, gd) # right leg
    tris += box(-0.12, -0.72, 0.08, 0.14, 0.06, 0.12, gd)  # left foot
    tris += box(0.12, -0.72, -0.08, 0.14, 0.06, 0.12, gd)
    # eye gem
    tris += box(-0.05, 0.55, 0.2, 0.06, 0.06, 0.04, eye)
    return tris


def mesh_drone():
    """Yellow UFO + green dome."""
    tris = []
    # saucer as flat octagon-ish extruded
    r, h = 0.55, 0.08
    top = []
    bot = []
    n = 8
    for i in range(n):
        a = 2 * math.pi * i / n
        top.append((r * math.cos(a), h, r * math.sin(a)))
        bot.append((0.85 * r * math.cos(a), -h, 0.85 * r * math.sin(a)))
    yel = hex_rgb('#ffd428')
    yd = hex_rgb('#c8a010')
    for i in range(n):
        t0, t1 = top[i], top[(i + 1) % n]
        b0, b1 = bot[i], bot[(i + 1) % n]
        f = 0.75 + 0.2 * ((i % 4) / 3)
        tris.append(tri(t0, t1, b1, shade(yel, f)))
        tris.append(tri(t0, b1, b0, shade(yd, f * 0.9)))
    # top cap
    tip = (0, h + 0.02, 0)
    for i in range(n):
        tris.append(tri(tip, top[i], top[(i + 1) % n], shade(yel, 1.05)))
    # dome
    green = '#2e5a34'
    gd = '#1a3a22'
    tris += box(0, 0.28, 0, 0.18, 0.16, 0.18, green)
    tris += box(0, 0.42, 0, 0.12, 0.08, 0.12, gd)
    return tris


def mesh_elite():
    """White/red arrow fighter pointing -X."""
    white = '#f2f2f6'
    red = '#e01828'
    tris = []
    # nose pyramid pointing -X
    apex = (-0.7, 0, 0)
    base = [(0.1, 0.35, 0.2), (0.1, 0.35, -0.2), (0.1, -0.35, -0.2), (0.1, -0.35, 0.2)]
    tris += pyramid(apex, base, white)
    # rear red block
    tris += box(0.4, 0, 0, 0.28, 0.28, 0.18, red)
    tris += box(0.55, 0.18, 0, 0.12, 0.1, 0.08, '#8a0c18')
    tris += box(0.55, -0.18, 0, 0.12, 0.1, 0.08, '#8a0c18')
    # cockpit
    tris += box(-0.15, 0.08, 0, 0.12, 0.08, 0.1, '#304050')
    return tris


def mesh_mech():
    """White triangle ship pointing -X."""
    white = '#f4f4f8'
    edge = '#606070'
    apex = (-0.7, 0, 0)
    base = [(0.55, 0.45, 0.15), (0.55, 0.45, -0.15), (0.55, -0.45, -0.15), (0.55, -0.45, 0.15)]
    tris = pyramid(apex, base, white)
    tris += box(0.55, 0, 0, 0.08, 0.2, 0.12, edge)
    # inner facet highlight via thin top ridge
    tris += box(-0.1, 0.05, 0, 0.35, 0.04, 0.06, '#ffffff')
    return tris


def mesh_tank():
    """Large red wedge pointing -X."""
    red = '#e02028'
    dark = '#8a1018'
    apex = (-0.75, 0, 0)
    base = [(0.55, 0.4, 0.25), (0.55, 0.4, -0.25), (0.55, -0.4, -0.25), (0.55, -0.4, 0.25)]
    tris = pyramid(apex, base, red)
    tris += box(0.55, 0, 0, 0.1, 0.22, 0.18, dark)
    tris += box(0.1, 0, 0.02, 0.35, 0.08, 0.08, '#ff5560')
    return tris


def mesh_golem():
    """Green cross + yellow core (will look like spinning when frames rotate)."""
    green = '#3cbc48'
    gd = '#1e7a28'
    yel = '#ffe033'
    tris = []
    # four arms along X/Z
    tris += box(0.35, 0, 0, 0.35, 0.1, 0.12, green)
    tris += box(-0.35, 0, 0, 0.35, 0.1, 0.12, green)
    tris += box(0, 0, 0.35, 0.12, 0.1, 0.35, gd)
    tris += box(0, 0, -0.35, 0.12, 0.1, 0.35, gd)
    # tip pads
    for dx, dz in ((0.65, 0), (-0.65, 0), (0, 0.65), (0, -0.65)):
        tris += box(dx, 0, dz, 0.1, 0.14, 0.1, gd)
    # core
    tris += box(0, 0, 0, 0.22, 0.22, 0.22, yel)
    tris += box(0, 0, 0, 0.12, 0.12, 0.12, '#fff8a0')
    return tris


def mesh_swarm():
    """Small red crescent / boomerang pointing -X."""
    red = '#ff2a3a'
    hot = '#ff8890'
    tris = []
    # upper wing
    apex = (-0.55, 0, 0)
    up = [(0.45, 0.35, 0.08), (0.45, 0.15, -0.05), (-0.05, 0.05, 0.05)]
    tris += pyramid(apex, up, red)
    # lower wing
    lo = [(0.45, -0.35, 0.08), (-0.05, -0.05, 0.05), (0.45, -0.15, -0.05)]
    tris += pyramid(apex, lo, hot)
    # body connector
    tris += box(0.1, 0, 0, 0.2, 0.08, 0.08, '#c01828')
    return tris


def mesh_boss():
    """Gray chunky asymmetric station."""
    g0, g1, g2 = '#b0b4bc', '#6a6e78', '#3a3e48'
    accent = '#e02830'
    tris = []
    tris += box(0, 0, 0, 0.55, 0.35, 0.4, g1)
    tris += box(-0.15, 0, 0.1, 0.35, 0.28, 0.28, g0)
    tris += box(-0.6, 0, 0, 0.15, 0.18, 0.2, g2)   # nose
    tris += box(0.4, 0.4, -0.1, 0.18, 0.2, 0.15, g1)  # top tower
    tris += box(0.45, -0.35, 0.15, 0.2, 0.18, 0.18, g2)  # bottom pod
    tris += box(0.1, 0.45, 0, 0.08, 0.12, 0.08, g2)  # mast
    tris += box(-0.1, 0, 0.35, 0.1, 0.1, 0.06, accent)
    tris += box(0.25, -0.2, 0.35, 0.08, 0.08, 0.06, accent)
    return tris


MESHES = {
    'basic': mesh_basic,
    'drone': mesh_drone,
    'elite': mesh_elite,
    'mech': mesh_mech,
    'tank': mesh_tank,
    'golem': mesh_golem,
    'swarm': mesh_swarm,
    'boss': mesh_boss,
}


def project(p, scale, cx, cy):
    # simple perspective-ish orthographic with slight depth foreshortening
    x, y, z = p
    # camera looks from +Z toward origin; game enemies face -X so side view at angle 0
    # At angle 0 we want left-facing silhouette: use X as horizontal, Y vertical
    px = cx + x * scale
    py = cy - y * scale
    depth = z  # for sorting
    return px, py, depth


def render_frame(tris, angle_deg, size=SIZE):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, 'RGBA')
    light = vnorm((0.4, 0.7, 0.55))
    rotated = []
    for a, b, c, col in tris:
        ra, rb, rc = rotate_y(a, angle_deg), rotate_y(b, angle_deg), rotate_y(c, angle_deg)
        rotated.append((ra, rb, rc, col))

    # auto-fit scale
    xs, ys = [], []
    for a, b, c, _ in rotated:
        for p in (a, b, c):
            xs.append(p[0])
            ys.append(p[1])
    span = max(max(xs) - min(xs), max(ys) - min(ys), 0.01)
    scale = size * 0.78 / span
    cx = cy = size / 2

    faces = []
    for a, b, c, col in rotated:
        n = vnorm(vcross(vsub(b, a), vsub(c, a)))
        # backface cull (camera from +Z roughly, but after Y-rot camera is orthographic along Z)
        if n[2] < -0.05:
            continue
        ndot = max(0.0, vdot(n, light))
        factor = 0.45 + 0.55 * ndot
        rgb = shade(col if isinstance(col, tuple) else hex_rgb(col), factor)
        pa = project(a, scale, cx, cy)
        pb = project(b, scale, cx, cy)
        pc = project(c, scale, cx, cy)
        depth = (pa[2] + pb[2] + pc[2]) / 3
        faces.append((depth, [(pa[0], pa[1]), (pb[0], pb[1]), (pc[0], pc[1])], rgb + (255,)))

    faces.sort(key=lambda f: f[0])  # far to near
    for _, pts, rgba in faces:
        draw.polygon(pts, fill=rgba)
        # hard edge outline (slightly darker)
        edge = shade(rgba[:3], 0.55) + (220,)
        draw.line(pts + [pts[0]], fill=edge, width=1)

    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for kind, builder in MESHES.items():
        kind_dir = os.path.join(OUT, kind)
        os.makedirs(kind_dir, exist_ok=True)
        tris = builder()
        for i, ang in enumerate(ANGLES):
            img = render_frame(tris, ang)
            path = os.path.join(kind_dir, f'{i}.png')
            img.save(path, 'PNG')
            print('wrote', path, 'angle', ang)
    print('done', FRAMES, 'frames x', len(MESHES), 'kinds')


if __name__ == '__main__':
    main()
