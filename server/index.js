import http from 'node:http';
import { PORT, HOST } from './config.js';
import { migrate } from './db.js';
import {
  Router, serveStatic, sendJson, sendText, securityHeaders,
  parseCookies, readJson, clientIp, HttpError, notFound
} from './lib/http.js';
import { COOKIE, loadSession, purgeExpired } from './lib/auth.js';

import registerAuth from './routes/auth.js';
import registerCatalogo from './routes/catalogo.js';
import registerKits from './routes/kits.js';
import registerVales from './routes/vales.js';
import registerAlmacen from './routes/almacen.js';
import registerInventario from './routes/inventario.js';
import registerReyna from './routes/reyna.js';
import registerDashboard from './routes/dashboard.js';
import registerAnalitica from './routes/analitica.js';
import registerAdmin from './routes/admin.js';
import registerExport from './routes/exportar.js';

migrate();

const router = new Router();
for (const register of [
  registerAuth, registerCatalogo, registerKits, registerVales,
  registerAlmacen, registerInventario, registerReyna, registerDashboard,
  registerAnalitica, registerAdmin, registerExport
]) register(router);

// Limite general de peticiones por IP (proteccion basica del backend).
const buckets = new Map();
const RATE_LIMIT = { ventanaMs: 60_000, max: 600 };

function rateLimited(ip) {
  const ahora = Date.now();
  let b = buckets.get(ip);
  if (!b || ahora - b.inicio > RATE_LIMIT.ventanaMs) {
    b = { inicio: ahora, n: 0 };
    buckets.set(ip, b);
  }
  b.n += 1;
  return b.n > RATE_LIMIT.max;
}
setInterval(() => {
  const limite = Date.now() - RATE_LIMIT.ventanaMs;
  for (const [ip, b] of buckets) if (b.inicio < limite) buckets.delete(ip);
  purgeExpired();
}, 60_000).unref();

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const ip = clientIp(req);
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname.startsWith('/api/')) {
      if (rateLimited(ip)) throw new HttpError(429, 'Demasiadas solicitudes. Intente nuevamente en un momento.');

      const match = router.match(req.method, pathname);
      if (!match) throw notFound(`Ruta no encontrada: ${req.method} ${pathname}`);

      const cookies = parseCookies(req);
      const token = cookies[COOKIE];
      req.ip = ip;

      const ctx = {
        req, res, ip, url,
        params: match.params,
        query: Object.fromEntries(url.searchParams),
        token,
        user: loadSession(token),
        body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {}
      };

      const result = await match.handler(ctx);
      if (!res.writableEnded) sendJson(res, 200, result === undefined ? { ok: true } : result);
      return;
    }

    if (serveStatic(req, res, pathname)) return;

    // La PWA es una SPA: cualquier ruta desconocida devuelve index.html.
    if (req.method === 'GET' && !pathname.includes('.')) {
      if (serveStatic(req, res, '/index.html')) return;
    }
    sendText(res, 404, 'No encontrado');
  } catch (err) {
    if (res.writableEnded) return;
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[error]', req.method, pathname, err);
    sendJson(res, status, {
      error: status >= 500 ? 'Error interno del servidor' : err.message,
      ...(err.extra || {})
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Demo Aplicacion - Vales e Inventario`);
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
