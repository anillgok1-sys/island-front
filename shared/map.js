// Ada arazisi, bölgeler, engeller ve araç doğma noktaları.
// Deterministik üretim sayesinde sunucu ve tarayıcı aynı dünyayı görür.
import { WORLD, ZONE_TYPES, clamp, smoothstep, dist2d } from './config.js';

function hash2(ix, iy) {
  let h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 100000) / 100000;
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(x * freq, y * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return v / total;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kıyı çizgisi hafif düzensiz olsun diye yarıçapa gürültü eklenir.
function coastlineRadius(x, z) {
  return WORLD.islandRadius + (fbm(x * 0.0017 + 31.7, z * 0.0017 - 12.3, 4) - 0.5) * 150;
}

export function naturalHeight(x, z) {
  const d = Math.sqrt(x * x + z * z);
  const R = coastlineRadius(x, z);
  const t = d / R;
  const hills = (fbm(x * 0.0034 + 7.1, z * 0.0034 - 3.4, 4) - 0.5) * 25;
  const detail = (fbm(x * 0.012 - 2.2, z * 0.012 + 9.9, 3) - 0.5) * 3.4;
  if (t >= 1) {
    const deep = smoothstep(1, 1.45, t);
    return -2.2 - deep * 20 + hills * 0.08 + detail * 0.2;
  }
  const land = smoothstep(1.0, 0.86, t);
  const mountain = Math.pow(Math.max(0, 1 - t), 2.15) * 42;
  return -2.2 + land * (10.5 + hills + detail + mountain);
}

const ZONE_RAW = [
  { id: 'red_hq', name: 'Kızıl Komuta', type: 'hq', team: 'red', x: -355, z: 300, angle: 0.6 },
  { id: 'blue_hq', name: 'Mavi Komuta', type: 'hq', team: 'blue', x: 355, z: -300, angle: 0.6 },
  { id: 'harbor', name: 'Güney Limanı', type: 'harbor', team: null, x: 30, z: 500, angle: 0 },
  { id: 'farm', name: 'Eski Çiftlik', type: 'farm', team: null, x: -190, z: -40, angle: 0.5 },
  { id: 'village', name: 'Balıkçı Köyü', type: 'town', team: null, x: 255, z: 185, angle: 0.8 },
  { id: 'hill', name: 'Gözetleme Tepesi', type: 'hill', team: null, x: 40, z: -335, angle: 0 },
  { id: 'lighthouse', name: 'Kuzey Feneri', type: 'lighthouse', team: null, x: -455, z: -235, angle: 1.2 },
];

export const ZONES = ZONE_RAW.map((z) => {
  const def = ZONE_TYPES[z.type];
  let y = naturalHeight(z.x, z.z);
  if (z.type === 'harbor') y = clamp(y, 2.6, 3.6);
  if (z.type === 'lighthouse') y = clamp(y, 4, 8);
  return {
    ...z,
    y,
    radius: def.radius,
    captureRadius: def.captureRadius,
    label: def.label,
  };
});

export function terrainHeightAt(x, z) {
  let h = naturalHeight(x, z);
  for (let i = 0; i < ZONES.length; i++) {
    const zone = ZONES[i];
    const d = dist2d(x, z, zone.x, zone.z);
    const outer = zone.radius * 1.85;
    if (d < outer) {
      const w = 1 - smoothstep(zone.radius * 0.55, outer, d);
      h += (zone.y - h) * w;
    }
  }
  return h;
}

export function heightAt(x, z) {
  let h = terrainHeightAt(x, z);
  // Liman iskelesi: denize uzanan, yürünebilir ahşap platform (9m genişlik).
  if (Math.abs(x - 30) <= 4.5 && z > 516 && z < 616) {
    const ramp = z < 546 ? 3.6 - ((z - 516) / 30) * 1.5 : 2.1;
    h = Math.max(h, ramp);
  }
  return h;
}

export function slopeAt(x, z) {
  const e = 1.6;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.sqrt(hx * hx + hz * hz) / (2 * e);
}

export function terrainNormal(x, z) {
  const e = 1.2;
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx / (2 * e);
  const nz = -hz / (2 * e);
  const len = Math.sqrt(nx * nx + 1 + nz * nz);
  return { x: nx / len, y: 1 / len, z: nz / len };
}

export function isWater(x, z, margin = 0) {
  return heightAt(x, z) < WORLD.waterLevel - margin;
}

export function zoneAt(x, z, margin = 0) {
  for (const zone of ZONES) {
    if (dist2d(x, z, zone.x, zone.z) <= zone.captureRadius + margin) return zone;
  }
  return null;
}

function nearZone(x, z, extra = 8) {
  for (const zone of ZONES) {
    if (dist2d(x, z, zone.x, zone.z) < zone.radius + extra) return true;
  }
  return false;
}

function nearSpawnPad(x, z, extra = 3) {
  for (const zone of ZONES) {
    if (dist2d(x, z, zone.x, zone.z) < 12 + extra) return true;
  }
  return false;
}

// --- Engeller -------------------------------------------------------------

export const TREES = [];
export const PALMS = [];
export const ROCKS = [];
export const BUSHES = [];
export const GRASS = [];
export const OBSTACLES = [];

(function generateProps() {
  const rand = mulberry32(20260214);
  const pushObstacle = (o) => {
    OBSTACLES.push(o);
  };

  // Ağaçlar
  let guard = 0;
  while (TREES.length < 300 && guard++ < 12000) {
    const x = (rand() * 2 - 1) * 620;
    const z = (rand() * 2 - 1) * 620;
    const h = heightAt(x, z);
    if (h < 1.4 || h > 52) continue;
    if (slopeAt(x, z) > 0.55) continue;
    if (nearZone(x, z, 9)) continue;
    if (nearSpawnPad(x, z, 4)) continue;
    const scale = 0.85 + rand() * 0.8;
    const pine = rand() < 0.62;
    const tree = {
      id: TREES.length,
      type: 'tree',
      variant: pine ? 0 : 1,
      x,
      y: h,
      z,
      scale,
      rot: rand() * Math.PI * 2,
      r: 0.66 * scale,
      h: (pine ? 9.4 : 7.8) * scale,
    };
    TREES.push(tree);
    pushObstacle({ ...tree, rayR: tree.r, rayH: tree.h });
  }

  // Büyük taşlar ve kaya kütleleri (deterministik rx/ry/rz + tam çarpışma silindiri)
  const rockShapeRand = mulberry32(20260519);
  guard = 0;
  while (ROCKS.length < 120 && guard++ < 6000) {
    const x = (rand() * 2 - 1) * 620;
    const z = (rand() * 2 - 1) * 620;
    const h = heightAt(x, z);
    if (h < 0.8 || h > 56) continue;
    if (slopeAt(x, z) > 0.7) continue;
    if (nearZone(x, z, 7)) continue;
    if (nearSpawnPad(x, z, 3)) continue;
    const scale = 1 + rand() * 2.6;
    const variant = Math.floor(rand() * 4);
    const rot = rand() * Math.PI * 2;
    const rx = scale * (0.98 + rockShapeRand() * 0.24);
    const ry = scale * (0.72 + rockShapeRand() * 0.28);
    const rz = scale * (0.98 + rockShapeRand() * 0.24);
    const tiltX = (rockShapeRand() - 0.5) * 0.22;
    const tiltZ = (rockShapeRand() - 0.5) * 0.22;
    const colRadius = Math.max(rx, rz) * 1.03;
    const colHeight = ry * 1.45;
    const rock = {
      id: ROCKS.length,
      type: 'rock',
      variant,
      x,
      y: h,
      z,
      scale,
      rot,
      rx,
      ry,
      rz,
      tiltX,
      tiltZ,
      r: colRadius,
      h: colHeight,
    };
    ROCKS.push(rock);
    pushObstacle({ ...rock, rayR: colRadius * 0.96, rayH: colHeight });
  }

  // Kıyı palmiyeleri (deterministik konum + gövde çarpışması)
  const palmRand = mulberry32(20260911);
  for (let attempt = 0; attempt < 7000 && PALMS.length < 36; attempt++) {
    const a = palmRand() * Math.PI * 2;
    const r = 465 + palmRand() * 195;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 0.9 || h > 4.6) continue;
    if (slopeAt(x, z) > 0.38) continue;
    if (nearZone(x, z, 14)) continue;
    if (TREES.some((t) => dist2d(x, z, t.x, t.z) < 7.5)) continue;
    if (ROCKS.some((rk) => dist2d(x, z, rk.x, rk.z) < rk.r + 2.5)) continue;
    if (PALMS.some((p) => dist2d(x, z, p.x, p.z) < 7)) continue;
    const scale = 0.88 + palmRand() * 0.42;
    const rot = palmRand() * Math.PI * 2;
    const lean = (palmRand() - 0.5) * 0.16;
    const trunkH = (7.2 + palmRand() * 3.4) * scale;
    const palm = {
      id: 'palm_' + PALMS.length,
      type: 'palm',
      x,
      y: h,
      z,
      scale,
      rot,
      lean,
      h: trunkH,
      r: 0.45 * scale,
    };
    PALMS.push(palm);
    pushObstacle({ ...palm, rayR: palm.r, rayH: palm.h });
  }

  // Çalılar (görsel, çarpışmasız)
  guard = 0;
  while (BUSHES.length < 650 && guard++ < 9000) {
    const x = (rand() * 2 - 1) * 610;
    const z = (rand() * 2 - 1) * 610;
    const h = heightAt(x, z);
    if (h < 1.2 || h > 50) continue;
    if (nearZone(x, z, 4)) continue;
    BUSHES.push({ x, y: h, z, scale: 0.5 + rand() * 0.9, rot: rand() * 6.28, variant: Math.floor(rand() * 3) });
  }

  // Çim tutamları
  guard = 0;
  while (GRASS.length < 1600 && guard++ < 12000) {
    const x = (rand() * 2 - 1) * 600;
    const z = (rand() * 2 - 1) * 600;
    const h = heightAt(x, z);
    if (h < 1.6 || h > 50) continue;
    GRASS.push({ x, y: h, z, scale: 0.6 + rand() * 1.1, rot: rand() * 6.28 });
  }
})();

