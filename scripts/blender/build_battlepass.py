"""
Build a simplified 3D model of the Beyblade X "Bey Battle Pass" and export it as GLB.

Run (Blender 5.x, headless):
  blender.exe -b --factory-startup --python build_battlepass.py -- \
      --out <path/battlepass.glb> [--render-dir <dir>] [--no-verify]

Conventions
-----------
* 1 Blender unit = 1 mm.
* Label coordinates (from src/templates/battlepassOutline.ts): x to the right,
  y DOWN, origin = top-left of the 111.55 x 25.64 mm label bounding box.
* Blender (Z-up):  X = x - 55.775,  Y = -(y - 12.82),  Z = height.
* glTF  (Y-up):    X = x - 55.775,  Y = height,        Z = y - 12.82.
* The flat label seat (top of the recessed floor) is at Z = H_LABEL; an Empty
  "StickerAnchor" is placed at (0, 0, H_LABEL) (glTF: (0, H_LABEL, 0)).

Exported objects: Body, Button, LedWindow, Clips, Cover, StickerAnchor.
Dimensions that are not given by the label are estimated from photos
(see comments marked "EST").
"""
import bpy
import bmesh
import math
import os
import sys
import json
import struct
from mathutils import Vector

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) else default
    return default


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = arg("--out", os.path.normpath(os.path.join(HERE, "..", "..", "public", "models", "battlepass.glb")))
RENDER_DIR = arg("--render-dir", None)
VERIFY = "--no-verify" not in argv

# ---------------------------------------------------------------------------
# Reference geometry (label outline, mm, y down)
# ---------------------------------------------------------------------------
LABEL_W, LABEL_H = 111.55, 25.64
CX, CY = LABEL_W / 2.0, LABEL_H / 2.0  # 55.775, 12.82

LABEL = [
    (111.55, 0.29), (111.13, 0.01), (98.64, 0.04), (98.05, 0.62),
    (94.7, 6.13), (94.09, 6.87), (93.7, 7.08), (78.49, 7.09),
    (77.88, 6.83), (77.4, 6.37), (77.23, 5.95), (77.24, 5.24),
    (80.2, 0.32), (80.24, 0.07), (80.13, 0.0), (14.96, 0.03),
    (14.31, 0.61), (10.9, 5.84), (0.03, 19.32), (0.0, 24.83),
    (0.41, 25.42), (0.88, 25.64), (5.64, 25.64), (5.87, 25.47),
    (5.9, 24.42), (6.19, 24.16), (10.79, 24.13), (11.19, 24.42),
    (11.25, 25.47), (11.48, 25.64), (46.52, 25.64), (46.82, 25.39),
    (46.88, 24.42), (47.29, 24.1), (51.82, 24.13), (52.16, 24.44),
    (52.2, 25.47), (52.43, 25.64), (62.06, 25.64), (62.66, 25.42),
    (63.05, 24.89), (63.08, 22.38), (63.48, 21.38), (71.18, 11.69),
    (71.86, 11.09), (94.66, 11.02), (95.5, 11.4), (96.02, 12.31),
    (96.03, 16.39), (95.59, 17.45), (89.47, 24.89), (89.47, 25.35),
    (89.97, 25.64), (93.38, 25.64), (93.66, 25.47), (93.73, 24.44),
    (93.99, 24.15), (98.6, 24.1), (99.01, 24.42), (99.05, 25.39),
    (99.22, 25.63), (102.05, 25.63), (102.56, 25.42), (111.11, 14.89),
    (111.54, 14.21),
]

# Simplified outer hull of the label (no cut-outs / notches)
LABEL_HULL = [
    (15.0, 0.0), (111.55, 0.0), (111.55, 14.21), (102.45, 25.64),
    (0.0, 25.64), (0.0, 19.32), (10.9, 5.84),
]

