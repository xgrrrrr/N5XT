/* ═══════════════════════════════════════════════════════════
   STICKMAN DUEL — JS Frontend
   ───────────────────────────────────────────────────────────
   Served by Apache (XAMPP) on port 80
   Talks to Java game server on port 9090
   ───────────────────────────────────────────────────────────
   Java handles: physics, AI, combat, rounds, stats
   JS handles:   input, canvas rendering, menus, UI
═══════════════════════════════════════════════════════════ */
;(function () {
'use strict';

/* ── Java API base URL (always port 9090) ── */
const JAVA_PORT = 9090;
const API = 'http://' + window.location.hostname + ':' + JAVA_PORT + '/api';
console.log('[StickmanDuel] Java API:', API);

/* ── Weapon definitions mirrored from Java (for UI only) ── */
const WEAPONS = [
  {id:'SWORD',  icon:'⚔️',  name:'SWORD',  type:'Balanced', dmg:22, spd:8,  range:92,  def:5,  col:'#00f5d4', desc:'Balanced speed and power. Hits once per swing.'},
  {id:'HAMMER', icon:'🔨',  name:'HAMMER', type:'Power',    dmg:42, spd:3,  range:76,  def:8,  col:'#ff8800', desc:'Massive damage. Stuns enemy for 40 frames. Very slow.'},
  {id:'AXE',    icon:'🪓',  name:'AXE',    type:'Guard Break',dmg:32,spd:5, range:86,  def:6,  col:'#ff4400', desc:'Ignores 40% of enemy blocks. Stuns 18 frames.'},
  {id:'SPEAR',  icon:'🗡️',  name:'SPEAR',  type:'Reach',    dmg:20, spd:7,  range:145, def:3,  col:'#ffd60a', desc:'Longest reach of any weapon. Strike from far away.'},
  {id:'DAGGER', icon:'🗡️',  name:'DAGGER', type:'Speed',   dmg:11, spd:14, range:55,  def:2,  col:'#ff006e', desc:'Triple hit per attack. Fastest weapon in the game.'},
  {id:'SHIELD', icon:'🛡️',  name:'SHIELD', type:'Defense', dmg:14, spd:5,  range:70,  def:20, col:'#00e660', desc:'80% block reduction. Best defense. Low damage.'},
  {id:'KATANA', icon:'⚔️',  name:'KATANA', type:'Swift',   dmg:28, spd:11, range:96,  def:4,  col:'#88ccff', desc:'Double hit per attack. Fast and powerful.'},
  {id:'CLUB',   icon:'🏏',  name:'CLUB',   type:'Brutal',  dmg:35, spd:4,  range:80,  def:5,  col:'#cc8844', desc:'Huge knockback every swing. Sends enemies flying.'},
];

/* ── canvas ── */
const canvas = document.getElementById('fightCanvas');
const ctx    = canvas.getContext('2d');
let CW = 800, CH = 440;

/* ── state ── */
let vsAI       = true;
let aiDifficulty = 'medium'; // easy | medium | hard | extreme
let pickStep = 0;
let w1sel   = null;
let w2sel   = null;
let selW    = null;
let curScreen = 'menu';
let gameState = null;        // latest state from Java
let screenShake = { x: 0, y: 0, dur: 0, mag: 0 };
const _prevHp = { A: 100, B: 100 };
let serverOnline = false;
let bossActive    = false;
let _bossRiseTick = 0;
const _dashTrails = {A:[], B:[]};  // afterimage trail for dash

/* ── intervals ── */
let pollId     = null;   // state polling
let keyPollId  = null;   // key sending
let retryId    = null;   // server reconnect
/* ── Projectile System ── */
const projectiles = [];   // {x,y,vx,vy,life,col,type,damage,owner,w,h}
const weaponEffects = []; // {x,y,life,type,col,r,vx,vy}

function spawnArrow(fx, fy, facing, col, damage) {
  const speed = 18;
  projectiles.push({
    x: fx, y: fy,
    vx: facing * speed,
    vy: -1,
    life: 1.0,
    col: col,
    type: 'arrow',
    damage: damage,
    owner: facing,
    w: 28, h: 3,
    hit: false,
    trail: []
  });
}

function spawnMagicBolt(fx, fy, facing, col, damage) {
  projectiles.push({
    x: fx, y: fy,
    vx: facing * 14,
    vy: 0,
    life: 1.0,
    col: col,
    type: 'bolt',
    damage: damage,
    owner: facing,
    w: 18, h: 8,
    hit: false,
    trail: [],
    wobble: 0
  });
}

function updateProjectiles(s) {
  if (!s || !s.P1 || !s.P2) { projectiles.length = 0; return; }
  const scX = CW / (s.worldW || 800);
  const scY = CH / (s.worldH || 500);

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.hit) { projectiles.splice(i, 1); continue; }

    // Store trail
    p.trail.push({x: p.x, y: p.y});
    if (p.trail.length > 8) p.trail.shift();

    // Move
    p.x += p.vx;
    p.vy += 0.18; // gravity on arrow
    if (p.type === 'bolt') p.vy = Math.sin(p.wobble) * 1.5; // magic wobble
    p.y += p.vy;
    if (p.type === 'bolt') p.wobble += 0.25;

    p.life -= 0.012;

    // Hit check against fighters (world coords)
    const targets = [s.P1, s.P2].filter(f => f && f.hp > 0 && Math.sign(f.facing) !== p.owner);
    for (const f of targets) {
      const dx = Math.abs(f.x - p.x / scX);
      const dy = Math.abs(f.y - p.y / scY);
      if (dx < 22 && dy < 30) {
        p.hit = true;
        // Spawn hit explosion
        const col = p.col;
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 4;
          weaponEffects.push({
            x: p.x, y: p.y,
            vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 1,
            life: 1.0, col, r: 2 + Math.random()*3, type: 'spark'
          });
        }
        break;
      }
    }

    // Out of bounds
    if (p.x < 0 || p.x > CW || p.y > CH + 20 || p.life <= 0) {
      projectiles.splice(i, 1);
    }
  }

  // Update effects
  for (let i = weaponEffects.length - 1; i >= 0; i--) {
    const e = weaponEffects[i];
    e.x += e.vx; e.y += e.vy; e.vy += 0.3;
    e.life -= 0.04;
    if (e.life <= 0) weaponEffects.splice(i, 1);
  }
}

