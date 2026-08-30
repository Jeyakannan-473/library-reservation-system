// If the frontend is hosted separately from the backend (e.g. frontend on
// Vercel/Netlify, backend on Render), set window.API_BASE_URL before this
// script loads (see the small config block at the top of index.html).
// Defaults to a relative path, which is correct when this server also
// serves the frontend (the default setup).
const API_BASE = (window.API_BASE_URL || '') + '/api';

function getToken() { return localStorage.getItem('token'); }
function getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); }
function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON response, e.g. CSV */ }

  if (!res.ok) {
    const error = new Error((data && data.error) || 'Something went wrong. Please try again.');
    error.payload = data;
    error.status = res.status;
    throw error;
  }
  return data;
}
