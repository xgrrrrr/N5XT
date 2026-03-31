/* =============================================
   adminJ.js — N5XT Admin Panel Logic
   ============================================= */

const API = window.location.origin + '/otp/admin_api.php';

let currentPage         = 1;
let currentSearch       = '';
let currentScoresPage   = 1;
let currentScoresSearch = '';
let currentGameFilter   = '';   // '' = all, 'TicTacToe', 'StickmanDuel'
let currentTab          = 'dashboard';

// ── On page load ──────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (!localStorage.getItem('n5xt_session')) {
    window.location.replace(window.location.origin + '/otp/index.html');
    return;
  }
  try {
    const res  = await fetch(`${API}?action=stats`);
    const data = await res.json();
    if (data.success) { showDashboard(); return; }
  } catch { /* show password screen */ }
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainScreen').classList.remove('show');
});

// ── Show dashboard ────────────────────────────
function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainScreen').classList.add('show');
  loadDashboard();
}

document.getElementById('adminPass').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// ── Login ─────────────────────────────────────
async function doLogin() {
  const pass = document.getElementById('adminPass').value;
  const btn  = document.getElementById('loginBtn');
  const err  = document.getElementById('loginErr');
  if (!pass) { err.textContent = '⚠ Enter password'; return; }
  btn.classList.add('ld'); err.textContent = '';
  try {
    const res  = await fetch(`${API}?action=login`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ password: pass })
    });
    const data = await res.json();
    if (data.success) { showDashboard(); }
    else { err.textContent = '⚠ Wrong password'; btn.classList.remove('ld'); }
  } catch {
    err.textContent = '⚠ Cannot reach server'; btn.classList.remove('ld');
  }
}

// ── Logout ────────────────────────────────────
async function doLogout() {
  try { await fetch(`${API}?action=logout`); } catch {}
  localStorage.removeItem('n5xt_session');
  window.location.replace(window.location.origin + '/otp/index.html');
}

// ── Tab switching ─────────────────────────────
function switchTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['dashboard','activity','users','scores'].forEach(t => {
    document.getElementById('tab-' + t).style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'activity')  loadActivity();
  if (tab === 'users')     loadUsers();
  if (tab === 'scores')    loadScores();
}

// ── Dashboard ─────────────────────────────────
async function loadDashboard() {
  try {
    const res  = await fetch(`${API}?action=stats`);
    const data = await res.json();
    if (data.success) {
      document.getElementById('s-users').textContent       = data.totalUsers;
      document.getElementById('s-logins').textContent      = data.totalLogins;
      document.getElementById('s-otps').textContent        = data.todayOtps;
      document.getElementById('s-games').textContent       = data.totalGames  ?? '—';
      document.getElementById('s-games-today').textContent = data.todayGames  ?? '—';
      if (document.getElementById('s-ttt-games'))
        document.getElementById('s-ttt-games').textContent = data.tttGames   ?? '0';
      if (document.getElementById('s-duel-games'))
        document.getElementById('s-duel-games').textContent = data.duelGames  ?? '0';
      if (document.getElementById('s-horse-games'))
        document.getElementById('s-horse-games').textContent = data.horseGames ?? '0';
      document.getElementById('serverTime').textContent    = data.serverTime;
    }
    const r2 = await fetch(`${API}?action=activity&page=1`);
    const d2 = await r2.json();
    const div = document.getElementById('dash-activity');
    div.innerHTML = (d2.success && d2.rows.length > 0)
      ? buildTable(d2.rows.slice(0, 5))
      : '<p style="color:var(--dim);font-size:.85rem">No activity yet.</p>';

    const r3 = await fetch(`${API}?action=game_scores&page=1`);
    const d3 = await r3.json();
    const div2 = document.getElementById('dash-scores');
    div2.innerHTML = (d3.success && d3.rows.length > 0)
      ? buildScoresTable(d3.rows.slice(0, 5), 1, true)
      : '<p style="color:var(--dim);font-size:.85rem">No matches recorded yet.</p>';
  } catch { showToast('Cannot reach server', true); }
}

// ── Activity log ──────────────────────────────
async function loadActivity(page = 1) {
  currentPage = page;
  const body = document.getElementById('activityBody');
  body.innerHTML = '<tr><td colspan="7" class="empty-row"><div class="loading"><div class="spin"></div>LOADING...</div></td></tr>';
  try {
    const res  = await fetch(`${API}?action=activity&page=${page}&search=${encodeURIComponent(currentSearch)}`);
    const data = await res.json();
    if (data.success) {
      body.innerHTML = data.rows.length > 0
        ? data.rows.map((r, i) => buildRow(r, (page-1)*20+i+1)).join('')
        : '<tr><td colspan="7" class="empty-row">No activity found.</td></tr>';
      buildPagination(page, data.totalPages);
    }
  } catch {
    body.innerHTML = '<tr><td colspan="7" class="empty-row" style="color:var(--p)">Failed to load.</td></tr>';
  }
}

