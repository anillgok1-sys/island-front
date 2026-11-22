// Sunucu tarafı bot yapay zekâsı: bölge ele geçirir, düşman görünce çatışır.
import { dist2d } from '../shared/config.js';
import { ZONES, heightAt, lineOfSight, queryObstacles, OBSTACLE_HASH, resolveObstacleCollisions } from '../shared/map.js';
import { weaponFor } from '../shared/weapons.js';

const BOT_NAMES = [
  'Poyraz', 'Kaptan', 'Sırtlan', 'Çakal', 'Deli', 'Kılıç', 'Şahin', 'Kartal',
  'Bozkurt', 'Tuna', 'Ege', 'Mert', 'Deniz', 'Barut', 'Pusu', 'Kaya',
  'Rüzgar', 'Yıldız', 'Tolga', 'Cem', 'Sarp', 'Volkan', 'Bora', 'Alp',
  'Kuzey', 'Batı', 'Karam', 'Süvari', 'Nişancı', 'Fırtına',
];

const BOT_WEAPONS = ['pistol', 'shotgun', 'sniper', 'lmg'];

export function pickBotName(game) {
  const used = new Set([...game.players.values()].map((p) => p.name));
  const free = BOT_NAMES.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  return 'Asker' + Math.floor(Math.random() * 900 + 100);
}

export function randomBotWeapon() {
  return BOT_WEAPONS[Math.floor(Math.random() * BOT_WEAPONS.length)];
}

export function createBotPlayer(game, team) {
  const id = 'b' + game.nextPlayerNum++;
  const weapon = randomBotWeapon();
  return {
    id,
    name: pickBotName(game),
    team,
    bot: true,
    ws: null,
    weapon,
    hp: 100,
    alive: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    aim: false,
    moving: false,
    sprint: false,
    crouch: false,
    swim: false,
    inVehicle: null,
    seat: null,
    ammo: 0,
    reserve: 0,
    reloadingUntil: 0,
    lastShotAt: 0,
    kills: 0,
    deaths: 0,
    score: 0,
    captures: 0,
    streak: 0,
    spawnProtectUntil: 0,
    respawnAt: 0,
    joinedAt: Date.now(),
    lastInputAt: Date.now(),
    enemyId: null,
    nextThink: 0,
    nextShotAt: 0,
    reactionUntil: 0,
    goalZone: null,
    goal: null,
    strafeDir: 1,
    strafeSwitch: 0,
    burstCount: 0,
    stuckAt: 0,
    lastX: 0,
    lastZ: 0,
    detourUntil: 0,
    detourAngle: 0,
  };
}

