import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { memoriesData, endingMessage } from './data.js';

var CORRIDOR_WIDTH = 7.6;
var HALL_HEIGHT = 5.2;
var FRAME_SPACING = 4.2;
var FRAME_Y_CENTER = 1.72;
var BASE_HEIGHT = 1.55;
var MAX_PHOTO_W = 2.35;
var BENCH_INTERVAL = 16;
var LOAD_DIST = 46;
var UNLOAD_DIST = 65;
var TEX_CHECK_MS = 250;
var INITIAL_LOAD_COUNT = 16;
var WALK_SPEED = 6.8;
var PLAYER_HEIGHT = 1.65;
var COLLISION_PAD = 0.5;
var INTERACT_DIST = 5.5;

var isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var MAX_DPR = isMobile ? 1.5 : 2.0;

var scene, camera, renderer, controls, envMap;
var clock = new THREE.Clock();
var velocity = new THREE.Vector3();
var moveState = { forward: false, backward: false, left: false, right: false };

var totalItems = memoriesData.length;
var leftCount = Math.ceil(totalItems / 2);
var rightCount = Math.floor(totalItems / 2);
var hallLength = Math.max(leftCount, rightCount) * FRAME_SPACING + 26;

var frameRegistry = [];
var interactables = [];
var raycaster = new THREE.Raycaster();
raycaster.far = INTERACT_DIST;

var lightPool = [];
var LIGHT_POOL_SIZE = 4;

var greyZoneStartZ = 0;
var greyParticlesObj = null;
var greyParticlesGeo = null;

var joystickState = { active: false, startX: 0, startY: 0, dx: 0, dy: 0 };
var touchLookState = { active: false, id: -1, prevX: 0, prevY: 0 };
var joystickTouchId = -1;
var cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');

var bobPhase = 0;
var isPointerLocked = false;
var isModalOpen = false;
var bgmMuted = false;
var bgmAudio = null;
var lastTexCheck = 0;
var teleportTarget = null;

var $loading = document.getElementById('loading-screen');
var $loadBar = document.getElementById('loading-bar-fill');
var $loadPercent = document.getElementById('loading-percent');
var $startScreen = document.getElementById('start-screen');
var $btnEnter = document.getElementById('btn-enter');
var $hud = document.getElementById('hud');
var $crosshair = document.getElementById('crosshair');
var $interactHint = document.getElementById('interact-hint');
var $interactText = document.getElementById('interact-hint-text');
var $lightbox = document.getElementById('lightbox');
var $lightboxImg = document.getElementById('lightbox-img');
var $lightboxClose = document.getElementById('lightbox-close');
var $textModal = document.getElementById('text-modal');
var $modalTitle = document.getElementById('modal-title');
var $modalSub = document.getElementById('modal-subtitle');
var $modalText = document.getElementById('modal-text');
var $modalClose = document.getElementById('modal-close');
var $mobileCtrl = document.getElementById('mobile-controls');
var $btnMute = document.getElementById('btn-mute');
var $iconMuted = document.getElementById('icon-muted');
var $iconUnmuted = document.getElementById('icon-unmuted');
var $rotateHint = document.getElementById('rotate-hint');
var $qjButtons = document.querySelectorAll('.qj-btn');

var textureLoader = new THREE.TextureLoader();

var sharedScallopTex = null;
var sharedBlankCanvasTex = null;
var sharedPlaceholderTex = null;
var sharedFrameMat = null;
var sharedGoldMat = null;
var sharedMatboardMat = null;
var sharedGlassMat = null;
var sharedShadowMat = null;
var sharedScallopMat = null;
var sharedSpotGeo = null;
var sharedSpotMat = null;

