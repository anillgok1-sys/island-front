// Oyun sunucusu: yetkili hasar, bölge kontrolü, araçlar, skor ve maç akışı.
import {
  MATCH, NET, PLAYER, TEAMS, VEHICLES, WORLD, clamp, dist2d,
} from '../shared/config.js';
import {
  ZONES, heightAt, terrainHeightAt, slopeAt, spawnAround, randomIslandSpawn, isBlocked,
  resolveObstacleCollisions, raySphere, terrainRay, rayObstacle, lineOfSight, seatPosition, createVehicleSpawns,
} from '../shared/map.js';
import { WEAPONS, weaponFor, isPrimaryWeapon, damageAtRange, createLoadout } from '../shared/weapons.js';
import { botTick, createBotPlayer, randomBotWeapon } from './bots.js';

const MAX_TEAM = 12;
const TARGET_TEAM = 6;
const MAX_PLAYERS = 28;
const MAX_MSG = 8192;

function r2(v) {
  return Math.round(v * 100) / 100;
}

function num(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function normalize3(x, y, z) {
  const l = Math.hypot(x, y, z);
  if (l < 1e-6) return { x: 0, y: 0, z: 1 };
  return { x: x / l, y: y / l, z: z / l };
}

function spreadDirection(dir, spread) {
  if (spread <= 0) return dir;
  const upX = Math.abs(dir.y) > 0.98 ? 1 : 0;
  const upY = Math.abs(dir.y) > 0.98 ? 0 : 1;
  let rx = -dir.z * upY;
  let ry = dir.z * upX;
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
  return normalize3(
    dir.x + (rx * Math.cos(a) + ux * Math.sin(a)) * r,
    dir.y + (ry * Math.cos(a) + uy * Math.sin(a)) * r,
    dir.z + (rz * Math.cos(a) + uz * Math.sin(a)) * r,
  );
}

export class Game {
  constructor(roomId = 'ADA-01') {
    this.roomId = roomId;
    this.players = new Map();
    this.clients = new Set();
    this.nextPlayerNum = 1;
    this.vehicles = createVehicleSpawns();
    this.nextVehicleId = this.vehicles.length + 1;
    this.zones = ZONES.map((z) => ({
      id: z.id,
      owner: z.team,
      capturingTeam: null,
      progress: 0,
      contested: false,
      counts: { red: 0, blue: 0 },
      enemyNear: { red: false, blue: false },
      lastNotice: 0,
    }));
    this.scores = { red: 0, blue: 0 };
    this.match = this.freshMatch();
    this.lastTick = Date.now();
    this.zoneAcc = 0;
    this.scoreAcc = 0;
    this.startedAt = Date.now();

    this.tickTimer = setInterval(() => this.tick(), 50);
    this.snapTimer = setInterval(() => this.broadcastSnapshot(), 1000 / NET.snapshotHz);
    console.log(`[game:${this.roomId}] ada sunucusu hazır,`, this.vehicles.length, 'araç');
  }

  destroy() {
    clearInterval(this.tickTimer);
    clearInterval(this.snapTimer);
    for (const ws of this.clients) {
      try {
        ws.close();
      } catch {
        // yoksay
      }
    }
    this.clients.clear();
    this.players.clear();
  }

  freshMatch() {
    const now = Date.now();
    return {
      start: now,
      end: now + MATCH.duration * 1000,
      over: false,
      winner: null,
      reason: null,
      resetAt: 0,
    };
  }

  zoneDef(id) {
    return ZONES.find((z) => z.id === id);
  }

  vehicle(id) {
    return this.vehicles.find((v) => v.id === id) || null;
  }

  ownedNonHq(team) {
    return this.zones.filter((z) => z.owner === team && this.zoneDef(z.id).type !== 'hq').length;
  }

  teamCount(team) {
    let n = 0;
    for (const p of this.players.values()) if (p.team === team) n++;
    return n;
  }

  humanTeamCount(team) {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot && p.team === team) n++;
    return n;
  }

  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  isFullOfHumans() {
    return this.humanCount() >= MAX_TEAM * 2;
  }

  evictBotFromTeam(team) {
    for (const p of this.players.values()) {
      if (p.bot && (!team || p.team === team)) {
        this.removePlayer(p.id, false, true);
        return true;
      }
    }
    return false;
  }

  // --- Bağlantı -----------------------------------------------------------

  addClient(ws) {
    ws.isAlive = true;
    ws.player = null;
    ws.lastChatAt = 0;
    this.clients.add(ws);
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => this.onMessage(ws, raw));
    ws.on('close', () => {
      this.clients.delete(ws);
      if (ws.player) this.removePlayer(ws.player.id, true);
    });
    ws.on('error', () => {
      try {
        ws.close();
      } catch {
        // yoksay
      }
    });
    this.sendRaw(ws, { t: 'hello', serverNow: Date.now(), version: 1 });
  }

  sendRaw(ws, msg) {
    if (!ws || ws.readyState !== 1) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // kapanmış soket
    }
  }

  sendTo(player, msg) {
    if (!player || !player.ws) return;
    this.sendRaw(player.ws, msg);
  }

  broadcast(msg, exceptId = null) {
    const raw = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (!ws.player || ws.player.id === exceptId) continue;
      if (ws.readyState !== 1) continue;
      try {
        ws.send(raw);
      } catch {
        // yoksay
      }
    }
  }

  onMessage(ws, raw) {
    if (raw.length > MAX_MSG) return;
    const now = Date.now();
    if (!ws.rateWindowStart || now - ws.rateWindowStart > 1000) {
      ws.rateWindowStart = now;
      ws.rateCount = 0;
    }
    if (++ws.rateCount > 90) return;

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'join') {
      this.onJoin(ws, msg);
      return;
    }
    if (msg.t === 'ping') {
      this.sendRaw(ws, { t: 'pong', time: msg.time, now: Date.now() });
      return;
    }
    const p = ws.player;
    if (!p) return;

    switch (msg.t) {
      case 'input':
        this.onInput(p, msg);
        break;
      case 'shoot':
        this.onShoot(p, msg);
        break;
      case 'reload':
        this.startReload(p);
        break;
      case 'switchWeapon':
      case 'weapon':
        this.onSwitchWeapon(p, msg);
        break;
      case 'redeploy':
        this.onRedeploy(p);
        break;
      case 'enter':
        this.onEnter(p, msg);
        break;
      case 'exit':
        this.onExit(p);
        break;
      case 'veh':
        this.onVehicleState(p, msg);
        break;
      case 'vehReset':
        this.onVehicleReset(p);
        break;
      case 'respawn':
        this.onRespawn(p, msg);
        break;
      case 'chat':
        this.onChat(ws, p, msg);
        break;
      case 'leave':
        this.removePlayer(p.id, true);
        try {
          ws.close();
        } catch {
          // yoksay
        }
        break;
      default:
        break;
    }
  }

  sanitizeName(name) {
    if (typeof name !== 'string') return '';
    return name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  }

  onJoin(ws, msg) {
    if (ws.player) return;
    if (this.players.size >= MAX_PLAYERS) {
      if (!this.evictBotFromTeam(null) && this.players.size >= MAX_PLAYERS) {
        this.sendRaw(ws, { t: 'error', text: 'Bu ada odası dolu, sayfayı yenileyerek yeni odaya bağlan.' });
        return;
      }
    }
    let team = msg.team === 'blue' ? 'blue' : 'red';
    if (this.teamCount(team) >= MAX_TEAM) {
      this.evictBotFromTeam(team);
    }
    if (this.teamCount(team) >= MAX_TEAM) {
      const otherTeam = team === 'red' ? 'blue' : 'red';
      if (this.teamCount(otherTeam) >= MAX_TEAM) this.evictBotFromTeam(otherTeam);
      if (this.teamCount(otherTeam) < MAX_TEAM) {
        team = otherTeam;
      } else {
        this.sendRaw(ws, { t: 'error', text: 'Takım dolu, diğer takımı seç.' });
        return;
      }
    }
    const name = this.sanitizeName(msg.name) || 'Asker' + Math.floor(Math.random() * 900 + 100);
    const weapon = isPrimaryWeapon(msg.weapon) ? msg.weapon : 'pistol';
    const id = 'p' + this.nextPlayerNum++;
    const now = Date.now();
    const p = {
      id,
      name,
      team,
      bot: false,
      ws,
      weapon,
      primaryWeapon: weapon,
      hp: PLAYER.maxHealth,
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
      loadout: createLoadout(weapon),
      reloadingUntil: 0,
      lastShotAt: 0,
      lastRedeployAt: 0,
      spawnZoneId: null,
      kills: 0,
      deaths: 0,
      score: 0,
      captures: 0,
      streak: 0,
      spawnProtectUntil: 0,
      respawnAt: 0,
      joinedAt: now,
      lastInputAt: now,
      lastChatAt: 0,
    };
    this.players.set(id, p);
    ws.player = p;
    this.spawnPlayer(p, weapon, true);
    this.ensureBots();

    this.sendTo(p, {
      t: 'welcome',
      id,
      serverNow: Date.now(),
      match: this.matchSnapshot(),
      zones: this.zonesSnapshot(),
      vehicles: this.vehiclesSnapshot(),
      players: this.playersSnapshot(),
      you: this.selfSnapshot(p),
      config: {
        respawn: MATCH.respawnTime,
        duration: MATCH.duration,
        hqCaptureMinZones: MATCH.hqCaptureMinZones,
      },
    });
    this.broadcast({ t: 'joined', player: this.playerSnapshot(p) }, id);
    this.broadcast({ t: 'notice', text: `${p.name}, ${TEAMS[team].name} tarafına katıldı.` }, id);
    console.log(`[game] ${p.name} (${team}) katıldı. Oyuncu: ${this.humanCount()} insan, ${this.players.size} toplam`);
  }

  // --- Doğma --------------------------------------------------------------

  isEnemyPlayerNear(team, x, z, radius = 22) {
    for (const other of this.players.values()) {
      if (!other.alive || other.team === team) continue;
      if (dist2d(x, z, other.x, other.z) < radius) return true;
    }
    return false;
  }

  chooseSpawn(team, preferredZoneId = null) {
    const owned = this.zones.filter((z) => z.owner === team).map((z) => this.zoneDef(z.id));
    const fallback = this.zoneDef(team === 'red' ? 'red_hq' : 'blue_hq');

    let base = null;
    if (preferredZoneId) {
      const prefState = this.zones.find((z) => z.id === preferredZoneId);
      if (prefState && prefState.owner === team) {
        base = this.zoneDef(preferredZoneId);
      } else {
        base = owned.find((z) => z.id === fallback.id) || owned[0] || fallback;
      }
    } else {
      base = owned.length ? owned[Math.floor(Math.random() * owned.length)] : fallback;
    }

    // Belirli bir bölge seçilmişse doğrudan o bölgenin güvenli çevresinde doğ.
    if (preferredZoneId) {
      let bestSpot = null;
      let bestMinEnemyDist = -1;
      for (let i = 0; i < 20; i++) {
        const candidate = spawnAround(base);
        let minEnemyDist = 9999;
        for (const other of this.players.values()) {
          if (!other.alive || other.team === team) continue;
          const d = dist2d(candidate.x, candidate.z, other.x, other.z);
          if (d < minEnemyDist) minEnemyDist = d;
        }
        if (minEnemyDist >= 22) return { ...candidate, zoneId: base.id };
        if (minEnemyDist > bestMinEnemyDist) {
          bestMinEnemyDist = minEnemyDist;
          bestSpot = candidate;
        }
      }
      return { ...(bestSpot || spawnAround(base)), zoneId: base.id };
    }

    if (Math.random() < 0.3) {
      for (let i = 0; i < 45; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 18 + Math.random() * 320;
        const x = base.x + Math.cos(a) * r;
        const z = base.z + Math.sin(a) * r;
        if (Math.abs(x) > 720 || Math.abs(z) > 720) continue;
        const h = heightAt(x, z);
        if (h < 1.2 || h > 45) continue;
        if (slopeAt(x, z) > 0.45) continue;
        if (isBlocked(x, z, 1.2)) continue;
        let enemyNear = this.isEnemyPlayerNear(team, x, z, 24);
        if (!enemyNear) {
          for (const zs of this.zones) {
            if (zs.owner !== team) {
              const zd = this.zoneDef(zs.id);
              if (zd && dist2d(x, z, zd.x, zd.z) < zd.captureRadius + 14) {
                enemyNear = true;
                break;
              }
            }
          }
        }
        if (enemyNear) continue;
        return { x, y: h + 0.1, z, zoneId: base.id };
      }
    }
    for (let i = 0; i < 12; i++) {
      const candidate = spawnAround(base);
      if (!this.isEnemyPlayerNear(team, candidate.x, candidate.z, 18)) {
        return { ...candidate, zoneId: base.id };
      }
    }
    return { ...spawnAround(base), zoneId: base.id };
  }

  findVehicleSpot(x, z) {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.5 + Math.random() * 3;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const h = heightAt(px, pz);
      if (h < 1) continue;
      if (isBlocked(px, pz, 1.4)) continue;
      return { x: px, y: h + 0.15, z: pz };
    }
    return { x, y: heightAt(x, z) + 0.15, z };
  }

  cleanupPersonalScooter(p) {
    if (p.bot) return;
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.personal && v.ownerId === p.id && !v.driver && !v.passenger) {
        this.vehicles.splice(i, 1);
      }
    }
  }

  ensurePersonalScooter(p) {
    if (p.bot) return;
    let scooter = this.vehicles.find((v) => v.personal && v.ownerId === p.id);
    if (!scooter) {
      const spot = this.findVehicleSpot(p.x, p.z);
      scooter = {
        id: 'v' + this.nextVehicleId++,
        type: 'scooter',
        personal: true,
        ownerId: p.id,
        x: spot.x,
        y: spot.y,
        z: spot.z,
        ry: p.yaw + Math.PI / 2,
        rx: 0,
        rz: 0,
        speed: 0,
        driver: null,
        passenger: null,
        home: { x: spot.x, y: spot.y, z: spot.z, ry: p.yaw + Math.PI / 2 },
        lastUpdate: Date.now(),
        broadcastAt: 0,
      };
      this.vehicles.push(scooter);
    } else if (!scooter.driver && !scooter.passenger) {
      const spot = this.findVehicleSpot(p.x, p.z);
      scooter.x = spot.x;
      scooter.y = spot.y;
      scooter.z = spot.z;
      scooter.ry = p.yaw + Math.PI / 2;
      scooter.rx = 0;
      scooter.rz = 0;
      scooter.speed = 0;
      scooter.home = { x: spot.x, y: spot.y, z: spot.z, ry: scooter.ry };
    }
  }

  spawnPlayer(p, weaponId, initial = false, preferredZoneId = null) {
    const primaryId = isPrimaryWeapon(weaponId) ? weaponId : (isPrimaryWeapon(p.primaryWeapon) ? p.primaryWeapon : 'pistol');
    const weapon = weaponFor(primaryId);
    if (p.inVehicle) this.forceExitVehicle(p);
    const spawn = this.chooseSpawn(p.team, preferredZoneId);
    p.primaryWeapon = weapon.id;
    p.loadout = createLoadout(weapon.id);
    p.weapon = weapon.id;
    p.spawnZoneId = spawn.zoneId || null;
    p.hp = PLAYER.maxHealth;
    p.alive = true;
    p.ammo = weapon.magSize;
    p.reserve = weapon.reserve;
    p.reloadingUntil = 0;
    p.lastShotAt = 0;
    p.x = spawn.x;
    p.y = spawn.y;
    p.z = spawn.z;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.yaw = Math.atan2(-spawn.x, -spawn.z);
    p.pitch = 0;
    p.aim = false;
    p.moving = false;
    p.sprint = false;
    p.crouch = false;
    p.swim = false;
    p.spawnProtectUntil = Date.now() + PLAYER.spawnProtect * 1000;
    p.respawnAt = 0;
    p.lastInputAt = Date.now();
    if (weapon.id === 'pistol') this.ensurePersonalScooter(p);
    else this.cleanupPersonalScooter(p);

    if (p.ws) {
      this.sendTo(p, {
        t: 'spawned',
        initial,
        zoneId: p.spawnZoneId,
        pos: { x: p.x, y: p.y, z: p.z },
        you: this.selfSnapshot(p),
        match: this.matchSnapshot(),
        vehicles: this.vehiclesSnapshot(),
      });
    }
  }

  respawnPlayer(p, weaponOverride, preferredZoneId = null) {
    if (p.alive) return;
    if (Date.now() < p.respawnAt - 150) return;
    const weapon = isPrimaryWeapon(weaponOverride) ? weaponOverride : (p.primaryWeapon || p.weapon);
    p.streak = 0;
    this.spawnPlayer(p, weapon, false, preferredZoneId);
    if (p.ws) this.broadcast({ t: 'respawn', player: this.playerSnapshot(p) });
  }

  onRespawn(p, msg) {
    if (p.alive) return;
    const prefZone = typeof msg.zone === 'string' ? msg.zone : (typeof msg.zoneId === 'string' ? msg.zoneId : null);
    this.respawnPlayer(p, msg.weapon, prefZone);
  }

  onRedeploy(p) {
    if (!p.alive || this.match.over) return;
    const now = Date.now();
    if (now - (p.lastRedeployAt || 0) < 3000) return;
    p.lastRedeployAt = now;
    this.killPlayer(p, null, null, false, true);
  }

  onSwitchWeapon(p, msg) {
    if (!p.alive) return;
    const targetId = typeof msg.weapon === 'string' ? msg.weapon : null;
    if (!targetId || !WEAPONS[targetId] || targetId === p.weapon) return;
    const primary = p.primaryWeapon || 'pistol';
    // Oyuncu yalnızca doğarken seçtiği ana silahı veya varsayılan uzun bıçağı kullanabilir
    if (targetId !== primary && targetId !== 'knife') return;
    if (!p.loadout) p.loadout = createLoadout(primary);
    // Mevcut silahın mermisini kaydet
    if (!WEAPONS[p.weapon].melee) {
      p.loadout[p.weapon] = { ammo: p.ammo, reserve: p.reserve };
    }
    // Şarjör değiştirmeyi iptal et ve yeni silaha geç
    p.reloadingUntil = 0;
    p.weapon = targetId;
    const slot = p.loadout[targetId] || { ammo: WEAPONS[targetId].magSize, reserve: WEAPONS[targetId].reserve };
    p.ammo = slot.ammo;
    p.reserve = slot.reserve;
    const minCooldown = Date.now() - (60 / WEAPONS[targetId].rpm) * 1000 + 160;
    if (p.lastShotAt < minCooldown) p.lastShotAt = minCooldown;
    if (p.ws) {
      this.sendTo(p, {
        t: 'weaponSwitched',
        weapon: p.weapon,
        primaryWeapon: primary,
        ammo: p.ammo,
        reserve: p.reserve,
        slots: p.loadout,
      });
    }
  }

  // --- Hareket ------------------------------------------------------------

  onInput(p, msg) {
    if (!p.alive) return;
    const now = Date.now();
    p.yaw = num(msg.yaw, p.yaw);
    p.pitch = clamp(num(msg.pitch, p.pitch), -1.52, 1.52);
    p.aim = !!msg.aim;
    p.moving = !!msg.moving;
    p.sprint = !!msg.sprint;
    p.crouch = !!msg.crouch;
    p.vx = clamp(num(msg.vx, 0), -40, 40);
    p.vz = clamp(num(msg.vz, 0), -40, 40);
    p.vy = clamp(num(msg.vy, 0), -60, 30);
    if (p.inVehicle) return;

    const dt = clamp((now - p.lastInputAt) / 1000, 0.016, 0.3);
    p.lastInputAt = now;
    const nx = num(msg.x, p.x);
    const ny = num(msg.y, p.y);
    const nz = num(msg.z, p.z);
    const d = Math.hypot(nx - p.x, nz - p.z);
    const speedMult = p.weapon === 'knife' ? 1.15 : 1;
    const maxStep = ((p.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed) * speedMult + 4.5) * dt + 2.5;
    if (d > maxStep || Math.abs(nx) > 800 || Math.abs(nz) > 800) {
      this.sendTo(p, { t: 'correct', x: p.x, y: p.y, z: p.z });
      return;
    }
    const col = resolveObstacleCollisions(nx, nz, PLAYER.radius);
    p.x = col.x;
    p.z = col.z;
    const ground = heightAt(p.x, p.z);
    p.y = clamp(ny, ground - 0.6, ground + 18);
    p.swim = ground < WORLD.waterLevel - 0.9 && p.y < WORLD.waterLevel + 0.6;
  }

  eyePos(p) {
    const h = p.crouch ? 1.12 : PLAYER.eyeHeight;
    return { x: p.x, y: p.y + h, z: p.z };
  }

  // --- Silahlar -----------------------------------------------------------

  onShoot(p, msg) {
    if (!p.alive || p.reloadingUntil) return;
    if (p.inVehicle && p.seat === 0) return;
    const ground = heightAt(p.x, p.z);
    if (!p.inVehicle && ground < WORLD.waterLevel - 1 && p.y < WORLD.waterLevel + 0.5) return;
    const dir = normalize3(num(msg.dx, 0), num(msg.dy, 0), num(msg.dz, 1));
    this.fireWeapon(p, dir);
  }

  startReload(p) {
    const weapon = weaponFor(p.weapon);
    if (weapon.melee) return;
    const now = Date.now();
    if (!p.alive || p.reloadingUntil) return;
    if (p.ammo >= weapon.magSize || p.reserve <= 0) return;
    p.reloadingUntil = now + weapon.reloadTime * 1000;
    if (p.ws) {
      this.sendTo(p, { t: 'reloading', end: p.reloadingUntil, duration: weapon.reloadTime });
      this.broadcast({ t: 'reloadAnim', id: p.id, duration: weapon.reloadTime }, p.id);
    }
  }

  completeReload(p) {
    const weapon = weaponFor(p.weapon);
    const need = weapon.magSize - p.ammo;
    const take = Math.min(need, p.reserve);
    p.ammo += take;
    p.reserve -= take;
    if (p.loadout && p.loadout[p.weapon]) {
      p.loadout[p.weapon].ammo = p.ammo;
      p.loadout[p.weapon].reserve = p.reserve;
    }
    p.reloadingUntil = 0;
    if (p.ws) this.sendTo(p, { t: 'reloaded', ammo: p.ammo, reserve: p.reserve });
  }

  traceShot(origin, dir, range, shooter) {
    const weapon = weaponFor(shooter.weapon);
    const extraR = weapon.melee ? 0.36 : 0;
    let bestT = range;
    let bestPlayer = null;
    let bestPart = null;

    for (const target of this.players.values()) {
      if (!target.alive || target.id === shooter.id || target.team === shooter.team) continue;
      if (Math.abs(target.x - origin.x) > range + 3 || Math.abs(target.z - origin.z) > range + 3) continue;
      const crouch = target.crouch ? 0.72 : 1;
      const parts = [
        { y: target.y + 1.62 * crouch, r: 0.26 + extraR, name: 'head', mult: weapon.headMultiplier },
        { y: target.y + 1.08 * crouch, r: 0.38 + extraR, name: 'torso', mult: 1 },
        { y: target.y + 0.52 * crouch, r: 0.34 + extraR, name: 'legs', mult: weapon.limbMultiplier },
      ];
      for (const part of parts) {
        const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, target.x, part.y, target.z, part.r, bestT);
        if (t !== null && t < bestT) {
          bestT = t;
          bestPlayer = target;
          bestPart = part;
        }
      }
    }

    let worldT = null;
    const tTerrain = terrainRay(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, bestT);
    if (tTerrain !== null) worldT = tTerrain;
    const tObs = rayObstacle(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, worldT ?? bestT);
    if (tObs !== null && (worldT === null || tObs < worldT)) worldT = tObs;

    if (bestPlayer && (worldT === null || bestT < worldT)) {
      return {
        t: bestT,
        player: bestPlayer,
        part: bestPart,
        point: { x: origin.x + dir.x * bestT, y: origin.y + dir.y * bestT, z: origin.z + dir.z * bestT },
        type: 'player',
      };
    }
    const t = worldT !== null ? worldT : range;
    return {
      t,
      player: null,
      part: null,
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
      type: worldT !== null ? 'world' : 'air',
    };
  }

  fireWeapon(shooter, baseDir) {
    if (!shooter.alive || shooter.reloadingUntil) return false;
    const weapon = weaponFor(shooter.weapon);
    const now = Date.now();
    const interval = 60 / weapon.rpm;
    if (now - shooter.lastShotAt < interval * 1000 * 0.9) return false;
    if (!weapon.melee) {
      if (shooter.ammo <= 0) {
        this.startReload(shooter);
        return false;
      }
      shooter.ammo--;
      if (shooter.loadout && shooter.loadout[shooter.weapon]) {
        shooter.loadout[shooter.weapon].ammo = shooter.ammo;
      }
    }
    shooter.lastShotAt = now;
    shooter.spawnProtectUntil = 0;
    const origin = this.eyePos(shooter);
    const movingPenalty = shooter.moving ? weapon.spreadMove : 0;
    const baseSpread = (shooter.aim ? weapon.spreadAim : weapon.spreadHip) + movingPenalty + (shooter.sprint ? 0.025 : 0);
    const endpoints = [];
    const hits = new Map();
    let hitType = 'air';

    for (let i = 0; i < weapon.pellets; i++) {
      const dir = spreadDirection(baseDir, baseSpread);
      const hit = this.traceShot(origin, dir, weapon.range, shooter);
      endpoints.push([r2(hit.point.x), r2(hit.point.y), r2(hit.point.z)]);
      if (hit.type === 'world') hitType = 'world';
      if (hit.player) {
        hitType = 'player';
        const falloff = damageAtRange(weapon, hit.t) / weapon.damage;
        const dmg = weapon.damage * falloff * (hit.part ? hit.part.mult : 1);
        const entry = hits.get(hit.player.id) || { player: hit.player, amount: 0, head: false, dir };
        entry.amount += dmg;
        if (hit.part && hit.part.name === 'head') entry.head = true;
        entry.dir = dir;
        hits.set(hit.player.id, entry);
      }
    }

    this.broadcast({
      t: 'shot',
      s: shooter.id,
      w: shooter.weapon,
      o: [r2(origin.x), r2(origin.y), r2(origin.z)],
      e: endpoints,
      hit: hitType,
      target: [...hits.keys()][0] || null,
    });

    for (const hit of hits.values()) {
      const killed = this.applyDamage(hit.player, hit.amount, shooter, weapon, hit.head, hit.dir);
      if (shooter.ws) {
        this.sendTo(shooter, {
          t: 'hitmark',
          target: hit.player.id,
          amount: Math.round(hit.amount),
          head: hit.head,
          kill: killed,
          protected: Date.now() < hit.player.spawnProtectUntil,
        });
      }
    }
    return true;
  }

  applyDamage(target, amount, attacker, weapon, headshot, dir) {
    if (!target.alive) return false;
    if (Date.now() < target.spawnProtectUntil) return false;
    const dmg = Math.max(1, Math.round(amount));
    target.hp = Math.max(0, target.hp - dmg);
    if (target.ws) {
      this.sendTo(target, {
        t: 'damage',
        amount: dmg,
        hp: target.hp,
        from: attacker ? attacker.id : null,
        fromName: attacker ? attacker.name : null,
        dir: dir ? [r2(dir.x), r2(dir.y), r2(dir.z)] : [0, 0, 0],
        weapon: weapon ? weapon.id : null,
      });
    }
    if (target.hp <= 0) {
      this.killPlayer(target, attacker, weapon, headshot);
      return true;
    }
    return false;
  }

  killPlayer(victim, killer, weapon, headshot, isRedeploy = false) {
    if (!victim.alive) return;
    const now = Date.now();
    if (victim.inVehicle) this.forceExitVehicle(victim);
    victim.alive = false;
    victim.hp = 0;
    if (!isRedeploy) victim.deaths++;
    victim.streak = 0;
    victim.respawnAt = now + MATCH.respawnTime * 1000;
    victim.reloadingUntil = 0;
    if (killer && killer.id !== victim.id) {
      killer.kills++;
      killer.streak++;
      killer.score += MATCH.killScore;
      if (killer.team && this.scores[killer.team] !== undefined && killer.team !== victim.team) {
        this.scores[killer.team] += MATCH.killScore;
      }
    }
    for (const other of this.players.values()) {
      if (other.bot && other.enemyId === victim.id) other.enemyId = null;
    }
    if (!isRedeploy) {
      this.broadcast({
        t: 'kill',
        killer: killer ? killer.id : null,
        killerName: killer ? killer.name : 'Ada',
        victim: victim.id,
        victimName: victim.name,
        weapon: weapon ? weapon.id : 'pistol',
        headshot: !!headshot,
        scores: { ...this.scores },
      });
    }
    if (victim.ws) {
      this.sendTo(victim, {
        t: 'dead',
        by: killer ? killer.id : null,
        byName: killer ? killer.name : null,
        weapon: weapon ? weapon.id : null,
        headshot: !!headshot,
        redeploy: !!isRedeploy,
        respawnAt: victim.respawnAt,
      });
    }
    if (this.scores.red >= MATCH.scoreLimit || this.scores.blue >= MATCH.scoreLimit) {
      const winner = this.scores.red === this.scores.blue ? null : this.scores.red > this.scores.blue ? 'red' : 'blue';
      this.endMatch(winner, 'score');
    }
  }

  // --- Araçlar ------------------------------------------------------------

  onEnter(p, msg) {
    if (!p.alive || p.inVehicle) return;
    const v = this.vehicle(msg.vid);
    if (!v) return;
    if (v.driver === p.id || v.passenger === p.id || v.passenger2 === p.id) return;
    const maxDist = VEHICLES[v.type].enterRadius + 3.5;
    if (dist2d(p.x, p.z, v.x, v.z) > maxDist) return;

    let seat = -1;
    if (!v.driver) {
      seat = 0;
      v.driver = p.id;
    } else if (v.type === 'boat') {
      if (!v.passenger) {
        seat = 1;
        v.passenger = p.id;
      } else if (!v.passenger2) {
        seat = 2;
        v.passenger2 = p.id;
      }
    }
    if (seat < 0) return;

    p.inVehicle = v.id;
    p.seat = seat;
    p.crouch = false;
    p.aim = false;
    this.syncOccupant(p);
    this.sendTo(p, { t: 'entered', vehicle: this.vehicleSnapshot(v), seat });
    if (seat === 0) this.sendTo(p, { t: 'control', vid: v.id });
    this.broadcast({ t: 'vehEnter', vid: v.id, player: p.id, seat }, p.id);
  }

  findLandNear(x, z, maxR = 55) {
    for (let r = 5; r <= maxR; r += 5) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const h = heightAt(px, pz);
        if (h > 0.8 && slopeAt(px, pz) < 0.6 && !isBlocked(px, pz, 0.8)) return { x: px, y: h + 0.1, z: pz };
      }
    }
    return null;
  }

  placePlayerBeside(p, v) {
    if (v.type === 'scooter') {
      const sideX = Math.cos(v.ry);
      const sideZ = -Math.sin(v.ry);
      for (const side of [1.4, -1.4, 2.2, -2.2]) {
        const x = v.x + sideX * side;
        const z = v.z + sideZ * side;
        const h = heightAt(x, z);
        if (h > 0.5) return { x, y: h + 0.1, z };
      }
      return { x: v.x + 1.2, y: heightAt(v.x + 1.2, v.z) + 0.1, z: v.z };
    }
    const land = this.findLandNear(v.x, v.z, 70);
    if (land) return land;
    return { x: v.x + 2.2, y: WORLD.waterLevel - 0.55, z: v.z };
  }

  releaseVehicleSeat(v, p) {
    if (!v) return;
    if (v.driver === p.id) {
      if (v.passenger) {
        v.driver = v.passenger;
        v.passenger = v.passenger2 || null;
        v.passenger2 = null;
        const nextDriver = this.players.get(v.driver);
        if (nextDriver) {
          nextDriver.seat = 0;
          this.syncOccupant(nextDriver);
          this.sendTo(nextDriver, { t: 'control', vid: v.id });
        }
        if (v.passenger) {
          const nextPass = this.players.get(v.passenger);
          if (nextPass) {
            nextPass.seat = 1;
            this.syncOccupant(nextPass);
          }
        }
      } else if (v.passenger2) {
        v.driver = v.passenger2;
        v.passenger2 = null;
        const nextDriver = this.players.get(v.driver);
        if (nextDriver) {
          nextDriver.seat = 0;
          this.syncOccupant(nextDriver);
          this.sendTo(nextDriver, { t: 'control', vid: v.id });
        }
      } else {
        v.driver = null;
      }
    } else if (v.passenger === p.id) {
      v.passenger = v.passenger2 || null;
      v.passenger2 = null;
      if (v.passenger) {
        const nextPass = this.players.get(v.passenger);
        if (nextPass) {
          nextPass.seat = 1;
          this.syncOccupant(nextPass);
        }
      }
    } else if (v.passenger2 === p.id) {
      v.passenger2 = null;
    }
  }

  onExit(p) {
    if (!p.inVehicle) return;
    const v = this.vehicle(p.inVehicle);
    if (!v) {
      p.inVehicle = null;
      p.seat = null;
      return;
    }
    this.releaseVehicleSeat(v, p);
    p.inVehicle = null;
    p.seat = null;
    const spot = this.placePlayerBeside(p, v);
    p.x = spot.x;
    p.y = spot.y;
    p.z = spot.z;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.lastInputAt = Date.now();
    this.sendTo(p, { t: 'exited', pos: spot, vehicle: this.vehicleSnapshot(v) });
    this.broadcast({ t: 'vehExit', vid: v.id, player: p.id });
  }

  forceExitVehicle(p) {
    if (!p.inVehicle) return;
    const v = this.vehicle(p.inVehicle);
    if (v) this.releaseVehicleSeat(v, p);
    p.inVehicle = null;
    p.seat = null;
    this.broadcast({ t: 'vehExit', vid: v ? v.id : null, player: p.id });
  }

  syncOccupant(p) {
    const v = this.vehicle(p.inVehicle);
    if (!v) {
      p.inVehicle = null;
      p.seat = null;
      return;
    }
    const seat = seatPosition(v, p.seat);
    p.x = seat.x;
    p.z = seat.z;
    p.y = seat.y;
    p.crouch = false;
    p.moving = false;
    p.sprint = false;
    p.swim = false;
  }

  onVehicleState(p, msg) {
    if (!p.inVehicle) return;
    const v = this.vehicle(p.inVehicle);
    if (!v || v.driver !== p.id) return;
    const now = Date.now();
    const dt = clamp((now - (v.lastUpdate || now)) / 1000, 0.03, 0.3);
    v.lastUpdate = now;
    const x = num(msg.x, v.x);
    const z = num(msg.z, v.z);
    if (Math.abs(x) > 780 || Math.abs(z) > 780) return;
    const d = Math.hypot(x - v.x, z - v.z);
    const maxStep = VEHICLES[v.type].maxSpeed * dt * 2.6 + 5;
    if (d > maxStep) {
      this.sendTo(p, { t: 'vehCorrect', vehicle: this.vehicleSnapshot(v) });
      return;
    }
    v.x = x;
    v.z = z;
    v.ry = num(msg.ry, v.ry);
    v.rx = clamp(num(msg.rx, 0), -0.6, 0.6);
    v.rz = clamp(num(msg.rz, 0), -0.6, 0.6);
    const maxAllowedSpeed = (VEHICLES[v.type].boostSpeed || VEHICLES[v.type].maxSpeed) + 2;
    v.speed = clamp(num(msg.speed, 0), -12, maxAllowedSpeed);
    if (v.type === 'boat') {
      const seabed = terrainHeightAt(v.x, v.z);
      v.y = seabed > 0.2 ? seabed + 0.25 : WORLD.waterLevel + 0.28;
    } else {
      const ground = heightAt(v.x, v.z);
      v.y = Math.max(WORLD.waterLevel + 0.3, ground + 0.35);
    }
    for (const id of [v.driver, v.passenger, v.passenger2]) {
      if (!id) continue;
      const occ = this.players.get(id);
      if (occ && occ.inVehicle === v.id) this.syncOccupant(occ);
    }
    // Sürücü dışındaki istemcilere yumuşak takip için ara durum gönder.
    if (now - (v.broadcastAt || 0) > 80) {
      v.broadcastAt = now;
      this.broadcast({ t: 'vehState', vehicle: this.vehicleSnapshot(v) }, p.id);
    }
  }

  onVehicleReset(p) {
    if (!p.inVehicle) return;
    const v = this.vehicle(p.inVehicle);
    if (!v || v.driver !== p.id) return;
    if (v.type === 'boat') {
      // Tekneyi yakın su noktasına düzelt (tüm haritayı ışınlamadan).
      let found = false;
      for (let r = 3; r <= 24 && !found; r += 3) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const px = clamp(v.x + Math.cos(a) * r, -760, 760);
          const pz = clamp(v.z + Math.sin(a) * r, -760, 760);
          if (terrainHeightAt(px, pz) < -0.4) {
            v.x = px;
            v.z = pz;
            v.y = WORLD.waterLevel + 0.28;
            found = true;
            break;
          }
        }
      }
      if (!found) v.y = Math.max(WORLD.waterLevel + 0.28, terrainHeightAt(v.x, v.z) + 0.25);
    } else {
      const spot = this.findVehicleSpot(v.x, v.z);
      v.x = spot.x;
      v.y = spot.y;
      v.z = spot.z;
    }
    v.rx = 0;
    v.rz = 0;
    v.speed = 0;
    for (const id of [v.driver, v.passenger, v.passenger2]) {
      const occ = this.players.get(id);
      if (occ) this.syncOccupant(occ);
    }
    const snap = this.vehicleSnapshot(v);
    this.sendTo(p, { t: 'vehCorrect', vehicle: snap, reset: true });
    this.broadcast({ t: 'vehState', vehicle: snap }, p.id);
  }

  // --- Bölgeler -----------------------------------------------------------

  updateZones(dt, now) {
    for (const zs of this.zones) {
      const def = this.zoneDef(zs.id);
      let red = 0;
      let blue = 0;
      let redNear = false;
      let blueNear = false;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const d = dist2d(p.x, p.z, def.x, def.z);
        if (d <= def.captureRadius + 28) {
          if (p.team === 'red') redNear = true;
          else blueNear = true;
        }
        if (p.inVehicle) continue;
        if (d <= def.captureRadius) {
          if (p.team === 'red') red++;
          else blue++;
        }
      }
      zs.counts.red = red;
      zs.counts.blue = blue;
      zs.enemyNear = { red: blueNear, blue: redNear };
      zs.contested = red > 0 && blue > 0;
      if (zs.contested) continue;

      const attacker = red > 0 && blue === 0 ? 'red' : blue > 0 && red === 0 ? 'blue' : null;
      const count = attacker === 'red' ? red : blue;

      if (attacker && zs.owner === attacker) {
        if (zs.progress > 0) {
          zs.progress = Math.max(0, zs.progress - 18 * dt);
          if (zs.progress === 0) zs.capturingTeam = null;
        }
        continue;
      }

      if (attacker && zs.owner !== attacker) {
        const isEnemyHq = def.type === 'hq' && def.team !== attacker;
        if (isEnemyHq && this.ownedNonHq(attacker) < MATCH.hqCaptureMinZones) {
          if (now - zs.lastNotice > 6000) {
            zs.lastNotice = now;
            for (const p of this.players.values()) {
              if (p.alive && p.team === attacker && dist2d(p.x, p.z, def.x, def.z) < def.captureRadius + 8) {
                this.sendTo(p, {
                  t: 'notice',
                  text: `Komuta üssünü almak için önce ${MATCH.hqCaptureMinZones} bölgeyi kontrol et.`,
                  warn: true,
                });
              }
            }
          }
          continue;
        }
        const rate = isEnemyHq ? 11 : 16;
        const step = rate * Math.min(3, count) * dt;
        if (zs.capturingTeam && zs.capturingTeam !== attacker && zs.progress > 0) {
          zs.progress = Math.max(0, zs.progress - step);
          if (zs.progress === 0) zs.capturingTeam = attacker;
          continue;
        }
        zs.capturingTeam = attacker;
        zs.progress = Math.min(100, zs.progress + step);
        if (zs.progress >= 100) {
          zs.owner = attacker;
          zs.progress = 0;
          zs.capturingTeam = null;
          this.scores[attacker] += MATCH.captureScore;
          for (const p of this.players.values()) {
            if (p.team === attacker && p.alive && dist2d(p.x, p.z, def.x, def.z) < def.captureRadius + 4) {
              p.captures++;
            }
          }
          this.broadcast({
            t: 'zone',
            id: zs.id,
            owner: attacker,
            name: def.name,
            by: attacker,
            scores: { ...this.scores },
          });
          if (isEnemyHq) {
            this.endMatch(attacker, 'hq');
          }
        }
      } else if (!attacker) {
        zs.progress = Math.max(0, zs.progress - 9 * dt);
        if (zs.progress === 0) zs.capturingTeam = null;
      }
    }
  }

  // --- Maç ----------------------------------------------------------------

  matchSnapshot() {
    const now = Date.now();
    return {
      timeLeft: Math.max(0, (this.match.end - now) / 1000),
      over: this.match.over,
      winner: this.match.winner,
      reason: this.match.reason,
      resetIn: this.match.over ? Math.max(0, (this.match.resetAt - now) / 1000) : 0,
      scores: { ...this.scores },
      duration: MATCH.duration,
    };
  }

  endMatch(winner, reason) {
    if (this.match.over) return;
    this.match.over = true;
    this.match.winner = winner;
    this.match.reason = reason;
    this.match.resetAt = Date.now() + MATCH.restartDelay * 1000;
    const stats = [...this.players.values()]
      .sort((a, b) => b.score - a.score || b.kills - a.kills)
      .slice(0, 6)
      .map((p) => ({ name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, score: p.score }));
    this.broadcast({
      t: 'matchEnd',
      winner,
      reason,
      scores: { ...this.scores },
      stats,
      resetIn: MATCH.restartDelay,
    });
    console.log('[game] maç bitti:', winner || 'berabere', reason, this.scores);
  }

  resetMatch() {
    const now = Date.now();
    this.match = this.freshMatch();
    this.scores = { red: 0, blue: 0 };
    for (const zs of this.zones) {
      const def = this.zoneDef(zs.id);
      zs.owner = def.team;
      zs.capturingTeam = null;
      zs.progress = 0;
      zs.contested = false;
      zs.counts = { red: 0, blue: 0 };
      zs.enemyNear = { red: false, blue: false };
      zs.lastNotice = 0;
    }
    for (const v of this.vehicles) {
      v.driver = null;
      v.passenger = null;
      v.passenger2 = null;
      v.x = v.home.x;
      v.y = v.home.y;
      v.z = v.home.z;
      v.ry = v.home.ry;
      v.rx = 0;
      v.rz = 0;
      v.speed = 0;
    }
    for (const p of this.players.values()) {
      p.inVehicle = null;
      p.seat = null;
      p.alive = false;
      p.kills = 0;
      p.deaths = 0;
      p.score = 0;
      p.captures = 0;
      p.streak = 0;
      p.respawnAt = 0;
      this.spawnPlayer(p, p.weapon);
    }
    this.broadcast({
      t: 'matchReset',
      match: this.matchSnapshot(),
      zones: this.zonesSnapshot(),
      vehicles: this.vehiclesSnapshot(),
      players: this.playersSnapshot(),
      serverNow: Date.now(),
    });
    console.log('[game] yeni maç başladı');
  }

  // --- Botlar -------------------------------------------------------------

  ensureBots() {
    for (const team of ['red', 'blue']) {
      let members = [...this.players.values()].filter((p) => p.team === team);
      while (members.length > TARGET_TEAM) {
        const bot = members.find((p) => p.bot);
        if (!bot) break;
        this.removePlayer(bot.id, false, true);
        members = [...this.players.values()].filter((p) => p.team === team);
      }
      let need = TARGET_TEAM - members.length;
      while (need > 0 && this.players.size < MAX_PLAYERS) {
        this.addBot(team);
        need--;
      }
    }
  }

  addBot(team) {
    if (this.players.size >= MAX_PLAYERS) return;
    const bot = createBotPlayer(this, team);
    this.players.set(bot.id, bot);
    this.spawnPlayer(bot, bot.weapon);
    this.broadcast({ t: 'joined', player: this.playerSnapshot(bot) });
  }

  removePlayer(id, disconnect = false, skipEnsureBots = false) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.inVehicle) this.forceExitVehicle(p);
    this.players.delete(id);
    for (const other of this.players.values()) {
      if (other.bot && other.enemyId === id) other.enemyId = null;
    }
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.personal && v.ownerId === id) {
        for (const occId of [v.driver, v.passenger]) {
          if (!occId) continue;
          const occ = this.players.get(occId);
          if (occ) this.onExit(occ);
        }
        this.vehicles.splice(i, 1);
      }
    }
    if (p.ws) p.ws.player = null;
    this.broadcast({ t: 'left', id, name: p.name });
    if (!disconnect) console.log('[game] bot ayrıldı:', p.name);
    if (!skipEnsureBots) this.ensureBots();
  }

  // --- Ana döngü ----------------------------------------------------------

  tick() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;

    if (!this.match.over && now >= this.match.end) {
      const winner = this.scores.red === this.scores.blue ? null : this.scores.red > this.scores.blue ? 'red' : 'blue';
      this.endMatch(winner, 'time');
    }
    if (this.match.over && now >= this.match.resetAt) {
      this.resetMatch();
    }

    for (const p of this.players.values()) {
      if (p.reloadingUntil && now >= p.reloadingUntil) this.completeReload(p);
      if (p.spawnProtectUntil && now > p.spawnProtectUntil) p.spawnProtectUntil = 0;
      if (!p.alive) {
        if (p.bot && now >= p.respawnAt) this.respawnPlayer(p, randomBotWeapon());
        else if (!p.bot && p.respawnAt && now > p.respawnAt + 20000) this.respawnPlayer(p);
        continue;
      }
      if (p.bot) {
        botTick(this, p, now, dt);
      } else if (p.inVehicle) {
        this.syncOccupant(p);
      } else if (now - p.lastInputAt > 2500) {
        p.moving = false;
        p.sprint = false;
      }
    }

    this.zoneAcc += dt;
    if (this.zoneAcc >= 0.1) {
      if (!this.match.over) this.updateZones(this.zoneAcc, now);
      this.zoneAcc = 0;
    }

    this.scoreAcc += dt;
    if (this.scoreAcc >= 1) {
      this.scoreAcc = 0;
      if (!this.match.over) {
        for (const zs of this.zones) {
          const def = this.zoneDef(zs.id);
          if (def.type === 'hq') continue;
          if (zs.owner) this.scores[zs.owner] += MATCH.holdScorePerSecond;
        }
        if (this.scores.red >= MATCH.scoreLimit || this.scores.blue >= MATCH.scoreLimit) {
          const winner = this.scores.red === this.scores.blue ? null : this.scores.red > this.scores.blue ? 'red' : 'blue';
          this.endMatch(winner, 'score');
        }
      }
    }
  }

  // --- Snapshot -----------------------------------------------------------

  playerSnapshot(p) {
    return {
      id: p.id,
      name: p.name,
      team: p.team,
      weapon: p.weapon,
      x: r2(p.x),
      y: r2(p.y),
      z: r2(p.z),
      yaw: r2(p.yaw),
      pitch: r2(p.pitch),
      hp: Math.round(p.hp),
      alive: p.alive,
      crouch: !!p.crouch,
      aim: !!p.aim,
      move: !!p.moving,
      sprint: !!p.sprint,
      swim: !!p.swim,
      veh: p.inVehicle,
      seat: p.seat,
      bot: !!p.bot,
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      protect: p.spawnProtectUntil > Date.now(),
    };
  }

  playersSnapshot() {
    return [...this.players.values()].map((p) => this.playerSnapshot(p));
  }

  vehicleSnapshot(v) {
    return {
      id: v.id,
      type: v.type,
      x: r2(v.x),
      y: r2(v.y),
      z: r2(v.z),
      ry: r2(v.ry),
      rx: r2(v.rx),
      rz: r2(v.rz),
      speed: r2(v.speed),
      driver: v.driver,
      passenger: v.passenger,
      passenger2: v.passenger2 || null,
      personal: !!v.personal,
    };
  }

  vehiclesSnapshot() {
    return this.vehicles.map((v) => this.vehicleSnapshot(v));
  }

  zonesSnapshot() {
    return this.zones.map((zs) => {
      const def = this.zoneDef(zs.id);
      return {
        id: zs.id,
        owner: zs.owner,
        capturingTeam: zs.capturingTeam || null,
        progress: Math.round(zs.progress * 10) / 10,
        contested: zs.contested,
        red: zs.counts.red,
        blue: zs.counts.blue,
        enemyNear: zs.enemyNear || { red: false, blue: false },
        x: def.x,
        z: def.z,
        radius: def.captureRadius,
        name: def.name,
        type: def.type,
      };
    });
  }

  selfSnapshot(p) {
    return {
      id: p.id,
      hp: Math.round(p.hp),
      ammo: p.ammo,
      reserve: p.reserve,
      weapon: p.weapon,
      primaryWeapon: p.primaryWeapon || p.weapon,
      slots: p.loadout || null,
      spawnZoneId: p.spawnZoneId || null,
      alive: p.alive,
      reloading: p.reloadingUntil > Date.now(),
      reloadEnd: p.reloadingUntil,
      inVeh: p.inVehicle,
      seat: p.seat,
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      streak: p.streak,
      respawnAt: p.respawnAt,
      protect: p.spawnProtectUntil > Date.now(),
      swim: !!p.swim,
    };
  }

  broadcastSnapshot() {
    const base = {
      t: 'snap',
      now: Date.now(),
      match: this.matchSnapshot(),
      players: this.playersSnapshot(),
      vehicles: this.vehiclesSnapshot(),
      zones: this.zonesSnapshot(),
    };
    for (const ws of this.clients) {
      if (!ws.player || ws.readyState !== 1) continue;
      const msg = { ...base, you: this.selfSnapshot(ws.player) };
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        // yoksay
      }
    }
  }

  onChat(ws, p, msg) {
    const now = Date.now();
    if (now - (p.lastChatAt || 0) < 800) return;
    p.lastChatAt = now;
    let text = typeof msg.text === 'string' ? msg.text.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120) : '';
    if (!text) return;
    const scope = msg.scope === 'team' ? 'team' : 'all';
    const payload = { t: 'chat', from: p.name, team: p.team, text, scope };
    if (scope === 'team') {
      const raw = JSON.stringify(payload);
      for (const client of this.clients) {
        if (!client.player || client.player.team !== p.team || client.readyState !== 1) continue;
        try {
          client.send(raw);
        } catch {
          // yoksay
        }
      }
      return;
    }
    this.broadcast(payload);
  }

  status() {
    return {
      online: this.humanCount(),
      bots: this.players.size - this.humanCount(),
      total: this.players.size,
      teams: {
        red: [...this.players.values()].filter((p) => p.team === 'red').length,
        blue: [...this.players.values()].filter((p) => p.team === 'blue').length,
      },
      match: this.matchSnapshot(),
      uptime: Math.round((Date.now() - this.startedAt) / 1000),
    };
  }
}
