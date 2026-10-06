#!/usr/bin/env python3
"""Whirr Machine ground mats. Deterministic. Poly Haven CC0 bases, de-tiled and scarred with FFT-noise features
(large-scale noise idea after Mallet's board-texture generator). Run fetch.py first.
Usage: python gen.py [board ...]   (bog ruins village wasteland outpost table)
Bases are read from PH_DIR (default %TEMP%/ph). Output: public/assets/terrain/boards/<board>/{albedo,normal,rough}.jpg"""
import sys, os, io, numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from PIL import Image, ImageFile
ImageFile.MAXBLOCK = 1 << 26

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'terrain', 'boards')
PH = os.environ.get('PH_DIR', os.path.join(os.environ.get('TEMP', '/tmp'), 'ph'))
N = 2048
YY, XX = np.mgrid[0:N, 0:N].astype(np.float32)
FX = np.fft.fftfreq(N)[None, :].astype(np.float32)
FY = np.fft.fftfreq(N)[:, None].astype(np.float32)
FR = np.sqrt(FX**2 + FY**2); FR[0, 0] = 1


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def norm(n):
    n = n - n.mean(); return (n / (n.std() + 1e-9)).astype(np.float32)


def fbm(seed, period=200, p=1.6):
    spec = np.fft.fft2(np.random.default_rng(seed).standard_normal((N, N)).astype(np.float32))
    amp = FR ** -p * (1 / (1 + (1.0 / period / FR) ** 4)); amp[0, 0] = 0
    return norm(np.fft.ifft2(spec * amp).real)


def blobs(seed, period, thresh, soft=0.35):
    return ss(thresh - soft, thresh + soft, fbm(seed, period * 1.7, 3.2))


def gblur(a, s): return ndi.gaussian_filter(a, s)


def load(name):
    d = lambda k: np.asarray(Image.open(os.path.join(PH, f'{name}_{k}.jpg')).convert('RGB'), np.float32) / 255
    return d('diff'), d('nor'), d('rough')[..., 0]


def shrink(a, m):
    """Resize a 0..1 float image (H, W[, C]) to m x m with Lanczos (prefilter before fine tiling)."""
    if a.ndim == 2: return shrink(a[..., None].repeat(3, -1), m)[..., 0]
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((m, m), Image.LANCZOS), np.float32) / 255


def layer(name, seed, scale=1.0, warpamp=45):
    """Sample a tiling base at two scales (noise-masked) through a domain warp so no tile repeat shows.
    scale = photo tiles across the board: a 2 m photo should read as tabletop grit, not giant leaves (M8 QC),
    so boards tile each base 3-7 times, prefiltered (Lanczos) to avoid aliasing."""
    full = load(name)
    out = []
    for i, s in enumerate((scale, scale * 1.37)):
        m = max(64, int(round(N / s)))
        diff, nor, rough = (shrink(a, m) for a in full) if m < N else full
        rng = np.random.default_rng(seed + i)
        oy, ox = rng.uniform(0, m, 2)
        wx = fbm(seed + 20 + i, 260, 2.0) * warpamp; wy = fbm(seed + 30 + i, 260, 2.0) * warpamp
        c = [((YY + wy) * (s * m / N) + oy) % m, ((XX + wx) * (s * m / N) + ox) % m]
        smp = lambda a: ndi.map_coordinates(a, c, order=1, mode='grid-wrap')
        out.append((np.stack([smp(diff[..., k]) for k in range(3)], -1),
                    np.stack([smp(nor[..., k]) for k in range(2)], -1) - 0.5, smp(rough)))
    m = blobs(seed + 50, 380, 0.0, 0.6)
    D = out[0][0] * (1 - m[..., None]) + out[1][0] * m[..., None]
    Nn = out[0][1] * (1 - m[..., None]) + out[1][1] * m[..., None]
    R = out[0][2] * (1 - m) + out[1][2] * m
    lum = D.mean(-1); low = gblur(lum, 120)
    D = D * (lum.mean() / (low + 1e-3))[..., None] ** 0.6   # flatten big colour blotches of the photo
    return np.clip(D, 0, 1), Nn, R


def soften(D, k):
    """Pull a layer's local contrast toward its own mean by k (0 = unchanged), so a tiled photo reads as texture, not spots."""
    m = D.mean((0, 1), keepdims=True); return m + (D - m) * (1 - k)