function drawProjectiles(scX, scY) {
  // Draw effects
  for (const e of weaponEffects) {
    ctx.globalAlpha = e.life * 0.9;
    ctx.fillStyle = e.col;
    ctx.shadowColor = e.col; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * e.life, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  for (const p of projectiles) {
    ctx.save();
    ctx.globalAlpha = p.life;

    if (p.type === 'arrow') {
      // Trail
      if (p.trail.length > 1) {
        ctx.strokeStyle = p.col + '44';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (const t of p.trail) ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }
      // Arrow body
      const ang = Math.atan2(p.vy, p.vx);
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.shadowColor = p.col; ctx.shadowBlur = 8;
      // Shaft
      ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(8, 0); ctx.stroke();
      // Arrowhead
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.moveTo(8,0); ctx.lineTo(-2,-4); ctx.lineTo(-2,4); ctx.closePath(); ctx.fill();
      // Fletching
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-24, -5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-24,  5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-26, -3); ctx.stroke();

    } else if (p.type === 'bolt') {
      // Magic bolt trail
      for (let t = 0; t < p.trail.length; t++) {
        const tr = p.trail[t];
        const a = (t / p.trail.length) * 0.5;
        ctx.globalAlpha = a * p.life;
        ctx.fillStyle = p.col;
        ctx.shadowColor = p.col; ctx.shadowBlur = 12;
        const r = 3 + (t/p.trail.length)*5;
        ctx.beginPath(); ctx.arc(tr.x, tr.y, r, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = p.life;
      // Core orb
      const bg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.4, p.col);
      bg.addColorStop(1, p.col + '00');
      ctx.fillStyle = bg;
      ctx.shadowColor = p.col; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.fill();
      // Outer ring
      ctx.strokeStyle = p.col; ctx.lineWidth = 1.5;
      ctx.globalAlpha = p.life * 0.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI*2); ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}


/* ═══════════════════════════════════════════════════
   DEATH ANIMATION SYSTEM
   - Ragdoll physics with limb segments
   - Blood/impact particles  
   - Dissolve/disintegrate effect
═══════════════════════════════════════════════════ */
const deathAnims = {};  // keyed by fighter side 'A' or 'B'

function triggerDeath(f, scX, scY, sc, GY) {
  if (deathAnims[f.side]) return; // already playing
  const cx = f.x * scX;
  const cy = f.y * scY;
  const HR = 26 * sc, TL = 56 * sc, LL = 46 * sc;
  const headY = cy - TL - LL - HR;
  const shoulderY = headY + HR + 5*sc;
  const hipY = shoulderY + TL;
  const col = f.side === 'A' ? '#00f5d4' : '#ff006e';

  // Build ragdoll segments
  const segs = [
    // {x,y, vx,vy, rot,rVel, len, type}
    { x: cx, y: headY, vx: f.vx*scX*0.5 + (Math.random()-0.5)*8,
      vy: -6 - Math.random()*4, rot: 0, rVel: (Math.random()-0.5)*0.25,
      len: HR, type: 'head', col },
    { x: cx, y: shoulderY + TL*0.5, vx: f.vx*scX*0.3 + (Math.random()-0.5)*4,
      vy: -3 - Math.random()*3, rot: 0, rVel: (Math.random()-0.5)*0.12,
      len: TL, type: 'torso', col },
    { x: cx, y: shoulderY + 5*sc, vx: f.facing*5 + (Math.random()-0.5)*6,
      vy: -8 - Math.random()*5, rot: 0, rVel: (Math.random()-0.5)*0.3,
      len: LL*0.9, type: 'arm', col },
    { x: cx, y: shoulderY + 5*sc, vx: -f.facing*3 + (Math.random()-0.5)*4,
      vy: -5 - Math.random()*4, rot: 0, rVel: (Math.random()-0.5)*0.25,
      len: LL*0.85, type: 'arm', col },
    { x: cx, y: hipY, vx: f.facing*4 + (Math.random()-0.5)*5,
      vy: -4 - Math.random()*3, rot: 0, rVel: (Math.random()-0.5)*0.22,
      len: LL, type: 'leg', col },
    { x: cx, y: hipY, vx: -f.facing*3 + (Math.random()-0.5)*4,
      vy: -3 - Math.random()*3, rot: 0, rVel: (Math.random()-0.5)*0.18,
      len: LL*0.9, type: 'leg', col },
  ];

  // Spawn blood burst particles
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 9;
    weaponEffects.push({
      x: cx, y: cy - TL,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4,
      life: 1.0, col: i < 14 ? col : '#ffffff',
      r: 1.5 + Math.random() * 3, type: 'spark'
    });
  }

  deathAnims[f.side] = {
    segs,
    tick: 0,
    maxTick: 120,  // 2 seconds
    opacity: 1.0,
    GY,
    sc
  };
}

function updateDeathAnims() {
  for (const side of Object.keys(deathAnims)) {
    const d = deathAnims[side];
    d.tick++;

    // Start dissolving after tick 60
    if (d.tick > 60) {
      d.opacity = Math.max(0, 1 - (d.tick - 60) / 60);
    }

    for (const seg of d.segs) {
      seg.x   += seg.vx;
      seg.y   += seg.vy;
      seg.rot += seg.rVel;
      seg.vy  += 0.55;  // gravity
      seg.vx  *= 0.96;  // friction

      // Bounce off ground
      if (seg.y + seg.len * 0.5 > d.GY) {
        seg.y = d.GY - seg.len * 0.5;
        seg.vy *= -0.28;
        seg.vx *= 0.6;
        seg.rVel *= 0.5;
      }
    }

    // Remove when fully dissolved
    if (d.tick >= d.maxTick) {
      delete deathAnims[side];
    }
  }
}

function drawDeathAnims() {
  for (const side of Object.keys(deathAnims)) {
    const d = deathAnims[side];
    ctx.save();

    // Dissolve: flicker + fade
    if (d.opacity < 0.8) {
      if (Math.random() < 0.12) { ctx.restore(); continue; }  // flicker
    }
    ctx.globalAlpha = d.opacity;

    for (const seg of d.segs) {
      ctx.save();
      ctx.translate(seg.x, seg.y);
      ctx.rotate(seg.rot);

      const sc = d.sc;

      // Disintegration: fragments break apart as opacity drops
      if (d.opacity < 0.5) {
        ctx.shadowColor = seg.col;
        ctx.shadowBlur  = (1 - d.opacity) * 20;
        ctx.globalAlpha = d.opacity * (0.5 + Math.random() * 0.5);
      } else {
        ctx.shadowColor = seg.col;
        ctx.shadowBlur  = 8;
      }

      ctx.strokeStyle = seg.col;
      ctx.fillStyle   = seg.col;
      ctx.lineCap     = 'round';

      if (seg.type === 'head') {
        ctx.lineWidth = Math.max(1.5, 3 * sc);
        ctx.beginPath();
        ctx.arc(0, 0, seg.len, 0, Math.PI * 2);
        ctx.stroke();
        // X eyes (dead face)
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff3333';
        ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 6;
        const eo = 4 * sc;
        [-1, 1].forEach(side2 => {
          ctx.beginPath();
          ctx.moveTo(side2*eo - 2*sc, -3*sc - 2*sc);
          ctx.lineTo(side2*eo + 2*sc, -3*sc + 2*sc);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(side2*eo + 2*sc, -3*sc - 2*sc);
          ctx.lineTo(side2*eo - 2*sc, -3*sc + 2*sc);
          ctx.stroke();
        });
        // Sad/dead mouth
        ctx.strokeStyle = '#ff3333';
        ctx.beginPath();
        ctx.moveTo(-4*sc, 5*sc); ctx.lineTo(4*sc, 5*sc);
        ctx.stroke();
      } else if (seg.type === 'torso') {
        ctx.lineWidth = Math.max(2, 3.5 * sc);
        ctx.beginPath();
        ctx.moveTo(0, -seg.len * 0.5);
        ctx.lineTo(0,  seg.len * 0.5);
        ctx.stroke();
        // Torso crack effect when disintegrating
        if (d.opacity < 0.6) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1; ctx.globalAlpha *= 0.6;
          ctx.beginPath();
          ctx.moveTo(-4*sc, -seg.len*0.2);
          ctx.lineTo(4*sc, 0);
          ctx.lineTo(-3*sc, seg.len*0.3);
          ctx.stroke();
        }
      } else {
        ctx.lineWidth = Math.max(1.5, 2.8 * sc);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, seg.len);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Disintegration particles as body dissolves
    if (d.opacity < 0.7 && Math.random() < 0.4) {
      const seg = d.segs[Math.floor(Math.random() * d.segs.length)];
      weaponEffects.push({
        x: seg.x + (Math.random()-0.5)*10,
        y: seg.y + (Math.random()-0.5)*10,
        vx: (Math.random()-0.5)*2,
        vy: -1 - Math.random()*2,
        life: 0.6 + Math.random()*0.4,
        col: seg.col,
        r: 1 + Math.random()*2,
        type: 'spark'
      });
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function clearDeathAnims() {
  for (const k of Object.keys(deathAnims)) delete deathAnims[k];
}

/* Track last attack state to detect new attack start */
const _lastAtk = {A: 0, B: 0};
function checkFireProjectiles(s) {
  if (!s || !s.P1 || !s.P2) return;
  const scX = CW / (s.worldW || 800);
  const scY = CH / (s.worldH || 500);

  [s.P1, s.P2].forEach(f => {
    if (!f || f.hp <= 0) return;
    const prevAtk = _lastAtk[f.side];
    const nowAtk  = f.atk;
    // Fire on rising edge (new attack started)
    if (nowAtk > 0 && prevAtk === 0) {
      const px = f.x * scX;
      const py = (f.y + 10) * scY;
      // BOW and STAFF removed
    }
    _lastAtk[f.side] = nowAtk;
  });
}


/* ══════════════════════════════════════
   SERVER CONNECTION CHECK
══════════════════════════════════════ */
async function checkServer() {
  try {
    const r = await fetch(API + '/stats', { mode:'cors', signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      setServerOnline(true);
      fetchDuelUserStats(); // load per-user W/L/D from admin DB
      return true;
    }
  } catch (e) { /* server not running */ }
  setServerOnline(false);
  return false;
}
window.checkServer = checkServer; // expose for retry button

function setServerOnline(online) {
  serverOnline = online;
  const badge   = document.getElementById('serverBadge');
  const offline = document.getElementById('serverOffline');
  if (online) {
    badge.textContent = '● JAVA SERVER ONLINE';
    badge.classList.remove('offline');
    offline.classList.add('hidden');
  } else {
    badge.textContent = '● JAVA SERVER OFFLINE';
    badge.classList.add('offline');
    offline.classList.remove('hidden');
  }
}

/* Retry automatically every 3 seconds when offline */
function startRetryLoop() {
  if (retryId) clearInterval(retryId);
  retryId = setInterval(async () => {
    if (!serverOnline) {
      const ok = await checkServer();
      if (ok) { clearInterval(retryId); retryId = null; }
    }
  }, 3000);
}

document.getElementById('retryBtn').addEventListener('click', checkServer);

/* ══════════════════════════════════════
   SCREEN MANAGEMENT
══════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
  curScreen = id;
}

function goMenu() {
  stopPolling();
  stopKeyPoll();
  showScreen('screenMenu');
  checkServer();
  fetchDuelUserStats();
}

/* ══════════════════════════════════════
   WEAPON SELECT UI
══════════════════════════════════════ */
function startPick() {
  if (!serverOnline) { alert('Java server is not running!\n\nRun:\n  javac StickmanServer.java\n  java dual.StickmanServer'); return; }
  pickStep = 0; w1sel = null; w2sel = null; selW = null;
  buildWGrid();
  updatePickPhase();
  showScreen('screenWeapon');
}

function updatePickPhase() {
  const aiPick = vsAI && pickStep === 1;
  document.getElementById('wsLabel').textContent =
    pickStep === 0 ? 'PLAYER 1 — CHOOSE YOUR WEAPON'
    : aiPick       ? 'CPU IS CHOOSING...'
                   : 'PLAYER 2 — CHOOSE YOUR WEAPON';
  document.getElementById('wsOK').disabled = true;
  selW = null;
  clearWPrev();
  document.querySelectorAll('.wcard').forEach(c => c.classList.remove('sel', 'sel2'));

  if (aiPick) {
    setTimeout(() => {
      w2sel = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
      afterBothPicked();
    }, 800);
  }
}

function buildWGrid() {
  const g = document.getElementById('wgrid');
  g.innerHTML = '';
  WEAPONS.forEach(w => {
    const c = document.createElement('div');
    c.className = 'wcard'; c.dataset.id = w.id;
    c.innerHTML = `<span class="wcard-icon">${w.icon}</span><span class="wcard-name">${w.name}</span><span class="wcard-type">${w.type}</span>`;
    c.addEventListener('mouseenter', () => showWPrev(w));
    c.addEventListener('click',      () => pickWeapon(w, c));
    g.appendChild(c);
  });
}

function showWPrev(w) {
  document.getElementById('wpIcon').textContent = w.icon;
  document.getElementById('wpName').textContent = w.name;
  document.getElementById('wpDesc').textContent = w.desc;
  const barColors = ['#ff4400','#00f5d4','#ffd60a','#00e660'];
  const stats = [
    {l:'DMG', v:w.dmg, m:40},
    {l:'SPD', v:w.spd, m:14},
    {l:'RNG', v:Math.round(w.range/2), m:110},
    {l:'DEF', v:w.def, m:20},
  ];
  document.getElementById('wpBars').innerHTML = stats.map((s, i) => `
    <div class="wbar-item">
      <div class="wbar-track"><div class="wbar-fill" style="width:${Math.round(s.v/s.m*100)}%;background:${barColors[i]}"></div></div>
      <span class="wbar-lbl">${s.l}</span>
      <span class="wbar-val">${s.v}</span>
    </div>`).join('');
}

function clearWPrev() {
  document.getElementById('wpIcon').textContent = '⚔️';
  document.getElementById('wpName').textContent = 'SELECT A WEAPON';
  document.getElementById('wpDesc').textContent = 'Hover a weapon to preview';
  document.getElementById('wpBars').innerHTML   = '';
}

function pickWeapon(w, card) {
  if (vsAI && pickStep === 1) return;
  document.querySelectorAll('.wcard').forEach(c => c.classList.remove('sel', 'sel2'));
  card.classList.add(pickStep === 0 ? 'sel' : 'sel2');
  selW = w;
  document.getElementById('wsOK').disabled = false;
  showWPrev(w);
}

function confirmPick() {
  if (!selW && !(vsAI && pickStep === 1)) return;
  if (pickStep === 0) {
    w1sel = selW; selW = null; pickStep = 1;
    updatePickPhase();
  } else {
    w2sel = w2sel || selW;
    afterBothPicked();
  }
}

function afterBothPicked() {
  showScreen('screenFight');
  setupFightUI();
  sendStartToJava();
}

/* ══════════════════════════════════════
   FIGHT SCREEN SETUP
══════════════════════════════════════ */
function setupFightUI() {
  resizeCv();
  // Show crosshair cursor when bow or staff is selected (P1)
  const w1id = w1sel ? w1sel.id : '';
  canvas.style.cursor = 'default';
  document.getElementById('hudNameA').textContent = 'PLAYER 1';
  document.getElementById('hudNameB').textContent = vsAI ? 'CPU' : 'PLAYER 2';
  if (w1sel) document.getElementById('hudWepA').textContent = w1sel.icon + ' ' + w1sel.name;
  if (w2sel) document.getElementById('hudWepB').textContent = w2sel.icon + ' ' + w2sel.name;
  document.getElementById('ctrlBar').querySelector('span').textContent = 'P1: A/D · W jump · F atk · G blk · AA/DD dash';
  document.getElementById('ctrlR').textContent = vsAI
    ? 'CPU: ' + (aiDifficulty==='easy'?'😊 EASY':aiDifficulty==='medium'?'😐 MEDIUM':aiDifficulty==='hard'?'😤 HARD':'💀 EXTREME') + ' AI'
    : 'P2: ←/→ · ↑ jump · L atk · ; blk · ←←/→→ dash';
}

function resizeCv() {
  CW = window.innerWidth;
  const hudH  = (document.getElementById('fightHUD')  || {offsetHeight:62}).offsetHeight;
  const ctrlH = (document.getElementById('ctrlBar')   || {offsetHeight:28}).offsetHeight;
  CH = Math.max(200, window.innerHeight - 52 - hudH - ctrlH);
  canvas.width  = CW;
  canvas.height = CH;
}
window.addEventListener('resize', () => { if (curScreen === 'screenFight') resizeCv(); });

/* ══════════════════════════════════════
   SEND START TO JAVA SERVER
══════════════════════════════════════ */
async function sendStartToJava() {
  _scoreSent = false; // reset so next match will report
  try {
    await fetch(API + '/start', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        mode   : vsAI ? '1v1ai' : '1v1p',
        difficulty: aiDifficulty,
        weapon1: w1sel.id,
        weapon2: w2sel.id,
      })
    });
  } catch (e) { console.error('Could not start game on Java server:', e); }
  startPolling();
  startKeyPoll();
}

/* ══════════════════════════════════════
   KEYBOARD → JAVA  (send every 16ms)
══════════════════════════════════════ */
const keysDown = new Set();

// Double-tap tracking for dash
const _dtLast = {};   // key -> timestamp of last keydown
const _dtHeld = {};   // key -> is currently held
const DBL_TAP_MS = 260; // ms window for double-tap

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  keysDown.add(e.code);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();

  if (curScreen === 'screenFight') {
    const now = Date.now();

    // ── IMMEDIATE ATTACK: fire sendKeys right now on keydown ──
    // Eliminates up-to-16ms poll delay; ensures fast taps are never missed
    if (e.code === 'KeyF' || e.code === 'KeyL') {
      sendKeys();
    }

    // Double-tap dash detection
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
      const k = e.code === 'KeyA' ? 'p1DashLeft' : 'p2DashLeft';
      if (_dtLast[k] && now - _dtLast[k] < DBL_TAP_MS) {
        keysDown.add(k);
        setTimeout(() => keysDown.delete(k), 80);
      }
      _dtLast[k] = now;
    }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') {
      const k = e.code === 'KeyD' ? 'p1DashRight' : 'p2DashRight';
      if (_dtLast[k] && now - _dtLast[k] < DBL_TAP_MS) {
        keysDown.add(k);
        setTimeout(() => keysDown.delete(k), 80);
      }
      _dtLast[k] = now;
    }
  }
});
document.addEventListener('keyup', e => keysDown.delete(e.code));

