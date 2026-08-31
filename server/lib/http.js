import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR } from '../config.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const badRequest = (m, e) => new HttpError(400, m, e);
export const unauthorized = (m = 'Sesion no valida o expirada') => new HttpError(401, m);
export const forbidden = (m = 'No tiene permiso para realizar esta accion') => new HttpError(403, m);
export const notFound = (m = 'No encontrado') => new HttpError(404, m);
export const conflict = (m, e) => new HttpError(409, m, e);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8'
};

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; " +
    "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

export function sendText(res, status, text, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, opts = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, 'HttpOnly', `SameSite=${opts.sameSite || 'Lax'}`];
  if (opts.secure) bits.push('Secure');
  if (opts.maxAge != null) bits.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) bits.push(`Expires=${opts.expires.toUTCString()}`);
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  list.push(bits.join('; '));
  res.setHeader('Set-Cookie', list);
}

const MAX_BODY = 6 * 1024 * 1024; // permite firmas PNG en base64

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Contenido demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw badRequest('El cuerpo de la solicitud no es JSON valido');
  }
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

/** Router minimo con patrones estilo /api/vales/:id */
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp('^' + pattern.replace(/:[A-Za-z_]+/g, (m) => {
      keys.push(m.slice(1));
      return '([^/]+)';
    }) + '$');
    this.routes.push({ method, regex, keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = pathname.match(r.regex);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
    return null;
  }
}

const SAFE = /^[A-Za-z0-9._/-]+$/;

export function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel.includes('..') || !SAFE.test(rel)) return false;
  let file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (stat.isDirectory()) {
    file = path.join(file, 'index.html');
    try { stat = fs.statSync(file); } catch { return false; }
  }
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return true;
  }
  const cache = ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300';
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cache,
    ETag: etag
  });
  fs.createReadStream(file).pipe(res);
  return true;
}
