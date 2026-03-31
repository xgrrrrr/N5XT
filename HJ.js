// ════════════════════════════════════════════════
//  HJ.js  —  Horse Racing · Game Logic
//
//  Coin persistence is handled entirely by HS.js.
//  HS.js MUST be loaded before this file in HTML.
// ════════════════════════════════════════════════

// ════════════════════════════════════════════════
//  HORSE DATA
// ════════════════════════════════════════════════
const HORSES = [
  { id:1, name:'STARTER',   color:'#4488FF', jcolor:'#FFFFFF', baseSpeed:2.8 },
  { id:2, name:'FINISHER',  color:'#FF44AA', jcolor:'#FFFF00', baseSpeed:2.6 },
  { id:3, name:'SPRINTER',  color:'#FF4444', jcolor:'#44FFFF', baseSpeed:3.0 },
  { id:4, name:'LIGHTNING', color:'#EEEEEE', jcolor:'#FF4444', baseSpeed:2.5 },
  { id:5, name:'THUNDER',   color:'#FFCC00', jcolor:'#005500', baseSpeed:2.9 },
];

const PAIRS = [];
for (let i = 0; i < HORSES.length; i++)
  for (let j = i + 1; j < HORSES.length; j++)
    PAIRS.push([HORSES[i].id, HORSES[j].id]);

// ════════════════════════════════════════════════
//  STATE  (loaded from HS.js / CoinStorage on startup)
// ════════════════════════════════════════════════
// State starts at defaults — overwritten by boot() after server responds
let coins      = 500;
let wonTotal   = 0;
let totalRaces = 0;
let playerName = 'GUEST';   // resolved from n5xt_session on boot

let betType = 'win', winPick = null, exactaPick = null;
let triPicks = [], betAmount = 0, currentOdds = {};
let raceRunning = false, finishOrder = [], horsePositions = [];
let trackWidth = 0, raceInterval = null, lastResults = [];
let horseForm = {}, horseWinProb = {};

// ════════════════════════════════════════════════
//  BOOT  –  Step 1: show player-select screen
//           Step 2: bootGame() runs after pick
// ════════════════════════════════════════════════

// Step 1 — runs immediately on page load
// showPlayerSelect() is defined in HS.js
window.addEventListener('DOMContentLoaded', () => {
  showPlayerSelect();
});

// Step 2 — called by onSelectPlayer() in HS.js
//          after the user taps a player slot
async function bootGame() {
  const msg = document.getElementById('intro-coins-msg');
  msg.textContent = '★ LOADING YOUR COINS... ★';
  msg.style.color = '#FFCC00';

  // Show active player name in the header
  if (activePlayer) {
    const hdr = document.querySelector('#header .title');
    if (hdr) hdr.textContent = `🏇 HORSE RACING — ${activePlayer.name}`;
  }

  // ── Resolve logged-in username (3-layer fallback) ──
  try {
    const urlUser = new URLSearchParams(window.location.search).get('user');
    if (urlUser && urlUser.trim()) {
      playerName = urlUser.trim();
    } else {
      const session = localStorage.getItem('n5xt_session');
      if (session && session.trim()) {
        try {
          const res  = await fetch(`${window.location.origin}/otp/admin_api.php?action=whoami&token=${encodeURIComponent(session.trim())}`);
          const data = await res.json();
          if (data.success && data.username) {
            playerName = data.username;
          } else {
            playerName = session.trim();
          }
        } catch {
          playerName = session.trim();
        }
      }
    }
  } catch (e) {
    console.error('[HorseRacing] username resolution error:', e);
  }

  // If no website login found, fall back to the selected player label
  if (!playerName || playerName === 'GUEST') {
    playerName = activePlayer ? activePlayer.name : 'GUEST';
  }

  // Load coins from Java server (or localStorage fallback)
  const data = await CoinStorage.loadFromServer();
  coins      = data.coins;
  wonTotal   = data.net;
  totalRaces = data.races;

  document.getElementById('coins-val').textContent = coins;

  if (!data.newPlayer) {
    msg.textContent = `★ WELCOME BACK, ${playerName}! COINS: ${coins} ★`;
    msg.style.color  = coins >= 500 ? '#00FF44' : '#FF8844';
  } else {
    msg.textContent = `★ ${playerName} — 500 FREE COINS! ★`;
    msg.style.color  = '#00FF44';
    CoinStorage.saveAll(500, 0, 0);
  }
}

