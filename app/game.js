/* Захар: Косилка в подъезде — Three.js endless runner.
 * Classic script (no ES modules) so it works from file:///android_asset/.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  var ui = {
    root: $('game-root'),
    canvasWrap: $('canvas-wrap'),
    flash: $('flash'),
    hud: $('hud'),
    controls: $('controls'),
    menu: $('menu'),
    pause: $('pause'),
    gameover: $('gameover'),
    loading: $('loading'),
    fatal: $('fatal'),
    fatalText: $('fatal-text'),
    score: $('score'),
    distance: $('distance'),
    speed: $('speed'),
    lives: $('lives'),
    fuelFill: $('fuel-fill'),
    fps: $('fps'),
    qualityLabel: $('quality-label'),
    floor: $('floor'),
    powerups: $('powerups'),
    powerShield: $('power-shield'),
    powerShieldT: $('power-shield-t'),
    powerMagnet: $('power-magnet'),
    powerMagnetT: $('power-magnet-t'),
    powerDouble: $('power-double'),
    powerDoubleT: $('power-double-t'),
    boss: $('boss'),
    bossFill: $('boss-fill'),
    bossText: $('boss-text'),
    taunt: $('taunt'),
    tauntText: $('taunt-text'),
    toast: $('toast'),
    finalScore: $('final-score'),
    bestScore: $('best-score'),
    gameoverComment: $('gameover-comment'),
    startBtn: $('start-btn'),
    pauseBtn: $('pause-btn'),
    resumeBtn: $('resume-btn'),
    restartBtn: $('restart-btn'),
    restartPauseBtn: $('restart-pause-btn')
  };

  var state = {
    mode: 'loading',
    t: 0,
    lastTime: 0,
    hudTimer: 0,
    toastTimer: 0,
    flashTimer: 0,
    fatalShown: false,
    sceneReady: false,
    speed: 9,
    distance: 0,
    score: 0,
    bonus: 0,
    best: 0,
    lives: 3,
    fuel: 1,
    coins: 0,
    floor: 1,
    shield: 0,
    magnet: 0,
    doubleT: 0,
    boss: { active: false, nextAt: 500, t: 0, dropAt: 0, x: 0 },
    playerX: 0,
    steer: 0,
    jumpY: 0,
    jumpVel: 0,
    invuln: 0,
    shake: 0,
    waveTimer: 1.2,
    opponentCooldown: 7,
    opponent: { active: false, x: 0, z: -40, t: 0, drops: 0, taunt: '' },
    quality: 'auto',
    renderScale: 1.15,
    shadowsEnabled: true,
    fps: 60,
    fpsAccum: 0,
    fpsFrames: 0,
    lowTicks: 0,
    highTicks: 0
  };

  try {
    state.best = parseInt(window.localStorage.getItem('zahar_mower_best') || '0', 10) || 0;
    var savedQuality = window.localStorage.getItem('zahar_quality');
    if (savedQuality === 'auto' || savedQuality === 'high' || savedQuality === 'low') {
      state.quality = savedQuality;
    }
  } catch (e) {
    state.best = 0;
  }
  state.renderScale = state.quality === 'low' ? 0.85 : (state.quality === 'high' ? 1.25 : 1.15);

  var input = { left: false, right: false, gas: false, drag: 0 };
  var heldKeys = {};
  var pointerControls = {};
  var dragPointer = null;
  var dragStartX = 0;

  var renderer, scene, camera, aniso = 1;
  var textures = {};
  var floorTex, wallTex, ceilingTex, shadowTex;
  var wallMat;
  var glowTex, poolTex, floorNormal, wallNormal, envTex;
  var dirLight, hemiLight, fillLight, rimLight;
  var fogBase, fogTint;
  var dustPoints, dustPositions, dustGeometry;
  var playerGroup, playerBodySprite, playerHeadSprite, bladeGroup;
  var wheels = [];
  var opponentGroup, opponentSprite;
  var bossGroup, bossSprite;
  var corridorSegments = [];
  var obstacles = [];
  var pickups = [];
  var grassPatches = [];
  var particles = [];
  var particlePositions, particleGeometry;
  var SEG_LEN = 8;
  var SEG_COUNT = 14;
  var LANES = [-2.4, -1.2, 0, 1.2, 2.4];

  var TAUNTS = [
    'Сосед: «Опять косишь в подъезде?!»',
    'Сосед: «Не проедешь, Захар!»',
    'Сосед: «Я тут вёдра расставил!»',
    'Сосед: «Погоди, сейчас догоню!»',
    'Сосед: «Бензин-то кончается!»'
  ];
  var CRASH_LINES = [
    'Авария! Сосед подставил ведро!',
    'Конус! Пришлось притормозить…',
    'Бах! Жизней меньше.',
    'Косилка ударилась о мусорный бак!',
    'Ой! Прямо в соседа!'
  ];
  var GAMEOVER_LINES = [
    'Сосед доволен: трава пока жива.',
    'Подъезд вздохнул с облегчением.',
    'Захар уже тянется к стартеру.',
    'Рекорд ещё можно перебить!',
    'В следующий раз — газ в пол!'
  ];

  var TEX_FILES = {
    floor_tile: 'textures/floor_tile.png',
    wall_panel: 'textures/wall_panel.png',
    ceiling: 'textures/ceiling.png',
    brick: 'textures/brick.png',
    metal_dark: 'textures/metal_dark.png',
    mower_red: 'textures/mower_red.png',
    puffer: 'textures/puffer.png',
    shirt_zahar: 'textures/shirt_zahar.png',
    jacket_zahar: 'textures/jacket_zahar.png',
    door_1: 'textures/door_1.png',
    door_2: 'textures/door_2.png',
    door_3: 'textures/door_3.png',
    mailbox: 'textures/mailbox.png',
    poster_no: 'textures/poster_no.png',
    poster_neighbor: 'textures/poster_neighbor.png',
    poster_zahar: 'textures/poster_zahar.png',
    grass: 'textures/grass.png',
    tire: 'textures/tire.png',
    fuel: 'textures/fuel.png',
    coin: 'textures/coin.png',
    cone: 'textures/cone.png',
    bucket: 'textures/bucket.png',
    lamp: 'textures/lamp.png',
    face_zahar: 'textures/face_zahar.png',
    face_neighbor: 'textures/face_neighbor.png',
    body_neighbor: 'textures/body_neighbor.png',
    body_zahar: 'textures/body_zahar.png'
  };

  var OBSTACLE_TYPES = {
    cone:   { radius: 0.42, height: 0.78, jumpable: true },
    bucket: { radius: 0.42, height: 0.62, jumpable: true },
    tire:   { radius: 0.48, height: 0.40, jumpable: true },
    pot:    { radius: 0.45, height: 0.75, jumpable: false },
    bin:    { radius: 0.58, height: 1.05, jumpable: false }
  };
  var TYPE_BAG = ['cone', 'cone', 'cone', 'bucket', 'bucket', 'tire', 'pot', 'bin'];
  var POWER_KINDS = ['shield', 'magnet', 'double'];
  var BOSS_DURATION = 8;
  var FLOOR_COLORS = [0xffffff, 0xd9e9ff, 0xffe1c2, 0xd9ffd9, 0xf1d9ff, 0xffe0e0];
  var QUALITY_LABELS = { auto: 'АВТО', high: 'МАКС', low: 'ЭКОНОМ' };

  /* ------------------------------------------------------------------ audio */
  var sound = {
    ctx: null,
    engineGain: null,
    osc1: null,
    osc2: null,
    filter: null,
    enabled: false,
    init: function () {
      if (this.ctx) {
        this.resume();
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return; }
      try {
        this.ctx = new AC();
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.0001;
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 520;
        this.filter.Q.value = 2.2;
        this.osc1 = this.ctx.createOscillator();
        this.osc1.type = 'sawtooth';
        this.osc1.frequency.value = 55;
        this.osc2 = this.ctx.createOscillator();
        this.osc2.type = 'square';
        this.osc2.frequency.value = 82;
        var g2 = this.ctx.createGain();
        g2.gain.value = 0.35;
        this.osc1.connect(this.filter);
        this.osc2.connect(g2);
        g2.connect(this.filter);
        this.filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.osc1.start();
        this.osc2.start();
        this.enabled = true;
      } catch (e) {
        this.ctx = null;
      }
    },
    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') {
        try { this.ctx.resume(); } catch (e) {}
      }
    },
    setEngine: function (speed, boost, active) {
      if (!this.ctx || !this.enabled) { return; }
      var now = this.ctx.currentTime;
      var f = 48 + speed * 3.4 + (boost ? 24 : 0);
      try {
        this.osc1.frequency.setTargetAtTime(f, now, 0.08);
        this.osc2.frequency.setTargetAtTime(f * 1.51, now, 0.08);
        this.filter.frequency.setTargetAtTime(380 + speed * 28 + (boost ? 340 : 0), now, 0.1);
        this.engineGain.gain.setTargetAtTime(active ? (boost ? 0.075 : 0.045) : 0.0001, now, 0.12);
      } catch (e) {}
    },
    pause: function (muted) {
      if (!this.ctx || !this.enabled) { return; }
      try {
        this.engineGain.gain.setTargetAtTime(muted ? 0.0001 : 0.04, this.ctx.currentTime, 0.08);
      } catch (e) {}
    },
    blip: function (freq, duration, type, vol) {
      if (!this.ctx || !this.enabled) { return; }
      try {
        var now = this.ctx.currentTime;
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, now);
        o.frequency.exponentialRampToValueAtTime(freq * 1.45, now + duration);
        g.gain.setValueAtTime(vol || 0.12, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        o.connect(g);
        g.connect(this.ctx.destination);
        o.start(now);
        o.stop(now + duration + 0.02);
      } catch (e) {}
    },
    noise: function (duration, vol, cutoff) {
      if (!this.ctx || !this.enabled) { return; }
      try {
        var now = this.ctx.currentTime;
        var len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
        var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) { data[i] = (Math.random() * 2 - 1) * (1 - i / len); }
        var src = this.ctx.createBufferSource();
        src.buffer = buf;
        var f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = cutoff || 900;
        var g = this.ctx.createGain();
        g.gain.value = vol || 0.14;
        src.connect(f);
        f.connect(g);
        g.connect(this.ctx.destination);
        src.start(now);
      } catch (e) {}
    },
    coin: function () { this.blip(880, 0.13, 'triangle', 0.13); },
    fuel: function () { this.blip(430, 0.24, 'sawtooth', 0.10); },
    mow: function () { this.noise(0.12, 0.10, 2400); },
    crash: function () { this.noise(0.42, 0.28, 520); this.blip(110, 0.30, 'square', 0.12); },
    power: function () {
      this.blip(660, 0.18, 'triangle', 0.10);
      this.blip(990, 0.14, 'triangle', 0.07);
    },
    boss: function () {
      this.noise(0.50, 0.18, 420);
      this.blip(150, 0.45, 'sawtooth', 0.12);
    }
  };

  /* -------------------------------------------------------------- utilities */
  function showFatal(msg) {
    if (state.fatalShown) { return; }
    state.fatalShown = true;
    ui.fatalText.textContent = msg || 'Не удалось запустить 3D-сцену.';
    ui.fatal.classList.remove('hidden');
    ui.loading.classList.add('hidden');
    ui.menu.classList.add('hidden');
    ui.hud.classList.add('hidden');
    ui.controls.classList.add('hidden');
    ui.pause.classList.add('hidden');
    ui.gameover.classList.add('hidden');
  }

  function toast(text, kind) {
    ui.toast.textContent = text;
    ui.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    state.toastTimer = 1.65;
  }

  function flash() {
    ui.flash.classList.add('on');
    state.flashTimer = 0.18;
  }

  function setState(mode) {
    state.mode = mode;
    ui.menu.classList.toggle('hidden', mode !== 'menu');
    ui.pause.classList.toggle('hidden', mode !== 'paused');
    ui.gameover.classList.toggle('hidden', mode !== 'gameover');
    ui.hud.classList.toggle('hidden', mode !== 'playing' && mode !== 'paused');
    ui.controls.classList.toggle('hidden', mode !== 'playing');
    ui.loading.classList.add('hidden');
  }

  function formatScore(n) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < 6) { s = '0' + s; }
    return s;
  }

  function updateHUD(force) {
    state.hudTimer -= 1 / 60;
    if (!force && state.hudTimer > 0) { return; }
    state.hudTimer = 0.07;
    ui.score.textContent = formatScore(state.score);
    ui.distance.textContent = Math.floor(state.distance) + ' м';
    ui.speed.textContent = Math.round(state.speed * 3.6) + ' км/ч';
    ui.lives.textContent = '●'.repeat(Math.max(0, state.lives)) + '○'.repeat(Math.max(0, 3 - state.lives));
    ui.fuelFill.style.width = Math.round(clamp(state.fuel, 0, 1) * 100) + '%';
    ui.floor.textContent = String(state.floor);
    setPowerHud(ui.powerShield, ui.powerShieldT, state.shield);
    setPowerHud(ui.powerMagnet, ui.powerMagnetT, state.magnet);
    setPowerHud(ui.powerDouble, ui.powerDoubleT, state.doubleT);
    ui.boss.classList.toggle('hidden', !state.boss.active);
    ui.bossFill.style.width = state.boss.active
      ? Math.round(clamp(state.boss.t / BOSS_DURATION, 0, 1) * 100) + '%'
      : '0%';
  }

  function setPowerHud(chip, label, time) {
    var active = time > 0;
    chip.classList.toggle('active', active);
    label.textContent = active ? Math.ceil(time) + 'с' : '0с';
  }

  function applyQuality() {
    if (!renderer) { return; }
    var dpr = window.devicePixelRatio || 1;
    var ratio;
    if (state.quality === 'high') {
      ratio = Math.min(1.5, Math.max(1.25, dpr));
    } else if (state.quality === 'low') {
      ratio = 0.85;
    } else {
      ratio = clamp(state.renderScale, 0.85, 1.25);
    }
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    var wantShadows = state.quality !== 'low' &&
      (state.quality !== 'auto' || state.renderScale >= 0.95);
    state.shadowsEnabled = wantShadows;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = wantShadows;
      renderer.shadowMap.needsUpdate = true;
    }
    if (dirLight) {
      dirLight.castShadow = wantShadows;
      var sz = state.quality === 'low' ? 512 : 1024;
      dirLight.shadow.mapSize.set(sz, sz);
      if (dirLight.shadow.map) {
        dirLight.shadow.map.dispose();
        dirLight.shadow.map = null;
      }
    }
    corridorSegments.forEach(function (seg) {
      if (seg.userData.glow) { seg.userData.glow.visible = state.quality !== 'low'; }
      if (seg.userData.pool) { seg.userData.pool.visible = state.quality !== 'low'; }
    });
    pickups.forEach(function (p) {
      if (p.userData.glow) { p.userData.glow.visible = state.quality !== 'low'; }
    });
    if (dustPoints) { dustPoints.visible = state.quality !== 'low'; }
    if (ui.qualityLabel) {
      ui.qualityLabel.textContent = QUALITY_LABELS[state.quality] +
        (state.quality === 'auto' ? ' · ' + Math.round(ratio * 100) + '%' : '');
    }
  }

  function setQuality(q) {
    if (!QUALITY_LABELS[q]) { return; }
    state.quality = q;
    state.renderScale = q === 'low' ? 0.85 : (q === 'high' ? 1.25 : 1.15);
    state.lowTicks = 0;
    state.highTicks = 0;
    try { window.localStorage.setItem('zahar_quality', q); } catch (e) {}
    applyQuality();
    updateQualityButtons();
    toast('Графика: ' + QUALITY_LABELS[q]);
  }

  function updateQualityButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-quality]'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-quality') === state.quality);
    });
  }

  function updatePerf(dt) {
    state.fpsAccum += dt;
    state.fpsFrames++;
    if (state.fpsAccum < 1) { return; }
    var fps = state.fpsFrames / state.fpsAccum;
    state.fps = fps;
    state.fpsAccum = 0;
    state.fpsFrames = 0;
    if (ui.fps) { ui.fps.textContent = Math.round(fps) + ' FPS'; }
    if (state.quality !== 'auto') { return; }
    if (fps < 42) { state.lowTicks++; state.highTicks = 0; }
    else if (fps > 55) { state.highTicks++; state.lowTicks = 0; }
    else { state.lowTicks = 0; state.highTicks = 0; }
    if (state.lowTicks >= 2 && state.renderScale > 0.85) {
      state.renderScale = Math.max(0.85, state.renderScale - 0.15);
      applyQuality();
      state.lowTicks = 0;
      toast('Авто: снижаю разрешение для плавности');
    } else if (state.highTicks >= 4 && state.renderScale < 1.25) {
      state.renderScale = Math.min(1.25, state.renderScale + 0.10);
      applyQuality();
      state.highTicks = 0;
    }
  }

  function updateLighting(dt) {
    if (!dirLight) { return; }
    var x = state.playerX * 0.25;
    dirLight.position.set(x + 5.5, 9.2, 8);
    dirLight.target.position.set(x, 0, -9);
    dirLight.target.updateMatrixWorld();
    var flicker = 0.96 + Math.sin(state.t * 8.3) * 0.025 + Math.sin(state.t * 2.1) * 0.015;
    dirLight.intensity = (state.shadowsEnabled ? 1.18 : 0.95) * flicker;
    if (hemiLight) { hemiLight.intensity = 0.62 + Math.sin(state.t * 0.6) * 0.02; }
    if (fillLight) {
      fillLight.position.set(x, 3.7, 4);
      fillLight.intensity = 1.05 + Math.sin(state.t * 9) * 0.06;
    }
    if (rimLight) {
      rimLight.position.set(x, 3.3, -12);
      rimLight.intensity = 0.50 + Math.sin(state.t * 5) * 0.05;
    }
    if (scene.fog && fogBase && fogTint) {
      var fc = FLOOR_COLORS[(state.floor - 1) % FLOOR_COLORS.length];
      fogTint.setHex(fc).multiplyScalar(0.10).lerp(fogBase, 0.85);
      scene.fog.color.lerp(fogTint, Math.min(1, dt * 0.8));
      if (scene.background && scene.background.copy) { scene.background.copy(scene.fog.color); }
    }
  }

  /* --------------------------------------------------------------- textures */
  function loadTextures(onDone) {
    var manager = new THREE.LoadingManager();
    var loader = new THREE.TextureLoader(manager);
    var finished = false;
    var done = function () {
      if (finished) { return; }
      finished = true;
      onDone();
    };
    manager.onLoad = done;
    manager.onError = function (url) {
      console.warn('Texture failed to load:', url);
    };
    Object.keys(TEX_FILES).forEach(function (name) {
      var tex = loader.load(TEX_FILES[name]);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = aniso;
      if (name === 'floor_tile') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 30);
        floorTex = tex;
      } else if (name === 'wall_panel') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(20, 1);
        wallTex = tex;
      } else if (name === 'ceiling') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 24);
        ceilingTex = tex;
      }
      tex.needsUpdate = true;
      textures[name] = tex;
    });
    // Never let a missing/slow image keep the game behind a loading screen.
    window.setTimeout(done, 5000);
  }

  function mat(name, color, opts) {
    var o = { map: textures[name] || null, color: color === undefined ? 0xffffff : color };
    if (opts) { Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); }
    return new THREE.MeshLambertMaterial(o);
  }

  function pbr(name, color, opts) {
    var o = {
      map: textures[name] || null,
      color: color === undefined ? 0xffffff : color,
      roughness: 0.7,
      metalness: 0.05
    };
    if (opts) { Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); }
    return new THREE.MeshStandardMaterial(o);
  }

  function basicMat(name, color, opts) {
    var o = { map: textures[name] || null, color: color === undefined ? 0xffffff : color };
    if (opts) { Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); }
    return new THREE.MeshBasicMaterial(o);
  }

  function makeSprite(name, w, h, opacity) {
    var m = new THREE.SpriteMaterial({
      map: textures[name] || null,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      opacity: opacity === undefined ? 1 : opacity
    });
    var s = new THREE.Sprite(m);
    s.scale.set(w, h, 1);
    return s;
  }

  function addBox(parent, w, h, d, material, x, y, z, rx, ry, rz) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx) { m.rotation.x = rx; }
    if (ry) { m.rotation.y = ry; }
    if (rz) { m.rotation.z = rz; }
    parent.add(m);
    return m;
  }

  function makePlane(w, h, material) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  }

  function makeShadowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.62)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  function makeGlowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,240,195,0.95)');
    g.addColorStop(0.28, 'rgba(255,190,90,0.42)');
    g.addColorStop(0.65, 'rgba(255,145,45,0.12)');
    g.addColorStop(1, 'rgba(255,130,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  function makeNormalMap(size, seed, strength) {
    var data = new Uint8Array(size * size * 4);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var a = (x + seed * 13) * 0.21;
        var b = y * 0.17;
        var c = (x + y + seed * 7) * 0.11;
        var dx = Math.cos(a) * Math.cos(b) * 0.21 + Math.cos(c) * 0.08;
        var dy = -Math.sin(a) * Math.sin(b) * 0.17 + Math.cos(c) * 0.08;
        var nx = -dx * strength;
        var ny = -dy * strength;
        var nz = 1;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        var i = (y * size + x) * 4;
        data[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
    }
    var t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(12, 12);
    t.needsUpdate = true;
    return t;
  }

  function makeEnvTexture() {
    var w = 64, h = 32;
    var data = new Uint8Array(w * h * 4);
    for (var y = 0; y < h; y++) {
      var v = y / (h - 1);
      for (var x = 0; x < w; x++) {
        var side = Math.abs(x / (w - 1) - 0.5) * 2;
        var r, g, b;
        if (v < 0.45) {
          var k = v / 0.45;
          r = lerp(255, 95, k);
          g = lerp(220, 135, k);
          b = lerp(175, 195, k);
        } else {
          var k2 = (v - 0.45) / 0.55;
          r = lerp(95, 16, k2);
          g = lerp(135, 30, k2);
          b = lerp(195, 52, k2);
        }
        var shade = 1 - side * 0.22;
        var i = (y * w + x) * 4;
        data[i] = Math.round(r * shade);
        data[i + 1] = Math.round(g * shade);
        data[i + 2] = Math.round(b * shade);
        data[i + 3] = 255;
      }
    }
    var t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }

  function enableShadows(obj, cast, receive) {
    obj.traverse(function (o) {
      if (o.isMesh) {
        o.castShadow = !!cast;
        o.receiveShadow = !!receive;
      }
    });
  }

  function makeShadow(rx, rz, opacity) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(rx * 2, rz * 2),
      new THREE.MeshBasicMaterial({
        map: shadowTex, transparent: true,
        opacity: (opacity || 0.55) * (state.shadowsEnabled ? 0.52 : 1),
        depthWrite: false, side: THREE.DoubleSide
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.022;
    return m;
  }

  /* ------------------------------------------------------------------ scene */
  function buildCorridor() {
    var floorMat = pbr('floor_tile', 0xffffff, {
      side: THREE.DoubleSide, roughness: 0.52, metalness: 0.08,
      normalMap: floorNormal, normalScale: new THREE.Vector2(0.32, 0.32),
      envMapIntensity: 0.35
    });
    wallMat = pbr('wall_panel', 0xffffff, {
      side: THREE.DoubleSide, roughness: 0.86, metalness: 0.02,
      normalMap: wallNormal, normalScale: new THREE.Vector2(0.20, 0.20),
      envMapIntensity: 0.22
    });
    var ceilMat = pbr('ceiling', 0xd8d8d8, { side: THREE.DoubleSide, roughness: 0.95 });

    var floor = makePlane(7.2, 200, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -90);
    scene.add(floor);

    var wallL = makePlane(200, 4.2, wallMat);
    wallL.rotation.y = Math.PI / 2;
    wallL.position.set(-3.6, 2.1, -90);
    scene.add(wallL);

    var wallR = makePlane(200, 4.2, wallMat);
    wallR.rotation.y = -Math.PI / 2;
    wallR.position.set(3.6, 2.1, -90);
    scene.add(wallR);

    floor.receiveShadow = wallL.receiveShadow = wallR.receiveShadow = true;

    var ceiling = makePlane(7.2, 200, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 4.22, -90);
    scene.add(ceiling);

    // Dark skirting boards and ceiling cornices add depth to the corridor.
    var dark = pbr('metal_dark', 0x1b2226, { roughness: 0.48, metalness: 0.38 });
    var b1 = addBox(scene, 0.12, 0.24, 200, dark, -3.52, 0.12, -90);
    var b2 = addBox(scene, 0.12, 0.24, 200, dark, 3.52, 0.12, -90);
    var b3 = addBox(scene, 0.16, 0.14, 200, dark, -3.50, 4.12, -90);
    var b4 = addBox(scene, 0.16, 0.14, 200, dark, 3.50, 4.12, -90);
    [b1, b2, b3, b4].forEach(function (m) { m.receiveShadow = true; });
  }

  function randomizeSegment(seg) {
    var doors = [textures.door_1, textures.door_2, textures.door_3];
    var posters = [textures.poster_no, textures.poster_neighbor, textures.poster_zahar];
    if (seg.userData.doorMat) {
      seg.userData.doorMat.map = pick(doors);
      seg.userData.doorMat.needsUpdate = true;
    }
    if (seg.userData.posterMat) {
      seg.userData.posterMat.map = pick(posters);
      seg.userData.posterMat.needsUpdate = true;
    }
    if (seg.userData.bollard) {
      seg.userData.bollard.visible = Math.random() < 0.34;
    }
    if (seg.userData.glow) { seg.userData.glow.visible = state.quality !== 'low'; }
    if (seg.userData.pool) { seg.userData.pool.visible = state.quality !== 'low'; }
  }

  function buildSegment(index) {
    var g = new THREE.Group();
    g.position.z = -index * SEG_LEN;
    g.userData.index = index;

    var side = index % 2 === 0 ? -1 : 1;
    var doorMat = pbr('door_1', 0xffffff, { side: THREE.DoubleSide, roughness: 0.78, metalness: 0.05, envMapIntensity: 0.25 });
    var door = makePlane(1.18, 2.25, doorMat);
    door.rotation.y = side * Math.PI / 2;
    door.position.set(side * 3.55, 1.55, -1.4);
    g.add(door);
    g.userData.doorMat = doorMat;

    var frameMat = pbr('metal_dark', 0x20262a, { roughness: 0.45, metalness: 0.45 });
    addBox(g, 0.10, 2.42, 1.38, frameMat, side * 3.50, 1.55, -1.4, 0, 0, 0);
    // thin frame line in front of the door
    addBox(g, 0.04, 2.42, 0.06, frameMat, side * 3.47, 1.55, -2.10);
    addBox(g, 0.04, 2.42, 0.06, frameMat, side * 3.47, 1.55, -0.70);

    var mailboxMat = pbr('mailbox', 0xffffff, { side: THREE.DoubleSide, roughness: 0.62, metalness: 0.22 });
    var mailbox = makePlane(1.0, 0.72, mailboxMat);
    mailbox.rotation.y = -side * Math.PI / 2;
    mailbox.position.set(-side * 3.54, 1.35, 1.5);
    g.add(mailbox);

    var posterMat = pbr('poster_no', 0xffffff, { side: THREE.DoubleSide, roughness: 0.90 });
    var poster = makePlane(0.78, 1.15, posterMat);
    poster.rotation.y = -side * Math.PI / 2;
    poster.position.set(-side * 3.53, 2.65, -2.0);
    g.add(poster);
    g.userData.posterMat = posterMat;

    // Ceiling lamp (emissive-looking basic material, cheap on mobile).
    var lampMat = basicMat('lamp', 0xffffff, { transparent: true, side: THREE.DoubleSide, depthWrite: false });
    var lamp = makePlane(0.95, 0.48, lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 4.15, 0.4);
    g.add(lamp);
    addBox(g, 1.05, 0.05, 0.55, pbr('metal_dark', 0x1d2224, { roughness: 0.5, metalness: 0.4 }), 0, 4.18, 0.4);

    // Fake bloom: additive glow around the lamp + warm light pool on the floor.
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffd9a0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55
    }));
    glow.scale.set(2.6, 1.5, 1);
    glow.position.set(0, 3.98, 0.4);
    g.add(glow);
    var pool = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 5.2),
      new THREE.MeshBasicMaterial({
        map: poolTex, color: 0xffc978, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
        opacity: 0.16, side: THREE.DoubleSide
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.045, 0.4);
    g.add(pool);
    g.userData.glow = glow;
    g.userData.pool = pool;

    // A nod to photo #2: the neighbour standing on a white/black bollard.
    var bollard = new THREE.Group();
    var bx = (index % 4 < 2) ? -2.95 : 2.95;
    var bz = -2.6;
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.95, 10), pbr('brick', 0xd8d8d0, { roughness: 0.8 }));
    post.position.set(bx, 0.48, bz);
    bollard.add(post);
    var postBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.30, 10), mat('metal_dark', 0x222426));
    postBottom.position.set(bx, 0.16, bz);
    bollard.add(postBottom);
    var statue = makeSprite('body_neighbor', 0.72, 1.72, 0.96);
    statue.position.set(bx, 1.78, bz + 0.02);
    bollard.add(statue);
    g.add(bollard);
    g.userData.bollard = bollard;

    enableShadows(g, false, true);
    g.userData.glow.castShadow = false;
    g.userData.pool.receiveShadow = false;
    randomizeSegment(g);
    scene.add(g);
    corridorSegments.push(g);
  }

  function buildPlayer() {
    playerGroup = new THREE.Group();
    scene.add(playerGroup);

    var red = pbr('mower_red', 0xffffff, { roughness: 0.32, metalness: 0.28, envMapIntensity: 0.55 });
    var dark = pbr('metal_dark', 0x262c30, { roughness: 0.38, metalness: 0.55, envMapIntensity: 0.65 });
    var tire = pbr('tire', 0x202224, { roughness: 0.92 });
    var hub = pbr('metal_dark', 0x8b9296, { roughness: 0.30, metalness: 0.72, envMapIntensity: 0.8 });

    playerGroup.add(makeShadow(1.25, 1.5, 0.55));

    // Mower deck, hood, engine, seat and steering wheel.
    addBox(playerGroup, 1.82, 0.28, 2.18, red, 0, 0.34, 0);
    addBox(playerGroup, 1.58, 0.08, 1.72, dark, 0, 0.51, 0);
    addBox(playerGroup, 1.24, 0.52, 0.86, red, 0, 0.78, -0.62);
    addBox(playerGroup, 0.92, 0.46, 0.72, dark, 0, 0.76, 0.34);
    addBox(playerGroup, 0.72, 0.16, 0.62, dark, 0, 0.90, 0.94);
    addBox(playerGroup, 0.74, 0.56, 0.14, dark, 0, 1.18, 1.24);
    addBox(playerGroup, 1.95, 0.10, 0.18, red, 0, 0.30, -1.12);

    var steering = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.038, 8, 18), hub);
    steering.rotation.x = -Math.PI / 2;
    steering.position.set(0, 1.16, 0.12);
    playerGroup.add(steering);
    addBox(playerGroup, 0.06, 0.28, 0.06, hub, 0, 1.02, 0.12);

    // Spinning cutting blade under the deck.
    bladeGroup = new THREE.Group();
    bladeGroup.position.set(0, 0.16, -0.34);
    addBox(bladeGroup, 1.72, 0.035, 0.11, hub, 0, 0, 0);
    addBox(bladeGroup, 0.11, 0.035, 1.72, hub, 0, 0, 0);
    playerGroup.add(bladeGroup);

    function makeWheel(x, z, r, width) {
      var pivot = new THREE.Group();
      pivot.position.set(x, r, z);
      var t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 16), tire);
      t.rotation.z = Math.PI / 2;
      pivot.add(t);
      var h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.46, r * 0.46, width + 0.025, 12), hub);
      h.rotation.z = Math.PI / 2;
      pivot.add(h);
      playerGroup.add(pivot);
      wheels.push({ pivot: pivot, radius: r });
    }
    makeWheel(-0.93, -0.82, 0.27, 0.18);
    makeWheel(0.93, -0.82, 0.27, 0.18);
    makeWheel(-0.93, 0.82, 0.38, 0.24);
    makeWheel(0.93, 0.82, 0.38, 0.24);

    // Legs, photo-derived torso cutout and head cutout.
    var pants = mat('jacket_zahar', 0x15171a);
    addBox(playerGroup, 0.22, 0.52, 0.26, pants, -0.24, 0.72, 0.55, 0.25, 0, 0);
    addBox(playerGroup, 0.22, 0.52, 0.26, pants, 0.24, 0.72, 0.55, 0.25, 0, 0);

    playerBodySprite = makeSprite('body_zahar', 1.06, 1.16);
    playerBodySprite.position.set(0, 1.55, 0.60);
    playerGroup.add(playerBodySprite);

    playerHeadSprite = makeSprite('face_zahar', 0.74, 0.74);
    playerHeadSprite.position.set(0, 2.34, 0.62);
    playerGroup.add(playerHeadSprite);
    enableShadows(playerGroup, true, true);
  }

  function buildOpponent() {
    opponentGroup = new THREE.Group();
    opponentGroup.visible = false;
    scene.add(opponentGroup);
    opponentGroup.add(makeShadow(0.62, 0.46, 0.5));

    // Slight 3D volume behind the billboard, textured with the real puffer coat.
    var volume = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), pbr('puffer', 0x9a91a8, { roughness: 0.82 }));
    volume.scale.set(0.78, 1.05, 0.48);
    volume.position.set(0, 1.48, -0.16);
    opponentGroup.add(volume);

    opponentSprite = makeSprite('body_neighbor', 1.04, 2.42);
    opponentSprite.position.set(0, 1.28, 0.06);
    opponentGroup.add(opponentSprite);
    enableShadows(opponentGroup, true, true);
  }

  function buildBoss() {
    bossGroup = new THREE.Group();
    bossGroup.visible = false;
    scene.add(bossGroup);
    bossGroup.add(makeShadow(1.35, 0.75, 0.62));

    bossSprite = makeSprite('body_neighbor', 1.9, 4.2);
    bossSprite.position.set(0, 2.15, 0);
    bossGroup.add(bossSprite);

    var head = makeSprite('face_neighbor', 1.35, 1.35);
    head.position.set(0.95, 4.05, 0.08);
    bossGroup.add(head);

    var halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.085, 8, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffd34a, emissive: 0x4a3300,
        roughness: 0.28, metalness: 0.55, envMapIntensity: 0.9
      })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 4.55, 0);
    bossGroup.add(halo);
    enableShadows(bossGroup, true, true);
  }

  function buildObstacleObject() {
    var g = new THREE.Group();
    g.visible = false;
    g.userData.active = false;
    g.userData.kind = 'cone';
    g.userData.radius = 0.4;
    g.userData.height = 0.7;
    g.userData.jumpable = true;
    g.add(makeShadow(0.55, 0.45, 0.42));

    var children = {};
    var cone = new THREE.Group();
    var coneMesh = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.74, 14), mat('cone'));
    coneMesh.position.y = 0.40;
    cone.add(coneMesh);
    var coneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 14), mat('metal_dark', 0x282a2c));
    coneBase.position.y = 0.04;
    cone.add(coneBase);
    g.add(cone); children.cone = cone;

    var bucket = new THREE.Group();
    var bucketMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.22, 0.55, 14), mat('bucket'));
    bucketMesh.position.y = 0.32;
    bucket.add(bucketMesh);
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 16), mat('metal_dark', 0x999999));
    handle.rotation.x = Math.PI / 2;
    handle.position.y = 0.61;
    bucket.add(handle);
    g.add(bucket); children.bucket = bucket;

    var tire = new THREE.Group();
    var tireMesh = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.14, 10, 18), mat('tire', 0x232527));
    tireMesh.rotation.x = Math.PI / 2;
    tireMesh.position.y = 0.16;
    tire.add(tireMesh);
    g.add(tire); children.tire = tire;

    var pot = new THREE.Group();
    var potMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.24, 0.42, 14), mat('brick', 0xb07058));
    potMesh.position.y = 0.23;
    pot.add(potMesh);
    var plantMat = mat('grass', 0x6fbf46);
    for (var i = 0; i < 5; i++) {
      var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.46, 6), plantMat);
      leaf.position.set(rand(-0.18, 0.18), rand(0.55, 0.75), rand(-0.15, 0.15));
      leaf.rotation.z = rand(-0.5, 0.5);
      pot.add(leaf);
    }
    g.add(pot); children.pot = pot;

    var bin = new THREE.Group();
    var binMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.40, 0.88, 14), mat('metal_dark', 0x4a5256));
    binMesh.position.y = 0.47;
    bin.add(binMesh);
    var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.09, 14), mat('metal_dark', 0x30373b));
    lid.position.y = 0.96;
    bin.add(lid);
    g.add(bin); children.bin = bin;

    g.userData.children = children;
    enableShadows(g, true, true);
    scene.add(g);
    return g;
  }

  function buildPickupObject() {
    var g = new THREE.Group();
    g.visible = false;
    g.userData.active = false;
    g.userData.kind = 'coin';

    var coin = makePlane(0.58, 0.58, basicMat('coin', 0xffffff, {
      transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false
    }));
    coin.position.y = 0.78;
    g.add(coin);

    var fuel = new THREE.Group();
    addBox(fuel, 0.46, 0.62, 0.28, basicMat('fuel', 0xffffff), 0, 0.78, 0);
    addBox(fuel, 0.16, 0.10, 0.16, mat('metal_dark', 0x333333), 0.12, 1.14, 0);
    g.add(fuel);

    var power = new THREE.Group();
    var shield = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.33),
      new THREE.MeshLambertMaterial({ color: 0x4fd8ff, emissive: 0x0b3a55, transparent: true, opacity: 0.92 })
    );
    var magnet = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.085, 8, 20, Math.PI * 1.6),
      new THREE.MeshLambertMaterial({ color: 0xff7a6a, emissive: 0x4a1008 })
    );
    magnet.rotation.z = Math.PI * 0.2;
    var double = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.31),
      new THREE.MeshLambertMaterial({ color: 0xffd34a, emissive: 0x4a3300 })
    );
    shield.position.y = magnet.position.y = double.position.y = 0.78;
    power.add(shield);
    power.add(magnet);
    power.add(double);
    g.add(power);

    var pickupGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffd34a, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45
    }));
    pickupGlow.scale.set(1.05, 1.05, 1);
    pickupGlow.position.y = 0.78;
    g.add(pickupGlow);

    g.userData.coin = coin;
    g.userData.fuel = fuel;
    g.userData.glow = pickupGlow;
    g.userData.power = power;
    g.userData.shield = shield;
    g.userData.magnet = magnet;
    g.userData.double = double;
    scene.add(g);
    return g;
  }

  function buildGrassObject() {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.05, 3.0),
      new THREE.MeshBasicMaterial({
        map: textures.grass || null, transparent: true, opacity: 0.96,
        depthWrite: false, side: THREE.DoubleSide
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.035;
    m.visible = false;
    m.userData.active = false;
    scene.add(m);
    return m;
  }

  function buildPools() {
    for (var i = 0; i < 26; i++) { obstacles.push(buildObstacleObject()); }
    for (var j = 0; j < 20; j++) { pickups.push(buildPickupObject()); }
    for (var k = 0; k < 16; k++) { grassPatches.push(buildGrassObject()); }
  }

  function buildParticles() {
    var count = 150;
    particlePositions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      particlePositions[i * 3] = 0;
      particlePositions[i * 3 + 1] = -100;
      particlePositions[i * 3 + 2] = 0;
      particles.push({ life: 0, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0 });
    }
    particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    var material = new THREE.PointsMaterial({
      color: 0x9be65a, size: 0.11, transparent: true, opacity: 0.9,
      depthWrite: false, sizeAttenuation: true
    });
    var points = new THREE.Points(particleGeometry, material);
    scene.add(points);
  }

  function buildDust() {
    var count = 70;
    dustPositions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      dustPositions[i * 3] = rand(-3.0, 3.0);
      dustPositions[i * 3 + 1] = rand(0.4, 3.8);
      dustPositions[i * 3 + 2] = rand(-52, 8);
    }
    dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    var material = new THREE.PointsMaterial({
      color: 0xffe6b0, size: 0.045, transparent: true, opacity: 0.34,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    dustPoints = new THREE.Points(dustGeometry, material);
    scene.add(dustPoints);
  }

  function updateDust(dt, speed) {
    if (!dustPoints || !dustPoints.visible) { return; }
    for (var i = 0; i < dustPositions.length / 3; i++) {
      dustPositions[i * 3 + 2] += speed * dt * 0.35;
      if (dustPositions[i * 3 + 2] > 8) { dustPositions[i * 3 + 2] -= 60; }
      dustPositions[i * 3] += Math.sin(state.t * 0.7 + i) * dt * 0.03;
      dustPositions[i * 3 + 1] += Math.cos(state.t * 0.5 + i) * dt * 0.02;
    }
    dustGeometry.attributes.position.needsUpdate = true;
  }

  function buildScene() {
    shadowTex = makeShadowTexture();
    glowTex = makeGlowTexture();
    poolTex = glowTex;
    floorNormal = makeNormalMap(64, 3, 0.55);
    floorNormal.repeat.set(12, 12);
    wallNormal = makeNormalMap(64, 7, 0.35);
    wallNormal.repeat.set(20, 2);
    envTex = makeEnvTexture();
    scene.environment = envTex;

    fogBase = new THREE.Color(0x0d1720);
    fogTint = new THREE.Color();
    scene.background = fogBase.clone();
    scene.fog = new THREE.Fog(fogBase.clone(), 18, 76);

    hemiLight = new THREE.HemisphereLight(0xbdd4ff, 0x241d18, 0.62);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(0xffe3b8, 1.18);
    dirLight.position.set(5.5, 9.2, 8);
    dirLight.target.position.set(0, 0, -9);
    scene.add(dirLight.target);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -7;
    dirLight.shadow.camera.right = 7;
    dirLight.shadow.camera.top = 9;
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 34;
    dirLight.shadow.bias = -0.00035;
    dirLight.shadow.normalBias = 0.025;
    dirLight.shadow.radius = 3;
    scene.add(dirLight);

    fillLight = new THREE.PointLight(0xffcf8a, 1.05, 20, 1.4);
    fillLight.position.set(0, 3.7, 4);
    scene.add(fillLight);
    rimLight = new THREE.PointLight(0x88bbff, 0.50, 18, 1.3);
    rimLight.position.set(0, 3.3, -12);
    scene.add(rimLight);

    buildCorridor();
    for (var i = 0; i < SEG_COUNT; i++) { buildSegment(i); }
    buildPlayer();
    buildOpponent();
    buildBoss();
    buildPools();
    buildParticles();
    buildDust();
    resetWorld();
    applyQuality();
  }

  /* --------------------------------------------------------------- gameplay */
  function setObstacleKind(obj, kind) {
    var def = OBSTACLE_TYPES[kind];
    obj.userData.kind = kind;
    obj.userData.radius = def.radius;
    obj.userData.height = def.height;
    obj.userData.jumpable = def.jumpable;
    Object.keys(obj.userData.children).forEach(function (k) {
      obj.userData.children[k].visible = (k === kind);
    });
  }

  function spawnObstacle(kind, x, z) {
    var obj = null;
    for (var i = 0; i < obstacles.length; i++) {
      if (!obstacles[i].userData.active) { obj = obstacles[i]; break; }
    }
    if (!obj) { return; }
    setObstacleKind(obj, kind);
    obj.userData.active = true;
    obj.visible = true;
    obj.position.set(x, 0, z);
    obj.rotation.set(0, rand(0, Math.PI * 2), 0);
  }

  function spawnPickup(kind, x, z) {
    var obj = null;
    for (var i = 0; i < pickups.length; i++) {
      if (!pickups[i].userData.active) { obj = pickups[i]; break; }
    }
    if (!obj) { return; }
    obj.userData.active = true;
    obj.userData.kind = kind;
    obj.visible = true;
    obj.position.set(x, 0, z);
    obj.userData.coin.visible = (kind === 'coin');
    obj.userData.fuel.visible = (kind === 'fuel');
    obj.userData.power.visible = POWER_KINDS.indexOf(kind) >= 0;
    obj.userData.shield.visible = (kind === 'shield');
    obj.userData.magnet.visible = (kind === 'magnet');
    obj.userData.double.visible = (kind === 'double');
    obj.rotation.y = 0;
  }

  function spawnGrass(x, z) {
    var obj = null;
    for (var i = 0; i < grassPatches.length; i++) {
      if (!grassPatches[i].userData.active) { obj = grassPatches[i]; break; }
    }
    if (!obj) { return; }
    obj.userData.active = true;
    obj.visible = true;
    obj.material.opacity = 0.96;
    obj.scale.set(1, 1, 1);
    obj.position.set(x, 0.035, z);
  }

  function spawnParticles(x, z, count) {
    var spawned = 0;
    for (var i = 0; i < particles.length && spawned < count; i++) {
      var p = particles[i];
      if (p.life > 0) { continue; }
      p.life = rand(0.45, 0.9);
      p.x = x + rand(-0.75, 0.75);
      p.y = rand(0.12, 0.4);
      p.z = z + rand(-0.8, 0.4);
      p.vx = rand(-2.2, 2.2);
      p.vy = rand(2.0, 5.2);
      p.vz = rand(-1.5, 1.6);
      spawned++;
    }
  }

  function spawnWave() {
    if (state.boss.active) {
      state.waveTimer = 0.8;
      return;
    }
    var lanes = LANES.slice();
    // Shuffle lane order.
    for (var i = lanes.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = lanes[i]; lanes[i] = lanes[j]; lanes[j] = tmp;
    }
    var count = Math.random() < (0.28 + Math.min(state.distance / 900, 0.28)) ? 2 : 1;
    for (var c = 0; c < count; c++) {
      spawnObstacle(pick(TYPE_BAG), lanes[c], -56 - c * 1.4);
    }
    var freeLane = lanes[Math.min(lanes.length - 1, count + Math.floor(Math.random() * 2))];
    var roll = Math.random();
    if (roll < 0.10) {
      spawnPickup('fuel', freeLane, -55);
    } else if (roll < 0.34) {
      spawnPickup('coin', freeLane, -55);
    } else if (roll < 0.52) {
      spawnPickup(pick(POWER_KINDS), freeLane, -55);
    } else {
      spawnGrass(freeLane, -55);
    }
    state.waveTimer = Math.max(0.52, 1.55 - state.distance / 900 - (state.floor - 1) * 0.05)
      + Math.random() * 0.35;
  }

  function deactivate(obj) {
    obj.userData.active = false;
    obj.visible = false;
    obj.position.z = -200;
  }

  function hit(reason) {
    if (state.invuln > 0 || state.mode !== 'playing') { return; }
    if (state.shield > 0) {
      state.shield = 0;
      state.invuln = 1.15;
      state.shake = 0.35;
      sound.power();
      toast('Щит спас! Столкновение в ноль', 'gold');
      updateHUD(true);
      return;
    }
    state.lives--;
    state.invuln = 1.35;
    state.shake = 0.9;
    state.speed *= 0.55;
    flash();
    sound.crash();
    try { if (navigator.vibrate) { navigator.vibrate(90); } } catch (e) {}
    toast(reason || pick(CRASH_LINES), 'bad');
    updateHUD(true);
    if (state.lives <= 0) { endGame(); }
  }

  function collectCoin(obj) {
    state.bonus += 50;
    state.coins++;
    sound.coin();
    toast('Монета! +50', 'gold');
    deactivate(obj);
  }

  function collectFuel(obj) {
    state.fuel = Math.min(1, state.fuel + 0.55);
    state.bonus += 100;
    sound.fuel();
    toast('Канистра! Газ в пол! +100', 'gold');
    deactivate(obj);
  }

  function collectPower(kind) {
    var text;
    if (kind === 'shield') {
      state.shield = Math.min(16, state.shield + 10);
      text = 'Щит! Следующее столкновение бесплатно';
    } else if (kind === 'magnet') {
      state.magnet = Math.min(16, state.magnet + 9);
      text = 'Магнит! Монеты летят к косилке';
    } else {
      state.doubleT = Math.min(16, state.doubleT + 9);
      text = '×2 к очкам на 9 секунд!';
    }
    state.bonus += 75;
    sound.power();
    toast(text + ' +75', 'gold');
    updateHUD(true);
  }

  function mowGrass(obj) {
    state.bonus += 60;
    spawnParticles(state.playerX, obj.position.z, 34);
    sound.mow();
    toast('Трава скошена! +60');
    deactivate(obj);
  }

  function updateObjects(dt, speed) {
    var i, obj, kind;
    for (i = 0; i < obstacles.length; i++) {
      obj = obstacles[i];
      if (!obj.userData.active) { continue; }
      obj.position.z += speed * dt;
      if (obj.userData.kind === 'tire') { obj.rotation.y += dt * 1.8; }
      if (obj.position.z > 8) { deactivate(obj); continue; }
      if (Math.abs(obj.position.z) < 1.0 && Math.abs(obj.position.x - state.playerX) < obj.userData.radius + 0.62) {
        if (state.jumpY > 0.45 && obj.userData.jumpable) {
          state.bonus += 25;
          toast('Перепрыгнул! +25');
          deactivate(obj);
        } else if (state.invuln <= 0) {
          hit(pick(CRASH_LINES));
          deactivate(obj);
        }
      }
    }

    for (i = 0; i < pickups.length; i++) {
      obj = pickups[i];
      if (!obj.userData.active) { continue; }
      obj.position.z += speed * dt;
      kind = obj.userData.kind;
      if (kind === 'coin') {
        obj.userData.coin.rotation.y += dt * 4.0;
        obj.position.y = Math.sin(state.t * 4 + i) * 0.08;
        if (state.magnet > 0 && obj.position.z > -11 && obj.position.z < 5) {
          obj.position.x = lerp(obj.position.x, state.playerX, Math.min(1, dt * 3.6));
        }
      } else if (kind === 'fuel') {
        obj.userData.fuel.rotation.y += dt * 1.2;
      } else {
        obj.userData.power.rotation.y += dt * 2.2;
        obj.position.y = Math.sin(state.t * 5 + i) * 0.10;
      }
      if (obj.position.z > 8) { deactivate(obj); continue; }
      if (Math.abs(obj.position.z) < 1.0 && Math.abs(obj.position.x - state.playerX) < 0.82) {
        if (kind === 'coin') { collectCoin(obj); }
        else if (kind === 'fuel') { collectFuel(obj); }
        else { collectPower(kind); deactivate(obj); }
      }
    }

    for (i = 0; i < grassPatches.length; i++) {
      obj = grassPatches[i];
      if (!obj.userData.active) { continue; }
      obj.position.z += speed * dt;
      if (obj.position.z > 8) { deactivate(obj); continue; }
      if (Math.abs(obj.position.z) < 1.25 && Math.abs(obj.position.x - state.playerX) < 1.15) {
        mowGrass(obj);
      }
    }
  }

  function updateParticles(dt, speed) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy -= 10.5 * dt;
        p.z += (p.vz + speed * 0.65) * dt;
        if (p.life <= 0 || p.y < -1) { p.life = 0; p.y = -100; }
      }
      particlePositions[i * 3] = p.x;
      particlePositions[i * 3 + 1] = p.life > 0 ? p.y : -100;
      particlePositions[i * 3 + 2] = p.z;
    }
    particleGeometry.attributes.position.needsUpdate = true;
  }

  function spawnOpponent() {
    var o = state.opponent;
    o.active = true;
    o.t = 0;
    o.drops = 0;
    o.x = clamp(state.playerX + rand(-1.6, 1.6), -2.4, 2.4);
    o.z = -38 - Math.random() * 8;
    o.taunt = pick(TAUNTS);
    opponentGroup.visible = true;
    ui.tauntText.textContent = o.taunt;
    ui.taunt.classList.remove('hidden');
    toast('Сосед выбежал из-за двери!', 'bad');
  }

  function updateOpponent(dt, speed) {
    if (state.boss.active) { return; }
    var o = state.opponent;
    if (!o.active) {
      state.opponentCooldown -= dt;
      if (state.opponentCooldown <= 0 && state.distance > 25) { spawnOpponent(); }
      return;
    }
    o.t += dt;
    o.z += speed * dt;
    // He tries to stay in front of the mower while weaving side to side.
    var targetX = clamp(state.playerX + Math.sin(o.t * 2.1) * 1.15, -2.5, 2.5);
    o.x = clamp(lerp(o.x, targetX, Math.min(1, dt * 1.25)), -2.7, 2.7);
    opponentGroup.position.set(o.x, 0, o.z);
    opponentGroup.rotation.z = Math.sin(o.t * 9) * 0.035;
    opponentSprite.position.y = 1.28 + Math.abs(Math.sin(o.t * 9)) * 0.09;
    opponentSprite.material.rotation = Math.sin(o.t * 9) * 0.055;

    if (o.drops === 0 && o.z > -14) {
      spawnObstacle(pick(['cone', 'bucket', 'tire']), clamp(o.x + rand(-0.7, 0.7), -2.4, 2.4), o.z - 2.0);
      o.drops = 1;
      toast('Сосед бросил препятствие!', 'bad');
    } else if (o.drops === 1 && o.z > -6.5) {
      spawnObstacle(pick(['cone', 'pot', 'bucket']), clamp(o.x - rand(0.4, 1.3), -2.4, 2.4), o.z - 1.5);
      o.drops = 2;
    }

    if (Math.abs(o.z) < 1.1 && Math.abs(o.x - state.playerX) < 0.92 && state.invuln <= 0) {
      hit('Ой! Прямо в соседа!');
      o.x += (o.x < state.playerX ? -1.7 : 1.7);
    }
    if (o.z > 7) {
      o.active = false;
      opponentGroup.visible = false;
      ui.taunt.classList.add('hidden');
      state.opponentCooldown = Math.max(5.5, 10 + Math.random() * 6 - state.distance / 500);
    }
  }

  function startBoss() {
    var b = state.boss;
    b.active = true;
    b.t = 0;
    b.dropAt = 0.9;
    b.x = 0;
    b.nextAt += 500;
    bossGroup.visible = true;
    bossGroup.position.set(0, 0, -16);
    ui.boss.classList.remove('hidden');
    ui.bossFill.style.width = '0%';
    ui.bossText.textContent = 'Сосед позвал старшего! Держись 8 секунд!';
    toast('⚠ СТАРШИЙ ПО ПОДЪЕЗДУ!', 'bad');
    sound.boss();
    updateHUD(true);
  }

  function updateBoss(dt) {
    var b = state.boss;
    if (!b.active) {
      if (state.distance >= b.nextAt && !state.opponent.active) { startBoss(); }
      return;
    }
    b.t += dt;
    b.x = Math.sin(b.t * 1.15) * 1.8;
    bossGroup.position.set(b.x, 0, -16 + Math.sin(b.t * 0.8) * 1.2);
    bossGroup.rotation.z = Math.sin(b.t * 6) * 0.035;
    bossSprite.material.rotation = Math.sin(b.t * 6) * 0.06;

    if (b.t >= b.dropAt) {
      var lanes = LANES.slice();
      for (var i = lanes.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = lanes[i]; lanes[i] = lanes[j]; lanes[j] = tmp;
      }
      var count = state.floor >= 3 ? 3 : 2;
      for (var c = 0; c < count; c++) {
        spawnObstacle(pick(TYPE_BAG), lanes[c], -30 - c * 1.2);
      }
      if (Math.random() < 0.55) { spawnPickup('coin', lanes[4], -29); }
      b.dropAt = b.t + Math.max(0.85, 1.35 - state.floor * 0.05);
      toast('Старший швыряет вёдра!', 'bad');
    }
    if (b.t >= BOSS_DURATION) { endBoss(); }
  }

  function endBoss() {
    var b = state.boss;
    b.active = false;
    bossGroup.visible = false;
    ui.boss.classList.add('hidden');
    ui.bossFill.style.width = '0%';
    state.bonus += 500;
    toast('Старший отступил! +500', 'gold');
    sound.power();
    updateHUD(true);
  }

  function resetPools() {
    obstacles.forEach(function (o) { o.userData.active = false; o.visible = false; o.position.z = -200; });
    pickups.forEach(function (o) { o.userData.active = false; o.visible = false; o.position.z = -200; o.position.y = 0; });
    grassPatches.forEach(function (o) { o.userData.active = false; o.visible = false; o.position.z = -200; o.material.opacity = 0.96; o.scale.set(1, 1, 1); });
    particles.forEach(function (p) { p.life = 0; p.y = -100; });
    if (particleGeometry) {
      for (var i = 0; i < particles.length; i++) { particlePositions[i * 3 + 1] = -100; }
      particleGeometry.attributes.position.needsUpdate = true;
    }
  }

  function resetWorld() {
    state.t = 0;
    state.speed = 9;
    state.distance = 0;
    state.score = 0;
    state.bonus = 0;
    state.lives = 3;
    state.fuel = 1;
    state.coins = 0;
    state.floor = 1;
    state.shield = 0;
    state.magnet = 0;
    state.doubleT = 0;
    state.boss.active = false;
    state.boss.nextAt = 500;
    state.boss.t = 0;
    state.boss.dropAt = 0;
    state.playerX = 0;
    state.steer = 0;
    state.jumpY = 0;
    state.jumpVel = 0;
    state.invuln = 0;
    state.shake = 0;
    state.waveTimer = 1.2;
    state.opponentCooldown = 7;
    state.opponent.active = false;
    state.opponent.drops = 0;
    state.toastTimer = 0;
    state.flashTimer = 0;
    ui.toast.className = 'toast';
    ui.flash.classList.remove('on');
    ui.taunt.classList.add('hidden');
    ui.boss.classList.add('hidden');
    ui.bossFill.style.width = '0%';
    opponentGroup.visible = false;
    bossGroup.visible = false;
    if (wallMat) { wallMat.color.setHex(0xffffff); }
    if (scene.fog && fogBase) { scene.fog.color.copy(fogBase); }
    if (scene.background && scene.background.copy && fogBase) { scene.background.copy(fogBase); }
    if (floorTex) { floorTex.offset.set(0, 0); }
    if (wallTex) { wallTex.offset.set(0, 0); }
    if (ceilingTex) { ceilingTex.offset.set(0, 0); }
    corridorSegments.forEach(function (seg, i) {
      seg.position.z = -i * SEG_LEN;
      randomizeSegment(seg);
    });
    resetPools();
    updateHUD(true);
  }

  function updateWorld(dt, speed) {
    if (floorTex) { floorTex.offset.y -= speed * dt * 0.035; }
    // Wallpaper stays put: doors, lamps and bollards provide the sense of motion.
    if (ceilingTex) { ceilingTex.offset.y -= speed * dt * 0.022; }
    for (var i = 0; i < corridorSegments.length; i++) {
      var seg = corridorSegments[i];
      seg.position.z += speed * dt;
      if (seg.position.z > 16) {
        seg.position.z -= SEG_LEN * SEG_COUNT;
        randomizeSegment(seg);
      }
    }
  }

  function updatePlayer(dt, speed, allowControl) {
    if (allowControl) {
      var steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0) + input.drag;
      state.steer = clamp(steerInput, -1, 1);
      state.playerX = clamp(state.playerX + state.steer * dt * 5.6, -2.65, 2.65);
      if (state.jumpVel !== 0 || state.jumpY > 0) {
        state.jumpY += state.jumpVel * dt;
        state.jumpVel -= 18 * dt;
        if (state.jumpY <= 0) { state.jumpY = 0; state.jumpVel = 0; }
      }
    } else {
      state.steer = 0;
    }

    var bob = Math.sin(state.t * 10) * 0.022 * (speed / 10);
    playerGroup.position.set(state.playerX, state.jumpY + bob, 0);
    playerGroup.rotation.z = -state.steer * 0.065 + Math.sin(state.t * 13) * 0.006;
    playerGroup.rotation.y = state.steer * 0.045;
    playerGroup.rotation.x = state.jumpY * -0.025;
    playerGroup.visible = !(state.invuln > 0 && Math.floor(state.t * 14) % 2 === 0);

    for (var i = 0; i < wheels.length; i++) {
      wheels[i].pivot.rotation.x += (speed * dt) / wheels[i].radius;
    }
    bladeGroup.rotation.y += dt * 24;
    playerHeadSprite.material.rotation = -state.steer * 0.10;
    playerBodySprite.material.rotation = -state.steer * 0.035;
  }

  function updateCamera(dt) {
    state.shake = Math.max(0, state.shake - dt * 1.8);
    var sx = state.shake > 0 ? rand(-state.shake, state.shake) * 0.16 : 0;
    var sy = state.shake > 0 ? rand(-state.shake, state.shake) * 0.10 : 0;
    camera.position.set(state.playerX * 0.26 + sx, 3.45 + state.jumpY * 0.10 + sy, 8.7);
    camera.lookAt(state.playerX * 0.15, 1.30, -10);
  }

  function updateGame(dt) {
    state.t += dt;
    state.shield = Math.max(0, state.shield - dt);
    state.magnet = Math.max(0, state.magnet - dt);
    state.doubleT = Math.max(0, state.doubleT - dt);
    var boosting = input.gas && state.fuel > 0.02;
    if (boosting) {
      state.fuel = Math.max(0, state.fuel - dt * 0.13);
    } else {
      state.fuel = Math.min(1, state.fuel + dt * 0.022);
    }
    var targetSpeed = 9 + Math.min(state.distance / 350, 1) * 7
      + (boosting ? 6 : 0) + (state.floor - 1) * 0.7;
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 2.3);
    state.distance += state.speed * dt;
    state.score = Math.floor(state.distance * 2 * (state.doubleT > 0 ? 2 : 1)) + state.bonus;
    state.invuln = Math.max(0, state.invuln - dt);

    var newFloor = Math.floor(state.distance / 250) + 1;
    if (newFloor !== state.floor) {
      state.floor = newFloor;
      if (wallMat) {
        wallMat.color.setHex(FLOOR_COLORS[(newFloor - 1) % FLOOR_COLORS.length]);
      }
      var floorBonus = 100 * newFloor;
      state.bonus += floorBonus;
      toast('ЭТАЖ ' + newFloor + '! Новый цвет коридора +' + floorBonus, 'gold');
      sound.power();
      updateHUD(true);
    }

    updatePlayer(dt, state.speed, true);
    updateWorld(dt, state.speed);
    updateObjects(dt, state.speed);
    updateOpponent(dt, state.speed);
    updateBoss(dt);
    updateParticles(dt, state.speed);
    updateCamera(dt);
    updateHUD(false);
    sound.setEngine(state.speed, boosting, true);

    state.waveTimer -= dt;
    if (state.waveTimer <= 0) { spawnWave(); }
  }

  function updateMenu(dt) {
    state.t += dt;
    updatePlayer(dt, 2.2, false);
    updateWorld(dt, 2.2);
    updateParticles(dt, 2.2);
    updateCamera(dt);
  }

  function startGame() {
    sound.init();
    sound.resume();
    resetWorld();
    setState('playing');
    toast('Поехали! Коси подъезд!');
  }

  function pauseGame() {
    if (state.mode !== 'playing') { return; }
    setState('paused');
    sound.pause(true);
  }

  function resumeGame() {
    if (state.mode !== 'paused') { return; }
    setState('playing');
    sound.resume();
  }

  function togglePause() {
    if (state.mode === 'playing') { pauseGame(); }
    else if (state.mode === 'paused') { resumeGame(); }
  }

  function endGame() {
    if (state.mode === 'gameover') { return; }
    setState('gameover');
    playerGroup.visible = true;
    state.boss.active = false;
    bossGroup.visible = false;
    ui.boss.classList.add('hidden');
    ui.flash.classList.remove('on');
    state.flashTimer = 0;
    ui.toast.className = 'toast';
    state.toastTimer = 0;
    sound.pause(true);
    sound.setEngine(0, false, false);
    if (state.score > state.best) {
      state.best = state.score;
      try { window.localStorage.setItem('zahar_mower_best', String(state.best)); } catch (e) {}
    }
    ui.finalScore.textContent = formatScore(state.score);
    ui.bestScore.textContent = formatScore(state.best);
    ui.gameoverComment.textContent = pick(GAMEOVER_LINES);
  }

  /* --------------------------------------------------------------- controls */
  function refreshInput() {
    input.left = !!heldKeys.left || hasPointerControl('left');
    input.right = !!heldKeys.right || hasPointerControl('right');
    input.gas = !!heldKeys.gas || hasPointerControl('gas');
  }

  function hasPointerControl(name) {
    for (var id in pointerControls) {
      if (pointerControls.hasOwnProperty(id) && pointerControls[id] === name) { return true; }
    }
    return false;
  }

  function tryJump() {
    if (state.mode !== 'playing') { return; }
    if (state.jumpY <= 0.001 && state.jumpVel <= 0) {
      state.jumpVel = 6.6;
      sound.blip(320, 0.12, 'triangle', 0.08);
    }
  }

  function bindEvents() {
    window.addEventListener('resize', function () {
      if (!renderer) { return; }
      applyQuality();
      camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      camera.updateProjectionMatrix();
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-quality]'), function (btn) {
      btn.addEventListener('click', function () {
        setQuality(btn.getAttribute('data-quality'));
      });
    });

    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('blur', function () {
      heldKeys = {};
      pointerControls = {};
      input.drag = 0;
      refreshInput();
      if (state.mode === 'playing') { pauseGame(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && state.mode === 'playing') { pauseGame(); }
    });

    var controlButtons = document.querySelectorAll('[data-control]');
    Array.prototype.forEach.call(controlButtons, function (btn) {
      var name = btn.getAttribute('data-control');
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        pointerControls[e.pointerId] = name;
        btn.classList.add('pressed');
        try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        if (name === 'jump') { tryJump(); }
        refreshInput();
      });
      var release = function (e) {
        delete pointerControls[e.pointerId];
        btn.classList.remove('pressed');
        refreshInput();
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
    });

    var canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', function (e) {
      if (state.mode !== 'playing') { return; }
      // Keep the right-bottom action buttons free for gas / jump.
      if (e.clientX > window.innerWidth * 0.62 && e.clientY > window.innerHeight * 0.55) { return; }
      dragPointer = e.pointerId;
      dragStartX = e.clientX;
      input.drag = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (dragPointer !== e.pointerId) { return; }
      input.drag = clamp((e.clientX - dragStartX) / 85, -1, 1);
      e.preventDefault();
    });
    var endDrag = function (e) {
      if (dragPointer !== e.pointerId) { return; }
      dragPointer = null;
      input.drag = 0;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      showFatal('Контекст WebGL потерян. Закройте и откройте игру заново.');
    });

    var keyMap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'gas', KeyW: 'gas',
      Space: 'jump', KeyP: 'pause', Escape: 'pause', Enter: 'enter'
    };
    window.addEventListener('keydown', function (e) {
      var k = keyMap[e.code] || (e.key === ' ' ? 'jump' : null);
      if (!k) { return; }
      e.preventDefault();
      if (k === 'jump') {
        if (!e.repeat) { tryJump(); }
        return;
      }
      if (k === 'pause') {
        if (!e.repeat) { togglePause(); }
        return;
      }
      if (k === 'enter' && !e.repeat) {
        if (state.mode === 'menu' || state.mode === 'gameover') { startGame(); }
        else if (state.mode === 'paused') { resumeGame(); }
        return;
      }
      heldKeys[k] = true;
      refreshInput();
    });
    window.addEventListener('keyup', function (e) {
      var k = keyMap[e.code] || (e.key === ' ' ? 'jump' : null);
      if (!k || k === 'jump' || k === 'pause' || k === 'enter') { return; }
      delete heldKeys[k];
      refreshInput();
    });

    ui.startBtn.addEventListener('click', startGame);
    ui.pauseBtn.addEventListener('click', togglePause);
    ui.resumeBtn.addEventListener('click', resumeGame);
    ui.restartBtn.addEventListener('click', startGame);
    ui.restartPauseBtn.addEventListener('click', startGame);
  }

  /* ------------------------------------------------------------------- init */
  function finishLoading() {
    if (state.sceneReady) { return; }
    state.sceneReady = true;
    try {
      buildScene();
      bindEvents();
      updateQualityButtons();
      applyQuality();
      setState('menu');
      state.lastTime = performance.now();
      requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      showFatal('Ошибка при создании 3D-сцены: ' + (e && e.message ? e.message : e));
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min((now - state.lastTime) / 1000, 0.05);
    if (!isFinite(dt) || dt < 0) { dt = 0.016; }
    state.lastTime = now;
    try {
      if (state.mode === 'playing') { updateGame(dt); }
      else if (state.mode === 'menu') { updateMenu(dt); }
      else if (state.mode === 'paused') { state.t += dt * 0.2; updateCamera(dt); }
      else if (state.mode === 'gameover') { state.t += dt * 0.35; updateCamera(dt); }
      if (state.toastTimer > 0) {
        state.toastTimer -= dt;
        if (state.toastTimer <= 0) { ui.toast.className = 'toast'; }
      }
      if (state.flashTimer > 0) {
        state.flashTimer -= dt;
        if (state.flashTimer <= 0) { ui.flash.classList.remove('on'); }
      }
      updateLighting(dt);
      updateDust(dt, state.mode === 'playing' ? state.speed : 2.2);
      updatePerf(dt);
      renderer.render(scene, camera);
    } catch (e) {
      console.error(e);
      showFatal('Игра остановилась: ' + (e && e.message ? e.message : e));
    }
  }

  window.Game = {
    onBack: function () {
      if (state.mode === 'playing') { pauseGame(); }
      else if (state.mode === 'paused') { resumeGame(); }
    },
    start: startGame,
    pause: pauseGame,
    resume: resumeGame,
    debugBoss: function () { if (state.mode === 'playing') { startBoss(); } },
    debugPower: function (kind) { if (state.mode === 'playing') { collectPower(kind || 'shield'); } },
    debugSkip: function (metres) { state.distance += metres || 0; },
    setQuality: setQuality
  };

  function init() {
    if (!window.THREE) {
      showFatal('Библиотека Three.js не загрузилась из assets.');
      return;
    }
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: state.quality !== 'low',
        alpha: false,
        powerPreference: 'high-performance'
      });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(0x0b131a, 1);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      ui.canvasWrap.appendChild(renderer.domElement);
      aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      applyQuality();
    } catch (e) {
      console.error(e);
      showFatal('WebView не смог создать WebGL-контекст. Включите аппаратное ускорение.');
      return;
    }
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(64, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 130);
    camera.position.set(0, 3.45, 8.7);
    camera.lookAt(0, 1.3, -10);
    loadTextures(finishLoading);
  }

  window.addEventListener('error', function (e) {
    console.error('Game error:', e.message);
  });

  init();
})();
