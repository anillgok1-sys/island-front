// Birinci şahıs silah modelleri, geri tepme, iz ve isabet efektleri.
import * as THREE from '/vendor/three.module.js';
import { weaponFor } from '/shared/weapons.js';
import { heightAt, terrainRay, rayObstacle } from '/shared/map.js';
import { clamp } from '/shared/config.js';

const GUN_MAT = {
  metal: new THREE.MeshStandardMaterial({ color: 0x7c878e, roughness: 0.38, metalness: 0.55, flatShading: true, emissive: 0x20272b, emissiveIntensity: 0.45 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2f363a, roughness: 0.62, metalness: 0.28, flatShading: true, emissive: 0x121618, emissiveIntensity: 0.4 }),
  blade: new THREE.MeshStandardMaterial({ color: 0xe4edf2, roughness: 0.18, metalness: 0.88, flatShading: true, emissive: 0x35424a, emissiveIntensity: 0.45 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.82, flatShading: true, emissive: 0x241609, emissiveIntensity: 0.35 }),
  tan: new THREE.MeshStandardMaterial({ color: 0xa68e63, roughness: 0.68, metalness: 0.15, flatShading: true, emissive: 0x2a2214, emissiveIntensity: 0.38 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xe8b858, roughness: 0.4, metalness: 0.35, flatShading: true, emissive: 0x4a2e08, emissiveIntensity: 0.6 }),
  tritium: new THREE.MeshStandardMaterial({ color: 0x46ff88, emissive: 0x28e066, emissiveIntensity: 1.6 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x302b25, roughness: 0.88, flatShading: true, emissive: 0x120f0c, emissiveIntensity: 0.35 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4b5340, roughness: 0.9, flatShading: true, emissive: 0x151811, emissiveIntensity: 0.35 }),
};

// Silahı kavrayan eldivenli elleri ve kolu ekler; birinci şahıs görünümünü tamamlar.
function addHands(g, gripZ, supportZ, supportX = 0) {
  part(0.105, 0.125, 0.14, 0.015, -0.17, gripZ + 0.03, GUN_MAT.glove, g, [0.18, 0, 0.05]);
  part(0.045, 0.085, 0.07, -0.045, -0.15, gripZ + 0.005, GUN_MAT.glove, g, [0.1, 0, 0.35]);
  part(0.125, 0.13, 0.34, 0.035, -0.21, gripZ + 0.23, GUN_MAT.sleeve, g, [0.22, 0, 0.03]);

  part(0.1, 0.105, 0.16, supportX, -0.13, supportZ, GUN_MAT.glove, g, [0.06, 0, -0.04]);
  part(0.04, 0.075, 0.06, supportX + 0.05, -0.1, supportZ - 0.04, GUN_MAT.glove, g, [0, 0, -0.3]);
  part(0.12, 0.125, 0.32, supportX - 0.02, -0.17, supportZ + 0.21, GUN_MAT.sleeve, g, [0.16, 0, -0.05]);
}

function part(w, h, d, x, y, z, mat, parent, rot = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function cyl(r1, r2, h, x, y, z, mat, parent, rot = null, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m);
  return m;
}

function buildPistol() {
  const g = new THREE.Group();
  part(0.075, 0.085, 0.34, 0, 0.02, -0.08, GUN_MAT.metal, g);
  part(0.07, 0.06, 0.3, 0, -0.04, -0.1, GUN_MAT.dark, g);
  part(0.075, 0.2, 0.11, 0, -0.13, 0.02, GUN_MAT.dark, g, [0.22, 0, 0]);
  part(0.05, 0.05, 0.14, 0, -0.1, -0.12, GUN_MAT.dark, g);
  part(0.02, 0.03, 0.02, 0, 0.08, -0.2, GUN_MAT.accent, g);
  addHands(g, 0.02, -0.03, 0.055);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.27);
  g.add(muzzle);
  return { group: g, muzzle, hip: new THREE.Vector3(0.3, -0.3, -0.72), ads: new THREE.Vector3(0.0, -0.12, -0.46) };
}

