// HUD: wanted stars, cash, health, speed, mission tracker, dialogs, minimap.
// The minimap is a 2D canvas drawn top-down: roads, buildings, player, cars,
// police, mission marker. All DOM lives in index.html.
import { MISSIONS } from './game.js';
import { CITY } from './city.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const starsEl = el('wanted');
  const cashEl = el('cash');
  const healthEl = el('health-fill');
  const healthText = el('health-text');
  const speedEl = el('speed');
  const missionEl = el('mission');
  const dialogEl = el('dialog');
  const dialogName = el('dialog-name');
  const dialogText = el('dialog-text');
  const hintEl = el('hint');
  const map = el('minimap');
  const mctx = map.getContext('2d');

  function drawMinimap(G) {
    const { S, player, cars, peds, police, enemies, landmarks } = G;
    const W = map.width, H = map.height;
    const scale = W / (CITY.half * 2 + 60);
    const toX = (x) => (x + CITY.half + 30) * scale;
    const toY = (z) => (z + CITY.half + 30) * scale;
    mctx.fillStyle = '#1d2b1f';
    mctx.fillRect(0, 0, W, H);
    // roads
    mctx.strokeStyle = '#4a4a52';
    mctx.lineWidth = Math.max(2, 11 * scale);
    for (let i = -3; i <= 3; i++) {
      const at = i * CITY.block;
      mctx.beginPath(); mctx.moveTo(toX(-CITY.half - 30), toY(at)); mctx.lineTo(toX(CITY.half + 30), toY(at)); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(toX(at), toY(-CITY.half - 30)); mctx.lineTo(toX(at), toY(CITY.half + 30)); mctx.stroke();
    }
    // beach
    mctx.fillStyle = '#e8d29a';
    mctx.fillRect(0, toY(CITY.beachZ), W, H - toY(CITY.beachZ));
    mctx.fillStyle = '#2a7fa8';
    mctx.fillRect(0, toY(CITY.waterZ), W, H - toY(CITY.waterZ));
    // landmarks
    mctx.fillStyle = '#f1c40f';
    for (const k of Object.keys(landmarks)) {
      mctx.beginPath(); mctx.arc(toX(landmarks[k].x), toY(landmarks[k].z), 3, 0, Math.PI * 2); mctx.fill();
    }
    // mission marker
    const mt = G.markerTarget();
    if (mt) {
      mctx.fillStyle = '#ffdd33';
      mctx.beginPath(); mctx.arc(toX(mt.x), toY(mt.z), 5, 0, Math.PI * 2); mctx.fill();
      mctx.strokeStyle = '#ffdd33'; mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.arc(toX(mt.x), toY(mt.z), 8 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2); mctx.stroke();
    }
    // cars
    for (const c of cars) {
      if (c.dead) continue;
      mctx.fillStyle = c.police ? '#4466ff' : '#dddddd';
      mctx.fillRect(toX(c.pos.x) - 2, toY(c.pos.z) - 2, 4, 4);
    }
    // enemies
    for (const e of enemies) {
      if (e.dead) continue;
      mctx.fillStyle = '#ff3333';
      mctx.beginPath(); mctx.arc(toX(e.pos.x), toY(e.pos.z), 3, 0, Math.PI * 2); mctx.fill();
    }
    // police officers
    for (const p of police) {
      if (p.kind !== 'officer') continue;
      mctx.fillStyle = '#4466ff';
      mctx.beginPath(); mctx.arc(toX(p.pos.x), toY(p.pos.z), 3, 0, Math.PI * 2); mctx.fill();
    }
    // player arrow
    const px = toX(player.pos.x), py = toY(player.pos.z);
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(Math.atan2(Math.sin(player.heading), Math.cos(player.heading)) + Math.PI);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4, 5); mctx.lineTo(-4, 5); mctx.closePath(); mctx.fill();
    mctx.restore();
    // view frame
    mctx.strokeStyle = 'rgba(255,255,255,0.5)';
    mctx.lineWidth = 1;
    mctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  function update(G, fps) {
    const { S, player } = G;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < S.wanted ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.style.color = S.wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    cashEl.textContent = `$${S.cash.toLocaleString('en-US')}`;
    healthEl.style.width = `${Math.max(0, S.health)}%`;
    healthEl.style.background = S.health > 50 ? '#2ecc71' : S.health > 25 ? '#f39c12' : '#e74c3c';
    healthText.textContent = `HP ${Math.ceil(S.health)}`;
    const speed = player.car ? Math.abs(player.car.speed) * 3.6 : 0;
    speedEl.textContent = player.car ? `${Math.round(speed)} km/h` : (player.onFoot ? 'ON FOOT' : '');
    if (S.missionIndex < MISSIONS.length) {
      const m = MISSIONS[S.missionIndex];
      missionEl.innerHTML = `<b>${m.id}. ${m.title}</b><br>${S.missionMsg || m.objective}`;
    } else {
      missionEl.innerHTML = '<b>Story complete</b><br>Free roam — Solara City is yours.';
    }
    if (S.dialog && S.time < S.dialog.until) {
      dialogEl.style.display = 'block';
      dialogName.textContent = S.dialog.name;
      dialogText.textContent = S.dialog.text;
    } else {
      dialogEl.style.display = 'none';
    }
    const hints = [];
    if (player.onFoot) {
      hints.push('WASD move · Shift run · Space jump · E enter car · Click shoot');
      if (player.ammo !== undefined) hints.push(`Ammo ${player.ammo}`);
    } else {
      hints.push('W/S drive · A/D steer · E exit car · Click drive-by · Space handbrake');
    }
    hints.push('P pause · M mute');
    hintEl.textContent = hints.join('   ');
    drawMinimap(G);
  }

  return { update };
}
