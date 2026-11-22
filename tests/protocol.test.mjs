// Sunucu protokolü ve yetkili oyun kuralları için duman testleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { Game } from '../server/game.js';
import { MATCH, PLAYER, VEHICLES } from '../shared/config.js';
import { ZONES, ROCKS, TREES, PALMS, OBSTACLES, isBlocked, resolveObstacleCollisions } from '../shared/map.js';
import { weaponFor } from '../shared/weapons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3199;
const HTTP_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeout = 12000) {
  const end = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch (err) {
      lastError = err;
    }
    await delay(100);
  }
  throw new Error(`Zaman aşımı${lastError ? `: ${lastError.message}` : ''}`);
}

class TestClient {
  constructor(ws) {
    this.ws = ws;
    this.messages = [];
    this.waiters = [];
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const index = this.waiters.findIndex((w) => w.type === msg.t && (!w.predicate || w.predicate(msg)));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        this.messages.push(msg);
      }
    });
  }

  static async connect() {
    const ws = new WebSocket(WS_URL);
    const client = new TestClient(ws);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return client;
  }

  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }

  next(type, predicate = null, timeout = 5000) {
    const index = this.messages.findIndex((m) => m.t === type && (!predicate || predicate(m)));
    if (index >= 0) return Promise.resolve(this.messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { type, predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error(`Mesaj beklenirken zaman aşımı: ${type}`));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  async nextSnap(predicate, timeout = 5000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const snap = await this.next('snap', null, Math.max(200, end - Date.now()));
      if (predicate(snap)) return snap;
    }
    throw new Error('Uygun snapshot bulunamadı');
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // yoksay
    }
  }
}