function createWallTexture(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#efe9e0';
  ctx.fillRect(0, 0, w, h);

  var imgData = ctx.getImageData(0, 0, w, h);
  var data = imgData.data;
  var len = data.length;
  for (var i = 0; i < len; i += 4) {
    var noise = (Math.random() - 0.5) * 14;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise - 1));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise - 2));
  }
  ctx.putImageData(imgData, 0, 0);

  var topGrad = ctx.createLinearGradient(0, 0, 0, 160);
  topGrad.addColorStop(0, 'rgba(16, 14, 12, 0.48)');
  topGrad.addColorStop(0.35, 'rgba(16, 14, 12, 0.22)');
  topGrad.addColorStop(1, 'rgba(16, 14, 12, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, 160);

  var btmGrad = ctx.createLinearGradient(0, h, 0, h - 180);
  btmGrad.addColorStop(0, 'rgba(14, 12, 10, 0.52)');
  btmGrad.addColorStop(0.35, 'rgba(14, 12, 10, 0.24)');
  btmGrad.addColorStop(1, 'rgba(14, 12, 10, 0)');
  ctx.fillStyle = btmGrad;
  ctx.fillRect(0, h - 180, w, 180);

  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.ceil(hallLength / 4.2), 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDarkMarbleTexture(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  var ctx = c.getContext('2d');

  var bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#191716');
  bgGrad.addColorStop(0.4, '#171514');
  bgGrad.addColorStop(0.8, '#1b1918');
  bgGrad.addColorStop(1, '#161413');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#38322d';
  ctx.lineWidth = 2.0;
  var i, j, x, y;
  for (i = 0; i < 28; i++) {
    ctx.beginPath();
    x = Math.random() * w;
    y = Math.random() * h;
    ctx.moveTo(x, y);
    for (j = 0; j < 6; j++) {
      x += (Math.random() - 0.5) * 160;
      y += (Math.random() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#524942';
  ctx.lineWidth = 1.0;
  for (i = 0; i < 20; i++) {
    ctx.beginPath();
    x = Math.random() * w;
    y = Math.random() * h;
    ctx.moveTo(x, y);
    for (j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 110;
      y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1.0;
  var imgData = ctx.getImageData(0, 0, w, h);
  var d = imgData.data;
  for (i = 0; i < d.length; i += 4) {
    var n = (Math.random() - 0.5) * 6;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);

  ctx.strokeStyle = '#0e0d0c';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.65;
  var tileSize = 256;
  for (x = 0; x <= w; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (y = 0; y <= h; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, Math.ceil(hallLength / 3.6));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDarkMarbleRoughnessTexture(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#484848';
  ctx.fillRect(0, 0, w, h);

  var imgData = ctx.getImageData(0, 0, w, h);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = (Math.random() - 0.5) * 36;
    var v = Math.min(255, Math.max(0, d[i] + n));
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);

  ctx.strokeStyle = '#757575';
  ctx.lineWidth = 2.0;
  var tileSize = 256;
  for (var x = 0; x <= w; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (var y = 0; y <= h; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, Math.ceil(hallLength / 3.6));
  return tex;
}

function createCanvasMatboardTexture() {
  var c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, 128, 128);
  var imgData = ctx.getImageData(0, 0, 128, 128);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = (Math.random() - 0.5) * 5;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBlankCanvasTexture() {
  var c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#f6f2ec';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(196, 186, 172, 0.12)';
  ctx.lineWidth = 0.7;
  var i;
  for (i = 0; i < 256; i += 3) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  for (i = 0; i < 256; i += 3) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGoldenScallopTexture() {
  var c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  var ctx = c.getContext('2d');
  var grad = ctx.createRadialGradient(128, 24, 6, 128, 220, 240);
  grad.addColorStop(0, 'rgba(255, 208, 138, 0.65)');
  grad.addColorStop(0.28, 'rgba(255, 200, 128, 0.22)');
  grad.addColorStop(0.65, 'rgba(255, 190, 115, 0.05)');
  grad.addColorStop(1, 'rgba(255, 185, 110, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPlaceholderTexture() {
  var c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e2d8';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = '#d4cbbd';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 56, 56);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function initEngine() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11100f);
  scene.fog = new THREE.Fog(0x11100f, 6, 56);

  var initialAspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(initialAspect < 1.0 ? 80 : 62, initialAspect, 0.1, 220);
  camera.position.set(0, PLAYER_HEIGHT, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  var pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  var roomScene = new RoomEnvironment();
  envMap = pmrem.fromScene(roomScene, 0.04).texture;
  scene.environment = envMap;
  roomScene.dispose();
  pmrem.dispose();

  scene.add(new THREE.AmbientLight(0xfff0dd, 0.18));
  scene.add(new THREE.HemisphereLight(0xfff0dd, 0x12100e, 0.35));

  if (!isMobile) {
    controls = new PointerLockControls(camera, renderer.domElement);
    scene.add(controls.getObject());
  } else {
    scene.add(camera);
  }

  for (var i = 0; i < LIGHT_POOL_SIZE; i++) {
    var pl = new THREE.PointLight(0xffcf87, 2.8, 16, 1.8);
    pl.position.set(0, HALL_HEIGHT - 0.5, 0);
    scene.add(pl);
    lightPool.push(pl);
  }

  window.addEventListener('resize', function () {
    var aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.fov = aspect < 1.0 ? 80 : 62;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    if ($rotateHint && aspect >= 1.0) {
      $rotateHint.classList.add('hidden');
    }
  });
}

function initSharedMaterials() {
  sharedScallopTex = createGoldenScallopTexture();
  sharedBlankCanvasTex = createBlankCanvasTexture();
  sharedPlaceholderTex = createPlaceholderTexture();

  sharedFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1b1410,
    roughness: 0.35,
    metalness: 0.05,
    envMap: envMap,
    envMapIntensity: 0.35
  });

  sharedGoldMat = new THREE.MeshStandardMaterial({
    color: 0xc5a059,
    metalness: 0.8,
    roughness: 0.25,
    envMap: envMap,
    envMapIntensity: 0.85
  });

  var matboardTex = createCanvasMatboardTexture();
  sharedMatboardMat = new THREE.MeshStandardMaterial({
    map: matboardTex,
    color: 0xf4efe6,
    roughness: 0.85,
    metalness: 0.0
  });

  sharedGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.03,
    roughness: 0.04,
    metalness: 0.1,
    envMap: envMap,
    envMapIntensity: 0.45,
    depthWrite: false,
    side: THREE.FrontSide
  });

  sharedShadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.08,
    depthWrite: false
  });

  sharedScallopMat = new THREE.MeshBasicMaterial({
    map: sharedScallopTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.6
  });

  sharedSpotGeo = new THREE.CylinderGeometry(0.035, 0.055, 0.1, 8);
  sharedSpotMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.7, metalness: 0.4 });
}

function buildMuseum() {
  var marbleColor = createDarkMarbleTexture(1024, 1024);
  var marbleRough = createDarkMarbleRoughnessTexture(512, 512);
  var wallTexL = createWallTexture(1024, 1024);
  var wallTexR = createWallTexture(1024, 1024);
  var wallTexBack = createWallTexture(512, 512);
  wallTexBack.repeat.set(2, 1);

  var totalLength = hallLength + 4;
  var centerZ = -(hallLength - 4) / 2;

  var floorGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH, totalLength);
  var floorMat = new THREE.MeshStandardMaterial({
    map: marbleColor,
    roughnessMap: marbleRough,
    roughness: 0.2,
    metalness: 0.15,
    envMap: envMap,
    envMapIntensity: 0.75
  });
  var floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, centerZ);
  scene.add(floor);

  var ceilMat = new THREE.MeshStandardMaterial({ color: 0xede8e1, roughness: 0.9, metalness: 0.0 });

  var ceilWingWidth = (CORRIDOR_WIDTH - 1.4) / 2;
  var ceilLeftGeo = new THREE.PlaneGeometry(ceilWingWidth, totalLength);
  var ceilLeft = new THREE.Mesh(ceilLeftGeo, ceilMat);
  ceilLeft.rotation.x = Math.PI / 2;
  ceilLeft.position.set(-(CORRIDOR_WIDTH / 2 - ceilWingWidth / 2), HALL_HEIGHT, centerZ);
  scene.add(ceilLeft);

  var ceilRight = new THREE.Mesh(ceilLeftGeo, ceilMat);
  ceilRight.rotation.x = Math.PI / 2;
  ceilRight.position.set(CORRIDOR_WIDTH / 2 - ceilWingWidth / 2, HALL_HEIGHT, centerZ);
  scene.add(ceilRight);

  var ceilCenterGeo = new THREE.PlaneGeometry(1.4, totalLength);
  var ceilCenterMat = new THREE.MeshStandardMaterial({ color: 0xe6e0d6, roughness: 0.85, metalness: 0.0 });
  var ceilCenter = new THREE.Mesh(ceilCenterGeo, ceilCenterMat);
  ceilCenter.rotation.x = Math.PI / 2;
  ceilCenter.position.set(0, HALL_HEIGHT - 0.14, centerZ);
  scene.add(ceilCenter);

  var soffitGeo = new THREE.BoxGeometry(0.12, 0.14, totalLength);
  var soffitMat = new THREE.MeshStandardMaterial({ color: 0xe6e0d6, roughness: 0.85 });
  [-0.76, 0.76].forEach(function (xm) {
    var soffit = new THREE.Mesh(soffitGeo, soffitMat);
    soffit.position.set(xm, HALL_HEIGHT - 0.07, centerZ);
    scene.add(soffit);
  });

  var ledGeo = new THREE.BoxGeometry(0.16, 0.04, totalLength);
  var ledMat = new THREE.MeshStandardMaterial({
    color: 0xffedd0,
    emissive: 0xffdfaa,
    emissiveIntensity: 0.6,
    roughness: 0.9
  });
  [-0.76, 0.76].forEach(function (xm) {
    var led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(xm, HALL_HEIGHT - 0.155, centerZ);
    scene.add(led);
  });

  var wallMatL = new THREE.MeshStandardMaterial({
    map: wallTexL,
    bumpMap: wallTexL,
    bumpScale: 0.012,
    roughness: 0.85,
    metalness: 0.0,
    envMap: envMap,
    envMapIntensity: 0.1
  });
  var wallGeoL = new THREE.PlaneGeometry(totalLength, HALL_HEIGHT);
  var wallLeft = new THREE.Mesh(wallGeoL, wallMatL);
  wallLeft.rotation.y = Math.PI / 2;
  wallLeft.position.set(-3.8, HALL_HEIGHT / 2, centerZ);
  scene.add(wallLeft);

  var wallMatR = new THREE.MeshStandardMaterial({
    map: wallTexR,
    bumpMap: wallTexR,
    bumpScale: 0.012,
    roughness: 0.85,
    metalness: 0.0,
    envMap: envMap,
    envMapIntensity: 0.1
  });
  var wallRight = new THREE.Mesh(wallGeoL, wallMatR);
  wallRight.rotation.y = -Math.PI / 2;
  wallRight.position.set(3.8, HALL_HEIGHT / 2, centerZ);
  scene.add(wallRight);

  var backGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH, HALL_HEIGHT);
  var backMat = new THREE.MeshStandardMaterial({ map: wallTexBack, roughness: 0.85 });
  var backWall = new THREE.Mesh(backGeo, backMat);
  backWall.position.set(0, HALL_HEIGHT / 2, 2.0);
  scene.add(backWall);

  var bbGeo = new THREE.BoxGeometry(0.08, 0.2, totalLength);
  var bbMat = new THREE.MeshStandardMaterial({ color: 0x1b1715, roughness: 0.45, metalness: 0.05 });
  [-1, 1].forEach(function (side) {
    var bb = new THREE.Mesh(bbGeo, bbMat);
    bb.position.set(side * (3.8 - 0.04), 0.1, centerZ);
    scene.add(bb);
  });

  var cmGeo = new THREE.BoxGeometry(0.08, 0.14, totalLength);
  var cmMat = new THREE.MeshStandardMaterial({ color: 0xede8e1, roughness: 0.6, metalness: 0.02 });
  [-1, 1].forEach(function (side) {
    var cm = new THREE.Mesh(cmGeo, cmMat);
    cm.position.set(side * (3.8 - 0.04), HALL_HEIGHT - 0.07, centerZ);
    scene.add(cm);
  });

  var railGeo = new THREE.BoxGeometry(0.06, 0.05, totalLength);
  var railMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.75, metalness: 0.35 });
  [-1.8, 1.8].forEach(function (xPos) {
    var rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(xPos, HALL_HEIGHT - 0.035, centerZ);
    scene.add(rail);
  });

  buildFurniture();
}