function buildShotgun() {
  const g = new THREE.Group();
  part(0.09, 0.12, 0.55, 0, 0, -0.18, GUN_MAT.dark, g);
  cyl(0.035, 0.035, 0.75, 0, 0.045, -0.5, GUN_MAT.metal, g, [Math.PI / 2, 0, 0]);
  cyl(0.05, 0.05, 0.42, 0, -0.045, -0.42, GUN_MAT.metal, g, [Math.PI / 2, 0, 0]);
  part(0.095, 0.07, 0.3, 0, -0.02, 0.16, GUN_MAT.wood, g);
  part(0.1, 0.11, 0.18, 0, -0.01, -0.3, GUN_MAT.tan, g);
  part(0.03, 0.02, 0.3, 0, 0.1, -0.3, GUN_MAT.dark, g);
  addHands(g, 0.08, -0.42);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, -0.88);
  g.add(muzzle);
  return { group: g, muzzle, hip: new THREE.Vector3(0.34, -0.32, -0.76), ads: new THREE.Vector3(0.0, -0.13, -0.48) };
}

function buildSniper() {
  const g = new THREE.Group();
  part(0.085, 0.11, 0.85, 0, 0, -0.3, GUN_MAT.dark, g);
  cyl(0.028, 0.028, 1.0, 0, 0.045, -0.62, GUN_MAT.metal, g, [Math.PI / 2, 0, 0]);
  cyl(0.055, 0.055, 0.42, 0, 0.13, -0.26, GUN_MAT.metal, g, [Math.PI / 2, 0, 0]);
  cyl(0.065, 0.065, 0.06, 0, 0.13, -0.48, GUN_MAT.dark, g, [Math.PI / 2, 0, 0]);
  cyl(0.05, 0.05, 0.06, 0, 0.13, -0.04, GUN_MAT.dark, g, [Math.PI / 2, 0, 0]);
  part(0.09, 0.16, 0.42, 0, -0.06, 0.24, GUN_MAT.wood, g);
  part(0.1, 0.07, 0.22, 0, -0.02, -0.05, GUN_MAT.tan, g);
  part(0.04, 0.22, 0.04, -0.05, -0.16, -0.45, GUN_MAT.metal, g, [0, 0, 0.3]);
  part(0.04, 0.22, 0.04, 0.05, -0.16, -0.45, GUN_MAT.metal, g, [0, 0, -0.3]);
  addHands(g, 0.08, -0.18);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, -1.14);
  g.add(muzzle);
  return { group: g, muzzle, hip: new THREE.Vector3(0.36, -0.34, -0.8), ads: new THREE.Vector3(0.0, -0.11, -0.42) };
}

function buildLmg() {
  const g = new THREE.Group();
  part(0.14, 0.16, 0.7, 0, 0, -0.16, GUN_MAT.dark, g);
  cyl(0.045, 0.045, 0.7, 0, 0.04, -0.62, GUN_MAT.metal, g, [Math.PI / 2, 0, 0]);
  cyl(0.075, 0.075, 0.32, 0, 0.04, -0.42, GUN_MAT.metal, g, [Math.PI / 2, 0, 0], 10);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 12), GUN_MAT.dark);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, -0.19, 0.02);
  g.add(drum);
  part(0.1, 0.18, 0.3, 0, -0.08, 0.24, GUN_MAT.dark, g, [0.1, 0, 0]);
  part(0.06, 0.06, 0.5, 0, 0.11, -0.3, GUN_MAT.dark, g);
  part(0.035, 0.28, 0.035, -0.08, -0.2, -0.62, GUN_MAT.metal, g, [0, 0, 0.25]);
  part(0.035, 0.28, 0.035, 0.08, -0.2, -0.62, GUN_MAT.metal, g, [0, 0, -0.25]);
  addHands(g, 0.08, -0.38);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.04, -1.0);
  g.add(muzzle);
  return { group: g, muzzle, hip: new THREE.Vector3(0.32, -0.29, -0.74), ads: new THREE.Vector3(0.0, -0.14, -0.48) };
}