// ════════════════════════════════════════════════
//  GAME START  –  fires when player clicks INSERT COIN
// ════════════════════════════════════════════════
function startGame() {
  // ── Log session entry (HS.js) ───────────────
  CoinStorage.logEntry(coins);

  document.getElementById('intro').style.display = 'none';
  generateOdds();
  buildWinGrid();
  buildExactaGrid();
  buildTriGrid();
  buildHorses();
  updateCoins();
}

// ════════════════════════════════════════════════
//  ODDS  +  WIN PROBABILITY
// ════════════════════════════════════════════════
function generateOdds() {
  // 1. Assign hidden form 0.6–1.4
  HORSES.forEach(h => { horseForm[h.id] = 0.6 + Math.random() * 0.8; });

  // 2. Win probability proportional to form²
  let totalSq = 0;
  HORSES.forEach(h => { totalSq += horseForm[h.id] ** 2; });
  HORSES.forEach(h => { horseWinProb[h.id] = (horseForm[h.id] ** 2) / totalSq; });

  // 3. Map form rank → odds tiers
  const sorted = [...HORSES].sort((a, b) => horseForm[b.id] - horseForm[a.id]);
  const tiers  = [[2,3],[4,5],[6,8],[10,12],[15,20]];
  sorted.forEach((h, i) => {
    const t = tiers[i];
    currentOdds[h.id] = t[Math.floor(Math.random() * t.length)];
  });
}

function winMult(id)       { return currentOdds[id]; }
function exactaMult(a, b)  { return Math.round((currentOdds[a] + currentOdds[b]) * 1.6); }
function trifMult(a, b, c) { return Math.round((currentOdds[a] + currentOdds[b] + currentOdds[c]) * 4.5); }

// Probability label + colour ──────────────────────
function probLabel(p) {
  if (p >= 0.35) return { text:'🔥 HOT',    color:'#FF4400' };
  if (p >= 0.24) return { text:'⚡ STRONG',  color:'#FFCC00' };
  if (p >= 0.15) return { text:'➡ FAIR',    color:'#00CCFF' };
  if (p >= 0.08) return { text:'❄ COLD',    color:'#8899FF' };
                 return { text:'💀 LONG',    color:'#888888' };
}

// ════════════════════════════════════════════════
//  BUILD GRIDS
// ════════════════════════════════════════════════
function buildWinGrid() {
  const g = document.getElementById('win-grid');
  g.innerHTML = '';
  HORSES.forEach(h => {
    const p   = horseWinProb[h.id];
    const pct = Math.round(p * 100);
    const lbl = probLabel(p);
    const c   = document.createElement('div');
    c.className = 'horse-cell';
    c.id = `wc-${h.id}`;
    c.innerHTML = `
      <span class="hnum" style="color:${h.color}">#${h.id}</span>
      <span class="hname">${h.name}</span>
      <span class="hodds">${currentOdds[h.id]}:1</span>
      <span class="hprob-label" style="color:${lbl.color}">${lbl.text}</span>
      <div class="prob-bar-wrap">
        <div class="prob-bar-fill" style="width:${pct}%;background:${lbl.color}"></div>
      </div>
      <span class="prob-pct" style="color:${lbl.color}">${pct}%</span>`;
    c.onclick = () => pickWin(h.id);
    g.appendChild(c);
  });
}

