// ── Java Backend Config ────────────────────────────────────────────────────
const JAVA_API = 'http://localhost:8765';
let javaOnline = false;   // flips to true once /health confirms

// ── Admin API endpoint (same origin as the page) ───────────────────────────
const ADMIN_API = window.location.origin + '/otp/admin_api.php';

// ── State ──────────────────────────────────────────────────────────────────
let board = Array(9).fill(null);
let gameOver = false;
let aiThinking = false;
let difficulty = 'medium';
// ── Resolve current logged-in username ────────────────────────────────────
function getCurrentUser() {
  // Sync version — used only for localStorage score key
  return localStorage.getItem('n5xt_username') ||
    localStorage.getItem('n5xt_user')           ||
    localStorage.getItem('username')             ||
    localStorage.getItem('n5xt_session')         ||
    'GUEST';
}

/* Async version — verifies against DB via whoami before saving score */
async function resolveUsername() {
  const direct =
    localStorage.getItem('n5xt_username') ||
    localStorage.getItem('n5xt_user')     ||
    localStorage.getItem('username');
  if (direct && direct.trim().length > 0) return direct.trim();

  const token = localStorage.getItem('n5xt_session');
  if (token) {
    try {
      const res = await fetch(
        `${ADMIN_API}?action=whoami&token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.username) return data.username;
      }
    } catch (e) { /* ignore */ }
    if (typeof token === 'string' && token.length < 60 && !token.includes('@')) return token;
  }
  return 'GUEST';
}

// ── Per-user score key — localStorage cache per account ───────────────────
function scoreKey() {
  return 'ttt_scores__' + getCurrentUser();
}

function loadScores() {
  try {
    const saved = localStorage.getItem(scoreKey());
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return { you: 0, draw: 0, ai: 0 };
}

function persistScores() {
  try {
    localStorage.setItem(scoreKey(), JSON.stringify(scores));
  } catch (e) {}
}

// ── Fetch authoritative per-user stats from admin DB ──────────────────────
async function fetchUserStats() {
  try {
    const username = await resolveUsername();
    if (!username || username === 'GUEST') return;
    const res  = await fetch(
      `${ADMIN_API}?action=user_stats&username=${encodeURIComponent(username)}&game=TicTacToe`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) {
      scores.you  = data.wins;
      scores.ai   = data.losses;
      scores.draw = data.draws;
      updateScores();
    }
  } catch (e) { /* non-critical — keep localStorage values */ }
}

let scores = loadScores();
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

// ── Save game result to admin DB ───────────────────────────────────────────
async function saveScore(result) {
  try {
    const playerName = await resolveUsername();
    console.log('[TTT] Reporting score as player:', playerName);

    const aiName = javaOnline ? 'Java AI' : 'JS AI';
    let winner;
    if (result === 'X')      winner = playerName;
    else if (result === 'O') winner = aiName;
    else                     winner = 'DRAW';

    await fetch(`${ADMIN_API}?action=save_score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player1:    playerName,
        player2:    aiName,
        mode:       'PvAI',
        game:       'TicTacToe',
        difficulty: difficulty,
        winner:     winner,
        p1_wins:    result === 'X' ? 1 : 0,
        p2_wins:    result === 'O' ? 1 : 0
      })
    });
    // Refresh scoreboard from DB so it reflects the true cumulative total
    await fetchUserStats();
  } catch (e) {
    console.warn('[TTT] Score save failed (non-critical):', e);
  }
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const cells    = document.querySelectorAll('.cell');
const statusEl = document.getElementById('status');
const boardEl  = document.getElementById('board');