// Mouse click = attack for BOW and STAFF (P1 only)
// Canvas mousedown adds MouseLeft key, mouseup/mouseleave removes it
canvas.addEventListener('mousedown', e => {
  if (e.button === 0 && curScreen === 'screenFight') {
    keysDown.add('MouseLeft');
    e.preventDefault();
  }
});
canvas.addEventListener('mouseup',    () => keysDown.delete('MouseLeft'));
canvas.addEventListener('mouseleave', () => keysDown.delete('MouseLeft'));

// Touch support for mobile (tap = MouseLeft)
canvas.addEventListener('touchstart', e => {
  if (curScreen === 'screenFight') {
    keysDown.add('MouseLeft');
    e.preventDefault();
  }
}, { passive: false });
canvas.addEventListener('touchend',   () => keysDown.delete('MouseLeft'));

function startKeyPoll() {
  stopKeyPoll();
  keyPollId = setInterval(sendKeys, 16);
}
function stopKeyPoll() { if (keyPollId) { clearInterval(keyPollId); keyPollId = null; } }

async function sendKeys() {
  if (!serverOnline || curScreen !== 'screenFight') return;
  try {
    await fetch(API + '/input', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ keys: [...keysDown] })
    });
  } catch (e) { /* ignore */ }
}

/* ══════════════════════════════════════
   POLL STATE FROM JAVA  (~60fps)
══════════════════════════════════════ */
function startPolling() {
  stopPolling();
  pollId = setInterval(pollState, 16);
}
function stopPolling() { if (pollId) { clearInterval(pollId); pollId = null; } }

async function pollState() {
  if (!serverOnline || curScreen !== 'screenFight') return;
  try {
    const r = await fetch(API + '/state', { mode:'cors' });
    if (!r.ok) return;
    gameState = await r.json();
    applyState(gameState);
  } catch (e) { /* server hiccup - keep trying */ }
}

/* ══════════════════════════════════════
   APPLY STATE (update HUD + render)
══════════════════════════════════════ */
function applyState(s) {
  if (!s) return;
  const p1 = s.P1, p2 = s.P2;

  // Clear death anims on new round
  if (p1 && p1.hp > 0 && deathAnims['A']) clearDeathAnims();
  if (p2 && p2.hp > 0 && !p2.isBoss && deathAnims['B']) { delete deathAnims['B']; }
  if (p1 && p1.hp >= 100) { _dashTrails.A.length = 0; }
  if (p2 && p2.hp >= 100) { _dashTrails.B.length = 0; }
  if (p2 && !p2.isBoss) {
    bossActive = false;
    // Reset HUD back to CPU when new round starts
    document.getElementById('hudNameB').textContent = vsAI ? 'CPU' : 'PLAYER 2';
    document.getElementById('hudWepB').style.color  = '';
  }

  /* Screen shake on big hits */
  if (p1 && p1.hp < _prevHp.A) {
    const dmg = _prevHp.A - p1.hp;
    if (dmg >= 20) { screenShake.dur = 8; screenShake.mag = dmg > 30 ? 10 : 5; }
  }
  if (p2 && p2.hp < _prevHp.B) {
    const dmg = _prevHp.B - p2.hp;
    if (dmg >= 20) { screenShake.dur = 8; screenShake.mag = dmg > 30 ? 10 : 5; }
  }
  if (p1) _prevHp.A = p1.hp;
  if (p2) _prevHp.B = p2.hp;

  /* HP bars */
  if (p1) updateHPBar('hpBarA', 'hpTxtA', p1.hp, p1.maxHp);
  if (p2) updateHPBar('hpBarB', 'hpTxtB', p2.hp, p2.maxHp);
  const _hpB = document.getElementById('hpBarB');
  if (_hpB) { if (p2&&p2.isBoss){_hpB.style.background='linear-gradient(90deg,#aa0000,#ff4400)';_hpB.style.boxShadow='0 0 12px rgba(255,40,0,.6)';}else{_hpB.style.background='';_hpB.style.boxShadow='';} }

  /* Boss transformation */
  const isBossNow = p2 && p2.isBoss;
  if (isBossNow && !bossActive) {
    bossActive = true; _bossRiseTick = 90;
    delete deathAnims['B'];
    // Flash P1 HP bar green to show heal
    const _hpA = document.getElementById('hpBarA');
    if (_hpA) { _hpA.style.background='linear-gradient(90deg,#00ff88,#00e660)'; _hpA.style.boxShadow='0 0 18px #00ff88'; }
    setTimeout(()=>{ const h=document.getElementById('hpBarA'); if(h){h.style.background='';h.style.boxShadow='';} }, 2000);
    document.getElementById('hudNameB').textContent = '💀 TITAN';
    document.getElementById('hudWepB').style.color  = '#ff3300';
    screenShake.dur = 35; screenShake.mag = 20;
  }
  if (isBossNow && p2.weapon) {
    const wn = p2.weapon.name || 'SWORD';
    document.getElementById('hudWepB').textContent = wn + ' [BOSS]';
  }

  /* timer / round / score */
  document.getElementById('fTimer').textContent   = isBossNow ? '!!' : s.rTimer;
  document.getElementById('roundTag').textContent = isBossNow ? 'BOSS PHASE' : ('ROUND ' + s.roundNum);
  document.getElementById('scoreTag').textContent = s.scA + ' — ' + s.scB;

  /* canvas render */
  render(s);

  /* report match result to admin panel once */
  if (s.phase === 'MATCH_OVER') maybeReportScore(s);
}

function updateHPBar(barId, txtId, hp, maxHp) {
  const el  = document.getElementById(barId);
  const txt = document.getElementById(txtId);
  if (!el) return;
  const pct = Math.max(0, hp / maxHp * 100);
  el.style.width = pct + '%';
  el.classList.toggle('danger', pct < 30);
  if (txt) txt.textContent = hp + ' HP';
}

/* ══════════════════════════════════════
   CANVAS RENDERING
   Java sends virtual 800×500 coords,
   JS scales everything to real canvas size
══════════════════════════════════════ */
function render(s) {
  resizeCv();
  const W = CW, H = CH;

  // scale factors — use uniform sc so fighters always sit on the ground line
  const scX = W / (s.worldW || 800);
  const _scY = H / (s.worldH || 500);
  const sc  = Math.min(scX, _scY);
  // Ground line: always at bottom of canvas with small margin
  const GY  = H - 28;
  // Fighter positions scale: x uses scX, y maps virtual GY to canvas GY
  const scY = GY / (s.groundY || 480);

  ctx.clearRect(0, 0, W, H);

  // Screen shake effect on heavy hits
  let sx = 0, sy = 0;
  if (screenShake.dur > 0) {
    sx = (Math.random()-0.5) * screenShake.mag;
    sy = (Math.random()-0.5) * screenShake.mag;
    screenShake.dur--;
    if (screenShake.dur <= 0) screenShake.mag = 0;
  }
  ctx.save();
  ctx.translate(sx, sy);

  const isBossMode = s.P2 && s.P2.isBoss;
  const _t = Date.now();

  drawUnderground(W, H, GY, isBossMode, _t);

  if (s.P2 && s.P2.lg) drawLightnings(s.P2.lg, scX, scY, GY, W, H);
  if (s.P2 && s.P2.ts) drawTitanSlams(s.P2.ts, scX, GY, W);

  if (s.P1) renderFighter(s.P1, scX, scY, sc, GY);
  if (s.P2) renderFighter(s.P2, scX, scY, sc, GY);

  updateDeathAnims(); drawDeathAnims();
  checkFireProjectiles(s); updateProjectiles(s); drawProjectiles(scX, scY);
  ctx.restore();

  if (_bossRiseTick > 0) {
    _bossRiseTick--;
    const _a = Math.min(1, _bossRiseTick / 30);
    ctx.save(); ctx.globalAlpha = _a;
    ctx.fillStyle = 'rgba(100,0,0,0.7)'; ctx.fillRect(0,0,W,H);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold '+Math.min(52,Math.floor(W*0.068))+'px Orbitron,monospace';
    ctx.fillStyle='#ff1100'; ctx.shadowColor='#ff0000'; ctx.shadowBlur=50;
    ctx.fillText('BOSS AWAKENS', W/2, H/2-18);
    ctx.font='bold '+Math.min(20,Math.floor(W*0.025))+'px Orbitron,monospace';
    ctx.fillStyle='#ffaa00'; ctx.shadowBlur=20;
    ctx.fillText('THE NIGHTMARE IS NOT OVER', W/2, H/2+28);
    ctx.shadowBlur=0; ctx.restore();
  }
  if (s.phase === 'FLASH' && s.flashTick > 0 && s.flashText) drawFlash(s.flashLabel, s.flashText, s.flashSub, W, H);
  if (s.phase === 'MATCH_OVER' && s.flashTick <= 0) drawResult(s, W, H);
}

