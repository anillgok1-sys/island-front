// Island Front istemcisi: sahne, yerel fizik, 1./3. şahıs kamera, silah hotbar, araçlar ve ağ akışı.
import * as THREE from '/vendor/three.module.js';
import { PLAYER, TEAMS, WORLD, clamp } from '/shared/config.js';
import {
  heightAt, slopeAt, queryObstacles, OBSTACLE_HASH,
  resolveObstacleCollisions, raySphere, terrainRay, rayObstacle,
} from '/shared/map.js';
import { WEAPONS, WEAPON_ORDER, weaponFor } from '/shared/weapons.js';
import { World } from './world.js';
import { CharacterManager } from './characters.js';
import { VehicleSystem } from './vehicles.js';
import { WeaponSystem } from './weapons.js';
import { HUD } from './hud.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { AudioSystem } from './audio.js';

const BASE_FOV = 78;
const BASE_MOUSE_SENS = 0.0021;

// Yaya fizik ayarları
const TERMINAL_FALL = 55;
const SLOPE_SLIDE_MIN = 0.8;
const SLOPE_SLIDE_MAX = 7;

// Yerel sürücünün oturma noktaları: araç lokal uzayında KALÇA/sele hizası.
const RIDER_ANCHORS = {
  scooter: { x: 0, y: 0.84, z: -0.24 },
  boat: { x: 0, y: 0.92, z: 0.35 },
};

const _zeroMouse = { dx: 0, dy: 0 };
const _obsOut = [];
const _shootDir = new THREE.Vector3();
const _shootOrigin = new THREE.Vector3();
const _camTarget = new THREE.Vector3();