// ── Draw the permanent # grid overlay (always visible) ───────────────────────
function drawBoardGrid() {
  const old = boardEl.querySelector('.board-grid-svg');
  if (old) old.remove();

  const cellSize = cells[0].offsetWidth;
  const gap  = 8;
  const pad  = 8;
  const S    = cellSize + gap;
  const boardW = pad * 2 + cellSize * 3 + gap * 2;
  const boardH = boardW;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('board-grid-svg');
  svg.setAttribute('width',  boardW);
  svg.setAttribute('height', boardH);
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:2;overflow:visible;';

  // 2 vertical + 2 horizontal separator lines
  const lines = [
    { x1: pad + S - gap/2,   y1: pad,          x2: pad + S - gap/2,   y2: boardH - pad },
    { x1: pad + S*2 - gap/2, y1: pad,          x2: pad + S*2 - gap/2, y2: boardH - pad },
    { x1: pad, y1: pad + S - gap/2,            x2: boardW - pad, y2: pad + S - gap/2   },
    { x1: pad, y1: pad + S*2 - gap/2,          x2: boardW - pad, y2: pad + S*2 - gap/2 },
  ];

  lines.forEach(({ x1, y1, x2, y2 }) => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', '#1a2740');
    l.setAttribute('stroke-width', '8');
    l.setAttribute('stroke-linecap', 'round');
    svg.appendChild(l);
  });

  boardEl.appendChild(svg);
}

// ── Java health check ─────────────────────────────────────────────────────────
async function checkJavaHealth() {
  const dot   = document.getElementById('java-dot');
  const label = document.getElementById('java-label');
  const info  = document.getElementById('java-info');
  const infoT = document.getElementById('java-info-text');
  const engL  = document.getElementById('engine-label');

  try {
    const res = await fetch(JAVA_API + '/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      javaOnline = true;
      dot.classList.add('online');
      label.textContent = 'JAVA ENGINE ✔';
      info.classList.add('java-info-ok');
      infoT.innerHTML = ' Java Neural Engine connected on <code>localhost:8765</code>';
      engL.textContent = 'Java AI';
    } else { throw new Error('not ok'); }
  } catch {
    javaOnline = false;
    dot.classList.add('offline');
    label.textContent = 'JS FALLBACK';
    info.classList.add('java-info-warn');
    infoT.innerHTML =
      '⚠ Java server offline — using JS engine. ' +
      'Run: <code>cd TTTJAVA &amp;&amp; javac TicTacToeServer.java &amp;&amp; java TicTacToeServer</code>';
    engL.textContent = 'JS AI';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function checkWinner(b) {
  for (const [a, c, d] of WINS) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a], line: [a, c, d] };
  }
  if (b.every(v => v)) return { winner: 'draw' };
  return null;
}

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status-bar ' + cls;
}

function updateTokens(turn) {
  const you = document.getElementById('token-you');
  const ai  = document.getElementById('token-ai');
  if (turn === 'you') {
    you.style.opacity = '1';   you.style.transform = 'scale(1.05)';
    ai.style.opacity  = '0.4'; ai.style.transform  = 'scale(1)';
  } else {
    ai.style.opacity  = '1';   ai.style.transform  = 'scale(1.05)';
    you.style.opacity = '0.4'; you.style.transform = 'scale(1)';
  }
}

function renderCell(i, val) {
  const span = document.getElementById('c' + i);
  if (val) {
    span.textContent = val;
    span.className = 'cell-symbol ' + (val === 'X' ? 'x' : 'o');
    requestAnimationFrame(() => span.classList.add('show'));
    cells[i].classList.add('taken');
  } else {
    span.textContent = '';
    span.className = 'cell-symbol';
    cells[i].classList.remove('taken', 'winner-cell', 'x-win', 'o-win');
  }
}