function drawUnderground(W, H, GY, boss, t) {
  // ── SKY: deep crimson hell gradient (always red-toned like the reference) ──
  const skyPulse = 0.04 * Math.sin(t / 800);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,   boss ? '#1a0000' : '#180004');
  bg.addColorStop(0.4, boss ? '#3a0500' : '#2d0108');
  bg.addColorStop(0.75,'#1c0000');
  bg.addColorStop(1,   '#0a0000');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // ── FAR BACKGROUND: ruined city silhouette ──
  ctx.save();
  ctx.fillStyle = 'rgba(10,0,0,0.92)';
  const bldgs = [
    [0.02,0.55,0.06,0.9],[0.05,0.35,0.04,0.9],[0.10,0.45,0.05,0.9],
    [0.16,0.28,0.03,0.9],[0.20,0.50,0.06,0.9],[0.28,0.32,0.04,0.9],
    [0.33,0.22,0.05,0.9],[0.40,0.42,0.07,0.9],[0.50,0.18,0.04,0.9],
    [0.56,0.38,0.05,0.9],[0.62,0.28,0.03,0.9],[0.68,0.45,0.06,0.9],
    [0.75,0.30,0.04,0.9],[0.80,0.55,0.05,0.9],[0.87,0.35,0.06,0.9],
    [0.93,0.25,0.04,0.9],[0.97,0.48,0.05,0.9],
  ];
  for (const [rx,ry,rw,rb] of bldgs) {
    const bx=rx*W, by=ry*H, bw=rw*W, bh=(rb-ry)*H;
    ctx.fillRect(bx, by, bw, bh);
    // battlements on top
    for (let mx=bx; mx<bx+bw; mx+=bw/4) {
      ctx.fillRect(mx, by-H*0.02, bw/5, H*0.02);
    }
  }
  ctx.restore();

  // ── BACKGROUND GLOW: hellfire light sources ──
  const fires = [[0.15,0.65],[0.5,0.55],[0.82,0.68],[0.35,0.72],[0.68,0.60]];
  for (const [fx,fy] of fires) {
    const fp = 0.08 + 0.05*Math.sin(t/300 + fx*10);
    const fg = ctx.createRadialGradient(fx*W, fy*H, 0, fx*W, fy*H, W*0.18);
    fg.addColorStop(0, 'rgba(255,'+(boss?30:15)+',0,'+fp+')');
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
  }

  // ── MID BACKGROUND: broken pillars ──
  ctx.save();
  const pillarPositions = [0.08, 0.22, 0.50, 0.72, 0.90];
  for (const px of pillarPositions) {
    const ph = H * (0.35 + Math.sin(px*7)*0.12);
    const pw = W * 0.028;
    const brickH = H * 0.045;
    // pillar body in bricks
    for (let by2 = GY - ph; by2 < GY; by2 += brickH) {
      const shade = 20 + Math.floor(Math.random()*8);
      ctx.fillStyle = 'rgb('+shade+','+Math.floor(shade*0.3)+','+Math.floor(shade*0.25)+')';
      ctx.fillRect(px*W - pw/2, by2, pw, brickH-1);
      // brick mortar line
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px*W - pw/2, by2, pw, 1);
    }
    // pillar cap
    ctx.fillStyle = '#2a0800';
    ctx.fillRect(px*W - pw/2 - 4, GY - ph - 8, pw + 8, 8);
    // fire glow at broken top
    const pg = ctx.createRadialGradient(px*W, GY-ph, 0, px*W, GY-ph, 30);
    pg.addColorStop(0,'rgba(255,80,0,0.22)');
    pg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=pg; ctx.fillRect(px*W-40, GY-ph-30, 80, 60);
  }
  ctx.restore();

  // ── GROUND: stone brick floor ──
  ctx.save();
  const floorH = H * 0.09;
  const floorY = GY;
  // Floor base
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, floorY + floorH);
  floorGrad.addColorStop(0, '#2a0a00');
  floorGrad.addColorStop(0.4, '#1a0500');
  floorGrad.addColorStop(1, '#0d0200');
  ctx.fillStyle = floorGrad; ctx.fillRect(0, floorY, W, floorH);

  // Stone bricks on floor
  const brickW = W / 14, brickHh = floorH * 0.48;
  for (let row = 0; row < 2; row++) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    const rowY = floorY + row * brickHh;
    for (let col = -1; col < 15; col++) {
      const bx = col * brickW + offset;
      const shade = 28 + Math.floor(Math.sin(col*1.3+row*2.7)*6);
      ctx.fillStyle = 'rgb('+shade+','+Math.floor(shade*0.28)+','+Math.floor(shade*0.22)+')';
      ctx.fillRect(bx+1, rowY+1, brickW-2, brickHh-2);
      // crack detail
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(bx+1, rowY+1, brickW-2, brickHh-2);
      // highlight top edge
      ctx.fillStyle = 'rgba(255,80,0,0.08)';
      ctx.fillRect(bx+1, rowY+1, brickW-2, 2);
    }
  }

  // Lava cracks in floor
  ctx.strokeStyle = 'rgba(255,120,0,0.7)'; ctx.lineWidth = 1.5;
  ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 6;
  const cracks = [[0.12,0.18],[0.31,0.38],[0.55,0.62],[0.74,0.80]];
  for (const [c1,c2] of cracks) {
    const cx1=c1*W, cx2=c2*W, cy1=floorY+2, cy2=floorY+brickHh;
    ctx.beginPath(); ctx.moveTo(cx1, cy1);
    ctx.bezierCurveTo(cx1+(cx2-cx1)*0.3, cy1+8, cx1+(cx2-cx1)*0.7, cy2-8, cx2, cy2);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── GROUND EDGE GLOW ──
  const edgePulse = 0.5 + 0.2*Math.sin(t/400);
  const eg = ctx.createLinearGradient(0, GY-4, 0, GY+8);
  eg.addColorStop(0, 'rgba(255,80,0,'+edgePulse+')');
  eg.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = eg; ctx.fillRect(0, GY-4, W, 12);
  ctx.fillStyle = 'rgba(255,100,0,0.85)'; ctx.fillRect(0, GY-1, W, 2);

  // ── FOREGROUND DEBRIS / ROCKS ──
  ctx.save();
  const rocks = [[0.05,1.0,18,8],[0.18,0.95,12,6],[0.42,1.0,22,9],[0.60,0.98,15,7],[0.78,1.0,20,8],[0.92,0.97,13,6]];
  for (const [rx2,ry2,rw2,rh2] of rocks) {
    ctx.fillStyle = '#1a0400';
    ctx.strokeStyle = 'rgba(255,60,0,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(rx2*W, GY+ry2*rh2*0.5, rw2, rh2, 0, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();

  // ── FLOATING EMBERS / SPARKS ──
  if (!window._embers) window._embers = Array.from({length:55}, () => ({
    x: Math.random()*800, y: Math.random()*500,
    vx: (Math.random()-0.5)*0.6, vy: -0.4-Math.random()*0.8,
    r: 0.8+Math.random()*2.2, ph: Math.random()*Math.PI*2,
    warm: Math.random() > 0.3
  }));
  ctx.save();
  for (const p of window._embers) {
    p.x += p.vx + Math.sin(p.ph*0.5)*0.3;
    p.y += p.vy; p.ph += 0.04;
    if (p.y < -5) { p.y = H+5; p.x = Math.random()*800; }
    if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
    const al = 0.3 + 0.25*Math.sin(p.ph);
    const g2 = Math.floor(60 + Math.sin(p.ph)*40);
    ctx.fillStyle = p.warm ? 'rgba(255,'+g2+',0,'+al+')' : 'rgba(255,200,50,'+al*0.7+')';
    ctx.shadowColor = p.warm ? '#ff4400' : '#ffaa00';
    ctx.shadowBlur = 4+al*6;
    ctx.beginPath(); ctx.arc(p.x*W/800, p.y*H/500, p.r, 0, Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.restore();

  // ── BOSS MODE: extra hell effects ──
  if (boss) {
    const vp = 0.12 + 0.07*Math.sin(t/200);
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.95);
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(200,0,0,'+vp+')');
    ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
    // extra fire glow from ground
    const fg2 = ctx.createLinearGradient(0,GY-80,0,GY);
    fg2.addColorStop(0,'rgba(255,30,0,0)'); fg2.addColorStop(1,'rgba(255,60,0,0.18)');
    ctx.fillStyle=fg2; ctx.fillRect(0,GY-80,W,80);
  }
}




function drawLightnings(lgs, scX, scY, GY, W, H) {
  for (const lg of lgs) {
    const lx = lg[0]*scX;
    const warned = lg[3]===0 && lg[1]>0;
    const struck = lg[3]===1 && lg[2]>0;
    if (warned) {
      const al = 0.22+0.2*Math.sin(Date.now()/65);
      ctx.save();
      ctx.strokeStyle='rgba(255,80,0,'+al+')'; ctx.lineWidth=2; ctx.setLineDash([5,8]);
      ctx.beginPath(); ctx.moveTo(lx,0); ctx.lineTo(lx,GY); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle='rgba(255,110,0,'+(al*1.8)+')'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(lx,GY,22+5*Math.sin(Date.now()/90),0,Math.PI*2); ctx.stroke();
      ctx.restore();
    } else if (struck) {
      ctx.save();
      const inten=lg[2]/20;
      ctx.shadowColor='#ff5500'; ctx.shadowBlur=35*inten;
      ctx.strokeStyle='rgba(255,230,60,'+inten+')'; ctx.lineWidth=3+inten*5;
      drawBolt(lx,0,lx,GY);
      ctx.strokeStyle='rgba(255,120,0,'+(inten*0.6)+')'; ctx.lineWidth=1.5;
      drawBolt(lx+(Math.random()-0.5)*25,0,lx+(Math.random()-0.5)*15,GY*0.65);
      const gf=ctx.createRadialGradient(lx,GY,0,lx,GY,58);
      gf.addColorStop(0,'rgba(255,200,0,'+(inten*0.9)+')'); gf.addColorStop(1,'rgba(255,80,0,0)');
      ctx.fillStyle=gf; ctx.beginPath(); ctx.arc(lx,GY,58,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
}

function drawTitanSlams(slams, scX, GY, W) {
  const t = Date.now();
  for (const ts of slams) {
    const sx  = ts[0] * scX;
    const warn= ts[1]; // warning countdown (>0 = warning phase)
    const life= ts[2]; // active life (>0 = slam active)
    const rad = ts[3] * scX; // radius scaled

    if (life === 0 && warn > 0) {
      // WARNING: pulsing red circle on ground + beam from sky
      const pulse = 0.4 + 0.4 * Math.sin(t / 60);
      const danger = Math.max(0, 1 - warn / 80); // 0→1 as warn counts down

      // Ground danger zone
      ctx.save();
      ctx.strokeStyle = 'rgba(255,' + Math.floor(100 - danger*80) + ',0,' + (0.5 + danger*0.5) + ')';
      ctx.lineWidth = 3 + danger * 4;
      ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 20 + danger * 30;
      ctx.beginPath(); ctx.ellipse(sx, GY, rad, 14, 0, 0, Math.PI * 2); ctx.stroke();

      // Inner fill getting brighter as impact approaches
      const grd = ctx.createRadialGradient(sx, GY, 0, sx, GY, rad);
      grd.addColorStop(0, 'rgba(255,80,0,' + (danger * 0.35 * pulse) + ')');
      grd.addColorStop(1, 'rgba(255,30,0,0)');
      ctx.fillStyle = grd; ctx.fillRect(sx - rad - 10, GY - 20, rad * 2 + 20, 30);

      // WARNING TEXT
      if (danger > 0.4) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.floor(12 + danger * 10) + 'px Orbitron,monospace';
        ctx.fillStyle = 'rgba(255,200,0,' + danger + ')';
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 15;
        ctx.fillText('⚠ TITAN SLAM', sx, GY - 30);
      }
      ctx.shadowBlur = 0; ctx.restore();

    } else if (life > 0) {
      // IMPACT: massive shockwave
      const inten = life / 25;
      ctx.save();
      ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 60 * inten;

      // Shockwave ring expanding outward
      const expandRad = rad * (1 + (1 - inten) * 1.5);
      ctx.strokeStyle = 'rgba(255,' + Math.floor(150 * inten) + ',0,' + inten + ')';
      ctx.lineWidth = 6 + inten * 10;
      ctx.beginPath(); ctx.ellipse(sx, GY, expandRad, 18, 0, 0, Math.PI * 2); ctx.stroke();

      // Ground crack flash
      const gf = ctx.createRadialGradient(sx, GY, 0, sx, GY, expandRad * 1.2);
      gf.addColorStop(0, 'rgba(255,200,50,' + (inten * 0.8) + ')');
      gf.addColorStop(0.4, 'rgba(255,80,0,' + (inten * 0.5) + ')');
      gf.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gf; ctx.fillRect(sx - expandRad * 1.3, GY - 30, expandRad * 2.6, 40);

      // Vertical shocklines
      ctx.strokeStyle = 'rgba(255,220,50,' + (inten * 0.9) + ')';
      ctx.lineWidth = 2;
      for (let i = -4; i <= 4; i++) {
        if (i === 0) continue;
        const lx = sx + i * (expandRad / 4);
        const lh = (40 + Math.random() * 60) * inten;
        ctx.beginPath(); ctx.moveTo(lx, GY); ctx.lineTo(lx + (Math.random()-0.5)*10, GY - lh); ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.restore();
    }
  }
}

function drawBolt(x1, y1, x2, y2) {
  const segs = 10;
  const dx = (x2-x1)/segs, dy = (y2-y1)/segs;
  ctx.beginPath(); ctx.moveTo(x1, y1);
  for (let i = 1; i <= segs; i++) {
    const jitter = (i < segs) ? (Math.random()-0.5) * 28 : 0;
    ctx.lineTo(x1 + dx*i + jitter, y1 + dy*i);
  }
  ctx.stroke();
}

/* ── render one fighter ── */
function renderFighter(f, scX, scY, sc, GY) {
  const cx = f.x * scX;
  // clamp cy so grounded fighters always touch the ground line exactly
  const cy = f.grounded ? GY : Math.min(f.y * scY, GY);

  // Dash afterimage trail
  const trail = _dashTrails[f.side];
  if (f.dashing) {
    trail.push({cx, cy, alpha: 0.55});
    if (trail.length > 6) trail.shift();
  } else if (trail.length > 0) {
    trail.forEach(t => t.alpha -= 0.08);
    while (trail.length && trail[0].alpha <= 0) trail.shift();
  }
  // Draw afterimages
  const HR2=26*sc, TL2=56*sc, LL2=46*sc;
  const dashCol = f.side==='A' ? '#ffd060' : '#40d0ff';
  trail.forEach((t,i) => {
    const a = t.alpha * (i/trail.length);
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = dashCol; ctx.shadowColor = dashCol; ctx.shadowBlur = 12;
    ctx.lineWidth = Math.max(1.5, 2.5*sc);
    const hy = t.cy - TL2 - LL2 - HR2;
    const sy2 = hy + HR2 + 5*sc;
    ctx.beginPath(); ctx.arc(t.cx, hy, HR2, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t.cx,hy+HR2); ctx.lineTo(t.cx,sy2+TL2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t.cx,sy2+TL2); ctx.lineTo(t.cx+f.facing*LL2*0.7,t.cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(t.cx,sy2+TL2); ctx.lineTo(t.cx-f.facing*LL2*0.4,t.cy+4*sc); ctx.stroke();
    ctx.restore();
  });

  // Scaled stickman dimensions
  const HR = 26 * sc;
  const TL = 56 * sc;
  const LL = 46 * sc;
  const AL = (LL - 3 * sc);

  /* hit particles (positions from Java) */
  (f.pts || []).forEach(p => {
    ctx.globalAlpha = Math.max(0, Math.min(1, p[4])) * 0.85;
    ctx.fillStyle   = `rgb(${p[6]},${p[7]},${p[8]})`;
    ctx.shadowColor = `rgb(${p[6]},${p[7]},${p[8]})`;
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.arc(p[0] * scX, p[1] * scY, Math.max(1, 3 * p[4] * sc), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  ctx.globalAlpha = 1;

  if (f.hp <= 0 && !f.isBoss) {
    if (!deathAnims[f.side]) triggerDeath(f, scX, scY, sc, GY);
    return;
  }
  if (f.hp <= 0 && f.isBoss) {
    // Boss truly died — trigger dramatic death
    if (!deathAnims[f.side]) triggerDeath(f, scX, scY, sc, GY);
    return;
  }

  // Boss aura: pulsing red glow around body
  if (f.isBoss) {
    const pulse = 0.4 + 0.3 * Math.sin(Date.now() / 150);
    ctx.save();
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur  = 40 * pulse;
    const aura = ctx.createRadialGradient(cx, cy - TL, HR*0.5, cx, cy - TL, HR*3.5);
    aura.addColorStop(0, `rgba(255,30,0,${pulse * 0.35})`);
    aura.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(cx, cy - TL - LL, HR*3.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  drawStickman(f, cx, cy, HR, TL, LL, AL, GY, sc);

  // Dash speed lines
  if (f.dashing) {
    const dc = f.side==='A' ? '#ffd060' : '#40d0ff';
    ctx.save(); ctx.strokeStyle=dc; ctx.shadowColor=dc; ctx.shadowBlur=14;
    const lineDir = -f.facing;
    const bodyTop = cy - (18+40+34)*sc;
    for (let i=0; i<5; i++) {
      const ly = cy - (34*sc)*0.3 - i*(18*sc)*0.7;
      const llen = (28+i*10)*sc;
      ctx.globalAlpha = 0.65 - i*0.11;
      ctx.lineWidth = Math.max(1, (2.5-i*0.4)*sc);
      ctx.beginPath();
      ctx.moveTo(cx + lineDir*6*sc, ly);
      ctx.lineTo(cx + lineDir*(6+llen)*sc, ly);
      ctx.stroke();
    }
    ctx.globalAlpha=1; ctx.shadowBlur=0; ctx.restore();
  }

  // Boss crown above head
  if (f.isBoss) drawBossCrown(cx, cy, HR, TL, LL, sc);
}

/* ── full stickman body ── */
function drawStickman(f, cx, cy, HR, TL, LL, AL, GY, sc) {
  const hurt = f.hurt > 0;
  const atk  = f.atk  > 0;
  const blk  = f.block;
  const fd   = f.facing;
  const wc   = f.walk;
  const w    = f.weapon;

  const isP1 = f.side === 'A';
  const baseCol   = isP1 ? '#ffd060' : '#40d0ff';
  const bodyCol   = hurt ? '#ff2200' : baseCol;
  const accentCol = hurt ? '#ff6600' : (w ? w.col : baseCol);
  const glow      = hurt ? 35 : atk ? 22 : blk ? 16 : 10;

  // Hurt recoil: tilt back when taking damage
  const hurtTilt = hurt ? (fd * -0.25) : 0;

  ctx.save();
  // Hurt recoil tilt
  if (hurt) {
    ctx.translate(cx, cy - TL - LL * 0.5);
    ctx.rotate(hurtTilt);
    ctx.translate(-cx, -(cy - TL - LL * 0.5));
  }
  ctx.shadowColor = accentCol;
  ctx.shadowBlur  = glow;

  /* head */
  const headY = cy - TL - LL - HR;
  ctx.strokeStyle = bodyCol;
  ctx.lineWidth   = Math.max(2, 3.5 * sc);
  ctx.beginPath(); ctx.arc(cx, headY, HR, 0, Math.PI * 2); ctx.stroke();

  /* face */
  ctx.shadowBlur = 0;
  const eo = fd * 4 * sc;
  ctx.fillStyle = hurt ? '#ff3333' : '#111';
  ctx.beginPath(); ctx.arc(cx + eo + fd*3*sc, headY - 3*sc, 2.5*sc, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + eo - fd*2*sc, headY - 3*sc, 2.5*sc, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = hurt ? '#ff3333' : blk ? '#00e660' : '#2a2a2a';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  if (hurt)      { ctx.moveTo(cx+eo-4*sc,headY+5*sc); ctx.lineTo(cx+eo+4*sc,headY+5*sc); }
  else if (blk)  { ctx.arc(cx+eo, headY+5*sc, 4*sc, Math.PI+.15, -.15); }
  else           { ctx.arc(cx+eo, headY+3*sc, 4*sc, .2, Math.PI-.2); }
  ctx.stroke();

  ctx.shadowColor = accentCol; ctx.shadowBlur = glow;
  ctx.strokeStyle = bodyCol;

  /* torso */
  const shoulderY = headY + HR + 5*sc;
  const hipY      = shoulderY + TL;
  ctx.lineWidth = Math.max(1.5, 2.5*sc);
  ctx.beginPath(); ctx.moveTo(cx, headY+HR); ctx.lineTo(cx, shoulderY); ctx.stroke();
  ctx.lineWidth = Math.max(2, 3.2*sc);
  ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(cx, hipY); ctx.stroke();

  /* arms */
  const idle    = Math.sin(wc * Math.PI * 2) * 8;
  const atkSwing = atk ? fd * 38 : 0;
  let waa;
  if (blk)       waa = fd===1 ? -.25 : Math.PI+.25;
  else if (atk)  waa = fd===1 ? -.22 + atkSwing*.018 : Math.PI+.22 - atkSwing*.018;
  else           waa = fd===1 ? .52 + idle*.018 : Math.PI - .52 - idle*.018;

  const wax = cx + Math.cos(waa)*AL;
  const way = shoulderY + 6*sc + Math.sin(waa)*AL;

  /* weapon arm */
  ctx.strokeStyle = w ? w.col : accentCol;
  ctx.lineWidth   = Math.max(2, 3.8*sc);
  ctx.shadowColor = w ? w.col : accentCol;
  ctx.shadowBlur  = atk ? 22 : blk ? 14 : 9;
  ctx.beginPath(); ctx.moveTo(cx, shoulderY+5*sc); ctx.lineTo(wax, way); ctx.stroke();

  /* other arm */
  const oaa = fd===1 ? Math.PI-.45-idle*.018 : .45+idle*.018;
  const oax = cx + Math.cos(oaa)*(AL*.85);
  const oay = shoulderY + 5*sc + Math.sin(oaa)*(AL*.85);
  ctx.strokeStyle = bodyCol;
  ctx.lineWidth   = Math.max(1.5, 2.5*sc);
  ctx.shadowColor = accentCol; ctx.shadowBlur = glow;
  ctx.beginPath(); ctx.moveTo(cx, shoulderY+5*sc); ctx.lineTo(oax, oay); ctx.stroke();

  /* weapon held */
  if (w) drawWeapon(wax, way, waa, w, atk, blk, fd, sc);

  /* legs */
  const ls  = Math.sin(wc * Math.PI * 2) * 20;
  const ls2 = Math.sin(wc * Math.PI * 2 + Math.PI) * 20;
  ctx.strokeStyle = bodyCol;
  ctx.lineWidth   = Math.max(1.5, 2.9*sc);
  ctx.shadowColor = accentCol; ctx.shadowBlur = glow;

  const fla = Math.PI/2 + ls*.03;
  const flx = cx + Math.cos(fla)*LL*fd;
  const fly = hipY + Math.sin(Math.PI/2 + Math.abs(ls)*.03)*LL;
  ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(flx, fly); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(flx, fly); ctx.lineTo(flx + fd*10*sc, fly + 2*sc); ctx.stroke();

  const blx = cx - Math.cos(Math.PI/2-.18)*LL*fd*.6;
  const bly = hipY + Math.sin(Math.PI/2 + Math.abs(ls2)*.03)*LL*.88;
  ctx.globalAlpha = .6;
  ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(blx, bly); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(blx, bly); ctx.lineTo(blx + fd*8*sc, bly + 2*sc); ctx.stroke();
  ctx.globalAlpha = 1;

  /* ground shadow */
  ctx.shadowBlur = 0;
  ctx.fillStyle  = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(cx, GY + 6, 24*sc, 5*sc, 0, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

/* ── weapon in stickman's hand ── */
function drawWeapon(hx, hy, ang, w, atk, blk, fd, sc) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang + (atk ? fd * 0.6 : 0));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const glow = atk ? 28 : blk ? 16 : 10;
  ctx.shadowColor = w.col; ctx.shadowBlur = glow;
  ctx.strokeStyle = w.col; ctx.fillStyle = w.col;
  const L = w.range * 0.34 * sc;
  const s2 = Math.max(0.5, sc);

  switch (w.id) {

    case 'SWORD': {
      if (atk) {
        // Motion blur / slash trail
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = w.col; ctx.lineWidth = 8 * s2;
        ctx.beginPath(); ctx.moveTo(0, 8*s2); ctx.lineTo(L, 8*s2); ctx.stroke();
        ctx.globalAlpha = 0.1;
        ctx.lineWidth = 12 * s2;
        ctx.beginPath(); ctx.moveTo(0, 14*s2); ctx.lineTo(L*0.7, 14*s2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Blade - tapered wide at base, narrows to point
      const bGrad = ctx.createLinearGradient(0, -5*s2, 0, 5*s2);
      bGrad.addColorStop(0, w.col); bGrad.addColorStop(0.5, '#ffffff'); bGrad.addColorStop(1, w.col);
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.moveTo(-2*s2, -4*s2);
      ctx.lineTo(L*0.8, -2*s2);
      ctx.lineTo(L, 0);
      ctx.lineTo(L*0.8,  2*s2);
      ctx.lineTo(-2*s2,  4*s2);
      ctx.closePath(); ctx.fill();
      // Blood groove (fuller)
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1 * s2;
      ctx.beginPath(); ctx.moveTo(L*0.1, 0); ctx.lineTo(L*0.75, 0); ctx.stroke();
      // Crossguard
      ctx.fillStyle = '#aaaaaa';
      ctx.beginPath(); ctx.roundRect(-2*s2, -13*s2, 4*s2, 26*s2, 2); ctx.fill();
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(-2*s2, -13*s2, 4*s2, 26*s2, 2); ctx.stroke();
      // Grip (wrapped)
      ctx.strokeStyle = '#5C3317'; ctx.lineWidth = 5.5 * s2;
      ctx.beginPath(); ctx.moveTo(-14*s2, 0); ctx.lineTo(-3*s2, 0); ctx.stroke();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5 * s2;
      for (let gi = -12; gi <= -4; gi += 3) {
        ctx.beginPath(); ctx.moveTo(gi*s2,-4*s2); ctx.lineTo((gi+2)*s2,4*s2); ctx.stroke();
      }
      // Pommel (round ball)
      const pg = ctx.createRadialGradient(-14*s2,-2*s2,0,-14*s2,0,5*s2);
      pg.addColorStop(0,'#ffffff'); pg.addColorStop(1, w.col);
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(-14*s2, 0, 5*s2, 0, Math.PI*2); ctx.fill();
      break;
    }

    case 'KATANA': {
      // Slightly curved single-edge blade
      ctx.lineWidth = 3.5 * s2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(L*0.5, -8*s2, L, -4*s2);
      ctx.stroke();
      // Spine (back edge, thicker)
      ctx.lineWidth = 1.5 * s2;
      ctx.strokeStyle = w.col + 'aa';
      ctx.beginPath();
      ctx.moveTo(0, 2*s2);
      ctx.quadraticCurveTo(L*0.5, -5*s2, L*0.95, -3*s2);
      ctx.stroke();
      // Tsuba (round guard)
      ctx.strokeStyle = w.col; ctx.fillStyle = w.col + '55';
      ctx.lineWidth = 2.5 * s2;
      ctx.beginPath(); ctx.ellipse(0, 0, 8*s2, 10*s2, 0, 0, Math.PI*2);
      ctx.stroke(); ctx.fill();
      // Grip wrapping
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2 * s2;
      for (let i = -18; i <= -4; i += 5) {
        ctx.beginPath(); ctx.moveTo(i*s2, -5*s2); ctx.lineTo((i+2)*s2, 5*s2); ctx.stroke();
      }
      break;
    }

    case 'HAMMER': {
      // Handle
      ctx.strokeStyle = '#5C3317'; ctx.lineWidth = 4 * s2;
      ctx.beginPath(); ctx.moveTo(-8*s2, 0); ctx.lineTo(L*0.7, 0); ctx.stroke();
      // Hammerhead - forged steel block
      const hW = 18*s2, hH = L*0.5;
      const hGrad = ctx.createLinearGradient(L*0.65, -hH/2, L*0.65+hW, hH/2);
      hGrad.addColorStop(0, '#666'); hGrad.addColorStop(0.3, w.col); hGrad.addColorStop(1, '#333');
      ctx.fillStyle = hGrad; ctx.strokeStyle = w.col;
      ctx.lineWidth = 1.5 * s2;
      ctx.beginPath(); ctx.roundRect(L*0.65, -hH/2, hW, hH, 3); ctx.fill(); ctx.stroke();
      // Strike face plate
      ctx.fillStyle = atk ? '#ffffff' : '#aaaaaa';
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.roundRect(L*0.65+hW*0.72, -hH/2+2, hW*0.28-2, hH-4, 2); ctx.fill();
      ctx.globalAlpha = 1;
      // Raised ridge on top of head
      ctx.strokeStyle = '#888'; ctx.lineWidth = 2 * s2;
      ctx.beginPath(); ctx.moveTo(L*0.67,-hH/2+3); ctx.lineTo(L*0.67+hW-4,-(hH/2)+3); ctx.stroke();
      if (atk) {
        // Shockwave rings when swinging hard
        ctx.strokeStyle = w.col; ctx.lineWidth = 2 * s2;
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.ellipse(L*0.65+hW, 0, hH*0.7, hH*0.4, 0, -Math.PI*0.7, Math.PI*0.7); ctx.stroke();
        ctx.globalAlpha = 0.2;
        ctx.beginPath(); ctx.ellipse(L*0.65+hW, 0, hH*1.1, hH*0.65, 0, -Math.PI*0.7, Math.PI*0.7); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Grip wrapping (leather)
      ctx.strokeStyle = '#1a0d00'; ctx.lineWidth = 1.5 * s2;
      for (let gi = 0; gi < L*0.62; gi += 7) {
        ctx.beginPath(); ctx.moveTo(gi*s2,-3.5*s2); ctx.lineTo((gi+4)*s2,3.5*s2); ctx.stroke();
      }
      break;
    }

    case 'AXE': {
      // Handle
      ctx.strokeStyle = '#5C3317'; ctx.lineWidth = 4 * s2;
      ctx.beginPath(); ctx.moveTo(-6*s2, 0); ctx.lineTo(L*0.62, 0); ctx.stroke();
      // Axe head (crescent shape)
      ctx.fillStyle = w.col; ctx.strokeStyle = w.col;
      ctx.lineWidth = 2 * s2;
      ctx.beginPath();
      ctx.moveTo(L*0.55, -L*0.38);
      ctx.bezierCurveTo(L*0.9, -L*0.35, L*1.1, -L*0.1, L*0.9, L*0.05);
      ctx.bezierCurveTo(L*1.1, L*0.2,  L*0.85, L*0.32, L*0.55, L*0.28);
      ctx.bezierCurveTo(L*0.72, L*0.1, L*0.72, -L*0.12, L*0.55, -L*0.38);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Edge highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5 * s2;
      ctx.beginPath();
      ctx.moveTo(L*0.9, -L*0.05);
      ctx.bezierCurveTo(L*1.08, L*0.05, L*1.08, L*0.15, L*0.9, L*0.22);
      ctx.stroke();
      break;
    }

    case 'SPEAR': {
      if (atk) {
        // Thrusting motion lines
        ctx.strokeStyle = w.col; ctx.lineWidth = 2 * s2;
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(L*0.3,-6*s2); ctx.lineTo(L*0.8,-6*s2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L*0.3, 6*s2); ctx.lineTo(L*0.8, 6*s2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Long two-tone pole
      ctx.strokeStyle = '#6B3A0F'; ctx.lineWidth = 3.5 * s2;
      ctx.beginPath(); ctx.moveTo(-18*s2, 0); ctx.lineTo(L*0.7, 0); ctx.stroke();
      // Pole bands
      ctx.strokeStyle = '#888'; ctx.lineWidth = 2 * s2;
      ctx.beginPath(); ctx.moveTo(-5*s2,-3*s2); ctx.lineTo(-5*s2,3*s2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L*0.35,-3*s2); ctx.lineTo(L*0.35,3*s2); ctx.stroke();
      // Socket (where head meets pole)
      ctx.fillStyle = '#777'; ctx.strokeStyle = '#555';
      ctx.lineWidth = 1 * s2;
      ctx.beginPath(); ctx.roundRect(L*0.68, -4*s2, 8*s2, 8*s2, 2); ctx.fill(); ctx.stroke();
      // Leaf-shaped spearhead
      const sGrad = ctx.createLinearGradient(L*0.72,-9*s2,L*0.88,0);
      sGrad.addColorStop(0,w.col); sGrad.addColorStop(0.5,'#ffffff'); sGrad.addColorStop(1,w.col);
      ctx.fillStyle = sGrad; ctx.strokeStyle = w.col;
      ctx.lineWidth = 1 * s2;
      ctx.beginPath();
      ctx.moveTo(L, 0);
      ctx.bezierCurveTo(L*0.95,-5*s2, L*0.82,-10*s2, L*0.74,-9*s2);
      ctx.lineTo(L*0.72, 0);
      ctx.lineTo(L*0.74,  9*s2);
      ctx.bezierCurveTo(L*0.82, 10*s2, L*0.95, 5*s2, L, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Center ridge of spearhead
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1 * s2;
      ctx.beginPath(); ctx.moveTo(L*0.74,0); ctx.lineTo(L*0.97,0); ctx.stroke();
      // Lugs (side stoppers)
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.moveTo(L*0.72,-9*s2); ctx.lineTo(L*0.64,-15*s2); ctx.lineTo(L*0.68,-9*s2); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(L*0.72, 9*s2); ctx.lineTo(L*0.64, 15*s2); ctx.lineTo(L*0.68, 9*s2); ctx.closePath(); ctx.fill();
      // Butt spike
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.moveTo(-18*s2,0); ctx.lineTo(-12*s2,-3*s2); ctx.lineTo(-12*s2,3*s2); ctx.closePath(); ctx.fill();
      break;
    }

    case 'DAGGER': {
      if (atk) {
        // Triple slash streaks (3 quick stabs)
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = w.col; ctx.lineWidth = 3 * s2;
        ctx.beginPath(); ctx.moveTo(L*0.1,-8*s2); ctx.lineTo(L*0.9,-8*s2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L*0.2, 0);    ctx.lineTo(L,     0);    ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L*0.1, 8*s2); ctx.lineTo(L*0.9, 8*s2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Double-edged blade (both edges visible)
      ctx.fillStyle = 'url(#daggerGrad)';
      const dGrad = ctx.createLinearGradient(0,-5*s2,0,5*s2);
      dGrad.addColorStop(0,w.col); dGrad.addColorStop(0.5,'#ffffff'); dGrad.addColorStop(1,w.col);
      ctx.fillStyle = dGrad;
      ctx.beginPath();
      ctx.moveTo(-2*s2, -3*s2);
      ctx.lineTo(L*0.75, -2*s2);
      ctx.lineTo(L, 0);
      ctx.lineTo(L*0.75,  2*s2);
      ctx.lineTo(-2*s2,  3*s2);
      ctx.closePath(); ctx.fill();
      // Center groove
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8 * s2;
      ctx.beginPath(); ctx.moveTo(L*0.05,0); ctx.lineTo(L*0.72,0); ctx.stroke();
      // S-shaped quillon
      ctx.strokeStyle = '#999'; ctx.lineWidth = 3 * s2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-2*s2,-10*s2); ctx.bezierCurveTo(4*s2,-4*s2,-4*s2,4*s2,2*s2,10*s2); ctx.stroke();
      // Wrapped grip
      ctx.strokeStyle = '#1a0a00'; ctx.lineWidth = 5 * s2;
      ctx.beginPath(); ctx.moveTo(-12*s2,0); ctx.lineTo(-3*s2,0); ctx.stroke();
      ctx.strokeStyle = w.col + 'aa'; ctx.lineWidth = 1 * s2;
      for (let di = -11; di <= -4; di += 2.5) {
        ctx.beginPath(); ctx.moveTo(di*s2,-3*s2); ctx.lineTo((di+1.5)*s2,3*s2); ctx.stroke();
      }
      // Pommel knob
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.arc(-13*s2, 0, 3.5*s2, 0, Math.PI*2); ctx.fill();
      break;
    }

    case 'SHIELD': {
      // Arm brace
      ctx.strokeStyle = '#555'; ctx.lineWidth = 4 * s2;
      ctx.beginPath(); ctx.moveTo(-8*s2, 0); ctx.lineTo(L*0.32, 0); ctx.stroke();
      // Shield body (kite shape)
      ctx.fillStyle = w.col + 'cc'; ctx.strokeStyle = w.col;
      ctx.lineWidth = 2.5 * s2;
      ctx.beginPath();
      ctx.moveTo(L*0.3, -L*0.4);
      ctx.bezierCurveTo(L*0.85, -L*0.38, L*0.95, -L*0.1, L*0.8, L*0.35);
      ctx.lineTo(L*0.55, L*0.55);
      ctx.lineTo(L*0.3, L*0.35);
      ctx.bezierCurveTo(L*0.15, -L*0.1, L*0.25, -L*0.38, L*0.3, -L*0.4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Boss (center metal stud)
      ctx.fillStyle = '#aaa';
      ctx.beginPath(); ctx.arc(L*0.6, 0, 5*s2, 0, Math.PI*2); ctx.fill();
      // Rim highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5 * s2;
      ctx.beginPath();
      ctx.moveTo(L*0.32, -L*0.3);
      ctx.bezierCurveTo(L*0.78, -L*0.3, L*0.88, -L*0.05, L*0.75, L*0.28);
      ctx.stroke();
      break;
    }

    case 'CLUB': {
      if (atk) {
        // Massive swing arc indicator
        ctx.strokeStyle = w.col; ctx.lineWidth = 4 * s2;
        ctx.globalAlpha = 0.2;
        ctx.beginPath(); ctx.arc(0, 0, L*0.9, -0.4, 0.4); ctx.stroke();
        ctx.lineWidth = 8 * s2; ctx.globalAlpha = 0.08;
        ctx.beginPath(); ctx.arc(0, 0, L*0.9, -0.5, 0.5); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Tapered wooden handle (thicker near head)
      const cHandleGrad = ctx.createLinearGradient(-8*s2,0,L*0.58,0);
      cHandleGrad.addColorStop(0,'#3D1F05'); cHandleGrad.addColorStop(1,'#7B4A1A');
      ctx.strokeStyle = cHandleGrad; ctx.lineWidth = 5 * s2;
      ctx.beginPath(); ctx.moveTo(-8*s2, 0); ctx.lineTo(L*0.52, 0); ctx.stroke();
      // Wood grain lines
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1 * s2;
      ctx.beginPath(); ctx.moveTo(L*0.1,2*s2); ctx.lineTo(L*0.48,3*s2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L*0.1,-2*s2); ctx.lineTo(L*0.48,-3*s2); ctx.stroke();
      // Metal bands near head
      ctx.strokeStyle = '#888'; ctx.lineWidth = 3 * s2;
      ctx.beginPath(); ctx.moveTo(L*0.5,-5*s2); ctx.lineTo(L*0.5,5*s2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L*0.55,-4*s2); ctx.lineTo(L*0.55,4*s2); ctx.stroke();
      // Spiked ball head
      const cGrad = ctx.createRadialGradient(L*0.78, -4*s2, 1, L*0.78, 0, L*0.27);
      cGrad.addColorStop(0,'#ddbb66'); cGrad.addColorStop(0.5,w.col); cGrad.addColorStop(1,'#220000');
      ctx.fillStyle = cGrad; ctx.strokeStyle = w.col;
      ctx.lineWidth = 2 * s2;
      ctx.shadowColor = atk ? w.col : 'transparent'; ctx.shadowBlur = atk ? 18 : 0;
      ctx.beginPath(); ctx.arc(L*0.78, 0, L*0.25, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      // Metal spikes (longer, more menacing)
      const numSpikes = 8;
      for (let si = 0; si < numSpikes; si++) {
        const sa = (Math.PI*2/numSpikes)*si;
        const sBase = L*0.25, sTip = L*0.36;
        const sx1 = L*0.78 + Math.cos(sa)*sBase;
        const sy1 = Math.sin(sa)*sBase;
        const sx2 = L*0.78 + Math.cos(sa)*sTip;
        const sy2 = Math.sin(sa)*sTip;
        const sxL = L*0.78 + Math.cos(sa+0.3)*sBase;
        const syL = Math.sin(sa+0.3)*sBase;
        ctx.fillStyle = atk ? '#ffffff' : '#cccccc';
        ctx.beginPath();
        ctx.moveTo(sx2,sy2);
        ctx.lineTo(sx1,sy1);
        ctx.lineTo(sxL,syL);
        ctx.closePath(); ctx.fill();
        // Spike outline
        ctx.strokeStyle = '#666'; ctx.lineWidth = 0.8 * s2;
        ctx.beginPath(); ctx.moveTo(sx1,sy1); ctx.lineTo(sx2,sy2); ctx.stroke();
      }
      // Highlight gleam
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(L*0.72,-L*0.08,L*0.07,0,Math.PI*2); ctx.fill();
      break;
    }
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

/* ── dead stickman ── */
function drawDeadStick(cx, GY, facing, HR, sc) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.translate(cx, GY);
  ctx.rotate(facing * 0.55);
  ctx.strokeStyle = '#666'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(HR*2, -2, HR, 0, Math.PI*2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(HR*3,-2);   ctx.lineTo(HR*3+32*sc,-2);
  ctx.moveTo(HR*3+10*sc,-2);  ctx.lineTo(HR*3+6*sc,-18*sc);
  ctx.moveTo(HR*3+10*sc,-2);  ctx.lineTo(HR*3+22*sc,-10*sc);
  ctx.moveTo(HR*3+20*sc,-2);  ctx.lineTo(HR*3+16*sc,14*sc);
  ctx.moveTo(HR*3+20*sc,-2);  ctx.lineTo(HR*3+30*sc,12*sc);
  ctx.stroke();
  ctx.globalAlpha = 1; ctx.restore();
}

/* ── FIGHT flash (round start / round end) ── */
function drawFlash(label, text, sub, W, H) {
  ctx.fillStyle = 'rgba(5,8,15,.82)'; ctx.fillRect(0,0,W,H);
  const bw=Math.min(420,W*.9), bh=140, bx=W/2-bw/2, by=H/2-bh/2;
  ctx.fillStyle = 'rgba(5,8,20,.95)';
  ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,8); ctx.fill();
  ctx.strokeStyle = '#00f5d4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,8); ctx.stroke();

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,245,212,.6)'; ctx.font = 'bold 13px Orbitron,monospace';
  ctx.fillText(label, W/2, by+32);
  ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.min(32,W*.04)}px Orbitron,monospace`;
  ctx.shadowColor = '#00f5d4'; ctx.shadowBlur = 18;
  ctx.fillText(text, W/2, by+90);
  ctx.shadowBlur = 0;
  if (sub) { ctx.fillStyle='rgba(255,255,255,.5)'; ctx.font='14px Rajdhani,sans-serif'; ctx.fillText(sub,W/2,by+118); }
}

/* ── match result overlay (on canvas) ── */
let resBtns = [];

function drawResult(s, W, H) {
  ctx.fillStyle = 'rgba(5,8,15,.88)'; ctx.fillRect(0,0,W,H);
  const bw=Math.min(460,W*.9), bh=230, bx=W/2-bw/2, by=H/2-bh/2;
  ctx.fillStyle = '#080c18';
  ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,8); ctx.fill();
  const bc = s.matchWinner==='A'?'#00f5d4':s.matchWinner==='B'?'#ff006e':'#ffd60a';
  ctx.strokeStyle=bc; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,8); ctx.stroke();

  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  const title = s.matchWinner==='A' ? 'PLAYER 1 WINS!'
              : s.matchWinner==='B' ? (s.vsAI?'CPU WINS!':'PLAYER 2 WINS!')
              : "IT'S A DRAW!";
  ctx.fillStyle=bc; ctx.font=`bold ${Math.min(30,W*.035)}px Orbitron,monospace`;
  ctx.shadowColor=bc; ctx.shadowBlur=16;
  ctx.fillText(title, W/2, by+65);
  ctx.shadowBlur=0;
  ctx.fillStyle='rgba(255,255,255,.5)'; ctx.font='14px Rajdhani,sans-serif';
  ctx.fillText('Best of 3  —  ' + s.scA + ' rounds  to  ' + s.scB, W/2, by+92);

  // score digits
  ctx.fillStyle='#00f5d4'; ctx.font='bold 38px Orbitron,monospace';
  ctx.fillText(s.scA, W/2-65, by+148);
  ctx.fillStyle='rgba(255,255,255,.3)'; ctx.font='bold 22px Orbitron,monospace';
  ctx.fillText('—', W/2, by+144);
  ctx.fillStyle='#ff006e'; ctx.font='bold 38px Orbitron,monospace';
  ctx.fillText(s.scB, W/2+65, by+148);

  // buttons
  const btnY = by + bh - 52;
  const btns = [
    {lbl:'⚔  REMATCH',   x:bx+16,       w:128, col:'#00f5d4', action:'rematch' },
    {lbl:'↺  WEAPONS',   x:bx+156,      w:128, col:'#ffd60a',  action:'weapons' },
    {lbl:'←  MENU',      x:bx+296,      w:100, col:'#ff006e',  action:'menu'    },
  ];
  btns.forEach(b => {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(b.x, btnY, b.w, 36);
    ctx.strokeStyle=b.col; ctx.lineWidth=1; ctx.strokeRect(b.x, btnY, b.w, 36);
    ctx.fillStyle=b.col; ctx.font='bold 10px Orbitron,monospace';
    ctx.fillText(b.lbl, b.x + b.w/2, btnY + 22);
  });
  resBtns = btns.map(b => ({...b, y:btnY}));
}

canvas.addEventListener('click', e => {
  if (!gameState || (gameState.phase !== 'MATCH_OVER')) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
  resBtns.forEach(b => {
    if (mx >= b.x && mx <= b.x+b.w && my >= b.y && my <= b.y+36) {
      doResultAction(b.action);
    }
  });
});

async function doResultAction(action) {
  const post = (body) => fetch(API + '/action', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({action: body})
  }).catch(() => {});

  if (action === 'rematch') {
    await post('rematch');
    // state polling will pick up the new round
  } else if (action === 'menu') {
    await post('menu');
    stopPolling(); stopKeyPoll();
    goMenu();
  } else if (action === 'weapons') {
    await post('menu');
    stopPolling(); stopKeyPoll();
    pickStep = 0; w1sel = null; w2sel = null;
    startPick();
  }
}

/* ══════════════════════════════════════
   REPORT SCORE TO N5XT ADMIN PANEL
   Fire-and-forget: game works even if
   admin server is unreachable.
══════════════════════════════════════ */
let _scoreSent = false; // guard: only send once per match

const _ADMIN_API = window.location.origin + '/otp/admin_api.php';

/* Resolve real DB username ONLY via whoami — never trust plain localStorage
   keys because they are shared across tabs and overwritten on each login. */
async function _resolveP1Name() {
  const token = localStorage.getItem('n5xt_session');
  if (token && token.trim().length > 0) {
    try {
      const res = await fetch(
        `${_ADMIN_API}?action=whoami&token=${encodeURIComponent(token.trim())}`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.username) return data.username;
      }
    } catch (e) { /* ignore — use fallback */ }
  }
  return 'PLAYER 1';
}

/* Fetch per-user Stickman Duel W/L/D from admin DB */
async function fetchDuelUserStats() {
  try {
    const username = await _resolveP1Name();
    if (!username || username === 'PLAYER 1') return;
    const res = await fetch(
      `${_ADMIN_API}?action=user_stats&username=${encodeURIComponent(username)}&game=StickmanDuel`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) {
      document.getElementById('msW').textContent = data.wins;
      document.getElementById('msL').textContent = data.losses;
      document.getElementById('msD').textContent = data.draws;
    }
  } catch (e) { /* non-critical */ }
}

async function maybeReportScore(s) {
  if (_scoreSent) return;
  if (!s || s.phase !== 'MATCH_OVER') return;
  _scoreSent = true;

  const p1Name = await _resolveP1Name();
  console.log('[StickmanDuel] Reporting score as player:', p1Name);

  const p2Name = vsAI ? `CPU (${aiDifficulty})` : 'PLAYER 2';
  const winner =
    s.matchWinner === 'A' ? p1Name :
    s.matchWinner === 'B' ? p2Name :
    'DRAW';

  const payload = {
    game:       'StickmanDuel',
    player1:    p1Name,
    player2:    p2Name,
    mode:       vsAI ? 'PvAI' : 'PvP',
    difficulty: vsAI ? aiDifficulty : '',
    winner:     winner,
    p1_wins:    s.scA ?? 0,
    p2_wins:    s.scB ?? 0,
    p1_weapon:  w1sel ? w1sel.id : '',
    p2_weapon:  w2sel ? w2sel.id : '',
  };

  fetch(`${_ADMIN_API}?action=save_score`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload)
  })
  .then(() => fetchDuelUserStats())  // refresh per-user W/L/D after save
  .catch(() => { /* silently ignore — admin may not be running */ });
}

/* ══════════════════════════════════════
   HOW TO PLAY
══════════════════════════════════════ */
function buildHowTo() {
  const rows = [
    ['Move Left',  'A', '←'],
    ['Move Right', 'D', '→'],
    ['Jump',       'W', '↑'],
    ['Attack',     'F', 'L'],
    ['Block',      'G', ';'],
    ['Dash',      'Double click', 'A/D'],
  ];
  document.getElementById('ctrlTbl').innerHTML = rows.map(r => `
    <div class="ctrl-row">
      <span>${r[0]}</span>
      <div style="display:flex;gap:4px">
        <span class="ctrl-key">${r[1]}</span>
        <span class="ctrl-key">${r[2]}</span>
      </div>
    </div>`).join('');

  document.getElementById('wMiniList').innerHTML = WEAPONS.map(w => `
    <div class="wmini-row">
      <span>${w.icon} ${w.name} <span style="color:rgba(255,255,255,.4)">${w.type}</span></span>
      <span>${w.desc.split('.')[0]}.</span>
    </div>`).join('');
}

/* ══════════════════════════════════════
   BUTTON WIRING
══════════════════════════════════════ */
document.getElementById('menuTopBtn').addEventListener('click', () => { stopPolling(); stopKeyPoll(); window.location.href = 'GSH.html'; });
document.getElementById('btnAI').addEventListener('click',   () => { vsAI=true; showScreen('screenDiff'); });
document.getElementById('btnPVP').addEventListener('click',  () => { vsAI=false; startPick(); });
document.getElementById('btnHowTo').addEventListener('click',() => { buildHowTo(); showScreen('screenHowTo'); });
document.getElementById('howToBack').addEventListener('click', goMenu);
document.getElementById('wsBk').addEventListener('click', () => {
  if (pickStep === 0) goMenu();
  else { pickStep=0; selW=w1sel; updatePickPhase(); }
});
document.getElementById('wsOK').addEventListener('click', confirmPick);

/* ══════════════════════════════════════
   BOOT
══════════════════════════════════════ */
buildHowTo();
showScreen('screenMenu');
checkServer();
fetchDuelUserStats();
startRetryLoop();

// Difficulty screen
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    aiDifficulty = btn.dataset.diff;
    startPick();
  });
});
document.getElementById('diffBack').addEventListener('click', () => showScreen('screenMenu'));

})();