test('WebSocket protokolü: katılım, hareket, ateş, şarjör, araç ve sohbet', { timeout: 40000 }, async (t) => {
  let server = null;
  let client = null;
  let serverLog = '';

  t.after(async () => {
    client?.close();
    if (server && server.exitCode === null) {
      server.kill();
      await Promise.race([once(server, 'exit'), delay(3000)]);
      if (server.exitCode === null) server.kill('SIGKILL');
    }
  });

  server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (data) => {
    serverLog += data.toString();
  });
  server.stderr.on('data', (data) => {
    serverLog += data.toString();
  });

  await waitFor(async () => {
    const res = await fetch(`${HTTP_URL}/api/status`);
    return res.ok;
  }, 15000).catch((err) => {
    throw new Error(`Sunucu başlamadı: ${err.message}\n${serverLog}`);
  });

  const status = await (await fetch(`${HTTP_URL}/api/status`)).json();
  assert.equal(status.online, 0);
  assert.equal(status.total, 0);

  client = await TestClient.connect();
  const hello = await client.next('hello');
  assert.equal(hello.version, 1);
  assert.ok(hello.serverNow > 0);

  client.send({ t: 'join', name: 'ProtokolAskeri', team: 'blue', weapon: 'pistol' });
  const spawned = await client.next('spawned');
  const welcome = await client.next('welcome');

  assert.equal(welcome.id, spawned.you.id);
  assert.equal(welcome.you.weapon, 'pistol');
  assert.equal(welcome.you.alive, true);
  assert.equal(welcome.you.ammo, 12);
  assert.equal(welcome.zones.length, 7);
  assert.ok(welcome.vehicles.length >= 35);
  assert.equal(welcome.players.length, 12);
  assert.equal(welcome.players.filter((p) => p.bot).length, 11);

  const personal = welcome.vehicles.find((v) => v.personal);
  assert.ok(personal, 'Tabanca seçen oyuncunun kişisel scooterı doğmalı');
  const spawnDist = Math.hypot(personal.x - spawned.pos.x, personal.z - spawned.pos.z);
  assert.ok(spawnDist <= VEHICLES.scooter.enterRadius + 3.5);

  const snap0 = await client.nextSnap((s) => s.you && s.you.id === welcome.id);
  const me0 = snap0.players.find((p) => p.id === welcome.id);
  assert.ok(me0);
  assert.equal(me0.team, 'blue');

  const targetX = me0.x + 1;
  client.send({
    t: 'input',
    x: targetX,
    y: me0.y,
    z: me0.z,
    yaw: me0.yaw,
    pitch: 0,
    vx: 0,
    vz: 0,
    moving: true,
  });
  const moved = await client.nextSnap((s) => {
    const p = s.players.find((x) => x.id === welcome.id);
    return p && Math.abs(p.x - targetX) < 0.4;
  });
  const me1 = moved.players.find((p) => p.id === welcome.id);
  assert.ok(Math.abs(me1.x - targetX) < 0.4);

  client.send({
    t: 'input',
    x: me1.x + 120,
    y: me1.y,
    z: me1.z,
    yaw: me1.yaw,
    pitch: 0,
    moving: true,
  });
  const correction = await client.next('correct');
  assert.ok(Math.abs(correction.x - me1.x) < 0.6);
  assert.ok(Math.abs(correction.z - me1.z) < 0.6);

  client.send({ t: 'shoot', dx: 0, dy: 0, dz: -1 });
  const shot = await client.next('shot', (m) => m.s === welcome.id);
  assert.equal(shot.w, 'pistol');
  assert.equal(shot.e.length, 1);
  const afterShot = await client.nextSnap((s) => s.you && s.you.ammo === 11);
  assert.equal(afterShot.you.ammo, 11);

  client.send({ t: 'reload' });
  const reloading = await client.next('reloading');
  assert.ok(reloading.end > Date.now());
  const reloaded = await client.next('reloaded', null, 6000);
  assert.equal(reloaded.ammo, 12);
  assert.equal(reloaded.reserve, 71);

  client.send({ t: 'enter', vid: personal.id });
  const entered = await client.next('entered');
  assert.equal(entered.vehicle.id, personal.id);
  assert.equal(entered.seat, 0);
  const control = await client.next('control');
  assert.equal(control.vid, personal.id);

  const vehX = personal.x + 2;
  client.send({
    t: 'veh',
    id: personal.id,
    x: vehX,
    y: personal.y,
    z: personal.z,
    ry: personal.ry,
    rx: 0,
    rz: 0,
    speed: 8,
  });
  await client.nextSnap((s) => {
    const v = s.vehicles.find((x) => x.id === personal.id);
    return v && Math.abs(v.x - vehX) < 0.5;
  });

  client.send({ t: 'exit' });
  const exited = await client.next('exited');
  assert.equal(exited.vehicle.id, personal.id);
  assert.ok(Math.hypot(exited.pos.x - vehX, exited.pos.z - personal.z) > 0.5);

  client.send({ t: 'chat', text: 'Test mesajı' });
  const chat = await client.next('chat', (m) => m.text === 'Test mesajı');
  assert.equal(chat.from, 'ProtokolAskeri');
  assert.equal(chat.team, 'blue');

  client.send({ t: 'ping', time: 4242 });
  const pong = await client.next('pong');
  assert.equal(pong.time, 4242);
  assert.ok(pong.now > 0);

  const statusAfter = await (await fetch(`${HTTP_URL}/api/status`)).json();
  assert.equal(statusAfter.online, 1);
  assert.equal(statusAfter.bots, 11);
  assert.equal(statusAfter.teams.blue, 6);
  assert.equal(statusAfter.teams.red, 6);
});

class FakeWS extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    this.player = null;
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close');
  }
}