// --- Yapılar (bölgelerdeki siper ve binalar) ------------------------------

export const STRUCTURES = [];

(function generateStructures() {
  let sid = 0;
  const pushCollider = (id, variant, x, y, z, r, h, rayR = r * 0.94, yOffset = 0) => {
    OBSTACLES.push({
      id,
      type: 'structure',
      variant,
      x,
      y: y + yOffset,
      z,
      r,
      h,
      rayR,
      rayH: h,
    });
  };

  const add = (zoneId, type, dx, dz, rot, r, h, scale = 1) => {
    const zone = ZONES.find((z) => z.id === zoneId);
    const x = zone.x + dx;
    const z = zone.z + dz;
    const y = heightAt(x, z);
    const structure = {
      id: 's' + sid++,
      zoneId,
      type,
      x,
      y,
      z,
      rot,
      r,
      h,
      scale,
    };
    STRUCTURES.push(structure);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    if (type === 'tower') {
      // Açık 4 ayaklı gözetleme kulesi: ayak direkleri çarpışmalı, orta kısım açık
      let legIdx = 0;
      for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        pushCollider(`${structure.id}_leg${legIdx++}`, type, wx, y, wz, 0.42, 7.2, 0.35);
      }
      // Üst platform (y=7..9.5 arası mermi engeli)
      pushCollider(`${structure.id}_top`, type, x, y, z, 0.1, 2.4, 2.1, 7.0);
    } else if (type === 'sandbag') {
      // Yarım ay kum torbası siperi
      for (const t of [-1.2, 0, 1.2]) {
        const lx = Math.cos(t * 0.75) * 2.1;
        const lz = Math.sin(t * 0.75) * 2.1;
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        pushCollider(`${structure.id}_sb${t}`, type, wx, y, wz, 0.72, 0.95, 0.72);
      }
    } else if (type === 'hay') {
      pushCollider(structure.id, type, x, y, z, 1.15, 1.35, 1.1);
    } else if (type === 'barn') {
      // 9x7 dikdörtgen ahır için çift silindir
      for (const [idx, ox] of [-1.6, 1.6].entries()) {
        const wx = x + ox * cos;
        const wz = z - ox * sin;
        pushCollider(`${structure.id}_b${idx}`, type, wx, y, wz, 3.6, h, 3.5);
      }
    } else if (type === 'house') {
      // 7x5.4 ev için çift silindir
      for (const [idx, ox] of [-1.1, 1.1].entries()) {
        const wx = x + ox * cos;
        const wz = z - ox * sin;
        pushCollider(`${structure.id}_h${idx}`, type, wx, y, wz, 2.85, h, 2.75);
      }
    } else if (type === 'bunker') {
      // Askeri beton korugan
      pushCollider(structure.id, type, x, y, z, r, h, r * 0.95);
    } else if (type === 'hesco') {
      // Askeri HESCO tahkimat duvarı (3 parçalı siper)
      for (const ox of [-2.0, 0, 2.0]) {
        const wx = x + ox * cos;
        const wz = z - ox * sin;
        pushCollider(`${structure.id}_hc${ox}`, type, wx, y, wz, 1.05, h, 1.0);
      }
    } else if (r > 0) {
      pushCollider(structure.id, type, x, y, z, r, h, r * 0.92);
    }
    return structure;
  };

  // Komuta üsleri (Tahkimatlı Askeri Karargahlar)
  add('red_hq', 'bunker', -10, -8, 0.5, 4.4, 4.2, 1);
  add('red_hq', 'tower', 14, 11, 0.4, 2.2, 9, 1);
  add('red_hq', 'tent', -14, 10, 0.3, 3.1, 2.8, 1.1);
  add('red_hq', 'tent', 11, -12, -0.4, 3.1, 2.8, 1.1);
  add('red_hq', 'hesco', 0, -18, 0.1, 1.1, 2.1, 1);
  add('red_hq', 'hesco', 17, -1, 1.4, 1.1, 2.1, 1);
  add('red_hq', 'crate', 3, 15, 0.2, 0.85, 1.2, 1);
  add('red_hq', 'crate', 4.7, 15.6, 0.7, 0.85, 1.2, 1);
  add('red_hq', 'crate', 3.8, 16.7, 0.1, 0.85, 1.2, 1);
  add('red_hq', 'sandbag', -5, -14, 0, 0, 0.9, 1);

  add('blue_hq', 'bunker', 10, 8, -2.6, 4.4, 4.2, 1);
  add('blue_hq', 'tower', -14, -11, 0.4, 2.2, 9, 1);
  add('blue_hq', 'tent', 14, -10, 0.3, 3.1, 2.8, 1.1);
  add('blue_hq', 'tent', -11, 12, -0.4, 3.1, 2.8, 1.1);
  add('blue_hq', 'hesco', 0, 18, 0.1, 1.1, 2.1, 1);
  add('blue_hq', 'hesco', -17, 1, 1.4, 1.1, 2.1, 1);
  add('blue_hq', 'crate', -3, -15, 0.2, 0.85, 1.2, 1);
  add('blue_hq', 'crate', -4.7, -15.6, 0.7, 0.85, 1.2, 1);
  add('blue_hq', 'crate', -3.8, -16.7, 0.1, 0.85, 1.2, 1);
  add('blue_hq', 'sandbag', 5, 14, Math.PI, 0, 0.9, 1);

  // Balıkçı köyü (Tahkimatlı Yerleşim Üssü)
  add('village', 'house', -14, -7, 0.25, 4.2, 4.2, 1);
  add('village', 'house', 13, 5, -0.5, 4.2, 4.2, 1);
  add('village', 'house', -2, 17, 0.1, 3.8, 4, 0.9);
  add('village', 'hut', 20, -13, 0.7, 2.6, 3, 1);
  add('village', 'hesco', -16, 11, 0.8, 1.1, 2.1, 1);
  add('village', 'sandbag', 7, -13, -0.4, 0, 0.9, 1);
  add('village', 'crate', 5, 10, 0.3, 0.85, 1.2, 1);
  add('village', 'crate', 6.4, 10.8, 0.9, 0.85, 1.2, 1);

  // Çiftlik (İkmal & Lojistik Üssü)
  add('farm', 'barn', 11, -8, -0.2, 5.2, 5.6, 1);
  add('farm', 'silo', -13, 10, 0, 2.7, 10, 1);
  add('farm', 'bunker', -12, -11, 0.6, 3.9, 3.8, 0.9);
  add('farm', 'hesco', 2, 16, 0.1, 1.1, 2.1, 1);
  add('farm', 'sandbag', -2, -16, 0.2, 0, 0.9, 1);
  add('farm', 'crate', -4, -12, 0.4, 0.85, 1.2, 1);
  add('farm', 'crate', -5.5, -12.4, 0.2, 0.85, 1.2, 1);
  add('farm', 'hay', 16, 8, 0.5, 0, 0, 1);

  // Gözetleme tepesi (Radar & Hava Savunma Üssü)
  add('hill', 'bunker', -11, 9, -0.4, 4.2, 4.0, 1);
  add('hill', 'tower', 9, 8, 0.2, 2.2, 9.5, 1);
  add('hill', 'radio', -9, -8, 0.3, 0.55, 7, 1);
  add('hill', 'hesco', 0, -16, 0, 1.1, 2.1, 1);
  add('hill', 'hesco', 16, -2, 1.5, 1.1, 2.1, 1);
  add('hill', 'crate', -3, 10, 0.1, 0.85, 1.2, 1);
  add('hill', 'sandbag', 11, -7, 0, 0, 0.9, 1);

  // Fener (Kuzey Deniz Gözetleme Üssü)
  add('lighthouse', 'lighthouse', 9, -3, 0, 3.2, 16, 1);
  add('lighthouse', 'bunker', -10, -8, 0.7, 3.9, 3.8, 0.9);
  add('lighthouse', 'hut', -8, 9, 0.5, 2.6, 3, 1);
  add('lighthouse', 'hesco', 2, 15, -0.2, 1.1, 2.1, 1);
  add('lighthouse', 'sandbag', -13, 1, 1.2, 0, 0.9, 1);
  add('lighthouse', 'crate', 2, 9, 0.2, 0.85, 1.2, 1);

  // Liman (Güney Deniz & Çıkarma Üssü)
  add('harbor', 'bunker', 12, -8, -0.5, 4.1, 3.9, 0.95);
  add('harbor', 'tower', -14, -10, 0.1, 2.2, 9, 1);
  add('harbor', 'hut', -11, 5, 0.8, 2.8, 3.2, 1);
  add('harbor', 'hesco', 0, -16, 0, 1.1, 2.1, 1);
  add('harbor', 'sandbag', 7, 13, 0.2, 0, 0.9, 1);
  add('harbor', 'crate', 9, 8, 0.2, 0.85, 1.2, 1);
  add('harbor', 'crate', 10.4, 8.7, 0.6, 0.85, 1.2, 1);
  add('harbor', 'crate', 9.7, 9.8, 0.1, 0.85, 1.2, 1);
})();

