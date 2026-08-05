"""Auto-rig a static humanoid GLB and give it Idle/Walk clips.

    python3 tools/rig-character.py <in.glb> <out.glb>

WHY THIS EXISTS: generated characters (Tripo, Meshy, Higgsfield) come out as a single static
mesh with no skeleton. The game's character pipeline needs a skinned mesh — `makeCharModel`
drives the player from a mixer clip and NPCs from a procedural walk cycle keyed on bone NAMES —
so an unrigged GLB is a statue that slides around the world with its legs frozen.

Rather than hand-authoring bone positions per model, every landmark below is MEASURED from the
mesh itself (arm span, foot split, head top, shoulder height), so the same script rigs the next
generated character without re-tuning numbers.

Requires Blender as a Python module: `pip install bpy`.

COORDINATE NOTE: glTF is Y-up, Blender is Z-up. The importer converts, so inside this script
z = height, and the horizontal axes are whatever the model happened to be authored with. The
"which way is forward" question is answered by measuring where the toes point, not assumed.
"""
import sys, math
import bpy
from mathutils import Vector, Euler, Quaternion

IN, OUT = sys.argv[1], sys.argv[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=IN)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshes:
    sys.exit("no mesh in " + IN)
# Join multi-part models: one skinned mesh keeps the runtime simple and matches every other
# character in models_cdn/.
for o in bpy.data.objects:
    o.select_set(o.type == "MESH")
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

V = [v.co.copy() for v in obj.data.vertices]
zs = [v.z for v in V]
Z0, Z1 = min(zs), max(zs)
H = Z1 - Z0


def band(lo, hi):
    return [v for v in V if Z0 + H * lo <= v.z < Z0 + H * hi]


# ---- which horizontal axis is left/right? The arms are the widest thing on a humanoid. ----
mid = band(0.35, 0.60)
spanY = max(v.y for v in mid) - min(v.y for v in mid)
spanX = max(v.x for v in mid) - min(v.x for v in mid)
LR, FB = ("y", "x") if spanY > spanX else ("x", "y")


def lr(v):
    return getattr(v, LR)


def fb(v):
    return getattr(v, FB)


def vec(lrv, fbv, z):
    """Build a vector in the model's own frame from (left-right, front-back, height)."""
    out = Vector((0, 0, z))
    setattr(out, LR, lrv)
    setattr(out, FB, fbv)
    return out


# ---- forward: the toes overhang the heels, so the foot's long axis points forward ----
feet = [v for v in V if v.z < Z0 + H * 0.07]
FWD = 1.0 if abs(max(fb(v) for v in feet)) >= abs(min(fb(v) for v in feet)) else -1.0

# ---- landmarks, all measured ----
hand = max(V, key=lambda v: abs(lr(v)))          # arm tip: the widest vertex in the whole model
HAND_LR, HAND_Z = abs(lr(hand)), hand.z
# Shoulder height: walk DOWN from the head and take the first band that is much wider than the
# neck — that is where the arms leave the torso.
neck_w = max(abs(lr(v)) for v in band(0.62, 0.68)) if band(0.62, 0.68) else H * 0.1
SHOULDER_Z = HAND_Z
for i in range(60, 30, -1):
    b = band(i / 100.0, i / 100.0 + 0.02)
    if b and max(abs(lr(v)) for v in b) > neck_w * 1.6:
        SHOULDER_Z = Z0 + H * (i / 100.0)
        break
SHOULDER_LR = max(neck_w * 0.9, HAND_LR * 0.25)

# Head: the narrowest point above the shoulders is the neck; the head sits just above it. A hat
# or hood extends past the skull, so the head bone is anchored at the neck rather than the top
# of the bounding box (which would put it inside the hat's point).
NECK_Z = SHOULDER_Z + H * 0.06
HEAD_Z = NECK_Z + H * 0.10

# Feet: split the lowest verts by side to get each foot's centre.
FOOT_LR = sum(abs(lr(v)) for v in feet) / len(feet)
FOOT_Z = Z0 + H * 0.02
TOE_FB = FWD * max(abs(fb(v)) for v in feet)

HIP_Z = Z0 + H * 0.44
KNEE_Z = Z0 + H * 0.24
CHEST_Z = (HIP_Z + SHOULDER_Z) / 2