# Button cut-out (lower right), closed downwards beyond the label edge
BUTTON_CUTOUT = [
    (63.08, 28.0), (63.08, 22.38), (63.48, 21.38), (71.18, 11.69),
    (71.86, 11.09), (94.66, 11.02), (95.5, 11.4), (96.02, 12.31),
    (96.03, 16.39), (95.59, 17.45), (89.47, 24.89), (89.47, 28.0),
]
# LED cut-out (upper right), closed upwards beyond the label edge
LED_CUTOUT = [
    (80.2, -1.6), (80.2, 0.32), (77.24, 5.24), (77.23, 5.95), (77.4, 6.37),
    (77.88, 6.83), (78.49, 7.09), (93.7, 7.08), (94.09, 6.87), (94.7, 6.13),
    (98.05, 0.62), (98.6, -1.6),
]

# ---------------------------------------------------------------------------
# Dimensions (mm)
# MEAS = measured on the real device with calipers (user):
#   body length 128.71 (tip to tip), body width 33.87, body height 20.16
#   (without clips), height incl. white clips 26.83.
# EST  = estimated from the reference photos relative to the label.
# ---------------------------------------------------------------------------
BODY_LEN = 128.71      # MEAS
BODY_WID = 33.87       # MEAS
BODY_HGT = 20.16       # MEAS (top of the button key; body bottom = 0)
CLIP_DROP = 26.83 - BODY_HGT   # MEAS: clips reach 6.67 mm below the body

Z_PANEL = 0.3          # bottom battery-cover panel thickness
Z_SEAM = 5.0           # EST: horizontal seam between lower/upper shell
Z_END_SLOPE = 12.0     # EST: above this the end faces slope inwards
Z_RIM = 18.8           # EST: top of the black rim (flat value; +1.35 crease at the end rims -> 20.15 max)
H_LABEL = 17.1         # EST: label seat (flat floor of the top recess)
COVER_GAP = 1.2        # cover underside above the label
COVER_T = 0.3          # cover thickness
Z_PLATEAU = 18.8       # EST: plateau top before crease (max 20.15 at the ridge, ~0.2 above the cover)
# key top before crease; after the crease its highest point (label y 16.3, h = 0.98)
# reaches BODY_HGT = 20.16 (MEAS: max height of the creased device without clips)
KEY_Y_TOP = 16.3      # label y of the key edge closest to the ridge
Z_KEY = BODY_HGT - (CY - (KEY_Y_TOP - CY)) * math.tan(math.radians(6.0))   # = 19.18
Z_LED = 19.0           # EST: top of the clear LED window

# Roof-like crease of the label seat / cover along the long axis (user-confirmed):
# ridge at label y = 12.82 (blender Y = 0, glTF Z = 0), both halves fall by 6 deg
# towards the label's long edges: h = max(0, 12.82 - |Y|) * tan(6 deg)  (~1.35 mm).
CREASE_DEG = 6.0
CREASE_Z0 = 12.0       # displacement fades in from this height up to H_LABEL

BODY_MARGIN = (BODY_WID - LABEL_H) / 2.0          # 4.115: hull -> rim outline
END_EXTRA = (BODY_LEN - (LABEL_W + 2 * BODY_MARGIN)) / 2.0  # 4.465: sloped end faces
# The body is NOT centred on the label across its width (photos "Oben",
# "zusammengebaut"): label top edge (LED side) -> body edge ~2.0 mm (visible black
# rim ~1.2 mm), label bottom edge (button side) -> body edge ~6.2 mm. Measured in
# Oben.jpeg: label 189 px = 25.64 mm, top rim ~14-19 px, bottom rim ~42 px, total
# 250 px = 33.9 mm. The label stays centred at the origin; the body is shifted.
RIM_TOP = 2.0
BODY_SHIFT = BODY_MARGIN - RIM_TOP   # +2.115 mm in label y (towards the button side)
POCKET_MARGIN = 0.8    # hull -> recess wall
COVER_MARGIN = 0.5     # label outline -> cover outline

SLOTS = ((3.0, 26.5), (38.5, 61.0))   # EST: side recesses on the front side (label x)
CLIP_X = 87.5          # EST: clip centre in label x (aligned with LED window)
CLIP_W = 12.5          # EST: clip width (x)
CLIP_REACH = 12.5      # EST: how far a clip sticks out of the body side (top view)

# ---------------------------------------------------------------------------
# 2D helpers (label coordinates)
# ---------------------------------------------------------------------------