function buildExactaGrid() {
  const g = document.getElementById('exacta-grid');
  g.innerHTML = '';
  PAIRS.forEach(([a, b]) => {
    const ha       = HORSES.find(h => h.id === a);
    const hb       = HORSES.find(h => h.id === b);
    const mult     = exactaMult(a, b);
    const combProb = Math.round((horseWinProb[a] + horseWinProb[b]) * 50);
    const c        = document.createElement('div');
    c.className = 'combo-cell';
    c.id = `ec-${a}-${b}`;
    c.innerHTML = `
      <span class="cpair">
        <span style="color:${ha.color}">#${a}</span>
        <span style="color:#777">+</span>
        <span style="color:${hb.color}">#${b}</span>
      </span>
      <span class="codds">${mult}:1</span>
      <span class="combo-prob">~${combProb}%</span>`;
    c.onclick = () => pickExacta(a, b);
    g.appendChild(c);
  });
}

function buildTriGrid() {
  const g = document.getElementById('tri-grid');
  g.innerHTML = '';
  HORSES.forEach(h => {
    const p   = horseWinProb[h.id];
    const pct = Math.round(p * 100);
    const lbl = probLabel(p);
    const c   = document.createElement('div');
    c.className = 'tri-cell';
    c.id = `tc-${h.id}`;
    c.innerHTML = `
      <span class="tnum" style="color:${h.color}">#${h.id}</span>
      <span class="tname">${h.name}</span>
      <span class="tprob" style="color:${lbl.color}">${lbl.text} ${pct}%</span>`;
    c.onclick = () => pickTri(h.id);
    g.appendChild(c);
  });
}

// ════════════════════════════════════════════════
//  PICKS & TABS
// ════════════════════════════════════════════════
function switchTab(tab) {
  betType = tab; winPick = null; exactaPick = null; triPicks = [];
  ['win','exacta','trifecta'].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`content-${t}`).style.display = t === tab ? '' : 'none';
  });
  refreshHighlights(); updateSummary();
}

function pickWin(id)      { if (raceRunning) return; winPick = id; refreshHighlights(); updateSummary(); }
function pickExacta(a, b) { if (raceRunning) return; exactaPick = [a,b]; refreshHighlights(); updateSummary(); }
function pickTri(id) {
  if (raceRunning) return;
  const idx = triPicks.indexOf(id);
  if (idx !== -1) triPicks.splice(idx, 1);
  else if (triPicks.length < 3) triPicks.push(id);
  refreshHighlights(); updateSummary();
}

function refreshHighlights() {
  HORSES.forEach(h => {
    const wc = document.getElementById(`wc-${h.id}`);
    if (wc) wc.classList.toggle('selected', winPick === h.id);
    const tc = document.getElementById(`tc-${h.id}`);
    if (tc) {
      tc.classList.remove('pick1','pick2','pick3');
      const pi = triPicks.indexOf(h.id);
      if (pi === 0) tc.classList.add('pick1');
      if (pi === 1) tc.classList.add('pick2');
      if (pi === 2) tc.classList.add('pick3');
    }
  });
  PAIRS.forEach(([a,b]) => {
    const ec = document.getElementById(`ec-${a}-${b}`);
    if (ec) ec.classList.toggle('selected', exactaPick && exactaPick[0]===a && exactaPick[1]===b);
  });
}

function setBet(amount, btn) {
  if (raceRunning) return;
  betAmount = amount;
  document.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateSummary();
}

