// Amerikan Special Forces (Özel Kuvvetler) operatör modelleri, silah tutuşu ve animasyonları.
import * as THREE from '/vendor/three.module.js';
import { TEAMS, clamp } from '/shared/config.js';

// Paylaşılan geometriler
const GEO = {
  torso: new THREE.BoxGeometry(0.58, 0.7, 0.34),
  plateFront: new THREE.BoxGeometry(0.52, 0.46, 0.08),
  plateBack: new THREE.BoxGeometry(0.5, 0.46, 0.08),
  cummerbund: new THREE.BoxGeometry(0.62, 0.2, 0.38),
  teamPanelF: new THREE.BoxGeometry(0.34, 0.14, 0.02),
  teamPanelB: new THREE.BoxGeometry(0.34, 0.16, 0.02),
  collar: new THREE.CylinderGeometry(0.18, 0.22, 0.12, 10),
  hips: new THREE.BoxGeometry(0.5, 0.24, 0.32),
  belt: new THREE.BoxGeometry(0.54, 0.11, 0.36),
  upperArm: new THREE.BoxGeometry(0.18, 0.34, 0.18),
  armBand: new THREE.BoxGeometry(0.195, 0.12, 0.195),
  foreArm: new THREE.BoxGeometry(0.15, 0.32, 0.15),
  thigh: new THREE.BoxGeometry(0.21, 0.38, 0.22),
  holster: new THREE.BoxGeometry(0.08, 0.2, 0.14),
  kneePad: new THREE.BoxGeometry(0.18, 0.13, 0.08),
  shin: new THREE.BoxGeometry(0.18, 0.36, 0.19),
  head: new THREE.SphereGeometry(0.21, 12, 10),
  balaclava: new THREE.SphereGeometry(0.216, 12, 10),
  gogglesFrame: new THREE.BoxGeometry(0.32, 0.11, 0.12),
  gogglesLens: new THREE.BoxGeometry(0.29, 0.08, 0.03),
  helmet: new THREE.SphereGeometry(0.245, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
  helmetRim: new THREE.BoxGeometry(0.46, 0.05, 0.44),
  helmetPatch: new THREE.BoxGeometry(0.02, 0.08, 0.16),
  nvgMount: new THREE.BoxGeometry(0.1, 0.09, 0.08),
  nvgBridge: new THREE.BoxGeometry(0.28, 0.04, 0.06),
  nvgTube: new THREE.CylinderGeometry(0.032, 0.036, 0.13, 8),
  nvgLens: new THREE.CylinderGeometry(0.028, 0.028, 0.02, 8),
  earCup: new THREE.CylinderGeometry(0.065, 0.065, 0.045, 10),
  backpack: new THREE.BoxGeometry(0.42, 0.48, 0.22),
  radioBox: new THREE.BoxGeometry(0.12, 0.22, 0.09),
  antenna: new THREE.CylinderGeometry(0.008, 0.014, 0.58, 6),
  pouch: new THREE.BoxGeometry(0.13, 0.18, 0.08),
  shoulderPad: new THREE.BoxGeometry(0.22, 0.11, 0.23),
  boot: new THREE.BoxGeometry(0.2, 0.17, 0.31),
  hand: new THREE.SphereGeometry(0.095, 8, 6),
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  barrelCyl: new THREE.CylinderGeometry(0.024, 0.024, 1, 8),
  scopeCyl: new THREE.CylinderGeometry(0.048, 0.048, 0.36, 10),
  drumCyl: new THREE.CylinderGeometry(0.14, 0.14, 0.16, 12),
};

// Amerikan Special Forces sabit askeri ekipman materyalleri
const SF_MATS = {
  camoOlive: new THREE.MeshStandardMaterial({ color: 0x4f5643, roughness: 0.85, flatShading: true }),
  camoDark: new THREE.MeshStandardMaterial({ color: 0x383d30, roughness: 0.88, flatShading: true }),
  coyoteVest: new THREE.MeshStandardMaterial({ color: 0x857152, roughness: 0.82, flatShading: true }),
  coyotePouch: new THREE.MeshStandardMaterial({ color: 0x6d5b40, roughness: 0.88, flatShading: true }),
  helmetMat: new THREE.MeshStandardMaterial({ color: 0x3b3f36, roughness: 0.72, metalness: 0.15, flatShading: true }),
  balaclava: new THREE.MeshStandardMaterial({ color: 0x1d2022, roughness: 0.92, flatShading: true }),
  goggleLens: new THREE.MeshStandardMaterial({ color: 0x112533, roughness: 0.2, metalness: 0.65, flatShading: true }),
  nvgBody: new THREE.MeshStandardMaterial({ color: 0x181b1d, roughness: 0.55, metalness: 0.4, flatShading: true }),
  nvgGlow: new THREE.MeshStandardMaterial({ color: 0x35e87e, emissive: 0x19a34f, emissiveIntensity: 0.9, roughness: 0.2 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc99a72, roughness: 0.82, flatShading: true }),
  gearBlack: new THREE.MeshStandardMaterial({ color: 0x202427, roughness: 0.85, flatShading: true }),
  boot: new THREE.MeshStandardMaterial({ color: 0x2a241d, roughness: 0.9, flatShading: true }),
  glove: new THREE.MeshStandardMaterial({ color: 0x2c2823, roughness: 0.88, flatShading: true }),
};

const GUN_3P_MAT = {
  metal: new THREE.MeshStandardMaterial({ color: 0x282e33, roughness: 0.42, metalness: 0.62, flatShading: true }),
  steel: new THREE.MeshStandardMaterial({ color: 0x737d84, roughness: 0.32, metalness: 0.78, flatShading: true }),
  blade: new THREE.MeshStandardMaterial({ color: 0xdce4e8, roughness: 0.2, metalness: 0.88, emissive: 0x222a30, emissiveIntensity: 0.35, flatShading: true }),
  tan: new THREE.MeshStandardMaterial({ color: 0x9b8461, roughness: 0.72, metalness: 0.15, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0x614328, roughness: 0.8, flatShading: true }),
  laser: new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2a1f, emissiveIntensity: 1.4 }),
};

