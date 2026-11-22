// Adanın görsel dünyası: arazi, su, gökyüzü, bitki örtüsü, yapılar ve bölgeler.
import * as THREE from '/vendor/three.module.js';
import { WORLD, TEAMS, clamp, smoothstep, dist2d } from '/shared/config.js';
import {
  ZONES, heightAt, terrainHeightAt, slopeAt, fbm, mulberry32,
  TREES, PALMS, ROCKS, BUSHES, GRASS, STRUCTURES,
} from '/shared/map.js';

const SUN_DIR = new THREE.Vector3(0.55, 0.72, 0.42).normalize();
const SUN_OFFSET = SUN_DIR.clone().multiplyScalar(260);
const SUN_COLOR = 0xfff0d4;
// Canlı ada atmosferi: derin gök mavisi -> berrak ufuk -> hafif deniz pusu
const SKY_ZENITH = new THREE.Color(0x164a84);
const SKY_MID = new THREE.Color(0x4b95dc);
const SKY_HORIZON = new THREE.Color(0xe6dcc8);
const HAZE_COLOR = new THREE.Color(0xc8d8e4);
const FOG_COLOR = 0xc8d8e4;

function createProceduralTexturePair(kind, maxAniso = 8) {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');

  const bc = document.createElement('canvas');
  bc.width = size;
  bc.height = size;
  const bg = bc.getContext('2d');

  const seeds = {
    terrain: 101,
    rock: 202,
    bark: 303,
    foliage: 404,
    wood: 505,
    plaster: 606,
    roof: 707,
    metal: 808,
    sand: 909,
    fabric: 1010,
  };
  const rand = mulberry32(seeds[kind] || 777);

  if (kind === 'terrain') {
    // Arazi mikro-detay dokusu: vertex renklerini koruyan nötr-parlak taban üzerinde
    // çim lifleri, toprak granülleri, kum tanecikleri ve mikro gölge gözenekleri.
    g.fillStyle = '#EAE7DF';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#808080';
    bg.fillRect(0, 0, size, size);

    // Yumuşak organik toprak/çim kümeleri (tileable wrap)
    for (let i = 0; i < 420; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 8 + rand() * 24;
      const bright = rand() < 0.52;
      const col = bright ? 'rgba(255,253,246,0.09)' : 'rgba(155,148,134,0.10)';
      const bcol = bright ? 'rgba(175,175,175,0.12)' : 'rgba(85,85,85,0.12)';
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
          g.fillStyle = col;
          g.beginPath();
          g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
          g.fill();
          bg.fillStyle = bcol;
          bg.beginPath();
          bg.arc(x + ox, y + oy, r * 0.85, 0, Math.PI * 2);
          bg.fill();
        }
      }
    }
    // İnce çim bıçakları ve doğal zemin lifleri
    g.lineWidth = 1.15;
    bg.lineWidth = 1.3;
    for (let i = 0; i < 4800; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const ang = (rand() - 0.5) * 1.4 - Math.PI * 0.5;
      const len = 3 + rand() * 8;
      const dx = Math.cos(ang) * len;
      const dy = Math.sin(ang) * len;
      const light = rand() < 0.55;
      g.strokeStyle = light ? 'rgba(255,255,248,0.22)' : 'rgba(130,124,110,0.20)';
      bg.strokeStyle = light ? 'rgba(215,215,215,0.28)' : 'rgba(55,55,55,0.26)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx, y + dy);
      g.stroke();
      bg.beginPath();
      bg.moveTo(x, y);
      bg.lineTo(x + dx, y + dy);
      bg.stroke();
    }
    // Çakıl ve mineral granülleri
    for (let i = 0; i < 3200; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const s = 1 + rand() * 2.4;
      const v = rand() < 0.45 ? 250 : 120;
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.22)`;
      g.fillRect(x, y, s, s);
      bg.fillStyle = v > 180 ? 'rgba(235,235,235,0.32)' : 'rgba(40,40,40,0.32)';
      bg.fillRect(x, y, s, s);
    }
  } else if (kind === 'rock') {
    // Granit / Bazalt kaya dokusu: katmanlı jeolojik damarlar, çatlaklar, liken ve kristal benekler.
    g.fillStyle = '#cfccc4';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#808080';
    bg.fillRect(0, 0, size, size);

    // Yatay/eğimli kaya katmanları (strata)
    for (let y = 0; y < size; y += 14) {
      const bandH = 10 + rand() * 14;
      const shade = 185 + Math.floor((rand() - 0.5) * 44);
      g.fillStyle = `rgba(${shade},${shade - 3},${shade - 9},0.35)`;
      g.fillRect(0, y, size, bandH);
      const bShade = 110 + Math.floor((rand() - 0.5) * 70);
      bg.fillStyle = `rgba(${bShade},${bShade},${bShade},0.45)`;
      bg.fillRect(0, y, size, bandH);
    }
    // Granit mineral kristalleri ve gözenekler
    for (let i = 0; i < 6500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 1 + rand() * 4.5;
      const h = 1 + rand() * 3.2;
      const dark = rand() < 0.52;
      const v = dark ? 95 + Math.floor(rand() * 45) : 225 + Math.floor(rand() * 30);
      g.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.18 + rand() * 0.22})`;
      g.fillRect(x, y, w, h);
      bg.fillStyle = dark ? 'rgba(45,45,45,0.34)' : 'rgba(225,225,225,0.32)';
      bg.fillRect(x, y, w, h);
    }
    // Derin kaya çatlakları (fissures)
    for (let i = 0; i < 48; i++) {
      let cx = rand() * size;
      let cy = rand() * size;
      g.strokeStyle = 'rgba(52,48,44,0.55)';
      g.lineWidth = 1.2 + rand() * 1.8;
      bg.strokeStyle = 'rgba(18,18,18,0.75)';
      bg.lineWidth = 2.0 + rand() * 2.2;
      g.beginPath();
      bg.beginPath();
      g.moveTo(cx, cy);
      bg.moveTo(cx, cy);
      const steps = 5 + Math.floor(rand() * 6);
      for (let s = 0; s < steps; s++) {
        cx += (rand() - 0.35) * 28;
        cy += (rand() - 0.5) * 18;
        g.lineTo(cx, cy);
        bg.lineTo(cx, cy);
      }
      g.stroke();
      bg.stroke();
    }
    // Yosun ve liken lekeleri
    for (let i = 0; i < 36; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const rx = 8 + rand() * 22;
      const ry = 5 + rand() * 14;
      g.fillStyle = `rgba(${118 + Math.floor(rand() * 25)},${138 + Math.floor(rand() * 28)},${92 + Math.floor(rand() * 20)},0.22)`;
      g.beginPath();
      g.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'bark') {
    // Ağaç gövdesi kabuğu: derin dikey yarıklar, lifli sırtlar ve yosun dokunuşları.
    g.fillStyle = '#c4b8a6';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#7c7c7c';
    bg.fillRect(0, 0, size, size);

    for (let x = 0; x < size; x += 6) {
      const ridgeW = 4 + rand() * 6;
      const v = 165 + Math.floor((rand() - 0.5) * 55);
      g.fillStyle = `rgba(${v},${v - 10},${v - 22},0.45)`;
      g.fillRect(x, 0, ridgeW, size);
      const bv = 95 + Math.floor((rand() - 0.5) * 90);
      bg.fillStyle = `rgba(${bv},${bv},${bv},0.55)`;
      bg.fillRect(x, 0, ridgeW, size);
    }
    // Dikey kabuk çatlakları
    for (let i = 0; i < 240; i++) {
      let x = rand() * size;
      let y = rand() * size;
      const len = 35 + rand() * 95;
      g.strokeStyle = rand() < 0.7 ? 'rgba(58,44,32,0.55)' : 'rgba(235,224,208,0.35)';
      g.lineWidth = 1.2 + rand() * 2.0;
      bg.strokeStyle = rand() < 0.7 ? 'rgba(24,24,24,0.72)' : 'rgba(225,225,225,0.52)';
      bg.lineWidth = 1.8 + rand() * 2.2;
      g.beginPath();
      bg.beginPath();
      g.moveTo(x, y);
      bg.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (rand() - 0.5) * 8;
        y += len / 5;
        g.lineTo(x, y);
        bg.lineTo(x, y);
      }
      g.stroke();
      bg.stroke();
    }
  } else if (kind === 'foliage') {
    // Yaprak & Çam İğnesi dokusu: yoğun yaprak kümeleri ve derinlik gözenekleri.
    g.fillStyle = '#dadfd4';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#787878';
    bg.fillRect(0, 0, size, size);

    for (let i = 0; i < 2600; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const rx = 3 + rand() * 8;
      const ry = 2 + rand() * 5;
      const ang = rand() * Math.PI;
      const isHighlight = rand() < 0.55;
      g.fillStyle = isHighlight ? 'rgba(250,255,244,0.28)' : 'rgba(95,112,86,0.28)';
      g.beginPath();
      g.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
      g.fill();

      bg.fillStyle = isHighlight ? 'rgba(225,225,225,0.36)' : 'rgba(35,35,35,0.38)';
      bg.beginPath();
      bg.ellipse(x, y, rx * 0.9, ry * 0.9, ang, 0, Math.PI * 2);
      bg.fill();
    }
  } else if (kind === 'wood') {
    // Yüksek çözünürlüklü kereste kalasları, damarlar, budaklar ve çivi başları.
    g.fillStyle = '#d4c3ad';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#888888';
    bg.fillRect(0, 0, size, size);
    const plankH = 64;
    for (let y = 0; y < size; y += plankH) {
      const tone = (y / plankH) % 2 === 0 ? '#dccbb6' : '#c8b69e';
      g.fillStyle = tone;
      g.fillRect(0, y, size, plankH - 3);
      // Kalas derzi
      g.fillStyle = 'rgba(42,30,20,0.65)';
      g.fillRect(0, y + plankH - 3, size, 3);
      bg.fillStyle = 'rgba(20,20,20,0.85)';
      bg.fillRect(0, y + plankH - 4, size, 4);
      bg.fillStyle = 'rgba(220,220,220,0.5)';
      bg.fillRect(0, y, size, 2);

      // Ahşap damar lifleri
      for (let i = 0; i < 65; i++) {
        const wy = y + 3 + rand() * (plankH - 8);
        const wx = rand() * size;
        const wlen = 30 + rand() * 140;
        const dark = rand() < 0.65;
        g.fillStyle = dark ? 'rgba(75,54,36,0.22)' : 'rgba(255,246,232,0.18)';
        g.fillRect(wx, wy, wlen, 1.5);
        bg.fillStyle = dark ? 'rgba(55,55,55,0.28)' : 'rgba(205,205,205,0.24)';
        g.fillRect(wx, wy, wlen, 1.5);
      }
      // Budak
      if (rand() < 0.6) {
        const kx = 40 + rand() * (size - 80);
        const ky = y + plankH * (0.35 + rand() * 0.3);
        g.fillStyle = 'rgba(62,42,26,0.48)';
        g.beginPath();
        g.ellipse(kx, ky, 9, 5, 0, 0, Math.PI * 2);
        g.fill();
        bg.fillStyle = 'rgba(35,35,35,0.6)';
        bg.beginPath();
        bg.ellipse(kx, ky, 9, 5, 0, 0, Math.PI * 2);
        bg.fill();
      }
    }
  } else if (kind === 'plaster') {
    // Mimari sıva ve beton: mala izleri, ince agrega, çatlaklar ve eskitme.
    // Nötr-açık taban sayesinde bina rengi (kırmızı ahır, krem ev, gri korugan) net korunur.
    g.fillStyle = '#e8e2d5';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#808080';
    bg.fillRect(0, 0, size, size);

    // Beton kalıp / blok derz çizgileri
    for (let y = 0; y < size; y += 128) {
      g.fillStyle = 'rgba(90,84,74,0.18)';
      g.fillRect(0, y, size, 2);
      bg.fillStyle = 'rgba(42,42,42,0.42)';
      bg.fillRect(0, y, size, 2);
    }
    for (let i = 0; i < 4500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const s = 1 + rand() * 3;
      const dark = rand() < 0.5;
      g.fillStyle = dark ? 'rgba(95,88,76,0.16)' : 'rgba(255,252,244,0.18)';
      g.fillRect(x, y, s, s);
      bg.fillStyle = dark ? 'rgba(48,48,48,0.28)' : 'rgba(215,215,215,0.28)';
      bg.fillRect(x, y, s, s);
    }
    for (let i = 0; i < 36; i++) {
      const x = rand() * size;
      const y = rand() * size;
      g.strokeStyle = 'rgba(85,78,66,0.25)';
      g.lineWidth = 1.1;
      bg.strokeStyle = 'rgba(30,30,30,0.45)';
      bg.lineWidth = 1.5;
      g.beginPath();
      bg.beginPath();
      g.moveTo(x, y);
      bg.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 55, y + 18 + rand() * 48);
      bg.lineTo(x + (rand() - 0.5) * 55, y + 18 + rand() * 48);
      g.stroke();
      bg.stroke();
    }
  } else if (kind === 'roof') {
    // Akdeniz kiremit çatısı: oluklu kiremit sıraları, derin gölge ve yosun eskitmesi.
    g.fillStyle = '#ccb6a6';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#808080';
    bg.fillRect(0, 0, size, size);
    const rowH = 32;
    const colW = 32;
    for (let y = 0; y < size; y += rowH) {
      g.fillStyle = (y / rowH) % 2 === 0 ? '#d8c2b2' : '#c2ab9b';
      g.fillRect(0, y, size, rowH - 3);
      // Kiremit alt gölgesi
      g.fillStyle = 'rgba(28,18,14,0.55)';
      g.fillRect(0, y + rowH - 3, size, 3);
      bg.fillStyle = 'rgba(20,20,20,0.85)';
      bg.fillRect(0, y + rowH - 4, size, 4);

      const offset = ((y / rowH) % 2) * (colW / 2);
      for (let x = -offset; x < size; x += colW) {
        // Kiremit sırt aydınlığı
        g.fillStyle = 'rgba(255,244,235,0.22)';
        g.fillRect(x + 6, y + 2, colW - 14, rowH - 6);
        g.fillStyle = 'rgba(38,24,18,0.42)';
        g.fillRect(x, y, 2, rowH - 3);

        bg.fillStyle = 'rgba(225,225,225,0.55)';
        bg.fillRect(x + 6, y + 2, colW - 14, rowH - 6);
        bg.fillStyle = 'rgba(28,28,28,0.75)';
        bg.fillRect(x, y, 3, rowH - 3);
      }
    }
  } else if (kind === 'fabric') {
    // Askeri ripstop çadır/bayrak kumaşı dokusu.
    g.fillStyle = '#ece9e0';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#808080';
    bg.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 8) {
      g.fillStyle = y % 16 === 0 ? 'rgba(95,92,84,0.12)' : 'rgba(255,255,255,0.10)';
      g.fillRect(0, y, size, 2);
      bg.fillStyle = y % 16 === 0 ? 'rgba(55,55,55,0.32)' : 'rgba(210,210,210,0.28)';
      bg.fillRect(0, y, size, 2);
    }
    for (let x = 0; x < size; x += 8) {
      g.fillStyle = 'rgba(95,92,84,0.10)';
      g.fillRect(x, 0, 2, size);
      bg.fillStyle = 'rgba(55,55,55,0.28)';
      bg.fillRect(x, 0, 2, size);
    }
  } else if (kind === 'metal') {
    // Perçinli ve fırçalanmış askeri çelik plaka dokusu.
    g.fillStyle = '#cfd6da';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#808080';
    bg.fillRect(0, 0, size, size);
    // Fırçalanmış metal çizgileri
    for (let i = 0; i < 2400; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 12 + rand() * 55;
      const light = rand() < 0.5;
      g.fillStyle = light ? 'rgba(255,255,255,0.14)' : 'rgba(65,72,78,0.16)';
      g.fillRect(x, y, w, 1.5);
      bg.fillStyle = light ? 'rgba(210,210,210,0.22)' : 'rgba(55,55,55,0.22)';
      bg.fillRect(x, y, w, 1.5);
    }
    // Çelik panel derzleri ve perçinler
    g.strokeStyle = 'rgba(38,44,48,0.55)';
    g.lineWidth = 3;
    g.strokeRect(4, 4, size - 8, size - 8);
    g.beginPath();
    g.moveTo(0, size / 2);
    g.lineTo(size, size / 2);
    g.moveTo(size / 2, 0);
    g.lineTo(size / 2, size);
    g.stroke();

    bg.strokeStyle = 'rgba(20,20,20,0.85)';
    bg.lineWidth = 4;
    bg.strokeRect(4, 4, size - 8, size - 8);
    bg.beginPath();
    bg.moveTo(0, size / 2);
    bg.lineTo(size, size / 2);
    bg.moveTo(size / 2, 0);
    bg.lineTo(size / 2, size);
    bg.stroke();

    for (let p = 24; p < size; p += 48) {
      for (const ry of [14, size / 2 - 12, size / 2 + 12, size - 14]) {
        g.fillStyle = 'rgba(52,58,64,0.65)';
        g.beginPath();
        g.arc(p, ry, 3.2, 0, Math.PI * 2);
        g.fill();
        bg.fillStyle = 'rgba(245,245,245,0.85)';
        bg.beginPath();
        bg.arc(p, ry, 3.2, 0, Math.PI * 2);
        bg.fill();
      }
    }
  } else {
    // Kum torbası / HESCO jeotekstil çuval dokusu ve kum granülleri.
    g.fillStyle = '#ddd2b6';
    g.fillRect(0, 0, size, size);
    bg.fillStyle = '#808080';
    bg.fillRect(0, 0, size, size);
    // Çuval hasır örgüsü
    for (let y = 0; y < size; y += 10) {
      g.fillStyle = y % 20 === 0 ? 'rgba(105,88,58,0.16)' : 'rgba(255,248,228,0.14)';
      g.fillRect(0, y, size, 3);
      bg.fillStyle = y % 20 === 0 ? 'rgba(45,45,45,0.38)' : 'rgba(215,215,215,0.35)';
      bg.fillRect(0, y, size, 3);
    }
    for (let x = 0; x < size; x += 10) {
      g.fillStyle = x % 20 === 0 ? 'rgba(105,88,58,0.14)' : 'rgba(255,248,228,0.12)';
      g.fillRect(x, 0, 3, size);
      bg.fillStyle = x % 20 === 0 ? 'rgba(45,45,45,0.35)' : 'rgba(215,215,215,0.32)';
      bg.fillRect(x, 0, 3, size);
    }
    for (let i = 0; i < 2800; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const dark = rand() < 0.5;
      g.fillStyle = dark ? 'rgba(110,94,62,0.18)' : 'rgba(255,250,235,0.18)';
      g.fillRect(x, y, 2.5, 2.5);
    }
  }

  const repeatMap = {
    terrain: [160, 160],
    rock: [2, 2],
    bark: [1, 3],
    foliage: [2, 2],
    wood: [2, 2],
    plaster: [2, 2],
    roof: [3, 3],
    metal: [2, 2],
    sand: [2, 2],
    fabric: [2, 2],
  };
  const [rx, ry] = repeatMap[kind] || [2, 2];

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;

  const bump = new THREE.CanvasTexture(bc);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(rx, ry);
  bump.anisotropy = maxAniso;

  return { map: tex, bump };
}