print("measured: height %.3f  LR axis %s  forward %+d" % (H, LR, FWD))
print("  shoulder z %.3f lr %.3f | hand z %.3f lr %.3f" % (SHOULDER_Z, SHOULDER_LR, HAND_Z, HAND_LR))
print("  neck %.3f head %.3f | hip %.3f knee %.3f foot %.3f lr %.3f" % (NECK_Z, HEAD_Z, HIP_Z, KNEE_Z, FOOT_Z, FOOT_LR))

# ---- armature ----
arm_data = bpy.data.armatures.new("Armature")
rig = bpy.data.objects.new("Armature", arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones


def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name)
    b.head, b.tail = head, tail
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b


# BONE NAMES MATTER. world.js drives NPCs with a procedural walk cycle that looks bones up BY
# NAME (`applyWalkCycle`: LeftLeg, RightUpLeg, LeftArm, LeftForeArm, Spine...), so a rig with its
# own naming scheme animates only when it has a baked clip and stands frozen as an NPC. These are
# the Mixamo-style names the rest of the pipeline already uses.
bone("Hips", vec(0, 0, HIP_Z), vec(0, 0, CHEST_Z))
bone("Spine", vec(0, 0, CHEST_Z), vec(0, 0, SHOULDER_Z), "Hips", True)
bone("Spine1", vec(0, 0, SHOULDER_Z), vec(0, 0, NECK_Z), "Spine", True)
bone("Neck", vec(0, 0, NECK_Z), vec(0, 0, HEAD_Z), "Spine1", True)
bone("Head", vec(0, 0, HEAD_Z), vec(0, 0, HEAD_Z + H * 0.10), "Neck", True)

SH = {"L": "LeftShoulder", "R": "RightShoulder"}
UA = {"L": "LeftArm", "R": "RightArm"}
LA = {"L": "LeftForeArm", "R": "RightForeArm"}
HN = {"L": "LeftHand", "R": "RightHand"}
UL = {"L": "LeftUpLeg", "R": "RightUpLeg"}
LL = {"L": "LeftLeg", "R": "RightLeg"}
FT = {"L": "LeftFoot", "R": "RightFoot"}

for s, side in ((1, "L"), (-1, "R")):
    sh = vec(s * SHOULDER_LR, 0, SHOULDER_Z)
    # Elbow is the midpoint of the shoulder->hand line, nudged down so the arm bends the way a
    # real one does instead of hyperextending on the first frame of the walk cycle.
    hd = vec(s * HAND_LR, 0, HAND_Z)
    el = (sh + hd) / 2
    el.z -= H * 0.015
    bone(SH[side], vec(0, 0, SHOULDER_Z), sh, "Spine1")
    bone(UA[side], sh, el, SH[side], True)
    bone(LA[side], el, hd, UA[side], True)
    bone(HN[side], hd, hd + vec(s * H * 0.04, 0, -H * 0.02), LA[side], True)

    hip = vec(s * FOOT_LR * 0.8, 0, HIP_Z)
    knee = vec(s * FOOT_LR * 0.9, 0, KNEE_Z)
    foot = vec(s * FOOT_LR, 0, FOOT_Z)
    bone(UL[side], hip, knee, "Hips")
    bone(LL[side], knee, foot, UL[side], True)
    bone(FT[side], foot, vec(s * FOOT_LR, TOE_FB, FOOT_Z), LL[side], True)

bpy.ops.object.mode_set(mode="OBJECT")

# ---- skin ----
# Blender's bone-heat solver ("automatic weights") FAILS OUTRIGHT on this class of mesh: generated
# models are non-manifold and full of interior geometry, and heat diffusion needs a clean closed
# surface. It does not raise — it warns and leaves all 19 vertex groups empty, which exports as an
# unskinned mesh that simply ignores the skeleton. (Envelope parenting is not a fallback either:
# it stores no vertex groups at all, so glTF has nothing to write.)
#
# So weights are computed here instead, by distance to each bone SEGMENT. Crude next to heat
# diffusion, but it is predictable, it always produces real groups, and for a stylised character
# in a robe the difference is not visible in motion.
import numpy as np

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_NAME")   # bind + create groups, no weights

co = np.empty(len(obj.data.vertices) * 3)
obj.data.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)

bones = [(b.name, np.array(b.head_local), np.array(b.tail_local)) for b in rig.data.bones]

