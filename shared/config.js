// Sunucu ve istemcinin ortak kullandığı oyun sabitleri.
export const WORLD = {
  size: 1600,
  half: 800,
  islandRadius: 610,
  waterLevel: 0,
  maxDepth: 24,
};

export const NET = {
  inputHz: 20,
  snapshotHz: 12,
  botHz: 10,
  zoneHz: 10,
};

export const MATCH = {
  duration: 15 * 60,
  respawnTime: 5,
  restartDelay: 20,
  killScore: 5,
  captureScore: 25,
  holdScorePerSecond: 1,
  hqCaptureMinZones: 3,
  scoreLimit: 1200,
};

export const PLAYER = {
  radius: 0.42,
  height: 1.8,
  eyeHeight: 1.66,
  walkSpeed: 6.3,
  sprintSpeed: 9.3,
  swimSpeed: 3.4,
  accelGround: 46,
  accelAir: 9,
  friction: 11,
  jumpSpeed: 7.4,
  gravity: 24,
  maxHealth: 100,
  spawnProtect: 2.5,
  stepHeight: 0.55,
  slopeLimit: 0.62,
};

export const TEAMS = {
  red: {
    id: 'red',
    name: 'Kızıllar',
    short: 'KIRMIZI',
    color: 0xd94141,
    css: '#e2564f',
    dark: '#7d1f1c',
    light: '#ff8a7a',
  },
  blue: {
    id: 'blue',
    name: 'Maviler',
    short: 'MAVİ',
    color: 0x3f7fdd,
    css: '#4f8fe8',
    dark: '#183f7d',
    light: '#8fc0ff',
  },
};

export const VEHICLES = {
  scooter: {
    id: 'scooter',
    name: 'Taktik Scooter',
    seats: 1,
    maxSpeed: 25,
    boostSpeed: 32,
    reverseSpeed: 6,
    accel: 19,
    brake: 28,
    turnRate: 2.35,
    radius: 0.85,
    height: 1.15,
    enterRadius: 4.2,
    enginePitch: 90,
  },
  boat: {
    id: 'boat',
    name: 'Hücum Botu',
    seats: 3,
    maxSpeed: 23,
    reverseSpeed: 7,
    accel: 13,
    brake: 10,
    turnRate: 1.45,
    radius: 2.4,
    height: 1.45,
    enterRadius: 6.5,
    enginePitch: 55,
  },
};

export const ZONE_TYPES = {
  hq: { label: 'Komuta Üssü', radius: 40, captureRadius: 34 },
  town: { label: 'Yerleşim', radius: 36, captureRadius: 30 },
  farm: { label: 'Çiftlik', radius: 36, captureRadius: 30 },
  harbor: { label: 'Liman', radius: 38, captureRadius: 32 },
  hill: { label: 'Tepesi', radius: 38, captureRadius: 32 },
  lighthouse: { label: 'Fener', radius: 32, captureRadius: 27 },
};

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