// --- Uzamsal indeks -------------------------------------------------------

const HASH_CELL = 26;

export function buildSpatialHash(items) {
  const map = new Map();
  for (const item of items) {
    const extent = Math.max(item.r || 0, item.rayR || 0) + 0.5;
    const minCX = Math.floor((item.x - extent) / HASH_CELL);
    const maxCX = Math.floor((item.x + extent) / HASH_CELL);
    const minCZ = Math.floor((item.z - extent) / HASH_CELL);
    const maxCZ = Math.floor((item.z + extent) / HASH_CELL);
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const key = cx + ':' + cz;
        let bucket = map.get(key);
        if (!bucket) {
          bucket = [];
          map.set(key, bucket);
        }
        bucket.push(item);
      }
    }
  }
  return map;
}

export const OBSTACLE_HASH = buildSpatialHash(OBSTACLES);

export function queryObstacles(hash, x, z, radius, out = []) {
  out.length = 0;
  const minX = Math.floor((x - radius) / HASH_CELL);
  const maxX = Math.floor((x + radius) / HASH_CELL);
  const minZ = Math.floor((z - radius) / HASH_CELL);
  const maxZ = Math.floor((z + radius) / HASH_CELL);
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      const bucket = hash.get(cx + ':' + cz);
      if (bucket) {
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          if (!out.includes(item)) out.push(item);
        }
      }
    }
  }
  return out;
}