def signed_area(p):
    a = 0.0
    for i in range(len(p)):
        x1, y1 = p[i]
        x2, y2 = p[(i + 1) % len(p)]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def rdp_closed(p, tol):
    """Douglas-Peucker for a closed polygon (keeps extreme points)."""
    def rdp(pts):
        if len(pts) < 3:
            return pts
        a, b = Vector(pts[0]), Vector(pts[-1])
        ab = b - a
        L = ab.length
        best, idx = -1.0, 0
        for i in range(1, len(pts) - 1):
            v = Vector(pts[i]) - a
            d = abs(ab.x * v.y - ab.y * v.x) / L if L > 1e-9 else v.length
            if d > best:
                best, idx = d, i
        if best > tol:
            return rdp(pts[:idx + 1])[:-1] + rdp(pts[idx:])
        return [pts[0], pts[-1]]
    # split at two far-apart vertices
    i0 = min(range(len(p)), key=lambda i: p[i][0])
    i1 = max(range(len(p)), key=lambda i: p[i][0])
    q = p[i0:] + p[:i0]
    k = (i1 - i0) % len(p)
    first = rdp(q[:k + 1])
    second = rdp(q[k:] + [q[0]])
    return first[:-1] + second[:-1]


def offset_poly(p, d, max_miter=3.0):
    """Offset closed polygon, d > 0 grows outward."""
    n = len(p)
    sgn = 1.0 if signed_area(p) > 0 else -1.0
    normals = []
    for i in range(n):
        a, b = Vector(p[i]), Vector(p[(i + 1) % n])
        e = b - a
        if e.length < 1e-9:
            normals.append(Vector((0, 0)))
            continue
        left = Vector((-e.y, e.x)).normalized()
        normals.append(-left * sgn)  # outward
    out = []
    for i in range(n):
        n1, n2 = normals[i - 1], normals[i]
        m = n1 + n2
        if m.length < 1e-6:
            m = n2.copy()
        m.normalize()
        c = m.dot(n2)
        L = d / c if abs(c) > 1e-3 else d
        L = max(-max_miter * abs(d), min(max_miter * abs(d), L))
        q = Vector(p[i]) + m * L
        out.append((q.x, q.y))
    return out


def chamfer_corner(p, idx, d):
    """Replace vertex idx with two points at distance d along adjacent edges."""
    n = len(p)
    v = Vector(p[idx])
    a = Vector(p[idx - 1])
    b = Vector(p[(idx + 1) % n])
    p1 = v + (a - v).normalized() * d
    p2 = v + (b - v).normalized() * d
    return p[:idx] + [(p1.x, p1.y), (p2.x, p2.y)] + p[idx + 1:]


def nearest_index(p, pt):
    return min(range(len(p)), key=lambda i: (p[i][0] - pt[0]) ** 2 + (p[i][1] - pt[1]) ** 2)


def report_poly(name, p):
    """Print size and a brute-force self-intersection check (debug aid)."""
    n = len(p)
    hits = 0

    def inter(a, b, c, d):
        def ccw(p1, p2, p3):
            return (p3[1] - p1[1]) * (p2[0] - p1[0]) - (p2[1] - p1[1]) * (p3[0] - p1[0])
        return (ccw(a, b, c) * ccw(a, b, d) < 0) and (ccw(c, d, a) * ccw(c, d, b) < 0)
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            if inter(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]):
                hits += 1
    xs = [q[0] for q in p]
    ys = [q[1] for q in p]
    print("POLY %-7s n=%3d  w=%.2f h=%.2f  self-intersections=%d" % (name, n, max(xs) - min(xs), max(ys) - min(ys), hits))


def to_bl(pt):
    """label (x, y_down) -> blender (X, Y)."""
    return (pt[0] - CX, -(pt[1] - CY))


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def hexkey(cx, cy, w, h, ch):
    """Elongated hexagon, chamfered top-left and bottom-right (label coords)."""
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    return [(x0 + ch, y0), (x1, y0), (x1, y1 - ch), (x1 - ch, y1), (x0, y1), (x0, y0 + ch)]