function updateSummary() {
  let type = '—', pick = '—', winStr = '—';
  if (betType === 'win' && winPick) {
    const h = HORSES.find(h => h.id === winPick);
    type = 'WIN'; pick = `#${winPick} ${h.name}`;
    if (betAmount) winStr = betAmount * winMult(winPick);
  } else if (betType === 'exacta' && exactaPick) {
    const [a,b] = exactaPick;
    type = 'EXACTA'; pick = `#${a}+#${b}`;
    if (betAmount) winStr = betAmount * exactaMult(a,b);
  } else if (betType === 'trifecta' && triPicks.length === 3) {
    type = 'TRIFECTA'; pick = triPicks.map(id=>`#${id}`).join('→');
    if (betAmount) winStr = betAmount * trifMult(...triPicks);
  }
  document.getElementById('sum-type').textContent = type;
  document.getElementById('sum-pick').textContent = pick;
  document.getElementById('sum-bet').textContent  = betAmount || '—';
  document.getElementById('sum-win').textContent  = winStr;
}

// ════════════════════════════════════════════════
//  HORSE RENDERING
// ════════════════════════════════════════════════
function buildHorses() {
  document.querySelectorAll('.horse-container').forEach(e => e.remove());
  trackWidth = document.getElementById('track-area').clientWidth;
  const startX  = trackWidth * 0.08 + 10;
  const laneTop = [50,83,117,151,184];

  horsePositions = HORSES.map((h, i) => ({
    id: h.id, x: startX, baseSpeed: h.baseSpeed, lane: i,
    el: null, finished: false, frame: 0, place: 0,
    momentum: 1.0, fatigue: 0,
    sprintCooldown: 0, burstLeft: 0, burstStrength: 0,
    fastStarter: Math.random() < 0.35,
    lateSurger:  Math.random() < 0.35,
    erratic:     Math.random() < 0.25,
  }));

  horsePositions.forEach((hp, i) => {
    const h   = HORSES[i];
    const div = document.createElement('div');
    div.className = 'horse-container';
    div.id = `horse-${h.id}`;
    div.style.left = startX + 'px';
    div.style.top  = laneTop[i] + 'px';
    div.innerHTML  = makeHorse(h.color, h.jcolor, h.id, 0);
    document.getElementById('track-area').appendChild(div);
    hp.el = div;
  });
}

function makeHorse(hc, jc, num, frame) {
  const lo = frame % 2 === 0 ? 0 : 2;
  const mn = hc === '#EEEEEE' ? 'AAAAAA' : 'FFD700';
  return `<svg width="52" height="32" viewBox="0 0 52 32" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">
    <rect x="10" y="10" width="28" height="12" fill="${hc}"/>
    <rect x="8"  y="12" width="4"  height="8"  fill="${hc}"/>
    <rect x="36" y="11" width="4"  height="8"  fill="${hc}"/>
    <rect x="36" y="6"  width="10" height="8"  fill="${hc}"/>
    <rect x="44" y="8"  width="5"  height="4"  fill="${hc}"/>
    <rect x="38" y="4"  width="3"  height="3"  fill="${hc}"/>
    <rect x="46" y="8"  width="2"  height="2"  fill="#000"/>
    <rect x="8"  y="9"  width="3"  height="6"  fill="${hc}"/>
    <rect x="6"  y="14" width="3"  height="5"  fill="${hc}"/>
    <rect x="36" y="10" width="4"  height="3"  fill="#${mn}"/>
    <rect x="20" y="4"  width="12" height="10" fill="${jc}"/>
    <rect x="22" y="2"  width="8"  height="6"  fill="#FFCC99"/>
    <rect x="21" y="0"  width="10" height="5"  fill="${jc}"/>
    <rect x="22" y="5"  width="8"  height="7"  fill="rgba(0,0,0,0.3)"/>
    <text x="26" y="13" font-size="5" fill="white" text-anchor="middle" font-family="monospace" font-weight="bold">${num}</text>
    <rect x="14" y="22" width="4" height="${8+lo}" fill="${hc}"/>
    <rect x="20" y="22" width="4" height="${8-lo}" fill="${hc}"/>
    <rect x="26" y="22" width="4" height="${8+lo}" fill="${hc}"/>
    <rect x="32" y="22" width="4" height="${8-lo}" fill="${hc}"/>
    <rect x="14" y="${29+lo}" width="4" height="2" fill="#333"/>
    <rect x="20" y="${29-lo}" width="4" height="2" fill="#333"/>
    <rect x="26" y="${29+lo}" width="4" height="2" fill="#333"/>
    <rect x="32" y="${29-lo}" width="4" height="2" fill="#333"/>
  </svg>`;
}

