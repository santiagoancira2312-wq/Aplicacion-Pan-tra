import { run } from '../db.js';

/**
 * Toda modificacion critica queda registrada: usuario, fecha, hora, accion,
 * valor anterior, valor nuevo y motivo. Nunca se borra informacion historica.
 */
export function audit(ctx, { accion, entidad, entidad_id = null, antes = null, nuevo = null, motivo = null }) {
  const user = ctx && ctx.user;
  run(
    `INSERT INTO auditoria (user_id, user_nombre, accion, entidad, entidad_id, valor_antes, valor_nuevo, motivo, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user ? user.id : null,
    user ? user.nombre : 'SISTEMA',
    accion, entidad, entidad_id == null ? null : String(entidad_id),
    antes == null ? null : JSON.stringify(antes),
    nuevo == null ? null : JSON.stringify(nuevo),
    motivo, (ctx && ctx.ip) || null
  );
}

/** Diferencia entre dos objetos, para no guardar campos que no cambiaron. */
export function diff(antes, despues, campos) {
  const a = {}, b = {};
  for (const c of campos) {
    if (antes[c] !== despues[c] && despues[c] !== undefined) {
      a[c] = antes[c];
      b[c] = despues[c];
    }
  }
  return Object.keys(b).length ? { antes: a, nuevo: b } : null;
}