const TEAM_MAT_CACHE = new Map();

function rigMaterials(team) {
  const key = team === 'blue' ? 'blue' : 'red';
  if (TEAM_MAT_CACHE.has(key)) return TEAM_MAT_CACHE.get(key);
  const accentHex = key === 'blue' ? 0x2578e8 : 0xd93832;
  const accentDarkHex = key === 'blue' ? 0x164a96 : 0x8f1f1b;
  const teamAccent = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.68,
    metalness: 0.1,
    emissive: accentDarkHex,
    emissiveIntensity: 0.22,
    flatShading: true,
  });
  const teamDark = new THREE.MeshStandardMaterial({
    color: accentDarkHex,
    roughness: 0.78,
    flatShading: true,
  });
  const mats = {
    ...SF_MATS,
    teamAccent,
    teamDark,
  };
  TEAM_MAT_CACHE.set(key, mats);
  return mats;
}

// 3. şahıs ve diğer oyuncuların elinde net görünen detaylı Special Forces silah modelleri
function gunModel(weaponId) {
  const g = new THREE.Group();
  const addBox = (w, h, d, x, y, z, mat = GUN_3P_MAT.metal, rotX = 0) => {
    const m = new THREE.Mesh(GEO.unitBox, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    if (rotX) m.rotation.x = rotX;
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const addBarrel = (len, rScale, x, y, z, mat = GUN_3P_MAT.steel) => {
    const m = new THREE.Mesh(GEO.barrelCyl, mat);
    m.scale.set(rScale, len, rScale);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  if (weaponId === 'knife') {
    // Uzun Taktik Komando Bıçağı (M9 Bayonet / Bowie)
    addBox(0.045, 0.055, 0.2, 0, -0.02, 0.02, SF_MATS.gearBlack); // kabza
    addBox(0.08, 0.14, 0.025, 0, 0.0, 0.12, GUN_3P_MAT.steel); // siperlik (crossguard)
    addBox(0.032, 0.085, 0.46, 0, 0.01, 0.36, GUN_3P_MAT.blade); // parlak çelik namlu
    addBox(0.02, 0.045, 0.14, 0, 0.025, 0.62, GUN_3P_MAT.blade, 0.25); // sivri uç
  } else if (weaponId === 'pistol') {
    // SOCOM Taktik Tabanca + Susturucu + Lazer
    addBox(0.085, 0.11, 0.38, 0, 0.04, 0.14, GUN_3P_MAT.tan); // üst sürgü
    addBox(0.075, 0.07, 0.34, 0, -0.02, 0.13, GUN_3P_MAT.metal); // gövde
    addBox(0.075, 0.22, 0.11, 0, -0.14, -0.01, SF_MATS.gearBlack, -0.2); // kabza
    addBarrel(0.24, 1.15, 0, 0.04, 0.42, GUN_3P_MAT.metal); // taktik susturucu
    addBox(0.05, 0.045, 0.12, 0, -0.05, 0.24, GUN_3P_MAT.steel); // fener/lazer modülü
    addBox(0.02, 0.02, 0.02, 0, -0.05, 0.31, GUN_3P_MAT.laser);
  } else if (weaponId === 'shotgun') {
    // M1014 Taktik Pompalı Tüfek
    addBox(0.1, 0.13, 0.56, 0, 0.02, 0.18, GUN_3P_MAT.metal); // gövde
    addBarrel(0.76, 1.25, 0, 0.06, 0.58, GUN_3P_MAT.steel); // üst namlu
    addBarrel(0.56, 1.1, 0, -0.01, 0.48, GUN_3P_MAT.metal); // alt şarjör borusu
    addBox(0.11, 0.095, 0.28, 0, -0.01, 0.46, GUN_3P_MAT.tan); // pompa el kundak
    addBox(0.09, 0.16, 0.38, 0, -0.04, -0.24, SF_MATS.gearBlack); // taktik dipçik
    addBox(0.075, 0.2, 0.1, 0, -0.13, -0.02, SF_MATS.gearBlack, -0.22); // kabza
    addBox(0.08, 0.05, 0.16, 0, 0.11, 0.14, GUN_3P_MAT.tan); // holo nişangah
  } else if (weaponId === 'sniper') {
    // Mk13 Uzun Menzil Keskin Nişancı Tüfeği (FDE Tan Şasi + Büyük Dürbün)
    addBox(0.095, 0.12, 0.72, 0, 0.01, 0.24, GUN_3P_MAT.tan); // FDE şasi
    addBarrel(0.98, 1.1, 0, 0.05, 0.76, GUN_3P_MAT.steel); // uzun yivli namlu
    addBox(0.07, 0.07, 0.12, 0, 0.05, 1.26, GUN_3P_MAT.metal); // muzzle brake
    addBox(0.09, 0.17, 0.44, 0, -0.03, -0.28, GUN_3P_MAT.tan); // ayarlı dipçik
    addBox(0.08, 0.16, 0.16, 0, -0.14, 0.22, GUN_3P_MAT.metal); // şarjör
    const scope = new THREE.Mesh(GEO.scopeCyl, GUN_3P_MAT.metal);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.15, 0.24);
    g.add(scope);
    // Çatal ayak (bipod)
    addBox(0.03, 0.2, 0.03, -0.05, -0.12, 0.56, GUN_3P_MAT.steel);
    addBox(0.03, 0.2, 0.03, 0.05, -0.12, 0.56, GUN_3P_MAT.steel);
  } else {
    // M249 SAW Özel Kuvvetler Hafif Makineli
    addBox(0.14, 0.16, 0.68, 0, 0.02, 0.24, GUN_3P_MAT.metal); // ağır gövde
    addBox(0.12, 0.1, 0.38, 0, 0.05, 0.66, GUN_3P_MAT.tan); // ısı kalkanlı el kundağı
    addBarrel(0.78, 1.35, 0, 0.06, 0.72, GUN_3P_MAT.steel); // ağır namlu
    const drum = new THREE.Mesh(GEO.drumCyl, GUN_3P_MAT.tan);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, -0.15, 0.24);
    g.add(drum);
    addBox(0.1, 0.18, 0.36, 0, -0.03, -0.24, SF_MATS.gearBlack); // ağır dipçik
    addBox(0.08, 0.06, 0.18, 0, 0.13, 0.2, GUN_3P_MAT.steel); // üst optik
  }
  return g;
}

function nameplate(name, team, bot) {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 384, 96);
  g.fillStyle = 'rgba(6,10,13,0.76)';
  g.fillRect(24, 20, 336, 48);
  g.fillStyle = TEAMS[team].css;
  g.fillRect(24, 20, 6, 48);
  g.fillStyle = '#eef3f5';
  g.font = 'bold 27px Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 198, 45);
  if (bot) {
    g.fillStyle = 'rgba(240,178,74,0.88)';
    g.font = 'bold 15px Segoe UI, sans-serif';
    g.fillText('SF', 46, 45);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.9, 0.72, 1);
  sprite.position.y = 2.48;
  return sprite;
}

