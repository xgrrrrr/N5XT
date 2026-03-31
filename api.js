/* =============================================
   api.js  —  all server requests live here
   ============================================= */

const BASE = 'https://n5xt.infinityfreeapp.com/';

const api = {

  register(username, email, password) {
    return post('register.php', { username, email, password });
  },

  loginSend(username, password) {
    return post('login.php', { username, password });
  },

  loginVerify(username, code) {
    return post('loginverify.php', { username, code });
  },

  forgotSend(email) {
    return post('forgot.php', { email });
  },

  forgotVerify(username, code) {
    return post('forgotverify.php', { username, code });
  },

  forgotReset(username, newPassword) {
    return post('forgotreset.php', { username, newPassword });
  },

  async checkUsername(value) {
    try {
      const res  = await fetch(`${BASE}/check.php?type=username&value=${encodeURIComponent(value)}`);
      const data = await res.json();
      return data.available;
    } catch { return null; }
  },

  async checkEmail(value) {
    try {
      const res  = await fetch(`${BASE}/check.php?type=email&value=${encodeURIComponent(value)}`);
      const data = await res.json();
      return data.available;
    } catch { return null; }
  }
};

async function post(file, body) {
  console.log('[API] POST →', `${BASE}/${file}`, body);
  try {
    const res  = await fetch(`${BASE}/${file}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });

    const text = await res.text();
    console.log('[API] RAW response:', text);

    try {
      return JSON.parse(text);
    } catch {
      console.error('[API] Response is not JSON:', text);
      throw new Error('Server returned non-JSON: ' + text);
    }
  } catch (err) {
    console.error('[API] Request failed:', err.message);
    throw err;
  }
}