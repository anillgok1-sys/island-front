// WebSocket istemcisi ve olay dağıtıcısı.
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
    this.joinPayload = null;
    this.ping = 0;
    this.lastPingAt = 0;
    this.pingTimer = null;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, msg) {
    const list = this.handlers.get(type);
    if (list) for (const fn of list) fn(msg);
    const all = this.handlers.get('*');
    if (all) for (const fn of all) fn(msg);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}/ws`;
      let settled = false;
      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(err);
        return;
      }
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Sunucu yanıt vermedi.'));
        }
      }, 8000);

      this.ws.addEventListener('open', () => {
        this.connected = true;
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          resolve();
        }
        this.pingLoop();
      });

      this.ws.addEventListener('message', (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.t === 'pong' && msg.time) {
          this.ping = Math.round(performance.now() - msg.time);
          return;
        }
        this.emit(msg.t, msg);
      });

      this.ws.addEventListener('close', () => {
        this.connected = false;
        clearTimeout(timeout);
        if (this.pingTimer) {
          clearTimeout(this.pingTimer);
          this.pingTimer = null;
        }
        if (!settled) {
          settled = true;
          reject(new Error('Sunucu bağlantısı kapandı.'));
        }
        this.ws = null;
        this.emit('disconnected', {});
      });

      this.ws.addEventListener('error', () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error('Sunucuya bağlanılamadı.'));
        }
      });
    });
  }

  join(payload) {
    this.joinPayload = { t: 'join', ...payload };
    if (this.connected) this.ws.send(JSON.stringify(this.joinPayload));
  }

  send(msg) {
    if (!this.connected || !this.ws) return;
    if (this.ws.readyState !== 1) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      // yoksay
    }
  }

  pingLoop() {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    const tick = () => {
      if (!this.connected) {
        this.pingTimer = null;
        return;
      }
      this.send({ t: 'ping', time: performance.now() });
      this.pingTimer = setTimeout(tick, 3000);
    };
    tick();
  }

  close() {
    this.joinPayload = null;
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      try {
        if (this.connected) this.send({ t: 'leave' });
        this.ws.close();
      } catch {
        // yoksay
      }
    }
    this.connected = false;
  }
}