function buildRig(team, weaponId) {
  const mat = rigMaterials(team);
  const body = new THREE.Group();
  const add = (parent, geo, material, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Özel Kuvvetler gövde + JPC Taktik Plaka Taşıyıcı Yelek
  add(body, GEO.torso, mat.camoOlive, 0, 1.16, 0).receiveShadow = true;
  add(body, GEO.collar, mat.camoDark, 0, 1.52, 0);
  add(body, GEO.cummerbund, mat.coyoteVest, 0, 1.12, 0);
  add(body, GEO.plateFront, mat.coyoteVest, 0, 1.22, 0.17);
  add(body, GEO.plateBack, mat.coyoteVest, 0, 1.22, -0.17);
  // Göğüs ve sırt takım kimlik armaları (Red vs Blue)
  add(body, GEO.teamPanelF, mat.teamAccent, 0, 1.34, 0.215);
  add(body, GEO.teamPanelB, mat.teamAccent, 0, 1.32, -0.215);

  add(body, GEO.hips, mat.camoDark, 0, 0.79, 0);
  add(body, GEO.belt, mat.gearBlack, 0, 0.93, 0);

  // MOLLE Şarjör Cepleri (3 adet önde) + Telsiz + Anten
  add(body, GEO.pouch, mat.coyotePouch, -0.16, 1.12, 0.23);
  add(body, GEO.pouch, mat.coyotePouch, 0.0, 1.12, 0.23);
  add(body, GEO.pouch, mat.coyotePouch, 0.16, 1.12, 0.23);
  add(body, GEO.radioBox, mat.gearBlack, -0.22, 1.36, -0.22);
  add(body, GEO.antenna, mat.gearBlack, -0.24, 1.74, -0.22);

  // Taktik Omuz Zırhı / Pauldron (Takım Rengi)
  add(body, GEO.shoulderPad, mat.teamAccent, -0.39, 1.45, 0);
  add(body, GEO.shoulderPad, mat.teamAccent, 0.39, 1.45, 0);

  // Kafa: Kar Maskesi (Balaclava) + Taktik Gözlük + FAST Kask + 4 Tüplü Gece Görüş (GPNVG-18)
  const head = add(body, GEO.balaclava, mat.balaclava, 0, 1.68, 0);
  add(body, GEO.gogglesFrame, mat.gearBlack, 0, 1.69, 0.16);
  add(body, GEO.gogglesLens, mat.goggleLens, 0, 1.69, 0.215);
  add(body, GEO.helmet, mat.helmetMat, 0, 1.71, 0);
  add(body, GEO.helmetRim, mat.teamAccent, 0, 1.73, -0.01);
  add(body, GEO.helmetPatch, mat.teamAccent, -0.24, 1.75, 0);
  add(body, GEO.helmetPatch, mat.teamAccent, 0.24, 1.75, 0);

  // GPNVG-18 Dörtlü Gece Görüş Dürbünü
  add(body, GEO.nvgMount, mat.nvgBody, 0, 1.81, 0.23);
  add(body, GEO.nvgBridge, mat.nvgBody, 0, 1.83, 0.27);
  for (const tx of [-0.12, -0.045, 0.045, 0.12]) {
    const tube = add(body, GEO.nvgTube, mat.nvgBody, tx, 1.81, 0.31);
    tube.rotation.x = Math.PI / 2 - 0.15;
    const lens = add(body, GEO.nvgLens, mat.nvgGlow, tx, 1.795, 0.375);
    lens.rotation.x = Math.PI / 2 - 0.15;
  }

  // Peltor Taktik Kulaklıklar + Sırt Çantası
  const cupL = add(body, GEO.earCup, mat.gearBlack, -0.23, 1.68, 0);
  cupL.rotation.z = Math.PI / 2;
  const cupR = add(body, GEO.earCup, mat.gearBlack, 0.23, 1.68, 0);
  cupR.rotation.z = Math.PI / 2;
  add(body, GEO.backpack, mat.coyotePouch, 0, 1.18, -0.29);

  // Kollar (Takım Pazubentli)
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const elbows = [];
  for (const [arm, x] of [[armL, -0.4], [armR, 0.4]]) {
    arm.position.set(x, 1.43, 0);
    add(arm, GEO.upperArm, mat.camoOlive, 0, -0.17, 0);
    add(arm, GEO.armBand, mat.teamAccent, 0, -0.14, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.35;
    arm.add(elbow);
    add(elbow, GEO.foreArm, mat.camoDark, 0, -0.16, 0);
    add(elbow, GEO.hand, mat.glove, 0, -0.33, 0);
    body.add(arm);
    elbows.push(elbow);
  }

  // Bacaklar (Taktik Dizlikli ve Tabanca Kılıflı)
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  const knees = [];
  for (const [leg, x, isRight] of [[legL, -0.15, false], [legR, 0.15, true]]) {
    leg.position.set(x, 0.82, 0);
    add(leg, GEO.thigh, mat.camoOlive, 0, -0.19, 0);
    if (isRight) add(leg, GEO.holster, mat.gearBlack, 0.12, -0.16, 0.02);
    const knee = new THREE.Group();
    knee.position.y = -0.37;
    leg.add(knee);
    add(knee, GEO.kneePad, mat.gearBlack, 0, -0.02, 0.1);
    add(knee, GEO.shin, mat.camoDark, 0, -0.19, 0);
    add(knee, GEO.boot, mat.boot, 0, -0.37, 0.05);
    body.add(leg);
    knees.push(knee);
  }

  // Silah her zaman sağ elin önünde taktik tutuş noktasında yer alır
  const gun = gunModel(weaponId);
  gun.position.set(0.32, 1.24, 0.42);
  body.add(gun);

  return {
    body,
    head,
    armL,
    armR,
    elbowL: elbows[0],
    elbowR: elbows[1],
    legL,
    legR,
    kneeL: knees[0],
    kneeR: knees[1],
    gun,
    weaponId,
    materials: mat,
  };
}

function disposeRoot(root) {
  root.traverse((obj) => {
    if (obj.isSprite) {
      if (obj.material && obj.material.map) obj.material.map.dispose();
      if (obj.material && obj.material.dispose) obj.material.dispose();
    }
  });
}

function resetPose(rig) {
  rig.body.rotation.set(0, 0, 0);
  rig.body.scale.y = 1;
  rig.armL.rotation.set(0, 0, 0);
  rig.armR.rotation.set(0, 0, 0);
  rig.elbowL.rotation.set(0, 0, 0);
  rig.elbowR.rotation.set(0, 0, 0);
  rig.legL.rotation.set(0, 0, 0);
  rig.legR.rotation.set(0, 0, 0);
  rig.kneeL.rotation.set(0, 0, 0);
  rig.kneeR.rotation.set(0, 0, 0);
}

export class Character {
  constructor(scene, player) {
    this.scene = scene;
    this.id = player.id;
    this.team = player.team;
    this.name = player.name;
    this.bot = player.bot;
    this.root = new THREE.Group();
    this.rig = buildRig(player.team, player.weapon);
    this.body = this.rig.body;
    this.root.add(this.body);

    this.armL = this.rig.armL;
    this.armR = this.rig.armR;
    this.elbowL = this.rig.elbowL;
    this.elbowR = this.rig.elbowR;
    this.legL = this.rig.legL;
    this.legR = this.rig.legR;
    this.kneeL = this.rig.kneeL;
    this.kneeR = this.rig.kneeR;
    this.head = this.rig.head;
    this.gun = this.rig.gun;
    this.weaponId = player.weapon;
    this.attackAnim = 0;

    this.nameplate = nameplate(player.name, player.team, player.bot);
    this.root.add(this.nameplate);

    const hpBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x0a0e10, transparent: true, opacity: 0.75, depthWrite: false }));
    hpBg.scale.set(1.15, 0.1, 1);
    hpBg.position.y = 2.18;
    this.root.add(hpBg);
    this.hpBg = hpBg;
    this.hpFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: TEAMS[player.team].color, transparent: true, depthWrite: false }));
    this.hpFill.scale.set(1.08, 0.06, 1);
    this.hpFill.position.y = 2.18;
    this.root.add(this.hpFill);
    this.isLocal = !!player.isLocal;

    this.target = {
      x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch,
    };
    this.root.position.set(player.x, player.y, player.z);
    this.root.rotation.y = player.veh ? player.yaw : player.yaw + Math.PI;
    this.phase = Math.random() * 10;
    this.dead = false;
    this.wasAlive = true;
    this.crouch = false;
    this.seated = false;
    this.swimming = false;
    this.aiming = false;
    this.health = player.hp;
    this.scene.add(this.root);
  }

  setWeapon(id) {
    if (id === this.weaponId) return;
    this.body.remove(this.gun);
    this.gun = gunModel(id);
    this.gun.position.set(0.32, 1.24, 0.42);
    this.body.add(this.gun);
    this.weaponId = id;
    this.rig.gun = this.gun;
  }

  triggerAttack() {
    this.attackAnim = 1.0;
  }

  update(p, dt) {
    const now = performance.now();
    this.isLocal = !!p.isLocal;
    if (p.attackPulse) this.attackAnim = Math.max(this.attackAnim, p.attackPulse);
    this.attackAnim = Math.max(0, this.attackAnim - dt * 5.2);

    const target = this.target;
    target.x = p.x;
    target.y = p.y;
    target.z = p.z;
    target.yaw = p.yaw;
    target.pitch = p.pitch;
    const facing = p.veh ? p.yaw : p.yaw + Math.PI;

    if (this.isLocal) {
      this.root.position.set(p.x, p.y, p.z);
      this.root.rotation.y = facing;
    } else {
      const dx = p.x - this.root.position.x;
      const dz = p.z - this.root.position.z;
      if (dx * dx + dz * dz > 18 * 18) {
        this.root.position.set(p.x, p.y, p.z);
      } else {
        const k = 1 - Math.exp(-13 * dt);
        this.root.position.x += dx * k;
        this.root.position.z += dz * k;
        this.root.position.y += (p.y - this.root.position.y) * (1 - Math.exp(-16 * dt));
      }
      let dyaw = facing - this.root.rotation.y;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      this.root.rotation.y += dyaw * (1 - Math.exp(-16 * dt));
    }

    if (p.weapon !== this.weaponId) this.setWeapon(p.weapon);
    this.health = p.hp;
    this.aiming = !!p.aim;
    this.crouch = !!p.crouch;
    this.seated = !!p.veh;
    this.swimming = !!p.swim;

    const alive = !!p.alive;
    if (this.wasAlive && !alive) {
      this.deathTime = now;
      this.dead = true;
      this.root.rotation.z = Math.PI / 2;
      this.body.position.y = 0.12;
    } else if (!this.wasAlive && alive) {
      this.dead = false;
      this.root.rotation.z = 0;
      this.body.position.y = 0;
    }
    this.wasAlive = alive;

    const hpRatio = clamp(p.hp / 100, 0, 1);
    this.hpFill.scale.x = 1.08 * hpRatio;
    this.hpFill.position.x = -0.54 * (1 - hpRatio);
    this.hpFill.material.color.setHex(hpRatio > 0.45 ? TEAMS[p.team].color : 0xe2564f);
    const showHudSprites = alive && !this.seated && !this.isLocal;
    this.hpBg.visible = showHudSprites;
    this.hpFill.visible = showHudSprites;
    this.nameplate.visible = showHudSprites;

    if (!alive) return;

    resetPose(this.rig);

    const moving = p.move && !this.seated;
    const speed = p.sprint ? 1.9 : 1.15;
    this.phase += dt * (moving ? speed * 8.5 : 2.2);
    const swing = moving ? (p.sprint ? 0.82 : 0.62) : 0.04;
    const s = Math.sin(this.phase);

    // Bacak yürüyüş animasyonu
    this.legL.rotation.x = s * swing;
    this.legR.rotation.x = -s * swing;
    this.kneeL.rotation.x = Math.max(0, -s) * (moving ? 0.95 : 0.05) + 0.06;
    this.kneeR.rotation.x = Math.max(0, s) * (moving ? 0.95 : 0.05) + 0.06;

    let baseY = 0;
    if (moving) {
      baseY = Math.abs(Math.sin(this.phase * 2)) * 0.035;
      this.body.rotation.z = s * 0.025;
    } else {
      baseY = Math.sin(this.phase * 0.8) * 0.008;
    }

    const pitch = clamp(p.pitch, -1.2, 1.2);
    const isKnife = this.weaponId === 'knife';
    const slash = Math.sin(this.attackAnim * Math.PI);

    // Özel Kuvvetler Silah Tutuşu: Karakter HER ZAMAN silahını iki eliyle (veya bıçağını taktik pozda) tutar!
    this.gun.visible = !this.swimming && !(this.seated && p.seat === 0);
    if (!this.seated && !this.swimming) {
      const bobGun = moving ? Math.sin(this.phase * 2) * 0.025 : 0;
      if (isKnife) {
        // Taktik komando bıçağı tutuşu ve savurma animasyonu (sağ omuz dışından net görünür)
        this.armR.rotation.x = -1.12 + pitch * 0.35 - slash * 0.65;
        this.armR.rotation.y = -0.22 - slash * 0.55;
        this.elbowR.rotation.x = -0.65 + slash * 0.45;
        this.armL.rotation.x = -0.75 + s * swing * 0.25;
        this.armL.rotation.y = 0.28;
        this.elbowL.rotation.x = -0.65;
        this.gun.position.set(0.46 - slash * 0.18, 1.22 + bobGun - slash * 0.05, 0.48 + slash * 0.22);
        this.gun.rotation.set(-pitch * 0.55 + slash * 0.7, -0.08 - slash * 0.6, slash * 0.5);
      } else if (this.aiming) {
        // Nişan alma (ADS): silah sağ omuz hizasında ileri uzanır
        this.armR.rotation.x = -1.45 + pitch * 0.45;
        this.armR.rotation.y = -0.14;
        this.elbowR.rotation.x = -0.45;
        this.armL.rotation.x = -1.32 + pitch * 0.45;
        this.armL.rotation.y = 0.52;
        this.armL.rotation.z = -0.1;
        this.elbowL.rotation.x = -0.88;
        this.gun.position.set(0.42, 1.34 + bobGun * 0.4, 0.52 - slash * 0.06);
        this.gun.rotation.set(-pitch * 0.85 - slash * 0.12, -0.04, 0);
      } else {
        // Taktik hazır tutuş: yürürken ve dururken iki el silahta, 3. şahısta gövdenin sağında net görünür
        this.armR.rotation.x = -1.24 + pitch * 0.35 + s * swing * 0.08;
        this.armR.rotation.y = -0.16;
        this.elbowR.rotation.x = -0.52;
        this.armL.rotation.x = -1.16 + pitch * 0.35 - s * swing * 0.08;
        this.armL.rotation.y = 0.52;
        this.elbowL.rotation.x = -0.78;
        this.gun.position.set(0.45, 1.26 + bobGun, 0.5 - slash * 0.06);
        this.gun.rotation.set(-0.04 - pitch * 0.65 - slash * 0.12, -0.06, 0);
      }
    }

    if (this.crouch && !this.seated && !this.swimming) {
      this.legL.rotation.x = -0.7;
      this.legR.rotation.x = -0.55;
      this.kneeL.rotation.x = 1.15;
      this.kneeR.rotation.x = 1.0;
      baseY -= 0.24;
      this.body.rotation.x = 0.12;
    }

    if (this.seated) {
      this.legL.rotation.x = -1.32;
      this.legR.rotation.x = -1.28;
      this.kneeL.rotation.x = 1.4;
      this.kneeR.rotation.x = 1.32;
      if (p.seat === 0) {
        // Sürücü elleri gidonda/dümende
        this.armL.rotation.x = -0.82;
        this.armR.rotation.x = -0.88;
        this.armL.rotation.y = 0.18;
        this.armR.rotation.y = -0.18;
        this.elbowL.rotation.x = -0.62;
        this.elbowR.rotation.x = -0.58;
      } else {
        // Tekne yolcu nişancıları (Seat 1 & Seat 2) silahlarını ellerinde tutar
        this.armR.rotation.x = -1.28 + pitch * 0.35;
        this.armL.rotation.x = -1.18 + pitch * 0.35;
        this.armL.rotation.y = 0.48;
        this.elbowR.rotation.x = -0.52;
        this.elbowL.rotation.x = -0.78;
        this.gun.position.set(0.32, 1.25, 0.45);
        this.gun.rotation.set(-pitch * 0.7, 0, 0);
      }
      this.body.rotation.x = 0.08;
      baseY -= 0.79;
      this.root.rotation.z = 0;
    } else if (this.swimming) {
      this.body.rotation.x = 1.05;
      baseY += 0.15;
      this.legL.rotation.x = Math.sin(this.phase * 2) * 0.45;
      this.legR.rotation.x = -Math.sin(this.phase * 2) * 0.45;
      this.kneeL.rotation.x = 0.35 + Math.max(0, Math.sin(this.phase * 2)) * 0.35;
      this.kneeR.rotation.x = 0.35 + Math.max(0, -Math.sin(this.phase * 2)) * 0.35;
      this.armL.rotation.x = -0.5 + Math.sin(this.phase * 2) * 0.7;
      this.armR.rotation.x = -0.5 - Math.sin(this.phase * 2) * 0.7;
      this.elbowL.rotation.x = -0.3;
      this.elbowR.rotation.x = -0.3;
    }

    this.body.position.y = baseY;
  }

  dispose() {
    this.scene.remove(this.root);
    disposeRoot(this.root);
  }
}