// ════════════════════════════════════════════════
//  RACE ENGINE
// ════════════════════════════════════════════════
function startRace() {
  if (raceRunning) return;
  if (betType === 'win'      && !winPick)             { flashMsg('PICK A HORSE!');    return; }
  if (betType === 'exacta'   && !exactaPick)           { flashMsg('PICK A PAIR!');     return; }
  if (betType === 'trifecta' && triPicks.length < 3)   { flashMsg('PICK 3 HORSES!');   return; }
  if (!betAmount)                                      { flashMsg('SET BET AMOUNT!');  return; }
  if (coins < betAmount)                               { flashMsg('NOT ENOUGH COINS!');return; }

  coins -= betAmount;
  updateCoins();
  raceRunning = true;
  finishOrder = [];
  document.getElementById('start-btn').disabled = true;
  document.getElementById('result-overlay').classList.remove('show');
  document.getElementById('race-msg-text').textContent      = "AND THEY'RE OFF!";
  document.getElementById('odds-panel').style.opacity       = '0.4';
  document.getElementById('odds-panel').style.pointerEvents = 'none';
  document.getElementById('place-bets-label').textContent   = 'RACE IS ON!';
  document.getElementById('place-bets-label').classList.remove('pulsing');

  trackWidth = document.getElementById('track-area').clientWidth;
  const finishX = trackWidth * 0.92 - 52;
  const startX  = trackWidth * 0.08 + 10;
  buildHorses();
  horsePositions.forEach(hp => {
    hp.x = startX; hp.finished = false;
    hp.momentum = 1.0; hp.fatigue = 0;
    hp.sprintCooldown = 0; hp.burstLeft = 0;
  });

  let tick = 0;
  const totalTicks = 120;

  raceInterval = setInterval(() => {
    tick++;
    const racePct = Math.min(tick / totalTicks, 1);

    horsePositions.forEach(hp => {
      if (hp.finished) return;
      const form  = horseForm[hp.id] || 1.0;
      const horse = HORSES[hp.lane];

      // Burst sprint
      if (hp.burstLeft <= 0 && hp.sprintCooldown <= 0) {
        const burstChance = hp.lateSurger && racePct > 0.6 ? 0.06 : 0.025;
        if (Math.random() < burstChance) {
          hp.burstLeft      = 8  + Math.floor(Math.random() * 10);
          hp.burstStrength  = 0.8 + Math.random() * 1.0;
          hp.sprintCooldown = 25 + Math.floor(Math.random() * 20);
        }
      }
      if (hp.burstLeft > 0)      hp.burstLeft--;
      if (hp.sprintCooldown > 0) hp.sprintCooldown--;

      hp.fatigue += 0.003 * (hp.erratic ? 1.5 : 1.0);
      const fatiguePenalty = hp.fatigue * 0.4;
      const startBonus     = (hp.fastStarter && racePct < 0.3)  ? 0.6 * (1 - racePct / 0.3)       : 0;
      const surgeBonus     = (hp.lateSurger  && racePct > 0.65) ? 0.7 * ((racePct - 0.65) / 0.35) : 0;
      const momentumDrift  = (Math.random() - 0.5) * 0.12;
      hp.momentum = Math.max(0.6, Math.min(1.4, hp.momentum + momentumDrift));
      const variance   = hp.erratic ? (Math.random()-0.5)*2.2 : (Math.random()-0.5)*1.2;
      const burstBonus = hp.burstLeft > 0 ? hp.burstStrength : 0;

      const speed = hp.baseSpeed * form * hp.momentum
                  + startBonus + surgeBonus + burstBonus
                  - fatiguePenalty + variance;

      hp.x += Math.max(0.3, speed);
      hp.frame++;
      hp.el.style.left = hp.x + 'px';
      hp.el.innerHTML  = makeHorse(horse.color, horse.jcolor, horse.id, hp.frame);

      if (hp.x >= finishX) {
        hp.finished = true;
        finishOrder.push(hp.id);
        hp.place = finishOrder.length;
        const badge = document.createElement('div');
        badge.className = `place-badge place-${Math.min(hp.place,3)}`;
        badge.textContent = ['','1ST','2ND','3RD','4TH','5TH'][hp.place] || '';
        hp.el.appendChild(badge);
        if (finishOrder.length === 1) flashMsg(`#${hp.id} ${horse.name} WINS!`);
      }
    });

    if (finishOrder.length === HORSES.length) { clearInterval(raceInterval); endRace(); }
  }, 40);
}