function buildFurniture() {
  var benchSeatMat = new THREE.MeshStandardMaterial({
    color: 0x221c18,
    roughness: 0.45,
    metalness: 0.1,
    envMap: envMap,
    envMapIntensity: 0.3
  });
  var benchLegMat = new THREE.MeshStandardMaterial({ color: 0x151210, roughness: 0.6, metalness: 0.2 });
  var pillarMat = new THREE.MeshStandardMaterial({
    color: 0xefe9e0,
    roughness: 0.7,
    metalness: 0.02,
    envMap: envMap,
    envMapIntensity: 0.15
  });
  var beamMat = new THREE.MeshStandardMaterial({ color: 0xece6dc, roughness: 0.75, metalness: 0.02 });
  var shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.12,
    depthWrite: false
  });

  var seatGeo = new THREE.BoxGeometry(1.6, 0.08, 0.5);
  var legGeo = new THREE.BoxGeometry(0.05, 0.42, 0.05);
  var pillarGeo = new THREE.BoxGeometry(0.32, HALL_HEIGHT, 0.32);
  var archBeamGeo = new THREE.BoxGeometry(CORRIDOR_WIDTH - 0.08, 0.28, 0.32);
  var benchShadowGeo = new THREE.PlaneGeometry(1.85, 0.7);

  for (var idx = BENCH_INTERVAL; idx < totalItems; idx += BENCH_INTERVAL) {
    var zPos = -(Math.floor(idx / 2) * FRAME_SPACING + FRAME_SPACING / 2 + 5);

    var benchGroup = new THREE.Group();
    var seat = new THREE.Mesh(seatGeo, benchSeatMat);
    seat.position.y = 0.46;
    benchGroup.add(seat);
    var legPositions = [[-0.68, -0.19], [0.68, -0.19], [-0.68, 0.19], [0.68, 0.19]];
    legPositions.forEach(function (lp) {
      var leg = new THREE.Mesh(legGeo, benchLegMat);
      leg.position.set(lp[0], 0.22, lp[1]);
      benchGroup.add(leg);
    });
    benchGroup.position.set(0, 0, zPos);
    scene.add(benchGroup);

    var bShadow = new THREE.Mesh(benchShadowGeo, shadowMat);
    bShadow.rotation.x = -Math.PI / 2;
    bShadow.position.set(0, 0.003, zPos);
    scene.add(bShadow);

    [-1, 1].forEach(function (side) {
      var pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(side * (3.8 - 0.2), HALL_HEIGHT / 2, zPos);
      scene.add(pillar);
    });

    var beam = new THREE.Mesh(archBeamGeo, beamMat);
    beam.position.set(0, HALL_HEIGHT - 0.14, zPos);
    scene.add(beam);
  }
}

