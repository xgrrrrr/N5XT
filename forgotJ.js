/* =============================================
   forgotJ.js
   ============================================= */

const $ = s => document.querySelector(s);
const card = $('#forgotCard');
let targetUser = null;
let otpPassed  = false;

$('#fEye1').addEventListener('click', function () { toggleEye(this, $('#fNewPass')); });
$('#fEye2').addEventListener('click', function () { toggleEye(this, $('#fConfPass')); });

$('#fNewPass').addEventListener('input', () => {
  applyStrength($('#fNewPass').value,
    ['fsb1','fsb2','fsb3','fsb4'].map(id => document.getElementById(id)),
    $('#fStrLbl')
  );
  clearErr($('#fErr3'));
});
$('#fConfPass').addEventListener('input', () => clearErr($('#fErr3')));
$('#fEmail').addEventListener('input',   () => clearErr($('#fErr1')));

// ── STEP A — find account ─────────────────────
$('#fFindBtn').addEventListener('click', submitForgot);
$('#fEmail').addEventListener('keydown', e => { if (e.key === 'Enter') submitForgot(); });

async function submitForgot() {
  const email = $('#fEmail').value.trim();
  clearErr($('#fErr1'));
  if (!email) { showErr($('#fErr1'), 'EMAIL IS REQUIRED', card); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr($('#fErr1'), 'INVALID EMAIL', card); return; }

  setLoading('#fFindBtn', true);
  try {
    const res = await api.forgotSend(email);
    if (res.success) {
      targetUser = res.extra;
      $('#fFoundName').textContent = targetUser.toUpperCase();
      $('#fOtpHint').textContent   = `Code sent to ${res.data}`;
      showPanel('#fpOtp');
      wireOtpBoxes('.fotp-digit', $('#fErr2'), submitOtp);
      startCountdown($('#fOtpTimer'), $('#fOtpResend'));
      document.querySelectorAll('.fotp-digit')[0].focus();
    } else {
      setLoading('#fFindBtn', false);
      showErr($('#fErr1'), 'NO ACCOUNT FOUND WITH THAT EMAIL', card);
    }
  } catch {
    setLoading('#fFindBtn', false);
    showErr($('#fErr1'), 'CANNOT REACH SERVER', card);
  }
}

// ── STEP B — verify OTP ───────────────────────
$('#fOtpVerifyBtn').addEventListener('click', submitOtp);

async function submitOtp() {
  const code = getOtpValue('.fotp-digit');
  clearErr($('#fErr2'));
  if (code.length < 6) { showErr($('#fErr2'), 'ENTER ALL 6 DIGITS', card); return; }

  setLoading('#fOtpVerifyBtn', true);
  try {
    const res = await api.forgotVerify(targetUser, code);
    if (res.success) {
      otpPassed = true;
      showPanel('#fpb');
      $('#fNewPass').focus();
    } else {
      setLoading('#fOtpVerifyBtn', false);
      clearOtpBoxes('.fotp-digit');
      showErr($('#fErr2'), 'INVALID OR EXPIRED CODE', card);
    }
  } catch {
    setLoading('#fOtpVerifyBtn', false);
    showErr($('#fErr2'), 'CANNOT REACH SERVER', card);
  }
}

// ── Resend ────────────────────────────────────
$('#fOtpResend').addEventListener('click', async function () {
  if (this.dataset.disabled === 'true') return;
  clearOtpBoxes('.fotp-digit');
  clearErr($('#fErr2'));
  try { await api.forgotSend($('#fEmail').value.trim()); } catch { /* silent */ }
  startCountdown($('#fOtpTimer'), this);
});

// ── STEP C — new password ─────────────────────
$('#fResetBtn').addEventListener('click', submitReset);
$('#fNewPass').addEventListener('keydown', e => { if (e.key === 'Enter') submitReset(); });
$('#fConfPass').addEventListener('keydown', e => { if (e.key === 'Enter') submitReset(); });

async function submitReset() {
  if (!otpPassed) return;
  const pw = $('#fNewPass').value;
  const cf = $('#fConfPass').value;
  clearErr($('#fErr3'));
  if (!pw)           { showErr($('#fErr3'), 'PASSWORD IS REQUIRED', card); return; }
  if (pw.length < 6) { showErr($('#fErr3'), 'PASSWORD MIN 6 CHARACTERS', card); return; }
  if (pw !== cf)     { showErr($('#fErr3'), 'PASSWORDS DO NOT MATCH', card); return; }

  setLoading('#fResetBtn', true);
  try {
    const res = await api.forgotReset(targetUser, pw);
    if (res.success) {
      showPanel('#fpc');
      setTimeout(() => { $('#fFill').style.width = '100%'; }, 100);
      setTimeout(() => { location.href = 'index.html'; }, 3300);
    } else {
      setLoading('#fResetBtn', false);
      const map = { SAME_PASSWORD: 'NEW PASSWORD MUST BE DIFFERENT' };
      showErr($('#fErr3'), map[res.code] || 'RESET FAILED', card);
    }
  } catch {
    setLoading('#fResetBtn', false);
    showErr($('#fErr3'), 'CANNOT REACH SERVER', card);
  }
}

// ── Back buttons ──────────────────────────────
$('#fOtpBack').addEventListener('click', () => {
  targetUser = null;
  showPanel('#fpa');
  setLoading('#fFindBtn', false);
  clearOtpBoxes('.fotp-digit');
});
$('#fBack').addEventListener('click', () => {
  otpPassed = false; targetUser = null;
  showPanel('#fpa');
  setLoading('#fFindBtn', false);
  $('#fNewPass').value = ''; $('#fConfPass').value = '';
});

function showPanel(id) {
  ['#fpa','#fpOtp','#fpb','#fpc'].forEach(p => {
    document.querySelector(p)?.classList.toggle('hide', p !== id);
  });
  const row = $('#fLoginRow');
  if (row) row.style.display = id === '#fpa' ? '' : 'none';
} 