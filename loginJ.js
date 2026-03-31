/* =============================================
   loginJ.js
   ============================================= */

const $ = s => document.querySelector(s);
const card = $('#loginCard');
let pendingUser = null;

const ADMIN_USERS = ['admin', 'ADMIN'];

function getRedirect(username) {
  console.log('[REDIRECT] checking username:', username);
  console.log('[REDIRECT] is admin:', ADMIN_USERS.includes(username));
  const dest = ADMIN_USERS.includes(username) ? 'adminH.html' : 'GSH.html';
  console.log('[REDIRECT] going to:', dest);
  return dest;
}

window.addEventListener('DOMContentLoaded', () => {
  const session = getSession();
  if (session) {
    location.href = getRedirect(session.username);
    return;
  }
  const rem = localStorage.getItem('n5xt_remember');
  if (rem) { $('#lUser').value = rem; $('#lRem').checked = true; }
  $('#lUser').focus();
});

$('#lEye').addEventListener('click', function () { toggleEye(this, $('#lPass')); });
$('#lUser').addEventListener('input', () => clearErr($('#lErr')));
$('#lPass').addEventListener('input', () => clearErr($('#lErr')));
$('#lUser').addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
$('#lPass').addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });
$('#lBtn').addEventListener('click', submitLogin);

async function submitLogin() {
  const username = $('#lUser').value.trim();
  const password = $('#lPass').value;

  clearErr($('#lErr'));
  if (!username) { showErr($('#lErr'), 'USERNAME IS REQUIRED', card); $('#lUser').focus(); return; }
  if (!password) { showErr($('#lErr'), 'PASSWORD IS REQUIRED', card); $('#lPass').focus(); return; }

  setLoading('#lBtn', true);
  try {
    const res = await api.loginSend(username, password);
    if (res.success) {
      pendingUser = username;
      console.log('[LOGIN] pendingUser set to:', pendingUser);
      if ($('#lRem').checked) localStorage.setItem('n5xt_remember', username);
      else                    localStorage.removeItem('n5xt_remember');
      showOtpStep(res.data);
    } else {
      setLoading('#lBtn', false);
      $('#lPass').value = '';
      const map = {
        INVALID_CREDENTIALS: 'INVALID USERNAME OR PASSWORD',
        EMAIL_NOT_VERIFIED:  'CHECK YOUR EMAIL TO VERIFY YOUR ACCOUNT FIRST'
      };
      showErr($('#lErr'), map[res.code] || 'LOGIN FAILED', card);
    }
  } catch {
    setLoading('#lBtn', false);
    showErr($('#lErr'), 'CANNOT REACH SERVER', card);
  }
}

function showOtpStep(maskedEmail) {
  $('#loginFields').classList.add('hide');
  $('#lBtn').classList.add('hide');
  $('#loginFooter').classList.add('hide');
  $('#otpPanel').classList.remove('hide');
  $('#otpHint').textContent = `Code sent to ${maskedEmail}`;
  clearErr($('#otpErr'));
  wireOtpBoxes('.otp-digit', $('#otpErr'), submitOtp);
  startCountdown($('#otpTimer'), $('#otpResend'));
  document.querySelectorAll('.otp-digit')[0].focus();
}

$('#otpVerifyBtn').addEventListener('click', submitOtp);

async function submitOtp() {
  const code = getOtpValue('.otp-digit');
  clearErr($('#otpErr'));
  if (code.length < 6) { showErr($('#otpErr'), 'ENTER ALL 6 DIGITS', card); return; }

  setLoading('#otpVerifyBtn', true);
  try {
    const res = await api.loginVerify(pendingUser, code);
    console.log('[OTP] response:', res);
    console.log('[OTP] pendingUser at verify:', pendingUser);

    if (res.success) {
      // Get username from response data to be safe
      const loggedInUser = res.data || pendingUser;
      console.log('[OTP] loggedInUser:', loggedInUser);

      setSession({ username: loggedInUser });
      $('#otpVerifyBtn .btn-lbl').textContent = 'ACCESS GRANTED ✓';
      $('#otpVerifyBtn').style.background = 'rgba(0,245,212,.18)';

      const dest = getRedirect(loggedInUser);
      console.log('[OTP] redirecting to:', dest);
      setTimeout(() => { location.href = dest; }, 700);

    } else {
      setLoading('#otpVerifyBtn', false);
      clearOtpBoxes('.otp-digit');
      const map = {
        INVALID_OTP:    'INVALID OR EXPIRED CODE',
        USER_NOT_FOUND: 'SESSION EXPIRED'
      };
      showErr($('#otpErr'), map[res.code] || 'VERIFICATION FAILED', card);
    }
  } catch (err) {
    console.log('[OTP] error:', err);
    setLoading('#otpVerifyBtn', false);
    showErr($('#otpErr'), 'CANNOT REACH SERVER', card);
  }
}

$('#otpResend').addEventListener('click', async function () {
  if (this.dataset.disabled === 'true') return;
  clearOtpBoxes('.otp-digit');
  clearErr($('#otpErr'));
  try { await api.loginSend(pendingUser, $('#lPass').value); } catch { /* silent */ }
  startCountdown($('#otpTimer'), this);
});

$('#otpBack').addEventListener('click', () => {
  pendingUser = null;
  $('#otpPanel').classList.add('hide');
  $('#loginFields').classList.remove('hide');
  $('#lBtn').classList.remove('hide');
  $('#loginFooter').classList.remove('hide');
  setLoading('#lBtn', false);
  $('#lPass').value = '';
  $('#lUser').focus();
});