function createPictureFrame(item, isLeftWall, zPosition) {
  var frameGroup = new THREE.Group();

  var photoW = Math.min(BASE_HEIGHT * item.aspectRatio, MAX_PHOTO_W);
  var photoH = BASE_HEIGHT;
  var matMargin = 0.08;
  var matW = photoW + matMargin * 2;
  var matH = photoH + matMargin * 2;
  var frameBorder = 0.07;
  var frameW = matW + frameBorder * 2;
  var frameH = matH + frameBorder * 2;
  var frameDepth = 0.05;

  var shadowGeo = new THREE.PlaneGeometry(frameW + 0.18, frameH + 0.14);
  var contactShadow = new THREE.Mesh(shadowGeo, sharedShadowMat);
  contactShadow.position.set(0, 0, 0.001);
  frameGroup.add(contactShadow);

  var scH = frameH * 1.15;
  var scW = frameW * 0.92;
  var scGeo = new THREE.PlaneGeometry(scW, scH);
  var scallop = new THREE.Mesh(scGeo, sharedScallopMat);
  scallop.position.set(0, frameH / 2 + scH / 2 - 0.12, 0.001);
  frameGroup.add(scallop);

  var matGeo = new THREE.PlaneGeometry(matW, matH);
  var matboard = new THREE.Mesh(matGeo, sharedMatboardMat);
  matboard.position.set(0, 0, 0.015);
  frameGroup.add(matboard);

  var photoGeo = new THREE.PlaneGeometry(photoW, photoH);
  var photoMat;
  if (item.isBlank) {
    photoMat = new THREE.MeshStandardMaterial({
      map: sharedBlankCanvasTex,
      roughness: 0.9,
      metalness: 0.0
    });
  } else {
    photoMat = new THREE.MeshStandardMaterial({
      map: sharedPlaceholderTex.clone(),
      roughness: 0.35,
      metalness: 0.0,
      envMap: envMap,
      envMapIntensity: 0.08
    });
  }
  var photoMesh = new THREE.Mesh(photoGeo, photoMat);
  photoMesh.position.set(0, 0, 0.018);
  frameGroup.add(photoMesh);

  var glassGeo = new THREE.PlaneGeometry(matW, matH);
  var glass = new THREE.Mesh(glassGeo, sharedGlassMat);
  glass.position.set(0, 0, 0.022);
  frameGroup.add(glass);

  var topBorderGeo = new THREE.BoxGeometry(frameW, frameBorder, frameDepth);
  var topBorder = new THREE.Mesh(topBorderGeo, sharedFrameMat);
  topBorder.position.set(0, (frameH - frameBorder) / 2, frameDepth / 2);
  frameGroup.add(topBorder);

  var btmBorderGeo = new THREE.BoxGeometry(frameW, frameBorder, frameDepth);
  var btmBorder = new THREE.Mesh(btmBorderGeo, sharedFrameMat);
  btmBorder.position.set(0, -(frameH - frameBorder) / 2, frameDepth / 2);
  frameGroup.add(btmBorder);

  var sideBorderGeo = new THREE.BoxGeometry(frameBorder, matH, frameDepth);
  var leftBorder = new THREE.Mesh(sideBorderGeo, sharedFrameMat);
  leftBorder.position.set(-(frameW - frameBorder) / 2, 0, frameDepth / 2);
  frameGroup.add(leftBorder);

  var rightBorder = new THREE.Mesh(sideBorderGeo, sharedFrameMat);
  rightBorder.position.set((frameW - frameBorder) / 2, 0, frameDepth / 2);
  frameGroup.add(rightBorder);

  var goldThickness = 0.008;
  var goldDepth = frameDepth + 0.002;
  var topGoldGeo = new THREE.BoxGeometry(matW + goldThickness * 2, goldThickness, goldDepth);
  var topGold = new THREE.Mesh(topGoldGeo, sharedGoldMat);
  topGold.position.set(0, matH / 2 + goldThickness / 2, goldDepth / 2);
  frameGroup.add(topGold);

  var btmGoldGeo = new THREE.BoxGeometry(matW + goldThickness * 2, goldThickness, goldDepth);
  var btmGold = new THREE.Mesh(btmGoldGeo, sharedGoldMat);
  btmGold.position.set(0, -(matH / 2 + goldThickness / 2), goldDepth / 2);
  frameGroup.add(btmGold);

  var sideGoldGeo = new THREE.BoxGeometry(goldThickness, matH, goldDepth);
  var leftGold = new THREE.Mesh(sideGoldGeo, sharedGoldMat);
  leftGold.position.set(-(matW / 2 + goldThickness / 2), 0, goldDepth / 2);
  frameGroup.add(leftGold);

  var rightGold = new THREE.Mesh(sideGoldGeo, sharedGoldMat);
  rightGold.position.set(matW / 2 + goldThickness / 2, 0, goldDepth / 2);
  frameGroup.add(rightGold);

  photoMesh.userData = {
    type: item.isBlank ? 'blank' : 'photo',
    item: item
  };
  interactables.push(photoMesh);

  glass.userData = {
    type: item.isBlank ? 'blank' : 'photo',
    item: item
  };
  interactables.push(glass);

  if (isLeftWall) {
    frameGroup.position.set(-3.8 + 0.01, FRAME_Y_CENTER, zPosition);
    frameGroup.rotation.set(0, Math.PI / 2, 0);
  } else {
    frameGroup.position.set(3.8 - 0.01, FRAME_Y_CENTER, zPosition);
    frameGroup.rotation.set(0, -Math.PI / 2, 0);
  }
  scene.add(frameGroup);

  var railX = isLeftWall ? -1.8 : 1.8;
  var spotHousing = new THREE.Mesh(sharedSpotGeo, sharedSpotMat);
  spotHousing.position.set(railX, HALL_HEIGHT - 0.09, zPosition);
  spotHousing.rotation.z = isLeftWall ? -0.32 : 0.32;
  scene.add(spotHousing);

  frameRegistry.push({
    group: frameGroup,
    zPos: zPosition,
    item: item,
    textureLoaded: false,
    photoMat: photoMat,
    photoMesh: photoMesh
  });
}