def tint(D, mul, sat=1.0, gain=1.0):
    g = D.mean(-1, keepdims=True); D = g + (D - g) * sat
    return np.clip(D * np.array(mul, np.float32) * gain, 0, 1)


def mix(a, b, m):
    if a.ndim == 3 and m.ndim == 2: m = m[..., None]
    return a * (1 - m) + b * m


def col(r, g, b): return np.array([r, g, b], np.float32)


def ramp(t, stops):
    t = np.clip(t, 0, 1); xs = [s[0] for s in stops]
    return np.stack([np.interp(t, xs, [s[1][c] for s in stops]) for c in range(3)], -1).astype(np.float32) / 255


def voronoi_edges(seed, n, warp=0.0, wper=150):
    pts = np.random.default_rng(seed).uniform(0, N, (n, 2))
    qx, qy = XX, YY
    if warp: qx = XX + fbm(seed + 1, wper, 2.0) * warp; qy = YY + fbm(seed + 2, wper, 2.0) * warp
    d, _ = cKDTree(pts).query(np.stack([qx.ravel(), qy.ravel()], 1), k=2, workers=-1)
    return (d[:, 1] - d[:, 0]).reshape(N, N).astype(np.float32)


def track(seed, y0, amp, n_wig=1.0, tilt=0.0):
    """Perpendicular distance (px) to a wandering line crossing the board left to right."""
    cy = y0 + amp * np.sin(XX / N * 2 * np.pi * n_wig + seed) + 90 * fbm(seed, 500, 2.2) + tilt * (XX - N / 2)
    dy = np.gradient(cy, axis=1)
    return (YY - cy) / np.sqrt(1 + dy ** 2)


