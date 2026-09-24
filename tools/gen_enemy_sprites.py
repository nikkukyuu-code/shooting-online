#!/usr/bin/env python3
"""Generate 5 low-poly PNG frames per enemy kind with gentle ゆらゆら sway.

No full spins / arm turntables / tumble flips. Each kind keeps light flavor
(walk-bob, engine pulse, core glow) but body motion is soft tilt + bob.
"""
from __future__ import annotations
import math
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'enemies')
SIZE = 128
FRAMES = 5


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


def rotate_x(p, deg):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    x, y, z = p
    return (x, y * c - z * s, y * s + z * c)


def rotate_y(p, deg):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    x, y, z = p
    return (x * c + z * s, y, -x * s + z * c)


def rotate_z(p, deg):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    x, y, z = p
    return (x * c - y * s, x * s + y * c, z)


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(rgb, factor):
    return tuple(max(0, min(255, int(c * factor))) for c in rgb)


def lerp_rgb(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def tri(a, b, c, color):
    return (a, b, c, color)


def box(cx, cy, cz, sx, sy, sz, color):
    """Axis-aligned box as 12 triangles. sx/sy/sz are half-extents."""
    x0, x1 = cx - sx, cx + sx
    y0, y1 = cy - sy, cy + sy
    z0, z1 = cz - sz, cz + sz
    p = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    faces = [
        (0, 1, 2, 3),
        (5, 4, 7, 6),
        (4, 0, 3, 7),
        (1, 5, 6, 2),
        (3, 2, 6, 7),
        (4, 5, 1, 0),
    ]
    face_f = [0.72, 0.95, 0.80, 0.88, 1.05, 0.55]
    out = []
    base = hex_rgb(color) if isinstance(color, str) else color
    for fi, (a, b, c, d) in enumerate(faces):
        col = shade(base, face_f[fi])
        out.append(tri(p[a], p[b], p[c], col))
        out.append(tri(p[a], p[c], p[d], col))
    return out


def pyramid(apex, base_pts, color):
    out = []
    base = hex_rgb(color) if isinstance(color, str) else color
    n = len(base_pts)
    for i in range(n):
        a = base_pts[i]
        b = base_pts[(i + 1) % n]
        f = 0.7 + 0.25 * ((i % 3) / 2)
        out.append(tri(apex, a, b, shade(base, f)))
    if n == 3:
        out.append(tri(base_pts[0], base_pts[2], base_pts[1], shade(base, 0.5)))
    elif n == 4:
        out.append(tri(base_pts[0], base_pts[1], base_pts[2], shade(base, 0.5)))
        out.append(tri(base_pts[0], base_pts[2], base_pts[3], shade(base, 0.5)))
    return out


def xform_tris(tris, fn):
    return [(fn(a), fn(b), fn(c), col) for a, b, c, col in tris]


def translate_tris(tris, dx, dy, dz):
    return xform_tris(tris, lambda p: (p[0] + dx, p[1] + dy, p[2] + dz))


def rotate_tris(tris, axis, deg):
    rot = {'x': rotate_x, 'y': rotate_y, 'z': rotate_z}[axis]
    return xform_tris(tris, lambda p: rot(p, deg))


def scale_tris(tris, sx, sy=None, sz=None):
    sy = sx if sy is None else sy
    sz = sx if sz is None else sz
    return xform_tris(tris, lambda p: (p[0] * sx, p[1] * sy, p[2] * sz))


def recolor_tris(tris, factor=None, absolute=None):
    out = []
    for a, b, c, col in tris:
        rgb = col if isinstance(col, tuple) else hex_rgb(col)
        if absolute is not None:
            rgb = absolute if isinstance(absolute, tuple) else hex_rgb(absolute)
        elif factor is not None:
            rgb = shade(rgb, factor)
        out.append((a, b, c, rgb))
    return out


# ---------- per-kind animated meshes (phase in [0,1)) ----------

def mesh_basic(phase):
    """WALK-BOB + ゆらゆら: soft L/R sway, gentle leg bob. Facing -X."""
    g = '#9aa0a8'
    gd = '#5a5e68'
    eye = '#e02028'
    ang = phase * 2 * math.pi
    # soft walk-bob (smaller than old stride)
    leg_swing = math.sin(ang) * 0.08
    leg_lift_l = max(0.0, math.sin(ang)) * 0.05
    leg_lift_r = max(0.0, -math.sin(ang)) * 0.05
    bob = math.sin(ang) * 0.035
    sway = math.sin(ang) * 5.0   # soft L/R lean, no spin

    tris = []
    body = []
    body += box(0, 0.15 + bob, 0, 0.28, 0.32, 0.22, g)
    body += box(0, 0.55 + bob, 0, 0.22, 0.14, 0.18, g)
    body += box(-0.45, 0.1 + bob, 0, 0.22, 0.06, 0.06, gd)
    body += box(0.38, 0.05 + bob, 0, 0.1, 0.12, 0.1, gd)
    body += box(-0.05, 0.55 + bob, 0.2, 0.06, 0.06, 0.04, eye)

    ll = []
    ll += box(-0.12, -0.45 + bob + leg_lift_l, 0.08 + leg_swing, 0.1, 0.28, 0.1, gd)
    ll += box(-0.12, -0.72 + bob + leg_lift_l, 0.08 + leg_swing, 0.14, 0.06, 0.12, gd)
    rl = []
    rl += box(0.12, -0.45 + bob + leg_lift_r, -0.08 - leg_swing, 0.1, 0.28, 0.1, gd)
    rl += box(0.12, -0.72 + bob + leg_lift_r, -0.08 - leg_swing, 0.14, 0.06, 0.12, gd)

    tris = body + ll + rl
    tris = rotate_tris(tris, 'z', sway)
    return tris


def mesh_drone(phase):
    """HOVER ゆらゆら: soft L/R tilt + vertical bob + rim light pulse."""
    ang = phase * 2 * math.pi
    bob = math.sin(ang) * 0.055
    tilt = math.sin(ang) * 6.0  # soft bank Z — no spin
    pulse = 0.5 + 0.5 * math.sin(ang)  # 0..1 rim brighten

    tris = []
    r, h = 0.55, 0.08
    top, bot = [], []
    n = 8
    for i in range(n):
        a = 2 * math.pi * i / n
        top.append((r * math.cos(a), h, r * math.sin(a)))
        bot.append((0.85 * r * math.cos(a), -h, 0.85 * r * math.sin(a)))
    yel = hex_rgb('#ffd428')
    yd = hex_rgb('#c8a010')
    rim_hot = hex_rgb('#fff0a0')
    for i in range(n):
        t0, t1 = top[i], top[(i + 1) % n]
        b0, b1 = bot[i], bot[(i + 1) % n]
        f = 0.75 + 0.2 * ((i % 4) / 3)
        # pulse every other rim segment
        if i % 2 == 0:
            col_t = lerp_rgb(shade(yel, f), shade(rim_hot, 1.05), pulse * 0.7)
            col_b = lerp_rgb(shade(yd, f * 0.9), shade(rim_hot, 0.9), pulse * 0.5)
        else:
            col_t = shade(yel, f)
            col_b = shade(yd, f * 0.9)
        tris.append(tri(t0, t1, b1, col_t))
        tris.append(tri(t0, b1, b0, col_b))
    tip = (0, h + 0.02, 0)
    for i in range(n):
        tris.append(tri(tip, top[i], top[(i + 1) % n], shade(yel, 1.05)))

    green = '#2e5a34'
    gd = '#1a3a22'
    tris += box(0, 0.28, 0, 0.18, 0.16, 0.18, green)
    tris += box(0, 0.42, 0, 0.12, 0.08, 0.12, gd)

    tris = translate_tris(tris, 0, bob, 0)
    tris = rotate_tris(tris, 'z', tilt)
    # tiny yaw wiggle, not a spin
    tris = rotate_tris(tris, 'y', math.sin(ang) * 3.0)  # tiny yaw sway
    return tris


def mesh_elite(phase):
    """FLIGHT ゆらゆら: engine glow pulse + soft bank/bob. Nose stays -X."""
    ang = phase * 2 * math.pi
    bank = math.sin(ang) * 5.0
    pitch = math.sin(ang) * 3.0
    bob = math.sin(ang) * 0.03
    glow = 0.5 + 0.5 * math.sin(ang)  # engine pulse

    white = '#f2f2f6'
    red = '#e01828'
    tris = []
    apex = (-0.7, 0, 0)
    base = [(0.1, 0.35, 0.2), (0.1, 0.35, -0.2), (0.1, -0.35, -0.2), (0.1, -0.35, 0.2)]
    tris += pyramid(apex, base, white)
    tris += box(0.4, 0, 0, 0.28, 0.28, 0.18, red)
    tris += box(-0.15, 0.08, 0, 0.12, 0.08, 0.1, '#304050')

    # engines — grow + brighten with pulse
    eng_col = lerp_rgb(hex_rgb('#8a0c18'), hex_rgb('#ff6040'), glow)
    eng_hot = lerp_rgb(hex_rgb('#ff4020'), hex_rgb('#ffee88'), glow)
    es = 0.10 + 0.04 * glow
    el = 0.12 + 0.08 * glow
    tris += box(0.55 + el * 0.3, 0.18, 0, el, es, es * 0.8, eng_col)
    tris += box(0.55 + el * 0.3, -0.18, 0, el, es, es * 0.8, eng_col)
    # exhaust plume (brighter when pulsed)
    plume = 0.08 + 0.14 * glow
    tris += box(0.72 + plume * 0.4, 0.18, 0, plume, 0.05, 0.05, eng_hot)
    tris += box(0.72 + plume * 0.4, -0.18, 0, plume, 0.05, 0.05, eng_hot)

    tris = translate_tris(tris, 0, bob, 0)
    tris = rotate_tris(tris, 'x', bank)  # soft roll sway
    tris = rotate_tris(tris, 'z', pitch)
    return tris


def mesh_mech(phase):
    """FLIGHT ゆらゆら: thruster flicker + soft pitch/roll sway. Nose-left."""
    ang = phase * 2 * math.pi
    # flicker: non-smooth pulse via multi-sine (brightness only)
    flick = 0.55 + 0.45 * abs(math.sin(ang * 2.3 + 0.4)) * (0.7 + 0.3 * math.sin(ang * 5.1))
    roll = math.sin(ang) * 4.5
    pitch = math.cos(ang) * 3.0
    bob = math.sin(ang) * 0.025

    white = '#f4f4f8'
    edge = '#606070'
    tris = []
    apex = (-0.7, 0, 0)
    base = [(0.55, 0.45, 0.15), (0.55, 0.45, -0.15), (0.55, -0.45, -0.15), (0.55, -0.45, 0.15)]
    tris += pyramid(apex, base, white)
    tris += box(0.55, 0, 0, 0.08, 0.2, 0.12, edge)
    tris += box(-0.1, 0.05, 0, 0.35, 0.04, 0.06, '#ffffff')

    # thruster nozzle + flame
    thr_base = lerp_rgb(hex_rgb('#404858'), hex_rgb('#88a0c0'), flick * 0.4)
    thr_hot = lerp_rgb(hex_rgb('#ff8844'), hex_rgb('#ffe8a0'), flick)
    tris += box(0.68, 0, 0, 0.06, 0.1, 0.08, thr_base)
    fl = 0.1 + 0.18 * flick
    fw = 0.04 + 0.05 * flick
    tris += box(0.68 + fl * 0.55, 0, 0, fl, fw, fw * 0.85, thr_hot)
    # secondary stutter plume
    if flick > 0.7:
        tris += box(0.68 + fl * 1.1, 0, 0, fl * 0.45, fw * 0.6, fw * 0.5, shade(thr_hot, 1.15))

    tris = translate_tris(tris, 0, bob, 0)
    tris = rotate_tris(tris, 'x', roll)
    tris = rotate_tris(tris, 'z', pitch)
    return tris


def mesh_tank(phase):
    """HEAVY ゆらゆら: slow body rock + soft bob. Weight-forward wedge."""
    ang = phase * 2 * math.pi
    rock = math.sin(ang) * 3.5          # soft roll sway
    pitch = math.sin(ang + 0.8) * 2.0
    bob = math.sin(ang) * 0.03
    # tread "advance" — shift side plates slightly
    tread = math.sin(ang) * 0.03

    red = '#e02028'
    dark = '#8a1018'
    tris = []
    apex = (-0.75, 0, 0)
    base = [(0.55, 0.4, 0.25), (0.55, 0.4, -0.25), (0.55, -0.4, -0.25), (0.55, -0.4, 0.25)]
    body = pyramid(apex, base, red)
    body += box(0.55, 0, 0, 0.1, 0.22, 0.18, dark)
    body += box(0.1, 0, 0.02, 0.35, 0.08, 0.08, '#ff5560')
    # side tread blocks
    body += box(0.05, -0.42, 0.28 + tread, 0.4, 0.08, 0.08, dark)
    body += box(0.05, -0.42, -0.28 - tread, 0.4, 0.08, 0.08, dark)
    # front plow accent
    body += box(-0.55, -0.15, 0, 0.12, 0.1, 0.22, '#ff3040')

    tris = translate_tris(body, 0, bob, 0)
    tris = rotate_tris(tris, 'x', rock)
    tris = rotate_tris(tris, 'z', pitch)
    return tris


def mesh_golem(phase):
    """ゆらゆら: core pulse + soft arm sway/lean — NO arm turntable spin."""
    ang = phase * 2 * math.pi
    pulse = 0.5 + 0.5 * math.sin(ang)
    sway = math.sin(ang) * 7.0    # soft L/R lean of cross
    rock = math.cos(ang) * 4.0    # soft fore/aft rock
    bob = math.sin(ang) * 0.03

    green = '#3cbc48'
    gd = '#1e7a28'
    yel = lerp_rgb(hex_rgb('#ffe033'), hex_rgb('#fff8c0'), pulse)
    core_hot = lerp_rgb(hex_rgb('#fff8a0'), hex_rgb('#ffffff'), pulse)

    # Fixed cross orientation — sway as a whole, never spin around Y
    arms = []
    arms += box(0.35, 0, 0, 0.35, 0.1, 0.12, green)
    arms += box(-0.35, 0, 0, 0.35, 0.1, 0.12, green)
    arms += box(0, 0, 0.35, 0.12, 0.1, 0.35, gd)
    arms += box(0, 0, -0.35, 0.12, 0.1, 0.35, gd)
    for dx, dz in ((0.65, 0), (-0.65, 0), (0, 0.65), (0, -0.65)):
        arms += box(dx, 0, dz, 0.1, 0.14, 0.1, gd)
    arms = rotate_tris(arms, 'z', sway)
    arms = rotate_tris(arms, 'x', rock)
    arms = translate_tris(arms, 0, bob, 0)

    # core scales with pulse; follows the same soft bob (no spin)
    cs = 0.20 + 0.05 * pulse
    cis = 0.10 + 0.04 * pulse
    core = []
    core += box(0, 0, 0, cs, cs, cs, yel)
    core += box(0, 0, 0, cis, cis, cis, core_hot)
    core = translate_tris(core, 0, bob, 0)

    return arms + core


def mesh_swarm(phase):
    """ゆらゆら: gentle rock/sway of crescent — NO tumble flips."""
    ang = phase * 2 * math.pi
    sway = math.sin(ang) * 8.0     # soft Z tilt L/R
    rock = math.cos(ang) * 5.0     # soft X rock
    bob = math.sin(ang) * 0.05
    # mild wing breathe (not a flap-flip)
    flap = 1.0 + 0.08 * math.sin(ang * 2)

    red = '#ff2a3a'
    hot = '#ff8890'
    tris = []
    apex = (-0.55, 0, 0)
    up = [(0.45, 0.35 * flap, 0.08), (0.45, 0.15 * flap, -0.05), (-0.05, 0.05, 0.05)]
    tris += pyramid(apex, up, red)
    lo = [(0.45, -0.35 * flap, 0.08), (-0.05, -0.05, 0.05), (0.45, -0.15 * flap, -0.05)]
    tris += pyramid(apex, lo, hot)
    tris += box(0.1, 0, 0, 0.2, 0.08, 0.08, '#c01828')

    tris = translate_tris(tris, 0, bob, 0)
    tris = rotate_tris(tris, 'z', sway)
    tris = rotate_tris(tris, 'x', rock)
    return tris


def mesh_boss(phase):
    """STATION ゆらゆら: power/light pulse + soft body sway. No turret spin."""
    ang = phase * 2 * math.pi
    pulse = 0.5 + 0.5 * math.sin(ang)
    sway = math.sin(ang) * 3.0
    rock = math.cos(ang) * 2.0
    bob = pulse * 0.02

    g0, g1, g2 = '#b0b4bc', '#6a6e78', '#3a3e48'
    accent = lerp_rgb(hex_rgb('#e02830'), hex_rgb('#ff8890'), pulse)
    accent2 = lerp_rgb(hex_rgb('#e02830'), hex_rgb('#ffcc40'), pulse * 0.8)

    tris = []
    # main hull — faces -X, soft sway only
    tris += box(0, 0, 0, 0.55, 0.35, 0.4, g1)
    tris += box(-0.15, 0, 0.1, 0.35, 0.28, 0.28, g0)
    tris += box(-0.6, 0, 0, 0.15, 0.18, 0.2, g2)
    tris += box(0.45, -0.35, 0.15, 0.2, 0.18, 0.18, g2)
    # pulsing accent lights on hull
    tris += box(-0.1, 0, 0.35, 0.1, 0.1, 0.06, accent)
    tris += box(0.25, -0.2, 0.35, 0.08, 0.08, 0.06, accent2)
    # reactor glow panel (brightens)
    glow_sz = 0.12 + 0.04 * pulse
    tris += box(0.05, 0.05, -0.38, glow_sz, glow_sz * 0.7, 0.04, accent2)

    # top tower + fixed barrel (pulse color only — no yaw spin)
    tris += box(0.4, 0.4, -0.1, 0.18, 0.2, 0.15, g1)
    tris += box(0.1, 0.45, 0, 0.08, 0.12, 0.08, g2)
    tris += box(0.1, 0.58, 0.18, 0.05, 0.05, 0.22, accent)

    tris = translate_tris(tris, 0, bob, 0)
    tris = rotate_tris(tris, 'z', sway)
    tris = rotate_tris(tris, 'x', rock)
    return tris


KIND_BUILDERS = {
    'basic': mesh_basic,
    'drone': mesh_drone,
    'elite': mesh_elite,
    'mech': mesh_mech,
    'tank': mesh_tank,
    'golem': mesh_golem,
    'swarm': mesh_swarm,
    'boss': mesh_boss,
}

# Fixed fit scales so bob/tilt doesn't resize the sprite between frames.
# Tuned so each kind fills ~78% of the 128 canvas at rest pose.
KIND_SCALE = {
    'basic': 58,
    'drone': 72,
    'elite': 62,
    'mech': 60,
    'tank': 58,
    'golem': 68,
    'swarm': 70,
    'boss': 55,
}


def project(p, scale, cx, cy):
    x, y, z = p
    px = cx + x * scale
    py = cy - y * scale
    depth = z
    return px, py, depth


def render_frame(tris, scale, size=SIZE):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, 'RGBA')
    light = vnorm((0.4, 0.7, 0.55))
    cx = cy = size / 2

    faces = []
    for a, b, c, col in tris:
        n = vnorm(vcross(vsub(b, a), vsub(c, a)))
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

    faces.sort(key=lambda f: f[0])
    for _, pts, rgba in faces:
        draw.polygon(pts, fill=rgba)
        edge = shade(rgba[:3], 0.55) + (220,)
        draw.line(pts + [pts[0]], fill=edge, width=1)

    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for kind, builder in KIND_BUILDERS.items():
        kind_dir = os.path.join(OUT, kind)
        os.makedirs(kind_dir, exist_ok=True)
        scale = KIND_SCALE[kind]
        for i in range(FRAMES):
            phase = i / FRAMES  # 0, 0.2, 0.4, 0.6, 0.8
            tris = builder(phase)
            img = render_frame(tris, scale)
            path = os.path.join(kind_dir, f'{i}.png')
            img.save(path, 'PNG')
            print('wrote', path, 'phase', round(phase, 2))
    print('done', FRAMES, 'frames x', len(KIND_BUILDERS), 'kinds (ゆらゆら sway)')


if __name__ == '__main__':
    main()