function normalize(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function coneDirection(dir, spread) {
  const upX = Math.abs(dir.y) > 0.98 ? 1 : 0;
  const upY = Math.abs(dir.y) > 0.98 ? 0 : 1;
  let rx = dir.y * 0 - dir.z * upY;
  let ry = dir.z * upX - dir.x * 0;
  let rz = dir.x * upY - dir.y * upX;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * dir.z - rz * dir.y;
  const uy = rz * dir.x - rx * dir.z;
  const uz = rx * dir.y - ry * dir.x;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * spread;
  return normalize(
    dir.x + (rx * Math.cos(a) + ux * Math.sin(a)) * r,
    dir.y + (ry * Math.cos(a) + uy * Math.sin(a)) * r,
    dir.z + (rz * Math.cos(a) + uz * Math.sin(a)) * r,
  );
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function chooseObjective(game, bot) {
  const zoneState = new Map(game.zones.map((z) => [z.id, z]));
  const defs = ZONES;

  // Kendi bölgemiz saldırı altındaysa önce onu savun.
  let defend = null;
  let defendScore = Infinity;
  for (const def of defs) {
    const st = zoneState.get(def.id);
    if (!st || st.owner !== bot.team) continue;
    const enemies = st.counts[bot.team === 'red' ? 'blue' : 'red'];
    if (enemies > 0) {
      const d = dist2d(bot.x, bot.z, def.x, def.z);
      if (d < 240 && d < defendScore) {
        defendScore = d;
        defend = def;
      }
    }
  }
  if (defend && Math.random() < 0.7) {
    bot.goalZone = defend.id;
    bot.goal = {
      x: defend.x + (Math.random() - 0.5) * defend.captureRadius,
      z: defend.z + (Math.random() - 0.5) * defend.captureRadius,
    };
    return;
  }

  const ownedNonHq = game.ownedNonHq(bot.team);
  const candidates = [];
  for (const def of defs) {
    const st = zoneState.get(def.id);
    if (!st || st.owner === bot.team) continue;
    if (def.type === 'hq' && ownedNonHq < 3) continue;
    const d = dist2d(bot.x, bot.z, def.x, def.z);
    const progressBonus = st.progress > 0 ? st.progress * 1.4 : 0;
    candidates.push({ def, weight: d - progressBonus + Math.random() * 140 });
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.weight - b.weight);
    const chosen = candidates[0].def;
    bot.goalZone = chosen.id;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * chosen.captureRadius * 0.55;
    bot.goal = { x: chosen.x + Math.cos(a) * r, z: chosen.z + Math.sin(a) * r };
  } else {
    const own = defs.filter((d) => zoneState.get(d.id)?.owner === bot.team);
    const chosen = own[Math.floor(Math.random() * own.length)] || defs[0];
    bot.goalZone = chosen.id;
    bot.goal = {
      x: chosen.x + (Math.random() - 0.5) * chosen.captureRadius,
      z: chosen.z + (Math.random() - 0.5) * chosen.captureRadius,
    };
  }
}

function findEnemy(game, bot) {
  let best = null;
  let bestDist = 120;
  const eye = game.eyePos(bot);
  for (const other of game.players.values()) {
    if (!other.alive || other.team === bot.team || other.id === bot.id) continue;
    const d = dist2d(bot.x, bot.z, other.x, other.z);
    if (d > bestDist) continue;
    if (!lineOfSight(eye.x, eye.y, eye.z, other.x, other.y + 1.1, other.z, d + 4)) continue;
    bestDist = d;
    best = other;
  }
  if (best && best.id !== bot.enemyId) {
    bot.reactionUntil = Date.now() + 320 + Math.random() * 420;
  }
  return best ? best.id : null;
}

function steerAroundObstacles(bot, dx, dz) {
  let ax = dx;
  let az = dz;
  const near = queryObstacles(OBSTACLE_HASH, bot.x, bot.z, 5.5);
  for (const o of near) {
    const ox = bot.x - o.x;
    const oz = bot.z - o.z;
    const d = Math.hypot(ox, oz);
    if (d < o.r + 1.35 && d > 0.01) {
      const w = (o.r + 1.35 - d) / (o.r + 1.35);
      ax += (ox / d) * w * 1.9;
      az += (oz / d) * w * 1.9;
    }
  }
  const l = Math.hypot(ax, az) || 1;
  return { x: ax / l, z: az / l };
}

function tryMove(game, bot, dx, dz, speed, dt) {
  const step = speed * dt;
  let dir = steerAroundObstacles(bot, dx, dz);

  // Suya girmeden yön değiştir.
  const check = (vx, vz) => heightAt(bot.x + vx * 4.5, bot.z + vz * 4.5) > 0.85;
  if (!check(dir.x, dir.z)) {
    let found = false;
    for (const angle of [0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const rx = dir.x * c - dir.z * s;
      const rz = dir.x * s + dir.z * c;
      if (check(rx, rz)) {
        dir = { x: rx, z: rz };
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  let nx = bot.x + dir.x * step;
  let nz = bot.z + dir.z * step;

  // Engellerden dışarı it.
  const col = resolveObstacleCollisions(nx, nz, 0.55);
  nx = col.x;
  nz = col.z;

  if (heightAt(nx, nz) < 0.65) {
    bot.vx = 0;
    bot.vz = 0;
    return false;
  }
  nx = Math.max(-770, Math.min(770, nx));
  nz = Math.max(-770, Math.min(770, nz));
  const prevX = bot.x;
  const prevZ = bot.z;
  bot.x = nx;
  bot.z = nz;
  bot.y = heightAt(nx, nz);
  const safeDt = Math.max(dt, 0.016);
  bot.vx = (nx - prevX) / safeDt;
  bot.vz = (nz - prevZ) / safeDt;

  const targetYaw = Math.atan2(-dir.x, -dir.z);
  bot.yaw += angleDelta(bot.yaw, targetYaw) * Math.min(1, dt * 10);
  bot.moving = true;
  bot.sprint = speed > 7;
  return true;
}

function botCombat(game, bot, enemy, now, dt) {
  const eye = game.eyePos(bot);
  const target = game.eyePos(enemy);
  const dist = Math.hypot(enemy.x - bot.x, enemy.z - bot.z);
  const weapon = weaponFor(bot.weapon);

  const lead = dist / 420;
  const aim = normalize(
    target.x + (enemy.vx || 0) * lead - eye.x,
    target.y - eye.y - 0.12,
    target.z + (enemy.vz || 0) * lead - eye.z,
  );
  const error = (weapon.id === 'sniper' ? 0.004 : weapon.id === 'shotgun' ? 0.03 : 0.017) + dist * 0.00012;
  const dir = coneDirection(aim, error);
  bot.yaw = Math.atan2(-dir.x, -dir.z);
  bot.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));

  // Mesafeyi koru ve yanlara kaç.
  if (now > bot.strafeSwitch) {
    bot.strafeDir *= -1;
    bot.strafeSwitch = now + 900 + Math.random() * 1200;
  }
  const toX = (enemy.x - bot.x) / (dist || 1);
  const toZ = (enemy.z - bot.z) / (dist || 1);
  let mx = -toZ * bot.strafeDir;
  let mz = toX * bot.strafeDir;
  if (dist < 11) {
    mx -= toX * 0.9;
    mz -= toZ * 0.9;
  } else if (dist > 52 && weapon.id !== 'sniper') {
    mx += toX * 0.7;
    mz += toZ * 0.7;
  }
  const ml = Math.hypot(mx, mz) || 1;
  tryMove(game, bot, mx / ml, mz / ml, 4.2, dt);
  bot.yaw = Math.atan2(-dir.x, -dir.z);
  bot.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  bot.aim = true;
  bot.crouch = !!bot.reloadingUntil || dist > 38;

  if (now < bot.reactionUntil || now < bot.nextShotAt) return;
  if (weapon.id === 'shotgun' && dist > 34) return;
  if (weapon.id === 'sniper' && dist < 16) return;
  if (bot.ammo <= 0) {
    game.startReload(bot);
    bot.crouch = true;
    bot.nextShotAt = now + 1600;
    return;
  }
  game.fireWeapon(bot, dir);
  if (weapon.auto) {
    bot.burstCount++;
    if (bot.burstCount > 9 + Math.random() * 7) {
      bot.burstCount = 0;
      bot.nextShotAt = now + 450 + Math.random() * 550;
    } else {
      bot.nextShotAt = now + (60 / weapon.rpm) * 1000 + 20;
    }
  } else {
    bot.nextShotAt = now + (60 / weapon.rpm) * 1000 + 180 + Math.random() * 280;
  }
}

export function botTick(game, bot, now, dt) {
  if (!bot.alive) {
    if (now >= bot.respawnAt) game.respawnPlayer(bot, randomBotWeapon());
    return;
  }
  bot.moving = false;
  bot.sprint = false;
  bot.aim = false;
  bot.crouch = false;
  bot.vx = 0;
  bot.vz = 0;

  if (now >= bot.nextThink) {
    bot.nextThink = now + 200 + Math.random() * 160;
    bot.enemyId = findEnemy(game, bot);
    if (!bot.enemyId) chooseObjective(game, bot);
  }

  const enemy = bot.enemyId ? game.players.get(bot.enemyId) : null;
  if (enemy && enemy.alive) {
    const d = dist2d(bot.x, bot.z, enemy.x, enemy.z);
    const eye = game.eyePos(bot);
    if (d < 120 && lineOfSight(eye.x, eye.y, eye.z, enemy.x, enemy.y + 1.05, enemy.z, d + 4)) {
      botCombat(game, bot, enemy, now, dt);
      return;
    }
    bot.enemyId = null;
  } else if (bot.enemyId) {
    bot.enemyId = null;
  }

  // Hedef bölgeye yürü.
  if (!bot.goal) chooseObjective(game, bot);
  let goal = bot.goal;
  if (!goal) return;
  const d = dist2d(bot.x, bot.z, goal.x, goal.z);
  if (d < 3.5) {
    if (Math.random() < 0.35) chooseObjective(game, bot);
    else {
      const a = Math.random() * Math.PI * 2;
      bot.goal = { x: goal.x + Math.cos(a) * 7, z: goal.z + Math.sin(a) * 7 };
    }
    goal = bot.goal;
  }

  let dx = goal.x - bot.x;
  let dz = goal.z - bot.z;
  if (now < bot.detourUntil) {
    dx = Math.cos(bot.detourAngle);
    dz = Math.sin(bot.detourAngle);
  }
  const dl = Math.hypot(dx, dz) || 1;
  const moveSpeed = d > 45 ? 7.6 : 5.6;
  const moved = tryMove(game, bot, dx / dl, dz / dl, moveSpeed, dt);

  // Sıkışma kontrolü (engelde yerinde sayma durumu)
  if (now - (bot.stuckAt || 0) > 850) {
    const progress = Math.hypot(bot.x - (bot.lastX || 0), bot.z - (bot.lastZ || 0));
    bot.lastX = bot.x;
    bot.lastZ = bot.z;
    bot.stuckAt = now;
    if (progress < 0.45 && d > 5 && now > bot.detourUntil) {
      bot.detourUntil = now + 1300 + Math.random() * 1100;
      bot.detourAngle = Math.atan2(dz, dx) + (Math.random() < 0.5 ? 1 : -1) * (1.3 + Math.random());
    }
  }

  if (!moved) {
    if (now > bot.detourUntil) {
      bot.detourUntil = now + 1200 + Math.random() * 1200;
      bot.detourAngle = Math.atan2(dz, dx) + (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random());
    }
  } else if (now >= bot.detourUntil) {
    bot.detourUntil = 0;
  }
}