function mergeNonIndexedGeometries(geos) {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let totalVerts = 0;
  for (const g of nonIndexed) totalVerts += g.attributes.position.count;
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);
  let vOffset = 0;
  for (const g of nonIndexed) {
    g.computeVertexNormals();
    const pAttr = g.attributes.position;
    const nAttr = g.attributes.normal;
    const uAttr = g.attributes.uv;
    pos.set(pAttr.array, vOffset * 3);
    if (nAttr) norm.set(nAttr.array, vOffset * 3);
    if (uAttr) uv.set(uAttr.array, vOffset * 2);
    vOffset += pAttr.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

function createSculptedTreeTrunkGeo() {
  // Tabanı kök çıkıntılı, gövdesi hafif kıvrımlı ve üst kısmında 3 ana dal çatallanan ağaç gövdesi
  const trunk = new THREE.CylinderGeometry(0.15, 0.38, 1.0, 10, 6);
  trunk.translate(0, 0.5, 0);
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    // Kök tabanı genişlemesi ve 5 oluklu kök sırtı
    if (y < 0.28) {
      const rootT = 1 - y / 0.28;
      const flute = 1 + rootT * (0.38 + 0.26 * Math.cos(ang * 5));
      x *= flute;
      z *= flute;
    }
    // Gövde boyunca hafif doğal kıvrım ve kabuk pürüzü
    const bendX = Math.sin(y * Math.PI * 1.1) * 0.035;
    const bendZ = Math.cos(y * Math.PI * 0.9) * 0.025;
    const barkRipple = 1 + 0.05 * Math.sin(ang * 4 + y * 9);
    pos.setXYZ(i, x * barkRipple + bendX, y, z * barkRipple + bendZ);
  }

  const parts = [trunk];
  const branchSpecs = [
    { y: 0.48, yaw: 0.4, tilt: 0.72, len: 0.44, rTop: 0.05, rBot: 0.11 },
    { y: 0.61, yaw: 2.5, tilt: 0.68, len: 0.42, rTop: 0.045, rBot: 0.10 },
    { y: 0.74, yaw: 4.5, tilt: 0.64, len: 0.36, rTop: 0.04, rBot: 0.085 },
  ];
  for (const b of branchSpecs) {
    const br = new THREE.CylinderGeometry(b.rTop, b.rBot, b.len, 7, 2);
    br.translate(0, b.len * 0.5, 0);
    br.rotateZ(b.tilt);
    br.rotateY(b.yaw);
    br.translate(0, b.y, 0);
    parts.push(br);
  }
  return mergeNonIndexedGeometries(parts);
}