const _sharedColBuf = [];

export function resolveObstacleCollisions(x, z, actorRadius = 0.45, vel = null) {
  let nx = x;
  let nz = z;
  let hit = false;
  const near = queryObstacles(OBSTACLE_HASH, nx, nz, actorRadius + 6.5, _sharedColBuf);
  for (let pass = 0; pass < 3; pass++) {
    let passHit = false;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (!o || !(o.r >= 0.25)) continue;
      const dx = nx - o.x;
      const dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + actorRadius;
      if (d < min) {
        const ux = d > 0.0001 ? dx / d : 1;
        const uz = d > 0.0001 ? dz / d : 0;
        nx = o.x + ux * min;
        nz = o.z + uz * min;
        passHit = true;
        hit = true;
        if (vel) {
          const vn = vel.x * ux + vel.z * uz;
          if (vn < 0) {
            vel.x -= vn * ux;
            vel.z -= vn * uz;
          }
        }
      }
    }
    if (!passHit) break;
  }
  return { x: nx, z: nz, hit };
}

// --- Spawn noktaları ------------------------------------------------------

export function spawnAround(zone, rand = Math.random) {
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * (zone.captureRadius * 0.75);
    const x = zone.x + Math.cos(a) * r;
    const z = zone.z + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 1.1) continue;
    if (slopeAt(x, z) > 0.5) continue;
    if (isBlocked(x, z, 1.1)) continue;
    return { x, y: h + 0.1, z };
  }
  return { x: zone.x, y: heightAt(zone.x, zone.z) + 0.1, z: zone.z };
}