test('Oyun kuralları: bölge ele geçirme, komuta kilidi, tekne koltukları ve ölüm', { timeout: 20000 }, async (t) => {
  const game = new Game();
  clearInterval(game.tickTimer);
  clearInterval(game.snapTimer);

  const ws1 = new FakeWS();
  const ws2 = new FakeWS();
  game.addClient(ws1);
  game.onJoin(ws1, { name: 'Alpha', team: 'blue', weapon: 'pistol' });
  game.addClient(ws2);
  game.onJoin(ws2, { name: 'Bravo', team: 'blue', weapon: 'shotgun' });

  for (const [id, p] of [...game.players.entries()]) {
    if (p.bot) game.players.delete(id);
  }

  const p1 = ws1.player;
  const p2 = ws2.player;
  assert.ok(p1 && p2);
  p1.spawnProtectUntil = 0;
  p2.spawnProtectUntil = 0;

  t.after(() => {
    game.players.clear();
    game.clients.clear();
    ws1.close();
    ws2.close();
  });

  // Tekne iki koltuklu olmalı; sürücü ateş edemez, yolcu edebilir.
  const boat = game.vehicles.find((v) => v.type === 'boat');
  assert.ok(boat, 'Haritada tekne bulunmalı');
  p1.x = boat.x;
  p1.z = boat.z;
  p1.y = boat.y;
  p2.x = boat.x;
  p2.z = boat.z;
  p2.y = boat.y;
  game.onEnter(p1, { vid: boat.id });
  assert.equal(p1.seat, 0);
  game.onEnter(p2, { vid: boat.id });
  assert.equal(p2.seat, 1);

  p1.lastShotAt = 0;
  const shotsBefore = ws1.sent.filter((m) => m.t === 'shot').length;
  game.onShoot(p1, { dx: 0, dy: 0, dz: 1 });
  assert.equal(ws1.sent.filter((m) => m.t === 'shot').length, shotsBefore);

  p2.lastShotAt = 0;
  game.onShoot(p2, { dx: 0, dy: 0, dz: 1 });
  const passengerShot = ws1.sent.find((m) => m.t === 'shot' && m.s === p2.id);
  assert.ok(passengerShot);
  assert.equal(passengerShot.w, 'shotgun');
  assert.equal(passengerShot.e.length, 8);

  game.onExit(p1);
  game.onExit(p2);
  assert.equal(p1.inVehicle, null);
  assert.equal(p2.inVehicle, null);

  // Tarafsız köy, tek oyuncuyla 7 saniyede düşmeli.
  const village = ZONES.find((z) => z.id === 'village');
  const villageState = game.zones.find((z) => z.id === 'village');
  villageState.owner = null;
  villageState.progress = 0;
  villageState.lastNotice = 0;
  game.scores.blue = 0;
  p1.captures = 0;
  p1.team = 'blue';
  p1.alive = true;
  p1.hp = PLAYER.maxHealth;
  p1.inVehicle = null;
  p1.seat = null;
  p1.x = village.x;
  p1.z = village.z;
  p1.y = village.y;
  p2.alive = false;

  for (let i = 0; i < 8; i++) game.updateZones(1, Date.now());
  assert.equal(villageState.owner, 'blue');
  assert.equal(game.scores.blue, MATCH.captureScore);
  assert.equal(p1.captures, 1);

  // Düşman komuta üssü, 3 sivil bölge olmadan ilerlememeli.
  const redHq = game.zones.find((z) => z.id === 'red_hq');
  redHq.owner = 'red';
  redHq.progress = 0;
  redHq.lastNotice = 0;
  p1.x = ZONES.find((z) => z.id === 'red_hq').x;
  p1.z = ZONES.find((z) => z.id === 'red_hq').z;
  game.updateZones(1, Date.now());
  assert.equal(redHq.progress, 0);
  assert.ok(ws1.sent.some((m) => m.t === 'notice' && /3 bölge/.test(m.text)));

  game.zones.find((z) => z.id === 'farm').owner = 'blue';
  game.zones.find((z) => z.id === 'hill').owner = 'blue';
  game.updateZones(1, Date.now());
  assert.ok(redHq.progress > 0);

  // Ölüm ve yeniden doğma akışı.
  p2.alive = true;
  p2.hp = PLAYER.maxHealth;
  p2.team = 'red';
  p2.spawnProtectUntil = 0;
  p2.x = p1.x + 2;
  p2.z = p1.z;
  p2.y = p1.y;
  const deathsBefore = p2.deaths;
  const killed = game.applyDamage(p2, 999, p1, weaponFor('sniper'), true, { x: 0, y: 0, z: 1 });
  assert.equal(killed, true);
  assert.equal(p2.alive, false);
  assert.equal(p2.deaths, deathsBefore + 1);
  assert.ok(p2.respawnAt > Date.now());
  assert.ok(ws2.sent.some((m) => m.t === 'dead' && m.by === p1.id));

  p2.respawnAt = Date.now() - 1;
  game.onRespawn(p2, { weapon: 'sniper' });
  assert.equal(p2.alive, true);
  assert.equal(p2.hp, PLAYER.maxHealth);
  assert.equal(p2.weapon, 'sniper');
  assert.equal(p2.ammo, 5);
  assert.ok(ws2.sent.some((m) => m.t === 'respawn' && m.player.id === p2.id));
});

