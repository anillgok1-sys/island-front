// Menü, HUD, taktik harita, doğma haritası, silah hotbar, skor tablosu ve ayarlar.
import { TEAMS, WORLD, formatTime, clamp } from '/shared/config.js';
import { ZONES, terrainHeightAt } from '/shared/map.js';
import { WEAPONS, WEAPON_ORDER, weaponFor } from '/shared/weapons.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_SETTINGS = {
  sensitivity: 1.0,
  volume: 0,
  quality: 'normal',
  weaponScroll: 'normal',
  hideInstructions: false,
  soundEnabled: false,
  chatEnabled: true,
  autoRunEnabled: true,
};

function weaponSvg(id) {
  if (id === 'pistol') {
    return `<svg viewBox="0 0 120 40" fill="currentColor"><path d="M20 11h52v9H58l-5 14H38l5-14H20z"/><rect x="20" y="8" width="54" height="4"/><rect x="62" y="18" width="10" height="4"/></svg>`;
  }
  if (id === 'shotgun') {
    return `<svg viewBox="0 0 120 40" fill="currentColor"><rect x="12" y="17" width="82" height="5"/><rect x="64" y="22" width="22" height="6"/><path d="M12 17h22v10H18l-6 8H4z"/><rect x="92" y="16" width="16" height="4"/><rect x="48" y="23" width="18" height="4"/></svg>`;
  }
  if (id === 'sniper') {
    return `<svg viewBox="0 0 120 40" fill="currentColor"><rect x="6" y="18" width="98" height="4"/><rect x="30" y="13" width="34" height="5" rx="2"/><rect x="44" y="7" width="20" height="7" rx="2"/><path d="M104 16h10v8h-10z"/><path d="M6 22h18v9H10l-4 6H2z"/><rect x="58" y="22" width="14" height="6"/></svg>`;
  }
  return `<svg viewBox="0 0 120 40" fill="currentColor"><rect x="10" y="15" width="78" height="8"/><rect x="60" y="12" width="40" height="4"/><circle cx="40" cy="27" r="8"/><path d="M8 23h16v11H8z"/><rect x="78" y="24" width="3" height="10"/><rect x="92" y="24" width="3" height="10"/><rect x="28" y="12" width="22" height="3"/></svg>`;
}

function statBars(id) {
  const damage = { pistol: 30, shotgun: 88, sniper: 96, lmg: 46 }[id];
  const rate = { pistol: 46, shotgun: 18, sniper: 10, lmg: 96 }[id];
  const range = { pistol: 42, shotgun: 18, sniper: 100, lmg: 66 }[id];
  const control = { pistol: 72, shotgun: 34, sniper: 52, lmg: 54 }[id];
  return `
    <div class="wc-stats">
      <div class="wc-stat"><span>HASAR</span><i style="--v:${damage}%"></i></div>
      <div class="wc-stat"><span>HIZ</span><i style="--v:${rate}%"></i></div>
      <div class="wc-stat"><span>MENZİL</span><i style="--v:${range}%"></i></div>
      <div class="wc-stat"><span>KONTROL</span><i style="--v:${control}%"></i></div>
    </div>
    <div class="wc-svg">${weaponSvg(id)}</div>`;
}

function weaponCard(id, selected) {
  const w = WEAPONS[id];
  const badge = w.classBadge || (id === 'pistol' ? 'SCOOTER' : '');
  return `
    <button class="weapon-card ${selected ? 'selected' : ''}" data-weapon="${id}" title="${w.description}">
      ${badge ? `<span class="wc-bonus">${badge}</span>` : ''}
      <div class="wc-top"><b>${w.name.toUpperCase()}</b><small>${w.shortName}</small></div>
      ${statBars(id)}
    </button>`;
}

export function gridSectorFor(x, z) {
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const cx = clamp(Math.floor(((x / WORLD.size) + 0.5) * 8), 0, 7);
  const cz = clamp(Math.floor(((z / WORLD.size) + 0.5) * 8), 0, 7);
  return `${cols[cx]}${cz + 1}`;
}

export function formatNorthEast(x, z) {
  const north = Math.round(WORLD.half - z);
  const east = Math.round(WORLD.half + x);
  return `${north}.K ${east}.D`;
}

export class HUD {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.selectedTeam = 'red';
    this.selectedWeapon = 'pistol';
    this.respawnWeapon = 'pistol';
    this.selectedSpawnZone = null;
    this.snapshot = null;
    this.localId = null;
    this.localTeam = 'red';
    this.you = null;
    this.roster = new Map();
    this.zones = [];
    this.match = null;
    this.deathAt = 0;
    this.respawnAt = 0;
    this.deployEnabled = false;
    this.chatOpen = false;
    this.chatScope = 'all';
    this.scoreboardOpen = false;
    this.tacticalMapOpen = false;
    this.settingsOpen = false;
    this.toastTimer = 0;
    this.hitTimer = 0;
    this.damageTimer = 0;
    this.lastMinimapDraw = 0;
    this.lastRespawnMapDraw = 0;
    this.menuVisible = true;
    this.debugVisible = false;
    this.fps = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.minimapBg = this.makeMinimapBg();
    this.compassBuilt = false;
    this.spottedEnemies = new Map();
    this.zoneDotEls = [];
    this.zoneRowEls = new Map();
    this.hotbarSlots = new Map();
    this._cache = {};

    this.settings = this.loadSettings();

    this.el = {
      loading: $('loading'),
      menu: $('menu'),
      hud: $('hud'),
      respawn: $('respawn'),
      results: $('results'),
      pause: $('pause'),
      settingsModal: $('settingsModal'),
      tacticalMapModal: $('tacticalMapModal'),
      tacticalMapCanvas: $('tacticalMapCanvas'),
      tmCoords: $('tmCoords'),
      tmCloseBtn: $('tmCloseBtn'),
      topLeftInstructions: $('topLeftInstructions'),
      viewModeBadge: $('viewModeBadge'),
      autoRunBadge: $('autoRunBadge'),
      name: $('playerName'),
      play: $('playBtn'),
      menuError: $('menuError'),
      weaponGrid: $('weaponGrid'),
      respawnWeapons: $('respawnWeapons'),
      weaponHotbar: $('weaponHotbar'),
      redCount: $('redCount'),
      blueCount: $('blueCount'),
      serverStatus: $('serverStatus'),
      scoreRed: $('scoreRed'),
      scoreBlue: $('scoreBlue'),
      matchTimer: $('matchTimer'),
      zoneDots: $('zoneDots'),
      zoneList: $('zoneList'),
      minimap: $('minimap'),
      gridRef: $('gridRef'),
      compass: $('compass'),
      killfeed: $('killfeed'),
      feed: $('feed'),
      capture: $('capturePanel'),
      capName: $('capName'),
      capCounts: $('capCounts'),
      capFill: $('capFill'),
      capNote: $('capNote'),
      crosshair: $('crosshair'),
      hitmarker: $('hitmarker'),
      scope: $('scope'),
      damageVignette: $('damageVignette'),
      damageDirs: $('damageDirs'),
      hudName: $('hudName'),
      hudRole: $('hudRole'),
      teamPip: $('teamPip'),
      healthFill: $('healthFill'),
      healthNum: $('healthNum'),
      protectTag: $('protectTag'),
      swimTag: $('swimTag'),
      streakTag: $('streakTag'),
      weaponName: $('weaponName'),
      ammoNum: $('ammoNum'),
      ammoReserve: $('ammoReserve'),
      reloadBar: $('reloadBar'),
      weaponHint: $('weaponHint'),
      vehiclePrompt: $('vehiclePrompt'),
      vehiclePromptText: $('vehiclePromptText'),
      vehicleHud: $('vehicleHud'),
      vehSpeed: $('vehSpeed'),
      vehName: $('vehName'),
      vehSeat: $('vehSeat'),
      chatBox: $('chatBox'),
      chatScopeTag: $('chatScopeTag'),
      chatInput: $('chatInput'),
      scoreboard: $('scoreboard'),
      sbRed: $('sbRed'),
      sbBlue: $('sbBlue'),
      sbScore: $('sbScore'),
      interactHint: $('interactHint'),
      respawnTimer: $('respawnTimer'),
      deathInfo: $('deathInfo'),
      respawnMap: $('respawnMap'),
      respawnCoords: $('respawnCoords'),
      respawnZoneWarning: $('respawnZoneWarning'),
      selectedZoneName: $('selectedZoneName'),
      deploy: $('deployBtn'),
      resultTitle: $('resultTitle'),
      resultRed: $('resultRed'),
      resultBlue: $('resultBlue'),
      resultReason: $('resultReason'),
      resultStats: $('resultStats'),
      resetTimer: $('resetTimer'),
      resume: $('resumeBtn'),
      leave: $('leaveBtn'),
      redeployBtn: $('redeployBtn'),
      menuSettingsBtn: $('menuSettingsBtn'),
      pauseSettingsBtn: $('pauseSettingsBtn'),
      fullscreenBtn: $('fullscreenBtn'),
      settingsCloseBtn: $('settingsCloseBtn'),
      settingsSaveBtn: $('settingsSaveBtn'),
      settingsResetBtn: $('settingsResetBtn'),
      sensSlider: $('sensSlider'),
      sensVal: $('sensVal'),
      volSlider: $('volSlider'),
      volVal: $('volVal'),
      qualitySelect: $('qualitySelect'),
      scrollSelect: $('scrollSelect'),
      hideInstructionsToggle: $('hideInstructionsToggle'),
      soundEnableToggle: $('soundEnableToggle'),
      chatEnableToggle: $('chatEnableToggle'),
      autoRunToggle: $('autoRunToggle'),
      toast: $('toast'),
      debug: $('debug'),
    };