function createSculptedPineBoughGeo() {
  // Etekleri sarkık dallı, katmanlı çam ibresi konisi
  const cone = new THREE.ConeGeometry(1, 1, 14, 4);
  cone.translate(0, 0.5, 0);
  const pos = cone.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.001) {
      const ang = Math.atan2(z, x);
      const lobe = Math.cos(ang * 7) * 0.14 + Math.sin(ang * 5 + y * 6) * 0.07;
      const radialScale = 1 + lobe * (1 - y * 0.45);
      x *= radialScale;
      z *= radialScale;
      // Alt dal uçlarının doğal sarkması
      if (y < 0.25) {
        y -= Math.max(0, Math.cos(ang * 7)) * 0.09 * (1 - y / 0.25);
      }
    }
    pos.setXYZ(i, x, y, z);
  }
  cone.computeVertexNormals();
  return cone;
}

function createSculptedCanopyGeo(seed = 1) {
  // Küresel balon yerine yaprak kümeli organik ağaç tacı geometrisi
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const clump = 1
      + 0.13 * Math.sin(x * 3.8 + seed * 1.7) * Math.cos(z * 3.6 - seed)
      + 0.08 * Math.cos(y * 4.5 + x * 2.4 + seed * 2.3)
      + 0.05 * Math.sin((x + y + z) * 5.2);
    // Alt kısmı hafif basık, üst kısmı kabarık yaprak kubbesi
    const yScale = y < 0 ? 0.78 : 0.96;
    pos.setXYZ(i, x * clump, y * clump * yScale, z * clump);
  }
  geo.computeVertexNormals();
  return geo;
}

function createSculptedPalmTrunkGeo() {
  // Boğumlu, hafif kıvrımlı tropikal palmiye gövdesi + hindistancevizi salkımı
  const trunk = new THREE.CylinderGeometry(0.13, 0.32, 1.0, 9, 14);
  trunk.translate(0, 0.5, 0);
  const pos = trunk.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ring = 1 + 0.075 * Math.sin(y * Math.PI * 28);
    const rootFlare = y < 0.14 ? 1 + (1 - y / 0.14) * 0.26 : 1;
    const curveX = Math.sin(y * Math.PI) * 0.045;
    pos.setXYZ(i, x * ring * rootFlare + curveX, y, z * ring * rootFlare);
  }
  const parts = [trunk];
  for (let c = 0; c < 3; c++) {
    const a = (c / 3) * Math.PI * 2;
    const nut = new THREE.IcosahedronGeometry(0.14, 1);
    nut.translate(Math.cos(a) * 0.13, 0.96, Math.sin(a) * 0.13);
    parts.push(nut);
  }
  return mergeNonIndexedGeometries(parts);
}