export function randomIslandSpawn(rand = Math.random) {
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const r = 60 + rand() * 500;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 1.2 || h > 46) continue;
    if (slopeAt(x, z) > 0.45) continue;
    if (isBlocked(x, z, 1.2)) continue;
    return { x, y: h + 0.1, z };
  }
  return spawnAround(ZONES[0], rand);
}

export function isBlocked(x, z, radius = 0.7) {
  const near = queryObstacles(OBSTACLE_HASH, x, z, radius + 6.5);
  for (const o of near) {
    if (o.r >= 0.25 && dist2d(x, z, o.x, o.z) < o.r + radius) return true;
  }
  return false;
}

// --- Işın testleri --------------------------------------------------------

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius, maxDist) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const thc = Math.sqrt(r2 - d2);
  const t = tca - thc;
  if (t < 0 || t > maxDist) return null;
  return t;
}

export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, radius, y0, y1, maxDist) {
  const px = ox - cx;
  const pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxDist) return null;
  const y = oy + dy * t;
  if (y < y0 || y > y1) return null;
  return t;
}

export function terrainRay(ox, oy, oz, dx, dy, dz, maxDist) {
  let prevT = 0;
  let prevAbove = oy - heightAt(ox, oz);
  if (prevAbove < 0) return 0;
  const step = 2.2;
  for (let t = step; t <= maxDist; t += step) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    const h = heightAt(x, z);
    const above = y - h;
    if (above < 0) {
      // İki örnek arasında doğrusal yaklaşım
      const f = prevAbove / (prevAbove - above);
      return prevT + (t - prevT) * f;
    }
    prevT = t;
    prevAbove = above;
    if (y < -25) return t;
  }
  return null;
}