function placeAllFrames() {
  for (var i = 0; i < totalItems; i++) {
    var item = memoriesData[i];
    var isLeft = (i % 2 === 0);
    var pairIndex = Math.floor(i / 2);
    var zPos = -(pairIndex * FRAME_SPACING + 5);
    createPictureFrame(item, isLeft, zPos);
  }

  if (frameRegistry.length > 74) {
    greyZoneStartZ = frameRegistry[74].zPos;
  } else {
    greyZoneStartZ = -hallLength + 36;
  }
}

function buildEndZone() {
  var endZ = -hallLength + 4;

  var doorFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1b1512,
    roughness: 0.42,
    metalness: 0.18,
    envMap: envMap,
    envMapIntensity: 0.35
  });
  var doorPanelMat = new THREE.MeshStandardMaterial({
    color: 0x2a221c,
    roughness: 0.46,
    metalness: 0.12,
    envMap: envMap,
    envMapIntensity: 0.3
  });

  var doorFrameGeo = new THREE.BoxGeometry(3.4, HALL_HEIGHT - 0.2, 0.22);
  var doorFrame = new THREE.Mesh(doorFrameGeo, doorFrameMat);
  doorFrame.position.set(0, (HALL_HEIGHT - 0.2) / 2, endZ);
  scene.add(doorFrame);

  var doorTopGeo = new THREE.BoxGeometry(3.6, 0.25, 0.24);
  var doorTop = new THREE.Mesh(doorTopGeo, doorFrameMat);
  doorTop.position.set(0, HALL_HEIGHT - 0.25, endZ);
  scene.add(doorTop);

  var panelGeo = new THREE.BoxGeometry(1.25, HALL_HEIGHT - 0.7, 0.07);
  var leftDoor = new THREE.Mesh(panelGeo, doorPanelMat);
  leftDoor.position.set(-0.85, (HALL_HEIGHT - 0.7) / 2, endZ - 0.08);
  scene.add(leftDoor);

  var rightDoor = new THREE.Mesh(panelGeo, doorPanelMat.clone());
  rightDoor.position.set(0.55, (HALL_HEIGHT - 0.7) / 2, endZ - 0.32);
  rightDoor.rotation.y = 0.38;
  scene.add(rightDoor);

  var glowGeo = new THREE.PlaneGeometry(3.0, HALL_HEIGHT);
  var glowMat = new THREE.MeshBasicMaterial({
    color: 0xffedd0,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  var glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, HALL_HEIGHT / 2, endZ - 0.6);
  scene.add(glow);

  var floorGlowGeo = new THREE.PlaneGeometry(2.6, 6);
  var floorGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffedd0,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  var floorGlow = new THREE.Mesh(floorGlowGeo, floorGlowMat);
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.set(0, 0.01, endZ + 2);
  scene.add(floorGlow);

  var doorLight = new THREE.PointLight(0xffe2b8, 2.2, 20, 1.8);
  doorLight.position.set(0, HALL_HEIGHT * 0.55, endZ - 2.5);
  scene.add(doorLight);

  var pedGroup = new THREE.Group();
  var pedBaseMat = new THREE.MeshStandardMaterial({
    color: 0xdcd5cb,
    roughness: 0.4,
    metalness: 0.06,
    envMap: envMap,
    envMapIntensity: 0.4
  });
  var pedTopMat = new THREE.MeshStandardMaterial({
    color: 0xf5f0e8,
    roughness: 0.25,
    metalness: 0.08,
    envMap: envMap,
    envMapIntensity: 0.5
  });

  var pedCol = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.0, 16), pedBaseMat);
  pedCol.position.y = 0.5;
  pedGroup.add(pedCol);

  var pedBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.08, 16), pedBaseMat);
  pedBase.position.y = 0.04;
  pedGroup.add(pedBase);

  var pedTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), pedTopMat);
  pedTop.position.y = 1.04;
  pedGroup.add(pedTop);

  var plaqueMat = new THREE.MeshStandardMaterial({
    color: 0xfff0d8,
    emissive: 0xffecd0,
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.15
  });
  var plaque = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.02), plaqueMat);
  plaque.position.set(0, 1.12, 0.18);
  plaque.rotation.x = -0.3;
  pedGroup.add(plaque);

  var orbMat = new THREE.MeshBasicMaterial({
    color: 0xffecd0,
    transparent: true,
    opacity: 0.8
  });
  var orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 24), orbMat);
  orb.position.y = 1.2;
  pedGroup.add(orb);

  pedGroup.position.set(0, 0, endZ + 4.2);
  scene.add(pedGroup);

  pedTop.userData = { type: 'pedestal' };
  orb.userData = { type: 'pedestal' };
  plaque.userData = { type: 'pedestal' };
  interactables.push(pedTop);
  interactables.push(orb);
  interactables.push(plaque);

  var pedShadowGeo = new THREE.PlaneGeometry(0.8, 0.8);
  var pedShadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.12,
    depthWrite: false
  });
  var pedShadow = new THREE.Mesh(pedShadowGeo, pedShadowMat);
  pedShadow.rotation.x = -Math.PI / 2;
  pedShadow.position.set(0, 0.003, endZ + 4.2);
  scene.add(pedShadow);

  buildGreyParticles(endZ);
}

