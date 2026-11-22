// Scooter ve tekne modelleri, sürüş fiziği ve kamera takibi.
import * as THREE from '/vendor/three.module.js';
import { VEHICLES, WORLD, clamp } from '/shared/config.js';
import { heightAt, terrainHeightAt, resolveObstacleCollisions } from '/shared/map.js';

const MAT = {
  metal: new THREE.MeshStandardMaterial({ color: 0x6f7a80, roughness: 0.45, metalness: 0.55, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24292c, roughness: 0.9, flatShading: true }),
  tire: new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: 0.95, flatShading: true }),
  seat: new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.85, flatShading: true }),
  hull: new THREE.MeshStandardMaterial({ color: 0xd7dde0, roughness: 0.55, metalness: 0.1, flatShading: true }),
  trim: new THREE.MeshStandardMaterial({ color: 0x2f6076, roughness: 0.5, metalness: 0.2, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.9, flatShading: true }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8fc3d8, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.5 }),
  light: new THREE.MeshStandardMaterial({ color: 0xffe8a8, emissive: 0xffd36a, emissiveIntensity: 1.2 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb23b32, emissive: 0x5a0f0a, emissiveIntensity: 0.4 }),
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL_GEO = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12);
WHEEL_GEO.rotateZ(Math.PI / 2);
const HUB_GEO = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
HUB_GEO.rotateZ(Math.PI / 2);
const STEER_GEO = new THREE.TorusGeometry(0.22, 0.04, 6, 12);
const ANCHOR_GEO = new THREE.TorusGeometry(0.18, 0.04, 5, 8);

const _desiredVec = new THREE.Vector3();
const _lookVec = new THREE.Vector3();
const _eyeVec = new THREE.Vector3();
const _obsOut = [];

function box(w, h, d, x, y, z, mat, parent) {
  const m = new THREE.Mesh(UNIT_BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function scooterModel(v) {
  const g = new THREE.Group();
  const bodyColor = new THREE.Color().setHSL((v.id.charCodeAt(1) * 0.13) % 1, 0.38, 0.36);
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.52, metalness: 0.22, flatShading: true });
  // Ana şasi ve taban
  box(0.58, 0.14, 1.58, 0, 0.36, 0, bodyMat, g);
  box(0.62, 0.08, 0.9, 0, 0.28, -0.05, MAT.dark, g);
  // Taktik sele ve arka çanta/kargo rafı
  box(0.52, 0.32, 0.74, 0, 0.56, -0.26, MAT.seat, g);
  box(0.48, 0.2, 0.52, 0, 0.72, -0.36, bodyMat, g);
  box(0.54, 0.18, 0.34, 0, 0.84, -0.68, MAT.dark, g); // arka taktik çanta
  // Egzoz borusu
  const exhaust = box(0.11, 0.12, 0.62, 0.31, 0.38, -0.46, MAT.metal, g);
  exhaust.rotation.x = 0.14;
  // Ön gidon boğazı ve rüzgar siperliği
  const column = box(0.16, 0.78, 0.16, 0, 0.74, 0.56, MAT.metal, g);
  column.rotation.x = -0.22;
  const fairing = box(0.46, 0.42, 0.22, 0, 0.78, 0.62, bodyMat, g);
  fairing.rotation.x = -0.18;
  box(0.78, 0.07, 0.07, 0, 1.1, 0.45, MAT.dark, g); // gidon
  box(0.14, 0.1, 0.08, -0.36, 1.1, 0.48, MAT.dark, g); // sol elcik koruma
  box(0.14, 0.1, 0.08, 0.36, 1.1, 0.48, MAT.dark, g); // sağ elcik koruma
  // Tekerlekler ve çamurluklar
  const wheelF = new THREE.Mesh(WHEEL_GEO, MAT.tire);
  wheelF.position.set(0, 0.31, 0.74);
  wheelF.castShadow = true;
  g.add(wheelF);
  const wheelB = new THREE.Mesh(WHEEL_GEO, MAT.tire);
  wheelB.position.set(0, 0.31, -0.72);
  wheelB.castShadow = true;
  g.add(wheelB);
  const hubF = new THREE.Mesh(HUB_GEO, MAT.metal);
  hubF.position.copy(wheelF.position);
  g.add(hubF);
  const hubB = new THREE.Mesh(HUB_GEO, MAT.metal);
  hubB.position.copy(wheelB.position);
  g.add(hubB);
  box(0.28, 0.08, 0.42, 0, 0.58, 0.74, bodyMat, g); // ön çamurluk
  // Çift LED far ve arka stop
  box(0.14, 0.11, 0.1, -0.1, 0.86, 0.72, MAT.light, g);
  box(0.14, 0.11, 0.1, 0.1, 0.86, 0.72, MAT.light, g);
  box(0.24, 0.09, 0.06, 0, 0.68, -0.84, MAT.red, g);
  const forkL = box(0.065, 0.56, 0.065, -0.13, 0.6, 0.68, MAT.metal, g);
  forkL.rotation.x = 0.12;
  const forkR = box(0.065, 0.56, 0.065, 0.13, 0.6, 0.68, MAT.metal, g);
  forkR.rotation.x = 0.12;
  return { group: g, wheels: [wheelF, wheelB], bodyMat };
}

