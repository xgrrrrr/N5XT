window.addEventListener('DOMContentLoaded', () => {
  const sess = getSession();
  if (!sess) { location.href = 'index.html'; return; }
  const n = sess.username.toUpperCase();
  document.getElementById('navUn').textContent    = n;
  document.getElementById('heroName').textContent = n;
  document.getElementById('navAv').textContent    = n.charAt(0);
  renderGames();

  document.getElementById('logoutBtn').addEventListener('click', () => { clearSession(); location.href = 'index.html'; });
  document.querySelector('.filters').addEventListener('click', e => {
    const btn = e.target.closest('.fb'); if (!btn) return;
    document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
    btn.classList.add('on'); activeGenre = btn.dataset.g; renderGames();
  });
  document.getElementById('srchIn').addEventListener('input', renderGames);
  document.getElementById('mClose').addEventListener('click', closeModal);
  document.getElementById('mbg').addEventListener('click', e => { if (e.target === document.getElementById('mbg')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.getElementById('playBtn').addEventListener('click', () => {
    if (!currentGame) return;
    closeModal();
    location.href = currentGame.file;
  });
});

const GAMES = [
  { id:1,  title:'DUAL FIGTH STCKMAN',  genre:'action', emoji:'🗡️', rating:'9.5', stars:'★★★★★', bg:'linear-gradient(135deg,#ff006e28,#080c14)', color:'#ff006e', file:'dh.html',                 desc:'Beat the strongest CPU in the game.', stats:[{v:'200+',l:'HOURS'},{v:'500+',l:'QUESTS'},{v:'40+',l:'CLASSES'}] },
  { id:2,  title:'TIC TAC TOE',  genre:'strategy',   emoji:'❌', rating:'8.6', stars:'★★★★☆', bg:'linear-gradient(135deg,#00f5d428,#080c14)', color:'#00f5d4', file:'TTTH.html',     desc:'Traditionally played on a 3x3 grid like a simple board!', stats:[{v:'30+',l:'WEAPONS'},{v:'15+',l:'BOSSES'},{v:'CO-OP',l:'MODE'}] },
  { id:3, title:'HORSE RACING',  genre:'gambling',      emoji:'🏇', rating:'9.3', stars:'★★★★★', bg:'linear-gradient(135deg,#7b2fff28,#080c14)', color:'#7b2fff', file:'HH.html',     desc:'Bet your best horse!', stats:[{v:'1000+',l:'RECIPES'},{v:'80+',l:'HOURS'},{v:'BET',l:'SYSTEM'}] },
  { id:4,  title:'STAND BY', genre:'stand by',   emoji:'', rating:'8.9', stars:'★★★★☆', bg:'linear-gradient(135deg,#ffd60a28,#080c14)', color:'#ffd60a', file:'game_apex_circuit.html',    desc:'Open-world lane racing — stay on track and beat your best time!', stats:[{v:'OPEN',l:'WORLD'},{v:'400+',l:'EVENTS'},{v:'32P',l:'MULTI'}] },
  { id:5,  title:'STAND BY',  genre:'stand by',   emoji:'', rating:'8.7', stars:'★★★★☆', bg:'linear-gradient(135deg,#00e66028,#080c14)', color:'#00e660', file:'game_iron_league.html',     desc:'Penalty shootout — aim and click to score 5 goals and win!', stats:[{v:'500+',l:'TEAMS'},{v:'LIVE',l:'SEASONS'},{v:'22v22',l:'MATCHES'}] },

];

const tagMap = { action:'ta', rpg:'tr', strategy:'ts', racing:'trc', sports:'tsp' };
let activeGenre = 'all';
let currentGame = null;

function renderGames() {
  const q = (document.getElementById('srchIn').value || '').toLowerCase();
  const list = GAMES.filter(g => (activeGenre === 'all' || g.genre === activeGenre) && g.title.toLowerCase().includes(q));
  const grid = document.getElementById('gameGrid');
  grid.innerHTML = '';
  if (!list.length) { grid.innerHTML = '<div class="no-res">NO GAMES FOUND</div>'; return; }
  list.forEach((g, i) => {
    const c = document.createElement('div');
    c.className = 'gcard'; c.style.animationDelay = `${i * .06}s`;
    c.innerHTML = `<div class="gthumb" style="background:${g.bg}">${g.emoji}</div>
      <div class="gbody">
        <span class="gtag ${tagMap[g.genre]}">${g.genre.toUpperCase()}</span>
        <div class="gtitle">${g.title}</div>
        <div class="grating">${g.stars} &nbsp;${g.rating}</div>
        <div class="gcta">VIEW DETAILS ›</div>
      </div>`;
    c.addEventListener('click', () => openModal(g));
    grid.appendChild(c);
  });
}

function openModal(g) {
  currentGame = g;
  const th = document.getElementById('mthumb');
  th.style.background = g.bg; th.textContent = g.emoji;
  const tag = document.getElementById('mtag');
  tag.textContent = g.genre.toUpperCase(); tag.className = 'gtag ' + tagMap[g.genre];
  document.getElementById('mstars').textContent = g.stars + ' ' + g.rating;
  document.getElementById('mtitle').textContent = g.title;
  document.getElementById('mdesc').textContent  = g.desc;
  document.getElementById('mstatsEl').innerHTML = g.stats.map(s =>
    `<div class="stat"><span class="sv" style="color:${g.color}">${s.v}</span><span class="sl">${s.l}</span></div>`).join('');
  document.getElementById('mbg').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('mbg').classList.remove('open');
  document.body.style.overflow = '';
}