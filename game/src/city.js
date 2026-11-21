// Solara City — a sun-soaked procedural city for "Solara Nights".
// Grid of blocks separated by roads, a beach and ocean to the south,
// downtown towers in the middle, palm trees, streetlights and props.
// All geometry is generated from a seed, so the city is identical every run.
import * as THREE from '../vendor/three.module.js';

export const CITY = {
  half: 132,          // city extends -132..132 on x and z (beach beyond +z)
  block: 44,          // block pitch
  road: 11,           // road width
  beachZ: 132,        // sand starts here
  waterZ: 158,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A window texture drawn on a canvas — cheap, pretty, no image files. */
function buildingTexture(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  // subtle vertical shading
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  for (let y = 14; y < 246; y += 22) {
    for (let x = 10; x < 118; x += 20) {
      const on = rng() < (lit ? 0.55 : 0.28);
      g.fillStyle = on ? '#ffd98a' : (rng() < 0.5 ? '#2b3a4d' : '#1d2836');
      g.fillRect(x, y, 13, 14);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#33363d'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f5d76e';
  g.fillRect(62, 0, 4, 128);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let y = 0; y < 128; y += 32) g.fillRect(10, y, 3, 18), g.fillRect(115, y, 3, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene) {
  const rng = mulberry32(20261121);
  const colliders = []; // {x, z, hw, hd} axis-aligned building footprints
  const roadLines = []; // road centre lines for traffic/ped routing: {axis:'x'|'z', at, from, to}
  const group = new THREE.Group();
  scene.add(group);

  // ---- sky, sun, fog ----
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8ea, 220, 520);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 500;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));

  // ---- ground: grass/concrete base, roads, beach, ocean ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: 0x7d9b6a }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
  group.add(ground);

  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadMatZ = roadMat.clone();
  const half = CITY.half;
  for (let i = -3; i <= 3; i++) {
    const at = i * CITY.block;
    // east-west road (along x)
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 60, CITY.road), roadMat);
    rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0, at);
    rx.material.map = roadTex.clone(); rx.material.map.repeat.set(24, 1); rx.material.map.needsUpdate = true;
    group.add(rx);
    roadLines.push({ axis: 'x', at, from: -half - 20, to: half + 20 });
    // north-south road (along z)
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, half * 2 + 60), roadMatZ);
    rz.rotation.x = -Math.PI / 2; rz.position.set(at, 0, 0);
    rz.material.map = roadTex.clone(); rz.material.map.repeat.set(1, 24); rz.material.map.needsUpdate = true;
    group.add(rz);
    roadLines.push({ axis: 'z', at, from: -half - 20, to: half + 20 });
  }
  // sidewalks: lighter strips along every road
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  for (let i = -3; i <= 3; i++) {
    const at = i * CITY.block;
    for (const off of [-7.5, 7.5]) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 60, 3.4), walkMat);
      a.rotation.x = -Math.PI / 2; a.position.set(0, 0.01, at + off); group.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(3.4, half * 2 + 60), walkMat);
      b.rotation.x = -Math.PI / 2; b.position.set(at + off, 0.01, 0); group.add(b);
    }
  }
  // beach + ocean to the south (+z)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(700, 70), new THREE.MeshLambertMaterial({ color: 0xe8d29a }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, CITY.beachZ + 35);
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 220),
    new THREE.MeshLambertMaterial({ color: 0x2a7fa8, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.05, CITY.waterZ + 110);
  group.add(water);

  // ---- buildings ----
  const palette = ['#c96f4a', '#d8a35a', '#7fa3b8', '#b8a88f', '#8fa3a0', '#c9b458', '#a87fa3', '#e0e0d8', '#5a7fa3'];
  const textures = palette.map((c) => buildingTexture(rng, c, rng() < 0.5));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  let buildingCount = 0;
  for (let bx = -3; bx <= 2; bx++) {
    for (let bz = -3; bz <= 2; bz++) {
      const cx = bx * CITY.block + CITY.block / 2;
      const cz = bz * CITY.block + CITY.block / 2;
      const dist = Math.hypot(cx, cz);
      const downtown = dist < 55;
      const n = downtown ? (rng() < 0.5 ? 1 : 2) : (rng() < 0.6 ? 2 : 3);
      for (let k = 0; k < n; k++) {
        const w = 12 + rng() * 12;
        const d = 12 + rng() * 12;
        const h = downtown ? 26 + rng() * 42 : 8 + rng() * 18;
        const x = cx + (rng() - 0.5) * (CITY.block - CITY.road - w - 4);
        const z = cz + (rng() - 0.5) * (CITY.block - CITY.road - d - 4);
        const mat = new THREE.MeshLambertMaterial({ map: textures[Math.floor(rng() * textures.length)] });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(x, 0, z);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), roofMat);
        roof.position.set(x, h, z); group.add(roof);
        colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
        buildingCount++;
      }
    }
  }

  // ---- landmarks: Rosa's garage (mission hub), the docks warehouse, the pier ----
  const landmarks = {};
  function landmark(name, x, z, w, h, d, color) {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color }));
    m.scale.set(w, h, d); m.position.set(x, 0, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
    landmarks[name] = { x, z };
    return m;
  }
  landmark('garage', -66, -66, 26, 9, 18, 0xd86a3a);   // Rosa's Garage, NW block
  landmark('warehouse', 66, -66, 30, 12, 20, 0x6a7a8a); // Docks warehouse, NE block
  landmark('docks', 66, 110, 22, 8, 16, 0x8a6a4a);      // Docks drop-off, SE block
  landmark('plaza', -66, 66, 20, 14, 20, 0xc9b458);     // Solara Plaza, SW block

  // ---- palms, streetlights, props ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const palmTrunk = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const palmLeaf = new THREE.ConeGeometry(2.2, 2.4, 6);
  const lampPole = new THREE.CylinderGeometry(0.12, 0.12, 7, 6);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const lampHead = new THREE.SphereGeometry(0.5, 8, 6);
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < 90; i++) {
    const x = (rng() * 2 - 1) * (half - 8);
    const z = (rng() * 2 - 1) * (half - 8);
    if (Math.abs(x % CITY.block) < 9 || Math.abs(z % CITY.block) < 9) continue; // keep off roads
    const palm = new THREE.Group();
    const t = new THREE.Mesh(palmTrunk, trunkMat); t.position.y = 3; t.castShadow = true;
    const l = new THREE.Mesh(palmLeaf, leafMat); l.position.y = 7; l.castShadow = true;
    palm.add(t, l);
    palm.position.set(x, 0, z);
    group.add(palm);
  }
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      const x = i * CITY.block + 8;
      const z = j * CITY.block + 8;
      const pole = new THREE.Mesh(lampPole, lampMat); pole.position.set(x, 3.5, z); group.add(pole);
      const head = new THREE.Mesh(lampHead, lampGlow); head.position.set(x, 7.2, z); group.add(head);
    }
  }
  // beach umbrellas
  const umbMat = new THREE.MeshLambertMaterial({ color: 0xe85a5a });
  for (let i = 0; i < 8; i++) {
    const x = -120 + i * 34 + rng() * 10;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3, 1.6, 8), umbMat);
    cone.position.set(x, 2.4, CITY.beachZ + 18 + rng() * 20);
    group.add(cone);
  }

  // ---- clouds ----
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 10; i++) {
    const cl = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(6 + rng() * 6, 8, 6), cloudMat);
      s.position.set(k * 8 - 8, rng() * 2, rng() * 4);
      s.scale.y = 0.45;
      cl.add(s);
    }
    cl.position.set((rng() * 2 - 1) * 220, 90 + rng() * 30, (rng() * 2 - 1) * 220);
    group.add(cl);
  }

  return { group, colliders, roadLines, landmarks, rng };
}

/** True when point (x,z) with radius r hits a building. */
export function hitsBuilding(colliders, x, z, r = 0.8) {
  for (const c of colliders) {
    if (Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r) return true;
  }
  return false;
}

/** Nearest road centre line to (x,z), for traffic routing. */
export function nearestRoad(roadLines, x, z) {
  let best = null; let bd = 1e9;
  for (const r of roadLines) {
    const d = r.axis === 'x' ? Math.abs(z - r.at) : Math.abs(x - r.at);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