function drawWinLine(line, winner) {
  const oldSvg = boardEl.querySelector('.win-svg');
  if (oldSvg) oldSvg.remove();

  const cellSize = cells[0].offsetWidth;
  const gap  = 8;
  const pad  = 8;
  const S    = cellSize + gap;           // one cell step
  const boardW = pad * 2 + cellSize * 3 + gap * 2;
  const boardH = boardW;
  const overhang = 18;                   // px the line extends past the outer cell edge

  // Winner colour: cyan for X (you), magenta for O (AI)
  const color  = winner === 'X' ? '#00f5ff' : '#ff2d6b';
  const glowId = 'wglow_' + Date.now();

  // Centre of a cell in board-local coords
  function cx(idx) { return pad + (idx % 3) * S + cellSize / 2; }
  function cy(idx) { return pad + Math.floor(idx / 3) * S + cellSize / 2; }

  // ── Map every possible win pattern → exact start/end coords ──────────────
  // key = sorted triple as string
  const key = [...line].sort((a,b) => a-b).join(',');

  // Board edges (with overhang so line bleeds outside the board padding)
  const LEFT   = pad - overhang;
  const RIGHT  = boardW - pad + overhang;
  const TOP    = pad - overhang;
  const BOTTOM = boardH - pad + overhang;

  // Row y-centres
  const R0 = cy(0), R1 = cy(3), R2 = cy(6);
  // Col x-centres
  const C0 = cx(0), C1 = cx(1), C2 = cx(2);

  const lineCoords = {
    // ── 3 horizontal rows ──────────────────────────────────────────────────
    '0,1,2': { x1: LEFT,  y1: R0, x2: RIGHT,  y2: R0 },
    '3,4,5': { x1: LEFT,  y1: R1, x2: RIGHT,  y2: R1 },
    '6,7,8': { x1: LEFT,  y1: R2, x2: RIGHT,  y2: R2 },
    // ── 3 vertical columns ────────────────────────────────────────────────
    '0,3,6': { x1: C0, y1: TOP, x2: C0, y2: BOTTOM },
    '1,4,7': { x1: C1, y1: TOP, x2: C1, y2: BOTTOM },
    '2,5,8': { x1: C2, y1: TOP, x2: C2, y2: BOTTOM },
    // ── 2 diagonals ───────────────────────────────────────────────────────
    '0,4,8': { x1: LEFT,  y1: TOP,    x2: RIGHT,  y2: BOTTOM },
    '2,4,6': { x1: RIGHT, y1: TOP,    x2: LEFT,   y2: BOTTOM },
  };

  const coords = lineCoords[key];
  if (!coords) return;

  // Tint the permanent grid lines to the winner's colour
  const gridSvg = boardEl.querySelector('.board-grid-svg');
  if (gridSvg) {
    gridSvg.querySelectorAll('line').forEach(l => {
      l.setAttribute('stroke', color + '88');
    });
  }

  // ── Build SVG ────────────────────────────────────────────────────────────
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('win-svg');
  svg.setAttribute('width',  boardW);
  svg.setAttribute('height', boardH);
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;overflow:visible;';

  // Glow filter
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <filter id="${glowId}" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  svg.appendChild(defs);

  // ── Animated win strike line ──────────────────────────────────────────────
  const { x1, y1, x2, y2 } = coords;

  const strike = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  strike.setAttribute('x1', x1); strike.setAttribute('y1', y1);
  strike.setAttribute('x2', x1); strike.setAttribute('y2', y1);  // collapsed at start
  strike.setAttribute('stroke', color);
  strike.setAttribute('stroke-width', '5');
  strike.setAttribute('stroke-linecap', 'round');
  strike.setAttribute('filter', `url(#${glowId})`);
  svg.appendChild(strike);

  boardEl.appendChild(svg);

  // Ease-out cubic animation from (x1,y1) → (x2,y2)
  const duration = 380;
  const t0 = performance.now();
  (function animate(now) {
    const t    = Math.min((now - t0) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    strike.setAttribute('x2', x1 + (x2 - x1) * ease);
    strike.setAttribute('y2', y1 + (y2 - y1) * ease);
    if (t < 1) requestAnimationFrame(animate);
  })(t0);
}

function highlightWinners(line, cls) {
  line.forEach(i => cells[i].classList.add('winner-cell', cls));
}

function updateScores() {
  document.getElementById('score-you').textContent  = scores.you;
  document.getElementById('score-draw').textContent = scores.draw;
  document.getElementById('score-ai').textContent   = scores.ai;
  persistScores();
}

// ── Local JS Minimax fallback ─────────────────────────────────────────────────
function minimax(b, isMax, depth, alpha, beta) {
  const result = checkWinner(b);
  if (result) {
    if (result.winner === 'O') return 10 - depth;
    if (result.winner === 'X') return depth - 10;
    return 0;
  }
  if (isMax) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = 'O';
        best = Math.max(best, minimax(b, false, depth + 1, alpha, beta));
        b[i] = null;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = 'X';
        best = Math.min(best, minimax(b, true, depth + 1, alpha, beta));
        b[i] = null;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

function getBestMoveLocal(b) {
  let best = -Infinity, move = -1;
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      b[i] = 'O';
      const val = minimax(b, false, 0, -Infinity, Infinity);
      b[i] = null;
      if (val > best) { best = val; move = i; }
    }
  }
  return move;
}