function localSpreadDir(dir, spread) {
  if (spread <= 0) return dir.clone();
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
  return new THREE.Vector3(
    dir.x + (rx * Math.cos(a) + ux * Math.sin(a)) * r,
    dir.y + (ry * Math.cos(a) + uy * Math.sin(a)) * r,
    dir.z + (rz * Math.cos(a) + uz * Math.sin(a)) * r,
  ).normalize();
}

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      BASE_FOV,
      window.innerWidth / window.innerHeight,
      0.08,
      4200,
    );
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.clock = new THREE.Clock();
    this.audio = new AudioSystem();
    this.net = new Net();
    this.input = new Input(this.canvas);
    this.world = new World(this.scene, this.renderer);
    this.characters = new CharacterManager(this.scene);
    this.vehicles = new VehicleSystem(this.scene, this.net, this.audio);
    this.weapons = new WeaponSystem(this.scene, this.camera, this.audio);
    this.weapons.root.visible = false;
    this.idleInput = { down: () => false };

    this.mouseSens = BASE_MOUSE_SENS;
    this.quality = 'normal';
    this.thirdPerson = false;
    this.autoRun = false;

    this.localId = null;
    this.pendingJoin = null;
    this.pendingSpawn = null;
    this.joined = false;
    this.leaving = false;
    this.matchOver = false;
    this.deathShown = false;

    this.snapshot = null;
    this.you = null;
    this.alive = false;
    this.localPos = new THREE.Vector3(0, 12, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.swimming = false;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;

    this.weaponId = 'pistol';
    this.primaryWeaponId = 'pistol';
    this.prevWeaponId = 'knife';
    this.attackPulse = 0;
    this.aiming = false;
    this.scoped = false;
    this.fireCooldown = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.bobPhase = 0;
    this.stepAcc = 0;
    this.slideSpeed = 0;
    this.inputAcc = 0;
    this.vehiclePrompt = null;

    this.inVehicle = null;
    this.seat = null;
    this.controlledVid = null;
    this.vehiclePlayer = { x: 0, y: 0, z: 0, yaw: 0, seat: null };
    this.hudState = {
      localPos: this.localPos,
      yaw: 0,
      heading: 0,
      swimming: false,
      aiming: false,
      scoped: false,
      spread: 0,
      drivingVehicle: null,
      vehiclePrompt: null,
    };

    this.menuAngle = 0;
    this.frameCount = 0;
    this.loadingHidden = false;
    this.frameDt = 0.016;

    this.hud = new HUD({
      audio: this.audio,
      onPlay: (data) => this.startJoin(data),
      onRespawn: (weapon, zoneId) => this.requestRespawn(weapon, zoneId),
      onRedeploy: () => this.requestRedeploy(),
      onSwitchWeapon: (weaponId) => this.switchWeapon(weaponId),
      onToggleView: () => this.toggleThirdPerson(),
      onResume: () => this.input.lock(),
      onLeave: () => this.leaveMatch(),
      onChat: (text, scope) => this.net.send({ t: 'chat', text, scope }),
      onChatOpen: () => {
        this.input.chatOpen = true;
        this.input.unlock();
      },
      onChatClosed: () => {
        this.input.chatOpen = false;
        if (this.joined && this.alive && !this.hud.tacticalMapOpen && !this.hud.settingsOpen) {
          this.input.lock();
        }
      },
      onMapToggled: (open) => {
        if (open) {
          this.hud.hidePause();
          this.input.unlock();
        } else if (this.joined && this.alive && !this.hud.chatOpen && !this.hud.settingsOpen) {
          this.input.lock();
        }
      },
      onSettingsChanged: (settings) => this.applySettings(settings),
      onZoneOwner: (id, owner) => this.world.setZoneOwner(id, owner),
      getPing: () => this.net.ping,
    });

    this.applySettings(this.hud.settings);
    this.hud.showMenu();
    this.hud.setPlayEnabled(true);
    this.bindNetwork();
    this.bindEvents();
    this.animate();
  }

  // --- Ayarlar ve Grafik Kalitesi -----------------------------------------

  applySettings(s) {
    if (!s) return;
    this.mouseSens = BASE_MOUSE_SENS * clamp(Number(s.sensitivity) || 1.0, 0.2, 3.0);
    this.audio.setVolume((Number(s.volume) ?? 60) / 100);
    this.audio.setMuted(!s.soundEnabled);
    if (!s.autoRunEnabled && this.autoRun) {
      this.autoRun = false;
      this.hud?.setViewMode(this.thirdPerson, this.autoRun);
    }
    if (s.quality && s.quality !== this.quality) {
      this.setQuality(s.quality);
    }
  }

  setQuality(level = 'normal') {
    this.quality = level;
    document.body.classList.toggle('q-low', level === 'low');
    document.body.classList.toggle('q-lowest', level === 'lowest');

    const dpr = window.devicePixelRatio || 1;
    const ratio = level === 'lowest' ? 0.75 : level === 'low' ? 1.0 : Math.min(dpr, 2.0);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const shadowsOn = level !== 'lowest';
    if (this.renderer.shadowMap.enabled !== shadowsOn) {
      this.renderer.shadowMap.enabled = shadowsOn;
      this.scene.traverse((o) => {
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => { m.needsUpdate = true; });
          else o.material.needsUpdate = true;
        }
      });
    }

    this.camera.far = level === 'lowest' ? 1800 : level === 'low' ? 2800 : 4200;
    this.camera.updateProjectionMatrix();
    this.weapons.maxParticles = level === 'lowest' ? 35 : level === 'low' ? 120 : 350;
    this.weapons.viewLight.intensity = level === 'lowest' ? 0 : 2.4;
    this.world.setQuality(level);
  }

  // --- Kurulum ------------------------------------------------------------

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    this.canvas.addEventListener('mousedown', () => {
      if (this.joined && this.alive && !this.input.locked && !this.isOverlayOpen() && !this.hud.chatOpen) {
        this.input.lock();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (!this.joined || this.hud.chatOpen || this.hud.menuVisible) return;
      if (e.code === 'KeyM' && !e.repeat && this.hud.tacticalMapOpen) {
        e.preventDefault();
        this.hud.toggleTacticalMap(false);
      } else if (e.code === 'Escape' && this.hud.tacticalMapOpen) {
        e.preventDefault();
        this.hud.toggleTacticalMap(false);
      } else if (e.code === 'Escape' && this.hud.settingsOpen) {
        e.preventDefault();
        this.hud.closeSettings();
      }
    });
    this.input.onLockChange((locked) => {
      if (locked) {
        this.hud.hidePause();
        if (this.hud.tacticalMapOpen) this.hud.toggleTacticalMap(false);
        if (this.hud.settingsOpen) this.hud.closeSettings();
        return;
      }
      if (!this.joined || this.hud.chatOpen || this.hud.menuVisible) return;
      if (this.hud.tacticalMapOpen || this.hud.settingsOpen) return;
      if (!this.hud.el.respawn.classList.contains('hidden')) return;
      if (!this.hud.el.results.classList.contains('hidden')) return;
      this.hud.showPause();
      this.hud.toggleScoreboard(false);
    });
  }

  bindNetwork() {
    this.net.on('hello', () => {});
    this.net.on('welcome', (m) => this.onWelcome(m));
    this.net.on('spawned', (m) => this.onSpawned(m));
    this.net.on('snap', (m) => this.onSnap(m));
    this.net.on('shot', (m) => this.onShot(m));
    this.net.on('weaponSwitched', (m) => this.onWeaponSwitched(m));
    this.net.on('hitmark', (m) => this.onHitmark(m));
    this.net.on('damage', (m) => this.onDamage(m));
    this.net.on('dead', (m) => this.onDead(m));
    this.net.on('kill', (m) => this.onKill(m));
    this.net.on('zone', (m) => this.onZone(m));
    this.net.on('notice', (m) => this.onNotice(m));
    this.net.on('entered', (m) => this.onEntered(m));
    this.net.on('exited', (m) => this.onExited(m));
    this.net.on('control', (m) => this.onControl(m));
    this.net.on('vehCorrect', (m) => this.onVehCorrect(m));
    this.net.on('vehState', (m) => this.onVehState(m));
    this.net.on('reloading', (m) => this.onReloading(m));
    this.net.on('reloaded', (m) => this.onReloaded(m));
    this.net.on('matchEnd', (m) => this.onMatchEnd(m));
    this.net.on('matchReset', (m) => this.onMatchReset(m));
    this.net.on('correct', (m) => this.onCorrect(m));
    this.net.on('error', (m) => this.onError(m));
    this.net.on('joined', (m) => this.onJoined(m));
    this.net.on('left', (m) => this.onLeft(m));
    this.net.on('chat', (m) => this.hud.addChat(m.from, m.text, m.team, m.scope));
    this.net.on('disconnected', () => this.onDisconnected());
  }

  async startJoin(data) {
    this.pendingJoin = data;
    this.audio.init();
    this.input.reset();
    this.input.lock();
    this.hud.el.menuError.textContent = '';
    this.hud.setPlayEnabled(false);
    try {
      if (!this.net.connected) await this.net.connect();
      this.net.join({ name: data.name, team: data.team, weapon: data.weapon });
    } catch (err) {
      this.input.unlock();
      this.hud.showMenuError(err && err.message ? err.message : 'Sunucuya bağlanılamadı.');
    }
  }

  // --- Sunucu olayları ----------------------------------------------------

  onWelcome(m) {
    this.localId = m.id;
    this.joined = true;
    this.leaving = false;
    this.matchOver = !!m.match.over;
    this.you = m.you;
    this.alive = !!m.you.alive;
    this.weaponId = m.you.weapon || 'pistol';
    this.primaryWeaponId = m.you.primaryWeapon || (this.weaponId !== 'knife' ? this.weaponId : 'pistol');
    this.weapons.setWeapon(this.weaponId);
    this.snapshot = { ...m, t: 'snap' };

    const me = m.players.find((p) => p.id === m.id)
      || { name: this.pendingJoin?.name || 'Asker', team: this.pendingJoin?.team || 'red' };
    this.hud.setIdentity(m.id, me.name, me.team);
    this.hud.setSnapshot(this.snapshot);
    this.vehicles.sync(m.vehicles);
    for (const z of m.zones) this.world.setZoneOwner(z.id, z.owner);

    if (this.pendingSpawn) {
      const spawn = this.pendingSpawn;
      this.localPos.set(spawn.pos.x, spawn.pos.y, spawn.pos.z);
      this.yaw = Math.atan2(-spawn.pos.x, -spawn.pos.z);
      this.you = spawn.you;
      this.alive = !!spawn.you.alive;
      this.weaponId = spawn.you.weapon || this.weaponId;
      this.primaryWeaponId = spawn.you.primaryWeapon || (this.weaponId !== 'knife' ? this.weaponId : this.primaryWeaponId);
      this.weapons.setWeapon(this.weaponId);
      if (spawn.vehicles) this.vehicles.sync(spawn.vehicles);
      this.pendingSpawn = null;
    } else if (typeof me.x === 'number') {
      this.localPos.set(me.x, me.y, me.z);
      this.yaw = me.yaw || 0;
    }
    this.snapshot.you = this.you;
    this.hud.you = this.you;

    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.autoRun = false;
    this.hud.setViewMode(this.thirdPerson, this.autoRun);
    this.input.enabled = true;
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();

    this.hud.showGame();
    this.hud.hideRespawn();
    this.hud.hideResults();
    this.hud.setPlayEnabled(true);
    this.hud.el.menuError.textContent = '';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.audio.ui();
    this.hud.showToast(`${TEAMS[me.team].name} safında savaş!`);

    if (m.match.over) {
      this.hud.showResults({
        winner: m.match.winner,
        reason: m.match.reason,
        scores: m.match.scores,
        stats: [],
        resetIn: m.match.resetIn,
      });
      this.input.unlock();
    } else {
      this.input.lock();
    }
  }

  onSpawned(m) {
    this.you = m.you;
    this.alive = !!m.you.alive;
    this.weaponId = m.you.weapon || this.weaponId;
    this.primaryWeaponId = m.you.primaryWeapon || (this.weaponId !== 'knife' ? this.weaponId : this.primaryWeaponId);
    this.weapons.setWeapon(this.weaponId);
    this.aiming = false;
    this.scoped = false;
    this.autoRun = false;
    this.hud.setViewMode(this.thirdPerson, this.autoRun);
    this.weapons.setAiming(false, false);
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
    this.velocity.set(0, 0, 0);
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.fireCooldown = 0;
    this.weapons.reloadUntil = 0;
    this.inVehicle = null;
    this.seat = null;
    this.controlledVid = null;
    this.vehicles.clearControlled();
    this.characters.hideLocalRider();
    if (m.vehicles) this.vehicles.sync(m.vehicles);

    if (!this.localId) {
      this.pendingSpawn = m;
      return;
    }

    this.localPos.set(m.pos.x, m.pos.y, m.pos.z);
    this.yaw = Math.atan2(-m.pos.x, -m.pos.z);
    this.onGround = false;
    this.swimming = false;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    this.deathShown = false;
    this.input.enabled = true;
    this.hud.you = this.you;
    if (this.snapshot) this.snapshot.you = this.you;
    this.hud.hideRespawn();
    this.hud.hideResults();
    this.hud.hidePause();
  }

  onWeaponSwitched(m) {
    if (!this.you) return;
    this.weaponId = m.weapon;
    if (m.primaryWeapon) this.primaryWeaponId = m.primaryWeapon;
    this.you.weapon = m.weapon;
    this.you.primaryWeapon = this.primaryWeaponId;
    this.you.ammo = m.ammo;
    this.you.reserve = m.reserve;
    this.you.reloading = false;
    if (m.slots) this.you.slots = m.slots;
    this.weapons.reloadUntil = 0;
    this.weapons.setWeapon(this.weaponId);
  }

  onSnap(m) {
    this.snapshot = m;
    this.you = m.you;
    this.alive = !!m.you.alive;
    this.matchOver = !!m.match.over;
    if (m.you.primaryWeapon) this.primaryWeaponId = m.you.primaryWeapon;
    if (m.you.weapon && m.you.weapon !== this.weaponId) {
      this.weaponId = m.you.weapon;
      this.weapons.setWeapon(this.weaponId);
    }
    this.hud.setSnapshot(m);
    this.vehicles.sync(m.vehicles);
    for (const z of m.zones) this.world.setZoneOwner(z.id, z.owner);

    if (m.you.inVeh) {
      this.inVehicle = m.you.inVeh;
      this.seat = m.you.seat;
    } else if (this.inVehicle) {
      this.inVehicle = null;
      this.seat = null;
      this.controlledVid = null;
      this.vehicles.clearControlled();
      this.characters.hideLocalRider();
    }
  }

  onShot(m) {
    this.characters.triggerAttack(m.s);
    if (m.s === this.localId) return;
    this.hud.spotEnemy(m.s, 3500);
    this.weapons.remoteShot(m);
  }

  onHitmark(m) {
    this.hud.showHitmark(!!m.head, !!m.kill);
    this.audio.hit(!!m.head);
  }

  onDamage(m) {
    if (this.you) this.you.hp = m.hp;
    if (m.from) this.hud.spotEnemy(m.from, 4000);
    this.hud.showDamage(m.amount, m.dir, this.yaw);
    this.audio.hurt();
  }

  onDead(m) {
    this.alive = false;
    if (this.you) {
      this.you.alive = false;
      this.you.hp = 0;
    }
    this.deathShown = true;
    this.aiming = false;
    this.scoped = false;
    this.autoRun = false;
    this.hud.setViewMode(this.thirdPerson, this.autoRun);
    this.weapons.setAiming(false, false);
    this.camera.fov = BASE_FOV;
    this.camera.updateProjectionMatrix();
    this.inVehicle = null;
    this.seat = null;
    this.controlledVid = null;
    this.vehicles.clearControlled();
    this.characters.hideLocalRider();
    this.vehiclePrompt = null;
    this.weapons.reloadUntil = 0;
    this.fireCooldown = 0;
    if (this.hud.chatOpen) {
      this.hud.chatOpen = false;
      this.hud.el.chatBox.classList.add('hidden');
      this.input.chatOpen = false;
    }

    const weaponName = m.weapon ? weaponFor(m.weapon).name : 'taktik silah';
    const info = m.redeploy
      ? 'Yeniden konuşlanma başlatıldı — Haritadan doğmak istediğin dost üssü ve ana silahını seç.'
      : m.byName
        ? `${m.byName} seni ${weaponName} ile devirdi. Haritadan konuşlanma üssü seç.`
        : 'Haritadan takımının kontrolündeki yanıp sönen bir üs seç.';
    if (!this.matchOver) this.hud.showRespawn(info, m.respawnAt);
    this.hud.setInteractHint('');
    this.hud.toggleScoreboard(false);
    this.input.unlock();
    this.audio.hurt();
  }

  onKill(m) {
    const players = this.snapshot ? this.snapshot.players : [];
    const killer = players.find((p) => p.id === m.killer);
    const victim = players.find((p) => p.id === m.victim);
    this.hud.addKill({
      ...m,
      killerTeam: killer ? killer.team : null,
      victimTeam: victim ? victim.team : null,
    });
    if (m.killer === this.localId) this.audio.kill();
  }

  onZone(m) {
    this.world.setZoneOwner(m.id, m.owner);
    const teamName = m.owner ? TEAMS[m.owner].name : 'Tarafsız';
    this.hud.addFeed(`${m.name} — ${teamName} kontrolünde.`, m.owner || '');
    const mine = m.owner === this.localTeam();
    this.audio.capture(mine);
    if (mine) this.hud.showToast(`${m.name} ele geçirildi!`);
  }

  onNotice(m) {
    this.hud.addFeed(m.text, m.warn ? 'warn' : '');
  }

  onEntered(m) {
    const v = m.vehicle;
    this.vehicles.sync([v]);
    this.inVehicle = v.id;
    this.seat = m.seat;
    if (this.you) {
      this.you.inVeh = v.id;
      this.you.seat = m.seat;
    }
    this.localPos.set(v.x, v.y, v.z);
    this.yaw = v.ry;
    this.pitch = 0;
    this.velocity.set(0, 0, 0);
    this.autoRun = false;
    this.vehiclePrompt = null;
    this.hud.setInteractHint('');
    this.hud.hidePause();
    this.audio.ui();
    if (m.seat === 0) {
      this.controlledVid = v.id;
      this.vehicles.setControlled(v.id);
    } else {
      this.controlledVid = null;
      this.vehicles.clearControlled();
    }
    this.setupLocalRider();
  }

  onExited(m) {
    this.inVehicle = null;
    this.seat = null;
    this.controlledVid = null;
    this.vehicles.clearControlled();
    this.characters.hideLocalRider();
    this.localPos.set(m.pos.x, m.pos.y, m.pos.z);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.swimming = false;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    if (this.you) {
      this.you.inVeh = null;
      this.you.seat = null;
    }
    if (m.vehicle) this.vehicles.sync([m.vehicle]);
    this.audio.ui();
  }

  onControl(m) {
    if (!this.inVehicle) return;
    this.controlledVid = m.vid;
    this.seat = 0;
    if (this.you) this.you.seat = 0;
    this.vehicles.setControlled(m.vid);
    this.setupLocalRider();
    this.hud.showToast('Araç kontrolü sende.');
  }

  setupLocalRider() {
    this.characters.hideLocalRider();
    if (!this.inVehicle || this.seat !== 0) return;
    const model = this.vehicles.get(this.inVehicle);
    if (!model) return;
    const anchor = RIDER_ANCHORS[model.type] || RIDER_ANCHORS.scooter;
    this.characters.showLocalRider(
      { team: this.localTeam(), weapon: this.weaponId },
      model.group,
      0,
      model.type,
      anchor,
    );
  }

  onVehCorrect(m) {
    const v = m.vehicle;
    if (!v) return;
    this.vehicles.sync([v]);
    this.vehicles.snapTo(v);
    if (this.inVehicle === v.id) {
      this.localPos.set(v.x, v.y, v.z);
      if (this.seat === 0) this.yaw = v.ry;
    }
  }

  onVehState(m) {
    if (m.vehicle) this.vehicles.sync([m.vehicle]);
  }

  onReloading(m) {
    if (this.you) {
      this.you.reloading = true;
      this.you.reloadEnd = m.end;
    }
    this.weapons.startReload(m.duration);
  }

  onReloaded(m) {
    if (this.you) {
      this.you.ammo = m.ammo;
      this.you.reserve = m.reserve;
      this.you.reloading = false;
      if (this.you.slots && this.you.slots[this.weaponId]) {
        this.you.slots[this.weaponId].ammo = m.ammo;
        this.you.slots[this.weaponId].reserve = m.reserve;
      }
    }
    this.weapons.finishReload();
  }

  onMatchEnd(m) {
    this.matchOver = true;
    this.aiming = false;
    this.scoped = false;
    this.autoRun = false;
    this.weapons.setAiming(false, false);
    if (this.snapshot) {
      this.snapshot.match = {
        ...this.snapshot.match,
        over: true,
        winner: m.winner,
        reason: m.reason,
        scores: m.scores,
        resetIn: m.resetIn,
      };
      this.hud.setSnapshot(this.snapshot);
    }
    if (this.hud.chatOpen) {
      this.hud.chatOpen = false;
      this.hud.el.chatBox.classList.add('hidden');
      this.input.chatOpen = false;
    }
    this.hud.showResults(m);
    this.hud.toggleScoreboard(false);
    this.input.unlock();
  }

  onMatchReset(m) {
    this.matchOver = false;
    this.inVehicle = null;
    this.seat = null;
    this.controlledVid = null;
    this.vehicles.clearControlled();
    this.characters.hideLocalRider();
    this.snapshot = { ...m, you: this.you };
    this.hud.hideResults();
    this.hud.setSnapshot(this.snapshot);
    this.vehicles.snapAll(m.vehicles);
    for (const z of m.zones) this.world.setZoneOwner(z.id, z.owner);
    this.hud.hideRespawn();
    this.hud.showPause();
    this.input.unlock();
  }

  onCorrect(m) {
    const d = Math.hypot(m.x - this.localPos.x, m.z - this.localPos.z);
    if (d > 3) {
      this.localPos.set(m.x, m.y, m.z);
      this.velocity.set(0, 0, 0);
    } else {
      this.localPos.x += (m.x - this.localPos.x) * 0.35;
      this.localPos.z += (m.z - this.localPos.z) * 0.35;
      this.localPos.y += (m.y - this.localPos.y) * 0.35;
    }
  }

  onError(m) {
    this.input.unlock();
    const text = m.text || 'Sunucu hatası.';
    if (this.hud.menuVisible) this.hud.showMenuError(text);
    else this.hud.showToast(text, true);
  }

  onJoined(m) {
    if (!this.joined) return;
    if (m.player && !m.player.bot) this.hud.addFeed(`${m.player.name} savaşa katıldı.`);
  }

  onLeft(m) {
    if (!this.joined) return;
    const player = this.snapshot ? this.snapshot.players.find((p) => p.id === m.id) : null;
    if (!player || !player.bot) this.hud.addFeed(`${m.name} ayrıldı.`);
  }

  onDisconnected() {
    if (!this.joined || this.leaving) return;
    this.joined = false;
    this.localId = null;
    this.alive = false;
    this.snapshot = null;
    this.you = null;
    this.inVehicle = null;
    this.seat = null;
    this.controlledVid = null;
    this.pendingSpawn = null;
    this.vehicles.clearControlled();
    this.characters.clear();
    this.input.enabled = false;
    this.input.reset();
    this.input.unlock();
    this.weapons.root.visible = false;
    this.hud.showMenu();
    this.hud.showMenuError('Sunucu bağlantısı koptu. Tekrar bağlanmayı dene.');
    this.hud.setPlayEnabled(true);
  }

  leaveMatch() {
    this.leaving = true;
    this.joined = false;
    this.localId = null;
    this.alive = false;
    this.snapshot = null;
    this.you = null;
    this.inVehicle = null;
    this.seat = null;
    this.controlledVid = null;
    this.pendingSpawn = null;
    this.vehicles.clearControlled();
    this.characters.clear();
    this.input.enabled = false;
    this.input.reset();
    this.input.unlock();
    this.weapons.root.visible = false;
    this.net.close();
    this.hud.showMenu();
    this.hud.setPlayEnabled(true);
    this.leaving = false;
  }

  requestRespawn(weapon, zoneId = null) {
    if (!this.you || this.you.alive) return;
    this.audio.ui();
    this.input.lock();
    this.net.send({ t: 'respawn', weapon, zone: zoneId });
    this.hud.el.deploy.disabled = true;
    setTimeout(() => {
      if (this.joined && this.you && !this.you.alive && !this.hud.el.respawn.classList.contains('hidden')) {
        this.hud.deployEnabled = true;
        this.hud.el.deploy.disabled = false;
      }
    }, 2200);
  }

  requestRedeploy() {
    if (!this.you || !this.alive || this.matchOver) return;
    this.net.send({ t: 'redeploy' });
    this.hud.showToast('Yeniden konuşlanılıyor...');
  }

  switchWeapon(targetId) {
    if (!this.you || !this.alive || this.matchOver) return;
    const primary = this.primaryWeaponId || 'pistol';
    if (targetId !== primary && targetId !== 'knife') {
      this.hud.showToast('Yalnızca seçtiğin ana silahı (1) ve uzun bıçağı (2) kullanabilirsin.');
      return;
    }
    if (!WEAPONS[targetId] || targetId === this.weaponId) return;
    this.prevWeaponId = this.weaponId;
    if (this.you.slots) {
      if (!WEAPONS[this.weaponId].melee) {
        this.you.slots[this.weaponId] = { ammo: this.you.ammo, reserve: this.you.reserve };
      }
      if (this.you.slots[targetId]) {
        this.you.ammo = this.you.slots[targetId].ammo;
        this.you.reserve = this.you.slots[targetId].reserve;
      } else {
        this.you.ammo = WEAPONS[targetId].magSize;
        this.you.reserve = WEAPONS[targetId].reserve;
      }
    }
    this.weaponId = targetId;
    this.you.weapon = targetId;
    this.you.reloading = false;
    this.weapons.reloadUntil = 0;
    this.aiming = false;
    this.scoped = false;
    this.weapons.setAiming(false, false);
    this.weapons.setWeapon(targetId);
    this.fireCooldown = Math.max(this.fireCooldown, 0.16);
    this.audio.weaponSwitch();
    this.net.send({ t: 'switchWeapon', weapon: targetId });
  }

  // --- Girdi --------------------------------------------------------------

  handleLook(mouse) {
    if (!this.input.locked) return;
    if (this.inVehicle && this.seat === 0 && !this.thirdPerson) return;
    const aimingNow = this.input.right && this.alive;
    const fovScale = clamp(this.camera.fov / BASE_FOV, 0.25, 1.2);
    const sens = this.mouseSens * (this.scoped ? 0.38 : aimingNow ? 0.8 : 1) * fovScale;
    this.yaw -= mouse.dx * sens;
    this.pitch -= mouse.dy * sens;
    this.pitch = clamp(this.pitch, -1.42, 1.42);
  }

  toggleThirdPerson() {
    if (!this.alive || this.matchOver) return;
    this.thirdPerson = !this.thirdPerson;
    this.hud.setViewMode(this.thirdPerson, this.autoRun);
    this.audio.ui();
    this.hud.showToast(this.thirdPerson ? '3. Şahıs Görünüm (V)' : '1. Şahıs Görünüm (V)');
  }

  handleActions() {
    if (this.input.pressed('KeyN')) {
      const muted = this.audio.toggleMute();
      this.hud.settings.soundEnabled = !muted;
      this.hud.syncSettingsUI();
      this.hud.showToast(muted ? 'Ses kapatıldı (N)' : 'Ses açıldı (N)');
    }
    if (this.input.pressed('F3')) this.hud.toggleDebug();
    if (this.input.pressed('KeyM')) {
      this.hud.toggleTacticalMap();
      return;
    }
    if (!this.alive || this.matchOver) return;

    if (this.input.pressed('KeyV')) {
      this.toggleThirdPerson();
    }

    if (this.input.pressed('KeyH') && this.hud.settings.autoRunEnabled) {
      this.autoRun = !this.autoRun;
      this.hud.setViewMode(this.thirdPerson, this.autoRun);
      this.hud.showToast(this.autoRun ? 'Otomatik Koşu Açık (H)' : 'Otomatik Koşu Kapalı');
    }

    if (this.input.pressed('KeyJ')) {
      this.requestRedeploy();
      return;
    }

    if (this.input.pressed('Enter')) {
      this.hud.openChat('all');
      return;
    }
    if (this.input.pressed('KeyT')) {
      this.hud.openChat('team');
      return;
    }

    // Silah Geçişi: 1 = Seçili Ana Silah, 2 / Q / Tekerlek = Varsayılan Uzun Komando Bıçağı
    const primary = this.primaryWeaponId || 'pistol';
    if (this.input.pressed('Digit1')) {
      this.switchWeapon(primary);
    } else if (this.input.pressed('Digit2')) {
      this.switchWeapon('knife');
    } else if (this.input.pressed('KeyQ')) {
      this.switchWeapon(this.weaponId === 'knife' ? primary : 'knife');
    } else if (this.input.pressed('Digit3') || this.input.pressed('Digit4')) {
      this.hud.showToast('Yalnızca seçtiğin ana silahı (1) ve uzun bıçağı (2) kullanabilirsin. Doğarken yeni silah seçebilirsin.');
    }

    const wheel = this.input.consumeWheel();
    const scrollMode = this.hud.settings.weaponScroll || 'normal';
    if (wheel !== 0 && scrollMode !== 'off') {
      this.switchWeapon(this.weaponId === 'knife' ? primary : 'knife');
    }

    if (this.input.pressed('KeyE') || this.input.pressed('KeyF')) this.toggleVehicle();
    if (this.input.pressed('KeyR')) {
      if (this.inVehicle && this.seat === 0) {
        this.net.send({ t: 'vehReset' });
        this.hud.showToast('Araç düzeltiliyor.');
      } else {
        this.requestReload();
      }
    }
  }

  toggleVehicle() {
    if (!this.you || !this.alive || this.matchOver) return;
    if (this.inVehicle) {
      this.net.send({ t: 'exit' });
      this.audio.ui();
      return;
    }
    const near = this.vehicles.nearest(this.localPos.x, this.localPos.z);
    if (!near) return;
    this.net.send({ t: 'enter', vid: near.id });
    this.audio.ui();
  }

  // --- Fizik --------------------------------------------------------------

  updateOnFoot(dt) {
    const input = this.input;
    const wDown = input.down('KeyW') || input.down('ArrowUp');
    const sDown = input.down('KeyS') || input.down('ArrowDown');
    if (wDown || sDown) {
      if (this.autoRun && sDown) {
        this.autoRun = false;
        this.hud.setViewMode(this.thirdPerson, this.autoRun);
      }
    }
    const forward = (wDown || this.autoRun ? 1 : 0) - (sDown ? 1 : 0);
    const strafe = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0)
      - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const crouchHeld = input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyC');
    const wasSwimming = this.swimming;
    const wasGrounded = this.onGround;
    const groundHere = heightAt(this.localPos.x, this.localPos.z);
    this.swimming = groundHere < WORLD.waterLevel - 0.9 && this.localPos.y < WORLD.waterLevel + 0.55;
    this.crouching = crouchHeld && !this.swimming;
    this.sprinting = (input.down('ShiftLeft') || this.autoRun) && forward > 0 && !this.crouching && !this.swimming;

    const speedMult = this.weaponId === 'knife' ? 1.12 : 1.0;
    const maxSpeed = (this.swimming
      ? PLAYER.swimSpeed
      : this.crouching
        ? 3.0
        : this.sprinting
          ? PLAYER.sprintSpeed
          : PLAYER.walkSpeed) * (this.swimming ? 1.0 : speedMult);

    let wx = -Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe;
    let wz = -Math.cos(this.yaw) * forward - Math.sin(this.yaw) * strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-4) {
      wx /= wl;
      wz /= wl;
    }

    const accel = this.onGround ? (this.swimming ? 9 : 16) : 3.4;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wx * maxSpeed - this.velocity.x) * k;
    this.velocity.z += (wz * maxSpeed - this.velocity.z) * k;
    if (wl < 1e-4 && this.onGround) {
      const f = Math.exp(-(this.swimming ? 2.2 : 12) * dt);
      this.velocity.x *= f;
      this.velocity.z *= f;
    }

    if (this.onGround && !this.swimming && !this.crouching && input.pressed('Space')) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.onGround = false;
      this.audio.footstep('grass');
    }

    if (this.swimming) {
      const targetY = WORLD.waterLevel - 0.5;
      const buoy = clamp((targetY - this.localPos.y) * 26, -14, 14);
      this.velocity.y += buoy * dt;
      this.velocity.y *= Math.exp(-4.2 * dt);
      if (this.localPos.y > targetY + 1.1) this.velocity.y -= PLAYER.gravity * 0.45 * dt;
    } else {
      this.velocity.y -= PLAYER.gravity * dt;
      if (this.velocity.y < -TERMINAL_FALL) this.velocity.y = -TERMINAL_FALL;
    }

    let slideVX = 0;
    let slideVZ = 0;
    if (this.onGround && !this.swimming) {
      const e = 1.0;
      const gx = (heightAt(this.localPos.x + e, this.localPos.z) - heightAt(this.localPos.x - e, this.localPos.z)) / (2 * e);
      const gz = (heightAt(this.localPos.x, this.localPos.z + e) - heightAt(this.localPos.x, this.localPos.z - e)) / (2 * e);
      const slope = Math.hypot(gx, gz);
      if (slope > SLOPE_SLIDE_MIN) {
        const amount = clamp((slope - SLOPE_SLIDE_MIN) / 0.45, 0, 1);
        const target = SLOPE_SLIDE_MAX * amount;
        this.slideSpeed += (target - this.slideSpeed) * (1 - Math.exp(-3.2 * dt));
        slideVX = (-gx / slope) * this.slideSpeed;
        slideVZ = (-gz / slope) * this.slideSpeed;
      } else {
        this.slideSpeed *= Math.exp(-7 * dt);
      }
    } else {
      this.slideSpeed *= Math.exp(-7 * dt);
    }

    let nx = this.localPos.x + (this.velocity.x + slideVX) * dt;
    let nz = this.localPos.z + (this.velocity.z + slideVZ) * dt;
    nx = clamp(nx, -772, 772);
    nz = clamp(nz, -772, 772);

    const col = resolveObstacleCollisions(nx, nz, PLAYER.radius, this.velocity);
    nx = col.x;
    nz = col.z;

    const targetGround = heightAt(nx, nz);
    if (!this.swimming && targetGround > this.localPos.y + PLAYER.stepHeight && slopeAt(nx, nz) > 0.9) {
      this.velocity.x *= 0.3;
      this.velocity.z *= 0.3;
      const fallbackCol = resolveObstacleCollisions(this.localPos.x, this.localPos.z, PLAYER.radius, this.velocity);
      this.localPos.x = fallbackCol.x;
      this.localPos.z = fallbackCol.z;
    } else {
      this.localPos.x = nx;
      this.localPos.z = nz;
    }

    if (!this.swimming && wasGrounded && this.velocity.y <= 0.01) {
      const stickGround = heightAt(this.localPos.x, this.localPos.z);
      const drop = this.localPos.y - stickGround;
      if (drop > 0 && drop <= PLAYER.stepHeight + 0.08) {
        this.localPos.y = stickGround;
        this.velocity.y = 0;
        this.onGround = true;
      }
    }

    this.localPos.y += this.velocity.y * dt;
    const ground = heightAt(this.localPos.x, this.localPos.z);
    if (this.swimming) {
      if (this.localPos.y < ground) {
        this.localPos.y = ground;
        this.velocity.y = 0;
      }
      this.onGround = false;
    } else if (this.localPos.y <= ground) {
      this.localPos.y = ground;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.moving = speed > 0.5;
    if (this.onGround && !this.swimming && speed > 1.4) {
      this.stepAcc += dt * speed;
      if (this.stepAcc > 2.4) {
        this.stepAcc = 0;
        this.audio.footstep(ground < 2.6 ? 'sand' : 'grass');
      }
    }
    if (this.swimming && !wasSwimming) this.audio.splash();
    this.bobPhase += dt * (this.moving ? (this.sprinting ? 11 : 7.5) : 1.2);
  }

  updateVehicles(dt, canControl) {
    const state = this.vehiclePlayer;
    state.x = this.localPos.x;
    state.y = this.localPos.y;
    state.z = this.localPos.z;
    state.yaw = this.yaw;
    state.seat = this.seat;
    this.vehicles.update(dt, canControl ? this.input : this.idleInput, state, this.camera, this.inVehicle);

    if (!this.inVehicle) return;
    if (this.seat === 0) {
      this.localPos.set(state.x, state.y, state.z);
      if (!this.thirdPerson) this.yaw = state.yaw;
      const model = this.vehicles.get(this.inVehicle);
      this.moving = !!model && Math.abs(model.speed) > 0.5;
      this.sprinting = false;
      this.crouching = false;
      this.swimming = false;
    } else {
      const model = this.vehicles.get(this.inVehicle);
      if (model) {
        this.localPos.set(model.group.position.x, model.group.position.y, model.group.position.z);
        this.moving = Math.abs(model.speed) > 0.5;
      }
      this.sprinting = false;
      this.crouching = false;
      this.swimming = false;
    }
  }

  // --- Silah --------------------------------------------------------------

  updateWeaponState(dt, mouse) {
    if (!this.you) return;
    const weapon = weaponFor(this.weaponId);
    const canAim = this.alive && !(this.inVehicle && this.seat === 0);
    const wantAim = this.input.right && canAim;
    const wantScope = wantAim && weapon.scope;
    this.aiming = wantAim;
    this.scoped = wantScope;
    this.weapons.setAiming(wantAim, wantScope);
    const showFirstPersonGun = this.alive
      && !(this.inVehicle && this.seat === 0)
      && (!this.thirdPerson || this.scoped);
    this.weapons.root.visible = showFirstPersonGun;

    const targetFov = this.scoped
      ? weapon.adsFov
      : wantAim
        ? (weapon.scope ? weapon.adsFov : weapon.adsFov + 6)
        : BASE_FOV;
    if (Math.abs(targetFov - this.camera.fov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-13 * dt));
      this.camera.updateProjectionMatrix();
    }

    this.weapons.update(
      dt,
      this.scoped ? _zeroMouse : mouse,
      this.you,
      this.moving,
      this.sprinting,
    );
  }

  handleCombat(dt) {
    if (!this.you || !this.alive || this.matchOver) return;
    if (this.inVehicle && this.seat === 0) return;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.swimming) return;
    if (this.weapons.reloadUntil && performance.now() < this.weapons.reloadUntil) return;
    const weapon = weaponFor(this.weaponId);
    const wantsFire = weapon.auto ? this.input.left : this.input.leftJust;
    if (!wantsFire || this.fireCooldown > 0) return;
    if (this.you.reloading) return;
    if (!weapon.melee && this.you.ammo <= 0) {
      this.requestReload();
      this.fireCooldown = 0.2;
      return;
    }
    this.tryShoot(weapon);
    this.fireCooldown = (60 / weapon.rpm) * 1.02;
  }

  tryShoot(weapon) {
    this.camera.getWorldDirection(_shootDir);
    const eyeHeight = this.crouching ? 1.12 : PLAYER.eyeHeight;
    _shootOrigin.set(this.localPos.x, this.localPos.y + eyeHeight, this.localPos.z);
    this.net.send({ t: 'shoot', dx: _shootDir.x, dy: _shootDir.y, dz: _shootDir.z });

    const spread = this.computeSpread();
    const hits = [];
    for (let i = 0; i < weapon.pellets; i++) {
      const pDir = weapon.pellets > 1 ? localSpreadDir(_shootDir, spread) : _shootDir;
      hits.push(this.traceLocalShot(_shootOrigin, pDir, weapon.range, weapon.melee ? 0.36 : 0));
    }
    this.weapons.localShot(this.weaponId, _shootDir, _shootOrigin, hits, hits[0]?.type || 'world');
    this.attackPulse = 1.0;
    this.characters.triggerAttack(this.localId);

    this.pitch = clamp(this.pitch + weapon.recoil * 0.5, -1.42, 1.42);
    this.recoilPitch += weapon.recoil * 0.6;
    this.recoilYaw += (Math.random() - 0.5) * weapon.recoil * 0.6;
    if (!weapon.melee) {
      this.you.ammo = Math.max(0, this.you.ammo - 1);
      if (this.you.slots && this.you.slots[this.weaponId]) {
        this.you.slots[this.weaponId].ammo = this.you.ammo;
      }
      if (this.you.ammo === 0 && this.you.reserve > 0) {
        setTimeout(() => {
          if (this.joined && this.alive && this.you && this.you.ammo === 0 && !weaponFor(this.weaponId).melee) {
            this.requestReload();
          }
        }, 240);
      }
    }
  }

  traceLocalShot(origin, dir, range, extraR = 0) {
    let bestT = range;
    let hitPlayer = false;
    const players = this.snapshot ? this.snapshot.players : [];
    const myTeam = this.localTeam();
    for (const p of players) {
      if (p.id === this.localId || !p.alive || p.team === myTeam) continue;
      const crouch = p.crouch ? 0.72 : 1;
      const parts = [
        { y: p.y + 1.62 * crouch, r: 0.26 + extraR },
        { y: p.y + 1.08 * crouch, r: 0.38 + extraR },
        { y: p.y + 0.52 * crouch, r: 0.34 + extraR },
      ];
      for (const part of parts) {
        const t = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, p.x, part.y, p.z, part.r, bestT);
        if (t !== null && t < bestT) {
          bestT = t;
          hitPlayer = true;
        }
      }
    }

    const terrain = terrainRay(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, bestT);
    let worldT = terrain;
    const obstacle = rayObstacle(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, worldT === null ? bestT : worldT);
    if (obstacle !== null && (worldT === null || obstacle < worldT)) worldT = obstacle;

    if (hitPlayer && (worldT === null || bestT < worldT)) {
      return {
        point: new THREE.Vector3(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT),
        type: 'player',
      };
    }
    const t = worldT !== null ? worldT : range;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      type: worldT !== null ? 'world' : 'air',
    };
  }

  requestReload() {
    if (!this.you || !this.alive || this.you.reloading) return;
    const weapon = weaponFor(this.weaponId);
    if (this.you.ammo >= weapon.magSize || this.you.reserve <= 0) return;
    this.net.send({ t: 'reload' });
    this.you.reloading = true;
    this.you.reloadEnd = Date.now() + weapon.reloadTime * 1000;
    this.weapons.startReload(weapon.reloadTime);
  }

  // --- Kamera (1. Şahıs ve Redcoats.io tarzı 3. Şahıs V tuşu) -------------

  updateCamera(dt) {
    this.recoilPitch *= Math.exp(-10 * dt);
    this.recoilYaw *= Math.exp(-10 * dt);

    if (this.inVehicle) {
      const model = this.vehicles.get(this.inVehicle);
      if (model) {
        if (this.seat === 0 && !this.thirdPerson) {
          if (!this.characters.localRider) this.setupLocalRider();
          this.vehicles.chaseCamera(this.camera, dt);
        } else {
          if (this.seat === 0 && this.characters.localRider) this.characters.hideLocalRider();
          const eye = this.vehicles.passengerEye(this.inVehicle, this.seat);
          if (eye) _camTarget.copy(eye);
          else _camTarget.set(this.localPos.x, this.localPos.y + 1.55, this.localPos.z);
          if (this.camera.position.distanceTo(_camTarget) > 18) this.camera.position.copy(_camTarget);
          else this.camera.position.lerp(_camTarget, 1 - Math.exp(-22 * dt));
          this.camera.rotation.order = 'YXZ';
          this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0);
        }
        return;
      }
    }

    const eyeHeight = this.crouching ? 1.12 : PLAYER.eyeHeight;
    const totalPitch = clamp(this.pitch + this.recoilPitch, -1.42, 1.42);
    const totalYaw = this.yaw + this.recoilYaw;

    // 3. Şahıs Omuz Üstü Kamera (V tuşu ile açık ve dürbün kapalıyken: karakterin sağ kolu ve silahı net görünür)
    if (this.thirdPerson && !this.scoped && this.alive) {
      const pivotX = this.localPos.x;
      const pivotY = this.localPos.y + eyeHeight + 0.08;
      const pivotZ = this.localPos.z;
      const dist = this.aiming ? 2.15 : 2.95;
      const rightOff = this.aiming ? 0.66 : 0.78;

      // Kamera bakış yönünün tersine (-forward) ve sağ omuza (+right) yerleştirilir
      const sinY = Math.sin(totalYaw);
      const cosY = Math.cos(totalYaw);
      const cosP = Math.cos(totalPitch);
      const sinP = Math.sin(totalPitch);

      const backX = sinY * cosP;
      const backY = -sinP;
      const backZ = cosY * cosP;
      const rightX = cosY;
      const rightZ = -sinY;

      let desiredX = pivotX + backX * dist + rightX * rightOff;
      let desiredY = pivotY + backY * dist + 0.16;
      let desiredZ = pivotZ + backZ * dist + rightZ * rightOff;

      // Duvar ve arazi çarpışma koruması
      const rayDX = desiredX - pivotX;
      const rayDY = desiredY - pivotY;
      const rayDZ = desiredZ - pivotZ;
      const rayLen = Math.hypot(rayDX, rayDY, rayDZ) || 1;
      const nx = rayDX / rayLen;
      const ny = rayDY / rayLen;
      const nz = rayDZ / rayLen;
      let clipDist = rayLen;
      const tHit = terrainRay(pivotX, pivotY, pivotZ, nx, ny, nz, rayLen);
      if (tHit !== null && tHit < clipDist) clipDist = Math.max(0.45, tHit - 0.25);
      const oHit = rayObstacle(pivotX, pivotY, pivotZ, nx, ny, nz, clipDist);
      if (oHit !== null && oHit < clipDist) clipDist = Math.max(0.45, oHit - 0.25);

      desiredX = pivotX + nx * clipDist;
      desiredY = Math.max(heightAt(desiredX, desiredZ) + 0.35, pivotY + ny * clipDist);
      desiredZ = pivotZ + nz * clipDist;

      this.camera.position.set(desiredX, desiredY, desiredZ);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(totalPitch, totalYaw, 0);
      return;
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const bobScale = this.aiming ? 0.25 : 1;
    const bobAmount = this.onGround && !this.swimming
      ? Math.min(1, speed / PLAYER.walkSpeed) * (this.sprinting ? 0.05 : 0.032) * bobScale
      : 0;
    const bobY = Math.sin(this.bobPhase * 2) * bobAmount;
    const roll = Math.sin(this.bobPhase) * bobAmount * 0.1;
    this.camera.position.set(
      this.localPos.x,
      this.localPos.y + eyeHeight + bobY,
      this.localPos.z,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(totalPitch, totalYaw, roll);
  }

  sendInput(dt) {
    this.inputAcc += dt;
    if (this.inputAcc < 0.05) return;
    this.inputAcc = 0;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.net.send({
      t: 'input',
      x: this.localPos.x,
      y: this.localPos.y,
      z: this.localPos.z,
      yaw: this.yaw,
      pitch: this.pitch,
      vx: this.velocity.x,
      vy: this.velocity.y,
      vz: this.velocity.z,
      moving: this.moving || speed > 0.6,
      sprint: this.sprinting,
      crouch: this.crouching,
      aim: this.aiming,
    });
  }

  computeSpread() {
    const weapon = weaponFor(this.weaponId);
    return (this.aiming ? weapon.spreadAim : weapon.spreadHip)
      + (this.moving ? weapon.spreadMove : 0)
      + (this.sprinting ? 0.025 : 0);
  }

  buildHudState() {
    const s = this.hudState;
    s.localPos = this.localPos;
    s.yaw = this.yaw;
    s.heading = ((-this.yaw * 180) / Math.PI % 360 + 360) % 360;
    s.swimming = this.swimming;
    s.aiming = this.aiming;
    s.scoped = this.scoped;
    s.spread = this.computeSpread();
    s.drivingVehicle = this.inVehicle ? this.vehicles.get(this.inVehicle) : null;
    s.vehiclePrompt = this.vehiclePrompt;
    return s;
  }

  updateVehiclePrompt() {
    if (!this.alive || this.inVehicle || this.matchOver) {
      this.vehiclePrompt = null;
      return;
    }
    const near = this.vehicles.nearest(this.localPos.x, this.localPos.z);
    if (!near) {
      this.vehiclePrompt = null;
      return;
    }
    if (near.type === 'boat') {
      const occ = (near.driver ? 1 : 0) + (near.passenger ? 1 : 0) + (near.passenger2 ? 1 : 0);
      this.vehiclePrompt = occ === 0
        ? 'HÜCUM BOTUNU KULLAN (0/3 · TEK VEYA 3 KİŞİ) [E/F]'
        : `HÜCUM BOTUNA BİN (${occ}/3 · NİŞANCI KOLTUĞU) [E/F]`;
    } else {
      this.vehiclePrompt = 'TAKTİK SCOOTER\'A BİN [E/F]';
    }
  }

  localTeam() {
    if (!this.snapshot) return 'red';
    const me = this.snapshot.players.find((p) => p.id === this.localId);
    return me ? me.team : 'red';
  }

  isOverlayOpen() {
    return !this.hud.el.respawn.classList.contains('hidden')
      || !this.hud.el.results.classList.contains('hidden')
      || !this.hud.el.pause.classList.contains('hidden')
      || this.hud.tacticalMapOpen
      || this.hud.settingsOpen;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  menuCamera(dt) {
    this.menuAngle += dt * 0.04;
    const radius = 560;
    this.camera.position.set(
      Math.cos(this.menuAngle) * radius,
      185 + Math.sin(this.menuAngle * 1.3) * 18,
      Math.sin(this.menuAngle) * radius,
    );
    this.camera.lookAt(0, 22, 0);
    if (Math.abs(this.camera.fov - 62) > 0.01) {
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    }
  }

  // --- Ana döngü ----------------------------------------------------------

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.frameDt = dt;
    const mouse = this.input.consumeMouse();
    this.frameCount++;
    if (!this.loadingHidden && this.frameCount > 2) {
      this.loadingHidden = true;
      this.hud.hideLoading();
    }
    this.audio.updateAmbient();

    if (!this.joined) {
      this.menuCamera(dt);
      this.world.update(dt, this.camera, null);
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    const overlayOpen = this.hud.chatOpen
      || this.hud.tacticalMapOpen
      || this.hud.settingsOpen
      || !this.hud.el.respawn.classList.contains('hidden')
      || !this.hud.el.results.classList.contains('hidden');
    const pauseHidden = this.hud.el.pause.classList.contains('hidden');
    const canControl = (this.input.locked || pauseHidden) && !overlayOpen && !this.matchOver && this.alive;

    if (this.input.pressed('Tab') && !this.hud.chatOpen) this.hud.toggleScoreboard(true);
    if (!this.input.down('Tab')) this.hud.toggleScoreboard(false);

    if (canControl) {
      this.handleLook(mouse);
      this.handleActions();
      if (!this.inVehicle) this.updateOnFoot(dt);
    } else {
      this.moving = false;
      this.sprinting = false;
      this.crouching = false;
    }

    this.updateVehicles(dt, canControl);
    this.updateVehiclePrompt();
    this.updateWeaponState(dt, mouse);
    this.updateCamera(dt);
    if (canControl) this.handleCombat(dt);
    this.sendInput(dt);

    if (this.snapshot) {
      const showLocal3P = this.thirdPerson && !this.scoped && !this.inVehicle && this.alive;
      const local3PState = showLocal3P ? {
        id: this.localId,
        name: this.hud.el.hudName?.textContent || 'Asker',
        team: this.localTeam(),
        weapon: this.weaponId,
        x: this.localPos.x,
        y: this.localPos.y,
        z: this.localPos.z,
        yaw: this.yaw,
        pitch: this.pitch,
        hp: this.you ? this.you.hp : 100,
        alive: this.alive,
        crouch: this.crouching,
        aim: this.aiming,
        move: this.moving,
        sprint: this.sprinting,
        swim: this.swimming,
        veh: null,
        bot: false,
        attackPulse: this.attackPulse,
      } : null;
      this.attackPulse = 0;
      this.characters.update(this.snapshot.players, this.localId, dt, local3PState);
    }

    if (this.characters.localRider) {
      if (!this.inVehicle || this.seat !== 0 || !this.alive || this.thirdPerson) {
        this.characters.hideLocalRider();
      } else {
        const model = this.vehicles.get(this.inVehicle);
        if (model) {
          const maxLean = model.type === 'boat' ? 0.13 : 0.34;
          this.characters.updateLocalRiderRide(dt, model.speed, clamp(-model.lean / maxLean, -1, 1) * 0.35);
        }
      }
    }
    this.world.update(dt, this.camera, this.localPos);
    if (this.you) this.hud.update(dt, this.buildHudState());

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}

const game = new Game();
window.__islandFront = game;
