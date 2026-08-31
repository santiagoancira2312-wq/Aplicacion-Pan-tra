import { forbidden } from './http.js';

/**
 * Control de acceso basado en roles.
 * El alcance por empresa (INTERNA / REYNA) se aplica ademas en cada consulta:
 * un usuario REYNA solo puede ver informacion relacionada con REYNA.
 */
export const PERMISOS = {
  ADMIN: ['*'],

  DIRECCION: [
    'usuarios.leer', 'catalogo.leer', 'kits.leer', 'trailers.leer', 'areas.leer',
    'vales.todos', 'inventario.leer', 'costos.leer', 'dashboard.leer',
    'analitica.leer', 'reyna.leer', 'auditoria.leer', 'exportar', 'movimientos.leer'
  ],

  SUPERVISOR: [
    'vales.crear', 'vales.propios', 'vales.area', 'vales.autorizar',
    'catalogo.leer', 'kits.leer', 'trailers.leer', 'areas.leer',
    'inventario.leer', 'analitica.area', 'exportar'
  ],

  ALMACEN: [
    'vales.todos', 'vales.preparar', 'vales.entregar', 'vales.cerrar',
    'catalogo.leer', 'kits.leer', 'trailers.leer', 'areas.leer',
    'inventario.leer', 'inventario.entradas', 'inventario.ajustes',
    'inventario.devoluciones', 'costos.leer', 'movimientos.leer',
    'reyna.leer', 'reyna.cerrar', 'exportar'
  ],

  TRABAJADOR: [
    'vales.crear', 'vales.propios', 'catalogo.leer', 'kits.leer', 'trailers.leer'
  ]
};

export function can(user, permiso) {
  if (!user) return false;
  const lista = PERMISOS[user.rol] || [];
  return lista.includes('*') || lista.includes(permiso);
}

export function requirePerm(user, permiso) {
  if (!can(user, permiso)) {
    throw forbidden(`Su rol (${user ? user.rol : 'invitado'}) no tiene el permiso: ${permiso}`);
  }
}

export function requireRole(user, ...roles) {
  if (!user || !roles.includes(user.rol)) {
    throw forbidden('Su rol no tiene acceso a esta seccion');
  }
}

/** El trabajador nunca ve costos; el supervisor solo consumo de su area. */
export function puedeVerCostos(user) {
  return can(user, 'costos.leer');
}

/**
 * Alcance de vales visible para el usuario.
 * Devuelve un fragmento SQL y sus parametros, aplicado sobre la tabla `vales v`.
 */
export function alcanceVales(user) {
  const where = [];
  const params = [];

  if (user.rol === 'TRABAJADOR') {
    where.push('v.trabajador_id = ?');
    params.push(user.id);
  } else if (user.rol === 'SUPERVISOR') {
    // Sus propios vales y los de su area.
    where.push('(v.area_id = ? OR v.trabajador_id = ? OR v.supervisor_id = ?)');
    params.push(user.area_id, user.id, user.id);
  }

  // Un usuario de la empresa externa unicamente ve informacion de su empresa.
  if (user.empresa === 'REYNA') {
    where.push('v.empresa = ?');
    params.push('REYNA');
  }

  return { sql: where.length ? where.join(' AND ') : '1=1', params };
}

export function permisosDe(user) {
  return PERMISOS[user.rol] || [];
}