// ════════════════════════════════════════════════
//  END RACE
// ════════════════════════════════════════════════
function endRace() {
  raceRunning = false;
  totalRaces++;
  const [p1,p2,p3] = finishOrder;
  const w1 = HORSES.find(h=>h.id===p1);
  const w2 = HORSES.find(h=>h.id===p2);
  const w3 = HORSES.find(h=>h.id===p3);
  let titleText='', titleColor='', detailLines=[], betLines=[], payout=0, isWin=false;

  if (betType === 'win') {
    isWin = winPick === p1;
    if (isWin) { payout = betAmount * winMult(winPick); coins += payout; wonTotal += payout - betAmount; }
    titleText  = isWin ? '🏆 YOU WIN! 🏆' : '💸 LOST! 💸';
    titleColor = isWin ? '#00FF44' : '#FF4444';
    detailLines = [`1ST: #${p1} ${w1.name}`, `2ND: #${p2} ${w2.name}`];
    betLines.push(isWin
      ? `WIN #${winPick} ✓  BET ${betAmount} → WIN ${payout}`
      : `WIN #${winPick} ✗  LOST ${betAmount}`);

  } else if (betType === 'exacta') {
    const [ea,eb] = exactaPick;
    isWin = [p1,p2].includes(ea) && [p1,p2].includes(eb);
    if (isWin) { payout = betAmount * exactaMult(ea,eb); coins += payout; wonTotal += payout - betAmount; }
    titleText  = isWin ? '🏆 EXACTA WIN! 🏆' : '💸 EXACTA LOST 💸';
    titleColor = isWin ? '#00FF44' : '#FF4444';
    detailLines = [`1ST: #${p1} ${w1.name}`, `2ND: #${p2} ${w2.name}`];
    betLines.push(isWin
      ? `EXACTA #${ea}+#${eb} ✓  BET ${betAmount} → WIN ${payout}`
      : `EXACTA #${ea}+#${eb} ✗  TOP2 WAS #${p1}+#${p2}`);

  } else if (betType === 'trifecta') {
    const [ta,tb,tc] = triPicks;
    isWin = ta===p1 && tb===p2 && tc===p3;
    if (isWin) { payout = betAmount * trifMult(ta,tb,tc); coins += payout; wonTotal += payout - betAmount; }
    titleText  = isWin ? '🏆 TRIFECTA!! 🏆' : '💸 TRIFECTA LOST 💸';
    titleColor = isWin ? '#FFD700' : '#FF4444';
    detailLines = [`1ST:#${p1} ${w1.name}`,`2ND:#${p2} ${w2.name}`,`3RD:#${p3} ${w3.name}`];
    betLines.push(isWin
      ? `TRIFECTA ✓  BET ${betAmount} → WIN ${payout}`
      : `YOUR PICK: #${ta}→#${tb}→#${tc} ✗`);
  }

  betLines.push(`COINS LEFT: ${coins}`);

  document.getElementById('result-title').textContent   = titleText;
  document.getElementById('result-title').style.color   = titleColor;
  document.getElementById('result-details').textContent = detailLines.join('\n');
  document.getElementById('result-bets').innerHTML = betLines
    .map(l=>`<div style="color:${l.includes('✓')?'#00FF44':l.includes('✗')?'#FF6666':'#FFFF88'}">${l}</div>`)
    .join('');
  document.getElementById('result-overlay').classList.add('show');
  document.getElementById('won-val').textContent = wonTotal;

  lastResults.unshift({p1,p2,p3});
  if (lastResults.length > 5) lastResults.pop();
  renderLastResults();
  updateCoins();

  // ── Save race result to admin dashboard ────
  saveRaceScore({
    finishOrder,
    betType,
    betPick : betType === 'win'      ? `#${winPick}`
            : betType === 'exacta'   ? `#${exactaPick[0]}+#${exactaPick[1]}`
            : triPicks.map(id=>`#${id}`).join('→'),
    betAmount,
    payout,
    isWin,
  });

  setTimeout(() => {
    document.getElementById('result-overlay').classList.remove('show');
    document.getElementById('start-btn').disabled = false;
    document.getElementById('odds-panel').style.opacity       = '1';
    document.getElementById('odds-panel').style.pointerEvents = 'auto';
    document.getElementById('place-bets-label').textContent   = 'PLACE YOUR BETS!';
    document.getElementById('place-bets-label').classList.add('pulsing');
    generateOdds();
    buildWinGrid(); buildExactaGrid(); buildTriGrid();
    winPick=null; exactaPick=null; triPicks=[];
    refreshHighlights(); updateSummary(); buildHorses();
    flashMsg('PLACE YOUR BETS!');
  }, 4500);
}