export function rayObstacle(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = null;
  const seen = new Set();
  const step = 8;
  for (let t = 0; t <= maxDist; t += step) {
    const x = ox + dx * t;
    const z = oz + dz * t;
    const near = queryObstacles(OBSTACLE_HASH, x, z, 10);
    for (const o of near) {
      if (seen.has(o.id + ':' + o.type)) continue;
      seen.add(o.id + ':' + o.type);
      const hit = rayCylinder(ox, oy, oz, dx, dy, dz, o.x, o.z, o.rayR, o.y, o.y + o.rayH, maxDist);
      if (hit !== null && (best === null || hit < best)) best = hit;
    }
  }
  return best;
}

export function lineOfSight(ax, ay, az, bx, by, bz, maxDist = 500) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 0.01) return true;
  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;
  const terrain = terrainRay(ax, ay, az, nx, ny, nz, len);
  if (terrain !== null) return false;
  const obstacle = rayObstacle(ax, ay, az, nx, ny, nz, len);
  return obstacle === null;
}

// --- Araç doğma noktaları --------------------------------------------------

function waterPointNearShore(angle, minDepth = 1.2, maxDepth = 4.5) {
  for (let r = 500; r < 760; r += 4) {
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const h = heightAt(x, z);
    const depth = WORLD.waterLevel - h;
    if (depth >= minDepth && depth <= maxDepth) return { x, z };
  }
  return null;
}

