import crypto from 'node:crypto';
import { get, run, setting } from '../db.js';
import { SECURE_COOKIES, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES } from '../config.js';
import { setCookie, unauthorized, forbidden, HttpError } from './http.js';

export const COOKIE = 'dv_session';

// --------------------------------------------------------------------------
// Hashing (scrypt). Contrasenas y PIN nunca se guardan en texto plano.
// --------------------------------------------------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashSecret(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifySecret(plain, stored) {
  if (!stored) return false;
  try {
    const [alg, N, r, p, saltB64, keyB64] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(String(plain), salt, expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// TOTP (2FA) para Administrador y Direccion
// --------------------------------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(len = 20) {
  const bytes = crypto.randomBytes(len);
  let bits = '', out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s) {
  let bits = '';
  for (const ch of s.toUpperCase().replace(/=+$/, '')) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1000000).padStart(6, '0');
}

/** Acepta una ventana de un periodo hacia atras y hacia adelante por desfase de reloj. */
export function verifyTotp(secret, token, window = 1) {
  if (!secret || !/^\d{6}$/.test(String(token || ''))) return false;
  const counter = Math.floor(Date.now() / 30000);
  for (let i = -window; i <= window; i++) {
    if (crypto.timingSafeEqual(Buffer.from(totpCode(secret, counter + i)), Buffer.from(String(token)))) return true;
  }
  return false;
}

export function otpauthUrl(secret, label) {
  return `otpauth://totp/${encodeURIComponent('Demo Vales')}:${encodeURIComponent(label)}` +
         `?secret=${secret}&issuer=${encodeURIComponent('Demo Vales')}&period=30&digits=6`;
}

// --------------------------------------------------------------------------
// Rate limiting y bloqueo temporal
// --------------------------------------------------------------------------
export function recordAttempt(identifier, ip, ok) {
  run('INSERT INTO login_attempts (identifier, ip, ok) VALUES (?, ?, ?)', String(identifier), ip || '', ok ? 1 : 0);
}

export function recentFailures(identifier, ip, minutes = 15) {
  const row = get(
    `SELECT COUNT(*) AS n FROM login_attempts
     WHERE ok = 0 AND created_at > datetime('now', ?) AND (identifier = ? OR ip = ?)`,
    `-${minutes} minutes`, String(identifier), ip || ' '
  );
  return row ? row.n : 0;
}

export function requiresCaptcha(identifier, ip) {
  const umbral = Number(setting('captcha_umbral_intentos', '5'));
  return recentFailures(identifier, ip) >= umbral;
}

/**
 * Verificacion adicional SOLO ante actividad sospechosa.
 * Durante el uso normal en planta la prioridad es la velocidad, por eso nunca
 * se muestra. Es una operacion aritmetica simple resuelta en el propio servidor,
 * sin servicios de terceros ni seguimiento del usuario.
 */
const retos = new Map();

export function generarReto(ip) {
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 2 + Math.floor(Math.random() * 8);
  retos.set(ip || '', { respuesta: a + b, expira: Date.now() + 5 * 60000 });
  return `${a} + ${b}`;
}

export function verificarReto(ip, respuesta) {
  const reto = retos.get(ip || '');
  if (!reto || reto.expira < Date.now()) return false;
  const ok = Number(respuesta) === reto.respuesta;
  if (ok) retos.delete(ip || '');
  return ok;
}

export function purgarRetos() {
  const ahora = Date.now();
  for (const [k, v] of retos) if (v.expira < ahora) retos.delete(k);
}

export function applyFailure(user, identifier, ip) {
  recordAttempt(identifier, ip, false);
  if (!user) return;
  const attempts = user.failed_attempts + 1;
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    run(`UPDATE users SET failed_attempts = ?, locked_until = datetime('now', ?) WHERE id = ?`,
      attempts, `+${LOCKOUT_MINUTES} minutes`, user.id);
  } else {
    run('UPDATE users SET failed_attempts = ? WHERE id = ?', attempts, user.id);
  }
}

export function isLocked(user) {
  if (!user || !user.locked_until) return false;
  const row = get(`SELECT datetime('now') < ? AS locked`, user.locked_until);
  return !!(row && row.locked);
}

// --------------------------------------------------------------------------
// Sesiones. La cookie lleva el token; la base guarda solo su hash.
// --------------------------------------------------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(res, user, kind, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const minutes = kind === 'PIN'
    ? Number(setting('sesion_pin_minutos', '5'))
    : Number(setting('sesion_password_minutos', '480'));
  run(
    `INSERT INTO sessions (id, user_id, kind, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
    sha256(token), user.id, kind, (req && req.ip) || '',
    String((req && req.headers['user-agent']) || '').slice(0, 250), `+${minutes} minutes`
  );
  setCookie(res, COOKIE, token, { secure: SECURE_COOKIES, sameSite: 'Lax', maxAge: minutes * 60 });
  run(`UPDATE users SET last_login_at = datetime('now'), failed_attempts = 0, locked_until = NULL WHERE id = ?`, user.id);
  return { minutes };
}

export function destroySession(res, token) {
  if (token) run(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?`, sha256(token));
  setCookie(res, COOKIE, '', { secure: SECURE_COOKIES, maxAge: 0 });
}

export function loadSession(token) {
  if (!token) return null;
  const row = get(
    `SELECT s.id AS sid, s.kind, s.expires_at, u.*
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now') AND u.activo = 1`,
    sha256(token)
  );
  if (!row) return null;
  // Ventana deslizante: cada peticion renueva la sesion.
  const minutes = row.kind === 'PIN'
    ? Number(setting('sesion_pin_minutos', '5'))
    : Number(setting('sesion_password_minutos', '480'));
  run(`UPDATE sessions SET last_seen_at = datetime('now'), expires_at = datetime('now', ?) WHERE id = ?`,
    `+${minutes} minutes`, row.sid);
  return row;
}

export function purgeExpired() {
  purgarRetos();
  run(`DELETE FROM sessions WHERE expires_at < datetime('now', '-1 day')`);
  run(`DELETE FROM login_attempts WHERE created_at < datetime('now', '-7 days')`);
}

export { unauthorized, forbidden, HttpError };