# ---------------------------------------------------------------------------
# Blender helpers
# ---------------------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _mesh_from_rings(name, rings):
    """rings: list of [(x, y, z), ...] loops with equal vertex count -> closed solid."""
    bm = bmesh.new()
    loops = [[bm.verts.new(v) for v in ring] for ring in rings]
    bm.faces.new(loops[0])
    bm.faces.new(loops[-1])
    n = len(loops[0])
    for a, b in zip(loops[:-1], loops[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))


def prism(name, poly_label, z0, z1, label_space=True):
    """Extruded polygon (label coords unless label_space=False -> blender XY)."""
    pts = [to_bl(p) for p in poly_label] if label_space else list(poly_label)
    return _mesh_from_rings(name, [[(x, y, z0) for x, y in pts], [(x, y, z1) for x, y in pts]])


def loft(name, sections):
    """sections: [(poly_label, z), ...] with equal vertex counts."""
    return _mesh_from_rings(name, [[(*to_bl(p), z) for p in poly] for poly, z in sections])


def prism_yz(name, poly_yz, x0, x1):
    """Profile in the blender Y-Z plane, extruded along X from x0 to x1."""
    return _mesh_from_rings(name, [[(x0, y, z) for y, z in poly_yz], [(x1, y, z) for y, z in poly_yz]])


def box(name, x0, x1, y0, y1, z0, z1):
    """Axis aligned box in BLENDER coordinates."""
    return prism(name, rect(x0, y0, x1, y1), z0, z1, label_space=False)


def cylinder(name, x, y, r, z0, z1, seg=24):
    pts = [(x + r * math.cos(2 * math.pi * i / seg), y + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    return prism(name, pts, z0, z1, label_space=False)


def apply_all_modifiers(obj):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj],
                                   selected_editable_objects=[obj]):
        for m in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def boolean(obj, cutters, op="DIFFERENCE"):
    for c in cutters:
        m = obj.modifiers.new("bool", "BOOLEAN")
        m.operation = op
        m.solver = "EXACT"
        m.object = c
        apply_all_modifiers(obj)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)


def crease_h(y):
    return max(0.0, CY - abs(y)) * math.tan(math.radians(CREASE_DEG))