function buildGreyParticles(endZ) {
  var count = 280;
  var positions = new Float32Array(count * 3);
  var startZ = greyZoneStartZ + 8;
  for (var i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * (CORRIDOR_WIDTH - 0.6);
    positions[i * 3 + 1] = 0.4 + Math.random() * (HALL_HEIGHT - 0.8);
    positions[i * 3 + 2] = startZ + Math.random() * (endZ - startZ - 6);
  }
  greyParticlesGeo = new THREE.BufferGeometry();
  greyParticlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  var pMat = new THREE.PointsMaterial({
    color: 0xffdfaa,
    size: 0.038,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  greyParticlesObj = new THREE.Points(greyParticlesGeo, pMat);
  scene.add(greyParticlesObj);
}

function loadTextureSafe(url, onSuccess, onError) {
  textureLoader.load(url, onSuccess, undefined, function () {
    if (url.indexOf('assets/') !== -1) {
      var altUrl = url.replace('assets/', '');
      textureLoader.load(altUrl, onSuccess, undefined, function () {
        if (onError) onError();
      });
    } else {
      if (onError) onError();
    }
  });
}

function updateTexturesByDistance(playerZ, time) {
  if (time - lastTexCheck < TEX_CHECK_MS) return;
  lastTexCheck = time;

  for (var i = 0; i < frameRegistry.length; i++) {
    var entry = frameRegistry[i];
    if (entry.item.isBlank) continue;

    var dist = Math.abs(playerZ - entry.zPos);

    if (dist < LOAD_DIST && !entry.textureLoaded) {
      entry.textureLoaded = true;
      (function (e) {
        loadTextureSafe(e.item.imageUrl, function (tex) {
          tex.generateMipmaps = false;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          if (e.textureLoaded) {
            e.photoMat.map = tex;
            e.photoMat.needsUpdate = true;
          } else {
            tex.dispose();
          }
        }, function () {
          e.textureLoaded = false;
        });
      })(entry);
    } else if (dist > UNLOAD_DIST && entry.textureLoaded) {
      if (entry.photoMat.map && entry.photoMat.map !== sharedPlaceholderTex) {
        entry.photoMat.map.dispose();
      }
      entry.photoMat.map = sharedPlaceholderTex.clone();
      entry.photoMat.needsUpdate = true;
      entry.textureLoaded = false;
    }
  }
}

function preloadInitialTextures() {
  return new Promise(function (resolve) {
    var toLoad = [];
    for (var i = 0; i < frameRegistry.length; i++) {
      if (!frameRegistry[i].item.isBlank) {
        toLoad.push(frameRegistry[i]);
        if (toLoad.length >= INITIAL_LOAD_COUNT) break;
      }
    }
    if (toLoad.length === 0) { resolve(); return; }
    var loaded = 0;
    var total = toLoad.length;
    toLoad.forEach(function (entry) {
      loadTextureSafe(entry.item.imageUrl, function (tex) {
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        entry.photoMat.map = tex;
        entry.photoMat.needsUpdate = true;
        entry.textureLoaded = true;
        loaded++;
        var pct = Math.round(45 + (loaded / total) * 55);
        $loadBar.style.width = pct + '%';
        $loadPercent.textContent = pct + '%';
        if (loaded >= total) resolve();
      }, function () {
        loaded++;
        if (loaded >= total) resolve();
      });
    });
  });
}

function setupDesktopControls() {
  document.addEventListener('keydown', function (e) {
    if (isModalOpen) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    moveState.forward  = true; break;
      case 'KeyS': case 'ArrowDown':  moveState.backward = true; break;
      case 'KeyA': case 'ArrowLeft':  moveState.left     = true; break;
      case 'KeyD': case 'ArrowRight': moveState.right    = true; break;
    }
  });

  document.addEventListener('keyup', function (e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    moveState.forward  = false; break;
      case 'KeyS': case 'ArrowDown':  moveState.backward = false; break;
      case 'KeyA': case 'ArrowLeft':  moveState.left     = false; break;
      case 'KeyD': case 'ArrowRight': moveState.right    = false; break;
    }
  });

  controls.addEventListener('lock', function () {
    isPointerLocked = true;
    $hud.classList.remove('hidden');
  });

  controls.addEventListener('unlock', function () {
    isPointerLocked = false;
  });

  renderer.domElement.addEventListener('click', function () {
    if (isModalOpen) return;
    if (!isPointerLocked) {
      controls.lock();
      return;
    }
    handleInteraction();
  });
}

function setupMobileControls() {
  $mobileCtrl.classList.remove('hidden');
  $hud.classList.remove('hidden');
  if ($crosshair) $crosshair.style.display = 'none';

  var jZone = document.getElementById('joystick-zone');
  var jThumb = document.getElementById('joystick-thumb');
  var lookZone = document.getElementById('touch-look-zone');
  var maxR = 48;

  jZone.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    joystickTouchId = t.identifier;
    joystickState.active = true;
    joystickState.startX = t.clientX;
    joystickState.startY = t.clientY;
    jThumb.classList.add('active');
  }, { passive: false });

  jZone.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier !== joystickTouchId) continue;
      var dx = t.clientX - joystickState.startX;
      var dy = t.clientY - joystickState.startY;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > maxR) { dx *= maxR / len; dy *= maxR / len; }
      joystickState.dx = dx / maxR;
      joystickState.dy = dy / maxR;
      jThumb.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
  }, { passive: false });

  var resetJoystick = function () {
    joystickTouchId = -1;
    joystickState.active = false;
    joystickState.dx = 0;
    joystickState.dy = 0;
    jThumb.style.transform = '';
    jThumb.classList.remove('active');
  };
  jZone.addEventListener('touchend', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) resetJoystick();
    }
  });
  jZone.addEventListener('touchcancel', resetJoystick);

  var touchStartTime = 0;
  var touchStartX = 0;
  var touchStartY = 0;
  var touchMoved = false;

  lookZone.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.changedTouches[0];
    touchLookState.active = true;
    touchLookState.id = t.identifier;
    touchLookState.prevX = t.clientX;
    touchLookState.prevY = t.clientY;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = performance.now();
    touchMoved = false;
  }, { passive: false });

  lookZone.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier !== touchLookState.id) continue;
      var dx = t.clientX - touchLookState.prevX;
      var dy = t.clientY - touchLookState.prevY;
      if (Math.abs(t.clientX - touchStartX) > 10 || Math.abs(t.clientY - touchStartY) > 10) {
        touchMoved = true;
      }
      touchLookState.prevX = t.clientX;
      touchLookState.prevY = t.clientY;
      cameraEuler.setFromQuaternion(camera.quaternion);
      cameraEuler.y -= dx * 0.0028;
      cameraEuler.x -= dy * 0.0028;
      cameraEuler.x = Math.max(-1.35, Math.min(1.35, cameraEuler.x));
      camera.quaternion.setFromEuler(cameraEuler);
    }
  }, { passive: false });

  lookZone.addEventListener('touchend', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === touchLookState.id) {
        var elapsed = performance.now() - touchStartTime;
        if (!touchMoved && elapsed < 350) {
          var screenX = (t.clientX / window.innerWidth) * 2 - 1;
          var screenY = -(t.clientY / window.innerHeight) * 2 + 1;
          handleInteraction(new THREE.Vector2(screenX, screenY));
        }
        touchLookState.active = false;
        touchLookState.id = -1;
      }
    }
  });

  lookZone.addEventListener('touchcancel', function () {
    touchLookState.active = false;
    touchLookState.id = -1;
  });

  lookZone.addEventListener('click', function () {
    handleInteraction();
  });

  $interactHint.addEventListener('click', function (e) {
    e.stopPropagation();
    handleInteraction();
  });
}