# Anatomical gating. Without it the nearest-bone test hands the chest to a leg bone whenever the
# arms are down: a robe's skirt and its sleeve are inches apart in space but must not share a
# bone. Each bone declares the height band it is allowed to claim, as a fraction of the model.
def frac(z):
    return (z - Z0) / H

WAIST, SHOULDER_F = frac(HIP_Z), frac(SHOULDER_Z)

# LEGS vs SKIRT. A robe is one surface spanning both legs, so binding it to them rips it down
# the middle on the first stride. The obvious separator — "legs only below the hem" — does not
# work, because the hem and the boot tops OVERLAP in height: cut above the hem and the robe
# tears, cut below it and the boots detach at the ankle. Both were seen on screen.
#
# The reliable separator is DISTANCE, not height. Boots and trousers hug the leg bones; a skirt
# is a broad surface that flares well clear of them. So legs claim only what is close to them.
# LEG_REACH is measured: how far the leg silhouette extends past the bone itself, down where
# there is nothing but leg.
skirt_top = min(int(WAIST * 100), int(frac(HAND_Z) * 100) - 3)
counts = [(f, len(band(f / 100.0, f / 100.0 + 0.03))) for f in range(15, max(18, skirt_top), 3)]
typical = sorted(c for _, c in counts)[len(counts) // 2] if counts else 0
HEM = None
for f in range(max(18, skirt_top), 4, -3):
    if typical and len(band(f / 100.0, f / 100.0 + 0.03)) < typical * 0.35:
        HEM = f / 100.0 + 0.03
        break
below = [v for v in V if frac(v.z) < (HEM if HEM is not None else WAIST)]
leg_span = max((abs(lr(v)) for v in below), default=FOOT_LR * 2)
LEG_REACH = max(FOOT_LR * 0.6, (leg_span - FOOT_LR) * 1.35)
print("  hem %s | leg reach %.3f (span %.3f, bone at %.3f)"
      % ("%.2f" % HEM if HEM else "none", LEG_REACH, leg_span, FOOT_LR))

ARM_BOTTOM = min(WAIST, frac(HAND_Z)) - 0.05
LEG_TOP = WAIST + 0.04
gate = {}
for name, hd, tl in bones:
    if name.endswith(("UpLeg", "Leg", "Foot")):
        # height cap keeps legs out of the chest; the DISTANCE cap is what keeps the skirt off
        # them while still letting the boots ride along
        gate[name] = (-1.0, LEG_TOP, LEG_REACH if HEM is not None else 1e9)
    elif name.endswith(("Shoulder", "Arm", "ForeArm", "Hand")):
        gate[name] = (ARM_BOTTOM, 2.0, 1e9)
    elif name in ("Neck", "Head"):
        gate[name] = (SHOULDER_F - 0.04, 2.0, 1e9)
    else:
        gate[name] = (-1.0, 2.0, 1e9)

zf = (co[:, 2] - Z0) / H
W = np.zeros((len(co), len(bones)))
for bi, (name, hd, tl) in enumerate(bones):
    ab = tl - hd
    L2 = float(ab @ ab) or 1e-9
    t = np.clip(((co - hd) @ ab) / L2, 0.0, 1.0)[:, None]
    d = np.linalg.norm(co - (hd + t * ab), axis=1)
    lo, hi, maxd = gate[name]
    ok = (zf >= lo) & (zf <= hi) & (d <= maxd)
    # inverse-power falloff: high power keeps a bone's influence local, which is what stops a
    # sleeve from dragging the hem of the robe with it
    W[:, bi] = np.where(ok, 1.0 / np.maximum(d, 1e-4) ** 4, 0.0)

# keep the 4 strongest per vertex — glTF only stores 4 joint influences anyway
keep = 4
idx = np.argsort(-W, axis=1)[:, :keep]
mask = np.zeros_like(W, dtype=bool)
np.put_along_axis(mask, idx, True, axis=1)
W = np.where(mask, W, 0.0)
rows = W.sum(axis=1, keepdims=True)
# a vertex out of range of every gated bone (rare, e.g. the hat tip) falls back to the nearest
orphan = (rows[:, 0] <= 0)
if orphan.any():
    for vi in np.nonzero(orphan)[0]:
        best, bd = 0, 1e18
        for bi, (name, hd, tl) in enumerate(bones):
            ab = tl - hd
            t = float(np.clip(((co[vi] - hd) @ ab) / (float(ab @ ab) or 1e-9), 0, 1))
            dd = float(np.linalg.norm(co[vi] - (hd + t * ab)))
            if dd < bd:
                best, bd = bi, dd
        W[vi, best] = 1.0
    rows = W.sum(axis=1, keepdims=True)
W = W / rows

for bi, (name, _, _) in enumerate(bones):
    vg = obj.vertex_groups[name]
    nz = np.nonzero(W[:, bi] > 1e-3)[0]
    for vi in nz:
        vg.add([int(vi)], float(W[vi, bi]), "REPLACE")
print("skinned by bone proximity: %d verts, %d bones" % (len(co), len(bones)))

# A robe is one surface spanning both legs, so leg weights meet in a hard seam down the middle
# and the hem scissors apart when the legs swing. Smoothing bleeds each vertex toward its
# neighbours, turning that tear into a soft sway.
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
try:
    # Heavy smoothing. The standing pose swings the arms 52 degrees down from the bind pose, so
    # any hard boundary between arm weights and torso weights becomes a visible tear in the
    # sleeve — far more than the small swing the first version was tuned against.
    bpy.ops.object.vertex_group_smooth(group_select_mode="ALL", factor=0.55, repeat=10)
except RuntimeError as e:
    print("weight smoothing skipped:", e)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.objects.active = rig

# ---- animation ----
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
pb = rig.pose.bones
for b in pb:
    b.rotation_mode = "QUATERNION"

# A pose bone's rotation is expressed in ITS OWN space, where +Y runs head-to-tail along the
# bone, and the axis a limb swings around depends on which way that limb POINTS:
#
#   * a leg points straight down, so swinging it forward/back rotates about the left-right axis;
#   * an A-pose arm points sideways, so the same forward/back swing rotates about the VERTICAL.
#
# Assuming one fixed axis gets both wrong. Setting a Euler angle on a downward leg twists it
# about its own length instead of swinging it (measured: 5.7% of body height at the boots where a
# 26 deg hip swing should give ~37%), and using the left-right axis on a sideways arm spins the
# arm in its sleeve (3.1% at the hands where ~14% was expected).
#
# So derive it: axis = normalize(bone_direction x forward). That is perpendicular to the bone and
# to the direction of travel for ANY limb orientation, and the cross product's handedness makes a
# positive angle swing forward every time — no per-bone sign table.
FORWARD = Vector((0, 0, 0))
setattr(FORWARD, FB, FWD)
LR_AXIS = Vector((0, 0, 0))
setattr(LR_AXIS, LR, 1.0)


def local_swing(bone_name, angle):
    bone = rig.data.bones[bone_name]
    d = (Vector(bone.tail_local) - Vector(bone.head_local)).normalized()
    axis = d.cross(FORWARD)
    if axis.length < 1e-4:        # bone points straight along the travel axis; nothing to swing
        axis = LR_AXIS.copy()
    axis.normalize()
    local = bone.matrix_local.to_3x3().inverted() @ axis
    local.normalize()
    return Quaternion(local, angle)


DOWN = Vector((0, 0, -1))


def local_toward(bone_name, target, angle):
    """Rotate a bone `angle` radians from where it points toward `target`, in bone space.

    Same derivation as local_swing: the axis is bone_direction x target, which is perpendicular
    to both, so a POSITIVE angle always moves the bone toward the target whatever its orientation
    and whatever handedness the model was authored with. No per-side sign table to get wrong.
    """
    bone = rig.data.bones[bone_name]
    d = (Vector(bone.tail_local) - Vector(bone.head_local)).normalized()
    axis = d.cross(target)
    if axis.length < 1e-4:
        return Quaternion((1, 0, 0, 0))
    axis.normalize()
    local = bone.matrix_local.to_3x3().inverted() @ axis
    local.normalize()
    return Quaternion(local, angle)


# REST POSE vs STANDING POSE. Generated characters are authored in an A-pose — arms out, away
# from the body — because that is what makes them riggable. It is NOT how a character stands.
# Animating a small swing around the A-pose leaves the arms permanently spread, which reads as a
# T-pose no matter how correct the skeleton underneath is; that is exactly what shipped first.
#
# So every clip is built on top of a standing pose that brings the arms down to the sides, and
# the swing is layered on that rather than on the bind pose.
ARM_DOWN = math.radians(46)
FOREARM_IN = math.radians(10)
STANDING = {}
for _side in ("L", "R"):
    STANDING[UA[_side]] = local_toward(UA[_side], DOWN, ARM_DOWN)
    STANDING[LA[_side]] = local_toward(LA[_side], DOWN, FOREARM_IN)


def key(bone_name, frame, angle=None, loc=None):
    b = pb[bone_name]
    if angle is not None:
        # compose: stand first, then swing. Quaternion multiply, not addition of Euler angles,
        # or the two rotations fight over the same axis and the arm ends up somewhere neither
        # pose intended.
        q = local_swing(bone_name, angle)
        base = STANDING.get(bone_name)
        b.rotation_quaternion = (base @ q) if base else q
        b.keyframe_insert("rotation_quaternion", frame=frame)
    if loc:
        b.location = Vector(loc)
        b.keyframe_insert("location", frame=frame)


def new_action(name):
    for b in pb:
        b.rotation_quaternion = STANDING.get(b.name, Quaternion((1, 0, 0, 0)))
        b.location = (0, 0, 0)
    a = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = a
    return a


# --- Walk: 24 frames, one full stride (left step, right step) so it loops seamlessly. ---
walk = new_action("Walk")
D = math.radians
for f, phase in ((1, 0), (7, 1), (13, 2), (19, 3), (25, 0)):
    # phase 0/2 = passing, 1 = left leg forward, 3 = right leg forward
    a = {0: 0.0, 1: 1.0, 2: 0.0, 3: -1.0}[phase]
    # Modest stride. Weight smoothing (needed for the sleeves) bleeds a little leg influence
    # back into the skirt, and a big swing turns that residue into a visible tear rather than a
    # sway. A robed wizard steps short anyway.
    key("LeftUpLeg", f, (D(17) * a))
    key("RightUpLeg", f, (D(-17) * a))
    key("LeftLeg", f, (D(-16) * max(0.0, -a)))
    key("RightLeg", f, (D(-16) * max(0.0, a)))
    # arms counter-swing the legs, which is what makes a walk read as a walk
    key("LeftArm", f, (D(-22) * a))
    key("RightArm", f, (D(22) * a))
    key("LeftForeArm", f, (D(-10) * abs(a)))
    key("RightForeArm", f, (D(-10) * abs(a)))
    # the body rises on the passing pose and dips on the contact pose
    key("Hips", f, D(3) * a, (0, 0, H * (0.012 if phase in (0, 2) else 0.0)))
    key("Spine", f, (D(-4) * a))
    key("Head", f, (D(3) * a))

# --- Idle: slow breathing, 48 frames. ---
idle = new_action("Idle")
for f, t in ((1, 0.0), (25, 1.0), (49, 0.0)):
    key("Spine", f, (D(-2.2) * t))
    key("Spine1", f, (D(2.0) * t))
    key("Head", f, (D(-1.5) * t))
    # Arms are keyed even where they barely move, so the STANDING pose is baked into the clip.
    # Without a key the bone falls back to its bind transform and the arms snap back out.
    key("LeftArm", f, (D(4.0) * t))
    key("RightArm", f, (D(-4.0) * t))
    key("LeftForeArm", f, (D(3.0) * t))
    key("RightForeArm", f, (D(3.0) * t))
    key("Hips", f, None, (0, 0, H * 0.006 * t))

for a in (walk, idle):
    a.use_fake_user = True     # both actions must survive to the exporter, not just the active one

bpy.ops.object.mode_set(mode="OBJECT")

# ---- orientation ----
# world.js sets `player.rotation.y = atan2(moveX, moveZ)`, so at rotation 0 the model must face
# glTF +Z. Rotate the whole rig so the measured forward axis lands there. Done last, on the
# armature, so the mesh follows and the animation data stays in the frame it was authored in.
gltf_forward = Vector((0, 0, 1))
cur = Vector((0, 0, 0))
setattr(cur, FB, FWD)
# Blender -Y is glTF +Z; convert the measured forward into glTF's frame to get the angle.
cur_gltf = Vector((cur.x, cur.z, -cur.y))
angle = math.atan2(gltf_forward.x, gltf_forward.z) - math.atan2(cur_gltf.x, cur_gltf.z)
rig.rotation_euler = Euler((0, 0, angle), "XYZ")
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
print("rotated %.0f deg so the model faces glTF +Z" % math.degrees(angle))

# ---- export ----
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB",
    export_animations=True, export_animation_mode="ACTIONS",
    export_skins=True, export_yup=True, use_selection=True,
)
print("wrote", OUT)
