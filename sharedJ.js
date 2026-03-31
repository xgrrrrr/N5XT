/* =============================================
   sharedJ.js  —  UI helpers (no API calls)
   ============================================= */

function getSession()     { const r = localStorage.getItem('n5xt_session'); return r ? JSON.parse(r) : null; }
function setSession(user) { localStorage.setItem('n5xt_session', JSON.stringify(user)); }
function clearSession()   { localStorage.removeItem('n5xt_session'); }

function showErr(el, msg, cardEl) {
  el.className   = 'msg err';
  el.textContent = '⚠  ' + msg;
  if (cardEl) {
    cardEl.style.animation = 'none';
    void cardEl.offsetHeight;
    cardEl.style.animation = 'shake .42s ease';
  }
}
function clearErr(el) { el.textContent = ''; el.className = 'msg'; }

function toggleEye(btn, input) {
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.querySelector('.eo').style.display = show ? 'none'  : 'block';
  btn.querySelector('.ec').style.display = show ? 'block' : 'none';
}

function calcStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}
function applyStrength(pw, bars, label) {
  const colors = ['', 'var(--p)', 'var(--y)', 'var(--c)', 'var(--g)'];
  const words  = ['', 'WEAK', 'FAIR', 'STRONG', 'EXCELLENT'];
  const s = calcStrength(pw);
  bars.forEach((b, i) => b.style.background = i < s ? colors[s] : 'var(--d3)');
  label.textContent = pw ? words[s] : 'Enter a password';
  label.style.color = colors[s] || 'var(--dim)';
}

function wireOtpBoxes(selector, errEl, onSubmit) {
  const boxes = [...document.querySelectorAll(selector)];
  boxes.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(-1);
      if (inp.value && idx < boxes.length - 1) boxes[idx + 1].focus();
      clearErr(errEl);
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) boxes[idx - 1].focus();
      if (e.key === 'Enter') onSubmit();
    });
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      boxes.forEach((b, i) => { b.value = digits[i] || ''; });
      boxes[Math.min(digits.length, boxes.length - 1)].focus();
    });
  });
}
function getOtpValue(selector) {
  return [...document.querySelectorAll(selector)].map(b => b.value).join('');
}
function clearOtpBoxes(selector) {
  document.querySelectorAll(selector).forEach(b => b.value = '');
  document.querySelectorAll(selector)[0]?.focus();
}

function startCountdown(timerEl, resendBtn, seconds = 60) {
  resendBtn.dataset.disabled = 'true';
  resendBtn.style.opacity    = '0.4';
  let s = seconds;
  timerEl.textContent = `Resend in ${s}s`;
  const t = setInterval(() => {
    s--;
    if (s <= 0) {
      clearInterval(t);
      timerEl.textContent        = '';
      resendBtn.dataset.disabled = 'false';
      resendBtn.style.opacity    = '1';
    } else {
      timerEl.textContent = `Resend in ${s}s`;
    }
  }, 1000);
  return t;
}

function setLoading(sel, on) {
  const btn = document.querySelector(sel);
  if (!btn) return;
  btn.classList.toggle('ld', on);
  btn.disabled = on;
}