def crease(obj, fade=True):
    """Insert vertex lines at Y = -12.82 / 0 / +12.82 and lift vertices by the roof
    function h(Y). Below CREASE_Z0 nothing moves, above H_LABEL the full h applies
    (linear fade in between), so the seat, rim, cover etc. get exactly
    z = z_flat + h(Y). Crease edges (2..25 deg) are marked sharp for clean shading."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for yc in (-CY, 0.0, CY):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(0.0, yc, 0.0), plane_no=(0.0, 1.0, 0.0))
    for v in bm.verts:
        if fade:
            w = min(1.0, max(0.0, (v.co.z - CREASE_Z0) / (H_LABEL - CREASE_Z0)))
        else:
            w = 1.0
        v.co.z += crease_h(v.co.y) * w
    bm.normal_update()
    for e in bm.edges:
        if len(e.link_faces) == 2:
            a = e.calc_face_angle(0.0)
            if math.radians(2.0) < a < math.radians(25.0):
                e.smooth = False
    bm.to_mesh(me)
    bm.free()
    me.update()


def bevel(obj, width, segments=2, angle=30.0):
    for p in obj.data.polygons:
        p.use_smooth = True
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.miter_outer = "MITER_ARC"
    m.harden_normals = True
    m.use_clamp_overlap = True
    apply_all_modifiers(obj)


def flat(obj):
    for p in obj.data.polygons:
        p.use_smooth = False


def join(objs, name):
    target = objs[0]
    with bpy.context.temp_override(active_object=target, object=target,
                                   selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


def principled(name, color, rough, alpha=1.0, metallic=0.0, emission=None, emission_strength=0.0,
               blended=False):
    mat = bpy.data.materials.new(name)
    if hasattr(mat, "use_nodes"):
        try:
            mat.use_nodes = True
        except Exception:
            pass
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = (*color, alpha)
    if blended or alpha < 1.0:
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
        if hasattr(mat, "blend_method"):
            try:
                mat.blend_method = "BLEND"
            except Exception:
                pass
        if hasattr(mat, "use_transparency_overlap"):
            mat.use_transparency_overlap = True
    return mat


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def build():
    reset_scene()
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 0.001
    sc.unit_settings.length_unit = "MILLIMETERS"

    M = {
        "body": principled("BodyBlack", (0.012, 0.012, 0.014), 0.35),
        "button": principled("ButtonBlack", (0.018, 0.018, 0.02), 0.62),
        "led_clear": principled("LedClear", (0.72, 0.84, 0.78), 0.05, alpha=0.2,
                                emission=(0.3, 1.0, 0.4), emission_strength=0.06),
        "led_chip": principled("LedGreen", (0.1, 1.0, 0.2), 0.3,
                               emission=(0.15, 1.0, 0.25), emission_strength=6.0),
        "clips": principled("ClipsWhite", (0.88, 0.91, 0.93), 0.4, alpha=0.88),
        "cover": principled("CoverClear", (0.95, 0.97, 1.0), 0.05, alpha=0.15),
    }

    # ---- outlines ---------------------------------------------------------
    # rim outline at the top (label hull + margin), small chamfers on the two
    # "square" corners (EST from the top-view photos)
    top_ol = [(x, y + BODY_SHIFT) for x, y in offset_poly(LABEL_HULL, BODY_MARGIN)]
    top_ol = chamfer_corner(top_ol, nearest_index(top_ol, (LABEL_W + BODY_MARGIN, -RIM_TOP)), 3.5)
    top_ol = chamfer_corner(top_ol, nearest_index(top_ol, (-BODY_MARGIN, LABEL_H + BODY_MARGIN + BODY_SHIFT)), 2.5)
    # full footprint: the end faces slope outwards below the rim, so the body is
    # 128.71 mm long at the bottom but only ~119.8 mm at the top (photos + MEAS)
    foot_ol = [(x - END_EXTRA if x < CX else x + END_EXTRA, y) for x, y in top_ol]
    lower_ol = offset_poly(foot_ol, -0.6)
    groove_ol = offset_poly(foot_ol, -1.5)
    pocket_ol = offset_poly(LABEL_HULL, POCKET_MARGIN)
    label_simpl = rdp_closed(LABEL, 0.3)
    cover_ol = offset_poly(label_simpl, COVER_MARGIN)
    for nm, pl in (("top", top_ol), ("foot", foot_ol), ("pocket", pocket_ol), ("cover", cover_ol)):
        report_poly(nm, pl)

    body_y_front = LABEL_H + BODY_MARGIN + BODY_SHIFT  # label y of the long "bottom" side (blender -Y)

    def side_abs(sgn):
        """|blender Y| of the long side: sgn=+1 back/LED side, -1 front/button side."""
        return CY + BODY_MARGIN - sgn * BODY_SHIFT

    # ---- Body -------------------------------------------------------------
    parts = []

    lower = prism("lower", lower_ol, Z_PANEL, Z_SEAM)
    bevel(lower, 0.5, 2)
    parts.append(lower)

    groove = prism("groove", groove_ol, Z_SEAM - 0.2, Z_SEAM + 0.6)
    parts.append(groove)

    upper = loft("upper", [(foot_ol, Z_SEAM + 0.4), (foot_ol, Z_END_SLOPE), (top_ol, Z_RIM)])
    cutters = [prism("pocket_cut", pocket_ol, H_LABEL, Z_RIM + 5)]
    # two rectangular side recesses on the front long side (EST, photo "Seitebon Unten")
    for x0, x1 in SLOTS:
        cutters.append(prism("slot", rect(x0, body_y_front - 1.0, x1, body_y_front + 2.0), 7.6, 14.2))
    boolean(upper, cutters)
    crease(upper)
    bevel(upper, 0.45, 2)
    parts.append(upper)

    # slot inner panels (slightly recessed black blocks inside the recesses)
    for x0, x1 in SLOTS:
        pnl = prism("slotpanel", rect(x0 + 0.8, body_y_front - 1.2, x1 - 0.8, body_y_front - 0.45), 8.2, 13.6)
        bevel(pnl, 0.2, 1)
        parts.append(pnl)

    # button plateau (black, raised through the label cut-out)
    plateau = prism("plateau", offset_poly(BUTTON_CUTOUT, -0.7), H_LABEL - 1.0, Z_PLATEAU)
    crease(plateau)
    bevel(plateau, 0.5, 2)
    parts.append(plateau)

    # bottom battery cover panel + screws + transverse ribs (photo "Unterseite")
    panel = prism("panel", rect(2.0, 1.5 + BODY_SHIFT, 60.0, 24.0 + BODY_SHIFT), 0.0, Z_PANEL + 0.2)
    bevel(panel, 0.2, 1)
    parts.append(panel)
    for sx, sy in ((-1.5, 20.0), (106.0, 4.0)):
        bx, by = to_bl((sx, sy + BODY_SHIFT))
        s_ = cylinder("screw", bx, by, 1.6, 0.05, Z_PANEL + 0.3, 16)
        bevel(s_, 0.15, 1)
        parts.append(s_)
    for rx in (64.0, 67.5, 102.0):
        parts.append(prism("rib", rect(rx, 1.0 + BODY_SHIFT, rx + 1.2, 24.6 + BODY_SHIFT), 0.0, Z_PANEL + 0.2))

    # clip guides / latches on both long sides (black, photos "Seite von LED", "Seitebon Unten")
    cX = CLIP_X - CX
    for sgn in (1, -1):
        side_Y = side_abs(sgn)
        g = box("guide", cX - 4.0, cX + 4.0,
                *(sorted((sgn * (side_Y - 1.0), sgn * (side_Y + 1.8)))), 1.0, 9.0)
        bevel(g, 0.35, 2)
        parts.append(g)
        for dx in (-10.5, 10.5):
            l_ = box("latch", cX + dx - 2.3, cX + dx + 2.3,
                     *(sorted((sgn * (side_Y - 1.0), sgn * (side_Y + 2.0)))), -2.5, 8.0)
            bevel(l_, 0.35, 2)
            parts.append(l_)
            t = box("latchtooth", cX + dx - 2.3, cX + dx + 2.3,
                    *(sorted((sgn * (side_Y + 1.4), sgn * (side_Y + 3.0)))), -2.5, 1.5)
            bevel(t, 0.25, 1)
            parts.append(t)

    body = join(parts, "Body")
    set_material(body, M["body"])

    # ---- Button (hexagonal key) -----------------------------------------
    key = prism("Button", hexkey(73.2, 20.6, 13.5, 8.6, 3.2), Z_PLATEAU - 0.6, Z_KEY)
    crease(key)
    bevel(key, 0.3, 3)
    key.name = "Button"
    key.data.name = "Button"
    set_material(key, M["button"])

    # ---- LED window -------------------------------------------------------
    ledw = prism("LedWindow", offset_poly(LED_CUTOUT, -0.5), H_LABEL - 0.6, Z_LED)
    crease(ledw)
    bevel(ledw, 0.45, 2)
    chip_x, chip_y = to_bl((87.5, 3.4))
    chip = box("chip", chip_x - 1.2, chip_x + 1.2, chip_y - 0.8, chip_y + 0.8, H_LABEL - 0.2, H_LABEL + 0.8)
    crease(chip)
    bevel(chip, 0.2, 1)
    set_material(ledw, M["led_clear"])
    set_material(chip, M["led_chip"])
    ledw = join([ledw, chip], "LedWindow")

    # ---- Clips ------------------------------------------------------------
    # U-shaped white brackets: they leave the body side, drop CLIP_DROP below the
    # body bottom and form a foot plate reaching CLIP_REACH outwards (EST shape).
    cparts = []
    x0, x1 = cX - CLIP_W / 2, cX + CLIP_W / 2
    zb = -CLIP_DROP
    for sgn in (1, -1):
        s0 = side_abs(sgn)
        web = [(s0 - 2.0, zb), (s0 + CLIP_REACH, zb), (s0 + CLIP_REACH, zb + 1.5),
               (s0 + 2.2, zb + 1.5), (s0 + 2.2, 7.0), (s0 - 2.0, 7.0)]
        rail = [(s0 - 2.0, zb), (s0 + CLIP_REACH, zb), (s0 + CLIP_REACH, zb + 3.2),
                (s0 + 8.5, zb + 3.2), (s0 + 4.0, 4.5), (s0 - 2.0, 4.5)]

        def m(poly, sgn=sgn):
            pts = [(sgn * y, z) for y, z in poly]
            return pts if sgn > 0 else pts[::-1]
        cparts.append(prism_yz("clipweb", m(web), x0 + 0.01, x1 - 0.01))
        cparts.append(prism_yz("cliprail", m(rail), x0, x0 + 1.6))
        cparts.append(prism_yz("cliprail", m(rail), x1 - 1.6, x1))
    for c in cparts:
        bevel(c, 0.3, 2)
    clips = join(cparts, "Clips")
    set_material(clips, M["clips"])

    # ---- Cover ------------------------------------------------------------
    cz0 = H_LABEL + COVER_GAP
    cover = prism("Cover", cover_ol, cz0, cz0 + COVER_T)
    cparts = [cover]
    # small pegs that drop into the notches of the label's bottom edge
    for nx0, nx1 in ((6.6, 10.4), (47.6, 51.4), (94.6, 98.0)):
        cparts.append(prism("peg", rect(nx0, 24.6, nx1, 25.4), H_LABEL + 0.05, cz0 + 0.01))
    cover = join(cparts, "Cover")
    crease(cover)
    flat(cover)
    set_material(cover, M["cover"])

    # ---- Anchor -----------------------------------------------------------
    anchor = bpy.data.objects.new("StickerAnchor", None)
    anchor.empty_display_type = "PLAIN_AXES"
    anchor.empty_display_size = 5
    anchor.location = (0.0, 0.0, H_LABEL)
    anchor["creaseDeg"] = CREASE_DEG  # exported to glTF extras -> three.js userData.creaseDeg
    link(anchor)

    export_objs = [body, key, ledw, clips, cover, anchor]
    return export_objs, M


def tri_count(objs):
    n = 0
    for o in objs:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n


def export(objs, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )


# ---------------------------------------------------------------------------
# Rendering (test only, nothing here is exported)
# ---------------------------------------------------------------------------


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 900
    sc.render.film_transparent = False
    try:
        sc.eevee.taa_render_samples = 48
    except Exception:
        pass
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.55, 0.57, 0.6, 1)
    bg.inputs["Strength"].default_value = 0.6
    sc.world = world

    def light(name, kind, loc, energy, size=None, rot=None):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        if size is not None:
            ld.size = size
        o = link(bpy.data.objects.new(name, ld))
        o.location = loc
        d = Vector((0, 0, 8)) - Vector(loc)
        o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return o

    light("Key", "AREA", (-120, -160, 260), 9e5, size=180)
    light("Fill", "AREA", (180, 120, 160), 3.5e5, size=150)
    light("Rim", "AREA", (40, 220, 60), 2.0e5, size=80)

    floor_mat = principled("Floor", (0.62, 0.62, 0.62), 0.7)
    fl = box("Floor", -600, 600, -600, 600, -CLIP_DROP - 1.0, -CLIP_DROP - 0.02)
    set_material(fl, floor_mat)


def camera(name, loc, target=(0, 0, 8), ortho=None, lens=70):
    cd = bpy.data.cameras.new(name)
    cd.clip_start = 1
    cd.clip_end = 5000
    if ortho:
        cd.type = "ORTHO"
        cd.ortho_scale = ortho
    else:
        cd.lens = lens
    o = link(bpy.data.objects.new(name, cd))
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o


def render(cam, path):
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDERED", path)


def add_test_label():
    bm = bmesh.new()
    vs = [bm.verts.new((*to_bl(p), H_LABEL + 0.02)) for p in LABEL]
    bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("TestLabel")
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new("TestLabel", me))
    crease(o, fade=False)
    if o.data.polygons[0].normal.z < 0:
        o.data.flip_normals()
    set_material(o, principled("TestLabelMat", (0.95, 0.85, 0.1), 0.6))
    return o


def renders(rdir):
    os.makedirs(rdir, exist_ok=True)
    setup_render()
    cams = {
        "top": camera("CamTop", (0, 0, 400), (0, 0, 0), ortho=145),
        "oblique": camera("CamOblique", (-25, -185, 185), (5, -2, 6), lens=60),
        "side": camera("CamSide", (0, -280, 12), (0, 0, 7), lens=85),
        "back": camera("CamBack", (60, 200, 130), (5, 0, 6), lens=60),
        "under": camera("CamUnder", (-40, -160, -150), (0, 0, 4), lens=60),
        "end": camera("CamEnd", (-230, -90, 60), (-40, 0, 5), lens=60),
        "endon": camera("CamEndOn", (-400, 0, 16), (0, 0, 16), ortho=48),
    }
    floor = bpy.data.objects.get("Floor")
    for k in ("top", "oblique", "side", "back", "end", "endon"):
        render(cams[k], os.path.join(rdir, f"render_{k}.png"))
    cov = bpy.data.objects.get("Cover")
    cov.hide_render = True
    render(cams["oblique"], os.path.join(rdir, "debug_oblique_nocover.png"))
    cov.hide_render = False
    floor.hide_render = True
    render(cams["under"], os.path.join(rdir, "render_under.png"))
    floor.hide_render = False
    lab = add_test_label()
    render(cams["top"], os.path.join(rdir, "label_top.png"))
    render(cams["oblique"], os.path.join(rdir, "label_oblique.png"))
    render(cams["endon"], os.path.join(rdir, "label_endon.png"))
    bpy.data.objects.remove(lab, do_unlink=True)


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


def read_glb_json(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, ver, length = struct.unpack_from("<4sII", data, 0)
    clen, ctype = struct.unpack_from("<II", data, 12)
    return json.loads(data[20:20 + clen].decode("utf-8"))


def verify(path):
    print("=== VERIFY", path, os.path.getsize(path), "bytes")
    gj = read_glb_json(path)
    for n in gj.get("nodes", []):
        print("NODE", n.get("name"), "extras=", n.get("extras"), "t=", n.get("translation"), "r=", n.get("rotation"),
              "s=", n.get("scale"), "mesh=", n.get("mesh"))
    for m in gj.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        print("MAT", m.get("name"), "alphaMode=", m.get("alphaMode", "OPAQUE"),
              "base=", [round(v, 3) for v in pbr.get("baseColorFactor", [1, 1, 1, 1])],
              "rough=", pbr.get("roughnessFactor"), "metal=", pbr.get("metallicFactor"),
              "emis=", m.get("emissiveFactor"), "ext=", list(m.get("extensions", {}).keys()))
    # positional bounds per mesh (glTF space)
    for mi, mesh in enumerate(gj.get("meshes", [])):
        mn = [1e9] * 3
        mx = [-1e9] * 3
        for prim in mesh["primitives"]:
            acc = gj["accessors"][prim["attributes"]["POSITION"]]
            mn = [min(a, b) for a, b in zip(mn, acc["min"])]
            mx = [max(a, b) for a, b in zip(mx, acc["max"])]
        print("MESHBOUNDS", mesh.get("name"), [round(v, 2) for v in mn], [round(v, 2) for v in mx])

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=path)
    objs = list(bpy.context.scene.objects)
    for o in objs:
        print("IMPORTED", o.name, o.type, tuple(round(v, 3) for v in o.matrix_world.translation))
    print("TRIS", tri_count(objs))
    a = bpy.data.objects.get("StickerAnchor")
    if a:
        print("ANCHOR_BLENDER_Z", round(a.matrix_world.translation.z, 4), "expected", H_LABEL)


def main():
    objs, _ = build()
    print("TRIS_BEFORE_EXPORT", tri_count(objs))
    export(objs, OUT)
    print("EXPORTED", OUT, os.path.getsize(OUT))
    if RENDER_DIR:
        renders(RENDER_DIR)
    if VERIFY:
        verify(OUT)
    print("H_LABEL", H_LABEL)


main()