function handleInteraction(tapVec) {
  var coords = tapVec || new THREE.Vector2(0, 0);
  raycaster.setFromCamera(coords, camera);
  var hits = raycaster.intersectObjects(interactables, false);
  if (hits.length === 0 && tapVec) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    hits = raycaster.intersectObjects(interactables, false);
  }
  if (hits.length === 0) return;

  var data = hits[0].object.userData;
  if (!data || !data.type) return;

  if (data.type === 'photo') {
    openLightbox(data.item);
  } else if (data.type === 'blank') {
    openTextModal('', 'Bingkai Kosong', data.item.blankMessage);
  } else if (data.type === 'pedestal') {
    openTextModal(endingMessage.title, endingMessage.subtitle, endingMessage.body);
  }
}

function openLightbox(item) {
  isModalOpen = true;
  $lightboxImg.onerror = function () {
    if (this.src && this.src.indexOf('assets/') !== -1) {
      this.src = this.src.replace('assets/', '');
    }
  };
  $lightboxImg.src = item.imageUrl;
  $lightbox.classList.remove('hidden');
  if (!isMobile && controls) controls.unlock();
}

function closeLightbox() {
  $lightbox.classList.add('hidden');
  $lightboxImg.src = '';
  isModalOpen = false;
}

function openTextModal(title, sub, body) {
  isModalOpen = true;
  $modalTitle.textContent = title;
  $modalSub.textContent = sub;
  $modalText.textContent = body;
  $modalTitle.style.display = title ? '' : 'none';
  $modalSub.style.display = sub ? '' : 'none';
  $textModal.classList.remove('hidden');
  if (!isMobile && controls) controls.unlock();
}

function closeTextModal() {
  $textModal.classList.add('hidden');
  isModalOpen = false;
}

$lightboxClose.addEventListener('click', closeLightbox);
$lightbox.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
$modalClose.addEventListener('click', closeTextModal);
$textModal.querySelector('.modal-backdrop').addEventListener('click', closeTextModal);

document.addEventListener('keydown', function (e) {
  if (e.code === 'Escape') {
    if (!$lightbox.classList.contains('hidden')) closeLightbox();
    if (!$textModal.classList.contains('hidden')) closeTextModal();
  }
});

var jumpTargets = { start: 0, part1: -60, part2: -120, end: -190 };

function setupQuickJump() {
  jumpTargets.start = 0;
  jumpTargets.part1 = frameRegistry[27] ? frameRegistry[27].zPos : -60;
  jumpTargets.part2 = frameRegistry[55] ? frameRegistry[55].zPos : -120;
  jumpTargets.end = -hallLength + 14;

  $qjButtons.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var target = btn.dataset.target;
      var z = jumpTargets[target];
      if (z !== undefined) {
        teleportTarget = z;
        velocity.set(0, 0, 0);
      }
      if (!isMobile && controls && !isPointerLocked) {
        setTimeout(function () { controls.lock(); }, 100);
      }
    });
  });
}

function updateQuickJumpHighlight(playerZ) {
  var keys = ['start', 'part1', 'part2', 'end'];
  var closest = 'start';
  var minDist = Infinity;
  keys.forEach(function (k) {
    var d = Math.abs(playerZ - jumpTargets[k]);
    if (d < minDist) { minDist = d; closest = k; }
  });
  $qjButtons.forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.target === closest);
  });
}

function initBGM() {
  if (bgmAudio) return;
  try {
    bgmAudio = new Audio('assets/bgm.mp3');
    bgmAudio.loop = true;
    bgmAudio.volume = 0.35;
    var p = bgmAudio.play();
    if (p !== undefined) {
      p.catch(function () {
        try {
          bgmAudio = new Audio('assets/bgm.mp3.mp3');
          bgmAudio.loop = true;
          bgmAudio.volume = 0.35;
          bgmAudio.play().catch(function () {});
        } catch (e2) {}
      });
    }
  } catch (e) {}
}

function startAudioOnUserGesture() {
  if (!bgmAudio) {
    initBGM();
  } else if (bgmAudio.paused && !bgmMuted) {
    bgmAudio.play().catch(function () {});
  }
}

window.addEventListener('click', startAudioOnUserGesture, { once: false });
window.addEventListener('keydown', startAudioOnUserGesture, { once: false });
window.addEventListener('touchstart', startAudioOnUserGesture, { once: false });

$btnMute.addEventListener('click', function (e) {
  e.stopPropagation();
  bgmMuted = !bgmMuted;
  if (!bgmAudio) {
    initBGM();
  }
  if (bgmAudio) {
    bgmAudio.muted = bgmMuted;
    if (!bgmMuted && bgmAudio.paused) {
      bgmAudio.play().catch(function () {});
    }
  }
  $iconMuted.classList.toggle('hidden', !bgmMuted);
  $iconUnmuted.classList.toggle('hidden', bgmMuted);
});