export function createVehicleSpawns() {
  const vehicles = [];
  const rand = mulberry32(99173);
  let id = 0;

  // Tekneler: Güney Limanı iskelesinin iki yanında hazır hücum botları + ada kıyıları.
  const harborBoats = [
    { x: 18, z: 585, ry: 0 },
    { x: 42, z: 585, ry: 0 },
  ];
  for (const hb of harborBoats) {
    vehicles.push({
      id: 'v' + id++,
      type: 'boat',
      x: hb.x,
      y: WORLD.waterLevel + 0.28,
      z: hb.z,
      ry: hb.ry,
      rx: 0,
      rz: 0,
      speed: 0,
      driver: null,
      passenger: null,
      passenger2: null,
      home: { x: hb.x, y: WORLD.waterLevel + 0.28, z: hb.z, ry: hb.ry },
    });
  }

  const boatAngles = [0.12, 0.62, 1.1, 1.55, 2.0, 2.45, 2.95, 3.4, 3.85, 4.3, 4.8, 5.35, 5.8];
  for (const baseAngle of boatAngles) {
    for (let tries = 0; tries < 5; tries++) {
      const angle = baseAngle + (rand() - 0.5) * 0.05;
      const p = waterPointNearShore(angle, 1.4, 4.2);
      if (!p) continue;
      vehicles.push({
        id: 'v' + id++,
        type: 'boat',
        x: p.x,
        y: WORLD.waterLevel + 0.28,
        z: p.z,
        ry: Math.atan2(-p.x, -p.z),
        rx: 0,
        rz: 0,
        speed: 0,
        driver: null,
        passenger: null,
        passenger2: null,
        home: { x: p.x, y: WORLD.waterLevel + 0.28, z: p.z, ry: Math.atan2(-p.x, -p.z) },
      });
      break;
    }
  }

  // Scooterlar: bölgelerin yakınında ve adada dağınık.
  for (const zone of ZONES) {
    const count = zone.type === 'hq' ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = 9 + rand() * 14;
      const x = zone.x + Math.cos(a) * r;
      const z = zone.z + Math.sin(a) * r;
      const h = heightAt(x, z);
      if (h < 1.2) continue;
      vehicles.push({
        id: 'v' + id++,
        type: 'scooter',
        x,
        y: h + 0.15,
        z,
        ry: rand() * Math.PI * 2,
        rx: 0,
        rz: 0,
        speed: 0,
        driver: null,
        passenger: null,
        home: { x, y: h + 0.15, z, ry: 0 },
      });
    }
  }
  for (let i = 0; i < 8; i++) {
    const p = randomIslandSpawn(rand);
    vehicles.push({
      id: 'v' + id++,
      type: 'scooter',
      x: p.x,
      y: p.y,
      z: p.z,
      ry: rand() * Math.PI * 2,
      rx: 0,
      rz: 0,
      speed: 0,
      driver: null,
      passenger: null,
      home: { x: p.x, y: p.y, z: p.z, ry: 0 },
    });
  }

  return vehicles;
}

export function seatPosition(vehicle, seat) {
  const forwardX = Math.sin(vehicle.ry);
  const forwardZ = Math.cos(vehicle.ry);
  if (vehicle.type === 'boat') {
    // 3 kişilik hücum botu:
    // seat 0: sürücü (dümen konsolu z≈0.35)
    // seat 1: ön pruva nişancısı (z≈1.55)
    // seat 2: arka kıç nişancısı (z≈-1.25)
    const offset = seat === 0 ? 0.35 : seat === 1 ? 1.55 : -1.25;
    const seatY = seat === 0 ? 0.92 : seat === 1 ? 0.96 : 0.97;
    return {
      x: vehicle.x + forwardX * offset,
      y: vehicle.y + seatY,
      z: vehicle.z + forwardZ * offset,
    };
  }
  // Scooter: sele yüzeyi y≈0.71; kök = kalça hizası.
  return { x: vehicle.x, y: vehicle.y + 0.75, z: vehicle.z };
}