function getRandomMove(b) {
  const empty = b.map((v, i) => v ? null : i).filter(v => v !== null);
  return empty[Math.floor(Math.random() * empty.length)];
}

function getAIMoveLocal() {
  const rand = Math.random();
  if (difficulty === 'easy')   return rand < 0.8 ? getRandomMove(board) : getBestMoveLocal(board);
  if (difficulty === 'medium') return rand < 0.4 ? getRandomMove(board) : getBestMoveLocal(board);
  return getBestMoveLocal(board);
}

// ── Java API call ─────────────────────────────────────────────────────────────
async function getAIMoveJava() {
  const payload = {
    board: board.map(v => v === null ? null : v),
    difficulty
  };
  try {
    const res = await fetch(JAVA_API + '/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    // Sync board from Java response
    for (let i = 0; i < 9; i++) {
      board[i] = data.board[i] ?? null;
    }
    return data.move;
  } catch (err) {
    console.warn('Java engine error, falling back to JS:', err);
    javaOnline = false;
    document.getElementById('java-dot').className = 'java-dot offline';
    document.getElementById('java-label').textContent = 'JS FALLBACK';
    return getAIMoveLocal();
  }
}

// ── Java offline modal ────────────────────────────────────────────────────────
let javaWarnShown = false;

function showJavaWarning() {
  if (javaWarnShown) return;
  javaWarnShown = true;

  const modal = document.createElement('div');
  modal.id = 'java-modal';
  modal.innerHTML = `
    <div class="jm-backdrop"></div>
    <div class="jm-box">
      <div class="jm-icon"></div>
      <div class="jm-title">Java Engine Offline</div>
      <div class="jm-body">
        The Java Neural Engine is not running.<br>
        You're playing with the <span class="jm-hl">JS fallback engine</span> instead.
      </div>
      <div class="jm-cmd">
        <div class="jm-cmd-label">To start the Java engine:</div>
        <code>cd TTTJAVA</code>
        <code>javac TicTacToeServer.java</code>
        <code>java TicTacToeServer</code>
      </div>      <div class="jm-buttons">
        <button class="jm-btn jm-ok" id="jm-continue">Continue Anyway</button>
        <button class="jm-btn jm-retry" id="jm-retry">Retry Connection</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('jm-show'));

  document.getElementById('jm-continue').onclick = () => {
    modal.classList.remove('jm-show');
    setTimeout(() => modal.remove(), 300);
  };

  document.getElementById('jm-retry').onclick = async () => {
    const btn = document.getElementById('jm-retry');
    btn.textContent = 'Connecting…';
    btn.disabled = true;
    await checkJavaHealth();
    if (javaOnline) {
      modal.classList.remove('jm-show');
      setTimeout(() => modal.remove(), 300);
    } else {
      btn.textContent = 'Retry Connection';
      btn.disabled = false;
    }
  };
}


function handleResult() {
  const result = checkWinner(board);
  if (!result) return false;
  gameOver = true;
  cells.forEach(c => c.classList.add('locked'));
  setTimeout(() => {
    if (result.winner === 'X') {
      scores.you++;
      updateScores();
      highlightWinners(result.line, 'x-win');
      drawWinLine(result.line, 'X');
      setStatus('⚡ YOU WIN! SYSTEM BREACHED', 'win-you');
      spawnParticles('cyan');
      saveScore('X');
    } else if (result.winner === 'O') {
      scores.ai++;
      updateScores();
      highlightWinners(result.line, 'o-win');
      drawWinLine(result.line, 'O');
      setStatus('✗ NEURAL ENGINE WINS', 'win-ai');
      spawnParticles('magenta');
      saveScore('O');
    } else {
      scores.draw++;
      updateScores();
      setStatus('— DRAW — SYSTEMS TIED', 'draw-state');
      saveScore('draw');
    }
    setTimeout(newGame, 2400);
  }, 200);
  return true;
}

async function playerMove(i) {
  if (gameOver || aiThinking || board[i]) return;
  if (!javaOnline) showJavaWarning();
  board[i] = 'X';
  renderCell(i, 'X');
  if (handleResult()) return;

  aiThinking = true;
  cells.forEach(c => c.classList.add('locked'));
  statusEl.className = 'status-bar ai-turn';
  const engineName = javaOnline ? 'JAVA ENGINE COMPUTING' : 'NEURAL ENGINE COMPUTING';
  statusEl.innerHTML = `<div class="thinking"><span></span><span></span><span></span></div> ${engineName}`;
  updateTokens('ai');

  let move;
  if (javaOnline) {
    move = await getAIMoveJava();
    // board already synced by getAIMoveJava; just render
    if (move !== -1) renderCell(move, 'O');
  } else {
    await new Promise(r => setTimeout(r, 400 + Math.random() * 500));
    move = getAIMoveLocal();
    if (move !== -1) { board[move] = 'O'; renderCell(move, 'O'); }
  }

  aiThinking = false;
  cells.forEach(c => c.classList.remove('locked'));
  if (!handleResult()) { setStatus('YOUR MOVE', 'your-turn'); updateTokens('you'); }
}

function resetScores() {
  scores = { you: 0, draw: 0, ai: 0 };
  updateScores();
}

function newGame() {
  board = Array(9).fill(null);
  gameOver = false;
  aiThinking = false;
  const old = boardEl.querySelector('.win-svg');
  if (old) old.remove();
  cells.forEach((c, i) => { c.className = 'cell'; renderCell(i, null); });
  setStatus('YOUR MOVE', 'your-turn');
  updateTokens('you');
  drawBoardGrid();
}

function spawnParticles(color) {
  const col = color === 'cyan' ? '#00f5ff' : '#ff2d6b';
  for (let i = 0; i < 18; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = 2 + Math.random() * 4;
      p.style.cssText = `
        width: ${size}px; height: ${size}px;
        background: ${col}; box-shadow: 0 0 6px ${col};
        left: ${10 + Math.random() * 80}%;
        animation-duration: ${2.5 + Math.random() * 3}s;
        animation-delay: ${Math.random() * 0.5}s;
      `;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 6000);
    }, i * 60);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
cells.forEach(cell => {
  cell.addEventListener('click', () => playerMove(parseInt(cell.dataset.i)));
});

document.getElementById('btn-new').addEventListener('click', newGame);
// btn-reset-scores removed (not present in HTML — use newGame() instead)

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.d;
    newGame();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
updateScores();
updateTokens('you');
checkJavaHealth();
fetchUserStats();   // load authoritative W/L/D from DB for this user
// Draw the board grid after layout is ready
requestAnimationFrame(() => drawBoardGrid());