function animate() {
  requestAnimationFrame(animate);

  var delta = Math.min(clock.getDelta(), 0.1);
  var time = performance.now();
  var speed = WALK_SPEED * delta;

  if (teleportTarget !== null) {
    var lerpFactor = Math.min(6.0 * delta, 0.2);
    camera.position.x += (0 - camera.position.x) * lerpFactor;
    camera.position.z += (teleportTarget - camera.position.z) * lerpFactor;
    if (Math.abs(camera.position.z - teleportTarget) < 0.25) {
      camera.position.z = teleportTarget;
      camera.position.x = 0;
      teleportTarget = null;
      velocity.set(0, 0, 0);
    }
  }

  var moveX = 0;
  var moveZ = 0;

  if (isMobile) {
    moveX = joystickState.dx;
    moveZ = joystickState.dy;
  } else {
    if (moveState.forward)  moveZ -= 1;
    if (moveState.backward) moveZ += 1;
    if (moveState.left)     moveX -= 1;
    if (moveState.right)    moveX += 1;
    if (moveX !== 0 && moveZ !== 0) {
      var invSqrt = 0.7071;
      moveX *= invSqrt;
      moveZ *= invSqrt;
    }
  }

  if (moveX !== 0 || moveZ !== 0) {
    teleportTarget = null;
  }

  var accelRate = 10 * delta;
  var decelRate = 6 * delta;
  velocity.x += (moveX * speed - velocity.x) * (moveX !== 0 ? accelRate : decelRate);
  velocity.z += (moveZ * speed - velocity.z) * (moveZ !== 0 ? accelRate : decelRate);
  if (Math.abs(velocity.x) < 0.00005) velocity.x = 0;
  if (Math.abs(velocity.z) < 0.00005) velocity.z = 0;

  if (teleportTarget === null) {
    if (isMobile) {
      var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      fwd.y = 0;
      fwd.normalize();
      var rgt = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      rgt.y = 0;
      rgt.normalize();
      camera.position.addScaledVector(fwd, -velocity.z);
      camera.position.addScaledVector(rgt, velocity.x);
    } else if (controls && isPointerLocked) {
      controls.moveRight(velocity.x);
      controls.moveForward(-velocity.z);
    }
  }

  var halfW = CORRIDOR_WIDTH / 2 - COLLISION_PAD;
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -halfW, halfW);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -hallLength + 3.2, 1.2);

  if (teleportTarget === null) {
    for (var bi = BENCH_INTERVAL; bi < totalItems; bi += BENCH_INTERVAL) {
      var benchZ = -(Math.floor(bi / 2) * FRAME_SPACING + FRAME_SPACING / 2 + 5);
      var overlapX = 1.05 - Math.abs(camera.position.x);
      var overlapZ = 0.55 - Math.abs(camera.position.z - benchZ);
      if (overlapX > 0 && overlapZ > 0) {
        if (overlapZ < overlapX) {
          camera.position.z = benchZ + (camera.position.z > benchZ ? 0.55 : -0.55);
        } else {
          camera.position.x = camera.position.x > 0 ? 1.05 : -1.05;
        }
      }
    }
  }

  var isMoving = Math.abs(velocity.x) > 0.0008 || Math.abs(velocity.z) > 0.0008;
  if (isMoving) {
    bobPhase += delta * 9;
    camera.position.y = PLAYER_HEIGHT + Math.sin(bobPhase) * 0.016;
  } else {
    camera.position.y += (PLAYER_HEIGHT - camera.position.y) * 5 * delta;
    bobPhase = 0;
  }

  var pZ = camera.position.z;
  for (var li = 0; li < LIGHT_POOL_SIZE; li++) {
    var offset = (li - (LIGHT_POOL_SIZE - 1) / 2) * 9;
    lightPool[li].position.z = pZ + offset;
    lightPool[li].position.x = ((li % 2) * 2 - 1) * 1.5;
  }

  updateTexturesByDistance(pZ, time);

  if (greyZoneStartZ < 0) {
    var greyEnd = -hallLength + 6;
    var greyRange = Math.abs(greyEnd - greyZoneStartZ);
    var greyProgress = THREE.MathUtils.clamp((greyZoneStartZ - pZ) / greyRange, 0, 1);
    var normalFogColor = new THREE.Color(0x11100f);
    var greyFogColor = new THREE.Color(0x726e6c);
    if (greyProgress > 0.01) {
      scene.fog.color.copy(normalFogColor).lerp(greyFogColor, greyProgress * 0.65);
      scene.background.copy(normalFogColor).lerp(greyFogColor, greyProgress * 0.32);
    } else {
      scene.fog.color.setHex(0x11100f);
      scene.background.setHex(0x11100f);
    }
  }

  if (greyParticlesObj && greyParticlesGeo) {
    var posArr = greyParticlesGeo.attributes.position.array;
    for (var pi = 0; pi < posArr.length; pi += 3) {
      posArr[pi + 1] += Math.sin(time * 0.0008 + pi * 0.5) * 0.0006;
      posArr[pi] += Math.cos(time * 0.0006 + pi * 0.3) * 0.0002;
    }
    greyParticlesGeo.attributes.position.needsUpdate = true;
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  var hits = raycaster.intersectObjects(interactables, false);
  if (hits.length > 0 && hits[0].object.userData && hits[0].object.userData.type) {
    if (!isMobile && isPointerLocked) {
      $crosshair.classList.add('active');
    }
    var uType = hits[0].object.userData.type;
    var actionWord = isMobile ? 'Tap' : 'Klik';
    if (uType === 'photo') {
      $interactText.textContent = actionWord + ' untuk melihat';
    } else {
      $interactText.textContent = actionWord + ' untuk membaca';
    }
    if ((!isMobile && isPointerLocked) || isMobile) {
      $interactHint.classList.remove('hidden');
    }
  } else {
    if ($crosshair) $crosshair.classList.remove('active');
    $interactHint.classList.add('hidden');
  }

  updateQuickJumpHighlight(pZ);

  renderer.render(scene, camera);
}

async function main() {
  initEngine();

  $loadBar.style.width = '10%';
  $loadPercent.textContent = '10%';

  initSharedMaterials();

  $loadBar.style.width = '18%';
  $loadPercent.textContent = '18%';

  buildMuseum();

  $loadBar.style.width = '30%';
  $loadPercent.textContent = '30%';

  placeAllFrames();

  $loadBar.style.width = '38%';
  $loadPercent.textContent = '38%';

  buildEndZone();

  $loadBar.style.width = '45%';
  $loadPercent.textContent = '45%';

  setupQuickJump();

  await preloadInitialTextures();

  $loading.classList.add('fade-out');
  await new Promise(function (r) { setTimeout(r, 900); });
  $loading.classList.add('hidden');
  $startScreen.classList.remove('hidden');

  if (isMobile) {
    setupMobileControls();
  } else {
    setupDesktopControls();
  }

  $btnEnter.addEventListener('click', function () {
    $startScreen.classList.add('hidden');
    if (!isMobile) {
      controls.lock();
    } else {
      $hud.classList.remove('hidden');
      if (window.innerWidth < window.innerHeight && $rotateHint) {
        $rotateHint.classList.remove('hidden');
      }
    }
    initBGM();
  });

  if ($rotateHint) {
    $rotateHint.addEventListener('click', function () {
      $rotateHint.classList.add('hidden');
    });
  }

  animate();
}

main();