test('Redcoats.io yükseltmeleri: bölge seçerek doğma, silah hotbar, takım sohbeti, araç düzeltme ve maç sıfırlama', { timeout: 20000 }, async (t) => {
  const game = new Game();
  clearInterval(game.tickTimer);
  clearInterval(game.snapTimer);

  const wsBlue1 = new FakeWS();
  const wsBlue2 = new FakeWS();
  const wsRed1 = new FakeWS();
  game.addClient(wsBlue1);
  game.onJoin(wsBlue1, { name: 'MaviLider', team: 'blue', weapon: 'pistol' });
  game.addClient(wsBlue2);
  game.onJoin(wsBlue2, { name: 'MaviDestek', team: 'blue', weapon: 'shotgun' });
  game.addClient(wsRed1);
  game.onJoin(wsRed1, { name: 'KizilNisanci', team: 'red', weapon: 'sniper' });

  for (const [id, p] of [...game.players.entries()]) {
    if (p.bot) game.players.delete(id);
  }

  const b1 = wsBlue1.player;
  const b2 = wsBlue2.player;
  const r1 = wsRed1.player;
  b1.spawnProtectUntil = 0;
  b2.spawnProtectUntil = 0;
  r1.spawnProtectUntil = 0;

  t.after(() => {
    game.players.clear();
    game.clients.clear();
    wsBlue1.close();
    wsBlue2.close();
    wsRed1.close();
  });

  // 1. Silah Geçiş Kuralı: Oyuncu yalnızca seçtiği ana silah (1) ve varsayılan Uzun Bıçak (knife - 2) arasında geçiş yapabilir; başka ateşli silaha doğmadan geçemez.
  assert.equal(b1.weapon, 'pistol');
  assert.equal(b1.primaryWeapon, 'pistol');
  assert.equal(b1.ammo, 12);
  b1.lastShotAt = 0;
  game.onShoot(b1, { dx: 0, dy: 0, dz: 1 });
  assert.equal(b1.ammo, 11);

  // Seçmediği başka bir ateşli silaha (sniper) hayattayken geçmeye çalışırsa reddedilmeli
  game.onSwitchWeapon(b1, { weapon: 'sniper' });
  assert.equal(b1.weapon, 'pistol', 'Seçilmeyen başka bir ana silaha hayattayken geçilememeli');

  // Varsayılan Uzun Komando Bıçağına (knife) geçiş yapılabilmeli ve aktif şarjör dolumu iptal olmalı
  game.startReload(b1);
  assert.ok(b1.reloadingUntil > Date.now());
  game.onSwitchWeapon(b1, { weapon: 'knife' });
  assert.equal(b1.weapon, 'knife');
  assert.equal(b1.reloadingUntil, 0, 'Bıçağa geçince aktif şarjör dolumu iptal olmalı');

  // Uzun bıçak saldırısı mermi harcamamalı ve yakın mesafede hasar vermeli
  b1.lastShotAt = 0;
  game.onShoot(b1, { dx: 0, dy: 0, dz: 1 });
  assert.equal(b1.ammo, 1);

  // Tekrar ana silahına (pistol) döndüğünde önceki mermi sayısı (11) korunmalı
  game.onSwitchWeapon(b1, { weapon: 'pistol' });
  assert.equal(b1.weapon, 'pistol');
  assert.equal(b1.ammo, 11, 'Ana silahtaki mermi sayısı korunmalı');

  // 2. Bölge seçerek yeniden doğma (Respawn Map) ve yeni ana silah seçimi
  const harborState = game.zones.find((z) => z.id === 'harbor');
  const harborDef = ZONES.find((z) => z.id === 'harbor');
  harborState.owner = 'blue';

  b1.alive = false;
  b1.respawnAt = Date.now() - 1;
  game.onRespawn(b1, { weapon: 'lmg', zone: 'harbor' });
  assert.equal(b1.alive, true);
  assert.equal(b1.weapon, 'lmg');
  assert.equal(b1.primaryWeapon, 'lmg');
  assert.equal(b1.spawnZoneId, 'harbor');
  assert.ok(Math.hypot(b1.x - harborDef.x, b1.z - harborDef.z) <= harborDef.captureRadius + 6);

  // Düşman bölgesinde doğma isteği takımın kendi bölgesine/komutasına geri düşmeli
  b1.alive = false;
  b1.respawnAt = Date.now() - 1;
  game.onRespawn(b1, { weapon: 'pistol', zone: 'red_hq' });
  assert.equal(b1.alive, true);
  assert.notEqual(b1.spawnZoneId, 'red_hq');

  // 3. Genel sohbet (Enter) vs Takım sohbeti (T) izolasyonu
  b1.lastChatAt = 0;
  wsBlue2.sent.length = 0;
  wsRed1.sent.length = 0;
  game.onChat(wsBlue1, b1, { text: 'Mavi gizli plan', scope: 'team' });
  assert.ok(wsBlue2.sent.some((m) => m.t === 'chat' && m.text === 'Mavi gizli plan' && m.scope === 'team'));
  assert.ok(!wsRed1.sent.some((m) => m.t === 'chat' && m.text === 'Mavi gizli plan'), 'Takım sohbeti rakip takıma gitmemeli');

  b1.lastChatAt = 0;
  game.onChat(wsBlue1, b1, { text: 'Herkese selam', scope: 'all' });
  assert.ok(wsRed1.sent.some((m) => m.t === 'chat' && m.text === 'Herkese selam'));

  // 4. 3 Kişilik Hücum Botu (tek kişi de kullanabilir, 3 oyuncu binebilir) ve koltuk devri
  const boat = game.vehicles.find((v) => v.type === 'boat');
  b1.x = boat.x; b1.y = boat.y; b1.z = boat.z;
  b2.x = boat.x; b2.y = boat.y; b2.z = boat.z;
  r1.x = boat.x; r1.y = boat.y; r1.z = boat.z;
  game.onEnter(b1, { vid: boat.id });
  assert.equal(b1.seat, 0, 'Tek oyuncu tekneyi sürücü olarak kullanabilmeli');
  game.onEnter(b2, { vid: boat.id });
  assert.equal(b2.seat, 1, '2. oyuncu ön nişancı koltuğuna binebilmeli');
  game.onEnter(r1, { vid: boat.id });
  assert.equal(r1.seat, 2, '3. oyuncu arka nişancı koltuğuna binebilmeli');
  assert.ok(b1.y > boat.y + 0.7, 'Araçtaki karakterin Y konumu koltuk yüksekliğinde olmalı');

  // Araç düzeltme (R) tüm haritayı ışınlamamalı
  boat.x = 300;
  boat.z = 520;
  game.onVehicleReset(b1);
  assert.ok(Math.hypot(boat.x - 300, boat.z - 520) <= 30, 'Araç düzeltme yakın çevrede kalmalı');

  wsBlue2.sent.length = 0;
  game.onExit(b1);
  assert.equal(boat.driver, b2.id);
  assert.equal(b2.seat, 0);
  assert.equal(r1.seat, 1, 'Sürücü inince 3. koltuktaki yolcu 2. koltuğa kaymalı');
  assert.ok(wsBlue2.sent.some((m) => m.t === 'control' && m.vid === boat.id));
  game.onExit(b2);
  game.onExit(r1);

  // 5. Çatışmalı bölgede ilerlemenin donması ve takım ölüm skoru
  const farmState = game.zones.find((z) => z.id === 'farm');
  const farmDef = ZONES.find((z) => z.id === 'farm');
  farmState.owner = null;
  farmState.progress = 0;
  farmState.capturingTeam = null;

  b1.x = farmDef.x; b1.z = farmDef.z; b1.y = farmDef.y;
  r1.x = 0; r1.z = 0;
  game.updateZones(2, Date.now());
  const progBeforeContest = farmState.progress;
  assert.ok(progBeforeContest > 0);
  assert.equal(farmState.capturingTeam, 'blue');

  // Kızıl oyuncu da bölgeye girince çatışma olur ve ilerleme erimez (donar)
  r1.x = farmDef.x + 2; r1.z = farmDef.z; r1.y = farmDef.y;
  game.updateZones(2, Date.now());
  assert.equal(farmState.contested, true);
  assert.equal(farmState.progress, progBeforeContest);

  // Takım öldürme skoru ve yeniden konuşlanma (J)
  const blueTeamScoreBefore = game.scores.blue;
  b1.spawnProtectUntil = 0;
  r1.spawnProtectUntil = 0;
  game.applyDamage(r1, 500, b1, weaponFor('sniper'), true, { x: 1, y: 0, z: 0 });
  assert.equal(game.scores.blue, blueTeamScoreBefore + MATCH.killScore);

  b1.lastRedeployAt = 0;
  game.onRedeploy(b1);
  assert.equal(b1.alive, false);

  // 6. Maç sıfırlama (resetMatch)
  game.resetMatch();
  assert.equal(game.scores.red, 0);
  assert.equal(game.scores.blue, 0);
  assert.equal(b1.alive, true);
  assert.equal(b1.kills, 0);

  // 7. Kaya, ağaç, palmiye ve yapı çarpışma bütünlüğü (hiçbir taşın içinden geçilemez)
  assert.equal(ROCKS.length, 120);
  assert.equal(TREES.length, 300);
  assert.ok(PALMS.length > 0);
  for (const o of OBSTACLES) {
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z), `Engel koordinatı geçersiz: ${o.id}`);
    assert.ok(Number.isFinite(o.r) && o.r > 0, `Engel yarıçapı geçersiz: ${o.id}`);
  }
  for (const rock of ROCKS) {
    assert.ok(rock.r >= Math.max(rock.rx, rock.rz), 'Kaya çarpışma yarıçapı görsel boyutunu kapsamalı');
    assert.equal(isBlocked(rock.x, rock.z, PLAYER.radius), true, `Kaya #${rock.id} merkezi bloklu olmalı`);
    // Kayanın içine adım atmaya çalışan oyuncu her açıdan dışarı itilmeli
    for (const ang of [0, 1.1, 2.3, 3.7, 5.1]) {
      const testX = rock.x + Math.cos(ang) * (rock.r * 0.4);
      const testZ = rock.z + Math.sin(ang) * (rock.r * 0.4);
      const res = resolveObstacleCollisions(testX, testZ, PLAYER.radius);
      assert.equal(res.hit, true);
      const distFromRock = Math.hypot(res.x - rock.x, res.z - rock.z);
      assert.ok(distFromRock >= rock.r + PLAYER.radius - 1e-4, `Kaya #${rock.id} içinden geçilememeli`);
    }
  }
  // Sunucu onInput da oyuncuyu taşın içinden dışarı itmeli
  const sampleRock = ROCKS[0];
  b1.x = sampleRock.x + sampleRock.r + 1.0;
  b1.z = sampleRock.z;
  b1.lastInputAt = Date.now() - 50;
  game.onInput(b1, { x: sampleRock.x + 0.2, y: sampleRock.y, z: sampleRock.z, yaw: 0, pitch: 0 });
  assert.ok(
    Math.hypot(b1.x - sampleRock.x, b1.z - sampleRock.z) >= sampleRock.r + PLAYER.radius - 1e-4,
    'Sunucu da oyuncunun kayanın içine girmesini engellemeli',
  );

  // 8. Twitter yüksek trafik koruması: 24 kişi varsayılan KIZILLAR (red) takımıyla tıklasa bile botlar tahliye edilmeli ve 12+ kişi otomatik MAVİLER'e dengelenmeli
  const crowdGame = new Game('ADA-CROWD');
  clearInterval(crowdGame.tickTimer);
  clearInterval(crowdGame.snapTimer);
  const crowdSockets = [];
  for (let i = 1; i <= 24; i++) {
    const cws = new FakeWS();
    crowdSockets.push(cws);
    crowdGame.addClient(cws);
    crowdGame.onJoin(cws, { name: `TwitterUser${i}`, team: 'red', weapon: 'pistol' });
    assert.ok(cws.player, `Twitter ziyaretçisi #${i} "Takım dolu" hatası almadan oyuna girebilmeli`);
  }
  assert.equal(crowdGame.humanCount(), 24, '24 ziyaretçinin tamamı odaya kabul edilmeli');
  assert.equal(crowdGame.teamCount('red'), 12, 'Kızıl takım 12 kişide dengelenmeli');
  assert.equal(crowdGame.teamCount('blue'), 12, 'Fazla ziyaretçiler otomatik Mavi takıma dengelenmeli');
  for (const cws of crowdSockets) cws.close();
  crowdGame.destroy();
});