// ════════════════════════════════════════════════
//  SAVE RACE SCORE  →  admin_api.php
// ════════════════════════════════════════════════
async function saveRaceScore({ finishOrder, betType, betPick, betAmount, payout, isWin }) {
  try {
    const h = id => HORSES.find(h => h.id === id);
    const finishStr = finishOrder.map(id => `#${id} ${h(id).name}`).join(' › ');

    // playerName is resolved during boot() from n5xt_session → whoami
    const name = playerName || 'GUEST';

    await fetch(`${window.location.origin}/otp/admin_api.php?action=save_score`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        player1      : name,
        player2      : 'RACE',
        game         : 'HorseRacing',
        mode         : betType.toUpperCase(),          // WIN | EXACTA | TRIFECTA
        difficulty   : betPick,                        // e.g. "#3" / "#1+#2" / "#3→#1→#5"
        winner       : isWin ? name : 'HOUSE',
        p1_wins      : isWin ? 1 : 0,
        p2_wins      : isWin ? 0 : 1,
        p1_weapon    : finishStr,                      // finish order
        p2_weapon    : `BET ${betAmount} → ${isWin ? '+' + (payout - betAmount) : '-' + betAmount}`,
      }),
    });
  } catch (e) {
    // silent — never break the game if the server is unreachable
  }
}

// ════════════════════════════════════════════════
//  UI HELPERS
// ════════════════════════════════════════════════
function flashMsg(msg) { document.getElementById('race-msg-text').textContent = msg; }

function updateCoins() {
  document.getElementById('coins-val').textContent      = coins;
  document.getElementById('menu-coins-val').textContent = coins;
  CoinStorage.saveToServer(coins, wonTotal, totalRaces);   // saves to Java server + localStorage
}

function renderLastResults() {
  const el = document.getElementById('last-results');
  el.innerHTML = lastResults.map(r => {
    const h1 = HORSES.find(h=>h.id===r.p1);
    const h2 = HORSES.find(h=>h.id===r.p2);
    return `<span class="res-item">
      <span style="color:${h1.color}">#${r.p1}</span>
      <span style="color:#666">-</span>
      <span style="color:${h2.color}">#${r.p2}</span>
      <span style="color:#444"> | </span>
    </span>`;
  }).join('');
}