function buildRow(r, num) {
  const tc = r.purpose === 'LOGIN' ? 'b-login' : 'b-reset';
  const sc = r.status === 'USED' ? 'b-used' : r.status === 'EXPIRED' ? 'b-expired' : 'b-pending';
  return `<tr>
    <td style="color:var(--dim)">${num}</td>
    <td style="color:var(--c);font-family:'Orbitron',sans-serif;font-size:.75rem">${esc(r.username)}</td>
    <td style="color:var(--dim)">${esc(r.email)}</td>
    <td><span class="badge ${tc}">${r.purpose}</span></td>
    <td><span class="badge ${sc}">${r.status}</span></td>
    <td style="color:var(--dim);font-size:.82rem">${r.created_at}</td>
    <td style="color:var(--dim);font-size:.82rem">${r.expires_at}</td>
  </tr>`;
}

function buildTable(rows) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th>Username</th><th>Email</th><th>Type</th><th>Status</th><th>Requested At</th><th>Expires At</th></tr></thead>
    <tbody>${rows.map((r, i) => buildRow(r, i+1)).join('')}</tbody>
  </table></div>`;
}

function buildPagination(page, totalPages) {
  const div = document.getElementById('pagDiv');
  if (totalPages <= 1) { div.innerHTML = ''; return; }
  let html = '';
  if (page > 1) html += `<button onclick="loadActivity(${page-1})">&#8249; PREV</button>`;
  for (let p = Math.max(1,page-2); p <= Math.min(totalPages,page+2); p++)
    html += `<button class="${p===page?'cur':''}" onclick="loadActivity(${p})">${p}</button>`;
  if (page < totalPages) html += `<button onclick="loadActivity(${page+1})">NEXT &#8250;</button>`;
  div.innerHTML = html;
}

function doSearch() { currentSearch = document.getElementById('searchInput').value.trim(); loadActivity(1); }
function clearSearch() { currentSearch = ''; document.getElementById('searchInput').value = ''; loadActivity(1); }

// ══════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════
async function loadUsers() {
  const grid = document.getElementById('usersGrid');
  grid.innerHTML = '<div class="loading"><div class="spin"></div>LOADING...</div>';
  try {
    const res  = await fetch(`${API}?action=users`);
    const data = await res.json();
    if (data.success) {
      document.getElementById('usersTitle').textContent = `REGISTERED USERS (${data.users.length})`;
      grid.innerHTML = data.users.length > 0
        ? data.users.map(u => buildUserCard(u)).join('')
        : '<p style="color:var(--dim)">No users registered yet.</p>';
    }
  } catch { grid.innerHTML = '<p style="color:var(--p)">Failed to load.</p>'; }
}

function buildUserCard(u) {
  return `<div class="user-card">
    <div class="uc-name">${esc(u.username)}</div>
    <div class="uc-email">${esc(u.email)}</div>
    <div class="uc-date">Joined ${formatDate(u.created_at)}</div>
    <div class="uc-actions">
      <button class="uc-del" onclick="deleteUser(${u.id},'${esc(u.username)}')">DELETE</button>
    </div>
  </div>`;
}

async function deleteUser(id, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  try {
    const res  = await fetch(`${API}?action=delete_user`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) { showToast('User deleted'); loadUsers(); loadDashboard(); }
    else showToast('Delete failed', true);
  } catch { showToast('Cannot reach server', true); }
}

