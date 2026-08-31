import { get } from '../db.js';

/**
 * Ajusta una cantidad a los decimales que admite su unidad.
 * Evita solicitudes imposibles como "1.77 piezas": la confusion de unidades
 * es uno de los errores que el sistema debe eliminar.
 */
const cache = new Map();

export function decimalesDeUnidad(unidadId) {
  if (cache.has(unidadId)) return cache.get(unidadId);
  const fila = get('SELECT decimales FROM unidades WHERE id = ?', unidadId);
  const d = fila ? fila.decimales : 2;
  cache.set(unidadId, d);
  return d;
}

export function redondearPorUnidad(cantidad, unidadId) {
  const d = decimalesDeUnidad(unidadId);
  const factor = 10 ** d;
  return Math.round(Number(cantidad) * factor) / factor;
}

export function limpiarCacheUnidades() { cache.clear(); }