class LocalRider {
  constructor(team, weaponId, vehicleType) {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.rig = buildRig(team, weaponId);
    this.rig.gun.visible = false;
    this.baseY = -0.79;
    this.rig.body.position.y = this.baseY;
    this.root.add(this.rig.body);
    this.vehicleType = vehicleType;
    this.t = 0;
    this.lean = 0;
    this.poseSeat(vehicleType);
  }

  poseSeat(type) {
    const rig = this.rig;
    resetPose(rig);
    if (type === 'boat') {
      rig.legL.rotation.x = -1.15;
      rig.legR.rotation.x = -1.12;
      rig.kneeL.rotation.x = 1.3;
      rig.kneeR.rotation.x = 1.26;
      rig.armL.rotation.x = -0.56;
      rig.armR.rotation.x = -0.6;
      rig.armL.rotation.y = 0.22;
      rig.armR.rotation.y = -0.22;
      rig.elbowL.rotation.x = -0.72;
      rig.elbowR.rotation.x = -0.68;
      rig.body.rotation.x = 0.05;
    } else {
      rig.legL.rotation.x = -1.5;
      rig.legR.rotation.x = -1.48;
      rig.kneeL.rotation.x = 1.62;
      rig.kneeR.rotation.x = 1.6;
      rig.armL.rotation.x = -0.78;
      rig.armR.rotation.x = -0.8;
      rig.armL.rotation.y = 0.2;
      rig.armR.rotation.y = -0.2;
      rig.elbowL.rotation.x = -0.4;
      rig.elbowR.rotation.x = -0.36;
      rig.body.rotation.x = 0.12;
    }
  }

