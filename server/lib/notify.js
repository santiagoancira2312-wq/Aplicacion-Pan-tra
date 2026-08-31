import { all, run } from '../db.js';

/** Notificaciones dentro de la aplicacion (base para push cuando se habilite). */
export function notificar(userId, { tipo, titulo, cuerpo = null, vale_id = null }) {
  if (!userId) return;
  run(
    'INSERT INTO notificaciones (user_id, tipo, titulo, cuerpo, vale_id) VALUES (?, ?, ?, ?, ?)',
    userId, tipo, titulo, cuerpo, vale_id
  );
}

export function notificarRol(rol, payload, empresa = null) {
  const usuarios = empresa
    ? all('SELECT id FROM users WHERE rol = ? AND activo = 1 AND empresa = ?', rol, empresa)
    : all('SELECT id FROM users WHERE rol = ? AND activo = 1', rol);
  for (const u of usuarios) notificar(u.id, payload);
}
