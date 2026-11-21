// Solara Nights — core simulation: player on foot, cars, traffic, pedestrians,
// police and the wanted system, combat, and the five story missions.
// Pure logic + Three.js meshes; the renderer and HUD live in main.js / hud.js.
import * as THREE from '../vendor/three.module.js';
import { CITY, hitsBuilding, nearestRoad } from './city.js';

export const SAVE_KEY = 'solara-nights.save.v1';

const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0xecf0f1, 0x1a1a1a, 0x16a085, 0xd35400];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

/** A simple boxy car mesh with wheels, headlights and a brake light. */
export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.2), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), glassMat);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z);
    g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    h.position.set(x, 0.6, 2.12); g.add(h);
  }
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const x of [-0.6, 0.6]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), brakeMat);
    b.position.set(x, 0.6, -2.12); g.add(b);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.45, -0.2); g.add(bar);
    g.userData.lightBar = bar;
  }
  g.userData.wheels = wheels;
  return g;
}

/** A simple on-foot character: torso, head, legs that swing while walking. */
export function makePersonMesh(shirt, pants) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  head.position.y = 1.75; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.36), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  hair.position.y = 1.95; g.add(hair);
  const legGeo = new THREE.BoxGeometry(0.24, 0.75, 0.26);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.16, 0.38, 0); legL.geometry.translate(0, 0, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.16, 0.38, 0); g.add(legR);
  const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.2);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(armGeo, armMat); armL.position.set(-0.42, 1.15, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeo, armMat); armR.position.set(0.42, 1.15, 0); g.add(armR);
  g.userData = { legL, legR, armL, armR, walkPhase: 0 };
  return g;
}

export const MISSIONS = [
  {
    id: 1, title: 'First Wheels', giver: 'Mama Rosa',
    intro: 'Rico, welcome to Solara City. You need wheels before anything else. That sedan over there is unlocked — take it, and bring it to my garage. Don\'t scratch it.',
    objective: 'Steal a car (walk up and press E), then drive to Rosa\'s Garage',
    reward: 150,
  },
  {
    id: 2, title: 'The Package', giver: 'Mama Rosa',
    intro: 'A package is waiting at Solara Plaza. Pick it up on foot and deliver it to the docks warehouse. No cars this time — keep it quiet.',
    objective: 'Pick up the package at Solara Plaza, deliver it to the Docks Warehouse',
    reward: 250,
  },
  {
    id: 3, title: 'Hot Pursuit', giver: 'Mama Rosa',
    intro: 'The cops are onto you, Rico. They will come for you now — lose them. Drive fast, cut through the alleys, and stay out of their sight until the heat dies down.',
    objective: 'Lose a 2-star wanted level',
    reward: 300,
  },
  {
    id: 4, title: 'The Ambush', giver: 'Mama Rosa',
    intro: 'The Vipers set a trap at the warehouse. They brought guns — so do you. Take them all down and walk out alive.',
    objective: 'Defeat all 4 Viper gang members at the warehouse',
    reward: 450,
  },
  {
    id: 5, title: 'The Getaway', giver: 'Mama Rosa',
    intro: 'Last job, Rico. A yellow sports car is parked by the plaza. Take it to the docks while the whole city is after you. Pull this off and you\'re made in Solara City.',
    objective: 'Steal the yellow sports car and deliver it to the Docks (3-star wanted)',
    reward: 800,
  },
];

