// Klavye, fare ve pointer-lock yönetimi.
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyR', 'KeyC', 'KeyM', 'KeyN', 'KeyT',
  'KeyV', 'KeyJ', 'KeyH', 'KeyQ',
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'Tab', 'Escape', 'Enter', 'F3',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.left = false;
    this.right = false;
    this.leftJust = false;
    this.locked = false;
    this.lockListeners = [];
    this.enabled = false;
    this.chatOpen = false;

    document.addEventListener('keydown', (e) => {
      // Sohbet açıkken tuşlar metin kutusuna gider, oyun girdisi sayılmaz.
      if (this.chatOpen) return;
      if (GAME_KEYS.has(e.code) && this.enabled) e.preventDefault();
      if (!e.repeat) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked || !this.enabled) return;
      if (e.button === 0) {
        this.left = true;
        this.leftJust = true;
      }
      if (e.button === 2) this.right = true;
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });

    document.addEventListener('wheel', (e) => {
      if (!this.locked || !this.enabled || this.chatOpen) return;
      if (Math.abs(e.deltaY) > 0) {
        this.wheelDelta += e.deltaY > 0 ? 1 : -1;
      }
    }, { passive: true });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.left = false;
        this.right = false;
      }
      for (const fn of this.lockListeners) fn(this.locked);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.left = false;
      this.right = false;
    });
  }

  onLockChange(fn) {
    this.lockListeners.push(fn);
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      // tarayıcı reddetti
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.justPressed.has(code);
  }

  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  consumeWheel() {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  endFrame() {
    this.justPressed.clear();
    this.leftJust = false;
    this.wheelDelta = 0;
  }

  reset() {
    this.keys.clear();
    this.justPressed.clear();
    this.left = false;
    this.right = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }
}
