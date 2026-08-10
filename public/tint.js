// tint.js — the per-school hue shift, as a shader patch.
//
// WHY THIS IS NOT JUST `material.color.set(...)`:
// `player_wizard.glb` is one mesh whose material Base Color is **white** — every bit of its
// colour lives in the texture map. Multiplying `material.color` therefore cannot rotate a hue; it
// can only darken or colourise, which is what the old 45% lerp did and why the wizard came out
// the same washed purple whatever school was chosen. Verified by rendering it, not by reading the
// code: the preview showed a Fire wizard in Storm purple while `appearanceFor()` was correctly
// returning hue 16.
//
// So the shift has to happen AFTER the texture is sampled, which means in the fragment shader.
// This patches `<map_fragment>` on any material and converts each sampled texel to HSL, rotates
// its hue toward the school's along the SHORT way round the wheel, scales saturation, nudges
// lightness, and converts back. Lightness is preserved rather than replaced, so all the painted
// shading survives.
//
// Shared by world.js and preview3d.js on purpose. The creation screen must show exactly what the
// world will render; two copies of this maths would drift and make the preview a lie.

const CHUNK = `
uniform float uTintHue;      // target hue, 0..1
uniform float uTintSat;      // saturation multiplier
uniform float uTintLight;    // lightness offset
uniform float uTintStrength; // 0 = untouched, 1 = fully on the target hue

vec3 alaRgb2Hsl(vec3 c){
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float h = 0.0, s = 0.0;
  float d = mx - mn;
  if (d > 0.00001){
    s = l > 0.5 ? d / max(0.00001, 2.0 - mx - mn) : d / max(0.00001, mx + mn);
    if (mx == c.r)      h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else                h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float alaHue2Rgb(float p, float q, float t){
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}
vec3 alaHsl2Rgb(vec3 hsl){
  float h = hsl.x, s = hsl.y, l = hsl.z;
  if (s <= 0.00001) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(alaHue2Rgb(p, q, h + 1.0/3.0), alaHue2Rgb(p, q, h), alaHue2Rgb(p, q, h - 1.0/3.0));
}
vec3 alaTint(vec3 rgb){
  vec3 hsl = alaRgb2Hsl(rgb);
  // Rotate the SHORT way round the wheel. A plain mix() from 0.95 to 0.05 travels backwards
  // through every hue in between, so a character would sweep green on its way to red.
  float d = uTintHue - hsl.x;
  d -= floor(d + 0.5);
  float h = fract(hsl.x + d * uTintStrength + 1.0);
  // Nearly-grey texels (skin shadow, boot leather, the whites of the eyes) have no meaningful
  // hue to rotate, and forcing one on them turns the face into a mask. Fade the shift out as
  // saturation approaches zero.
  float keep = smoothstep(0.0, 0.12, hsl.y);
  h = mix(hsl.x, h, keep);
  float s = clamp(hsl.y * uTintSat, 0.0, 1.0);
  float l = clamp(hsl.z + uTintLight * keep, 0.02, 0.98);
  return alaHsl2Rgb(vec3(h, s, l));
}
`;

/**
 * Patch one material so its sampled colour is hue-shifted toward `look`.
 *
 * Idempotent: calling it again on the same material updates the uniforms in place rather than
 * recompiling, so dragging through the swatches on the creation screen is free.
 */
export function applyTint(material, look){
  if (!material) return;
  if (material.userData.alaTint){
    const u = material.userData.alaTint;
    u.uTintHue.value = look.hue / 360;
    u.uTintSat.value = look.sat;
    u.uTintLight.value = look.light;
    u.uTintStrength.value = look.strength;
    return;
  }
  const u = {
    uTintHue:      { value: look.hue / 360 },
    uTintSat:      { value: look.sat },
    uTintLight:    { value: look.light },
    uTintStrength: { value: look.strength },
  };
  material.userData.alaTint = u;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    // The helpers must be declared before main(), and the tint must run AFTER the texture is
    // sampled — hence keeping the original include and appending to it rather than replacing it.
    shader.fragmentShader = CHUNK + shader.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\n  diffuseColor.rgb = alaTint(diffuseColor.rgb);"
    );
  };
  // Materials that differ only in uniform values can still share one compiled program.
  material.customProgramCacheKey = () => "alaTint";
  material.needsUpdate = true;
}

/** Apply the tint to every mesh material under `root`. */
export function tintTree(root, look){
  if (!root) return 0;
  let n = 0;
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats){ applyTint(m, look); n++; }
  });
  return n;
}