    const savedName = localStorage.getItem('islandfront.name');
    if (savedName) this.el.name.value = savedName;
    this.buildMenu();
    this.buildHotbar();
    this.bind();
    this.syncSettingsUI();
    this.el.weaponGrid.innerHTML = WEAPON_ORDER.map((id) => weaponCard(id, id === this.selectedWeapon)).join('');
    this.el.respawnWeapons.innerHTML = WEAPON_ORDER.map((id) => weaponCard(id, id === this.respawnWeapon)).join('');
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem('islandfront.settings.v2');
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('islandfront.settings.v2', JSON.stringify(this.settings));
    } catch {
      // yoksay
    }
    this.applySettings();
  }

  syncSettingsUI() {
    const s = this.settings;
    if (this.el.sensSlider) {
      this.el.sensSlider.value = String(s.sensitivity);
      this.el.sensVal.textContent = Number(s.sensitivity).toFixed(2);
    }
    if (this.el.volSlider) {
      this.el.volSlider.value = String(s.volume);
      this.el.volVal.textContent = `${Math.round(s.volume)}%`;
    }
    if (this.el.qualitySelect) this.el.qualitySelect.value = s.quality;
    if (this.el.scrollSelect) this.el.scrollSelect.value = s.weaponScroll;
    if (this.el.hideInstructionsToggle) this.el.hideInstructionsToggle.checked = !!s.hideInstructions;
    if (this.el.soundEnableToggle) this.el.soundEnableToggle.checked = !!s.soundEnabled;
    if (this.el.chatEnableToggle) this.el.chatEnableToggle.checked = !!s.chatEnabled;
    if (this.el.autoRunToggle) this.el.autoRunToggle.checked = !!s.autoRunEnabled;
    this.applySettings();
  }

  applySettings() {
    const s = this.settings;
    if (this.el.topLeftInstructions) {
      this.el.topLeftInstructions.classList.toggle('hidden', !!s.hideInstructions);
    }
    if (this.el.feed) {
      this.el.feed.classList.toggle('hidden', !s.chatEnabled);
    }
    this.cb.onSettingsChanged?.(s);
  }

  buildMenu() {
    document.querySelectorAll('.team-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedTeam = btn.dataset.team;
        document.querySelectorAll('.team-btn').forEach((b) => b.classList.toggle('selected', b === btn));
        this.cb.audio?.ui();
      });
    });
  }

  buildHotbar() {
    if (!this.el.weaponHotbar) return;
    this.el.weaponHotbar.innerHTML = '';
    this.hotbarSlots.clear();
    // Slot 1: Seçilen Ana Silah, Slot 2: Varsayılan Uzun Komando Bıçağı
    const definitions = [
      { slotKey: 'primary', num: '1', label: 'P-9', ammo: '12' },
      { slotKey: 'knife', num: '2', label: 'UZUN BIÇAK', ammo: '∞' },
    ];
    for (const def of definitions) {
      const slot = document.createElement('div');
      slot.className = 'wh-slot';
      slot.dataset.slotKey = def.slotKey;
      slot.innerHTML = `
        <div class="wh-top"><span class="wh-key">${def.num}</span><span class="wh-ammo">${def.ammo}</span></div>
        <div class="wh-name">${def.label}</div>`;
      slot.addEventListener('click', () => {
        if (def.slotKey === 'knife') {
          this.cb.onSwitchWeapon?.('knife');
        } else {
          const primaryId = this.you?.primaryWeapon || this.selectedWeapon || 'pistol';
          this.cb.onSwitchWeapon?.(primaryId);
        }
      });
      this.el.weaponHotbar.appendChild(slot);
      this.hotbarSlots.set(def.slotKey, {
        root: slot,
        ammoEl: slot.querySelector('.wh-ammo'),
        nameEl: slot.querySelector('.wh-name'),
      });
    }
  }

  bind() {
    this.el.weaponGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.weapon-card');
      if (!card) return;
      this.selectedWeapon = card.dataset.weapon;
      this.el.weaponGrid.querySelectorAll('.weapon-card').forEach((c) => {
        c.classList.toggle('selected', c.dataset.weapon === this.selectedWeapon);
      });
      this.cb.audio?.ui();
    });

    this.el.respawnWeapons.addEventListener('click', (e) => {
      const card = e.target.closest('.weapon-card');
      if (!card) return;
      this.respawnWeapon = card.dataset.weapon;
      this.el.respawnWeapons.querySelectorAll('.weapon-card').forEach((c) => {
        c.classList.toggle('selected', c.dataset.weapon === this.respawnWeapon);
      });
      this.cb.audio?.ui();
    });

    this.el.play.addEventListener('click', () => {
      const name = this.el.name.value.trim() || 'Asker';
      localStorage.setItem('islandfront.name', name);
      this.el.play.disabled = true;
      this.el.menuError.textContent = '';
      this.cb.onPlay?.({ name, team: this.selectedTeam, weapon: this.selectedWeapon });
    });

    this.el.name.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') this.el.play.click();
    });

    this.el.deploy.addEventListener('click', () => {
      if (!this.deployEnabled) return;
      this.cb.onRespawn?.(this.respawnWeapon, this.selectedSpawnZone);
      this.el.deploy.disabled = true;
    });

    this.el.resume.addEventListener('click', () => {
      this.hidePause();
      this.cb.onResume?.();
    });

    this.el.leave.addEventListener('click', () => {
      this.cb.onLeave?.();
    });

    this.el.redeployBtn?.addEventListener('click', () => {
      this.hidePause();
      this.cb.onRedeploy?.();
    });

    this.el.menuSettingsBtn?.addEventListener('click', () => this.openSettings());
    this.el.pauseSettingsBtn?.addEventListener('click', () => this.openSettings());
    this.el.settingsCloseBtn?.addEventListener('click', () => this.closeSettings());
    this.el.settingsSaveBtn?.addEventListener('click', () => {
      this.saveSettings();
      this.closeSettings();
    });
    this.el.settingsResetBtn?.addEventListener('click', () => {
      this.settings = { ...DEFAULT_SETTINGS };
      this.syncSettingsUI();
      this.saveSettings();
    });

    this.el.sensSlider?.addEventListener('input', () => {
      this.settings.sensitivity = Number(this.el.sensSlider.value);
      this.el.sensVal.textContent = this.settings.sensitivity.toFixed(2);
      this.applySettings();
    });
    this.el.volSlider?.addEventListener('input', () => {
      this.settings.volume = Number(this.el.volSlider.value);
      this.el.volVal.textContent = `${Math.round(this.settings.volume)}%`;
      this.applySettings();
    });
    this.el.qualitySelect?.addEventListener('change', () => {
      this.settings.quality = this.el.qualitySelect.value;
      this.applySettings();
    });
    this.el.scrollSelect?.addEventListener('change', () => {
      this.settings.weaponScroll = this.el.scrollSelect.value;
      this.applySettings();
    });
    this.el.hideInstructionsToggle?.addEventListener('change', () => {
      this.settings.hideInstructions = this.el.hideInstructionsToggle.checked;
      this.applySettings();
    });
    this.el.soundEnableToggle?.addEventListener('change', () => {
      this.settings.soundEnabled = this.el.soundEnableToggle.checked;
      this.applySettings();
    });
    this.el.chatEnableToggle?.addEventListener('change', () => {
      this.settings.chatEnabled = this.el.chatEnableToggle.checked;
      this.applySettings();
    });
    this.el.autoRunToggle?.addEventListener('change', () => {
      this.settings.autoRunEnabled = this.el.autoRunToggle.checked;
      this.applySettings();
    });

    this.el.fullscreenBtn?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    this.el.tmCloseBtn?.addEventListener('click', () => {
      this.toggleTacticalMap(false);
    });

    this.el.minimap?.addEventListener('click', () => {
      this.toggleTacticalMap();
    });

    this.el.viewModeBadge?.addEventListener('click', () => {
      this.cb.onToggleView?.();
    });

    // Doğma haritası etkileşimi (tıklama ve koordinat önizleme)
    if (this.el.respawnMap) {
      this.el.respawnMap.addEventListener('mousemove', (e) => {
        const pt = this.canvasToWorld(this.el.respawnMap, e);
        if (this.el.respawnCoords) {
          this.el.respawnCoords.textContent = `${formatNorthEast(pt.x, pt.z)} · ${gridSectorFor(pt.x, pt.z)}`;
        }
      });
      this.el.respawnMap.addEventListener('click', (e) => {
        const pt = this.canvasToWorld(this.el.respawnMap, e);
        this.handleRespawnMapClick(pt.x, pt.z);
      });
    }

    if (this.el.tacticalMapCanvas) {
      this.el.tacticalMapCanvas.addEventListener('mousemove', (e) => {
        const pt = this.canvasToWorld(this.el.tacticalMapCanvas, e);
        if (this.el.tmCoords) {
          this.el.tmCoords.textContent = `Koordinat: ${formatNorthEast(pt.x, pt.z)} · Sektör ${gridSectorFor(pt.x, pt.z)}`;
        }
      });
    }

    this.el.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Tab') {
        e.preventDefault();
        this.setChatScope(this.chatScope === 'team' ? 'all' : 'team');
        return;
      }
      if (e.code === 'Enter') {
        const text = this.el.chatInput.value.trim();
        if (text) this.cb.onChat?.(text, this.chatScope);
        this.closeChat();
      } else if (e.code === 'Escape') {
        this.closeChat();
      }
    });

    this.el.name.addEventListener('focus', () => this.cb.onMenuInput?.(true));
    this.el.name.addEventListener('blur', () => this.cb.onMenuInput?.(false));
  }

  canvasToWorld(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const u = clamp((event.clientX - rect.left) / (rect.width || 1), 0, 1);
    const v = clamp((event.clientY - rect.top) / (rect.height || 1), 0, 1);
    return {
      x: (u - 0.5) * WORLD.size,
      z: (v - 0.5) * WORLD.size,
    };
  }

  handleRespawnMapClick(wx, wz) {
    if (!this.zones.length) return;
    let best = null;
    let bestD = 185;
    for (const z of this.zones) {
      const d = Math.hypot(wx - z.x, wz - z.z);
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    if (!best) return;
    const team = this.localTeam || 'red';
    if (best.owner !== team) {
      this.cb.audio?.capture(false);
      this.setRespawnWarning(
        `Başka bir bölge seç — ${best.name} takımının kontrolünde değil! Yanıp sönen dost bölgelerden birini seç.`,
        'error',
      );
      return;
    }
    this.selectedSpawnZone = best.id;
    this.cb.audio?.ui();
    this.updateRespawnZoneBanner(best, team);
    this.drawTacticalMap(this.el.respawnMap, null, { isRespawn: true });
  }

  updateRespawnZoneBanner(zone, team) {
    if (!zone) return;
    const enemyNear = zone.contested || (zone.enemyNear && zone.enemyNear[team]);
    if (enemyNear) {
      this.setRespawnWarning(
        `⚠ Dikkat: ${zone.name} çevresinde düşman birlikleri yakında! (${gridSectorFor(zone.x, zone.z)})`,
        'warn',
      );
    } else {
      this.setRespawnWarning(
        `Seçili Bölge: ${zone.name} (${gridSectorFor(zone.x, zone.z)}) — Güvenli Konuşlanma`,
        'normal',
      );
    }
  }

  setRespawnWarning(text, level = 'normal') {
    if (!this.el.respawnZoneWarning) return;
    this.el.respawnZoneWarning.classList.remove('warn', 'error');
    if (level === 'warn') this.el.respawnZoneWarning.classList.add('warn');
    if (level === 'error') this.el.respawnZoneWarning.classList.add('error');
    this.el.respawnZoneWarning.textContent = text;
  }

  openSettings() {
    this.settingsOpen = true;
    this.syncSettingsUI();
    this.el.settingsModal?.classList.remove('hidden');
    this.cb.audio?.ui();
  }

  closeSettings() {
    this.settingsOpen = false;
    this.el.settingsModal?.classList.add('hidden');
    this.cb.audio?.ui();
  }

  toggleTacticalMap(force) {
    const next = typeof force === 'boolean' ? force : !this.tacticalMapOpen;
    if (this.tacticalMapOpen === next) return;
    this.tacticalMapOpen = next;
    this.el.tacticalMapModal?.classList.toggle('hidden', !next);
    if (next) {
      this.drawTacticalMap(this.el.tacticalMapCanvas, this._lastState, { isRespawn: false, detailed: true });
      this.cb.onMapToggled?.(true);
    } else {
      this.cb.onMapToggled?.(false);
    }
  }

  spotEnemy(playerId, durationMs = 3500) {
    if (!playerId) return;
    this.spottedEnemies.set(playerId, Date.now() + durationMs);
  }

  setViewMode(thirdPerson, autoRun = false) {
    if (this.el.viewModeBadge) {
      this.el.viewModeBadge.textContent = thirdPerson ? '3. ŞAHIS (V)' : '1. ŞAHIS (V)';
    }
    if (this.el.autoRunBadge) {
      this.el.autoRunBadge.classList.toggle('hidden', !autoRun);
    }
  }

  setPlayEnabled(enabled) {
    this.el.play.disabled = !enabled;
  }

  showMenuError(text) {
    this.el.menuError.textContent = text;
    this.setPlayEnabled(true);
  }

  async refreshStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      const red = data.teams?.red ?? 0;
      const blue = data.teams?.blue ?? 0;
      this.el.redCount.textContent = `${red} oyuncu`;
      this.el.blueCount.textContent = `${blue} oyuncu`;
      this.el.serverStatus.textContent = `${data.online} insan · ${data.total} toplam · Maç ${formatTime(data.match?.timeLeft ?? 0)}`;
    } catch {
      this.el.serverStatus.textContent = 'Sunucu durumu alınamadı';
    }
  }

  hideLoading() {
    this.el.loading.classList.add('done');
    setTimeout(() => this.el.loading.classList.add('hidden'), 550);
  }

  showMenu() {
    this.menuVisible = true;
    this.tacticalMapOpen = false;
    this.el.menu.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.respawn.classList.add('hidden');
    this.el.results.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.tacticalMapModal?.classList.add('hidden');
    this.refreshStatus();
  }

  showGame() {
    this.menuVisible = false;
    this.el.menu.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.respawn.classList.add('hidden');
    this.el.results.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.play.disabled = false;
  }

  setIdentity(id, name, team) {
    this.localId = id;
    this.localTeam = team;
    this.el.hudName.textContent = name.toUpperCase();
    this.el.teamPip.style.background = TEAMS[team].css;
    this.el.hudRole.textContent = 'PİYADE';
  }

  setSnapshot(snap) {
    this.snapshot = snap;
    this.you = snap.you;
    this.match = snap.match;
    this.zones = snap.zones || [];
    this.roster.clear();
    for (const p of snap.players) this.roster.set(p.id, p);
    const me = this.roster.get(this.localId);
    if (me) this.localTeam = me.team;
    for (const zone of this.zones) this.cb.onZoneOwner?.(zone.id, zone.owner);
    if (this.scoreboardOpen) this.renderScoreboard();
  }

  ensureZoneDom() {
    if (!this.zones.length) return;
    if (this.zoneDotEls.length !== this.zones.length) {
      this.el.zoneDots.innerHTML = '';
      this.zoneDotEls = this.zones.map(() => {
        const i = document.createElement('i');
        this.el.zoneDots.appendChild(i);
        return i;
      });
    }
    if (this.zoneRowEls.size !== this.zones.length) {
      this.el.zoneList.innerHTML = '';
      this.zoneRowEls.clear();
      for (const z of this.zones) {
        const row = document.createElement('div');
        row.className = 'zone-row';
        row.dataset.zone = z.id;
        const nameEl = document.createElement('span');
        nameEl.textContent = z.name;
        const statusEl = document.createElement('b');
        statusEl.textContent = '—';
        row.append(nameEl, statusEl);
        this.el.zoneList.appendChild(row);
        this.zoneRowEls.set(z.id, { row, statusEl, prevKey: '' });
      }
    }
  }

  updateZoneDom() {
    this.ensureZoneDom();
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      const dot = this.zoneDotEls[i];
      if (dot) {
        const cls = z.owner || '';
        if (dot.className !== cls) dot.className = cls;
      }
      const entry = this.zoneRowEls.get(z.id);
      if (!entry) continue;
      const p = Math.round(z.progress);
      const key = `${z.owner || ''}:${z.contested ? 1 : 0}:${p}`;
      if (entry.prevKey === key) continue;
      entry.prevKey = key;
      entry.row.classList.toggle('red', z.owner === 'red');
      entry.row.classList.toggle('blue', z.owner === 'blue');
      entry.row.classList.toggle('contested', !!z.contested);
      entry.statusEl.textContent = z.contested ? 'ÇATIŞMA' : z.owner ? 'KONTROL' : `${p}%`;
    }
  }

  updateHotbarDom(y) {
    const primaryId = y.primaryWeapon || (y.weapon !== 'knife' ? y.weapon : this.selectedWeapon) || 'pistol';
    const pw = weaponFor(primaryId);
    const slots = y.slots || null;
    const primarySlot = this.hotbarSlots.get('primary');
    if (primarySlot) {
      const isPrimaryActive = y.weapon !== 'knife';
      primarySlot.root.classList.toggle('active', isPrimaryActive);
      if (primarySlot.nameEl.textContent !== pw.shortName) {
        primarySlot.nameEl.textContent = pw.shortName;
      }
      const pAmmo = isPrimaryActive ? y.ammo : (slots && slots[primaryId] ? slots[primaryId].ammo : pw.magSize);
      const ammoText = String(pAmmo);
      if (primarySlot.ammoEl.textContent !== ammoText) primarySlot.ammoEl.textContent = ammoText;
    }
    const knifeSlot = this.hotbarSlots.get('knife');
    if (knifeSlot) {
      knifeSlot.root.classList.toggle('active', y.weapon === 'knife');
    }
  }

  update(dt, state) {
    if (!this.you) return;
    this._lastState = state;
    const now = Date.now();
    const y = this.you;
    const team = this.roster.get(this.localId)?.team || this.localTeam || 'red';
    this.localTeam = team;
    const c = this._cache;

    // Skor ve süre (yalnızca değiştiğinde DOM güncelle)
    if (this.match) {
      if (c.scoreRed !== this.match.scores.red) {
        c.scoreRed = this.match.scores.red;
        this.el.scoreRed.textContent = c.scoreRed;
      }
      if (c.scoreBlue !== this.match.scores.blue) {
        c.scoreBlue = this.match.scores.blue;
        this.el.scoreBlue.textContent = c.scoreBlue;
      }
      const timerStr = formatTime(this.match.timeLeft);
      if (c.timerStr !== timerStr) {
        c.timerStr = timerStr;
        this.el.matchTimer.textContent = timerStr;
      }
    }
    if (this.zones.length) {
      this.updateZoneDom();
    }

    // Sağlık
    const hp = Math.max(0, Math.round(y.hp));
    if (c.hp !== hp) {
      c.hp = hp;
      this.el.healthNum.textContent = hp;
      this.el.healthFill.style.width = `${hp}%`;
      this.el.healthFill.classList.toggle('low', hp <= 35);
    }
    this.el.protectTag.classList.toggle('hidden', !y.protect);
    this.el.swimTag.classList.toggle('hidden', !state.swimming);
    if (y.streak >= 3) {
      this.el.streakTag.classList.remove('hidden');
      const stText = `${y.streak} SERİ`;
      if (c.stText !== stText) {
        c.stText = stText;
        this.el.streakTag.textContent = stText;
      }
    } else {
      this.el.streakTag.classList.add('hidden');
    }

    // Silah ve Hotbar
    const w = weaponFor(y.weapon);
    if (c.weapon !== y.weapon) {
      c.weapon = y.weapon;
      this.el.weaponName.innerHTML = `${w.name.toUpperCase()} <small>${w.shortName} · ${w.className || ''}</small>`;
      this.el.weaponHint.textContent = w.melee
        ? 'SOL TIK: BIÇAK DARBESİ · 1: ANA SİLAH · +%12 HIZ'
        : w.scope
          ? 'SAĞ TIK: DÜRBÜN · 1: SİLAH · 2/Q: UZUN BIÇAK'
          : 'SOL TIK: ATEŞ · SAĞ TIK: NİŞAN · 2/Q: UZUN BIÇAK';
    }
    const dispAmmo = w.melee ? '∞' : y.ammo;
    const dispRes = w.melee ? 'BIÇAK' : y.reserve;
    if (c.ammo !== dispAmmo) {
      c.ammo = dispAmmo;
      this.el.ammoNum.textContent = dispAmmo;
    }
    if (c.reserve !== dispRes) {
      c.reserve = dispRes;
      this.el.ammoReserve.textContent = dispRes;
    }
    this.updateHotbarDom(y);

    if (y.reloading && !w.melee) {
      const total = w.reloadTime * 1000;
      const left = Math.max(0, y.reloadEnd - now);
      this.el.reloadBar.classList.remove('hidden');
      this.el.reloadBar.firstElementChild.style.width = `${clamp(100 - (left / total) * 100, 0, 100)}%`;
    } else {
      this.el.reloadBar.classList.add('hidden');
    }

    // Araç (3 Kişilik Hücum Botu & Turbo/Drift Scooter)
    if (state.drivingVehicle) {
      const v = state.drivingVehicle;
      this.el.vehicleHud.classList.remove('hidden');
      this.el.vehSpeed.textContent = Math.round(Math.abs(v.speed) * 3.6);
      if (v.type === 'boat') {
        const occCount = (v.driver ? 1 : 0) + (v.passenger ? 1 : 0) + (v.passenger2 ? 1 : 0);
        this.el.vehName.textContent = `HÜCUM BOTU (${Math.max(1, occCount)}/3)`;
        this.el.vehSeat.textContent = y.seat === 0 ? 'SÜRÜCÜ' : y.seat === 1 ? 'ÖN NİŞANCI' : 'ARKA NİŞANCI';
      } else {
        this.el.vehName.textContent = 'TAKTİK SCOOTER';
        this.el.vehSeat.textContent = 'SHIFT: TURBO · SPACE: DRİFT';
      }
    } else {
      this.el.vehicleHud.classList.add('hidden');
    }
    if (state.vehiclePrompt) {
      this.el.vehiclePrompt.classList.remove('hidden');
      if (c.vehiclePrompt !== state.vehiclePrompt) {
        c.vehiclePrompt = state.vehiclePrompt;
        this.el.vehiclePromptText.textContent = state.vehiclePrompt;
      }
    } else {
      this.el.vehiclePrompt.classList.add('hidden');
    }
    const roleText = y.inVeh ? (y.seat === 0 ? 'SÜRÜCÜ' : 'NİŞANCI') : state.swimming ? 'YÜZÜCÜ' : (w.className ? w.className.toUpperCase() : 'PİYADE');
    if (c.roleText !== roleText) {
      c.roleText = roleText;
      this.el.hudRole.textContent = roleText;
    }

    // Bölge paneli
    this.updateCapture(state.localPos, team);

    // Crosshair
    const spread = state.spread || 7;
    const gapPx = `${Math.round(clamp(4 + spread * 60, 4, 26))}px`;
    if (c.gapPx !== gapPx) {
      c.gapPx = gapPx;
      this.el.crosshair.style.setProperty('--gap', gapPx);
    }
    this.el.crosshair.classList.toggle('aim', !!state.aiming);
    this.el.crosshair.classList.toggle('hidden', !!state.scoped || (!!y.inVeh && y.seat === 0) || !y.alive);

    // Dürbün
    this.el.scope.classList.toggle('hidden', !state.scoped);

    // Minimap ve Taktik Harita
    const minimapInterval = this.settings.quality === 'lowest' ? 140 : this.settings.quality === 'low' ? 105 : 75;
    if (now - this.lastMinimapDraw > minimapInterval) {
      this.lastMinimapDraw = now;
      this.drawMinimap(state);
      if (this.tacticalMapOpen && this.el.tacticalMapCanvas) {
        this.drawTacticalMap(this.el.tacticalMapCanvas, state, { isRespawn: false, detailed: true });
      }
      if (state.localPos && this.el.gridRef) {
        const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
        const dirLabel = dirs[Math.round(((state.heading || 0) % 360) / 45) % 8];
        const refText = `${gridSectorFor(state.localPos.x, state.localPos.z)} · ${dirLabel}`;
        if (c.refText !== refText) {
          c.refText = refText;
          this.el.gridRef.textContent = refText;
        }
      }
    }

    // Pusula
    this.updateCompass(state.heading || 0);

    // Doğma sayacı & doğma haritası animasyonu
    if (!y.alive && !this.el.respawn.classList.contains('hidden')) {
      const left = Math.max(0, (this.respawnAt - now) / 1000);
      this.el.respawnTimer.textContent = Math.ceil(left);
      if (left <= 0 && !this.deployEnabled) {
        this.deployEnabled = true;
        this.el.deploy.disabled = false;
      }
      if (now - this.lastRespawnMapDraw > 85) {
        this.lastRespawnMapDraw = now;
        this.drawTacticalMap(this.el.respawnMap, state, { isRespawn: true });
      }
    }

    // Sonuç sayacı
    if (this.match?.over) {
      this.el.resetTimer.textContent = Math.ceil(this.match.resetIn);
    }

    // Hitmarker
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el.hitmarker.classList.remove('show');
    }
    if (this.damageTimer > 0) {
      this.damageTimer -= dt;
      if (this.damageTimer <= 0) {
        this.el.damageVignette.style.opacity = '0';
        this.el.damageDirs.innerHTML = '';
      }
    }

    // FPS
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime > 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
      if (this.debugVisible && state.localPos) {
        const p = state.localPos;
        this.el.debug.textContent = `FPS ${this.fps} | PING ${this.cb.getPing?.() ?? 0}ms | KALİTE ${this.settings.quality.toUpperCase()}\nX ${p.x.toFixed(0)} Y ${p.y.toFixed(0)} Z ${p.z.toFixed(0)} (${gridSectorFor(p.x, p.z)})\nOYUNCU ${this.snapshot?.players.length ?? 0} | BÖLGE ${this.zones.filter((z) => z.owner).length}/7`;
      }
    }
  }

  updateCapture(localPos, team) {
    if (!localPos) {
      this.el.capture.classList.add('hidden');
      return;
    }
    const zone = this.zones.find((z) => Math.hypot(localPos.x - z.x, localPos.z - z.z) < z.radius);
    if (!zone) {
      this.el.capture.classList.add('hidden');
      return;
    }
    this.el.capture.classList.remove('hidden');
    this.el.capName.textContent = zone.name.toUpperCase();
    this.el.capCounts.textContent = `${zone.red} — ${zone.blue}`;
    let progress = zone.progress;
    if (zone.owner === team && !zone.contested) progress = 100;
    this.el.capFill.style.width = `${clamp(progress, 0, 100)}%`;
    const capColor = zone.capturingTeam ? TEAMS[zone.capturingTeam].css : TEAMS[team].css;
    this.el.capFill.style.background = capColor;
    if (zone.contested) {
      this.el.capNote.textContent = 'BÖLGE İÇİN ÇATIŞMA (İLERLEME DURDU)';
    } else if (zone.owner === team) {
      this.el.capNote.textContent = 'BÖLGE KONTROLÜNÜZDE';
    } else if (zone.owner) {
      this.el.capNote.textContent = `${TEAMS[zone.owner].name.toUpperCase()} TARAFINDAN TUTULUYOR`;
    } else {
      this.el.capNote.textContent = 'BÖLGEYİ ELE GEÇİR';
    }
  }

  buildCompass() {
    const parts = [];
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let copy = 0; copy < 2; copy++) {
      for (let i = 0; i < 24; i++) {
        const deg = i * 15;
        const card = deg % 90 === 0;
        const label = card ? dirs[deg / 45] : '·';
        parts.push(`<i class="${card ? 'card' : ''}">${label}</i>`);
      }
    }
    this.el.compass.innerHTML = parts.join('');
    this.compassBuilt = true;
  }

  updateCompass(heading) {
    if (!this.compassBuilt) this.buildCompass();
    const offset = 137.5 - (heading / 360) * 600;
    this.el.compass.style.transform = `translateX(${offset}px)`;
  }

  makeMinimapBg() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const step = WORLD.size / size;

    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = (px / size - 0.5) * WORLD.size;
        const z = (py / size - 0.5) * WORLD.size;
        const h = terrainHeightAt(x, z);
        const hx = terrainHeightAt(x + step, z);
        const hz = terrainHeightAt(x, z + step);
        // Güneş gölgeleme kabartması (hillshade) ile yüksek kontrastlı 3B topoğrafya netliği
        const shade = clamp(((h - hx) + (h - hz)) * 0.18, -0.28, 0.28);
        let r;
        let gg;
        let b;
        if (h < -2.4) {
          // Derin okyanus: koyu lacivert-deniz mavisi (ada siluetini çok net öne çıkarır)
          const d = clamp((-h - 2.4) / 18, 0, 1);
          r = 8 + (1 - d) * 16;
          gg = 34 + (1 - d) * 52;
          b = 64 + (1 - d) * 68;
        } else if (h < 0) {
          // Sığ turkuaz mercan kıyısı
          const t = clamp((h + 2.4) / 2.4, 0, 1);
          r = 26 + t * 110;
          gg = 112 + t * 102;
          b = 152 + t * 62;
        } else if (h < 3.0) {
          // Parlak altın sahil şeridi
          r = 242;
          gg = 218;
          b = 156;
        } else if (h > 36) {
          // Yüksek dağ sırtları ve kayalık zirveler
          r = 164;
          gg = 158;
          b = 146;
        } else {
          // Canlı, yüksek kontrastlı ada yeşili
          const t = clamp(h / 36, 0, 1);
          r = 76 + t * 48;
          gg = 154 + t * 32;
          b = 62 + t * 18;
        }
        // Belirgin beyaz-altın kıyı sınır çizgisi ve 8m eşyükselti (kontur) halkaları
        if (Math.abs(h) < 0.45) {
          r = 255;
          gg = 248;
          b = 218;
        } else if (h > 3.2 && Math.abs((h % 8) - 4) < 0.28) {
          r *= 0.80;
          gg *= 0.80;
          b *= 0.80;
        }
        if (h >= 0) {
          r = clamp(r * (1 + shade), 0, 255);
          gg = clamp(gg * (1 + shade), 0, 255);
          b = clamp(b * (1 + shade), 0, 255);
        }
        const idx = (py * size + px) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = gg;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // Üsleri birbirine bağlayan taktik yol ağı (harita üzerinde çok net okunur)
    const toX = (wx) => ((wx / WORLD.size) + 0.5) * size;
    const toY = (wz) => ((wz / WORLD.size) + 0.5) * size;
    const roadLinks = [
      ['red_hq', 'farm'],
      ['red_hq', 'harbor'],
      ['red_hq', 'lighthouse'],
      ['farm', 'hill'],
      ['farm', 'village'],
      ['farm', 'lighthouse'],
      ['village', 'harbor'],
      ['village', 'blue_hq'],
      ['hill', 'blue_hq'],
      ['hill', 'lighthouse'],
    ];
    g.save();
    g.strokeStyle = 'rgba(24, 18, 10, 0.55)';
    g.lineWidth = 5.0;
    for (const [aId, bId] of roadLinks) {
      const za = ZONES.find((z) => z.id === aId);
      const zb = ZONES.find((z) => z.id === bId);
      if (!za || !zb) continue;
      g.beginPath();
      g.moveTo(toX(za.x), toY(za.z));
      g.quadraticCurveTo(toX((za.x + zb.x) * 0.52), toY((za.z + zb.z) * 0.52), toX(zb.x), toY(zb.z));
      g.stroke();
    }
    g.strokeStyle = 'rgba(246, 214, 142, 0.78)';
    g.lineWidth = 2.8;
    g.setLineDash([7, 4]);
    for (const [aId, bId] of roadLinks) {
      const za = ZONES.find((z) => z.id === aId);
      const zb = ZONES.find((z) => z.id === bId);
      if (!za || !zb) continue;
      g.beginPath();
      g.moveTo(toX(za.x), toY(za.z));
      g.quadraticCurveTo(toX((za.x + zb.x) * 0.52), toY((za.z + zb.z) * 0.52), toX(zb.x), toY(zb.z));
      g.stroke();
    }
    g.restore();

    // Güney Limanı İskelesi çizimi
    g.fillStyle = '#e0b370';
    g.fillRect(toX(25.5), toY(516), Math.max(5, toX(34.5) - toX(25.5)), toY(616) - toY(516));

    // 8x8 Taktik sektör ızgarası
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    g.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (size / 8) * i;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, size);
      g.stroke();
      g.beginPath();
      g.moveTo(0, p);
      g.lineTo(size, p);
      g.stroke();
    }
    // Çerçeve köşeleri
    g.strokeStyle = 'rgba(240, 178, 74, 0.9)';
    g.lineWidth = 3;
    const k = 20;
    for (const [cx, cy, dx, dy] of [[2, 2, 1, 1], [size - 2, 2, -1, 1], [2, size - 2, 1, -1], [size - 2, size - 2, -1, -1]]) {
      g.beginPath();
      g.moveTo(cx + dx * k, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + dy * k);
      g.stroke();
    }
    return c;
  }

  drawMinimap(state) {
    this.drawTacticalMap(this.el.minimap, state, { isRespawn: false, detailed: false });
  }

  drawTacticalMap(canvas, state, options = {}) {
    if (!canvas) return;
    const g = canvas.getContext('2d');
    const size = canvas.width;
    const toX = (x) => ((x / WORLD.size) + 0.5) * size;
    const toY = (z) => ((z / WORLD.size) + 0.5) * size;
    const now = Date.now();
    const myTeam = this.localTeam || 'red';
    const isRespawn = !!options.isRespawn;
    const detailed = !!options.detailed || isRespawn;

    g.clearRect(0, 0, size, size);
    g.drawImage(this.minimapBg, 0, 0, size, size);

    // 8x8 Cephe / Sektör Hakimiyet Izgarası
    const cells = 8;
    const cellPx = size / cells;
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let gz = 0; gz < cells; gz++) {
      for (let gx = 0; gx < cells; gx++) {
        const wx = ((gx + 0.5) / cells - 0.5) * WORLD.size;
        const wz = ((gz + 0.5) / cells - 0.5) * WORLD.size;
        if (terrainHeightAt(wx, wz) < -1.2) continue;
        let redW = 0;
        let blueW = 0;
        for (const z of this.zones) {
          if (!z.owner) continue;
          const d2 = (wx - z.x) * (wx - z.x) + (wz - z.z) * (wz - z.z) + 8500;
          if (z.owner === 'red') redW += 1 / d2;
          else if (z.owner === 'blue') blueW += 1 / d2;
        }
        if (redW > blueW * 1.1) {
          g.fillStyle = detailed ? 'rgba(226, 86, 79, 0.24)' : 'rgba(226, 86, 79, 0.20)';
          g.fillRect(gx * cellPx, gz * cellPx, cellPx, cellPx);
        } else if (blueW > redW * 1.1) {
          g.fillStyle = detailed ? 'rgba(79, 143, 232, 0.24)' : 'rgba(79, 143, 232, 0.20)';
          g.fillRect(gx * cellPx, gz * cellPx, cellPx, cellPx);
        }
        if (detailed) {
          g.fillStyle = 'rgba(255, 255, 255, 0.48)';
          g.font = 'bold 9px Segoe UI, sans-serif';
          g.textAlign = 'left';
          g.fillText(`${cols[gx]}${gz + 1}`, gx * cellPx + 4, gz * cellPx + 11);
        }
      }
    }

    // Araçlar (Tekneler turkuaz elmas, scooterlar sarı-beyaz kare olarak çok net çizilir)
    if (this.snapshot) {
      for (const v of this.snapshot.vehicles) {
        const x = toX(v.x);
        const y = toY(v.z);
        if (v.type === 'boat') {
          const r = detailed ? 4.8 : 3.8;
          g.save();
          g.translate(x, y);
          g.rotate(v.ry || 0);
          g.beginPath();
          g.moveTo(0, -r * 1.3);
          g.lineTo(r * 0.9, r);
          g.lineTo(-r * 0.9, r);
          g.closePath();
          g.fillStyle = '#48e5ff';
          g.fill();
          g.strokeStyle = '#07131a';
          g.lineWidth = 1.2;
          g.stroke();
          g.restore();
        } else {
          const s = detailed ? 4.0 : 3.2;
          g.fillStyle = '#ffe18c';
          g.fillRect(x - s / 2, y - s / 2, s, s);
          g.strokeStyle = '#07131a';
          g.lineWidth = 1;
          g.strokeRect(x - s / 2, y - s / 2, s, s);
        }
      }
    }

    // Ele Geçirilmesi Gereken Üsler (Yüksek Kontrastlı Askeri Karargah Halkaları ve Koyu Etiket Kutuları)
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
    for (const z of this.zones) {
      const x = toX(z.x);
      const y = toY(z.z);
      const r = Math.max(12.5, (z.radius / WORLD.size) * size * (detailed ? 1.5 : 1.32));
      const isFriendly = z.owner === myTeam;
      const isSelected = isRespawn && this.selectedSpawnZone === z.id;
      const enemyNear = z.contested || (z.enemyNear && z.enemyNear[myTeam]);
      const teamColor = z.owner ? TEAMS[z.owner].css : '#e4edf2';

      if (isRespawn && isFriendly) {
        g.beginPath();
        g.arc(x, y, r + 4 + pulse * 5, 0, Math.PI * 2);
        g.strokeStyle = enemyNear
          ? `rgba(240, 178, 74, ${0.5 + pulse * 0.5})`
          : `rgba(255, 255, 255, ${0.45 + pulse * 0.55})`;
        g.lineWidth = isSelected ? 3.2 : 2.2;
        g.stroke();
      }

      // Dış siyah kontrast konturu + parlak takım halkası
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = z.owner ? `${TEAMS[z.owner].css}75` : 'rgba(18, 26, 32, 0.72)';
      g.fill();
      g.strokeStyle = 'rgba(0, 0, 0, 0.92)';
      g.lineWidth = isSelected ? 4.8 : 3.8;
      g.stroke();
      g.strokeStyle = isSelected ? '#f0b24a' : teamColor;
      g.lineWidth = isSelected ? 3.0 : 2.3;
      g.stroke();

      if (z.progress > 0) {
        g.beginPath();
        g.arc(x, y, r + 2.8, -Math.PI / 2, -Math.PI / 2 + (z.progress / 100) * Math.PI * 2);
        g.strokeStyle = z.contested ? '#f0b24a' : (z.capturingTeam ? TEAMS[z.capturingTeam].css : '#fff');
        g.lineWidth = 2.8;
        g.stroke();
      }

      // Üs merkezi ikonu (Karargah: Yıldız/Kalkan, Diğerleri: Elmas/Kare)
      g.fillStyle = '#070d12';
      g.beginPath();
      g.arc(x, y, detailed ? 7.0 : 5.8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = isSelected ? '#f0b24a' : teamColor;
      g.lineWidth = 1.6;
      g.stroke();

      if (enemyNear && isFriendly) {
        g.fillStyle = '#f0b24a';
        g.font = 'bold 11px Segoe UI, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('!', x, y + 0.5);
      } else {
        g.fillStyle = isSelected ? '#f0b24a' : teamColor;
        g.font = detailed ? 'bold 9.5px Segoe UI, sans-serif' : 'bold 8.5px Segoe UI, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const iconChar = z.type === 'hq' ? '★' : z.type === 'harbor' ? '⚓' : '◆';
        g.fillText(iconChar, x, y + 0.5);
      }

      // Üs ismi için okunaklı koyu etiket kutusu (pill) — yakın komşu üslerde çakışmaması için alt/üst hizalama
      const label = z.name.toUpperCase();
      g.font = detailed ? 'bold 9.5px Segoe UI, sans-serif' : 'bold 8px Segoe UI, sans-serif';
      const tw = g.measureText(label).width;
      const padX = detailed ? 5 : 4;
      const boxH = detailed ? 13.5 : 11.5;
      const labelBelow = z.id === 'hill' || z.id === 'harbor' || z.id === 'red_hq';
      const boxY = labelBelow ? (y + r + 3) : (y - r - boxH - 3);
      const boxX = clamp(x - tw / 2 - padX, 3, size - tw - padX * 2 - 3);
      g.fillStyle = 'rgba(5, 10, 14, 0.92)';
      g.fillRect(boxX, boxY, tw + padX * 2, boxH);
      g.strokeStyle = isSelected ? '#f0b24a' : teamColor;
      g.lineWidth = 1.2;
      g.strokeRect(boxX, boxY, tw + padX * 2, boxH);
      g.fillStyle = isSelected ? '#f0b24a' : '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, boxX + tw / 2 + padX, boxY + boxH / 2 + 0.5);
    }

    // Oyuncular (Dostlar her zaman, düşmanlar görüş/ateş/bölge mesafesindeyse)
    if (this.snapshot) {
      const lp = state && state.localPos ? state.localPos : null;
      for (const p of this.snapshot.players) {
        if (!p.alive || p.id === this.localId) continue;
        if (p.team !== myTeam) {
          if (isRespawn) continue;
          const spottedUntil = this.spottedEnemies.get(p.id) || 0;
          const nearMe = lp && Math.hypot(p.x - lp.x, p.z - lp.z) < 68;
          const inFriendlyZone = this.zones.some(
            (z) => (z.owner === myTeam || z.contested) && Math.hypot(p.x - z.x, p.z - z.z) <= z.radius + 10,
          );
          if (now > spottedUntil && !nearMe && !inFriendlyZone) continue;
        }
        const x = toX(p.x);
        const y = toY(p.z);
        g.beginPath();
        g.arc(x, y, detailed ? 4.2 : 3.5, 0, Math.PI * 2);
        g.fillStyle = TEAMS[p.team].css;
        g.fill();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.2;
        g.stroke();
      }
    }

    // Yerel oyuncu, taktik radar halkası ve bakış konisi
    if (state && state.localPos && !isRespawn) {
      const x = toX(state.localPos.x);
      const y = toY(state.localPos.z);
      const yaw = state.yaw || 0;
      g.save();
      g.translate(x, y);
      // Oyuncu çevresi ince taktik radar halkası
      g.beginPath();
      g.arc(0, 0, detailed ? 26 : 19, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(240, 178, 74, 0.36)';
      g.lineWidth = 1;
      g.stroke();

      g.rotate(-yaw);
      // Bakış konisi
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, detailed ? 36 : 26, -Math.PI / 2 - 0.48, -Math.PI / 2 + 0.48);
      g.closePath();
      g.fillStyle = 'rgba(240, 178, 74, 0.28)';
      g.fill();
      // Oyuncu oku
      g.beginPath();
      g.moveTo(0, -8.5);
      g.lineTo(5.6, 6.0);
      g.lineTo(0, 3.4);
      g.lineTo(-5.6, 6.0);
      g.closePath();
      g.fillStyle = '#f0b24a';
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.6;
      g.stroke();
      g.restore();
    }

    // Harita kenarı K / D / G / B (N / E / S / W) pusula yön işaretleri
    g.save();
    g.font = 'bold 9px Segoe UI, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cardinals = [
      ['K', size / 2, 8],
      ['G', size / 2, size - 8],
      ['B', 8, size / 2],
      ['D', size - 8, size / 2],
    ];
    for (const [lbl, cx, cy] of cardinals) {
      g.fillStyle = 'rgba(5, 10, 14, 0.85)';
      g.fillRect(cx - 6, cy - 6, 12, 12);
      g.fillStyle = lbl === 'K' ? '#f0b24a' : '#d2dce2';
      g.fillText(lbl, cx, cy + 0.5);
    }
    g.restore();
  }

  pickDefaultSpawnZone() {
    const team = this.localTeam || 'red';
    const hqId = team === 'red' ? 'red_hq' : 'blue_hq';
    const current = this.zones.find((z) => z.id === this.selectedSpawnZone && z.owner === team);
    if (current) return current;
    const owned = this.zones.filter((z) => z.owner === team);
    const safe = owned.find((z) => !z.contested && !(z.enemyNear && z.enemyNear[team]));
    const fallback = owned.find((z) => z.id === hqId) || owned[0] || this.zones.find((z) => z.id === hqId) || this.zones[0];
    const chosen = safe || fallback;
    this.selectedSpawnZone = chosen ? chosen.id : hqId;
    return chosen;
  }

  showRespawn(info, respawnAt) {
    this.deathAt = Date.now();
    this.respawnAt = respawnAt;
    this.deployEnabled = false;
    this.el.deploy.disabled = true;
    this.toggleTacticalMap(false);
    this.el.deathInfo.textContent = info || 'Haritadan takımının kontrolündeki yanıp sönen bir bölge seç.';
    this.el.respawnTimer.textContent = Math.max(1, Math.ceil((respawnAt - Date.now()) / 1000));
    const chosen = this.pickDefaultSpawnZone();
    if (chosen) this.updateRespawnZoneBanner(chosen, this.localTeam || 'red');
    this.el.respawn.classList.remove('hidden');
    this.drawTacticalMap(this.el.respawnMap, null, { isRespawn: true });
  }

  hideRespawn() {
    this.el.respawn.classList.add('hidden');
  }

  showResults(msg) {
    this.toggleTacticalMap(false);
    const title = msg.winner ? `${TEAMS[msg.winner].name.toUpperCase()} KAZANDI` : 'BERABERE';
    this.el.resultTitle.textContent = title;
    this.el.resultTitle.className = msg.winner || 'draw';
    this.el.resultRed.textContent = msg.scores.red;
    this.el.resultBlue.textContent = msg.scores.blue;
    const reasons = {
      hq: 'Düşman komuta üssü ele geçirildi',
      time: 'Süre doldu — skor üstünlüğü belirlendi',
      score: 'Skor hedefine ulaşıldı',
    };
    this.el.resultReason.textContent = reasons[msg.reason] || 'Maç tamamlandı';
    const rows = ['<div class="rs-row"><span>OYUNCU</span><span>SKOR</span><span>K</span><span>Ö</span></div>'];
    for (const s of msg.stats || []) {
      rows.push(`<div class="rs-row"><span class="${s.team === 'red' ? 'r' : 'b'}">${s.name}</span><span>${s.score}</span><span>${s.kills}</span><span>${s.deaths}</span></div>`);
    }
    this.el.resultStats.innerHTML = rows.join('');
    this.el.resetTimer.textContent = Math.ceil(msg.resetIn || 0);
    this.el.results.classList.remove('hidden');
    this.el.respawn.classList.add('hidden');
  }

  hideResults() {
    this.el.results.classList.add('hidden');
  }

  showPause() {
    if (this.menuVisible || this.tacticalMapOpen || this.settingsOpen) return;
    this.el.pause.classList.remove('hidden');
  }

  hidePause() {
    this.el.pause.classList.add('hidden');
  }

  addKill(msg) {
    const item = document.createElement('div');
    const team = msg.killerTeam || (msg.killer === this.localId ? 'red' : '');
    item.className = `kill-item ${team}`;
    const kName = msg.killerName || 'Ada';
    const vName = msg.victimName || 'Asker';
    item.innerHTML = `<b class="${msg.killerTeam || ''}">${kName}</b><span class="gun">${weaponFor(msg.weapon).shortName}</span><span>›</span><b class="${msg.victimTeam || ''}">${vName}</b>${msg.headshot ? '<span class="hs">KAFA</span>' : ''}`;
    this.el.killfeed.prepend(item);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastElementChild.remove();
    setTimeout(() => item.remove(), 7000);
  }

  addFeed(text, kind = '') {
    const item = document.createElement('div');
    item.className = `feed-item ${kind}`;
    item.textContent = text;
    this.el.feed.appendChild(item);
    while (this.el.feed.children.length > 5) this.el.feed.firstElementChild.remove();
    setTimeout(() => item.remove(), 9000);
  }

  addChat(from, text, team, scope = 'all') {
    if (!this.settings.chatEnabled) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    const tag = document.createElement('b');
    tag.style.color = team && TEAMS[team] ? TEAMS[team].css : '#f0b24a';
    const prefix = scope === 'team' ? '[TAKIM] ' : '[GENEL] ';
    tag.textContent = `${prefix}${from}: `;
    const body = document.createTextNode(text);
    item.append(tag, body);
    this.el.feed.appendChild(item);
    while (this.el.feed.children.length > 5) this.el.feed.firstElementChild.remove();
    setTimeout(() => item.remove(), 11000);
  }

  showHitmark(head = false, kill = false) {
    this.el.hitmarker.classList.remove('show', 'head', 'kill');
    void this.el.hitmarker.offsetWidth;
    if (head) this.el.hitmarker.classList.add('head');
    if (kill) this.el.hitmarker.classList.add('kill');
    this.el.hitmarker.classList.add('show');
    this.hitTimer = kill ? 0.35 : 0.16;
  }

  showDamage(amount, dir, yaw) {
    this.el.damageVignette.style.opacity = String(clamp(amount / 60, 0.25, 0.85));
    this.damageTimer = 0.7;
    if (dir && (dir[0] !== 0 || dir[2] !== 0)) {
      // dir: saldırgandan hedefe doğru mermi vektörü. Saldırgan yönü = (-dir[0], -dir[2]).
      // Three.js kamera ileri yönü (yaw=0) -Z'dir; CSS rotate(0) +X yönündedir (-PI/2 fark).
      const angleToAttacker = Math.atan2(dir[0], dir[2]);
      const rel = yaw - angleToAttacker - Math.PI / 2;
      const el = document.createElement('div');
      el.className = 'dmg-dir';
      el.style.transform = `rotate(${rel}rad) translateX(70px)`;
      this.el.damageDirs.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    }
  }

  toggleScoreboard(show) {
    if (this.scoreboardOpen === show) return;
    this.scoreboardOpen = show;
    this.el.scoreboard.classList.toggle('hidden', !show);
    if (show) this.renderScoreboard();
  }

  renderScoreboard() {
    if (!this.snapshot) return;
    this.el.sbScore.textContent = `${this.snapshot.match.scores.red} — ${this.snapshot.match.scores.blue}`;
    const build = (team) => {
      const list = this.snapshot.players
        .filter((p) => p.team === team)
        .sort((a, b) => b.score - a.score || b.kills - a.kills);
      const rows = [`<div class="sb-team-title"><span>${TEAMS[team].name.toUpperCase()}</span><span>${list.length} OYUNCU</span></div>`];
      for (const p of list) {
        rows.push(`<div class="sb-row ${p.id === this.localId ? 'me' : ''}"><span class="nm"><i></i>${p.name}${p.bot ? '<em>BOT</em>' : ''}</span><span>${p.score}</span><span>${p.kills}</span><span>${p.deaths}</span></div>`);
      }
      return rows.join('');
    };
    this.el.sbRed.innerHTML = build('red');
    this.el.sbBlue.innerHTML = build('blue');
  }

  setChatScope(scope = 'all') {
    this.chatScope = scope === 'team' ? 'team' : 'all';
    if (this.el.chatScopeTag) {
      this.el.chatScopeTag.textContent = this.chatScope === 'team' ? 'TAKIM SOHBETİ (T)' : 'GENEL SOHBET (ENTER)';
      this.el.chatScopeTag.style.color = this.chatScope === 'team'
        ? (TEAMS[this.localTeam]?.css || '#4f8fe8')
        : 'var(--amber)';
    }
  }

  openChat(scope = 'all') {
    if (!this.settings.chatEnabled) return;
    this.chatOpen = true;
    this.setChatScope(scope);
    this.el.chatBox.classList.remove('hidden');
    this.el.chatInput.value = '';
    this.cb.onChatOpen?.();
    setTimeout(() => this.el.chatInput.focus(), 10);
  }

  closeChat() {
    this.chatOpen = false;
    this.el.chatBox.classList.add('hidden');
    this.el.chatInput.blur();
    this.cb.onChatClosed?.();
  }

  showToast(text, error = false) {
    this.el.toast.textContent = text;
    this.el.toast.classList.toggle('error', error);
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 2600);
  }

  setInteractHint(text) {
    if (this._cache.interactHint === (text || '')) return;
    this._cache.interactHint = text || '';
    this.el.interactHint.textContent = text || '';
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.el.debug.classList.toggle('hidden', !this.debugVisible);
  }
}