function boatModel() {
  const g = new THREE.Group();
  // 3 Kişilik Özel Kuvvetler RHIB Hücum Botu
  box(2.15, 0.52, 4.9, 0, 0.28, 0, MAT.hull, g);
  // Şişme yan tüpler (pontoons)
  box(0.36, 0.44, 4.7, -1.12, 0.52, 0.05, MAT.dark, g);
  box(0.36, 0.44, 4.7, 1.12, 0.52, 0.05, MAT.dark, g);
  box(2.4, 0.58, 1.5, 0, 0.6, -1.7, MAT.hull, g);
  // Pruva (V-burun)
  const bowL = box(0.95, 0.52, 2.2, -0.64, 0.38, 2.45, MAT.dark, g);
  bowL.rotation.y = -0.48;
  const bowR = box(0.95, 0.52, 2.2, 0.64, 0.38, 2.45, MAT.dark, g);
  bowR.rotation.y = 0.48;
  const bowLTop = box(0.9, 0.55, 1.5, -0.6, 0.64, 2.15, MAT.trim, g);
  bowLTop.rotation.y = -0.48;
  const bowRTop = box(0.9, 0.55, 1.5, 0.6, 0.64, 2.15, MAT.trim, g);
  bowRTop.rotation.y = 0.48;
  // İç güverte
  box(1.75, 0.08, 4.1, 0, 0.56, 0.0, MAT.wood, g);
  box(2.1, 0.36, 0.24, 0, 0.74, 2.5, MAT.trim, g);
  // 3 Taktik Koltuk:
  // Seat 0 (Orta Sürücü / Dümen): z = 0.35
  box(0.75, 0.24, 0.65, 0, 0.76, 0.35, MAT.seat, g);
  box(0.75, 0.52, 0.16, 0, 1.02, 0.04, MAT.seat, g);
  // Seat 1 (Ön Pruva Nişancısı): z = 1.55
  box(0.85, 0.24, 0.6, 0, 0.78, 1.55, MAT.seat, g);
  // Seat 2 (Arka Kıç Nişancısı): z = -1.25
  box(1.35, 0.24, 0.6, 0, 0.8, -1.25, MAT.seat, g);
  box(1.35, 0.55, 0.18, 0, 1.06, -1.52, MAT.seat, g);
  // Dümen konsolu (z = 0.95)
  box(0.76, 0.42, 0.42, 0, 0.88, 0.92, MAT.dark, g);
  box(0.08, 0.35, 0.08, 0, 1.16, 0.86, MAT.metal, g);
  const wheel = new THREE.Mesh(STEER_GEO, MAT.dark);
  wheel.position.set(0, 1.32, 0.8);
  wheel.rotation.x = 1.1;
  g.add(wheel);
  // Ön cam
  const shield = box(1.35, 0.52, 0.05, 0, 1.34, 1.12, MAT.glass, g);
  shield.rotation.x = -0.28;
  // Arka radar kemeri (Tactical Rollbar) ve fener
  box(0.1, 1.35, 0.1, -1.06, 1.25, -1.85, MAT.metal, g);
  box(0.1, 1.35, 0.1, 1.06, 1.25, -1.85, MAT.metal, g);
  box(2.22, 0.1, 0.14, 0, 1.9, -1.85, MAT.metal, g);
  box(0.28, 0.12, 0.14, 0, 2.02, -1.85, MAT.light, g);
  // Korkuluklar
  for (const x of [-1.06, 1.06]) {
    box(0.06, 0.52, 0.06, x, 1.02, 1.8, MAT.metal, g);
    box(0.06, 0.52, 0.06, x, 1.02, -1.1, MAT.metal, g);
    box(0.05, 0.05, 3.0, x, 1.28, 0.35, MAT.metal, g);
  }
  // Çift dıştan takma motor
  box(0.44, 0.68, 0.52, -0.38, 0.66, -2.52, MAT.dark, g);
  box(0.44, 0.68, 0.52, 0.38, 0.66, -2.52, MAT.dark, g);
  box(0.24, 0.14, 0.08, 0, 0.96, -2.48, MAT.red, g);
  // Pruva halkası
  const anchor = new THREE.Mesh(ANCHOR_GEO, MAT.metal);
  anchor.position.set(0, 0.52, 2.95);
  anchor.rotation.x = Math.PI / 2;
  g.add(anchor);
  return { group: g, wheels: [], bodyMat: null };
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Süspansiyon yay-damper katsayıları (birim kütle varsayımı).
// Kritik sönüm: 2 * sqrt(k). Scooter sert ve neredeyse kritik sönümlü,
// tekne daha yumuşak ve hafif salınımlı (dalga hissi korunur).
const SUSPENSION = {
  scooter: { stiffness: 46, damping: 13.2 },
  boat: { stiffness: 15, damping: 6.0 },
};

// Oturma noktaları: aracın lokal uzayında, oturan karakterin KÖK (ayak
// tabanı) konumu. Karakter modeli +Z'ye bakar, araç da +Z'ye ilerler.
const SEAT_ANCHORS = {
  scooter: [
    { x: 0, y: 0.12, z: -0.3 }, // sele üstü (sürücü)
    { x: 0, y: 0.44, z: -0.62 },
  ],
  boat: [
    { x: 0, y: 0.3, z: 0.35 },   // Seat 0: Sürücü (dümen konsolu)
    { x: 0, y: 0.34, z: 1.55 },  // Seat 1: Ön Pruva Nişancısı
    { x: 0, y: 0.34, z: -1.25 }, // Seat 2: Arka Kıç Nişancısı
  ],
};

function seatAnchorLocal(type, seat) {
  const list = SEAT_ANCHORS[type] || SEAT_ANCHORS.scooter;
  const a = list[clamp(seat | 0, 0, list.length - 1)];
  return new THREE.Vector3(a.x, a.y, a.z);
}

export class VehicleSystem {
  constructor(scene, net, audio) {
    this.scene = scene;
    this.net = net;
    this.audio = audio;
    this.models = new Map();
    this.controlledId = null;
    this.sendAcc = 0;
    this.time = 0;
  }

  create(v) {
    const built = v.type === 'boat' ? boatModel() : scooterModel(v);
    const group = built.group;
    group.position.set(v.x, v.y, v.z);
    group.rotation.order = 'YXZ';
    group.rotation.y = v.ry;
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.scene.add(group);
    const model = {
      id: v.id,
      type: v.type,
      group,
      wheels: built.wheels,
      bodyMat: built.bodyMat || null,
      speed: v.speed || 0,
      target: { x: v.x, y: v.y, z: v.z, ry: v.ry, rx: 0, rz: 0 },
      driver: v.driver,
      passenger: v.passenger,
      passenger2: v.passenger2 || null,
      seatY: v.y,
      // Simülasyon durumları
      vy: 0,
      lean: 0,
      throttle: 0,
      steerSmooth: 0,
    };
    model.seatAnchor = (seat = 0) => seatAnchorLocal(model.type, seat);
    this.models.set(v.id, model);
    return model;
  }

  sync(list) {
    const seen = new Set();
    for (const v of list) {
      seen.add(v.id);
      let m = this.models.get(v.id);
      if (!m) m = this.create(v);
      m.target.x = v.x;
      m.target.y = v.y;
      m.target.z = v.z;
      m.target.ry = v.ry;
      m.target.rx = v.rx;
      m.target.rz = v.rz;
      m.driver = v.driver;
      m.passenger = v.passenger;
      m.passenger2 = v.passenger2 || null;
      if (m.id !== this.controlledId) {
        m.speed = v.speed || 0;
      }
    }
    for (const [id, m] of this.models) {
      if (!seen.has(id)) {
        this.scene.remove(m.group);
        if (m.bodyMat && m.bodyMat.dispose) m.bodyMat.dispose();
        this.models.delete(id);
        if (this.controlledId === id) this.controlledId = null;
      }
    }
  }

  snapAll(list) {
    this.sync(list);
    for (const v of list) this.snapTo(v);
  }

  get(id) {
    return this.models.get(id) || null;
  }

  snapTo(v) {
    const m = this.models.get(v.id);
    if (!m) return;
    m.group.position.set(v.x, v.y, v.z);
    m.group.rotation.y = v.ry;
    m.group.rotation.x = v.rx || 0;
    m.group.rotation.z = v.rz || 0;
    m.target = {
      x: v.x, y: v.y, z: v.z, ry: v.ry, rx: v.rx || 0, rz: v.rz || 0,
    };
    m.driver = v.driver;
    m.passenger = v.passenger;
    m.passenger2 = v.passenger2 || null;
    m.speed = v.speed || 0;
    m.vy = 0;
    m.lean = 0;
    m.throttle = 0;
    m.steerSmooth = 0;
  }

  // Aracın lokal uzayında oturma noktası döndürür (karakter kökü).
  // seatAnchor(seat, vehicleId) — vehicleId verilmezse kontrol edilen araç.
  seatAnchor(seat = 0, vehicleId = this.controlledId) {
    const m = vehicleId ? this.models.get(vehicleId) : null;
    if (!m) return null;
    return seatAnchorLocal(m.type, seat);
  }

  setControlled(id) {
    this.controlledId = id;
    const m = this.models.get(id);
    if (m) m.speed = 0;
    if (id) this.audio.startEngine(m ? m.type : 'scooter');
  }

  clearControlled() {
    this.controlledId = null;
    this.audio.stopEngine();
  }

  nearest(x, z, includeFull = false) {
    let best = null;
    let bestD = 1e9;
    for (const m of this.models.values()) {
      const cfg = VEHICLES[m.type];
      const full = m.type === 'scooter'
        ? !!m.driver
        : !!(m.driver && m.passenger && m.passenger2);
      if (full && !includeFull) continue;
      const d = Math.hypot(m.group.position.x - x, m.group.position.z - z);
      if (d < cfg.enterRadius + 3.5 && d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  simulate(m, dt, input, player) {
    const cfg = VEHICLES[m.type];
    const pos = m.group.position;
    const isBoat = m.type === 'boat';
    const rawThrottle = ((input.down('KeyW') || input.down('ArrowUp')) ? 1 : 0)
      - ((input.down('KeyS') || input.down('ArrowDown')) ? 1 : 0);
    const steer = ((input.down('KeyA') || input.down('ArrowLeft')) ? 1 : 0)
      - ((input.down('KeyD') || input.down('ArrowRight')) ? 1 : 0);
    const boostHeld = input.down('ShiftLeft') || input.down('ShiftRight');
    const driftHeld = !isBoat && input.down('Space');
    let speed = m.speed || 0;
    const ground = isBoat ? terrainHeightAt(pos.x, pos.z) : heightAt(pos.x, pos.z);
    const onLand = ground > 0.15;

    const topSpeed = (!isBoat && boostHeld) ? (cfg.boostSpeed || cfg.maxSpeed * 1.25) : cfg.maxSpeed;
    const accelBoost = (!isBoat && boostHeld) ? 1.38 : 1.0;

    // Gaz/fren geçişlerini yumuşat
    const throttleRate = rawThrottle === 0 ? 10 : 7.5;
    m.throttle += (rawThrottle - m.throttle) * (1 - Math.exp(-throttleRate * dt));
    if (Math.abs(m.throttle) < 0.02) m.throttle = 0;
    const throttle = m.throttle;
    const gas = Math.abs(throttle);
    const accelScale = 1 - clamp(Math.max(speed, 0) / topSpeed, 0, 1) * 0.48;

    if (isBoat) {
      if (onLand) {
        speed *= Math.exp(-4 * dt);
        if (throttle < 0) speed -= cfg.accel * 0.6 * gas * dt;
      } else if (throttle > 0) {
        speed += cfg.accel * gas * accelScale * dt;
      } else if (throttle < 0) {
        speed -= (speed > 0.5 ? cfg.brake : cfg.accel) * gas * dt;
      } else {
        speed *= Math.exp(-(0.36 + Math.abs(speed) * 0.028) * dt);
      }
    } else {
      if (ground < -0.45) {
        speed *= Math.exp(-3.5 * dt);
      } else if (throttle > 0) {
        speed += cfg.accel * accelBoost * gas * accelScale * dt;
      } else if (throttle < 0) {
        speed -= (speed > 0.5 ? cfg.brake : cfg.accel * 0.75) * gas * dt;
      } else {
        speed *= Math.exp(-(driftHeld ? 3.2 : 1.35) * dt);
      }
      if (Math.abs(speed) > 0.4) {
        const aheadH = heightAt(
          pos.x + Math.sin(m.target.ry) * 1.8,
          pos.z + Math.cos(m.target.ry) * 1.8,
        );
        const grade = clamp((aheadH - ground) / 1.8, -0.85, 0.85);
        speed += clamp(-grade * (boostHeld ? 7 : 11), -6.5, 6.0) * dt;
      }
    }
    speed = clamp(speed, -cfg.reverseSpeed, topSpeed);

    // Direksiyon girdisini yumuşat (drift sırasında daha keskin dönüş)
    const steerRate = isBoat ? 5.5 : 17;
    m.steerSmooth += (steer - m.steerSmooth) * (1 - Math.exp(-steerRate * dt));

    const absSpeed = Math.abs(speed);
    const grip = clamp(absSpeed / (isBoat ? 7.5 : 4.8), 0, 1) * (speed >= 0 ? 1 : -1);
    const highSpeed = clamp((absSpeed - 9) / Math.max(topSpeed - 9, 1), 0, 1);
    const turnScale = (1 - (isBoat ? 0.36 : 0.42) * highSpeed) * (driftHeld ? 1.48 : 1.0);
    const yaw = m.target.ry + m.steerSmooth * cfg.turnRate * dt * grip * turnScale;
    m.target.ry = yaw;

    let nx = pos.x + Math.sin(yaw) * speed * dt;
    let nz = pos.z + Math.cos(yaw) * speed * dt;

    const vehRadius = m.type === 'scooter' ? 0.92 : 1.45;
    const col = resolveObstacleCollisions(nx, nz, vehRadius);
    if (col.hit) {
      nx = col.x;
      nz = col.z;
      if (Math.abs(speed) > 4) {
        speed *= -0.18;
        this.audio.noiseBurst(0.12, 0.12, 'lowpass', 600, 0.8);
      } else {
        speed *= 0.4;
      }
    }

    nx = clamp(nx, -780, 780);
    nz = clamp(nz, -780, 780);
    pos.x = nx;
    pos.z = nz;
    const h = isBoat ? terrainHeightAt(nx, nz) : heightAt(nx, nz);
    m.speed = speed;
    m.target.x = nx;
    m.target.z = nz;

    if (isBoat) {
      const onLandNow = h > 0.2;
      m.target.y = onLandNow
        ? h + 0.25
        : WORLD.waterLevel + 0.28 + Math.sin(this.time * 1.6 + nx * 0.08) * 0.07;
      m.target.rx = Math.sin(this.time * 1.2 + nz * 0.05) * 0.035;
      m.target.rz = Math.sin(this.time * 1.4 + nx * 0.04) * 0.045;
    } else {
      m.target.y = Math.max(WORLD.waterLevel + 0.32, h + 0.35);
      const ahead = heightAt(nx + Math.sin(yaw) * 1.8, nz + Math.cos(yaw) * 1.8);
      const behind = heightAt(nx - Math.sin(yaw) * 1.8, nz - Math.cos(yaw) * 1.8);
      const left = heightAt(nx + Math.cos(yaw) * 1.3, nz - Math.sin(yaw) * 1.3);
      const right = heightAt(nx - Math.cos(yaw) * 1.3, nz + Math.sin(yaw) * 1.3);
      m.target.rx = clamp(Math.atan2(behind - ahead, 3.6), -0.35, 0.35);
      m.target.rz = clamp(Math.atan2(left - right, 2.6), -0.3, 0.3);
    }

    // Süspansiyon: hedef yüksekliğe yay-damper ile yaklaş.
    const sus = SUSPENSION[isBoat ? 'boat' : 'scooter'];
    const steps = dt > 0.034 ? 2 : 1;
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acc = (m.target.y - pos.y) * sus.stiffness - m.vy * sus.damping;
      m.vy += acc * sdt;
      pos.y += m.vy * sdt;
    }
    // Zemin/dalga tabanına gömülmeyi engelle; yay çok gerilirse sıfırla.
    const minY = isBoat
      ? (h > 0.2 ? h + 0.1 : WORLD.waterLevel + 0.06)
      : h + 0.18;
    if (pos.y < minY) {
      pos.y = minY;
      if (m.vy < 0) m.vy = 0;
    }
    if (Math.abs(pos.y - m.target.y) > 4) {
      pos.y = m.target.y;
      m.vy = 0;
    }

    // Viraj yatması: dönüş yönüne, hız oranıyla sınırlı roll.
    const speedRatio = clamp(absSpeed / cfg.maxSpeed, 0, 1);
    const maxLean = isBoat ? 0.13 : 0.34;
    const leanTarget = -m.steerSmooth * speedRatio * maxLean * (speed >= 0 ? 1 : -1);
    m.lean += (leanTarget - m.lean) * (1 - Math.exp(-(isBoat ? 3.2 : 7) * dt));
    const leanLimit = isBoat ? 0.4 : 0.55;
    m.target.rz = clamp(m.target.rz + m.lean, -leanLimit, leanLimit);

    m.group.rotation.y = yaw;
    m.group.rotation.x = m.target.rx;
    m.group.rotation.z = m.target.rz;

    // Tekerlek dönüşü
    for (const w of m.wheels) {
      w.rotation.x += speed * dt * 2.2;
    }

    if (player) {
      player.x = pos.x;
      player.z = pos.z;
      player.y = pos.y + 0.05;
      player.yaw = yaw;
    }

    this.sendAcc += dt;
    if (this.sendAcc >= 0.05) {
      this.sendAcc = 0;
      this.net.send({
        t: 'veh',
        id: m.id,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        ry: yaw,
        rx: m.target.rx,
        rz: m.target.rz,
        speed,
      });
    }
  }

  update(dt, input, player, camera, localVehicleId) {
    this.time += dt;
    const controlled = this.controlledId ? this.models.get(this.controlledId) : null;
    for (const m of this.models.values()) {
      if (m === controlled && player && player.seat === 0) {
        this.simulate(m, dt, input, player);
        continue;
      }
      const t = m.target;
      const k = 1 - Math.exp(-11 * dt);
      m.group.position.x += (t.x - m.group.position.x) * k;
      m.group.position.z += (t.z - m.group.position.z) * k;
      m.group.position.y += (t.y - m.group.position.y) * k;
      m.group.rotation.y = lerpAngle(m.group.rotation.y, t.ry, 1 - Math.exp(-12 * dt));
      m.group.rotation.x += (t.rx - m.group.rotation.x) * (1 - Math.exp(-8 * dt));
      m.group.rotation.z += (t.rz - m.group.rotation.z) * (1 - Math.exp(-8 * dt));
    }

    if (controlled) {
      this.audio.updateEngine(controlled.speed, VEHICLES[controlled.type].maxSpeed);
    }
    if (!localVehicleId && this.controlledId) this.clearControlled();
  }

  chaseCamera(camera, dt) {
    const m = this.controlledId ? this.models.get(this.controlledId) : null;
    if (!m) return false;
    const pos = m.group.position;
    const yaw = m.group.rotation.y;
    const dist = m.type === 'boat' ? 11 : 6.5;
    const height = m.type === 'boat' ? 4.8 : 3.1;
    _desiredVec.set(
      pos.x - Math.sin(yaw) * dist,
      pos.y + height,
      pos.z - Math.cos(yaw) * dist,
    );
    const ground = heightAt(_desiredVec.x, _desiredVec.z);
    _desiredVec.y = Math.max(_desiredVec.y, ground + 1.4, WORLD.waterLevel + 1.2);
    if (camera.position.distanceTo(_desiredVec) > 30) camera.position.copy(_desiredVec);
    else camera.position.lerp(_desiredVec, 1 - Math.exp(-7 * dt));
    _lookVec.set(
      pos.x + Math.sin(yaw) * 3.5,
      pos.y + (m.type === 'boat' ? 1.7 : 1.2),
      pos.z + Math.cos(yaw) * 3.5,
    );
    camera.lookAt(_lookVec);
    return true;
  }

  passengerEye(vehicleId, seat) {
    const m = this.models.get(vehicleId);
    if (!m) return null;
    const pos = m.group.position;
    const yaw = m.group.rotation.y;
    const offset = seat === 0 ? 0.35 : seat === 1 ? 1.55 : -1.25;
    return _eyeVec.set(
      pos.x + Math.sin(yaw) * offset,
      pos.y + 1.62,
      pos.z + Math.cos(yaw) * offset,
    );
  }
}