export function createGame(scene, city) {
  const { colliders, roadLines, landmarks } = city;
  const S = {
    time: 0,
    mode: 'title', // title | play | paused | busted | complete
    cash: 0,
    health: 100,
    wanted: 0,
    wantedTimer: 0,
    crimeTimer: 0,
    missionIndex: 0, // 0..4 active, 5 = all done
    missionStage: 0,
    missionMsg: '',
    dialog: null, // {name, text, until}
    bustedTimer: 0,
    bustedReason: '',
    kills: 0,
    carsStolen: 0,
    distanceDriven: 0,
    shotsFired: 0,
    flags: {},
  };

  // ---------- player ----------
  const player = {
    mesh: makePersonMesh(0x2e86c1, 0x2c3e50),
    pos: new THREE.Vector3(-66, 0, -52),
    heading: 0, // radians, facing direction
    speed: 0,
    onFoot: true,
    car: null,
    vy: 0, grounded: true,
    walkAnim: 0,
    fireCooldown: 0,
    ammo: 24,
    invuln: 0,
  };
  scene.add(player.mesh);

  // ---------- cars ----------
  const cars = [];
  function spawnCar(x, z, heading, color, opts = {}) {
    const mesh = makeCarMesh(color, !!opts.police);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      mesh, pos: new THREE.Vector3(x, 0, z), heading,
      speed: 0, maxSpeed: opts.maxSpeed ?? rand(16, 22),
      traffic: !!opts.traffic, police: !!opts.police,
      driver: opts.traffic ? 'npc' : null, // 'npc' | 'player' | null
      hp: 100, targetSpeed: 0, steer: 0,
      waypoint: null, stuck: 0, lightPhase: Math.random() * 10,
      dead: false,
    };
    cars.push(car);
    return car;
  }
  // parked + traffic cars
  const parkedSpots = [];
  for (let i = 0; i < 10; i++) {
    const road = roadLines[Math.floor(Math.random() * roadLines.length)];
    const along = rand(-110, 110);
    const x = road.axis === 'x' ? along : road.at + (Math.random() < 0.5 ? 4.2 : -4.2);
    const z = road.axis === 'x' ? road.at + (Math.random() < 0.5 ? 4.2 : -4.2) : along;
    if (hitsBuilding(colliders, x, z, 3.5)) continue;
    const heading = road.axis === 'x' ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI);
    const car = spawnCar(x, z, heading, CAR_COLORS[i % CAR_COLORS.length], { traffic: false });
    parkedSpots.push(car);
  }
  const trafficCars = [];
  for (let i = 0; i < 12; i++) {
    const road = roadLines[Math.floor(Math.random() * roadLines.length)];
    const along = rand(-120, 120);
    const x = road.axis === 'x' ? along : road.at + (Math.random() < 0.5 ? 2.6 : -2.6);
    const z = road.axis === 'x' ? road.at + (Math.random() < 0.5 ? 2.6 : -2.6) : along;
    if (hitsBuilding(colliders, x, z, 3.5)) continue;
    const heading = road.axis === 'x' ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI);
    const car = spawnCar(x, z, heading, CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], { traffic: true });
    car.road = road;
    trafficCars.push(car);
  }
  // the yellow sports car for mission 5, parked by the plaza
  const sportsCar = spawnCar(landmarks.plaza.x + 14, landmarks.plaza.z + 6, Math.PI / 2, 0xf1c40f, { maxSpeed: 34 });
  sportsCar.sports = true;

  // ---------- pedestrians ----------
  const peds = [];
  const pedShirts = [0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e, 0xe67e22];
  function spawnPed(x, z) {
    const mesh = makePersonMesh(pedShirts[Math.floor(Math.random() * pedShirts.length)], 0x333333);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const ped = { mesh, pos: new THREE.Vector3(x, 0, z), heading: rand(0, Math.PI * 2), speed: rand(1.2, 2.2), walkPhase: rand(0, 6), fleeing: 0, dead: false };
    peds.push(ped);
    return ped;
  }
  for (let i = 0; i < 26; i++) {
    const road = roadLines[Math.floor(Math.random() * roadLines.length)];
    const along = rand(-120, 120);
    const x = road.axis === 'x' ? along : road.at + (Math.random() < 0.5 ? 7.5 : -7.5);
    const z = road.axis === 'x' ? road.at + (Math.random() < 0.5 ? 7.5 : -7.5) : along;
    spawnPed(x, z);
  }

  // ---------- police ----------
  const police = []; // {car, officer mesh, state}
  function spawnPoliceCar() {
    const road = nearestRoad(roadLines, player.pos.x, player.pos.z);
    const along = clamp((road.axis === 'x' ? player.pos.x : player.pos.z) + (Math.random() < 0.5 ? -40 : 40), -120, 120);
    const x = road.axis === 'x' ? along : road.at + 2.6;
    const z = road.axis === 'x' ? road.at + 2.6 : along;
    const car = spawnCar(x, z, Math.atan2(player.pos.x - x, player.pos.z - z), 0x111111, { police: true, maxSpeed: 30 });
    car.police = true;
    const p = { kind: 'car', car, siren: 0 };
    police.push(p);
    return p;
  }
  function spawnOfficer() {
    const a = rand(0, Math.PI * 2);
    const x = player.pos.x + Math.cos(a) * 18;
    const z = player.pos.z + Math.sin(a) * 18;
    const mesh = makePersonMesh(0x1a3a6b, 0x1a1a2e);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const p = { kind: 'officer', mesh, pos: new THREE.Vector3(x, 0, z), heading: 0, bustTimer: 0 };
    police.push(p);
    return p;
  }

  // ---------- enemies (mission 4) ----------
  const enemies = [];
  function spawnEnemy(x, z) {
    const mesh = makePersonMesh(0x7a1f1f, 0x222222);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const e = { mesh, pos: new THREE.Vector3(x, 0, z), hp: 60, heading: 0, fireCooldown: rand(1, 2), dead: false, walkPhase: 0 };
    enemies.push(e);
    return e;
  }

  // ---------- mission markers ----------
  const markerGeo = new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.visible = false;
  scene.add(marker);
  const ringGeo = new THREE.RingGeometry(1.8, 2.6, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.visible = false;
  scene.add(ring);
  let markerTarget = null; // {x, z, radius}

  function setMarker(x, z, radius = 4) {
    markerTarget = { x, z, radius };
    marker.position.set(x, 15, z);
    ring.position.set(x, 0.06, z);
    marker.visible = ring.visible = true;
  }
  function clearMarker() { markerTarget = null; marker.visible = ring.visible = false; }

  function say(name, text, seconds = 5) {
    S.dialog = { name, text, until: S.time + seconds };
  }

  // ---------- missions ----------
  function startMission(i) {
    const m = MISSIONS[i];
    S.missionIndex = i; S.missionStage = 0;
    S.missionMsg = m.objective;
    say(m.giver, m.intro, 7);
    if (i === 0) {
      // nearest parked car is the target; marker on it
      let best = parkedSpots[0]; let bd = 1e9;
      for (const c of parkedSpots) { const d = dist2(c.pos.x, c.pos.z, player.pos.x, player.pos.z); if (d < bd) { bd = d; best = c; } }
      best.missionTarget = true;
      setMarker(best.pos.x, best.pos.z, 5);
    } else if (i === 1) {
      setMarker(landmarks.plaza.x, landmarks.plaza.z, 4);
    } else if (i === 2) {
      addWanted(2);
      clearMarker();
    } else if (i === 3) {
      const w = landmarks.warehouse;
      setMarker(w.x, w.z, 8);
      // Vipers wait in the open yard south of the warehouse, visible and reachable
      for (let k = 0; k < 4; k++) spawnEnemy(w.x - 12 + k * 8, w.z + 13 + (k % 2) * 3);
    } else if (i === 4) {
      setMarker(sportsCar.pos.x, sportsCar.pos.z, 5);
      sportsCar.missionTarget = true;
    }
  }

  function completeMission() {
    const m = MISSIONS[S.missionIndex];
    S.cash += m.reward;
    say('Mama Rosa', `Job done, Rico. $${m.reward} is yours. ${S.missionIndex < 4 ? 'Come see me for the next one.' : 'You did it. Solara City is yours now.'}`, 6);
    S.missionIndex++;
    clearMarker();
    if (S.missionIndex >= MISSIONS.length) {
      S.mode = 'complete';
      saveGame();
      return;
    }
    S.missionStage = 0;
    startMission(S.missionIndex);
  }

  function addWanted(n, reason) {
    const before = S.wanted;
    S.wanted = clamp(S.wanted + n, 0, 5);
    S.crimeTimer = 0;
    if (S.wanted > before && S.wanted >= 1) {
      say('Dispatch', `All units: suspect ${reason ?? 'committing a crime'} near downtown Solara. Wanted level ${S.wanted}.`, 4);
    }
  }

  // ---------- save / load ----------
  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: S.cash, missionIndex: S.missionIndex, kills: S.kills,
        carsStolen: S.carsStolen, distanceDriven: Math.round(S.distanceDriven),
      }));
    } catch { /* storage off */ }
  }
  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function applySave(sv) {
    S.cash = sv.cash || 0; S.kills = sv.kills || 0; S.carsStolen = sv.carsStolen || 0;
    S.distanceDriven = sv.distanceDriven || 0;
    S.missionIndex = clamp(sv.missionIndex || 0, 0, MISSIONS.length - 1);
    startMission(S.missionIndex);
  }

  // ---------- combat ----------
  const raycaster = new THREE.Raycaster();
  const tracerGeo = new THREE.BufferGeometry();
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8 });
  let tracer = null;
  let tracerUntil = 0;
  function shoot(from, dir) {
    S.shotsFired++;
    player.ammo--;
    raycaster.set(from, dir);
    raycaster.far = 120;
    const targets = [];
    for (const e of enemies) if (!e.dead) targets.push(e.mesh);
    for (const p of peds) if (!p.dead) targets.push(p.mesh);
    const hits = raycaster.intersectObjects(targets, true);
    let end = from.clone().addScaledVector(dir, 120);
    if (hits.length) {
      end = hits[0].point;
      const hitObj = hits[0].object;
      let owner = null;
      for (const e of enemies) if (!e.dead && e.mesh === hitObj.parent) owner = { kind: 'enemy', e };
      for (const p of peds) if (!p.dead && p.mesh === hitObj.parent) owner = { kind: 'ped', p };
      if (owner?.kind === 'enemy') {
        owner.e.hp -= 34;
        if (owner.e.hp <= 0) {
          owner.e.dead = true;
          owner.e.mesh.visible = false;
          S.kills++;
          addWanted(0);
        }
      } else if (owner?.kind === 'ped') {
        owner.p.dead = true;
        owner.p.mesh.visible = false;
        addWanted(1, 'shooting a pedestrian');
      }
    }
    if (tracer) scene.remove(tracer);
    tracerGeo.setFromPoints([from, end]);
    tracer = new THREE.Line(tracerGeo, tracerMat);
    scene.add(tracer);
    tracerUntil = S.time + 0.08;
    return !!hits.length;
  }

  // ---------- car entry / exit ----------
  function nearestCar(maxD) {
    let best = null; let bd = maxD * maxD;
    for (const c of cars) {
      if (c.dead || c.driver === 'player') continue;
      const d = dist2(c.pos.x, c.pos.z, player.pos.x, player.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function enterCar(car) {
    if (car.traffic && car.driver === 'npc') {
      // driver flees on foot
      const d = spawnPed(car.pos.x + 2, car.pos.z + 2);
      d.fleeing = 6;
      car.driver = 'player';
      addWanted(1, 'stealing a car');
      S.carsStolen++;
      say('Rico', 'This one\'s mine now.', 2);
    } else {
      car.driver = 'player';
      addWanted(1, 'stealing a parked car');
      S.carsStolen++;
      say('Rico', 'This one\'s mine now.', 2);
    }
    player.car = car;
    player.onFoot = false;
    player.mesh.visible = false;
  }
  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.driver = null;
    car.speed = 0;
    player.car = null;
    player.onFoot = true;
    player.mesh.visible = true;
    const a = car.heading + Math.PI / 2;
    player.pos.set(car.pos.x + Math.cos(a) * 2.4, 0, car.pos.z + Math.sin(a) * 2.4);
    player.heading = car.heading;
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
  }

  // ---------- per-frame updates ----------
  function stepPlayer(dt, input) {
    if (player.invuln > 0) player.invuln -= dt;
    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    if (player.onFoot) {
      const fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const run = input.run ? 1.7 : 1;
      const speed = 5.2 * run;
      const mx = Math.sin(player.heading) * fwd + Math.cos(player.heading) * strafe;
      const mz = Math.cos(player.heading) * fwd - Math.sin(player.heading) * strafe;
      const len = Math.hypot(mx, mz) || 1;
      const moving = fwd !== 0 || strafe !== 0;
      if (moving) {
        const nx = player.pos.x + (mx / len) * speed * dt;
        const nz = player.pos.z + (mz / len) * speed * dt;
        if (!hitsBuilding(colliders, nx, player.pos.z, 0.7)) player.pos.x = nx;
        if (!hitsBuilding(colliders, player.pos.x, nz, 0.7)) player.pos.z = nz;
        player.pos.x = clamp(player.pos.x, -130, 130);
        player.pos.z = clamp(player.pos.z, -130, 175);
        player.walkAnim += dt * speed * 1.6;
      }
      // jump
      if (input.jump && player.grounded) { player.vy = 7; player.grounded = false; }
      if (!player.grounded) {
        player.vy -= 22 * dt;
        player.pos.y += player.vy * dt;
        if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.grounded = true; }
      }
      player.mesh.position.copy(player.pos);
      player.mesh.rotation.y = player.heading;
      const u = player.mesh.userData;
      const swing = moving ? Math.sin(player.walkAnim) * 0.55 : 0;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
      // enter car
      if (input.enter) {
        const car = nearestCar(4);
        if (car) enterCar(car);
      }
      // shoot
      if (input.shoot && player.fireCooldown <= 0 && player.ammo > 0) {
        player.fireCooldown = 0.28;
        const from = player.pos.clone(); from.y = 1.5;
        const dir = new THREE.Vector3(Math.sin(player.heading), -0.02, Math.cos(player.heading));
        shoot(from, dir);
        if (S.wanted === 0) addWanted(1, 'firing a weapon in public');
      }
    } else if (player.car) {
      const car = player.car;
      const accel = input.forward ? 1 : input.back ? -0.7 : 0;
      const target = accel * car.maxSpeed;
      car.speed = lerp(car.speed, target, dt * (accel !== 0 ? 1.6 : 2.2));
      const steer = ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * 0.55 * clamp(Math.abs(car.speed) / 8, 0, 1);
      car.heading += steer * Math.sign(car.speed || 1) * dt * clamp(Math.abs(car.speed) / 6, 0.4, 1.4);
      const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
      if (hitsBuilding(colliders, nx, nz, 1.4)) {
        car.speed *= -0.25;
        car.hp -= 4;
        if (car.hp <= 0) { exitCar(); car.dead = true; car.mesh.visible = false; }
      } else {
        car.pos.x = nx; car.pos.z = nz;
        S.distanceDriven += Math.abs(car.speed) * dt;
      }
      car.pos.x = clamp(car.pos.x, -132, 132);
      car.pos.z = clamp(car.pos.z, -132, 178);
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      // running over pedestrians
      for (const p of peds) {
        if (p.dead || p.fleeing > 0) continue;
        if (Math.abs(car.speed) > 4 && dist2(p.pos.x, p.pos.z, car.pos.x, car.pos.z) < 4) {
          p.dead = true; p.mesh.visible = false;
          addWanted(1, 'running over a pedestrian');
        }
      }
      // player follows the car
      player.pos.copy(car.pos);
      if (input.enter) exitCar();
      if (input.shoot && player.fireCooldown <= 0) {
        player.fireCooldown = 0.4; // drive-by
        const from = car.pos.clone(); from.y = 1.4;
        const dir = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
        shoot(from, dir);
      }
    }
    if (tracer && S.time > tracerUntil) { scene.remove(tracer); tracer = null; }
  }

  function stepTraffic(dt) {
    for (const car of trafficCars) {
      if (car.dead || car.driver === 'player') continue;
      // follow its road; at the end of the road, turn onto a perpendicular one
      const road = car.road;
      const along = road.axis === 'x' ? car.pos.x : car.pos.z;
      if (along > road.to - 6 || along < road.from + 6) {
        const next = roadLines[Math.floor(Math.random() * roadLines.length)];
        car.road = next;
        const nx = next.axis === 'x' ? clamp(car.pos.x, -120, 120) : next.at + 2.6;
        const nz = next.axis === 'x' ? next.at + 2.6 : clamp(car.pos.z, -120, 120);
        car.pos.set(nx, 0, nz);
        car.heading = next.axis === 'x' ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI);
      }
      car.targetSpeed = 9;
      car.speed = lerp(car.speed, car.targetSpeed, dt);
      const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
      const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
      // stop for a car ahead
      let blocked = false;
      for (const other of cars) {
        if (other === car || other.dead) continue;
        const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
        const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
        if (ahead > 0 && ahead < 7 && Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading)) < 2.4) { blocked = true; break; }
      }
      if (!blocked && !hitsBuilding(colliders, nx, nz, 1.4)) {
        car.pos.x = nx; car.pos.z = nz;
      } else if (blocked) {
        car.speed = Math.max(0, car.speed - 20 * dt);
      }
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
    }
  }

  function stepPeds(dt) {
    for (const p of peds) {
      if (p.dead) continue;
      if (p.fleeing > 0) {
        p.fleeing -= dt;
        const dx = p.pos.x - player.pos.x, dz = p.pos.z - player.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        p.pos.x += (dx / len) * 4 * dt;
        p.pos.z += (dz / len) * 4 * dt;
      } else {
        // wander along sidewalks; turn at random
        if (Math.random() < dt * 0.15) p.heading += rand(-1.2, 1.2);
        const nx = p.pos.x + Math.sin(p.heading) * p.speed * dt;
        const nz = p.pos.z + Math.cos(p.heading) * p.speed * dt;
        if (!hitsBuilding(colliders, nx, nz, 0.7) && Math.abs(nx) < 128 && Math.abs(nz) < 128) {
          p.pos.x = nx; p.pos.z = nz;
        } else {
          p.heading += Math.PI / 2;
        }
        p.walkPhase += dt * 5;
      }
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = p.heading;
      const u = p.mesh.userData;
      const swing = Math.sin(p.walkPhase) * 0.5;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    }
  }

  function stepPolice(dt) {
    // desired police presence by wanted level
    const wantCars = S.wanted >= 3 ? 2 : S.wanted >= 1 ? 1 : 0;
    const wantOfficers = S.wanted >= 2 ? 2 : S.wanted >= 1 ? 1 : 0;
    const curCars = police.filter((p) => p.kind === 'car').length;
    const curOff = police.filter((p) => p.kind === 'officer').length;
    if (S.wanted > 0) {
      if (curCars < wantCars) spawnPoliceCar();
      if (curOff < wantOfficers) spawnOfficer();
    }
    for (let i = police.length - 1; i >= 0; i--) {
      const p = police[i];
      if (p.kind === 'car') {
        const car = p.car;
        if (car.dead) { police.splice(i, 1); continue; }
        p.siren += dt;
        const dx = player.pos.x - car.pos.x, dz = player.pos.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        const wantHeading = Math.atan2(dx, dz);
        let dh = wantHeading - car.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        car.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
        car.speed = lerp(car.speed, d > 6 ? car.maxSpeed : 6, dt * 1.2);
        const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
        const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
        if (!hitsBuilding(colliders, nx, nz, 1.4)) { car.pos.x = nx; car.pos.z = nz; }
        else car.speed *= 0.5;
        car.mesh.position.copy(car.pos);
        car.mesh.rotation.y = car.heading;
        const bar = car.mesh.userData.lightBar;
        if (bar) bar.material.color.setHex(Math.floor(p.siren * 4) % 2 === 0 ? 0x2244ff : 0xff2222);
        // ram the player's car
        if (!player.onFoot && player.car && d < 4.5) {
          player.car.hp -= 12 * dt;
          if (player.car.hp <= 0) { exitCar(); }
        }
        // despawn far police when wanted is gone
        if (S.wanted === 0 && d > 90) {
          scene.remove(car.mesh); car.dead = true;
          police.splice(i, 1);
        }
      } else {
        const dx = player.pos.x - p.pos.x, dz = player.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        p.heading = Math.atan2(dx, dz);
        if (d > 2.2) {
          const sp = 5.6;
          const nx = p.pos.x + Math.sin(p.heading) * sp * dt;
          const nz = p.pos.z + Math.cos(p.heading) * sp * dt;
          if (!hitsBuilding(colliders, nx, nz, 0.7)) { p.pos.x = nx; p.pos.z = nz; }
        } else {
          // busting the player
          p.bustTimer += dt;
          if (p.bustTimer > 1.4 && S.mode === 'play') {
            S.mode = 'busted';
            S.bustedReason = 'Busted by the Solara PD';
            const fine = Math.min(S.cash, 100);
            S.cash -= fine;
            saveGame();
          }
        }
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.y = p.heading;
        if (S.wanted === 0 && d > 90) { scene.remove(p.mesh); police.splice(i, 1); }
      }
    }
    // wanted decay: no crime and no police close for a while
    if (S.wanted > 0) {
      S.crimeTimer += dt;
      const nearPolice = police.some((p) => {
        const px = p.kind === 'car' ? p.car.pos.x : p.pos.x;
        const pz = p.kind === 'car' ? p.car.pos.z : p.pos.z;
        return dist2(px, pz, player.pos.x, player.pos.z) < 45 * 45;
      });
      if (!nearPolice && S.crimeTimer > 18) {
        S.wanted--;
        S.crimeTimer = 0;
        if (S.wanted === 0) say('Dispatch', 'Suspect lost. All units stand down.', 4);
      }
    }
  }

  function stepEnemies(dt) {
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      e.fireCooldown -= dt;
      if (d < 26 && d > 5) {
        const nx = e.pos.x + Math.sin(e.heading) * 3.4 * dt;
        const nz = e.pos.z + Math.cos(e.heading) * 3.4 * dt;
        if (!hitsBuilding(colliders, nx, nz, 0.7)) { e.pos.x = nx; e.pos.z = nz; }
      }
      if (d < 30 && e.fireCooldown <= 0 && player.invuln <= 0) {
        e.fireCooldown = rand(1.2, 2.2);
        if (Math.random() < 0.45) {
          S.health -= 8;
          player.invuln = 0.5;
          if (S.health <= 0) {
            S.health = 0;
            S.mode = 'busted';
            S.bustedReason = 'Wasted by the Vipers';
            saveGame();
          }
        }
      }
      e.walkPhase += dt * 5;
      e.mesh.position.copy(e.pos);
      e.mesh.rotation.y = e.heading;
      const u = e.mesh.userData;
      const swing = Math.sin(e.walkPhase) * 0.4;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
    }
  }

  function stepMissions(dt) {
    if (S.missionIndex >= MISSIONS.length) return;
    const m = MISSIONS[S.missionIndex];
    const at = (x, z, r) => dist2(player.pos.x, player.pos.z, x, z) < r * r;
    if (m.id === 1) {
      if (S.missionStage === 0 && !player.onFoot) {
        S.missionStage = 1;
        setMarker(landmarks.garage.x, landmarks.garage.z, 6);
        S.missionMsg = 'Drive to Rosa\'s Garage';
      } else if (S.missionStage === 1 && player.car && at(landmarks.garage.x, landmarks.garage.z, 7)) {
        completeMission();
      }
    } else if (m.id === 2) {
      if (S.missionStage === 0 && at(landmarks.plaza.x, landmarks.plaza.z, 5)) {
        S.missionStage = 1;
        setMarker(landmarks.warehouse.x, landmarks.warehouse.z, 6);
        S.missionMsg = 'Deliver the package to the Docks Warehouse';
        say('Rico', 'Got the package. Now to the warehouse.', 3);
      } else if (S.missionStage === 1 && at(landmarks.warehouse.x, landmarks.warehouse.z, 7)) {
        completeMission();
      }
    } else if (m.id === 3) {
      if (S.wanted === 0 && S.missionStage === 0) {
        // wanted was set at mission start; reaching 0 completes it
        completeMission();
      }
    } else if (m.id === 4) {
      if (enemies.length > 0 && enemies.every((e) => e.dead)) completeMission();
    } else if (m.id === 5) {
      if (S.missionStage === 0 && player.car === sportsCar) {
        S.missionStage = 1;
        addWanted(3, 'stealing a sports car');
        setMarker(landmarks.docks.x, landmarks.docks.z, 7);
        S.missionMsg = 'Deliver the sports car to the Docks — lose the cops on the way';
      } else if (S.missionStage === 1 && player.car === sportsCar && at(landmarks.docks.x, landmarks.docks.z, 8)) {
        completeMission();
      }
    }
    if (S.health < 100) S.health = Math.min(100, S.health + 1.2 * dt); // slow regen
  }

  function step(dt, input) {
    S.time += dt;
    if (S.mode !== 'play') return;
    if (S.dialog && S.time > S.dialog.until) S.dialog = null;
    if (marker.visible) marker.rotation.y += dt * 0.8;
    stepPlayer(dt, input);
    stepTraffic(dt);
    stepPeds(dt);
    stepPolice(dt);
    stepEnemies(dt);
    stepMissions(dt);
    if (S.mode === 'play' && S.time % 10 < dt) saveGame(); // autosave
  }

  function respawn() {
    S.health = 100;
    S.wanted = 0;
    S.crimeTimer = 0;
    for (const p of [...police]) {
      if (p.kind === 'car') { scene.remove(p.car.mesh); p.car.dead = true; }
      else scene.remove(p.mesh);
    }
    police.length = 0;
    if (!player.onFoot) exitCar();
    player.pos.set(landmarks.garage.x, 0, landmarks.garage.z + 12);
    player.heading = 0;
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = 0;
    S.mode = 'play';
    say('Mama Rosa', 'You\'re out. Don\'t make me bail you out again, Rico.', 5);
  }

  function resetAll() {
    S.cash = 0; S.health = 100; S.wanted = 0; S.kills = 0; S.carsStolen = 0; S.distanceDriven = 0;
    S.missionIndex = 0; S.missionStage = 0;
    player.pos.set(-66, 0, -52); player.heading = 0; player.onFoot = true; player.car = null; player.ammo = 24;
    player.mesh.visible = true; player.mesh.position.copy(player.pos);
    startMission(0);
  }

  return {
    S, player, cars, trafficCars, peds, police, enemies, sportsCar, parkedSpots,
    landmarks, markerTarget: () => markerTarget,
    step, startMission, completeMission, addWanted, saveGame, loadSave, applySave,
    respawn, resetAll, enterCar, exitCar, nearestCar, say,
  };
}
