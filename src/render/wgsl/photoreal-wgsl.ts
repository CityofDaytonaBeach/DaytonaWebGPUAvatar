/**
 * Photoreal human WGSL — GENERATED from the shared photoreal constants and the
 * light rig in `../photoreal/constants.ts`, so the shader can never drift from
 * the CPU reference model in `../photoreal/*`.
 *
 * Drop-in replacement for `HUMAN_RENDER_WGSL`: identical bind group layout
 * (params / camera / part) and identical vertex attribute layout (position,
 * normal, uv, tangentPerturb), so the renderer swaps the module without any
 * pipeline change.
 *
 * Material inputs per part (`PartParams`):
 *   baseColor.rgb   linear albedo, baseColor.a alpha
 *   material        [roughness, specular, sssIntensity, ior]
 *   sssColor.rgb    deep-tissue scatter colour
 *   flags           PHOTOREAL_FLAGS bit field (skin / iris / sclera / enamel /
 *                   refractive / normalPerturb)
 */

import { HUMAN_PARAM_STRUCT } from './shaders.js';
import {
  PHOTOREAL_CONSTANTS,
  PHOTOREAL_FLAGS,
  PHOTOREAL_LIGHT_RIG,
} from '../photoreal/constants.js';

const C = PHOTOREAL_CONSTANTS;
const F = PHOTOREAL_FLAGS;
const R = PHOTOREAL_LIGHT_RIG;

const f = (x: number): string => {
  const s = String(x);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};
const v3 = (a: readonly [number, number, number]): string =>
  `vec3f(${f(a[0])}, ${f(a[1])}, ${f(a[2])})`;

