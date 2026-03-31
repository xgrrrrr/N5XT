// ════════════════════════════════════════════════
//  HS.js  —  Coin Storage Module  (Multi-Player)
//
//  Supports multiple named players, each with
//  their own coin balance saved to the Java server.
//
//  Java server must be running at JAVA_SERVER_URL.
//  If offline, localStorage is used as fallback.
// ════════════════════════════════════════════════

const JAVA_SERVER_URL = 'http://localhost:8080/coins';

// 25002500 Key that remembers which player slot was last used 25002500
const REMEMBERED_PLAYER_KEY = 'hr_remembered_player';

// ── Currently active player (set by onSelectPlayer) ──
let activePlayer = null;   // { slot: 'player1', name: 'PLAYER 1' }

// ════════════════════════════════════════════════
//  PLAYER SLOTS CONFIG
//  Add more entries here to support more players.
// ════════════════════════════════════════════════
const PLAYER_SLOTS = [
  { slot: 'player1', label: 'PLAYER 1' },
  { slot: 'player2', label: 'PLAYER 2' },
  { slot: 'player3', label: 'PLAYER 3' },
  { slot: 'player4', label: 'PLAYER 4' },
];

// ════════════════════════════════════════════════
//  PLAYER SELECT SCREEN
//  Injected into the page before the game intro.
// ════════════════════════════════════════════════
async function showPlayerSelect() {
  // ── If this browser already picked a player, skip the screen entirely ──
  const remembered = localStorage.getItem(REMEMBERED_PLAYER_KEY);
  if (remembered) {
    const found = PLAYER_SLOTS.find(p => p.slot === remembered);
    if (found) {
      console.log(`[CoinStorage] Auto-restoring remembered player: ${remembered}`);
      onSelectPlayer(found, true); // true = silent restore, no animation
      return;
    }
  }

  // Inject CSS once
  if (!document.getElementById('ps-styles')) {
    const style = document.createElement('style');
    style.id = 'ps-styles';
    style.textContent = `
      #player-select-overlay {
        position: fixed; top:0; left:0; right:0; bottom:0;
        background: #0a0010;
        z-index: 999;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Press Start 2P', monospace;
      }
      #ps-box {
        background: #000822;
        border: 3px solid #FFE600;
        box-shadow: 0 0 40px #FFE60044, 0 0 80px #FF00FF22;
        padding: 32px 28px;
        display: flex; flex-direction: column; align-items: center;
        gap: 18px; min-width: 300px; max-width: 420px; width: 90%;
      }
      .ps-title {
        color: #FFE600; font-size: 14px; letter-spacing: 3px;
        text-shadow: 2px 2px #FF0000; text-align: center;
      }
      .ps-subtitle { color: #AAAACC; font-size: 6px; text-align: center; line-height:2; }
      #ps-slots { width: 100%; display: flex; flex-direction: column; gap: 10px; }
      .ps-slot-btn {
        width: 100%; background: #001133;
        border: 2px solid #0055AA;
        color: #AADDFF; font-family: 'Press Start 2P', monospace;
        font-size: 8px; padding: 12px 14px;
        cursor: pointer; transition: all 0.12s;
        display: flex; justify-content: space-between; align-items: center;
        letter-spacing: 1px;
      }
      .ps-slot-btn:hover { background: #002266; border-color: #00FFFF; color: #00FFFF; }
      .ps-coins-tag { color: #FFE600; font-size: 7px; }
      .ps-coins-tag.loading { color: #444466; }
      .ps-new-tag  { color: #44FF88; font-size: 6px; }
      .ps-note { color: #333366; font-size: 6px; text-align: center; line-height: 2; }
    `;
    document.head.appendChild(style);
  }

  // Inject HTML once
  if (!document.getElementById('player-select-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'player-select-overlay';
    overlay.innerHTML = `
      <div id="ps-box">
        <div class="ps-title">🏇 SELECT PLAYER</div>
        <div class="ps-subtitle">CHOOSE YOUR PROFILE TO LOAD YOUR COINS<br>EACH PLAYER HAS THEIR OWN BALANCE</div>
        <div id="ps-slots"></div>
        <div class="ps-note">★ COINS ARE SAVED PER PLAYER TO THE SERVER ★<br>YOUR BALANCE IS KEPT WHEN YOU LEAVE THE GAME</div>
      </div>`;
    document.body.appendChild(overlay);
  }

  document.getElementById('player-select-overlay').style.display = 'flex';

  // Build slot buttons with async coin previews
  const slotsEl = document.getElementById('ps-slots');
  slotsEl.innerHTML = '';
  for (const p of PLAYER_SLOTS) {
    const btn = document.createElement('button');
    btn.className = 'ps-slot-btn';
    btn.setAttribute('data-slot', p.slot);
    btn.innerHTML = `
      <span>${p.label}</span>
      <span class="ps-coins-tag loading" id="ps-preview-${p.slot}">...</span>`;
    btn.onclick = () => onSelectPlayer(p);
    slotsEl.appendChild(btn);

    // Load coin balance preview in background
    CoinStorage.peekCoins(p.slot).then(info => {
      const el = document.getElementById(`ps-preview-${p.slot}`);
      if (!el) return;
      if (info.newPlayer) {
        el.className = 'ps-new-tag';
        el.textContent = '★ NEW  +500';
      } else {
        el.className = 'ps-coins-tag';
        el.textContent = `${info.coins} COINS`;
      }
    });
  }
}

// Called when user taps a player slot button (or auto-restored silently)
function onSelectPlayer(playerDef, silent = false) {
  activePlayer = { slot: playerDef.slot, name: playerDef.label };

  // ── Persist the choice so the picker is skipped next visit ──
  localStorage.setItem(REMEMBERED_PLAYER_KEY, playerDef.slot);

  const overlay = document.getElementById('player-select-overlay');
  if (overlay) overlay.style.display = 'none';

  console.log(`[CoinStorage] Active player: ${activePlayer.slot} (silent=${silent})`);
  // Game boot sequence (defined in HJ.js) will now run
  if (typeof bootGame === 'function') bootGame();
}

// ── Called from the Switch Player button — clears the remembered slot ──
// so the picker shows again on next load / after switching.
function forgetPlayer() {
  localStorage.removeItem(REMEMBERED_PLAYER_KEY);
  activePlayer = null;
}

// ════════════════════════════════════════════════
//  CoinStorage  —  per-player save / load
// ════════════════════════════════════════════════
class CoinStorage {

  // localStorage key namespaced by player slot
  static _k(slot, suffix) { return `hr_${slot}_${suffix}`; }

  // ── Stable player ID per slot ─────────────────
  static getPlayerId(slot) {
    const key = this._k(slot, 'pid');
    let pid = localStorage.getItem(key);
    if (!pid) {
      pid = `${slot}_${Math.random().toString(36).slice(2,10)}_${Date.now()}`;
      localStorage.setItem(key, pid);
    }
    return pid;
  }

  // ── Quick peek (used by player-select screen) ─
  static async peekCoins(slot) {
    const pid = this.getPlayerId(slot);
    try {
      const res  = await fetch(
        `${JAVA_SERVER_URL}?playerId=${encodeURIComponent(pid)}`,
        { signal: AbortSignal.timeout(3000) }
      );
      const data = await res.json();
      return { coins: data.coins, newPlayer: !!data.newPlayer };
    } catch {
      const raw = localStorage.getItem(this._k(slot, 'coins'));
      return raw !== null
        ? { coins: parseInt(raw, 10), newPlayer: false }
        : { coins: 500, newPlayer: true };
    }
  }

  // ── Full load for active player ───────────────
  static async loadFromServer() {
    const slot = activePlayer ? activePlayer.slot : 'player1';
    const pid  = this.getPlayerId(slot);
    try {
      const res  = await fetch(`${JAVA_SERVER_URL}?playerId=${encodeURIComponent(pid)}`);
      const data = await res.json();
      localStorage.setItem(this._k(slot,'coins'), String(data.coins));
      localStorage.setItem(this._k(slot,'net'),   String(data.net));
      localStorage.setItem(this._k(slot,'races'), String(data.races));
      console.log(`[CoinStorage] Loaded ${slot} pid=${pid} coins=${data.coins}`);
      return { coins: data.coins, net: data.net, races: data.races, newPlayer: !!data.newPlayer };
    } catch (err) {
      console.warn('[CoinStorage] Server unreachable — using localStorage fallback.', err);
      const raw = localStorage.getItem(this._k(slot,'coins'));
      const c   = raw !== null ? parseInt(raw, 10) : null;
      return {
        coins    : c !== null ? c : 500,
        net      : parseInt(localStorage.getItem(this._k(slot,'net'))   || '0', 10),
        races    : parseInt(localStorage.getItem(this._k(slot,'races')) || '0', 10),
        newPlayer: c === null,
      };
    }
  }

  // ── Save active player's coins ────────────────
  static async saveToServer(coins, net, races) {
    const slot = activePlayer ? activePlayer.slot : 'player1';
    // Instant localStorage mirror
    localStorage.setItem(this._k(slot,'coins'), String(coins));
    localStorage.setItem(this._k(slot,'net'),   String(net));
    localStorage.setItem(this._k(slot,'races'), String(races));
    // Async server save (won't block game)
    const pid = this.getPlayerId(slot);
    try {
      const body = new URLSearchParams({ playerId: pid, coins, net, races });
      await fetch(JAVA_SERVER_URL, { method: 'POST', body });
      console.log(`[CoinStorage] Saved ${slot} — coins=${coins}`);
    } catch (err) {
      console.warn('[CoinStorage] Server save failed, localStorage used.', err);
    }
  }

  // ── saveAll (legacy compat shim) ─────────────
  static saveAll(amount, net, races) {
    const slot = activePlayer ? activePlayer.slot : 'player1';
    localStorage.setItem(this._k(slot,'coins'), String(amount));
    localStorage.setItem(this._k(slot,'net'),   String(net));
    localStorage.setItem(this._k(slot,'races'), String(races));
  }

  // ── Session log ───────────────────────────────
  static _logKey() {
    const slot = activePlayer ? activePlayer.slot : 'player1';
    return this._k(slot, 'log');
  }
  static loadLog() {
    try { return JSON.parse(localStorage.getItem(this._logKey()) || '[]'); }
    catch { return []; }
  }
  static _appendLog(e) {
    const log = this.loadLog(); log.push(e);
    if (log.length > 50) log.splice(0, log.length - 50);
    localStorage.setItem(this._logKey(), JSON.stringify(log));
  }
  static logEntry(coins) {
    const slot = activePlayer ? activePlayer.slot : 'player1';
    const now  = new Date().toISOString();
    this._appendLog({ type:'entry', time:now, coins, slot });
    console.log(`[CoinStorage] ENTRY ${slot} coins=${coins}`);
  }
  static logExit(coins, net, races, reason = 'unknown') {
    const slot = activePlayer ? activePlayer.slot : 'player1';
    this.saveToServer(coins, net, races);   // fire-and-forget save on exit
    const now = new Date().toISOString();
    this._appendLog({ type:'exit', time:now, coins, net, races, reason, slot });
    console.log(`[CoinStorage] EXIT ${slot} coins=${coins} reason=${reason}`);
  }
}

// ── Auto-save on every exit path ─────────────────
window.addEventListener('beforeunload', () => {
  if (typeof coins !== 'undefined' && activePlayer)
    CoinStorage.logExit(coins, wonTotal, totalRaces, 'page_unload');
});
window.addEventListener('pagehide', () => {
  if (typeof coins !== 'undefined' && activePlayer)
    CoinStorage.logExit(coins, wonTotal, totalRaces, 'page_hide');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && typeof coins !== 'undefined' && activePlayer)
    CoinStorage.logExit(coins, wonTotal, totalRaces, 'tab_hidden');
});