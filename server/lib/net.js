import { setting } from '../db.js';

/**
 * Restriccion de red para los iPads de planta.
 * Si el dispositivo sale de la red autorizada no debe permitir crear vales.
 * Las redes permitidas son configurables por el Administrador (CIDR).
 */
function ipToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n;
}

export function ipEnCidr(ip, cidr) {
  const [red, bitsRaw] = cidr.trim().split('/');
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  const a = ipToLong(ip);
  const b = ipToLong(red);
  if (a === null || b === null || !Number.isFinite(bits)) return false;
  if (bits <= 0) return true;
  const mask = bits >= 32 ? 0xffffffff : ~((2 ** (32 - bits)) - 1) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

export function redAutorizada(ip) {
  if (setting('restriccion_red_activa', '0') !== '1') return true;
  if (!ip) return false;
  if (ip === '::1') return true;
  const limpia = ip.replace(/^::ffff:/, '');
  const redes = String(setting('redes_permitidas', '')).split(',').filter(Boolean);
  return redes.some((c) => ipEnCidr(limpia, c));
}