  ride(dt, speed, lean) {
    this.t += dt;
    const sp = clamp(Math.abs(speed) / 23, 0, 1.4);
    const bob = Math.sin(this.t * (6 + sp * 7)) * (0.008 + sp * 0.018);
    this.rig.body.position.y = this.baseY + bob;
    this.rig.body.rotation.x = (this.vehicleType === 'boat' ? 0.05 : 0.12) + sp * 0.04;

    const l = clamp(lean, -1, 1);
    this.lean = l;
    this.root.rotation.z = -l * 0.45;
    this.rig.body.rotation.z = -l * 0.12;
    this.rig.armL.rotation.y = 0.2 + l * 0.15;
    this.rig.armR.rotation.y = -0.2 + l * 0.15;
  }

  dispose() {
    disposeRoot(this.root);
  }
}

export class CharacterManager {
  constructor(scene) {
    this.scene = scene;
    this.characters = new Map();
    this.localRider = null;
  }

  triggerAttack(playerId) {
    const ch = this.characters.get(playerId);
    if (ch) ch.triggerAttack();
  }

  update(players, localId, dt, localThirdPersonState = null) {
    const seen = new Set();
    for (const p of players) {
      if (p.id === localId) continue;
      seen.add(p.id);
      let ch = this.characters.get(p.id);
      if (!ch) {
        ch = new Character(this.scene, p);
        this.characters.set(p.id, ch);
      }
      ch.root.visible = true;
      ch.update(p, dt);
    }
    if (localThirdPersonState && localId) {
      seen.add(localId);
      let ch = this.characters.get(localId);
      if (!ch) {
        ch = new Character(this.scene, { ...localThirdPersonState, id: localId, isLocal: true });
        this.characters.set(localId, ch);
      }
      ch.root.visible = true;
      ch.update({ ...localThirdPersonState, id: localId, isLocal: true }, dt);
    }
    for (const [id, ch] of this.characters) {
      if (!seen.has(id)) {
        ch.dispose();
        this.characters.delete(id);
      }
    }
  }