/** The full generated photoreal WGSL program (vertex + fragment in one module). */
export const PHOTOREAL_HUMAN_WGSL = `
${HUMAN_PARAM_STRUCT}

// ─── Generated photoreal constants (source: photoreal/constants.ts) ───────────
const SPEC_LOBE_MIX        : f32 = ${f(C.specLobeMix)};
const LOBE_ROUGHNESS_SCALE : f32 = ${f(C.lobeRoughnessScale)};
const MIN_ROUGHNESS        : f32 = ${f(C.minRoughness)};
const SSS_WRAP             : f32 = ${f(C.sssWrap)};
const SSS_DISTORTION       : f32 = ${f(C.sssDistortion)};
const CURVATURE_SCALE      : f32 = ${f(C.curvatureScale)};
const TRANSMISSION_STRENGTH: f32 = ${f(C.transmissionStrength)};
const EXPOSURE             : f32 = ${f(C.exposure)};
const AMBIENT              : f32 = ${f(C.ambient)};
const PORE_FREQUENCY       : f32 = ${f(C.poreFrequency)};
const MICRO_FREQUENCY      : f32 = ${f(C.microFrequency)};
const MICRO_SLOPE_MAX      : f32 = ${f(C.microSlopeMax)};
const LIMBUS_START         : f32 = ${f(C.limbusStart)};
const CORNEA_DEPTH         : f32 = ${f(C.corneaDepth)};
const ENAMEL_TRANSLUCENCY  : f32 = ${f(C.enamelTranslucency)};
const SCLERA_VASCULARITY   : f32 = ${f(C.scleraVascularity)};

// Part flag bits.
const FLAG_NORMAL_PERTURB : u32 = ${F.normalPerturb}u;
const FLAG_REFRACTIVE     : u32 = ${F.refractive}u;
const FLAG_IRIS           : u32 = ${F.iris}u;
const FLAG_SCLERA         : u32 = ${F.sclera}u;
const FLAG_ENAMEL         : u32 = ${F.enamel}u;
const FLAG_SKIN           : u32 = ${F.skin}u;

// Three-point light rig.
const KEY_DIR  : vec3f = ${v3(R.key.direction)};
const KEY_COL  : vec3f = ${v3(R.key.color)};
const KEY_INT  : f32   = ${f(R.key.intensity)};
const FILL_DIR : vec3f = ${v3(R.fill.direction)};
const FILL_COL : vec3f = ${v3(R.fill.color)};
const FILL_INT : f32   = ${f(R.fill.intensity)};
const RIM_DIR  : vec3f = ${v3(R.rim.direction)};
const RIM_COL  : vec3f = ${v3(R.rim.color)};
const RIM_INT  : f32   = ${f(R.rim.intensity)};

// Fixed surface properties for the parametric head (metres / 1-over-metres).
const SKIN_CURVATURE : f32 = 12.0;
const SKIN_THICKNESS : f32 = 0.004;

struct Camera {
  mvp : mat4x4f,
  normalMat : mat3x3f,
};

struct PartParams {
  baseColor : vec4f,
  material  : vec4f,   // roughness, specular, sssIntensity, ior
  sssColor  : vec4f,   // rgb = scatter colour
  flags     : u32,
};

struct VSIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
  @location(3) tangentPerturb : vec2f,
};
struct VSOut {
  @builtin(position) clip_position : vec4f,
  @location(0) world_normal : vec3f,
  @location(1) uv : vec2f,
  @location(2) tangent_perturb : vec2f,
  @location(3) part_flags : u32,
};

@group(0) @binding(0) var<uniform> params : HumanParams;
@group(0) @binding(1) var<uniform> camera : Camera;
@group(0) @binding(2) var<uniform> part   : PartParams;

@vertex
fn vs_main(in : VSIn) -> VSOut {
  var out : VSOut;
  out.clip_position = camera.mvp * vec4f(in.position, 1.0);
  out.world_normal = normalize(camera.normalMat * in.normal);
  out.uv = in.uv;
  out.tangent_perturb = in.tangentPerturb;
  out.part_flags = part.flags;
  return out;
}

// ─── Micro detail (mirrors photoreal/micro-detail.ts) ────────────────────────

fn hash21(x : f32, y : f32) -> f32 {
  let s = sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - floor(s);
}

fn valueNoise2D(x : f32, y : f32) -> f32 {
  let ix = floor(x);
  let iy = floor(y);
  let fx = x - ix;
  let fy = y - iy;
  let ux = fx * fx * (3.0 - 2.0 * fx);
  let uy = fy * fy * (3.0 - 2.0 * fy);
  let a = hash21(ix, iy);
  let b = hash21(ix + 1.0, iy);
  let c = hash21(ix, iy + 1.0);
  let d = hash21(ix + 1.0, iy + 1.0);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

fn microHeight(u : f32, v : f32, poreScale : f32, age : f32) -> f32 {
  let fp = PORE_FREQUENCY * poreScale;
  let fm = MICRO_FREQUENCY * poreScale;
  return valueNoise2D(u * fp, v * fp) * (0.65 + 0.35 * age)
       + valueNoise2D(u * fm, v * fm) * 0.25;
}

struct MicroDetail {
  slope : vec2f,
  cavity : f32,
  specularOcclusion : f32,
};

fn microDetail(uv : vec2f, poreScale : f32, age : f32, oiliness : f32) -> MicroDetail {
  let scale = max(poreScale, 0.05);
  let eps = 1e-3;
  let h0 = microHeight(uv.x, uv.y, scale, age);
  let hx = microHeight(uv.x + eps, uv.y, scale, age);
  let hy = microHeight(uv.x, uv.y + eps, scale, age);
  let amplitude = MICRO_SLOPE_MAX * (1.0 - 0.6 * oiliness) * (0.7 + 0.5 * age);
  let gx = (hx - h0) / eps;
  let gy = (hy - h0) / eps;
  let norm = 1.0 / (1.0 + abs(gx) + abs(gy));
  var out : MicroDetail;
  out.slope = clamp(vec2f(-gx * norm * amplitude, -gy * norm * amplitude),
                    vec2f(-MICRO_SLOPE_MAX), vec2f(MICRO_SLOPE_MAX));
  let depth = clamp(0.55 - h0, 0.0, 1.0) * (0.6 + 0.8 * age);
  out.cavity = clamp(1.0 - depth, 0.0, 1.0);
  out.specularOcclusion = clamp(1.0 - depth * 0.8, 0.0, 1.0);
  return out;
}

fn reconstructNormal(slope : vec2f, n : vec3f) -> vec3f {
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(n.y) > 0.99) { up = vec3f(0.0, 0.0, 1.0); }
  let t = normalize(cross(up, n));
  let b = cross(n, t);
  let z = sqrt(max(1.0 - dot(slope, slope), 0.0));
  return normalize(t * slope.x + b * slope.y + n * z);
}

// ─── Skin BRDF (mirrors photoreal/skin-brdf.ts) ──────────────────────────────

fn fresnelSchlick(cosT : f32, f0 : vec3f) -> vec3f {
  let fc = pow(1.0 - clamp(cosT, 0.0, 1.0), 5.0);
  return f0 + (vec3f(1.0) - f0) * fc;
}

fn distributionGGX(ndh : f32, roughness : f32) -> f32 {
  let a = max(roughness * roughness, MIN_ROUGHNESS * MIN_ROUGHNESS);
  let a2 = a * a;
  let d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d + 1e-9);
}

fn visibilitySmithCorrelated(ndv : f32, ndl : f32, roughness : f32) -> f32 {
  let a = max(roughness * roughness, MIN_ROUGHNESS * MIN_ROUGHNESS);
  let a2 = a * a;
  let lv = ndl * sqrt(ndv * ndv * (1.0 - a2) + a2);
  let ll = ndv * sqrt(ndl * ndl * (1.0 - a2) + a2);
  return 0.5 / max(lv + ll, 1e-6);
}

fn dualLobeSpecular(ndh : f32, ndv : f32, ndl : f32, roughness : f32) -> f32 {
  let r0 = max(roughness, MIN_ROUGHNESS);
  let r1 = min(r0 * LOBE_ROUGHNESS_SCALE, 1.0);
  let sharp = distributionGGX(ndh, r0) * visibilitySmithCorrelated(ndv, ndl, r0);
  let broad = distributionGGX(ndh, r1) * visibilitySmithCorrelated(ndv, ndl, r1);
  return (1.0 - SPEC_LOBE_MIX) * sharp + SPEC_LOBE_MIX * broad;
}

fn preIntegratedScatter(ndl : f32, curvature : f32, scatterColor : vec3f, intensity : f32) -> vec3f {
  let wrapped = clamp((ndl + SSS_WRAP) / (1.0 + SSS_WRAP), 0.0, 1.0);
  let lambert = clamp(ndl, 0.0, 1.0);
  let width = clamp(CURVATURE_SCALE / (1.0 + max(curvature, 0.0)), 0.0, 1.0);
  let blend = clamp(intensity, 0.0, 1.0) * width;
  let green = lambert + (wrapped - lambert) * 0.55;
  let blue  = lambert + (wrapped - lambert) * 0.25;
  let scattered = vec3f(wrapped * scatterColor.r, green * scatterColor.g, blue * scatterColor.b);
  return mix(vec3f(lambert), scattered, blend);
}

fn transmissionTerm(n : vec3f, l : vec3f, v : vec3f, thickness : f32, scatterColor : vec3f) -> vec3f {
  let back = normalize(-l - n * SSS_DISTORTION);
  let vdb = pow(clamp(dot(v, back), 0.0, 1.0), 4.0);
  let attenuation = exp(-max(thickness, 0.0) * 220.0);
  return scatterColor * (vdb * attenuation * TRANSMISSION_STRENGTH);
}

fn shadeLight(n : vec3f, v : vec3f, albedo : vec3f, roughness : f32, specular : f32,
              scatterColor : vec3f, scatterIntensity : f32, curvature : f32,
              thickness : f32, specOcclusion : f32,
              lightDir : vec3f, lightColor : vec3f, lightIntensity : f32) -> vec3f {
  let l = normalize(lightDir);
  let h = normalize(l + v);
  let ndl = dot(n, l);
  let ndv = max(dot(n, v), 1e-4);
  let ndh = clamp(dot(n, h), 0.0, 1.0);
  let vdh = clamp(dot(v, h), 0.0, 1.0);

  let f0 = vec3f(0.028 + 0.06 * specular);
  let fr = fresnelSchlick(vdh, f0);

  var specMag = 0.0;
  if (ndl > 0.0) {
    specMag = dualLobeSpecular(ndh, ndv, max(ndl, 1e-4), roughness);
  }
  let spec = fr * (specMag * max(ndl, 0.0) * specOcclusion);

  let response = preIntegratedScatter(ndl, curvature, scatterColor, scatterIntensity);
  let kD = vec3f(1.0) - fr;
  let diffuse = albedo * response * kD;
  let trans = transmissionTerm(n, l, v, thickness, scatterColor);
  return (diffuse + spec + trans) * (lightColor * lightIntensity);
}

// ─── Eye + enamel (mirrors photoreal/eye-shading.ts) ─────────────────────────

fn irisParallaxOffset(n : vec3f, v : vec3f, ior : f32, irisRadius : f32) -> vec2f {
  let eta = 1.0 / max(ior, 1.0001);
  let incident = -normalize(v);
  let cosI = clamp(dot(incident, n), -1.0, 1.0);
  let k = 1.0 - eta * eta * (1.0 - cosI * cosI);
  var refr = incident;
  if (k >= 0.0) {
    refr = normalize(eta * incident + (eta * cosI - sqrt(k)) * n);
  }
  var denom = abs(refr.z);
  if (denom < 1e-4) { denom = 1e-4; }
  let t = CORNEA_DEPTH / denom;
  return vec2f(refr.x, refr.y) * (t / max(irisRadius, 1e-5));
}

fn pupilRadius(sceneLuminance : f32, dilation : f32) -> f32 {
  let lum = clamp(sceneLuminance, 0.0, 1.0);
  let constricted = 0.18 + 0.12 * (1.0 - log(1.0 + 9.0 * lum) / log(10.0));
  return clamp(constricted + (0.55 - constricted) * clamp(dilation, 0.0, 1.0), 0.0, 1.0);
}

fn limbalRing(radius : f32) -> f32 {
  if (radius <= LIMBUS_START) { return 1.0; }
  let t = clamp((radius - LIMBUS_START) / max(1.0 - LIMBUS_START, 1e-4), 0.0, 1.0);
  return 1.0 - 0.75 * (t * t * (3.0 - 2.0 * t));
}

fn enamelFactor(edgeProximity : f32, archDepth : f32) -> f32 {
  let edge = clamp(edgeProximity, 0.0, 1.0);
  let depth = clamp(archDepth, 0.0, 1.0);
  return clamp((1.0 - ENAMEL_TRANSLUCENCY * edge) * (1.0 - 0.55 * depth), 0.0, 1.0);
}

// ─── Display transform (mirrors photoreal/color.ts) ──────────────────────────

fn acesFilmic(x : f32) -> f32 {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

fn linearToSrgb(x : f32) -> f32 {
  let c = clamp(x, 0.0, 1.0);
  if (c <= 0.0031308) { return c * 12.92; }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

fn toDisplay(c : vec3f) -> vec3f {
  let e = c * EXPOSURE;
  let tm = vec3f(acesFilmic(e.r), acesFilmic(e.g), acesFilmic(e.b));
  return vec3f(linearToSrgb(tm.r), linearToSrgb(tm.g), linearToSrgb(tm.b));
}

@fragment
fn fs_main(in : VSOut) -> @location(0) vec4f {
  var albedo = part.baseColor.rgb;
  let roughness = part.material.r;
  let specular = part.material.g;
  var sssIntensity = part.material.b;
  let ior = part.material.a;
  let flags = in.part_flags;

  var nrm = normalize(in.world_normal);
  let viewDir = vec3f(0.0, 0.0, 1.0);

  var specOcclusion = 1.0;
  var cavity = 1.0;
  var curvature = SKIN_CURVATURE;
  var thickness = SKIN_THICKNESS;

  // Skin: micro-detail normal + cavity/specular occlusion, aged by params.
  if ((flags & FLAG_SKIN) != 0u) {
    let age = clamp(params.skin_age / 100.0, 0.0, 1.0);
    let oiliness = clamp(params.skin_wetness, 0.0, 1.0);
    let md = microDetail(in.uv, 1.0, age, oiliness);
    var slope = md.slope;
    if ((flags & FLAG_NORMAL_PERTURB) != 0u) {
      slope = clamp(slope + in.tangent_perturb, vec2f(-MICRO_SLOPE_MAX), vec2f(MICRO_SLOPE_MAX));
    }
    nrm = reconstructNormal(slope, nrm);
    specOcclusion = md.specularOcclusion;
    cavity = md.cavity;
  } else if ((flags & FLAG_NORMAL_PERTURB) != 0u) {
    nrm = reconstructNormal(in.tangent_perturb, nrm);
  }

  // Iris: parallax through the corneal dome, pupil, fibres, limbal ring.
  if ((flags & FLAG_IRIS) != 0u) {
    let centred = (in.uv - vec2f(0.5)) * 2.0;
    let offset = irisParallaxOffset(nrm, viewDir, 1.376, 0.006);
    let s = centred + offset;
    let radius = length(s);
    let pupil = pupilRadius(0.35, 0.5);
    if (radius <= pupil) {
      albedo = vec3f(0.012, 0.012, 0.014);
    } else {
      let angle = atan2(s.y, s.x);
      let fibre = 0.85 + 0.15 * abs(sin(angle * 24.0));
      let inner = clamp(1.0 - (radius - pupil) / max(1.0 - pupil, 1e-4), 0.0, 1.0);
      albedo = mix(albedo, albedo * 1.35, inner * 0.4) * (fibre * limbalRing(radius));
    }
    curvature = 130.0;
    thickness = 0.0005;
  }

  // Sclera: vascular tint toward the corners + wet surface.
  if ((flags & FLAG_SCLERA) != 0u) {
    let cornerness = clamp(abs(in.uv.x - 0.5) * 2.0, 0.0, 1.0);
    albedo = mix(albedo, vec3f(0.82, 0.42, 0.4), cornerness * SCLERA_VASCULARITY);
    curvature = 85.0;
  }

  // Enamel: translucent edges, occluded toward the molars.
  if ((flags & FLAG_ENAMEL) != 0u) {
    let edge = clamp(in.uv.y, 0.0, 1.0);
    let archDepth = clamp(abs(in.uv.x - 0.5) * 2.0, 0.0, 1.0);
    albedo = mix(albedo, vec3f(0.72, 0.76, 0.82), edge * 0.35) * enamelFactor(edge, archDepth);
    curvature = 60.0;
    thickness = 0.0015;
    sssIntensity = max(sssIntensity, 0.25);
  }

  var color = vec3f(0.0);
  color += shadeLight(nrm, viewDir, albedo, roughness, specular, part.sssColor.rgb,
                      sssIntensity, curvature, thickness, specOcclusion,
                      KEY_DIR, KEY_COL, KEY_INT);
  color += shadeLight(nrm, viewDir, albedo, roughness, specular, part.sssColor.rgb,
                      sssIntensity, curvature, thickness, specOcclusion,
                      FILL_DIR, FILL_COL, FILL_INT);
  color += shadeLight(nrm, viewDir, albedo, roughness, specular, part.sssColor.rgb,
                      sssIntensity, curvature, thickness, specOcclusion,
                      RIM_DIR, RIM_COL, RIM_INT);
  color += albedo * (AMBIENT * cavity);

  // Corneal dome: refracted iris behind, Fresnel-blended with the dome reflection.
  if ((flags & FLAG_REFRACTIVE) != 0u) {
    let ndv = max(dot(nrm, viewDir), 1e-4);
    let domeF = fresnelSchlick(ndv, vec3f(0.04));
    let behind = albedo * (0.5 + 0.5 * ndv);
    color = mix(behind * (vec3f(1.0) - domeF), albedo * 0.9, domeF * 0.6) + color * 0.35;
  }

  return vec4f(toDisplay(color), part.baseColor.a);
}
`;

/** Shading model selector for the renderer/pipeline. */
export type ShadingModel = 'basic' | 'photoreal';