// ══════════════════════════════════════════════
// GAME SCORES
// ══════════════════════════════════════════════
async function loadScores(page = 1) {
  currentScoresPage = page;
  const tbody = document.getElementById('scoresBody');
  tbody.innerHTML = '<tr><td colspan="9" class="empty-row"><div class="loading"><div class="spin"></div>LOADING...</div></td></tr>';
  try {
    const url = `${API}?action=game_scores&page=${page}&search=${encodeURIComponent(currentScoresSearch)}&game=${encodeURIComponent(currentGameFilter)}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) { tbody.innerHTML = '<tr><td colspan="9" class="empty-row" style="color:var(--p)">Failed to load.</td></tr>'; return; }

    // Dynamic title based on filter
    const gameLabel = currentGameFilter === 'TicTacToe'    ? 'TIC-TAC-TOE'
                    : currentGameFilter === 'StickmanDuel' ? 'STICKMAN DUEL'
                    : currentGameFilter === 'HorseRacing'  ? 'HORSE RACING'
                    : 'ALL GAMES';
    document.getElementById('scoresTitle').textContent = `${gameLabel} — MATCH HISTORY (${data.totalRows} total)`;

    if (data.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No matches recorded yet.</td></tr>';
    } else {
      tbody.innerHTML = data.rows.map((r, i) => buildScoreRow(r, (page-1)*20+i+1)).join('');
      buildSummaryCards(data.rows, data.totalRows);
    }
    buildScoresPagination(page, data.totalPages);
  } catch {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row" style="color:var(--p)">Cannot reach server.</td></tr>';
  }
}

function buildScoreRow(r, num) {
  const game = r.game || 'StickmanDuel';

  // ── Horse Racing row ──────────────────────────
  if (game === 'HorseRacing') {
    const won     = r.winner !== 'HOUSE';
    const wClass  = won ? 'b-login' : 'b-reset';
    const betType = r.mode   || '—';        // WIN / EXACTA / TRIFECTA
    const betPick = r.difficulty || '—';    // e.g. "#3" / "#1+#2" / "#3→#1→#5"
    const finish  = r.p1_weapon  || '—';   // finish order string
    const payout  = r.p2_weapon  || '—';   // "BET 50 → +200"
    return `<tr>
      <td style="color:var(--dim)">${num}</td>
      <td style="color:var(--c);font-family:'Orbitron',sans-serif;font-size:.75rem">${esc(r.player1)}</td>
      <td style="color:var(--dim);font-size:.78rem">🏇 RACE</td>
      <td><span class="badge b-horse">HORSE</span></td>
      <td><span class="badge b-pvai" style="font-size:.68rem">${esc(betType)}</span></td>
      <td style="color:#FFCC44;font-size:.78rem;font-family:monospace">${esc(betPick)}</td>
      <td><span class="badge ${wClass}">${won ? '💸 WIN' : '💸 LOST'}</span></td>
      <td class="score-cell" style="font-size:.75rem;color:${won?'var(--g)':'var(--p)'}">${esc(payout)}</td>
      <td style="color:var(--dim);font-size:.75rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(finish)}">${esc(finish)}</td>
      <td style="color:var(--dim);font-size:.82rem;white-space:nowrap">${r.played_at}</td>
      <td><button class="btn-del-row" onclick="deleteScore(${r.id})">✕</button></td>
    </tr>`;
  }

  // ── TicTacToe / StickmanDuel row (original) ───
  const isP1Win  = r.winner === r.player1;
  const isDraw   = r.winner === 'DRAW';
  const winClass = isP1Win ? 'b-login' : isDraw ? 'b-draw' : 'b-reset';
  const modeClass= r.mode === 'PvP' ? 'b-pvp' : 'b-pvai';
  const diffBadge = r.difficulty
    ? `<span class="badge b-diff-${r.difficulty.toLowerCase()}">${esc(r.difficulty.toUpperCase())}</span>`
    : '<span style="color:var(--dim)">—</span>';
  const gameBadge = game === 'TicTacToe'
    ? `<span class="badge b-ttt">TTT</span>`
    : `<span class="badge b-duel">DUEL</span>`;
  return `<tr>
    <td style="color:var(--dim)">${num}</td>
    <td style="color:var(--c);font-family:'Orbitron',sans-serif;font-size:.75rem">${esc(r.player1)}</td>
    <td style="color:var(--dim)">${esc(r.player2)}</td>
    <td>${gameBadge}</td>
    <td><span class="badge ${modeClass}">${esc(r.mode)}</span></td>
    <td>${diffBadge}</td>
    <td><span class="badge ${winClass}">${esc(r.winner)}</span></td>
    <td class="score-cell"><span class="sc-a">${r.p1_wins}</span><span style="color:var(--dim)"> — </span><span class="sc-b">${r.p2_wins}</span></td>
    <td style="color:var(--dim);font-size:.82rem;white-space:nowrap">${r.played_at}</td>
    <td><button class="btn-del-row" onclick="deleteScore(${r.id})">✕</button></td>
  </tr>`;
}

function buildScoresTable(rows, startNum = 1, compact = false) {
  const header = compact
    ? `<tr><th>#</th><th>P1</th><th>P2</th><th>Mode</th><th>Winner</th><th>Score</th><th>Played At</th></tr>`
    : `<tr><th>#</th><th>Player 1</th><th>Player 2</th><th>Mode</th><th>Difficulty</th><th>Winner</th><th>Score</th><th>Played At</th><th></th></tr>`;
  const bodyRows = rows.map((r, i) => {
    if (compact) {
      const wc = r.winner === r.player1 ? 'b-login' : r.winner === 'DRAW' ? 'b-draw' : 'b-reset';
      const mc = r.mode === 'PvP' ? 'b-pvp' : 'b-pvai';
      return `<tr>
        <td style="color:var(--dim)">${startNum+i}</td>
        <td style="color:var(--c);font-family:'Orbitron',sans-serif;font-size:.75rem">${esc(r.player1)}</td>
        <td style="color:var(--dim)">${esc(r.player2)}</td>
        <td><span class="badge ${mc}">${esc(r.mode)}</span></td>
        <td><span class="badge ${wc}">${esc(r.winner)}</span></td>
        <td class="score-cell"><span class="sc-a">${r.p1_wins}</span><span style="color:var(--dim)"> — </span><span class="sc-b">${r.p2_wins}</span></td>
        <td style="color:var(--dim);font-size:.82rem;white-space:nowrap">${r.played_at}</td>
      </tr>`;
    }
    return buildScoreRow(r, startNum+i);
  }).join('');
  return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${bodyRows}</tbody></table></div>`;
}

function buildSummaryCards(rows, totalRows) {
  const container = document.getElementById('scoreSummary');
  if (!container) return;
  const p1Wins   = rows.filter(r => r.winner === r.player1).length;
  const draws    = rows.filter(r => r.winner === 'DRAW').length;
  const pvpGames = rows.filter(r => r.mode === 'PvP').length;
  const pvaiGames= rows.filter(r => r.mode === 'PvAI').length;
  container.innerHTML = [
    { val: totalRows,  lbl: 'Total Matches',  col: 'var(--c)' },
    { val: p1Wins,     lbl: 'P1 Wins (page)', col: 'var(--g)' },
    { val: draws,      lbl: 'Draws (page)',   col: 'var(--y)' },
    { val: pvpGames,   lbl: 'PvP Matches',    col: 'var(--p)' },
    { val: pvaiGames,  lbl: 'vs AI Matches',  col: 'var(--c)' },
  ].map(s => `<div class="ss-card"><div class="ss-val" style="color:${s.col}">${s.val}</div><div class="ss-lbl">${s.lbl}</div></div>`).join('');
}

function buildScoresPagination(page, totalPages) {
  const div = document.getElementById('scoresPagDiv');
  if (totalPages <= 1) { div.innerHTML = ''; return; }
  let html = '';
  if (page > 1) html += `<button onclick="loadScores(${page-1})">&#8249; PREV</button>`;
  for (let p = Math.max(1,page-2); p <= Math.min(totalPages,page+2); p++)
    html += `<button class="${p===page?'cur':''}" onclick="loadScores(${p})">${p}</button>`;
  if (page < totalPages) html += `<button onclick="loadScores(${page+1})">NEXT &#8250;</button>`;
  div.innerHTML = html;
}

function doScoresSearch() { currentScoresSearch = document.getElementById('scoresSearch').value.trim(); loadScores(1); }
function clearScoresSearch() { currentScoresSearch = ''; document.getElementById('scoresSearch').value = ''; loadScores(1); }
function setGameFilter(game) {
  currentGameFilter = game;
  // Update active state on filter buttons
  document.querySelectorAll('.game-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.game === game);
  });
  loadScores(1);
}

async function deleteScore(id) {
  if (!confirm('Delete this match record?')) return;
  try {
    const res  = await fetch(`${API}?action=delete_score`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.success) { showToast('Match deleted'); loadScores(currentScoresPage); loadDashboard(); }
    else showToast('Delete failed', true);
  } catch { showToast('Cannot reach server', true); }
}

async function confirmClearScores() {
  if (!confirm('⚠ This will DELETE ALL match records. This cannot be undone.\n\nContinue?')) return;
  try {
    const res  = await fetch(`${API}?action=clear_scores`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.success) { showToast('All match records cleared'); loadScores(1); loadDashboard(); }
    else showToast('Clear failed', true);
  } catch { showToast('Cannot reach server', true); }
}

// ── Helpers ───────────────────────────────────
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'});
}
function formatDateTime(str) {
  if (!str) return 'Never';
  const d = new Date(str);
  return d.toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'})
    + ' ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});
}
function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => { t.className = 'toast' + (isErr ? ' err' : ''); }, 3000);
}

setInterval(() => { if (currentTab === 'dashboard') loadDashboard(); }, 30000);