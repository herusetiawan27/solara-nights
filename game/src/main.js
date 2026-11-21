// Solara Nights — boot, input, third-person camera, screens and screenshots.
// ?seed=N fixes the world. ?shot=start|drive|chase|mission stages that scene
// instead of running the loop, paints it and sets window.__shotReady.
import * as THREE from '../vendor/three.module.js';
import { createCity } from './city.js';
import { createGame, SAVE_KEY } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
if (Number.isInteger(seedParam)) {
  let s = seedParam >>> 0;
  Math.random = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const city = createCity(scene);
const G = createGame(scene, city);
const hud = createHud();
const audio = createAudio();
const { S, player } = G;

// ---------- input ----------
const keys = {};
const input = { forward: false, back: false, left: false, right: false, run: false, jump: false, enter: false, shoot: false };
let camYaw = Math.PI; // behind the player (player faces +z at spawn heading 0)
let camPitch = 0.32;
let dragging = false;
let lastX = 0; let lastY = 0;
let enterPressed = false;
let jumpPressed = false;

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE' && !enterPressed) { enterPressed = true; input.enter = true; }
  if (e.code === 'Space') { jumpPressed = true; input.jump = true; e.preventDefault(); }
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') { const m = audio.toggleMute(); document.getElementById('mute-state').textContent = m ? 'MUTED' : ''; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyE') enterPressed = false;
  if (e.code === 'Space') jumpPressed = false;
});
canvas.addEventListener('mousedown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  if (S.mode === 'play') input.shoot = true;
});
window.addEventListener('mouseup', () => { dragging = false; input.shoot = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camYaw -= (e.clientX - lastX) * 0.005;
  camPitch = Math.max(0.08, Math.min(1.1, camPitch + (e.clientY - lastY) * 0.004));
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function readInput() {
  input.forward = !!(keys.KeyW || keys.ArrowUp);
  input.back = !!(keys.KeyS || keys.ArrowDown);
  input.left = !!(keys.KeyA || keys.ArrowLeft);
  input.right = !!(keys.KeyD || keys.ArrowRight);
  input.run = !!keys.ShiftLeft || !!keys.ShiftRight;
  input.jump = jumpPressed;
  jumpPressed = false;
  // player heading follows the camera when moving on foot
  if (player.onFoot && (input.forward || input.back || input.left || input.right)) {
    const fwd = input.forward ? 1 : input.back ? -1 : 0;
    const str = input.right ? 1 : input.left ? -1 : 0;
    player.heading = Math.atan2(
      Math.sin(camYaw) * fwd + Math.cos(camYaw) * str,
      Math.cos(camYaw) * fwd - Math.sin(camYaw) * str,
    );
  }
}

// ---------- camera ----------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const anchor = player.onFoot ? player.pos : (player.car ? player.car.pos : player.pos);
  const dist = player.onFoot ? 8.5 : 11;
  const height = player.onFoot ? 3.6 : 4.4;
  // ease the camera toward its target so it never snaps
  camTarget.lerp(new THREE.Vector3(anchor.x, anchor.y + 1.6, anchor.z), Math.min(1, dt * 8));
  const cx = camTarget.x - Math.sin(camYaw) * Math.cos(camPitch) * dist;
  const cz = camTarget.z - Math.cos(camYaw) * Math.cos(camPitch) * dist;
  const cy = camTarget.y + Math.sin(camPitch) * dist + height * 0.4;
  camera.position.set(cx, cy, cz);
  camera.lookAt(camTarget.x, camTarget.y + 0.6, camTarget.z);
}

// ---------- screens ----------
const $ = (id) => document.getElementById(id);
const screens = {
  title: $('screen-title'),
  pause: $('screen-pause'),
  busted: $('screen-busted'),
  complete: $('screen-complete'),
  hud: $('hud'),
};
function showScreen(name) {
  for (const k of Object.keys(screens)) screens[k].style.display = k === name || (name === 'play' && k === 'hud') ? 'block' : 'none';
  if (name === 'play') screens.hud.style.display = 'block';
}
function startGame(fresh) {
  audio.unlock();
  audio.startMusic();
  if (fresh) {
    G.resetAll();
  } else {
    const sv = G.loadSave();
    if (sv) G.applySave(sv);
    else G.resetAll();
  }
  S.mode = 'play';
  showScreen('play');
  $('status').textContent = 'Playing Solara Nights.';
}
function togglePause() {
  if (S.mode === 'play') { S.mode = 'paused'; showScreen('pause'); }
  else if (S.mode === 'paused') { S.mode = 'play'; showScreen('play'); }
}
function backToTitle() {
  G.saveGame();
  S.mode = 'title';
  showScreen('title');
  refreshTitle();
}
function refreshTitle() {
  const sv = G.loadSave();
  $('continue-btn').style.display = sv ? 'inline-block' : 'none';
  $('save-info').textContent = sv
    ? `Save found — $${(sv.cash || 0).toLocaleString('en-US')}, ${sv.missionIndex || 0} of 5 missions done.`
    : 'No save yet — a new story begins in Solara City.';
}
$('start-btn').addEventListener('click', () => { audio.click(); startGame(true); });
$('continue-btn').addEventListener('click', () => { audio.click(); startGame(false); });
$('resume-btn').addEventListener('click', () => { audio.click(); togglePause(); });
$('restart-btn').addEventListener('click', () => { audio.click(); startGame(true); });
$('quit-btn').addEventListener('click', () => { audio.click(); backToTitle(); });
$('respawn-btn').addEventListener('click', () => { audio.click(); G.respawn(); showScreen('play'); });
$('busted-title-btn').addEventListener('click', () => { audio.click(); backToTitle(); });
$('complete-btn').addEventListener('click', () => { audio.click(); backToTitle(); });
$('howto-btn').addEventListener('click', () => {
  audio.click();
  $('howto').style.display = $('howto').style.display === 'block' ? 'none' : 'block';
});

// ---------- screenshots ----------
function stageShot(name) {
  G.resetAll();
  S.mode = 'play';
  showScreen('play');
  const driveInput = { forward: true, back: false, left: false, right: false, run: false, jump: false, enter: false, shoot: false };
  const idleInput = { forward: false, back: false, left: false, right: false, run: false, jump: false, enter: false, shoot: false };
  if (name === 'drive' || name === 'play') {
    // steal the nearest car and drive down the avenue
    const car = G.nearestCar(60) || G.cars[0];
    G.enterCar(car);
    camYaw = car.heading + Math.PI;
    for (let i = 0; i < 60 * 4; i++) G.step(STEP, driveInput);
    camYaw = (player.car ? player.car.heading : 0) + Math.PI;
  } else if (name === 'chase') {
    const car = G.nearestCar(60) || G.cars[0];
    G.enterCar(car);
    G.addWanted(3, 'stealing a car');
    camYaw = (player.car ? player.car.heading : 0) + Math.PI;
    for (let i = 0; i < 60 * 5; i++) G.step(STEP, driveInput);
  } else if (name === 'mission') {
    // jump to mission 4: the warehouse shootout
    G.startMission(3);
    player.pos.set(G.landmarks.warehouse.x, 0, G.landmarks.warehouse.z + 26);
    player.heading = Math.atan2(G.landmarks.warehouse.x - player.pos.x, G.landmarks.warehouse.z - player.pos.z);
    camYaw = player.heading + Math.PI;
    for (let i = 0; i < 60 * 2; i++) G.step(STEP, idleInput);
  } else {
    // title: slow orbit over the city, player on foot by the garage
    camYaw = 0.8; camPitch = 0.5;
    for (let i = 0; i < 60 * 3; i++) G.step(STEP, idleInput);
    showScreen('title');
    refreshTitle();
  }
  updateCamera(1);
  renderer.render(scene, camera);
  hud.update(G);
  window.__shotReady = true;
}

// ---------- main loop ----------
let last = performance.now();
let acc = 0;
let sirenTimer = 0;
let prevWanted = 0;
let prevCash = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (S.mode === 'play') {
    readInput();
    acc += dt;
    while (acc >= STEP) {
      G.step(STEP, input);
      acc -= STEP;
      input.enter = false;
    }
    // audio cues on state changes
    if (S.wanted > prevWanted) audio.siren();
    if (S.cash > prevCash) audio.cash();
    prevWanted = S.wanted; prevCash = S.cash;
    sirenTimer -= dt;
    if (S.wanted > 0 && sirenTimer <= 0) { audio.siren(); sirenTimer = 3.5; }
    audio.engine(!player.onFoot && !!player.car, player.car ? Math.abs(player.car.speed) / 30 : 0);
    if (input.shoot && player.fireCooldown <= 0) audio.gunshot();
    updateCamera(dt);
    hud.update(G);
    if (S.mode === 'busted') {
      $('busted-reason').textContent = S.bustedReason || 'Busted';
      showScreen('busted');
      audio.busted();
    } else if (S.mode === 'complete') {
      $('complete-stats').textContent = `Cash $${S.cash.toLocaleString('en-US')} · ${S.kills} takedowns · ${S.carsStolen} cars stolen · ${Math.round(S.distanceDriven)} m driven`;
      showScreen('complete');
      audio.cash();
    }
  } else if (S.mode === 'title') {
    // slow cinematic orbit behind the title screen
    camYaw += dt * 0.05;
    updateCamera(dt);
  }
  renderer.render(scene, camera);
}

// ---------- boot ----------
window.__debug = () => ({
  mode: S.mode, onFoot: player.onFoot, hasCar: !!player.car,
  carHp: player.car ? player.car.hp : null, carSpeed: player.car ? player.car.speed : null,
  wanted: S.wanted, mission: S.missionIndex, missionStage: S.missionStage,
  pos: player.pos.toArray().map((v) => +v.toFixed(1)),
  cam: camera.position.toArray().map((v) => +v.toFixed(1)),
  calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
  canvas: [canvas.width, canvas.height],
  gl: !!renderer.getContext(),
});
refreshTitle();
showScreen('title');
$('status').textContent = 'Solara Nights. Press Start.';
if (shot) {
  // staged screenshot: paint twice, then signal readiness. Keep re-painting:
  // a viewport resize (e.g. a screenshot tool changing metrics) clears the
  // WebGL buffer, and in shot mode there is no game loop to repaint it.
  stageShot(shot);
  setInterval(() => renderer.render(scene, camera), 200);
  requestAnimationFrame(() => { renderer.render(scene, camera); window.__shotReady = true; });
} else {
  requestAnimationFrame(frame);
}