def save(a, path, limit=880, gray=False):
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    if gray: im = im.convert('L')
    for q in (92, 88, 84, 80, 76, 72, 68, 62, 56, 50, 44):
        b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, subsampling=0 if q > 85 else 2)
        if b.tell() <= limit * 1000: break
    open(path, 'wb').write(b.getvalue()); print(path, b.tell() // 1000, 'KB q', q, flush=True)


def finish(alb, Nn, rough, h, strength, name, vig=0.10, nblur=1.0):
    r = np.hypot(XX / N - .5, YY / N - .5) * 2
    alb = alb * (1 - vig * ss(0.55, 1.35, r))[..., None]
    # height gradient scaled so its 95th-percentile tilt is about strength/120 (M8 QC: the raw gradient * strength
    # laid the normals almost flat, nz ~0.2, which drew the mats as dark camouflage blotches)
    gx = np.gradient(h, axis=1); gy = np.gradient(h, axis=0)
    k = (strength / 120) / (np.percentile(np.hypot(gx, gy), 95) + 1e-6)
    nx = 1.4 * Nn[..., 0] - gx * k
    ny = 1.4 * Nn[..., 1] + gy * k   # image y runs down, OpenGL +Y up
    nx = gblur(nx, nblur); ny = gblur(ny, nblur)
    nz = np.sqrt(np.clip(1 - nx ** 2 - ny ** 2, 0.05, 1))
    n3 = np.stack([nx, ny, nz], -1); n3 /= np.linalg.norm(n3, axis=-1, keepdims=True)
    d = os.path.join(OUT, name); os.makedirs(d, exist_ok=True)
    save(alb, os.path.join(d, 'albedo.jpg')); save(n3 * 0.5 + 0.5, os.path.join(d, 'normal.jpg'), 900)
    save(np.clip(rough, 0, 1), os.path.join(d, 'rough.jpg'), 800, gray=True)
    return alb


def speckle(seed, p, blur):
    return gblur((np.random.default_rng(seed).random((N, N)) > 1 - p).astype(np.float32), blur)


def streaks(seed, sx, sy):
    return norm(ndi.gaussian_filter(np.random.default_rng(seed).standard_normal((N, N)).astype(np.float32), (sy, sx)))


# ---------------------------------------------------------------- boards
def bog():
    s = 100
    A = layer('brown_mud', s, 5.0); B = layer('brown_mud_leaves_01', s + 100, 4.5)
    leaf = blobs(s + 3, 320, 0.8, 0.7)
    D = mix(tint(soften(A[0], 0.55), (0.7, 0.74, 0.64), 0.8, 1.05), tint(soften(B[0], 0.35), (0.62, 0.58, 0.45), 0.55, 0.95), leaf)
    Nn = mix(A[1], B[1], leaf[..., None]); R = mix(A[2], B[2], leaf) * 0.95
    h = gblur(fbm(s + 5, 90, 2.0), 3) * 0.5
    moss = blobs(s + 7, 300, 0.5, 0.9) * (1 - leaf * 0.5); mt = fbm(s + 8, 18, 1.2)
    mc = np.stack([0.22 + 0.04 * mt, 0.32 + 0.05 * mt, 0.13 + 0.03 * mt], -1)
    D = mix(D, mc * (0.8 + 0.5 * D.mean(-1, keepdims=True)), moss * 0.42)
    R = mix(R, np.full_like(R, 0.9), moss)
    low = norm(gblur(fbm(s + 9, 230, 2.2), 6)) + 0.15 * fbm(s + 10, 60, 1.6)
    wet = ss(1.0, 1.25, norm(fbm(s + 9, 700, 3.0)) + 0.12 * fbm(s + 10, 60, 1.6))
    sheen = 0.5 + 0.5 * fbm(s + 11, 120, 2.0)
    water = np.stack([0.15 + 0.08 * sheen, 0.21 + 0.08 * sheen, 0.19 + 0.07 * sheen], -1)
    D = mix(D, water, wet * 0.93); R = mix(R, np.full_like(R, 0.34), wet * 0.95)  # satin, not mirror: low roughness glittered under the normal map
    Nn = Nn * (1 - wet[..., None] * 0.95)
    h = h * (1 - wet) - wet * 0.9 + moss * 0.15 * (1 - wet)   # still water is flat
    reed = ss(2.2, 2.9, streaks(s, 14, 1.0)) * (1 - wet) * blobs(s + 12, 110, 0.55, 0.3)
    D = mix(D, col(0.40, 0.38, 0.23), reed * 0.55)
    return finish(D, Nn, R, h, 55, "bog", 0.14)


def ruins():
    s = 200
    G = layer('leafy_grass', s, 6.0); F = layer('cobblestone_floor_08', s + 100, 2.2); M = layer('mossy_cobblestone', s + 200, 2.2)
    grass = tint(G[0], (0.62, 0.78, 0.55), 0.9, 0.7)
    gv = blobs(s + 2, 260, 0.2, 0.8)
    grass = mix(grass, tint(G[0], (0.78, 0.8, 0.5), 0.8, 0.78), gv * 0.55)
    reg = blobs(s + 3, 260, 0.8, 0.22)
    edge = ss(0.0, 0.5, reg) * (1 - ss(0.5, 1.0, reg))
    stone = mix(tint(F[0], (0.78, 0.76, 0.9), 0.6, 0.72), tint(M[0], (0.75, 0.85, 0.75), 0.9, 0.7), blobs(s + 4, 120, 0.1, 0.5) * 0.6)
    D = mix(grass, stone, reg)
    Nn = mix(G[1], F[1], reg[..., None]); R = mix(G[2], F[2], reg) * 0.95
    h = gblur(fbm(s + 6, 70, 2.0), 2) * 0.3 + reg * 0.5
    D = mix(D, col(0.28, 0.36, 0.17), edge * 0.35)
    e1 = voronoi_edges(s + 20, 260, 40, 140)
    crack = np.exp(-(np.clip(e1 - 1, 0, None) / 2.4) ** 2) * ss(0.25, 0.7, reg) * blobs(s + 21, 200, -0.1, 0.5)
    e2 = voronoi_edges(s + 30, 24, 120, 300)
    fiss = np.exp(-(np.clip(e2 - 1, 0, None) / 4.0) ** 2) * ss(0.25, 0.7, reg) * blobs(s + 31, 260, 0.2, 0.4)
    glow = np.clip(crack * 0.8 + fiss * 1.2, 0, 1); flick = 0.65 + 0.35 * ss(-1, 1, fbm(s + 32, 40, 1.5))
    gl = ramp(glow * flick, [(0, (0, 0, 0)), (0.25, (70, 40, 140)), (0.6, (150, 120, 255)), (1.0, (225, 235, 255))])
    halo = gblur(glow, 7) * 0.5
    D = np.clip(D * (1 - np.clip(glow * 0.85, 0, 1))[..., None] + gl * 1.15 + col(0.25, 0.2, 0.5) * halo[..., None] * 0.35, 0, 1)
    R = R * (1 - glow * 0.5)
    h = h - crack * 0.7 - fiss * 0.9
    return finish(D, Nn, R, h, 50, 'ruins', 0.14)


def village():
    s = 300
    G = layer('grass_path_3', s, 5.0); L = layer('leafy_grass', s + 100, 6.0); T = layer('muddy_tracks', s + 200, 3.5)
    patch = blobs(s + 3, 200, 0.1, 0.5)
    meadow = mix(tint(G[0], (0.78, 0.9, 0.72), 1.0, 0.85), tint(L[0], (0.8, 0.9, 0.78), 0.9, 0.8), patch * 0.3)
    meadow = mix(meadow, col(0.72, 0.78, 0.76), blobs(s + 4, 120, 0.55, 0.3) * 0.05)
    d = track(s + 5, 980, 230, 1.0, 0.05); ad = np.abs(d)
    pack = 1 - ss(70, 135, ad + 25 * fbm(s + 6, 40, 1.5))
    rut = np.exp(-((ad - 58) / 17) ** 2) * pack
    mid = np.exp(-(d / 30) ** 2) * pack
    D = mix(meadow, tint(T[0], (1.0, 0.82, 0.62), 0.9, 1.1), pack * 0.95)
    D = mix(D, tint(L[0], (0.65, 0.78, 0.5), 0.9, 0.75), mid * 0.5)
    D = D * (1 - rut * 0.38)[..., None]
    puddle = rut * ss(0.4, 1.0, fbm(s + 7, 45, 1.8)) * 0.9
    D = mix(D, col(0.22, 0.2, 0.18), puddle * 0.85)
    Nn = mix(G[1], T[1], pack[..., None]); R = mix(G[2], T[2] * 0.9, pack); R = mix(R, np.full_like(R, 0.12), puddle)
    h = gblur(fbm(s + 8, 90, 2.0), 2) * 0.3 - rut * 0.9 + mid * 0.2 - pack * 0.1
    pe = ss(0.04, 0.12, speckle(s, 0.0015, 2.2)) * (0.3 + 0.7 * pack)
    D = mix(D, col(0.55, 0.52, 0.47), pe * 0.8); h = h + pe * 0.5
    nd = ss(2.4, 3.0, streaks(s + 1, 6, 0.8)) * blobs(s + 9, 150, 0.4, 0.3) * (1 - pack)
    D = mix(D, col(0.45, 0.33, 0.18), nd * 0.6)
    return finish(D, Nn, R, h, 55, 'village', 0.14)


def wasteland():
    s = 400
    A = layer('burned_ground_01', s, 4.5); B = layer('mud_cracked_dry_03', s + 100, 2.6)
    crust = blobs(s + 3, 260, 0.1, 0.45)
    D = mix(tint(A[0], (0.62, 0.6, 0.6), 0.25, 0.65), tint(B[0], (0.45, 0.43, 0.43), 0.0, 0.75), crust)
    Nn = mix(A[1], B[1], crust[..., None]); R = mix(A[2], B[2], crust) * 0.98
    h = gblur(fbm(s + 4, 100, 2.0), 3) * 0.5
    e1 = voronoi_edges(s + 5, 70, 90, 220); e2 = voronoi_edges(s + 6, 300, 30, 100)
    big = np.exp(-(np.clip(e1 - 1, 0, None) / 6.0) ** 2)
    thin = np.exp(-(np.clip(e2 - 1, 0, None) / 2.0) ** 2) * blobs(s + 7, 180, 0.0, 0.5)
    zone = blobs(s + 8, 300, -0.15, 0.5)
    hot = np.clip((big * 0.9 + thin * 0.45) * (0.08 + 0.92 * zone), 0, 1)
    ember = np.clip(hot * (0.45 + 0.55 * ss(-1, 1.2, fbm(s + 9, 30, 1.4))) * 1.05, 0, 1)
    gl = ramp(ember, [(0, (0, 0, 0)), (0.2, (95, 18, 6)), (0.5, (220, 70, 14)), (0.8, (255, 150, 40)), (1, (255, 215, 120))])
    halo = ramp(np.clip(gblur(hot * zone, 10) * 2.2, 0, 1), [(0, (0, 0, 0)), (1, (120, 36, 8))])
    D = np.clip(D * (1 - ember * 0.9)[..., None] + gl * 0.85 + halo * 0.3, 0, 1)
    sp = ss(0.05, 0.2, speckle(s, 0.0025, 1.6)); D = mix(D, col(0.7, 0.28, 0.1), sp * zone * 0.7)
    R = np.clip(R * (1 - ember * 0.35) + 0.05, 0, 1)
    h = h - big * 1.0 - thin * 0.6
    return finish(D, Nn, R, h, 60, "wasteland", 0.18, 2.0)


def outpost():
    s = 500
    S = layer('snow_02', s, 3.5); S2 = layer('snow_02', s + 100, 2.8); M = layer('brown_mud', s + 200, 5.0); L = layer('brown_mud_leaves_01', s + 300, 4.5)
    snow = mix(tint(S[0], (0.96, 0.98, 1.06), 0.6, 1.0), tint(S2[0], (0.9, 0.94, 1.02), 0.5, 0.95), blobs(s + 3, 220, 0.0, 0.5))
    mud = mix(tint(M[0], (0.78, 0.62, 0.48), 1.0, 0.8), tint(L[0], (0.7, 0.55, 0.4), 0.8, 0.7), blobs(s + 4, 80, 0.3, 0.4))
    tramp = blobs(s + 5, 260, 0.1, 0.5)
    earth = ss(0.2, 0.55, fbm(s + 6, 130, 2.0) * 0.6 + tramp - 0.1)
    d1 = track(s + 7, 700, 260, 0.9, -0.08); d2 = track(s + 8, 1350, 200, 1.1, 0.06)
    ruts = np.zeros((N, N), np.float32); band = np.zeros((N, N), np.float32)
    for d in (d1, d2):
        for off in (-55, 55): ruts = np.maximum(ruts, np.exp(-((d - off) / 22) ** 2))
        band = np.maximum(band, 1 - ss(70, 160, np.abs(d) + 30 * fbm(s + 9, 50, 1.5)))
    ruts *= (0.55 + 0.45 * ss(-0.8, 0.6, fbm(s + 10, 120, 1.8)))
    slush = np.clip(band * 0.55 + tramp * 0.35, 0, 1)
    D = mix(snow, snow * col(0.78, 0.8, 0.84), slush)
    mudm = np.clip(ruts * 0.95 + earth * 0.6 * ss(0.15, 0.6, band + tramp * 0.6), 0, 1)
    D = mix(D, mud, mudm)
    bp = ss(0.05, 0.2, speckle(s, 0.0008, 3.0)) * (0.3 + band)
    D = mix(D, col(0.25, 0.2, 0.16), bp * 0.6)
    me = np.clip(ruts + earth * 0.5, 0, 1)
    Nn = mix(S[1], M[1], me[..., None]); R = mix(S[2], M[2] * 0.85, me); R = mix(R, np.full_like(R, 0.2), ruts * 0.4)
    h = gblur(fbm(s + 11, 100, 2.0), 3) * 0.4 - ruts * 0.9 - bp * 0.3 - slush * 0.1
    return finish(D, Nn, R, h, 45, 'outpost', 0.10)


def table():
    d, n, r = load('dark_wooden_planks')
    rs = lambda a: np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS), np.float32) / 255
    o = os.path.join(OUT, 'table'); os.makedirs(o, exist_ok=True)
    save(np.clip(rs(d) * col(0.62, 0.52, 0.45) * 1.05, 0, 1), os.path.join(o, 'albedo.jpg'))
    save(rs(n), os.path.join(o, 'normal.jpg'))
    save(np.clip(rs(np.stack([r] * 3, -1))[..., 0] * 0.9, 0, 1), os.path.join(o, 'rough.jpg'), gray=True)


BOARDS = dict(bog=bog, ruins=ruins, village=village, wasteland=wasteland, outpost=outpost, table=table)
if __name__ == '__main__':
    for b in (sys.argv[1:] or BOARDS):
        print('==', b, flush=True); BOARDS[b]()