function buildKnife() {
  const g = new THREE.Group();
  // Kabza ve pommel halkası
  cyl(0.034, 0.038, 0.24, 0, -0.08, 0.04, GUN_MAT.dark, g, [0.35, 0, 0], 10);
  part(0.08, 0.04, 0.07, 0, -0.19, 0.09, GUN_MAT.metal, g, [0.35, 0, 0]);
  // Siperlik (Crossguard)
  part(0.14, 0.035, 0.06, 0, 0.03, -0.01, GUN_MAT.metal, g, [0.35, 0, 0]);
  // Uzun Komando Bıçağı Çelik Namlu (45cm görünüm)
  part(0.026, 0.085, 0.52, 0, 0.14, -0.24, GUN_MAT.blade, g, [0.35, 0, 0]);
  // Oluk (blood groove) ve sırt tırtıkları
  part(0.03, 0.022, 0.36, 0, 0.15, -0.21, GUN_MAT.dark, g, [0.35, 0, 0]);
  part(0.018, 0.05, 0.16, 0, 0.22, -0.52, GUN_MAT.blade, g, [0.52, 0, 0]);
  // Sağ el bıçak kabzasında, sol el taktik savunma pozunda
  part(0.11, 0.13, 0.15, 0.01, -0.1, 0.05, GUN_MAT.glove, g, [0.35, 0, 0.05]);
  part(0.13, 0.13, 0.36, 0.04, -0.18, 0.26, GUN_MAT.sleeve, g, [0.25, 0, 0.05]);
  part(0.1, 0.1, 0.15, -0.24, -0.16, -0.05, GUN_MAT.glove, g, [0.15, 0.3, -0.1]);
  part(0.12, 0.12, 0.32, -0.28, -0.22, 0.16, GUN_MAT.sleeve, g, [0.2, 0.25, -0.1]);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.22, -0.55);
  g.add(muzzle);
  return { group: g, muzzle, hip: new THREE.Vector3(0.28, -0.25, -0.58), ads: new THREE.Vector3(0.22, -0.21, -0.52) };
}

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,235,1)');
  grad.addColorStop(0.25, 'rgba(255,214,120,0.95)');
  grad.addColorStop(0.6, 'rgba(255,150,40,0.35)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class WeaponSystem {
  constructor(scene, camera, audio) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.root = new THREE.Group();
    camera.add(this.root);
    this.viewLight = new THREE.PointLight(0xfff0d6, 2.4, 4.5, 1.1);
    this.viewLight.position.set(0.2, 0.3, 0.05);
    camera.add(this.viewLight);
    this.models = {
      pistol: buildPistol(),
      shotgun: buildShotgun(),
      sniper: buildSniper(),
      lmg: buildLmg(),
      knife: buildKnife(),
    };
    for (const [k, m] of Object.entries(this.models)) {
      m.group.scale.setScalar(k === 'knife' ? 0.44 : 0.41);
      m.group.visible = false;
      this.root.add(m.group);
    }
    this.current = 'pistol';
    this.models.pistol.group.visible = true;
    this.recoil = 0;
    this.slashAnim = 0;
    this.kickPitch = 0;
    this.reloadUntil = 0;
    this.reloadStart = 0;
    this.aiming = false;
    this.scoped = false;
    this.time = 0;
    this.lastShot = 0;

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    this.flash.scale.set(0.55, 0.55, 1);
    this.flash.visible = false;
    this.scene.add(this.flash);
    this.flashLife = 0;

    this.flashLight = new THREE.PointLight(0xffc46a, 0, 9, 2);
    this.scene.add(this.flashLight);

    this.tracers = [];
    for (let i = 0; i < 28; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffdd9a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0, max: 0.12 });
    }

    this.maxParticles = 350;
    this.activeParticles = 0;
    this.particles = [];
    const pGeo = new THREE.BufferGeometry();
    this.pPositions = new Float32Array(this.maxParticles * 3);
    this.pColors = new Float32Array(this.maxParticles * 3);
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPositions, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(this.pColors, 3));
    this.particleGeo = pGeo;
    this.particlePoints = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);
  }

  setWeapon(id) {
    if (!this.models[id]) return;
    for (const [key, m] of Object.entries(this.models)) {
      m.group.visible = key === id && !this.scoped;
    }
    this.current = id;
    this.recoil = 0;
  }

  setAiming(aiming, scoped) {
    if (this.aiming === aiming && this.scoped === scoped) return;
    this.aiming = aiming;
    this.scoped = scoped;
    if (scoped) {
      for (const m of Object.values(this.models)) m.group.visible = false;
    } else {
      this.setWeapon(this.current);
    }
  }

  startReload(duration) {
    this.reloadStart = performance.now();
    this.reloadUntil = this.reloadStart + duration * 1000;
    this.audio.reloadStart();
  }

  finishReload() {
    this.reloadUntil = 0;
    this.audio.reloadDone();
  }

  muzzleWorld() {
    const m = this.models[this.current];
    if (!m) return this.camera.position.clone();
    return m.muzzle.getWorldPosition(new THREE.Vector3());
  }

  localShot(weaponId, dir, origin, hitPoints, hitType = 'world') {
    const w = weaponFor(weaponId);
    this.audio.shot(w.audio, 0);
    if (w.melee) {
      this.slashAnim = 1.0;
      const list = Array.isArray(hitPoints) ? hitPoints : [hitPoints];
      for (const item of list) {
        if (!item) continue;
        const end = item.isVector3 ? item : item.point;
        const type = item.type || hitType;
        if (end && (type === 'player' || type === 'world')) {
          this.spawnImpact(end, type);
        }
      }
      return list[0];
    }
    this.recoil = Math.min(1.5, this.recoil + w.recoil * 7);
    const muzzle = this.muzzleWorld();
    this.showFlash(muzzle);
    const list = Array.isArray(hitPoints) ? hitPoints : [hitPoints || { point: this.traceVisual(origin, dir, w.range), type: hitType }];
    for (const item of list) {
      const end = item && item.isVector3 ? item : (item && item.point ? item.point : this.traceVisual(origin, dir, w.range));
      const type = item && item.type ? item.type : hitType;
      this.spawnTracer(muzzle, end);
      this.spawnImpact(end, type);
    }
    return list[0];
  }

  remoteShot(msg) {
    const w = weaponFor(msg.w);
    const origin = new THREE.Vector3(msg.o[0], msg.o[1], msg.o[2]);
    const dist = this.camera.position.distanceTo(origin);
    this.audio.shot(w.audio, dist);
    if (w.melee) {
      for (const e of msg.e || []) {
        const end = new THREE.Vector3(e[0], e[1], e[2]);
        if (msg.hit === 'player' || msg.hit === 'world') {
          this.spawnImpact(end, msg.hit === 'player' ? 'player' : 'world');
        }
      }
      return;
    }
    if (dist < 80) this.showFlash(origin);
    for (const e of msg.e || []) {
      const end = new THREE.Vector3(e[0], e[1], e[2]);
      this.spawnTracer(origin, end);
      this.spawnImpact(end, msg.hit === 'player' ? 'player' : 'world');
    }
  }

  showFlash(pos) {
    this.flash.position.copy(pos);
    this.flash.material.opacity = 1;
    this.flash.material.rotation = Math.random() * Math.PI;
    const s = 0.35 + Math.random() * 0.3;
    this.flash.scale.set(s, s, 1);
    this.flash.visible = true;
    this.flashLife = 0.055;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 4;
  }

  spawnTracer(a, b) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    t.line.material.opacity = 0.9;
    t.line.visible = true;
    t.life = t.max;
  }

  spawnImpact(point, type) {
    const count = type === 'player' ? 9 : 7;
    const colors = type === 'player'
      ? [[0.55, 0.06, 0.05], [0.7, 0.1, 0.08], [0.4, 0.03, 0.03]]
      : [[0.7, 0.64, 0.5], [0.6, 0.55, 0.42], [0.78, 0.72, 0.58]];
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const c = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push({
        x: point.x, y: point.y, z: point.z,
        vx: (Math.random() - 0.5) * 3.2,
        vy: Math.random() * 2.6,
        vz: (Math.random() - 0.5) * 3.2,
        life: 0.4 + Math.random() * 0.5,
        max: 0.9,
        r: c[0], g: c[1], b: c[2],
      });
    }
  }

  traceVisual(origin, dir, range) {
    let t = range;
    const terrain = terrainRay(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    if (terrain !== null) t = terrain;
    const obs = rayObstacle(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, t);
    if (obs !== null && obs < t) t = obs;
    return new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
  }

  update(dt, mouse, player, moving, sprint) {
    this.time += dt;
    this.recoil = Math.max(0, this.recoil - dt * 7.5);
    this.slashAnim = Math.max(0, this.slashAnim - dt * 4.5);

    const model = this.models[this.current];
    if (!model) return;
    const ads = this.aiming && !this.scoped && this.current !== 'knife';
    const targetPos = ads ? model.ads : model.hip;
    const bobSpeed = sprint ? 13 : 8.5;
    const bobAmount = moving && !ads ? 0.013 : moving ? 0.004 : 0.002;
    const bobX = Math.sin(this.time * bobSpeed) * bobAmount;
    const bobY = Math.abs(Math.cos(this.time * bobSpeed)) * bobAmount * 0.8;
    const swayX = clamp(-mouse.dx * 0.00022, -0.02, 0.02);
    const swayY = clamp(mouse.dy * 0.00018, -0.015, 0.015);

    const reloadT = this.reloadUntil ? clamp((performance.now() - this.reloadStart) / (this.reloadUntil - this.reloadStart), 0, 1) : 0;
    const reloadDip = this.reloadUntil ? Math.sin(reloadT * Math.PI) : 0;
    const slashWave = Math.sin(this.slashAnim * Math.PI);

    model.group.position.lerp(targetPos, 1 - Math.exp(-16 * dt));
    model.group.position.x += bobX + swayX - slashWave * 0.24;
    model.group.position.y += bobY + swayY - reloadDip * 0.18 - this.recoil * 0.012 - slashWave * 0.08;
    model.group.position.z += this.recoil * 0.045 - slashWave * 0.22;
    model.group.rotation.x = -this.recoil * 0.16 + reloadDip * 0.5 - slashWave * 0.85;
    model.group.rotation.z = reloadDip * 0.6 + (ads ? 0 : swayX * 1.2) + slashWave * 0.95;
    model.group.rotation.y = (ads ? 0 : -0.13) + slashWave * 0.7;

    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) {
        this.flash.visible = false;
        this.flashLight.intensity = 0;
      } else {
        this.flash.material.opacity = this.flashLife / 0.055;
      }
    }

    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / t.max) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }

    const hadParticles = this.activeParticles > 0;
    let n = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 9.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const floorY = heightAt(p.x, p.z) + 0.05;
      if (p.y < floorY) {
        p.y = floorY;
        p.vy *= -0.25;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      this.particles[n] = p;
      const i3 = n * 3;
      this.pPositions[i3] = p.x;
      this.pPositions[i3 + 1] = p.y;
      this.pPositions[i3 + 2] = p.z;
      this.pColors[i3] = p.r;
      this.pColors[i3 + 1] = p.g;
      this.pColors[i3 + 2] = p.b;
      n++;
    }
    this.particles.length = n;
    if (n > 0 || hadParticles) {
      this.particleGeo.setDrawRange(0, n);
      if (n > 0) {
        this.particleGeo.attributes.position.needsUpdate = true;
        this.particleGeo.attributes.color.needsUpdate = true;
      }
    }
    this.activeParticles = n;
  }
}
