/* =============================================
   registerJ.js
   ============================================= */

const $ = s => document.querySelector(s);
const card = $('#regCard');
let usernameTimer, emailTimer;

$('#rEye1').addEventListener('click', function () { toggleEye(this, $('#rPass')); });
$('#rEye2').addEventListener('click', function () { toggleEye(this, $('#rConf')); });

// ── Live username check ───────────────────────
$('#rUser').addEventListener('input', () => {
  clearTimeout(usernameTimer);
  const v = $('#rUser').value.trim();
  const h = $('#rUserHint');
  clearErr($('#rErr1'));
  if (!v) { h.textContent = ''; h.className = 'fhint'; return; }
  if (v.length < 3) { h.textContent = 'Min 3 characters'; h.className = 'fhint err'; return; }
  if (!/^[a-zA-Z0-9_]+$/.test(v)) { h.textContent = 'Letters, numbers & _ only'; h.className = 'fhint err'; return; }
  h.textContent = '…'; h.className = 'fhint';
  usernameTimer = setTimeout(async () => {
    const ok = await api.checkUsername(v).catch(() => null);
    if (ok === null) { h.textContent = ''; return; }
    h.textContent = ok ? 'Available ✓' : 'Username taken';
    h.className   = ok ? 'fhint ok'    : 'fhint err';
  }, 450);
});

// ── Live email check ──────────────────────────
$('#rEmail').addEventListener('input', () => {
  clearTimeout(emailTimer);
  const v = $('#rEmail').value.trim();
  const h = $('#rEmailHint');
  clearErr($('#rErr1'));
  if (!v) { h.textContent = ''; h.className = 'fhint'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { h.textContent = 'Invalid email'; h.className = 'fhint err'; return; }
  h.textContent = '…'; h.className = 'fhint';
  emailTimer = setTimeout(async () => {
    const ok = await api.checkEmail(v).catch(() => null);
    if (ok === null) { h.textContent = ''; return; }
    h.textContent = ok ? 'Available ✓' : 'Email already registered';
    h.className   = ok ? 'fhint ok'    : 'fhint err';
  }, 450);
});

// ── Password strength ─────────────────────────
$('#rPass').addEventListener('input', () => {
  applyStrength($('#rPass').value,
    ['sb1','sb2','sb3','sb4'].map(id => document.getElementById(id)),
    $('#strLbl')
  );
});

// ── Step 1 → 2 ───────────────────────────────
$('#rNext').addEventListener('click', goStep2);
$('#rUser').addEventListener('keydown', e => { if (e.key === 'Enter') goStep2(); });
$('#rEmail').addEventListener('keydown', e => { if (e.key === 'Enter') goStep2(); });

function goStep2() {
  const u  = $('#rUser').value.trim();
  const em = $('#rEmail').value.trim();
  clearErr($('#rErr1'));
  if (!u)  { showErr($('#rErr1'), 'USERNAME IS REQUIRED', card); return; }
  if (u.length < 3) { showErr($('#rErr1'), 'USERNAME TOO SHORT', card); return; }
  if (!/^[a-zA-Z0-9_]+$/.test(u)) { showErr($('#rErr1'), 'INVALID USERNAME CHARACTERS', card); return; }
  if (!em) { showErr($('#rErr1'), 'EMAIL IS REQUIRED', card); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { showErr($('#rErr1'), 'INVALID EMAIL', card); return; }

  $('#rp1').classList.add('hide');
  $('#rp2').classList.remove('hide');
  $('#rs1').classList.replace('active', 'done');
  $('#rs2').classList.add('active');
  $('#rln1').classList.add('done');
  $('#rPass').focus();
}

// ── Back ─────────────────────────────────────
$('#rBack').addEventListener('click', () => {
  $('#rp2').classList.add('hide');
  $('#rp1').classList.remove('hide');
  $('#rs2').classList.remove('active');
  $('#rs1').classList.remove('done');
  $('#rs1').classList.add('active');
  $('#rln1').classList.remove('done');
});

// ── Submit ────────────────────────────────────
$('#rCreateBtn').addEventListener('click', submitRegister);
$('#rPass').addEventListener('keydown', e => { if (e.key === 'Enter') submitRegister(); });
$('#rConf').addEventListener('keydown', e => { if (e.key === 'Enter') submitRegister(); });

async function submitRegister() {
  const pw = $('#rPass').value;
  const cf = $('#rConf').value;
  clearErr($('#rErr2'));
  if (!pw)           { showErr($('#rErr2'), 'PASSWORD IS REQUIRED', card); return; }
  if (pw.length < 6) { showErr($('#rErr2'), 'PASSWORD MIN 6 CHARACTERS', card); return; }
  if (pw !== cf)     { showErr($('#rErr2'), 'PASSWORDS DO NOT MATCH', card); return; }
  if (!$('#rTerms').checked) { showErr($('#rErr2'), 'YOU MUST AGREE TO TERMS', card); return; }

  setLoading('#rCreateBtn', true);
  try {
    const res = await api.register($('#rUser').value.trim(), $('#rEmail').value.trim(), pw);
    if (res.success) {
      $('#rp2').classList.add('hide');
      $('#rp3').classList.remove('hide');
      $('#rLoginRow').style.display = 'none';
      $('#rs2').classList.replace('active', 'done');
      $('#rs3').classList.add('active');
      $('#rln2').classList.add('done');
      $('#rNewName').textContent = res.data;
      setTimeout(() => { $('#rFill').style.width = '100%'; }, 100);
      setTimeout(() => { location.href = 'index.html'; }, 3300);
    } else {
      setLoading('#rCreateBtn', false);
      const map = { USERNAME_TAKEN: 'USERNAME ALREADY TAKEN', EMAIL_TAKEN: 'EMAIL ALREADY REGISTERED' };
      showErr($('#rErr2'), map[res.code] || 'REGISTRATION FAILED', card);
    }
  } catch {
    setLoading('#rCreateBtn', false);
    showErr($('#rErr2'), 'CANNOT REACH SERVER', card);
  }
}