  showLocalRider(playerInfo, vehicleGroup, seat, vehicleType, anchor) {
    this.hideLocalRider();
    if (!vehicleGroup) return null;
    const rider = new LocalRider(playerInfo.team, playerInfo.weapon, vehicleType);
    const a = anchor && anchor.isVector3 ? anchor.clone() : new THREE.Vector3(
      (anchor && anchor.x) || 0,
      (anchor && anchor.y) || 0,
      (anchor && anchor.z) || 0,
    );
    rider.root.position.copy(a);
    rider.root.rotation.y = 0;
    rider.seat = seat === 0 ? 0 : 1;
    rider.vehicleType = vehicleType;
    rider.poseSeat(vehicleType);
    vehicleGroup.add(rider.root);
    this.localRider = rider;
    return rider;
  }

  updateLocalRiderRide(dt, speed, lean = 0) {
    if (!this.localRider) return;
    this.localRider.ride(dt, speed, lean);
  }

  hideLocalRider() {
    const rider = this.localRider;
    if (!rider) return;
    if (rider.root.parent) rider.root.parent.remove(rider.root);
    rider.dispose();
    this.localRider = null;
  }

  clear() {
    this.hideLocalRider();
    for (const ch of this.characters.values()) ch.dispose();
    this.characters.clear();
  }
}
