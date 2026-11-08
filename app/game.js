/* Захар: Вечная лестница — дешёвый 3D-хоррор на Three.js.
 * Classic script (no ES modules) so it works from file:///android_asset/.
 *
 * Настройки намеренно «плохие»: фиксированный низкий DPR, без AA, без теней,
 * без PBR/нормалей/окружения/свечения/пыли, пиксельные текстуры, два света,
 * короткий туман и маленькие пулы объектов. Всё ради плавности на слабом телефоне.
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
    scare: $('scare'),
    score: $('score'),
    distance: $('distance'),
    speed: $('speed'),
    lives: $('lives'),
    fuelFill: $('fuel-fill'),
    fps: $('fps'),
    qualityLabel: $('quality-label'),
    floor: $('floor'),
    loop: $('loop'),
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
    scareTimer: 0,
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
    loop: 1,
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
    ghostTimer: 9,
    fps: 60,
    fpsAccum: 0,
    fpsFrames: 0
  };

  try {
    state.best = parseInt(window.localStorage.getItem('zahar_mower_best') || '0', 10) || 0;
  } catch (e) {
    state.best = 0;
  }

  var input = { left: false, right: false, gas: false, drag: 0 };
  var heldKeys = {};
  var pointerControls = {};
  var dragPointer = null;
  var dragStartX = 0;

  var renderer, scene, camera;
  var textures = {};
  var floorTex, wallTex, ceilingTex, shadowTex;
  var numberTextures = [];
  var hemiLight, dirLight;
  var playerGroup, playerBodySprite, playerHeadSprite, bladeGroup;
  var wheels = [];
  var opponentGroup, opponentSprite;
  var bossGroup, bossSprite;
  var stairSegments = [];
  var obstacles = [];
  var pickups = [];
  var grassPatches = [];
  var particles = [];
  var particlePositions, particleGeometry;

  var STEP_DEPTH = 0.85;
  var STEP_RISE = 0.24;
  var STEPS_PER_FLIGHT = 9;
  var FLIGHT_LEN = STEP_DEPTH * STEPS_PER_FLIGHT;
  var LANDING_LEN = 3.0;
  var CYCLE_LEN = FLIGHT_LEN + LANDING_LEN;
  var LANDING_HEIGHT = STEPS_PER_FLIGHT * STEP_RISE;
  var STAIR_WIDTH = 6.4;
  var SEG_COUNT = 7;
  var WORLD_DEPTH = CYCLE_LEN * SEG_COUNT;
  var LANES = [-2.4, -1.2, 0, 1.2, 2.4];
  var FLOOR_STEP = 250;
  var LOOP_LEN = FLOOR_STEP * 5;
  var BOSS_DURATION = 8;

  var RENDER_SETTINGS = {
    pixelRatio: 0.75,
    antialias: false,
    shadows: false,
    toneMapping: 'none',
    textureFilter: 'nearest',
    lights: 2
  };

  var TAUNTS = [
    'Сосед: «Ты уже был на этом этаже…»',
    'Сосед: «Пятый этаж. Опять.»',
    'Сосед: «Двери не открываются снизу.»',
    'Сосед: «Считай ступени, Захар.»',
    'Сосед: «Лампочка сейчас погаснет.»'
  ];
  var CRASH_LINES = [
    'Ведро с площадки! Кто его поставил?',
    'Конус. Или это был не конус…',
    'Косилка ударилась о чужие ступени.',
    'Бах! Этаж не изменился.',
    'Прямо в тень соседа!'
  ];
  var GAMEOVER_LINES = [
    'Снова первый этаж.',
    'Лестница замкнулась.',
    'Лампочка мигнула в последний раз.',
    'Захар уже тянется к стартеру.',
    'Дверь была нарисована.'
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

  /* ------------------------------------------------------------------ audio */
  var sound = {
    ctx: null,
    engineGain: null,
    osc1: null,
    osc2: null,
    filter: null,
    droneGain: null,
    droneOsc: null,
    enabled: false,
    init: function () {
      if (this.ctx) { this.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return; }
      try {
        this.ctx = new AC();
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.0001;
        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 460;
        this.filter.Q.value = 1.6;
        this.osc1 = this.ctx.createOscillator();
        this.osc1.type = 'sawtooth';
        this.osc1.frequency.value = 52;
        this.osc2 = this.ctx.createOscillator();
        this.osc2.type = 'square';
        this.osc2.frequency.value = 78;
        var g2 = this.ctx.createGain();
        g2.gain.value = 0.3;
        this.osc1.connect(this.filter);
        this.osc2.connect(g2);
        g2.connect(this.filter);
        this.filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.osc1.start();
        this.osc2.start();

        this.droneGain = this.ctx.createGain();
        this.droneGain.gain.value = 0.0001;
        this.droneOsc = this.ctx.createOscillator();
        this.droneOsc.type = 'sine';
        this.droneOsc.frequency.value = 41;
        this.droneOsc.connect(this.droneGain);
        this.droneGain.connect(this.ctx.destination);
        this.droneOsc.start();
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
      var f = 44 + speed * 3.1 + (boost ? 20 : 0);
      try {
        this.osc1.frequency.setTargetAtTime(f, now, 0.09);
        this.osc2.frequency.setTargetAtTime(f * 1.49, now, 0.09);
        this.filter.frequency.setTargetAtTime(340 + speed * 24 + (boost ? 280 : 0), now, 0.12);
        this.engineGain.gain.setTargetAtTime(active ? (boost ? 0.065 : 0.04) : 0.0001, now, 0.14);
        this.droneGain.gain.setTargetAtTime(active ? 0.020 : 0.0001, now, 0.2);
      } catch (e) {}
    },
    pause: function (muted) {
      if (!this.ctx || !this.enabled) { return; }
      try {
        this.engineGain.gain.setTargetAtTime(muted ? 0.0001 : 0.035, this.ctx.currentTime, 0.08);
        this.droneGain.gain.setTargetAtTime(muted ? 0.0001 : 0.018, this.ctx.currentTime, 0.12);
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
        o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 1.4), now + duration);
        g.gain.setValueAtTime(vol || 0.1, now);
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
        f.frequency.value = cutoff || 700;
        var g = this.ctx.createGain();
        g.gain.value = vol || 0.12;
        src.connect(f);
        f.connect(g);
        g.connect(this.ctx.destination);
        src.start(now);
      } catch (e) {}
    },
    coin: function () { this.blip(720, 0.11, 'triangle', 0.10); },
    fuel: function () { this.blip(360, 0.20, 'sawtooth', 0.09); },
    mow: function () { this.noise(0.10, 0.08, 1800); },
    crash: function () { this.noise(0.36, 0.24, 440); this.blip(95, 0.28, 'square', 0.11); },
    power: function () { this.blip(520, 0.14, 'triangle', 0.08); this.blip(780, 0.11, 'triangle', 0.06); },
    sting: function () { this.noise(0.55, 0.20, 760); this.blip(88, 0.48, 'sawtooth', 0.12); },
    whisper: function () { this.noise(0.7, 0.07, 380); },
    boss: function () { this.sting(); this.noise(0.4, 0.14, 300); }
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
    ui.scare.classList.add('hidden');
  }

  function toast(text, kind) {
    ui.toast.textContent = text;
    ui.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    state.toastTimer = 1.7;
  }

  function flash() {
    ui.flash.classList.add('on');
    state.flashTimer = 0.18;
  }

  function scare(force) {
    if (!force && state.mode !== 'playing') { return; }
    ui.scare.classList.remove('hidden');
    state.scareTimer = 0.34;
    sound.sting();
  }

  function clearScare() {
    ui.scare.classList.add('hidden');
    state.scareTimer = 0;
  }

  function updateScare(dt) {
    if (state.scareTimer <= 0) { return; }
    state.scareTimer -= dt;
    if (state.scareTimer <= 0) { clearScare(); }
  }

  function setState(mode) {
    state.mode = mode;
    ui.menu.classList.toggle('hidden', mode !== 'menu');
    ui.pause.classList.toggle('hidden', mode !== 'paused');
    ui.gameover.classList.toggle('hidden', mode !== 'gameover');
    ui.hud.classList.toggle('hidden', mode !== 'playing' && mode !== 'paused');
    ui.controls.classList.toggle('hidden', mode !== 'playing');
    ui.loading.classList.add('hidden');
    if (mode !== 'playing') { clearScare(); }
  }

  function formatScore(n) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < 6) { s = '0' + s; }
    return s;
  }

  function updateHUD(force) {
    state.hudTimer -= 1 / 60;
    if (!force && state.hudTimer > 0) { return; }
    state.hudTimer = 0.08;
    ui.score.textContent = formatScore(state.score);
    ui.distance.textContent = Math.floor(state.distance) + ' м';
    ui.speed.textContent = Math.round(state.speed * 3.6) + ' км/ч';
    ui.lives.textContent = '●'.repeat(Math.max(0, state.lives)) + '○'.repeat(Math.max(0, 3 - state.lives));
    ui.fuelFill.style.width = Math.round(clamp(state.fuel, 0, 1) * 100) + '%';
    ui.floor.textContent = state.floor + '/5';
    ui.loop.textContent = String(state.loop);
    ui.qualityLabel.textContent = 'ПЛОХО · 75%';
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

  function updatePerf(dt) {
    state.fpsAccum += dt;
    state.fpsFrames++;
    if (state.fpsAccum < 1) { return; }
    state.fps = state.fpsFrames / state.fpsAccum;
    state.fpsAccum = 0;
    state.fpsFrames = 0;
    if (ui.fps) { ui.fps.textContent = Math.round(state.fps) + ' FPS'; }
  }

  function updateLighting() {
    if (!hemiLight || !dirLight) { return; }
    var f = Math.sin(state.t * 9.1) * 0.5 + Math.sin(state.t * 2.7) * 0.5;
    hemiLight.intensity = 0.42 + f * 0.07;
    dirLight.intensity = 0.58 + f * 0.10;
    for (var i = 0; i < stairSegments.length; i++) {
      var seg = stairSegments[i];
      if (seg.userData.lampMat) {
        seg.userData.lampMat.opacity = 0.45 + Math.abs(Math.sin(state.t * 6.4 + i * 1.7)) * 0.42;
      }
      if (seg.userData.ghost && seg.userData.ghost.visible) {
        seg.userData.ghost.material.opacity = 0.35 + Math.abs(Math.sin(state.t * 3.3 + i)) * 0.45;
      }
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
    manager.onError = function (url) { console.warn('Texture failed to load:', url); };
    Object.keys(TEX_FILES).forEach(function (name) {
      var tex = loader.load(TEX_FILES[name]);
      tex.encoding = THREE.sRGBEncoding;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.anisotropy = 1;
      if (name === 'floor_tile') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 14);
        floorTex = tex;
      } else if (name === 'wall_panel') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(5, 1);
        wallTex = tex;
      } else if (name === 'ceiling') {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 10);
        ceilingTex = tex;
      }
      tex.needsUpdate = true;
      textures[name] = tex;
    });
    window.setTimeout(done, 5000);
  }

  function mat(name, color, opts) {
    var o = {
      map: textures[name] || null,
      color: color === undefined ? 0xffffff : color,
      flatShading: true
    };
    if (opts) { Object.keys(opts).forEach(function (k) { o[k] = opts[k]; }); }
    return new THREE.MeshLambertMaterial(o);
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
      alphaTest: 0.03,
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
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.72)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.32)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  function makeNumberTexture(n) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(14,13,11,0.9)';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#8b2b22';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 58, 58);
    ctx.fillStyle = '#d9c8a8';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 32, 34);
    var t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }

  function makeShadow(rx, rz, opacity) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(rx * 2, rz * 2),
      new THREE.MeshBasicMaterial({
        map: shadowTex, transparent: true,
        opacity: opacity || 0.55,
        depthWrite: false, side: THREE.DoubleSide
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    return m;
  }

  /* ------------------------------------------------------------- staircase */
  function localHeight(lz) {
    var d = -lz;
    if (d <= 0 || d >= CYCLE_LEN) { return STEP_RISE; }
    if (d < FLIGHT_LEN) {
      return (Math.floor(d / STEP_DEPTH) + 1) * STEP_RISE;
    }
    return LANDING_HEIGHT;
  }

  function worldHeight(z) {
    for (var i = 0; i < stairSegments.length; i++) {
      var seg = stairSegments[i];
      var lz = z - seg.position.z;
      if (lz <= 0 && lz >= -CYCLE_LEN) { return seg.position.y + localHeight(lz); }
    }
    return STEP_RISE;
  }

  function randomizeSegment(seg, floorNum) {
    var doors = [textures.door_1, textures.door_2, textures.door_3];
    var n = ((Math.floor(floorNum || 1) - 1) % 5 + 5) % 5 + 1;
    if (seg.userData.doorMat) {
      seg.userData.doorMat.map = pick(doors);
      seg.userData.doorMat.needsUpdate = true;
    }
    if (seg.userData.numberMat && numberTextures[n - 1]) {
      seg.userData.numberMat.map = numberTextures[n - 1];
      seg.userData.numberMat.needsUpdate = true;
    }
    if (seg.userData.lampMat) {
      seg.userData.lampMat.opacity = rand(0.55, 0.9);
    }
    if (seg.userData.ghost) {
      seg.userData.ghost.visible = Math.random() < 0.38;
    }
  }

  function buildSegment(index) {
    var g = new THREE.Group();
    g.position.z = -index * CYCLE_LEN;
    g.userData.index = index;

    var stepMat = mat('floor_tile', 0x74766e, { side: THREE.DoubleSide });
    var stepGeo = new THREE.BoxGeometry(STAIR_WIDTH, STEP_RISE + 0.5, STEP_DEPTH - 0.04);
    for (var i = 0; i < STEPS_PER_FLIGHT; i++) {
      var step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(0, (i + 1) * STEP_RISE - (STEP_RISE + 0.5) / 2, -(i + 0.5) * STEP_DEPTH);
      g.add(step);
    }

    var landing = makePlane(STAIR_WIDTH, LANDING_LEN, mat('floor_tile', 0x6d6f68, { side: THREE.DoubleSide }));
    landing.rotation.x = -Math.PI / 2;
    landing.position.set(0, LANDING_HEIGHT + 0.015, -FLIGHT_LEN - LANDING_LEN / 2);
    g.add(landing);

    var wallMat = mat('wall_panel', 0x575b55, { side: THREE.DoubleSide });
    var wallL = makePlane(CYCLE_LEN, 5.8, wallMat);
    wallL.rotation.y = Math.PI / 2;
    wallL.position.set(-STAIR_WIDTH / 2, 2.4, -CYCLE_LEN / 2);
    g.add(wallL);
    var wallR = makePlane(CYCLE_LEN, 5.8, wallMat);
    wallR.rotation.y = -Math.PI / 2;
    wallR.position.set(STAIR_WIDTH / 2, 2.4, -CYCLE_LEN / 2);
    g.add(wallR);

    var ceil = makePlane(STAIR_WIDTH, CYCLE_LEN, mat('ceiling', 0x3a3d39, { side: THREE.DoubleSide }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 5.4, -CYCLE_LEN / 2);
    g.add(ceil);

    var railMat = mat('metal_dark', 0x202321);
    var railAngle = -Math.atan2(LANDING_HEIGHT, FLIGHT_LEN);
    addBox(g, 0.09, 0.09, FLIGHT_LEN + 0.5, railMat,
      -STAIR_WIDTH / 2 + 0.18, 0.95 + LANDING_HEIGHT / 2, -FLIGHT_LEN / 2, railAngle, 0, 0);
    addBox(g, 0.09, 0.09, FLIGHT_LEN + 0.5, railMat,
      STAIR_WIDTH / 2 - 0.18, 0.95 + LANDING_HEIGHT / 2, -FLIGHT_LEN / 2, railAngle, 0, 0);
    for (var p = 0; p < 4; p++) {
      var pz = -p * 2.1 - 0.3;
      addBox(g, 0.07, 0.85, 0.07, railMat, -STAIR_WIDTH / 2 + 0.18, 0.75 + p * 0.42, pz);
      addBox(g, 0.07, 0.85, 0.07, railMat, STAIR_WIDTH / 2 - 0.18, 0.75 + p * 0.42, pz);
    }

    var side = index % 2 === 0 ? -1 : 1;
    var doorMat = mat('door_1', 0x9c9387, { side: THREE.DoubleSide });
    var door = makePlane(1.15, 2.15, doorMat);
    door.rotation.y = side * Math.PI / 2;
    door.position.set(side * (STAIR_WIDTH / 2 - 0.03), LANDING_HEIGHT + 1.45, -FLIGHT_LEN - LANDING_LEN / 2);
    g.add(door);

    var numberMat = basicMat(null, 0xffffff, {
      transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: false
    });
    var number = makePlane(0.85, 0.85, numberMat);
    number.rotation.y = -side * Math.PI / 2;
    number.position.set(-side * (STAIR_WIDTH / 2 - 0.04), LANDING_HEIGHT + 2.9, -FLIGHT_LEN - LANDING_LEN / 2 + 0.55);
    g.add(number);

    var lampMat = basicMat('lamp', 0xffd9a0, {
      transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false
    });
    var lamp = makePlane(0.72, 0.34, lampMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 5.32, -CYCLE_LEN / 2);
    g.add(lamp);

    var ghost = makeSprite('face_neighbor', 0.85, 0.85, 0.75);
    ghost.position.set(side * 1.1, LANDING_HEIGHT + 1.35, -FLIGHT_LEN - LANDING_LEN / 2 - 0.35);
    ghost.visible = false;
    g.add(ghost);

    g.userData.doorMat = doorMat;
    g.userData.numberMat = numberMat;
    g.userData.lampMat = lampMat;
    g.userData.ghost = ghost;
    randomizeSegment(g, ((index + state.floor - 1) % 5) + 1);
    scene.add(g);
    stairSegments.push(g);
  }

  function buildStaircase() {
    for (var i = 0; i < SEG_COUNT; i++) { buildSegment(i); }
  }

  /* --------------------------------------------------------------- actors */
  function buildPlayer() {
    playerGroup = new THREE.Group();
    scene.add(playerGroup);

    var red = mat('mower_red', 0x9a3b32);
    var dark = mat('metal_dark', 0x262c30);
    var tire = mat('tire', 0x202224);
    var hub = mat('metal_dark', 0x8b9296);

    playerGroup.add(makeShadow(1.2, 1.45, 0.6));

    addBox(playerGroup, 1.82, 0.28, 2.18, red, 0, 0.34, 0);
    addBox(playerGroup, 1.58, 0.08, 1.72, dark, 0, 0.51, 0);
    addBox(playerGroup, 1.24, 0.52, 0.86, red, 0, 0.78, -0.62);
    addBox(playerGroup, 0.92, 0.46, 0.72, dark, 0, 0.76, 0.34);
    addBox(playerGroup, 0.72, 0.16, 0.62, dark, 0, 0.90, 0.94);
    addBox(playerGroup, 0.74, 0.56, 0.14, dark, 0, 1.18, 1.24);
    addBox(playerGroup, 1.95, 0.10, 0.18, red, 0, 0.30, -1.12);

    var steering = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.038, 6, 12), hub);
    steering.rotation.x = -Math.PI / 2;
    steering.position.set(0, 1.16, 0.12);
    playerGroup.add(steering);
    addBox(playerGroup, 0.06, 0.28, 0.06, hub, 0, 1.02, 0.12);

    bladeGroup = new THREE.Group();
    bladeGroup.position.set(0, 0.16, -0.34);
    addBox(bladeGroup, 1.72, 0.035, 0.11, hub, 0, 0, 0);
    addBox(bladeGroup, 0.11, 0.035, 1.72, hub, 0, 0, 0);
    playerGroup.add(bladeGroup);

    function makeWheel(x, z, r, width) {
      var pivot = new THREE.Group();
      pivot.position.set(x, r, z);
      var t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 10), tire);
      t.rotation.z = Math.PI / 2;
      pivot.add(t);
      var h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.46, r * 0.46, width + 0.025, 8), hub);
      h.rotation.z = Math.PI / 2;
      pivot.add(h);
      playerGroup.add(pivot);
      wheels.push({ pivot: pivot, radius: r });
    }
    makeWheel(-0.93, -0.82, 0.27, 0.18);
    makeWheel(0.93, -0.82, 0.27, 0.18);
    makeWheel(-0.93, 0.82, 0.38, 0.24);
    makeWheel(0.93, 0.82, 0.38, 0.24);

    var pants = mat('jacket_zahar', 0x15171a);
    addBox(playerGroup, 0.22, 0.52, 0.26, pants, -0.24, 0.72, 0.55, 0.25, 0, 0);
    addBox(playerGroup, 0.22, 0.52, 0.26, pants, 0.24, 0.72, 0.55, 0.25, 0, 0);

    playerBodySprite = makeSprite('body_zahar', 1.06, 1.16, 0.96);
    playerBodySprite.position.set(0, 1.55, 0.60);
    playerGroup.add(playerBodySprite);

    playerHeadSprite = makeSprite('face_zahar', 0.74, 0.74, 0.98);
    playerHeadSprite.position.set(0, 2.34, 0.62);
    playerGroup.add(playerHeadSprite);
  }

  function buildOpponent() {
    opponentGroup = new THREE.Group();
    opponentGroup.visible = false;
    scene.add(opponentGroup);
    opponentGroup.add(makeShadow(0.62, 0.46, 0.55));
    opponentSprite = makeSprite('body_neighbor', 1.04, 2.35, 0.82);
    opponentSprite.position.set(0, 1.25, 0.06);
    opponentGroup.add(opponentSprite);
    var head = makeSprite('face_neighbor', 0.64, 0.64, 0.88);
    head.position.set(0, 2.36, 0.10);
    opponentGroup.add(head);
  }

  function buildBoss() {
    bossGroup = new THREE.Group();
    bossGroup.visible = false;
    scene.add(bossGroup);
    bossGroup.add(makeShadow(1.35, 0.75, 0.65));
    bossSprite = makeSprite('body_neighbor', 1.85, 4.0, 0.9);
    bossSprite.position.set(0, 2.05, 0);
    bossGroup.add(bossSprite);
    var head = makeSprite('face_neighbor', 1.3, 1.3, 0.95);
    head.position.set(0.9, 3.95, 0.08);
    bossGroup.add(head);
    var halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.08, 6, 12),
      basicMat(null, 0x8b1c18, { transparent: true, opacity: 0.85 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 4.45, 0);
    bossGroup.add(halo);
  }

  /* -------------------------------------------------------------- objects */
  function buildObstacleObject() {
    var g = new THREE.Group();
    g.visible = false;
    g.userData.active = false;
    g.userData.kind = 'cone';
    g.userData.radius = 0.4;
    g.userData.height = 0.7;
    g.userData.jumpable = true;
    g.add(makeShadow(0.55, 0.45, 0.45));

    var children = {};
    var cone = new THREE.Group();
    var coneMesh = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.74, 8), mat('cone'));
    coneMesh.position.y = 0.40;
    cone.add(coneMesh);
    var coneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 8), mat('metal_dark', 0x282a2c));
    coneBase.position.y = 0.04;
    cone.add(coneBase);
    g.add(cone); children.cone = cone;

    var bucket = new THREE.Group();
    var bucketMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.22, 0.55, 8), mat('bucket'));
    bucketMesh.position.y = 0.32;
    bucket.add(bucketMesh);
    var handle = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 5, 10), mat('metal_dark', 0x999999));
    handle.rotation.x = Math.PI / 2;
    handle.position.y = 0.61;
    bucket.add(handle);
    g.add(bucket); children.bucket = bucket;

    var tire = new THREE.Group();
    var tireMesh = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.14, 6, 12), mat('tire', 0x232527));
    tireMesh.rotation.x = Math.PI / 2;
    tireMesh.position.y = 0.16;
    tire.add(tireMesh);
    g.add(tire); children.tire = tire;

    var pot = new THREE.Group();
    var potMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.24, 0.42, 8), mat('brick', 0x8a5a48));
    potMesh.position.y = 0.23;
    pot.add(potMesh);
    var leafMat = mat('grass', 0x4f7a38);
    for (var i = 0; i < 4; i++) {
      var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 5), leafMat);
      leaf.position.set(rand(-0.18, 0.18), rand(0.55, 0.72), rand(-0.15, 0.15));
      leaf.rotation.z = rand(-0.5, 0.5);
      pot.add(leaf);
    }
    g.add(pot); children.pot = pot;

    var bin = new THREE.Group();
    var binMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.40, 0.88, 8), mat('metal_dark', 0x4a5256));
    binMesh.position.y = 0.47;
    bin.add(binMesh);
    var lid = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.09, 8), mat('metal_dark', 0x30373b));
    lid.position.y = 0.96;
    bin.add(lid);
    g.add(bin); children.bin = bin;

    g.userData.children = children;
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
      new THREE.MeshLambertMaterial({ color: 0x8ca8b0, emissive: 0x102026, flatShading: true })
    );
    var magnet = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.085, 6, 12, Math.PI * 1.6),
      new THREE.MeshLambertMaterial({ color: 0xc98a4b, emissive: 0x2a1608, flatShading: true })
    );
    magnet.rotation.z = Math.PI * 0.2;
    var double = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.31),
      new THREE.MeshLambertMaterial({ color: 0xb9a06f, emissive: 0x2a2008, flatShading: true })
    );
    shield.position.y = magnet.position.y = double.position.y = 0.78;
    power.add(shield); power.add(magnet); power.add(double);
    g.add(power);

    g.userData.coin = coin;
    g.userData.fuel = fuel;
    g.userData.power = power;
    g.userData.shield = shield;
    g.userData.magnet = magnet;
    g.userData.double = double;
    scene.add(g);
    return g;
  }

  function buildGrassObject() {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.05, 2.6),
      new THREE.MeshBasicMaterial({
        map: textures.grass || null, transparent: true, opacity: 0.82,
        depthWrite: false, side: THREE.DoubleSide
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.04;
    m.visible = false;
    m.userData.active = false;
    scene.add(m);
    return m;
  }

  function buildPools() {
    for (var i = 0; i < 14; i++) { obstacles.push(buildObstacleObject()); }
    for (var j = 0; j < 12; j++) { pickups.push(buildPickupObject()); }
    for (var k = 0; k < 8; k++) { grassPatches.push(buildGrassObject()); }
  }

  function buildParticles() {
    var count = 50;
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
      color: 0x6d8b4c, size: 0.10, transparent: true, opacity: 0.85,
      depthWrite: false, sizeAttenuation: true
    });
    scene.add(new THREE.Points(particleGeometry, material));
  }

  function buildScene() {
    shadowTex = makeShadowTexture();
    numberTextures = [1, 2, 3, 4, 5].map(makeNumberTexture);

    scene.background = new THREE.Color(0x05070a);
    scene.fog = new THREE.Fog(0x05070a, 8, 44);

    hemiLight = new THREE.HemisphereLight(0x8b968d, 0x15100c, 0.48);
    scene.add(hemiLight);
    dirLight = new THREE.DirectionalLight(0xaab0a8, 0.66);
    dirLight.position.set(3, 8, 5);
    scene.add(dirLight);

    buildStaircase();
    buildPlayer();
    buildOpponent();
    buildBoss();
    buildPools();
    buildParticles();
    resetWorld();
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
    obj.position.set(x, worldHeight(z), z);
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
    obj.position.set(x, worldHeight(z), z);
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
    obj.material.opacity = 0.82;
    obj.scale.set(1, 1, 1);
    obj.position.set(x, worldHeight(z) + 0.04, z);
  }

  function spawnParticles(x, z, count) {
    var spawned = 0;
    for (var i = 0; i < particles.length && spawned < count; i++) {
      var p = particles[i];
      if (p.life > 0) { continue; }
      p.life = rand(0.4, 0.8);
      p.x = x + rand(-0.7, 0.7);
      p.y = worldHeight(z) + rand(0.12, 0.4);
      p.z = z + rand(-0.8, 0.4);
      p.vx = rand(-2.0, 2.0);
      p.vy = rand(1.8, 4.6);
      p.vz = rand(-1.4, 1.4);
      spawned++;
    }
  }

  function spawnWave() {
    if (state.boss.active) { state.waveTimer = 0.8; return; }
    var lanes = LANES.slice();
    for (var i = lanes.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = lanes[i]; lanes[i] = lanes[j]; lanes[j] = tmp;
    }
    var count = Math.random() < (0.24 + Math.min(state.distance / 1100, 0.22)) ? 2 : 1;
    for (var c = 0; c < count; c++) {
      spawnObstacle(pick(TYPE_BAG), lanes[c], -36 - c * 1.2);
    }
    var freeLane = lanes[Math.min(lanes.length - 1, count + Math.floor(Math.random() * 2))];
    var roll = Math.random();
    if (roll < 0.10) { spawnPickup('fuel', freeLane, -35); }
    else if (roll < 0.32) { spawnPickup('coin', freeLane, -35); }
    else if (roll < 0.48) { spawnPickup(pick(POWER_KINDS), freeLane, -35); }
    else { spawnGrass(freeLane, -35); }
    state.waveTimer = Math.max(0.62, 1.7 - state.distance / 1100 - (state.floor - 1) * 0.05) + Math.random() * 0.35;
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
      toast('Иконка спасла! Столкновение в ноль', 'gold');
      updateHUD(true);
      return;
    }
    state.lives--;
    state.invuln = 1.35;
    state.shake = 0.9;
    state.speed *= 0.55;
    flash();
    sound.crash();
    try { if (navigator.vibrate) { navigator.vibrate(80); } } catch (e) {}
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
      text = 'Иконка! Следующее столкновение бесплатно';
    } else if (kind === 'magnet') {
      state.magnet = Math.min(16, state.magnet + 9);
      text = 'Свеча! Монеты летят к косилке';
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
    spawnParticles(state.playerX, obj.position.z, 20);
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
      obj.position.y = worldHeight(obj.position.z);
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
      obj.position.y = worldHeight(obj.position.z);
      kind = obj.userData.kind;
      if (kind === 'coin') {
        obj.userData.coin.rotation.y += dt * 3.5;
        if (state.magnet > 0 && obj.position.z > -11 && obj.position.z < 5) {
          obj.position.x = lerp(obj.position.x, state.playerX, Math.min(1, dt * 3.6));
        }
      } else if (kind === 'fuel') {
        obj.userData.fuel.rotation.y += dt * 1.1;
      } else {
        obj.userData.power.rotation.y += dt * 2.0;
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
      obj.position.y = worldHeight(obj.position.z) + 0.04;
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
        p.vy -= 10.0 * dt;
        p.z += (p.vz + speed * 0.6) * dt;
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
    o.z = -34 - Math.random() * 6;
    o.taunt = pick(TAUNTS);
    opponentGroup.visible = true;
    ui.tauntText.textContent = o.taunt;
    ui.taunt.classList.remove('hidden');
    toast('На площадке стоит сосед!', 'bad');
    sound.whisper();
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
    var targetX = clamp(state.playerX + Math.sin(o.t * 1.9) * 1.1, -2.5, 2.5);
    o.x = clamp(lerp(o.x, targetX, Math.min(1, dt * 1.2)), -2.7, 2.7);
    opponentGroup.position.set(o.x, worldHeight(o.z), o.z);
    opponentGroup.rotation.z = Math.sin(o.t * 8) * 0.03;
    opponentSprite.position.y = 1.25 + Math.abs(Math.sin(o.t * 8)) * 0.07;
    opponentSprite.material.rotation = Math.sin(o.t * 8) * 0.05;

    if (o.drops === 0 && o.z > -13) {
      spawnObstacle(pick(['cone', 'bucket', 'tire']), clamp(o.x + rand(-0.7, 0.7), -2.4, 2.4), o.z - 2.0);
      o.drops = 1;
      toast('Сосед бросил ведро!', 'bad');
    } else if (o.drops === 1 && o.z > -6.5) {
      spawnObstacle(pick(['cone', 'pot', 'bucket']), clamp(o.x - rand(0.4, 1.3), -2.4, 2.4), o.z - 1.5);
      o.drops = 2;
    }
    if (Math.abs(o.z) < 1.1 && Math.abs(o.x - state.playerX) < 0.92 && state.invuln <= 0) {
      hit('Ой! Прямо в тень соседа!');
      o.x += (o.x < state.playerX ? -1.7 : 1.7);
    }
    if (o.z > 7) {
      o.active = false;
      opponentGroup.visible = false;
      ui.taunt.classList.add('hidden');
      state.opponentCooldown = Math.max(6, 11 + Math.random() * 6 - state.distance / 600);
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
    bossGroup.position.set(0, worldHeight(-16), -16);
    ui.boss.classList.remove('hidden');
    ui.bossFill.style.width = '0%';
    ui.bossText.textContent = 'Хозяин лестницы идёт сверху! Держись 8 секунд!';
    toast('⚠ ХОЗЯИН ЛЕСТНИЦЫ!', 'bad');
    scare();
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
    var bz = -16 + Math.sin(b.t * 0.8) * 1.2;
    bossGroup.position.set(b.x, worldHeight(bz), bz);
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
        spawnObstacle(pick(TYPE_BAG), lanes[c], -28 - c * 1.2);
      }
      if (Math.random() < 0.5) { spawnPickup('coin', lanes[4], -27); }
      b.dropAt = b.t + Math.max(0.9, 1.4 - state.floor * 0.05);
      toast('Хозяин швыряет вёдра!', 'bad');
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
    toast('Хозяин отступил! +500', 'gold');
    sound.power();
    updateHUD(true);
  }

  function resetPools() {
    obstacles.forEach(function (o) { o.userData.active = false; o.visible = false; o.position.z = -200; });
    pickups.forEach(function (o) { o.userData.active = false; o.visible = false; o.position.z = -200; o.position.y = 0; });
    grassPatches.forEach(function (o) { o.userData.active = false; o.visible = false; o.position.z = -200; o.material.opacity = 0.82; o.scale.set(1, 1, 1); });
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
    state.loop = 1;
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
    state.ghostTimer = 9;
    state.toastTimer = 0;
    state.flashTimer = 0;
    ui.toast.className = 'toast';
    ui.flash.classList.remove('on');
    ui.taunt.classList.add('hidden');
    ui.boss.classList.add('hidden');
    ui.bossFill.style.width = '0%';
    clearScare();
    opponentGroup.visible = false;
    bossGroup.visible = false;
    if (floorTex) { floorTex.offset.set(0, 0); }
    if (wallTex) { wallTex.offset.set(0, 0); }
    if (ceilingTex) { ceilingTex.offset.set(0, 0); }
    for (var i = 0; i < stairSegments.length; i++) {
      stairSegments[i].position.z = -i * CYCLE_LEN;
      randomizeSegment(stairSegments[i], ((i + state.floor - 1) % 5) + 1);
    }
    resetPools();
    updateHUD(true);
  }

  function updateWorld(dt, speed) {
    if (floorTex) { floorTex.offset.y -= speed * dt * 0.03; }
    if (ceilingTex) { ceilingTex.offset.y -= speed * dt * 0.018; }
    for (var i = 0; i < stairSegments.length; i++) {
      var seg = stairSegments[i];
      seg.position.z += speed * dt;
      if (seg.position.z > CYCLE_LEN * 1.2) {
        seg.position.z -= WORLD_DEPTH;
        randomizeSegment(seg, ((state.floor + seg.userData.index - 1) % 5) + 1);
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
    var bob = Math.sin(state.t * 9) * 0.018 * (speed / 10);
    playerGroup.position.set(state.playerX, worldHeight(0) + state.jumpY + bob, 0);
    playerGroup.rotation.z = -state.steer * 0.065 + Math.sin(state.t * 12) * 0.005;
    playerGroup.rotation.y = state.steer * 0.045;
    playerGroup.rotation.x = state.jumpY * -0.025;
    playerGroup.visible = !(state.invuln > 0 && Math.floor(state.t * 14) % 2 === 0);
    for (var i = 0; i < wheels.length; i++) {
      wheels[i].pivot.rotation.x += (speed * dt) / wheels[i].radius;
    }
    bladeGroup.rotation.y += dt * 20;
    playerHeadSprite.material.rotation = -state.steer * 0.10;
    playerBodySprite.material.rotation = -state.steer * 0.035;
  }

  function updateCamera(dt) {
    state.shake = Math.max(0, state.shake - dt * 1.8);
    var sx = state.shake > 0 ? rand(-state.shake, state.shake) * 0.16 : 0;
    var sy = state.shake > 0 ? rand(-state.shake, state.shake) * 0.10 : 0;
    var baseY = worldHeight(0);
    camera.position.set(state.playerX * 0.22 + sx, baseY + 3.25 + state.jumpY * 0.08 + sy, 8.7);
    camera.lookAt(state.playerX * 0.12, worldHeight(-10) + 1.15, -10);
  }

  function updateGame(dt) {
    state.t += dt;
    state.shield = Math.max(0, state.shield - dt);
    state.magnet = Math.max(0, state.magnet - dt);
    state.doubleT = Math.max(0, state.doubleT - dt);
    var boosting = input.gas && state.fuel > 0.02;
    if (boosting) { state.fuel = Math.max(0, state.fuel - dt * 0.13); }
    else { state.fuel = Math.min(1, state.fuel + dt * 0.022); }
    var targetSpeed = 9 + Math.min(state.distance / 400, 1) * 6
      + (boosting ? 5 : 0) + (state.floor - 1) * 0.55 + (state.loop - 1) * 0.35;
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 2.3);
    state.distance += state.speed * dt;
    state.score = Math.floor(state.distance * 2 * (state.doubleT > 0 ? 2 : 1)) + state.bonus;
    state.invuln = Math.max(0, state.invuln - dt);

    var floorIndex = Math.floor(state.distance / FLOOR_STEP);
    var newFloor = (floorIndex % 5) + 1;
    var newLoop = Math.floor(floorIndex / 5) + 1;
    if (newFloor !== state.floor || newLoop !== state.loop) {
      state.floor = newFloor;
      state.loop = newLoop;
      var floorBonus = 100 * state.floor;
      state.bonus += floorBonus;
      toast('ЭТАЖ ' + state.floor + '/5 · КРУГ ' + state.loop + ' +' + floorBonus, 'gold');
      scare();
      sound.power();
      updateHUD(true);
    }

    state.ghostTimer -= dt;
    if (state.ghostTimer <= 0) {
      scare();
      state.ghostTimer = rand(7, 13);
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
    updatePlayer(dt, 2.0, false);
    updateWorld(dt, 2.0);
    updateParticles(dt, 2.0);
    updateCamera(dt);
  }

  /* ------------------------------------------------------------ lifecycle */
  function startGame() {
    sound.init();
    sound.resume();
    resetWorld();
    setState('playing');
    toast('Вниз по лестнице. Снова.');
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
      state.jumpVel = 6.4;
      sound.blip(300, 0.1, 'triangle', 0.07);
    }
  }

  function bindEvents() {
    window.addEventListener('resize', function () {
      if (!renderer) { return; }
      renderer.setPixelRatio(RENDER_SETTINGS.pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
      camera.updateProjectionMatrix();
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
      if (k === 'jump') { if (!e.repeat) { tryJump(); } return; }
      if (k === 'pause') { if (!e.repeat) { togglePause(); } return; }
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
      updateScare(dt);
      updateLighting();
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
    debugSetDistance: function (metres) { state.distance = Math.max(0, metres || 0); },
    debugSetLives: function (n) { state.lives = Math.max(1, n | 0); updateHUD(true); },
    debugSetInvuln: function (t) { state.invuln = Math.max(0, t || 0); },
    debugDisableBoss: function () { state.boss.nextAt = Number.POSITIVE_INFINITY; },
    setQuality: function () { return 'low'; },
    triggerScare: function () { scare(true); },
    clearScare: clearScare,
    stairHeightAt: worldHeight,
    segmentZs: function () { return stairSegments.map(function (s) { return s.position.z; }); },
    getState: function () {
      return {
        mode: state.mode,
        floor: state.floor,
        loop: state.loop,
        distance: state.distance,
        score: state.score,
        bossActive: state.boss.active,
        scareVisible: !ui.scare.classList.contains('hidden'),
        segments: stairSegments.length,
        stepsPerFlight: STEPS_PER_FLIGHT,
        cycleLen: CYCLE_LEN,
        landingHeight: LANDING_HEIGHT,
        fps: state.fps,
        render: RENDER_SETTINGS
      };
    },
    lowGraphics: true,
    horror: true
  };

  function init() {
    if (!window.THREE) {
      showFatal('Библиотека Three.js не загрузилась из assets.');
      return;
    }
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: 'low-power'
      });
      renderer.shadowMap.enabled = false;
      renderer.setPixelRatio(RENDER_SETTINGS.pixelRatio);
      renderer.setClearColor(0x05070a, 1);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setSize(window.innerWidth, window.innerHeight);
      ui.canvasWrap.appendChild(renderer.domElement);
    } catch (e) {
      console.error(e);
      showFatal('WebView не смог создать WebGL-контекст. Включите аппаратное ускорение.');
      return;
    }
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(66, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 90);
    camera.position.set(0, 3.45, 8.7);
    camera.lookAt(0, 1.3, -10);
    loadTextures(finishLoading);
  }

  window.addEventListener('error', function (e) {
    console.error('Game error:', e.message);
  });

  init();
})();