// ════════════════════════════════════════════════
//  MENU
// ════════════════════════════════════════════════
function goToMenu() {
  document.getElementById('menu-overlay').classList.add('show');
  document.getElementById('menu-coins-val').textContent = coins;
}

function closeMenu() { document.getElementById('menu-overlay').classList.remove('show'); }

function goToWebsite() {
  CoinStorage.logExit(coins, wonTotal, totalRaces, 'website_link');
  window.location.href = 'index.html'; // ← replace with your site URL
}

function quitToIntro() {
  if (raceInterval) { clearInterval(raceInterval); raceInterval = null; }
  raceRunning = false;
  CoinStorage.logExit(coins, wonTotal, totalRaces, 'quit');
  closeMenu();
  winPick=null; exactaPick=null; triPicks=[]; betAmount=0;
  document.getElementById('start-btn').disabled = false;
  document.getElementById('odds-panel').style.opacity       = '1';
  document.getElementById('odds-panel').style.pointerEvents = 'auto';
  document.getElementById('result-overlay').classList.remove('show');
  document.getElementById('place-bets-label').textContent   = 'PLACE YOUR BETS!';
  document.getElementById('place-bets-label').classList.add('pulsing');
  const msg = document.getElementById('intro-coins-msg');
  msg.textContent = `★ WELCOME BACK! YOUR COINS: ${coins} ★`;
  msg.style.color  = coins >= 500 ? '#00FF44' : '#FF8844';
  document.getElementById('intro').style.display = 'flex';
}

// ── Switch Player: save current coins then return to player-select ──
function switchPlayer() {
  if (raceInterval) { clearInterval(raceInterval); raceInterval = null; }
  raceRunning = false;
  CoinStorage.logExit(coins, wonTotal, totalRaces, 'switch_player');
  forgetPlayer();   // clears remembered slot → picker will show again
  closeMenu();
  // Reset all game state
  coins=500; wonTotal=0; totalRaces=0; playerName='GUEST';
  winPick=null; exactaPick=null; triPicks=[]; betAmount=0;
  document.getElementById('coins-val').textContent = 500;
  document.getElementById('won-val').textContent   = 0;
  document.getElementById('start-btn').disabled    = false;
  document.getElementById('odds-panel').style.opacity       = '1';
  document.getElementById('odds-panel').style.pointerEvents = 'auto';
  document.getElementById('result-overlay').classList.remove('show');
  document.getElementById('place-bets-label').textContent   = 'PLACE YOUR BETS!';
  document.getElementById('place-bets-label').classList.add('pulsing');
  document.getElementById('intro').style.display = 'none';
  const hdr = document.querySelector('#header .title');
  if (hdr) hdr.textContent = '🏇 HORSE RACING';
  showPlayerSelect();
}

// ════════════════════════════════════════════════
//  BACKGROUND
// ════════════════════════════════════════════════
function buildTrees() {
  ['seg1','seg2'].forEach(sid => {
    const seg = document.getElementById(sid);
    [20,80,140,200,270,340,410,480,540,610].forEach(x => {
      const t = document.createElement('div');
      t.className = 'tree'; t.style.left = x+'px';
      t.innerHTML = `<div class="tree-trunk"></div><div class="tree-top"></div><div class="tree-top2"></div>`;
      seg.appendChild(t);
    });
  });
}

let bgX = 0;
function animateBg() {
  if (raceRunning) {
    bgX -= 3;
    const total = document.getElementById('seg1').offsetWidth;
    if (Math.abs(bgX) >= total) bgX = 0;
    document.getElementById('bg-layer').style.transform = `translateX(${bgX}px)`;
  }
  requestAnimationFrame(animateBg);
}

buildTrees();
animateBg();