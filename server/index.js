// HTTP + WebSocket sunucusu. Çoklu oda (Auto-Sharding), RAM/Gzip statik önbellek ve çökme koruması içerir.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const PORT = Number(process.env.PORT) || 3000;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 40; // 40 oda x 24 oyuncu = 960 eşzamanlı oyuncu

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);
const staticCache = new Map();

function loadStaticFile(filePath) {
  let cached = staticCache.get(filePath);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached;
    const raw = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const gzip = COMPRESSIBLE.has(ext) ? zlib.gzipSync(raw, { level: 6 }) : null;
    const etag = '"' + crypto.createHash('md5').update(raw).digest('hex').slice(0, 16) + '"';
    cached = { raw, gzip, type, etag, mtimeMs: stat.mtimeMs };
    staticCache.set(filePath, cached);
    return cached;
  } catch {
    return null;
  }
}

// --- Çoklu Oda (Auto-Sharding) Yöneticisi ---------------------------------
const rooms = [new Game('ADA-01')];
let nextRoomSeq = 2;

function pickRoom(requestedRoomId = null) {
  if (requestedRoomId) {
    const match = rooms.find((r) => r.roomId.toLowerCase() === requestedRoomId.toLowerCase());
    if (match && !match.isFullOfHumans()) return match;
  }
  for (const room of rooms) {
    if (!room.isFullOfHumans()) return room;
  }
  if (rooms.length < MAX_ROOMS) {
    const roomId = `ADA-${String(nextRoomSeq++).padStart(2, '0')}`;
    const newRoom = new Game(roomId);
    rooms.push(newRoom);
    console.log(`[lobby] Yoğun trafik nedeniyle yeni ada odası açıldı: ${roomId} (Toplam oda: ${rooms.length})`);
    return newRoom;
  }
  // Tüm odalar doluysa en az insan olan odayı döndür
  return rooms.slice().sort((a, b) => a.humanCount() - b.humanCount())[0];
}

// Boşalan ek odaları (ADA-02+) temizle, ADA-01 daima açık kalsın
setInterval(() => {
  for (let i = rooms.length - 1; i >= 1; i--) {
    const r = rooms[i];
    if (r.clients.size === 0 && r.humanCount() === 0) {
      console.log(`[lobby] Boş oda kapatılıyor: ${r.roomId}`);
      r.destroy();
      rooms.splice(i, 1);
    }
  }
}, 45000);

function aggregateStatus() {
  const primary = rooms[0].status();
  let totalOnline = 0;
  let totalBots = 0;
  let totalPlayers = 0;
  let redTotal = 0;
  let blueTotal = 0;
  for (const r of rooms) {
    const st = r.status();
    totalOnline += st.online;
    totalBots += st.bots;
    totalPlayers += st.total;
    redTotal += st.teams.red;
    blueTotal += st.teams.blue;
  }
  return {
    ...primary,
    online: totalOnline,
    bots: totalBots,
    total: totalPlayers,
    rooms: rooms.length,
    roomId: pickRoom().roomId,
    teams: { red: redTotal, blue: blueTotal },
  };
}

function safeJoin(base, requestPath) {
  const clean = decodeURIComponent(requestPath.split('?')[0]);
  const resolved = path.resolve(base, '.' + path.posix.normalize(clean));
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/status' || url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(aggregateStatus()));
    return;
  }

  let filePath = null;
  if (url.pathname.startsWith('/shared/')) {
    filePath = safeJoin(SHARED, url.pathname.slice('/shared'.length));
  } else {
    filePath = safeJoin(PUBLIC, url.pathname === '/' ? '/index.html' : url.pathname);
  }
  if (!filePath) {
    res.writeHead(403);
    res.end('Yasak');
    return;
  }

  const asset = loadStaticFile(filePath);
  if (!asset) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bulunamadı');
    return;
  }

  if (req.headers['if-none-match'] === asset.etag) {
    res.writeHead(304);
    res.end();
    return;
  }

  const acceptGzip = asset.gzip && /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
  const headers = {
    'Content-Type': asset.type,
    'Cache-Control': 'public, max-age=30, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ETag: asset.etag,
  };
  if (acceptGzip) {
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = asset.gzip.length;
    res.writeHead(200, headers);
    res.end(asset.gzip);
  } else {
    headers['Content-Length'] = asset.raw.length;
    res.writeHead(200, headers);
    res.end(asset.raw);
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
const ipConnections = new Map();
const MAX_CONNS_PER_IP = 12;

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function isLoopbackIp(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

wss.on('connection', (ws, req) => {
  const ip = getClientIp(req);
  if (!isLoopbackIp(ip)) {
    const active = ipConnections.get(ip) || 0;
    if (active >= MAX_CONNS_PER_IP) {
      try {
        ws.close(1008, 'Aynı IP üzerinden maksimum bağlantı sınırına ulaşıldı.');
      } catch {
        // yoksay
      }
      return;
    }
    ipConnections.set(ip, active + 1);
    ws.on('close', () => {
      const cur = ipConnections.get(ip) || 1;
      if (cur <= 1) ipConnections.delete(ip);
      else ipConnections.set(ip, cur - 1);
    });
  }

  let reqRoom = null;
  try {
    const u = new URL(req.url, 'http://localhost');
    reqRoom = u.searchParams.get('room');
  } catch {
    // yoksay
  }
  const room = pickRoom(reqRoom);
  room.addClient(ws);
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      // yoksay
    }
  }
}, 30000);

process.on('uncaughtException', (err) => {
  console.error('[server] Beklenmeyen hata yakalandı (sunucu çalışmaya devam ediyor):', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] İşlenmeyen Promise reddi yakalandı:', reason);
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║              ISLAND FRONT                    ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log(`  Yerel:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  Ağ:      http://${ip}:${PORT}`);
  console.log('  Durdurmak için Ctrl+C');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\nSunucu kapatılıyor...');
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
});