function createSculptedPalmFrondGeo() {
  // Yay gibi kıvrılan ve yanlara V-kesitli açılan gerçekçi palmiye yaprağı
  const geo = new THREE.BoxGeometry(0.76, 0.05, 3.6, 4, 1, 9);
  geo.translate(0, 0, 1.8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = clamp(z / 3.6, 0, 1);
    // Kökte dar, ortada geniş, uçta sivri yaprak profili
    const widthProfile = Math.sin(Math.pow(t, 0.65) * Math.PI) * 1.15 + (1 - t) * 0.15;
    // Yerçekimiyle aşağı doğru yay çizmesi
    const archY = Math.sin(t * Math.PI * 0.75) * 0.55 - t * t * 1.25;
    // Orta damardan yanlara doğru V-eğimi
    const vDrop = -Math.abs(x) * 0.35 * Math.sin(t * Math.PI);
    pos.setXYZ(i, x * widthProfile, y + archY + vDrop, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createSculptedRockGeo(variant = 0) {
  // 320 yüzeyli, katmanlı uçurum kesitli, zemine tam oturan kaya geometrisi
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const s1 = 1.7 + variant * 1.31;
  const s2 = 2.9 - variant * 0.73;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Katmanlı kaya terasları (strata) ve köşeli kırık yüzeyler
    const strata = Math.sin(y * 5.5 + s1) * 0.08;
    const ridge1 = Math.cos(x * 3.4 + z * 2.8 + s2) * 0.14;
    const ridge2 = Math.sin((x - z) * 4.2 + y * 3.1 + s1) * 0.09;
    const crag = 0.88 + strata + ridge1 + ridge2;

    x *= crag;
    z *= crag;
    y *= 0.86 + ridge1 * 0.5;

    // Kayanın alt kısmını genişletip aşağı uzat ki yamaçlarda asla havada kalmasın
    if (y < -0.15) {
      y = Math.max(-0.78, y * 1.12);
      x *= 1.04;
      z *= 1.04;
    }

    // Yatay yarıçapı <= 0.99 ile sınırla ki çarpışma silindiriyle %100 örtüşsün
    const hr = Math.hypot(x, z);
    if (hr > 0.99) {
      x = (x / hr) * 0.99;
      z = (z / hr) * 0.99;
    }

    pos.setXYZ(i, x, y, z);
    uv[i * 2] = (x + z) * 0.65 + 0.5;
    uv[i * 2 + 1] = y * 0.75 + 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0;
    this.quality = 'normal';
    this.zoneVisuals = new Map();
    this.zoneOwners = new Map();
    this.clouds = [];
    this.treeMeshes = [];
    this.palmMeshes = [];
    this.bushMeshes = [];
    this.grassMesh = null;
    this.pointLights = [];
    this.unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.geoCache = new Map();

    const maxAniso = Math.min(16, renderer?.capabilities?.getMaxAnisotropy?.() || 8);
    this.texturePairs = {
      terrain: createProceduralTexturePair('terrain', maxAniso),
      rock: createProceduralTexturePair('rock', maxAniso),
      bark: createProceduralTexturePair('bark', maxAniso),
      foliage: createProceduralTexturePair('foliage', maxAniso),
      wood: createProceduralTexturePair('wood', maxAniso),
      plaster: createProceduralTexturePair('plaster', maxAniso),
      roof: createProceduralTexturePair('roof', maxAniso),
      metal: createProceduralTexturePair('metal', maxAniso),
      sand: createProceduralTexturePair('sand', maxAniso),
      fabric: createProceduralTexturePair('fabric', maxAniso),
    };
    this.textures = {
      terrain: this.texturePairs.terrain.map,
      rock: this.texturePairs.rock.map,
      bark: this.texturePairs.bark.map,
      foliage: this.texturePairs.foliage.map,
      wood: this.texturePairs.wood.map,
      plaster: this.texturePairs.plaster.map,
      roof: this.texturePairs.roof.map,
      metal: this.texturePairs.metal.map,
      sand: this.texturePairs.sand.map,
      fabric: this.texturePairs.fabric.map,
    };
    this.bumps = {
      terrain: this.texturePairs.terrain.bump,
      rock: this.texturePairs.rock.bump,
      bark: this.texturePairs.bark.bump,
      foliage: this.texturePairs.foliage.bump,
      wood: this.texturePairs.wood.bump,
      plaster: this.texturePairs.plaster.bump,
      roof: this.texturePairs.roof.bump,
      metal: this.texturePairs.metal.bump,
      sand: this.texturePairs.sand.bump,
      fabric: this.texturePairs.fabric.bump,
    };
    this.materialCache = new Map();
    // Berrak mesafe sisi: yakın ve orta mesafe net ve canlı kalsın, uzak ufuk yumuşasın.
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, 0.00046);
    this.scene.background = new THREE.Color(FOG_COLOR);

    this.setupLights();
    this.buildSky();
    this.buildTerrain();
    this.buildWater();
    this.buildProps();
    this.buildStructures();
    this.buildDock();
    this.buildZoneVisuals();
    this.buildClouds();
  }

  material(color, texture = null, extra = {}) {
    const flat = extra.flatShading ?? false;
    const bumpScale = extra.bumpScale ?? 0.28;
    const key = `${color}:${texture || 'none'}:${extra.roughness || 0.88}:${extra.metalness || 0}:${extra.emissive || 0}:${flat}:${bumpScale}`;
    if (this.materialCache.has(key)) return this.materialCache.get(key);
    // Doku varken de yapının kendi rengini koru (nötr-açık doku ile çarpılarak doğal ton verir)
    const tintedColor = texture
      ? new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.22).getHex()
      : color;
    const params = {
      color: tintedColor,
      roughness: extra.roughness ?? 0.88,
      metalness: extra.metalness ?? 0.04,
      flatShading: flat,
      dithering: true,
    };
    if (texture && this.textures[texture]) {
      params.map = this.textures[texture];
      if (this.bumps[texture]) {
        params.bumpMap = this.bumps[texture];
        params.bumpScale = bumpScale;
      }
    }
    if (extra.emissive) {
      params.emissive = new THREE.Color(extra.emissive);
      params.emissiveIntensity = extra.emissiveIntensity ?? 0.8;
    }
    const mat = new THREE.MeshStandardMaterial(params);
    this.materialCache.set(key, mat);
    return mat;
  }

  // Takım rengini boyanmış kumaş gibi soldurur. Bayrak/çadır gibi geniş
  // yüzeylerde ham doygun rengin "oyuncak" görünmesini engeller.
  weatheredHex(color, amount = 0.2) {
    const c = new THREE.Color(color).lerp(new THREE.Color(0x8f8a7c), amount);
    c.multiplyScalar(0.93);
    return c.getHex();
  }

  setupLights() {
    // Gökten gelen soğuk dolgu ile topraktan yansıyan sıcak dolgu ayrışsın;
    // tek tip aydınlatma yerine hacim hissi veren iki renkli ortam ışığı.
    const hemi = new THREE.HemisphereLight(0xa9c8e0, 0x57462f, 0.9);
    this.scene.add(hemi);
    this.hemi = hemi;

    // Sıcak öğle sonrası güneşi. Gölge kamerası oyuncuyu takip ettiği için
    // tüm adayı (1500 birim) kapsamak yerine 190 birimlik odaklı alan seçildi:
    // 2048'lik harita bu alanda ~0.09 birim/teksel çözünürlük veriyor.
    const sun = new THREE.DirectionalLight(SUN_COLOR, 2.75);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -95;
    sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95;
    sun.shadow.camera.bottom = -95;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 520;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.45;
    sun.shadow.radius = 2;
    sun.position.copy(SUN_OFFSET);
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    // Gölgesiz serin dolgu: güneşe bakan yüzlerin dışındaki kütleleri toparlar.
    const fill = new THREE.DirectionalLight(0x9db9d4, 0.22);
    fill.position.set(-130, 90, -150);
    this.scene.add(fill);
    this.shadowExtent = 95;
  }

  // Gölge kamerasının kapsama alanını değiştirir. Menüde tüm ada, oyunda ise
  // oyuncunun çevresi gölgelenir; aynı 2048 harita yeniden ayrılmaz, sadece
  // projeksiyon güncellenir (ek bellek yok).
  setShadowExtent(extent) {
    if (Math.abs(this.shadowExtent - extent) < 1) return;
    this.shadowExtent = extent;
    const cam = this.sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.far = 260 + extent * 2 + 120;
    cam.updateProjectionMatrix();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(3200, 40, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenithColor: { value: SKY_ZENITH },
        midColor: { value: SKY_MID },
        horizonColor: { value: SKY_HORIZON },
        hazeColor: { value: HAZE_COLOR },
        sunDir: { value: SUN_DIR },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 zenithColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform vec3 hazeColor;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -1.0, 1.0);
          // Uc duraki gradyan: zenit -> orta gok -> sicak ufuk.
          float up = clamp(h * 1.15 + 0.02, 0.0, 1.0);
          vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.32, up));
          col = mix(col, zenithColor, smoothstep(0.28, 0.95, up));
          // Ufuk cizgisinin hemen altinda/ustunde ince pus bandi.
          float band = exp(-pow(max(h, 0.0) * 9.0, 1.6));
          col = mix(col, hazeColor, band * 0.5);

          float sun = max(dot(vDir, sunDir), 0.0);
          // Gunes cekirdegi + ufka yakin genis sicak hale.
          col += vec3(1.0, 0.87, 0.62) * pow(sun, 850.0) * 1.6;
          col += vec3(1.0, 0.79, 0.52) * pow(sun, 9.0) * 0.10;
          float horizonWarm = pow(1.0 - abs(h), 6.0) * pow(sun, 2.0);
          col += vec3(0.16, 0.10, 0.04) * horizonWarm;

          // 8-bit bantlasmayi kirmak icin cok hafif dither.
          float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
          col += dither / 255.0;
          gl_FragColor = vec4(max(col, 0.0), 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.sky = sky;
  }

  buildTerrain() {
    const size = WORLD.size;
    const segments = 220;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const color = new THREE.Color();
    // Doğal, düşük doygunluklu palet: kuru sarımsı çimen, zeytin yeşili,
    // toprak ve kaya. Saf/neon yeşil yerine bunların arasında geçişler var.
    const sandDry = new THREE.Color(0xdcc390);
    const sandWet = new THREE.Color(0x9b8660);
    const grassDry = new THREE.Color(0x6da145);
    const grassOlive = new THREE.Color(0x528a38);
    const grassShade = new THREE.Color(0x3a6828);
    const dirt = new THREE.Color(0x7c6344);
    const rock = new THREE.Color(0x7a7770);
    const rockDark = new THREE.Color(0x5c5a54);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeightAt(x, z);
      pos.setY(i, h);
      const slope = slopeAt(x, z);
      // İki ölçekli gürültü: büyük leke dağılımı ve küçük benek düzensizliği.
      const n = fbm(x * 0.045 + 3, z * 0.045 - 7, 2);
      const fine = fbm(x * 0.16 - 11, z * 0.16 + 5, 2);
      const blotch = fbm(x * 0.028 + 41, z * 0.028 - 19, 3);
      const zoneNear = ZONES.some((zone) => dist2d(x, z, zone.x, zone.z) < zone.radius * 1.25);

      if (h < -0.5) {
        // Su altındaki zemin: ıslak, koyu kum.
        color.copy(sandWet).multiplyScalar(0.58 + n * 0.22);
      } else if (h < 1.4) {
        // Islak kumdan kuru kuma yumuşak geçiş.
        color.copy(sandWet).lerp(sandDry, smoothstep(-0.2, 1.4, h));
        color.multiplyScalar(0.92 + fine * 0.12);
      } else if (h < 3.6) {
        // Kıyı şeridi: gürültüyle kırılan, düzensiz kum-çimen sınırı.
        const t = smoothstep(1.2, 3.6, h + (n - 0.5) * 1.4);
        color.copy(sandDry).lerp(grassDry, t);
        color.multiplyScalar(0.94 + fine * 0.1);
      } else if (h > 38 || slope > 0.62) {
        // Yüksek ve dik yerlerde çıplak kaya; aralarda tutunmuş çimen.
        color.copy(rock).lerp(rockDark, clamp(fine * 0.8 + 0.1, 0, 1));
        color.lerp(grassShade, Math.max(0, 1 - (h - 38) / 14) * 0.22);
        color.multiplyScalar(0.92 + n * 0.14);
      } else {
        // Ana çimen örtüsü: leke leke kuru/olive tonlar, eğimde koyulaşma.
        color.copy(grassOlive).lerp(grassDry, clamp(blotch * 1.15 - 0.1, 0, 1));
        color.lerp(grassShade, smoothstep(0.22, 0.55, slope) * 0.6);
        color.lerp(grassDry, clamp(fine - 0.5, 0, 1) * 0.25);
        color.lerp(rock, smoothstep(26, 44, h) * 0.55);
        // Yüksek frekanslı toprak yamaları (patikalar, aşınmış alanlar).
        const dirtPatch = smoothstep(0.58, 0.78, fbm(x * 0.09 + 7, z * 0.09 - 2, 3));
        color.lerp(dirt, dirtPatch * 0.5);
        if (zoneNear) color.lerp(dirt, 0.3);
      }

      // Tepe başına hafif ton/parlaklık sapması: geniş yüzeyler tek renk görünmesin.
      const v = 0.94 + ((fine * 0.6 + n * 0.4) - 0.5) * 0.14;
      color.multiplyScalar(v);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.textures.terrain,
      bumpMap: this.bumps.terrain,
      bumpScale: 0.34,
      roughness: 0.92,
      metalness: 0.01,
      dithering: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  buildWater() {
    const res = 192;
    const data = new Uint8Array(res * res * 4);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = (i / (res - 1) - 0.5) * WORLD.size;
        const z = (j / (res - 1) - 0.5) * WORLD.size;
        const h = terrainHeightAt(x, z);
        const v = Math.round(clamp((h + 26) / 88, 0, 1) * 255);
        const idx = (j * res + i) * 4;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
    const heightTex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
    heightTex.minFilter = THREE.LinearFilter;
    heightTex.magFilter = THREE.LinearFilter;
    heightTex.wrapS = THREE.ClampToEdgeWrapping;
    heightTex.wrapT = THREE.ClampToEdgeWrapping;
    heightTex.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uSunDir: { value: SUN_DIR },
          uSunColor: { value: new THREE.Color(0xffe7c4) },
          uHeight: { value: heightTex },
          uWorldSize: { value: WORLD.size },
          uCamPos: { value: new THREE.Vector3() },
        },
      ]),
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          // Uc farkli frekansli dalga: duz sinus yerine duzensiz yuzey.
          float wave = sin(wp.x * 0.055 + uTime * 1.05) * 0.16
                     + sin(wp.z * 0.075 - uTime * 0.85) * 0.12
                     + sin((wp.x + wp.z) * 0.033 + uTime * 0.48) * 0.22
                     + sin((wp.x - wp.z * 0.7) * 0.13 + uTime * 1.7) * 0.05;
          wp.y += wave;
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform sampler2D uHeight;
        uniform float uWorldSize;
        uniform vec3 uCamPos;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          vec2 huv = vWorld.xz / uWorldSize + 0.5;
          float h = texture2D(uHeight, huv).r * 88.0 - 26.0;
          // Ada disinda yukseklik dokusu kenara kenetlenir; orayi derin deniz say.
          float inside = step(0.0, huv.x) * step(huv.x, 1.0) * step(0.0, huv.y) * step(huv.y, 1.0);
          float depth = mix(24.0, max(0.0, -h), inside);
          vec3 viewDir = normalize(uCamPos - vWorld);

          // Vertex dalgalariyla eslesen analitik normaller.
          float dx = cos(vWorld.x * 0.055 + uTime * 1.05) * 0.055 * 0.16
                   + cos((vWorld.x + vWorld.z) * 0.033 + uTime * 0.48) * 0.033 * 0.22
                   + cos((vWorld.x - vWorld.z * 0.7) * 0.13 + uTime * 1.7) * 0.13 * 0.05;
          float dz = -cos(vWorld.z * 0.075 - uTime * 0.85) * 0.075 * 0.12
                   + cos((vWorld.x + vWorld.z) * 0.033 + uTime * 0.48) * 0.033 * 0.22
                   - cos((vWorld.x - vWorld.z * 0.7) * 0.13 + uTime * 1.7) * 0.13 * 0.035;
          vec3 normal = normalize(vec3(-dx, 1.0, -dz));

          // Schlick fresnel: tepeden bakinca su koyu, ufka bakinca gok rengi.
          float ndv = max(dot(normal, viewDir), 0.0);
          float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

          vec3 shallow = vec3(0.08, 0.44, 0.50);
          vec3 deep = vec3(0.014, 0.105, 0.220);
          vec3 base = mix(shallow, deep, smoothstep(0.0, 11.0, depth));
          // Sig kiyida kumun suya vuran turkuaz-altin yansimasi.
          base = mix(base, vec3(0.18, 0.48, 0.46), smoothstep(2.8, 0.0, depth) * 0.42);

          vec3 reflectDir = reflect(-viewDir, normal);
          vec3 skyTint = mix(vec3(0.74, 0.76, 0.70), vec3(0.34, 0.50, 0.64),
                             clamp(reflectDir.y * 1.6, 0.0, 1.0));
          vec3 col = mix(base, skyTint, fres * 0.75);

          vec3 halfV = normalize(uSunDir + viewDir);
          float spec = pow(max(dot(normal, halfV), 0.0), 160.0);
          col += uSunColor * spec * 1.15;

          // Kiyi kopugu: derinlige bagli bant + iki frekansli kirilma.
          float foamBand = smoothstep(1.5, 0.02, depth);
          float foamNoise = 0.55 + 0.45 * sin(vWorld.x * 0.62 + vWorld.z * 0.81 + uTime * 1.9);
          foamNoise *= 0.7 + 0.3 * sin(vWorld.x * 1.7 - vWorld.z * 1.3 - uTime * 2.6);
          float foam = foamBand * foamNoise;
          col = mix(col, vec3(0.86, 0.89, 0.86), clamp(foam, 0.0, 1.0) * 0.6);

          float alpha = mix(0.62, 0.95, smoothstep(0.0, 7.0, depth));
          alpha = max(alpha, fres * 0.85);
          alpha = max(alpha, foam * 0.85);
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }
      `,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WORLD.waterLevel;
    water.renderOrder = 2;
    this.scene.add(water);
    this.water = water;
    this.waterMat = mat;
  }

  buildProps() {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const moss = new THREE.Color(0x566b3c);
    const propRand = mulberry32(20261122);

    // --- Kök Çıkıntılı ve Dallı Ağaç Gövdeleri (512x512 Kabuk Dokulu) -----
    const trunkGeo = createSculptedTreeTrunkGeo();
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.bark,
      bumpMap: this.bumps.bark,
      bumpScale: 0.42,
      roughness: 0.94,
      flatShading: false,
    });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES.length);
    trunks.castShadow = true;
    trunks.receiveShadow = true;

    const pines = TREES.filter((t) => t.variant === 0);
    const leafs = TREES.filter((t) => t.variant === 1);

    // Çam Ağaçları: 4 katmanlı, etekleri sarkık ibreli ve dokulu kozalaklı çam dalları
    const pineGeo = createSculptedPineBoughGeo();
    const pineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.foliage,
      bumpMap: this.bumps.foliage,
      bumpScale: 0.36,
      roughness: 0.88,
      flatShading: false,
    });
    const pineLayers = [
      { y: 0.28, r: 2.55, h: 3.3, j: 0.22, lightBias: -0.03 },
      { y: 0.47, r: 2.1, h: 3.0, j: 0.18, lightBias: -0.01 },
      { y: 0.65, r: 1.58, h: 2.65, j: 0.14, lightBias: 0.015 },
      { y: 0.82, r: 1.05, h: 2.25, j: 0.09, lightBias: 0.04 },
    ];
    const pineMeshes = pineLayers.map(() => {
      const m = new THREE.InstancedMesh(pineGeo, pineMat, pines.length);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    });

    // Geniş Yapraklı Ağaçlar: 5 ayrı organik yaprak kubbesinden oluşan zengin ağaç tacı
    const leafGeos = [1, 2, 3, 4, 5].map((seed) => createSculptedCanopyGeo(seed));
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.foliage,
      bumpMap: this.bumps.foliage,
      bumpScale: 0.34,
      roughness: 0.88,
      flatShading: false,
    });
    const leafBlobs = [
      { x: 0, y: 0.72, z: 0, r: 2.35, h: 1.85, lightBias: 0.01 },
      { x: 1.18, y: 0.6, z: 0.48, r: 1.68, h: 1.42, lightBias: -0.02 },
      { x: -1.05, y: 0.63, z: -0.78, r: 1.56, h: 1.35, lightBias: -0.025 },
      { x: -0.45, y: 0.62, z: 1.12, r: 1.5, h: 1.3, lightBias: -0.015 },
      { x: 0.18, y: 0.86, z: -0.15, r: 1.55, h: 1.28, lightBias: 0.045 },
    ];
    const leafMeshes = leafBlobs.map((_, idx) => {
      const m = new THREE.InstancedMesh(leafGeos[idx], leafMat, leafs.length);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    });

    TREES.forEach((tree, i) => {
      dummy.position.set(tree.x, tree.y - 0.18, tree.z);
      dummy.rotation.set((propRand() - 0.5) * 0.05, tree.rot, (propRand() - 0.5) * 0.05);
      const sx = tree.scale * (0.94 + propRand() * 0.14);
      const sz = tree.scale * (0.94 + propRand() * 0.14);
      dummy.scale.set(sx, tree.h * 0.66, sz);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.072 + propRand() * 0.025, 0.24 + propRand() * 0.12, 0.24 + propRand() * 0.08);
      trunks.setColorAt(i, color);
    });

    pines.forEach((tree, i) => {
      const leanX = (propRand() - 0.5) * 0.55;
      const leanZ = (propRand() - 0.5) * 0.55;
      const hue = 0.28 + propRand() * 0.045;
      const sat = 0.34 + propRand() * 0.14;
      const light = 0.24 + propRand() * 0.08;
      const winterTint = propRand() < 0.08;
      pineLayers.forEach((layer, li) => {
        const jx = (propRand() - 0.5) * layer.j;
        const jz = (propRand() - 0.5) * layer.j;
        dummy.position.set(
          tree.x + leanX * layer.y + jx,
          tree.y + tree.h * layer.y,
          tree.z + leanZ * layer.y + jz,
        );
        dummy.rotation.set(
          (propRand() - 0.5) * 0.04,
          tree.rot + li * 0.62 + propRand() * 0.25,
          (propRand() - 0.5) * 0.04,
        );
        dummy.scale.set(
          layer.r * tree.scale * (0.94 + propRand() * 0.12),
          layer.h * tree.scale * (0.92 + propRand() * 0.15),
          layer.r * tree.scale * (0.94 + propRand() * 0.12),
        );
        dummy.updateMatrix();
        pineMeshes[li].setMatrixAt(i, dummy.matrix);
        if (winterTint) {
          color.setHSL(0.18 + propRand() * 0.03, 0.28, 0.26 + layer.lightBias + propRand() * 0.05);
        } else {
          color.setHSL(
            hue + (propRand() - 0.5) * 0.018,
            sat,
            clamp(light + layer.lightBias + (propRand() - 0.5) * 0.025, 0.16, 0.42),
          );
        }
        pineMeshes[li].setColorAt(i, color);
      });
    });

    leafs.forEach((tree, i) => {
      const autumn = propRand() < 0.1;
      const baseHue = autumn ? 0.095 + propRand() * 0.03 : 0.235 + propRand() * 0.065;
      const baseSat = autumn ? 0.44 : 0.35 + propRand() * 0.14;
      const baseLight = autumn ? 0.36 : 0.29 + propRand() * 0.09;
      leafBlobs.forEach((blob, bi) => {
        const cos = Math.cos(tree.rot);
        const sin = Math.sin(tree.rot);
        const ox = blob.x * cos - blob.z * sin;
        const oz = blob.x * sin + blob.z * cos;
        const s = tree.scale * (0.94 + propRand() * 0.14);
        dummy.position.set(tree.x + ox * tree.scale, tree.y + tree.h * blob.y, tree.z + oz * tree.scale);
        dummy.rotation.set(propRand() * 0.45, propRand() * Math.PI * 2, propRand() * 0.35);
        dummy.scale.set(blob.r * s, blob.h * s, blob.r * s * (0.92 + propRand() * 0.16));
        dummy.updateMatrix();
        leafMeshes[bi].setMatrixAt(i, dummy.matrix);
        color.setHSL(
          baseHue + (propRand() - 0.5) * 0.016,
          baseSat,
          clamp(baseLight + blob.lightBias + (propRand() - 0.5) * 0.03, 0.18, 0.48),
        );
        leafMeshes[bi].setColorAt(i, color);
      });
    });

    trunks.instanceMatrix.needsUpdate = true;
    if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
    this.scene.add(trunks);
    this.treeMeshes.push(trunks);
    pineMeshes.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.scene.add(m);
      this.treeMeshes.push(m);
    });
    leafMeshes.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.scene.add(m);
      this.treeMeshes.push(m);
    });

    // --- Kıyı Palmiyeleri (shared/map.js PALMS ile deterministik & çarpışmalı) ---
    const palmTrunkGeo = createSculptedPalmTrunkGeo();
    const palmTrunkMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.bark,
      bumpMap: this.bumps.bark,
      bumpScale: 0.38,
      roughness: 0.92,
      flatShading: false,
    });
    const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, Math.max(1, PALMS.length));
    palmTrunks.castShadow = true;
    palmTrunks.receiveShadow = true;
    palmTrunks.count = PALMS.length;

    const frondGeo = createSculptedPalmFrondGeo();
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.foliage,
      bumpMap: this.bumps.foliage,
      bumpScale: 0.3,
      roughness: 0.86,
      flatShading: false,
    });
    const frondsPerPalm = 9;
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, Math.max(1, PALMS.length * frondsPerPalm));
    fronds.castShadow = true;
    fronds.receiveShadow = true;
    fronds.count = 0;

    let frondIndex = 0;
    PALMS.forEach((palm, i) => {
      const h = palm.h;
      dummy.position.set(palm.x, palm.y - 0.14, palm.z);
      dummy.rotation.set(0, palm.rot, palm.lean);
      dummy.scale.set(palm.scale, h, palm.scale);
      dummy.updateMatrix();
      palmTrunks.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.09 + propRand() * 0.02, 0.22 + propRand() * 0.08, 0.31 + propRand() * 0.06);
      palmTrunks.setColorAt(i, color);

      // Eğik ve hafif kıvrımlı gövdenin tepe noktası
      const leanOffset = Math.sin(palm.lean) * h;
      const topX = palm.x - leanOffset * Math.cos(palm.rot);
      const topZ = palm.z + leanOffset * Math.sin(palm.rot);
      const topY = palm.y + Math.cos(palm.lean) * h - 0.12;
      for (let f = 0; f < frondsPerPalm; f++) {
        const isUpperCrown = f >= 6;
        const ringIdx = isUpperCrown ? f - 6 : f;
        const ringCount = isUpperCrown ? 3 : 6;
        const ang = palm.rot + (ringIdx / ringCount) * Math.PI * 2 + (isUpperCrown ? 0.52 : 0) + (propRand() - 0.5) * 0.24;
        const pitch = isUpperCrown ? -0.32 + propRand() * 0.14 : 0.08 + propRand() * 0.22;
        const fs = palm.scale * (isUpperCrown ? 0.78 + propRand() * 0.18 : 0.96 + propRand() * 0.22);
        dummy.position.set(topX + Math.cos(ang) * 0.1, topY + (isUpperCrown ? 0.12 : 0), topZ + Math.sin(ang) * 0.1);
        dummy.rotation.order = 'YXZ';
        dummy.rotation.set(pitch, ang, (propRand() - 0.5) * 0.15);
        dummy.scale.set(fs, fs, fs);
        dummy.updateMatrix();
        fronds.setMatrixAt(frondIndex, dummy.matrix);
        color.setHSL(
          0.24 + propRand() * 0.04,
          0.32 + propRand() * 0.1,
          (isUpperCrown ? 0.29 : 0.24) + propRand() * 0.06,
        );
        fronds.setColorAt(frondIndex, color);
        frondIndex++;
      }
      dummy.rotation.order = 'XYZ';
    });
    fronds.count = frondIndex;
    palmTrunks.instanceMatrix.needsUpdate = true;
    if (palmTrunks.instanceColor) palmTrunks.instanceColor.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;
    if (PALMS.length) {
      this.scene.add(palmTrunks);
      this.scene.add(fronds);
      this.palmMeshes.push(palmTrunks, fronds);
    }

    // --- Kayalar & Çoklu Kaya Kütleleri (512x512 Granit Dokulu & %100 Katı Çarpışmalı) ---
    const rockGeos = [0, 1, 2, 3].map((v) => createSculptedRockGeo(v));
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.rock,
      bumpMap: this.bumps.rock,
      bumpScale: 0.46,
      roughness: 0.88,
      metalness: 0.04,
      flatShading: false,
    });
    const rockGroups = [[], [], [], []];
    ROCKS.forEach((r) => rockGroups[r.variant % 4].push(r));
    rockGroups.forEach((list, gi) => {
      if (!list.length) return;
      // Ana kaya kütlesi + tabanına gömülü yavru destek kayası (toplam list.length * 2)
      const mesh = new THREE.InstancedMesh(rockGeos[gi], rockMat, list.length * 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      let idx = 0;
      list.forEach((r) => {
        const rx = r.rx || r.scale * 1.05;
        const ry = r.ry || r.scale * 0.82;
        const rz = r.rz || r.scale * 1.05;
        // Ana kaya: çarpışma silindiri (r.r = max(rx, rz) * 1.03) ile birebir örtüşür
        dummy.position.set(r.x, r.y + ry * 0.34, r.z);
        dummy.rotation.set(r.tiltX || 0, r.rot, r.tiltZ || 0);
        dummy.scale.set(rx, ry, rz);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);

        const g = 0.56 + propRand() * 0.2;
        color.setRGB(g * 1.02, g, g * 0.94);
        if (propRand() < 0.42) color.lerp(moss, 0.22 + propRand() * 0.24);
        mesh.setColorAt(idx, color);
        idx++;

        // Yavru taban kayası: ana kayanın çarpışma yarıçapı (r.r) içinde kalarak doğal kaya grubu oluşturur
        const subAng = r.rot + 1.15;
        const subOffset = Math.min(rx, rz) * 0.36;
        const subScaleX = rx * 0.52;
        const subScaleY = ry * 0.54;
        const subScaleZ = rz * 0.50;
        dummy.position.set(
          r.x + Math.cos(subAng) * subOffset,
          r.y + subScaleY * 0.24,
          r.z + Math.sin(subAng) * subOffset,
        );
        dummy.rotation.set(-(r.tiltZ || 0) * 0.8, r.rot + 2.1, (r.tiltX || 0) * 0.8);
        dummy.scale.set(subScaleX, subScaleY, subScaleZ);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        const sg = g * (0.88 + propRand() * 0.16);
        color.setRGB(sg, sg * 0.99, sg * 0.92);
        if (propRand() < 0.5) color.lerp(moss, 0.28);
        mesh.setColorAt(idx, color);
        idx++;
      });
      mesh.count = idx;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
    });

    // --- Çalılar (512x512 Yaprak Dokulu & Organik Küme Geometrili) --------
    const bushGeos = [
      createSculptedCanopyGeo(11),
      createSculptedCanopyGeo(17),
      createSculptedCanopyGeo(23),
    ];
    const bushMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.foliage,
      bumpMap: this.bumps.foliage,
      bumpScale: 0.28,
      roughness: 0.92,
      flatShading: false,
    });
    const bushGroups = [[], [], []];
    BUSHES.forEach((b) => bushGroups[b.variant % 3].push(b));
    bushGroups.forEach((list, gi) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(bushGeos[gi], bushMat, list.length);
      mesh.receiveShadow = true;
      list.forEach((b, i) => {
        const s = b.scale * (0.92 + propRand() * 0.22);
        dummy.position.set(
          b.x + (propRand() - 0.5) * 0.4,
          b.y + b.scale * 0.34,
          b.z + (propRand() - 0.5) * 0.4,
        );
        dummy.rotation.set(0, b.rot + propRand() * 0.4, 0);
        dummy.scale.set(s, s * (0.58 + propRand() * 0.2), s * (0.92 + propRand() * 0.18));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (propRand() < 0.16) color.setHSL(0.14 + propRand() * 0.04, 0.30, 0.32 + propRand() * 0.06);
        else color.setHSL(0.23 + propRand() * 0.07, 0.26 + propRand() * 0.12, 0.27 + propRand() * 0.09);
        mesh.setColorAt(i, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.userData.fullCount = list.length;
      this.scene.add(mesh);
      this.bushMeshes.push(mesh);
    });

    // --- Çim Tutamları ----------------------------------------------------
    const grassGeo = new THREE.ConeGeometry(0.11, 0.75, 4);
    grassGeo.translate(0, 0.375, 0);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true });
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, GRASS.length);
    GRASS.forEach((gr, i) => {
      dummy.position.set(gr.x, gr.y, gr.z);
      dummy.rotation.set((propRand() - 0.5) * 0.3, gr.rot, (propRand() - 0.5) * 0.3);
      dummy.scale.set(gr.scale, gr.scale * (0.75 + propRand() * 0.6), gr.scale);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.21 + propRand() * 0.08, 0.28 + propRand() * 0.14, 0.29 + propRand() * 0.1);
      grass.setColorAt(i, color);
    });
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.userData.fullCount = GRASS.length;
    this.scene.add(grass);
    this.grassMesh = grass;
  }

  addBox(parent, w, h, d, x, y, z, color, texture = null, rotY = 0, shadow = true) {
    const mesh = new THREE.Mesh(this.unitBoxGeo, this.material(color, texture));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  }

  addCyl(parent, rt, rb, h, seg, x, y, z, color, texture = null, shadow = true) {
    const key = `cyl:${rt}:${rb}:${h}:${seg}`;
    let geo = this.geoCache.get(key);
    if (!geo) {
      geo = new THREE.CylinderGeometry(rt, rb, h, seg);
      this.geoCache.set(key, geo);
    }
    const mesh = new THREE.Mesh(geo, this.material(color, texture));
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  }

  addCone(parent, r, h, seg, x, y, z, color, texture = null, rotY = 0, shadow = true) {
    const key = `cone:${r}:${h}:${seg}`;
    let geo = this.geoCache.get(key);
    if (!geo) {
      geo = new THREE.ConeGeometry(r, h, seg);
      this.geoCache.set(key, geo);
    }
    const mesh = new THREE.Mesh(geo, this.material(color, texture));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  }

  buildStructures() {
    for (const s of STRUCTURES) {
      const group = new THREE.Group();
      group.position.set(s.x, s.y, s.z);
      group.rotation.y = s.rot;
      const zone = ZONES.find((z) => z.id === s.zoneId);
      const teamColor = zone && zone.team ? TEAMS[zone.team].color : 0x8a7d63;
      // Kumaş/boya yüzeylerinde ham takım rengi yerine güneşte solmuş tonu kullan.
      const teamTint = this.weatheredHex(teamColor, zone && zone.team ? 0.24 : 0.08);
      const scale = s.scale || 1;

      switch (s.type) {
        case 'tent': {
          this.addBox(group, 5.2, 1.5, 4.2, 0, 0.75, 0, 0xb9ad8c, 'plaster');
          const roof = this.addCone(group, 3.7, 2.1, 4, 0, 2.15, 0, teamTint, null, Math.PI / 4);
          roof.scale.z = 0.82;
          this.addBox(group, 1.1, 1.3, 0.08, 0, 0.65, 2.14, 0x2e2a22);
          this.addBox(group, 0.16, 2.4, 0.16, 2.4, 1.2, 1.9, 0x4d3b28, 'wood');
          const flag = this.addBox(group, 1.1, 0.65, 0.04, 2.95, 2.15, 1.9, teamTint);
          flag.castShadow = false;
          break;
        }
        case 'tower': {
          for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
            this.addBox(group, 0.28, 7, 0.28, lx, 3.5, lz, 0x5d4229, 'wood');
          }
          this.addBox(group, 4.2, 0.3, 4.2, 0, 7.1, 0, 0x6b4b2e, 'wood');
          this.addBox(group, 4.2, 0.12, 0.12, 0, 7.9, 2.05, 0x5d4229, 'wood');
          this.addBox(group, 4.2, 0.12, 0.12, 0, 7.9, -2.05, 0x5d4229, 'wood');
          this.addBox(group, 0.12, 0.12, 4.2, 2.05, 7.9, 0, 0x5d4229, 'wood');
          this.addBox(group, 0.12, 0.12, 4.2, -2.05, 7.9, 0, 0x5d4229, 'wood');
          this.addCone(group, 3.1, 1.7, 4, 0, 8.9, 0, teamTint, null, Math.PI / 4);
          // Merdiven
          for (let i = 0; i < 10; i++) {
            this.addBox(group, 0.6, 0.08, 0.08, 0, 0.7 + i * 0.68, 2.1, 0x4d3b28, 'wood');
          }
          this.addBox(group, 0.08, 7, 0.08, -0.3, 3.5, 2.1, 0x4d3b28, 'wood');
          this.addBox(group, 0.08, 7, 0.08, 0.3, 3.5, 2.1, 0x4d3b28, 'wood');
          break;
        }
        case 'house': {
          this.addBox(group, 7, 3.3, 5.4, 0, 1.65, 0, 0xd2c7ab, 'plaster');
          const roof = this.addCone(group, 4.9, 2.4, 4, 0, 4.4, 0, 0x6b4433, 'roof', Math.PI / 4);
          roof.scale.z = 0.8;
          this.addBox(group, 1.2, 2.1, 0.16, 0, 1.05, 2.76, 0x4a3423, 'wood');
          this.addBox(group, 1.1, 1, 0.1, -2, 1.9, 2.76, 0x2f3b42);
          this.addBox(group, 1.1, 1, 0.1, 2, 1.9, 2.76, 0x2f3b42);
          this.addBox(group, 0.6, 1.6, 0.6, 2.2, 5.1, -1, 0x6a6258);
          break;
        }
        case 'barn': {
          this.addBox(group, 9, 4.6, 7, 0, 2.3, 0, 0x7a453a, 'plaster');
          const roof = this.addCone(group, 6.1, 2.6, 4, 0, 5.9, 0, 0x4a3126, 'roof', Math.PI / 4);
          roof.scale.z = 0.82;
          this.addBox(group, 2.8, 3.4, 0.15, 0, 1.7, 3.56, 0x4a3423, 'wood');
          this.addBox(group, 3.1, 0.18, 0.1, 0, 2.6, 3.64, 0xd8d0bd);
          this.addBox(group, 3.1, 0.18, 0.1, 0, 0.9, 3.64, 0xd8d0bd);
          break;
        }
        case 'silo': {
          this.addCyl(group, 2.2, 2.4, 9, 14, 0, 4.5, 0, 0x9aa0a2, 'metal');
          const dome = new THREE.Mesh(new THREE.SphereGeometry(2.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.material(0x7d8589, 'metal'));
          dome.position.y = 9;
          dome.castShadow = true;
          group.add(dome);
          for (const y of [1.5, 4.5, 7.5]) this.addCyl(group, 2.32, 2.32, 0.15, 14, 0, y, 0, 0x5f6668);
          this.addBox(group, 0.1, 8, 0.1, 2.4, 4, 0.6, 0x555b5d);
          break;
        }
        case 'hut': {
          this.addBox(group, 4.2, 2.8, 3.6, 0, 1.4, 0, 0x8a6a45, 'wood');
          const roof = this.addCone(group, 3.1, 1.5, 4, 0, 3.45, 0, 0x4a3423, 'roof', Math.PI / 4);
          roof.scale.z = 0.82;
          this.addBox(group, 0.9, 1.7, 0.1, 0, 0.85, 1.82, 0x3d2c1d);
          break;
        }
        case 'lighthouse': {
          this.addCyl(group, 3.4, 3.8, 1.6, 16, 0, 0.8, 0, 0x8d8c80);
          this.addCyl(group, 2.1, 2.9, 12, 16, 0, 7.6, 0, 0xdcd6c6);
          for (const y of [3.2, 7.2, 11.2]) this.addCyl(group, 2.62, 2.78, 0.5, 16, 0, y, 0, 0x9d4a41);
          this.addCyl(group, 2.8, 2.8, 0.35, 16, 0, 13.7, 0, 0x3a3f42);
          this.addCyl(group, 1.55, 1.7, 1.8, 12, 0, 14.8, 0, 0xffe6a3, null, true);
          this.addCone(group, 2.15, 1.5, 12, 0, 16.4, 0, 0x8a4239);
          const light = new THREE.PointLight(0xffd28a, 6, 55, 2);
          light.position.set(0, 14.8, 0);
          light.userData.baseIntensity = 6;
          group.add(light);
          this.pointLights.push(light);
          break;
        }
        case 'crate': {
          this.addBox(group, 1.5, 1.2, 1.5, 0, 0.6, 0, 0x8a6238, 'wood');
          this.addBox(group, 1.56, 0.12, 1.56, 0, 1.1, 0, 0x5f4529, 'wood');
          this.addBox(group, 1.56, 0.12, 1.56, 0, 0.15, 0, 0x5f4529, 'wood');
          break;
        }
        case 'hay': {
          const hay = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2, 12), this.material(0xc7a85c, 'sand'));
          hay.rotation.z = Math.PI / 2;
          hay.position.y = 1.1;
          hay.castShadow = true;
          hay.receiveShadow = true;
          group.add(hay);
          break;
        }
        case 'radio': {
          this.addCyl(group, 0.12, 0.2, 7, 6, 0, 3.5, 0, 0x6f7678, 'metal');
          this.addBox(group, 2.4, 0.12, 0.12, 0, 5.4, 0, 0x8b9294, 'metal');
          this.addBox(group, 0.7, 0.7, 0.5, 0, 6.8, 0, 0x51585a, 'metal');
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.material(0xff3b30, null, { emissive: 0xff3b30, emissiveIntensity: 2 }));
          led.position.set(0, 7.2, 0);
          group.add(led);
          break;
        }
        case 'sandbag': {
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 1.2 - Math.PI * 0.6;
            const x = Math.cos(a) * 2.2;
            const z = Math.sin(a) * 2.2;
            this.addBox(group, 0.9, 0.36, 0.55, x, 0.18, z, 0xb3a374, 'sand', -a);
            this.addBox(group, 0.9, 0.36, 0.55, x, 0.53, z, 0xa8986b, 'sand', -a);
          }
          break;
        }
        case 'bunker': {
          // Tahkimatlı Askeri Beton Korugan & Komuta Binası
          this.addBox(group, 7.4 * scale, 3.2 * scale, 6.2 * scale, 0, 1.6 * scale, 0, 0x7b7e78, 'plaster');
          this.addBox(group, 8.0 * scale, 0.45 * scale, 6.8 * scale, 0, 3.35 * scale, 0, 0x5c605b, 'metal');
          // Takım rengi şerit ve korugan mazgalları
          this.addBox(group, 7.5 * scale, 0.32 * scale, 6.3 * scale, 0, 2.75 * scale, 0, teamTint);
          this.addBox(group, 2.2 * scale, 0.55 * scale, 0.18 * scale, -1.6 * scale, 1.85 * scale, 3.12 * scale, 0x181c1e);
          this.addBox(group, 2.2 * scale, 0.55 * scale, 0.18 * scale, 1.6 * scale, 1.85 * scale, 3.12 * scale, 0x181c1e);
          this.addBox(group, 1.5 * scale, 2.3 * scale, 0.2 * scale, 0, 1.15 * scale, -3.12 * scale, 0x2c3235, 'metal');
          // Çatı kum torbası siperi ve anten
          this.addBox(group, 7.2 * scale, 0.45 * scale, 0.5 * scale, 0, 3.8 * scale, 2.9 * scale, 0xa8986b, 'sand');
          this.addCyl(group, 0.06, 0.09, 3.2, 6, -2.6 * scale, 5.1 * scale, -2.1 * scale, 0x3b4042, 'metal');
          break;
        }
        case 'hesco': {
          // Askeri HESCO Tahkimat Siper Duvarı (3 hücreli)
          for (const ox of [-2.0, 0, 2.0]) {
            this.addBox(group, 1.85, 2.0, 1.65, ox, 1.0, 0, 0x9e8f6a, 'sand');
            this.addBox(group, 1.92, 0.14, 1.72, ox, 1.92, 0, 0x5a5e54, 'metal');
            this.addBox(group, 1.92, 0.14, 1.72, ox, 1.0, 0, 0x5a5e54, 'metal');
          }
          this.addBox(group, 5.6, 0.24, 0.08, 0, 1.45, 0.86, teamTint);
          break;
        }
        default:
          break;
      }
      this.scene.add(group);
    }
  }

  buildDock() {
    const group = new THREE.Group();
    for (let z = 520; z <= 614; z += 4) {
      const y = heightAt(30, z) + 0.06;
      this.addBox(group, 9, 0.22, 3.7, 30, y, z, 0x9c7a4e, 'wood');
      if ((z - 520) % 8 === 0) {
        for (const x of [26.4, 33.6]) {
          const ground = heightAt(x, z);
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.26, Math.max(2, y - ground + 2), 6),
            this.material(0x5a3f28, 'wood'),
          );
          post.position.set(x, (y + ground - 2) / 2, z);
          post.castShadow = true;
          group.add(post);
        }
      }
    }
    // Korkuluk
    for (let z = 526; z <= 610; z += 12) {
      for (const x of [25.8, 34.2]) {
        const y = heightAt(x, z) + 0.06;
        this.addBox(group, 0.12, 1.1, 0.12, x, y + 0.55, z, 0x6b4b2e, 'wood');
      }
    }
    // İskele sonunda fener ve sandık
    const endY = heightAt(30, 606) + 0.06;
    this.addBox(group, 0.12, 3.2, 0.12, 33.2, endY + 1.6, 606, 0x3d3d3d, 'metal');
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), this.material(0xffd28a, null, { emissive: 0xffd28a, emissiveIntensity: 1.8 }));
    lamp.position.set(33.2, endY + 3.3, 606);
    group.add(lamp);
    const lampLight = new THREE.PointLight(0xffc46a, 3, 22, 2);
    lampLight.position.set(33.2, endY + 3.2, 606);
    lampLight.userData.baseIntensity = 3;
    group.add(lampLight);
    this.pointLights.push(lampLight);
    this.addBox(group, 1.4, 1.1, 1.4, 27, endY + 0.55, 604, 0x8a6238, 'wood');
    this.scene.add(group);
  }

  buildZoneVisuals() {
    for (const zone of ZONES) {
      const group = new THREE.Group();
      group.position.set(zone.x, zone.y, zone.z);
      const ownerColor = zone.team ? TEAMS[zone.team].color : 0xd7dee2;
      const flagColor = zone.team ? TEAMS[zone.team].color : 0xd7dee2;

      // Üs Merkez Komuta Platformu (Beton Kaide + Taktik Halka)
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(3.8, 4.2, 0.24, 24),
        this.material(0x565b5e, 'plaster'),
      );
      pad.position.y = 0.12;
      pad.receiveShadow = true;
      group.add(pad);

      const padRingMat = new THREE.MeshBasicMaterial({
        color: ownerColor,
        side: THREE.DoubleSide,
      });
      const padRing = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.4, 32), padRingMat);
      padRing.rotation.x = -Math.PI / 2;
      padRing.position.y = 0.25;
      group.add(padRing);

      // Ele geçirme sınırı halkası (Daha belirgin çift çizgi + 8 taktik sınır direği)
      const ringMat = new THREE.MeshBasicMaterial({
        color: ownerColor,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(zone.captureRadius - 1.35, zone.captureRadius, 80), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      group.add(ring);

      const innerMat = new THREE.MeshBasicMaterial({
        color: ownerColor,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const inner = new THREE.Mesh(new THREE.CircleGeometry(zone.captureRadius - 1.4, 64), innerMat);
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.08;
      group.add(inner);

      // Üs çevresinde 8 adet taktik sınır işaret direği
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const px = Math.cos(a) * zone.captureRadius;
        const pz = Math.sin(a) * zone.captureRadius;
        const py = heightAt(zone.x + px, zone.z + pz) - zone.y;
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.18, 1.8, 6),
          this.material(0x2d3336, 'metal'),
        );
        post.position.set(px, py + 0.9, pz);
        group.add(post);
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), padRingMat);
        beacon.position.set(px, py + 1.9, pz);
        group.add(beacon);
      }

      // Yüksek Askeri Bayrak Direği (10.5m)
      const poleMat = this.material(0xd0cec4, null, { metalness: 0.45, roughness: 0.45 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 10.5, 10), poleMat);
      pole.position.y = 5.25;
      pole.castShadow = true;
      group.add(pole);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), this.material(0xe8be5a, null, { metalness: 0.65, roughness: 0.35 }));
      knob.position.y = 10.6;
      group.add(knob);

      // Büyük ve Canlı Üs Bayrağı (4.2m x 2.3m)
      const flagMat = new THREE.MeshStandardMaterial({
        color: flagColor,
        map: this.textures.fabric,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0.05,
        flatShading: false,
      });
      const flagGeo = new THREE.PlaneGeometry(4.2, 2.3, 14, 6);
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(2.1, 9.1, 0);
      flag.castShadow = true;
      const flagBase = new Float32Array(flagGeo.attributes.position.array);
      const flagGroup = new THREE.Group();
      flagGroup.rotation.y = zone.angle || 0;
      flagGroup.add(flag);
      group.add(flagGroup);

      // Işık sütunu
      const beamMat = new THREE.MeshBasicMaterial({
        color: ownerColor,
        transparent: true,
        opacity: 0.065,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 5.2, 38, 16, 1, true), beamMat);
      beam.position.y = 19;
      group.add(beam);

      // Yüksek Kontrastlı Üs İsim Tabelası
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 144;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(6, 11, 15, 0.86)';
      ctx.fillRect(8, 22, 496, 96);
      ctx.strokeStyle = 'rgba(240, 178, 74, 0.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 22, 496, 96);
      ctx.fillStyle = zone.team ? TEAMS[zone.team].css : '#f0b24a';
      ctx.fillRect(8, 22, 10, 96);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zone.name.toUpperCase(), 260, 56);
      ctx.fillStyle = '#f0b24a';
      ctx.font = 'bold 20px Segoe UI, sans-serif';
      ctx.fillText(`★ ${zone.label.toUpperCase()} ★`, 260, 94);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.position.y = 13.5;
      sprite.scale.set(12.5, 3.5, 1);
      group.add(sprite);

      this.scene.add(group);
      this.zoneVisuals.set(zone.id, {
        group, ringMat, innerMat, beamMat, flagMat, padRingMat, flag, flagGeo, flagBase, beam,
        phase: Math.random() * Math.PI * 2,
      });
      this.zoneOwners.set(zone.id, zone.team);
    }
  }

  setZoneOwner(id, owner) {
    if (this.zoneOwners.get(id) === owner) return;
    this.zoneOwners.set(id, owner);
    const v = this.zoneVisuals.get(id);
    if (!v) return;
    const base = owner ? TEAMS[owner].color : 0xd7dee2;
    const c = new THREE.Color(base);
    v.ringMat.color.copy(c);
    v.innerMat.color.copy(c);
    v.beamMat.color.copy(c);
    v.flagMat.color.copy(c);
    if (v.padRingMat) v.padRingMat.color.copy(c);
  }

  buildClouds() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    for (let i = 0; i < 34; i++) {
      const x = 20 + Math.random() * 216;
      const y = 40 + Math.random() * 50;
      const r = 14 + Math.random() * 38;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,252,244,0.30)');
      grad.addColorStop(0.55, 'rgba(248,244,236,0.16)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);
    }
    // Bulut altlarına hafif sıcak gölge: düz beyaz leke görünümünü kırar.
    for (let i = 0; i < 10; i++) {
      const x = 40 + Math.random() * 176;
      const y = 78 + Math.random() * 34;
      const r = 26 + Math.random() * 30;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(196,196,188,0.10)');
      grad.addColorStop(1, 'rgba(196,196,188,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 128);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const cloudMats = [0.20, 0.30, 0.40].map((op) => new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: op, depthWrite: false, fog: true,
    }));
    for (let i = 0; i < 24; i++) {
      const sprite = new THREE.Sprite(cloudMats[i % cloudMats.length]);
      const a = Math.random() * Math.PI * 2;
      const r = 250 + Math.random() * 750;
      sprite.position.set(Math.cos(a) * r, 150 + Math.random() * 110, Math.sin(a) * r);
      const sc = 120 + Math.random() * 180;
      sprite.scale.set(sc, sc * 0.45, 1);
      this.clouds.push({ sprite, speed: 0.6 + Math.random() * 1.2 });
      this.scene.add(sprite);
    }
  }

  setQuality(level = 'normal') {
    this.quality = level;
    if (this.sun) this.sun.castShadow = level !== 'lowest';
    for (const m of this.treeMeshes) m.castShadow = level === 'normal';
    for (const m of this.palmMeshes) {
      m.visible = level !== 'lowest';
      m.castShadow = level === 'normal';
    }
    for (const m of this.bushMeshes) {
      m.visible = level !== 'lowest';
      m.count = level === 'low' ? Math.ceil(m.userData.fullCount * 0.5) : m.userData.fullCount;
    }
    if (this.grassMesh) {
      this.grassMesh.visible = level !== 'lowest';
      this.grassMesh.count = level === 'low' ? Math.min(450, this.grassMesh.userData.fullCount) : this.grassMesh.userData.fullCount;
    }
    this.clouds.forEach((c, i) => {
      c.sprite.visible = level === 'normal' ? true : level === 'low' ? i < 10 : false;
    });
    for (const l of this.pointLights) {
      l.intensity = level === 'normal' ? (l.userData.baseIntensity || 3) : 0;
    }
    for (const v of this.zoneVisuals.values()) {
      v.beam.visible = level !== 'lowest';
      v.flag.castShadow = level === 'normal';
    }
  }

  update(dt, camera, focusPos) {
    this.time += dt;
    if (this.waterMat) {
      this.waterMat.uniforms.uTime.value = this.time;
      this.waterMat.uniforms.uCamPos.value.copy(camera.position);
    }
    // Bayraklar dalgalansın (yalnızca kameraya yakın olanlar ve lowest mod dışındakiler).
    if (this.quality !== 'lowest') {
      const maxFlagDistSq = this.quality === 'low' ? 110 * 110 : 210 * 210;
      for (const v of this.zoneVisuals.values()) {
        const dx = v.group.position.x - camera.position.x;
        const dz = v.group.position.z - camera.position.z;
        if (dx * dx + dz * dz > maxFlagDistSq) continue;
        const pos = v.flagGeo.attributes.position;
        const phase = v.phase || 0;
        for (let i = 0; i < pos.count; i++) {
          const bx = v.flagBase[i * 3];
          const by = v.flagBase[i * 3 + 1];
          const t = (bx + 2.1) / 4.2;
          pos.setZ(i, Math.sin(bx * 3.2 + this.time * 4.5 + by * 0.8 + phase) * 0.22 * t);
          pos.setY(i, by + Math.sin(bx * 1.5 + this.time * 2.2 + phase * 0.6) * 0.06 * t);
        }
        pos.needsUpdate = true;
      }
    }
    // Bulutlar
    for (const c of this.clouds) {
      c.sprite.position.x += c.speed * dt;
      if (c.sprite.position.x > 1100) c.sprite.position.x = -1100;
    }
    // Gölge kamerası: oyunda oyuncuyu takip eder (dar, keskin alan); menüde
    // tüm adayı kapsayacak şekilde genişler. Işık yönü sabit kaldığı için
    // gölgeler gökyüzündeki güneş lekesiyle aynı taraftan düşer.
    if (this.sun) {
      if (focusPos) {
        this.setShadowExtent(95);
        this.sun.position.copy(focusPos).add(SUN_OFFSET);
        this.sun.target.position.copy(focusPos);
      } else {
        this.setShadowExtent(620);
        this.sun.position.copy(SUN_OFFSET);
        this.sun.target.position.set(0, 20, 0);
      }
      this.sun.target.updateMatrixWorld();
    }
  }
}
