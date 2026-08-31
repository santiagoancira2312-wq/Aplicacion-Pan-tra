import { badRequest } from './http.js';

/**
 * Construye un UPDATE solo con los campos realmente enviados.
 * Evita que una actualizacion parcial (por ejemplo, activar o desactivar un
 * registro) borre datos que el cliente no incluyo en la peticion.
 */
export function construirActualizacion(campos, body) {
  const set = [];
  const valores = [];
  for (const c of campos) {
    if (body[c] === undefined) continue;
    set.push(`${c} = ?`);
    const v = body[c];
    valores.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  return { set, valores };
}

export function sentenciaActualizacion(tabla, campos, body, extraSet = []) {
  const { set, valores } = construirActualizacion(campos, body);
  const partes = [...set, ...extraSet];
  if (!set.length) throw badRequest('No se recibio ningun cambio');
  return { sql: `UPDATE ${tabla} SET ${partes.join(', ')} WHERE id = ?`, valores };
}
