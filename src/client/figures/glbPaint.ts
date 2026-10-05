// Army painter for baked-texture GLBs (30-figures section 4). A fragment-shader hue-band remap: texels whose hue is
// within +-BAND_DEG of a faction's source hue (the faction's two dominant paint hues) are shifted to the chosen colour,
// keeping their own shading; low-saturation texels (metal, black, white) are left alone. Materials are cloned per
// (source material, paint, grey) and cached, never per figure; the shared loader cache is never mutated and an
// unpainted figure keeps its original materials.
import { Color, Mesh, type Material, type MeshStandardMaterial, type Object3D } from 'three'
import { factionData } from './profile'
import { paintKey, type ArmyPaint } from './paintStore'

export const BAND_DEG = 22
export const MIN_SAT = 0.18

export type Hsv = [number, number, number]
/** Hex -> HSV with h in 0..1, in three's linear working space (the space the shader sees after texture decode). */
export function hsvOf(hex: string): Hsv {
  const c = new Color(hex)
  const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), d = mx - mn
  let h = 0
  if (d > 1e-6) {
    if (mx === c.r) h = (((c.g - c.b) / d) % 6 + 6) % 6
    else if (mx === c.g) h = (c.b - c.r) / d + 2
    else h = (c.r - c.g) / d + 4
    h /= 6
  }
  return [h, mx > 0 ? d / mx : 0, mx]
}

export interface SourceBand { hue: number; sat: number; val: number }
/**
 * The two source bands of a faction: hues from faction.sourceHues (degrees), reference saturation/value from the
 * faction palette where that colour is saturated enough to mean something, else a mid default.
 */
export function sourceBands(factionId: string): [SourceBand, SourceBand] | null {
  const f = factionData(factionId)
  if (!f.sourceHues || f.sourceHues.length < 2) return null
  const one = (deg: number, hex?: string): SourceBand => {
    const hsv = hex ? hsvOf(hex) : null
    const usable = hsv && hsv[1] >= MIN_SAT
    return { hue: (((deg % 360) + 360) % 360) / 360, sat: usable ? hsv[1] : 0.5, val: usable ? hsv[2] : 0.25 }
  }
  return [one(f.sourceHues[0], f.palette?.primary), one(f.sourceHues[1], f.palette?.secondary)]
}

const GLSL_FUNCS = /* glsl */ `
uniform vec3 uSrc0; uniform vec3 uTgt0; uniform vec3 uSrc1; uniform vec3 uTgt1; uniform vec2 uOn; uniform float uBand; uniform float uGrey;
vec3 wmRgb2Hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x); }
vec3 wmHsv2Rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
`
const GLSL_REMAP = /* glsl */ `
#include <map_fragment>
{
  vec3 pc = wmRgb2Hsv(diffuseColor.rgb);
  if (pc.y > ${MIN_SAT.toFixed(2)} && pc.z > 0.02) {
    float d0 = pc.x - uSrc0.x; d0 = abs(d0 - floor(d0 + 0.5));
    float d1 = pc.x - uSrc1.x; d1 = abs(d1 - floor(d1 + 0.5));
    float w0 = uOn.x * (1. - smoothstep(uBand * 0.6, uBand, d0));
    float w1 = uOn.y * (1. - smoothstep(uBand * 0.6, uBand, d1));
    vec3 src = uSrc0; vec3 tgt = uTgt0; float w = w0; float dh = pc.x - uSrc0.x;
    if (w1 > w0) { src = uSrc1; tgt = uTgt1; w = w1; dh = pc.x - uSrc1.x; }
    if (w > 0.) {
      dh = dh - floor(dh + 0.5);
      vec3 o = vec3(fract(tgt.x + dh * 0.5), clamp(pc.y * min(tgt.y / max(src.y, 0.25), 4.), 0., 1.), clamp(pc.z * min(tgt.z / max(src.z, 0.08), 4.), 0., 1.));
      diffuseColor.rgb = mix(diffuseColor.rgb, wmHsv2Rgb(o), w);
    }
  }
  if (uGrey > 0.) {
    float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l * 0.7), uGrey);
  }
}
`

const variants = new Map<string, Material>()
/** Number of cached material variants (tests). */
export const variantCount = (): number => variants.size

const v3 = (a?: Hsv | [number, number, number]) => ({ value: { x: a?.[0] ?? 0, y: a?.[1] ?? 0, z: a?.[2] ?? 0 } })

/** The painted / greyed variant of `src` for this faction + paint (cached); `src` itself when nothing changes. */
export function variantMaterial(src: Material, factionId: string, paint: ArmyPaint | undefined, grey: boolean): Material {
  const pk = paintKey(paint)
  if (!pk && !grey) return src
  const key = `${src.uuid}|${factionId}|${pk}|${grey ? 'g' : ''}`
  const hit = variants.get(key)
  if (hit) return hit
  const bands = sourceBands(factionId)
  const pairs: ({ src: Hsv; tgt: Hsv } | null)[] = [0, 1].map((i) => {
    const target = i === 0 ? paint?.primary : paint?.secondary
    const b = bands?.[i]
    return b && target ? { src: [b.hue, b.sat, b.val] as Hsv, tgt: hsvOf(target) } : null
  })
  const uniforms = {
    uSrc0: v3(pairs[0]?.src), uTgt0: v3(pairs[0]?.tgt), uSrc1: v3(pairs[1]?.src), uTgt1: v3(pairs[1]?.tgt),
    uOn: { value: { x: pairs[0] ? 1 : 0, y: pairs[1] ? 1 : 0 } }, uBand: { value: BAND_DEG / 360 }, uGrey: { value: grey ? 0.85 : 0 },
  }
  const m = src.clone() as MeshStandardMaterial
  m.name = `${src.name || 'mat'}:paint:${pk || '-'}${grey ? ':grey' : ''}`
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.fragmentShader = GLSL_FUNCS + shader.fragmentShader.replace('#include <map_fragment>', GLSL_REMAP)
  }
  m.customProgramCacheKey = () => 'wm-army-paint-v1'
  variants.set(key, m)
  return m
}

type Orig = { material: Material | Material[] }
const orig = (mesh: Mesh): Orig => (mesh.userData.__wmOrigMat ??= { material: mesh.material } as Orig) as Orig

/** Is this mesh the GLB's own base disc? (finalize adds a node named "base" with the base_black material.) */
export const isBaseMesh = (mesh: Mesh): boolean => {
  const o = orig(mesh).material
  const first = Array.isArray(o) ? o[0] : o
  return mesh.name === 'base' || mesh.parent?.name === 'base' || first?.name === 'base_black'
}

/** Point every figure mesh (not the base) at its painted/greyed variant; returns a restore function. */
export function applyGlbPaint(object: Object3D, factionId: string, paint: ArmyPaint | undefined, grey: boolean): () => void {
  const touched: Mesh[] = []
  object.traverse((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || isBaseMesh(mesh)) return
    const src = orig(mesh).material
    touched.push(mesh)
    mesh.material = Array.isArray(src) ? src.map((m) => variantMaterial(m, factionId, paint, grey)) : variantMaterial(src, factionId, paint, grey)
  })
  return () => { for (const mesh of touched) mesh.material = orig(mesh).material }
}
