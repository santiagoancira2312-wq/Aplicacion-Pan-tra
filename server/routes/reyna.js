import { all, get, run, tx } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/http.js';
import { requireUser } from './auth.js';
import { requirePerm } from '../lib/rbac.js';
import { audit } from '../lib/audit.js';

/**
 * Modulo de la empresa externa. No existe un inventario separado:
 * se descuenta del mismo inventario fisico, pero cada movimiento guarda
 * EMPRESA RESPONSABLE = REYNA, su PRECIO UNITARIO HISTORICO y su IMPORTE.
 */
const periodoValido = (p) => /^\d{4}-\d{2}$/.test(String(p || ''));

function lineasEstadoCuenta(periodo, extra = {}) {
  const where = ["mv.empresa = 'REYNA'", "mv.tipo IN ('SALIDA','DEVOLUCION')"];
  const params = [];
  if (periodo) { where.push("strftime('%Y-%m', mv.created_at) = ?"); params.push(periodo); }
  if (extra.desde) { where.push('date(mv.created_at) >= date(?)'); params.push(extra.desde); }
  if (extra.hasta) { where.push('date(mv.created_at) <= date(?)'); params.push(extra.hasta); }
  if (extra.trabajador_id) { where.push('v.trabajador_id = ?'); params.push(extra.trabajador_id); }

  return all(
    `SELECT mv.created_at AS fecha, mv.tipo, v.folio, v.id AS vale_id,
            w.nombre AS trabajador, w.employee_id AS trabajador_clave,
            t.numero AS trailer, m.sku, m.nombre AS material,
            mv.cantidad, un.codigo AS unidad, mv.precio_unitario AS precio,
            CASE WHEN mv.tipo = 'DEVOLUCION' THEN -mv.importe ELSE mv.importe END AS importe,
            sup.nombre AS supervisor, alm.nombre AS almacenista,
            v.cierre_reyna_id
     FROM movimientos mv
     JOIN materiales m ON m.id = mv.material_id
     JOIN unidades un ON un.id = m.unidad_id
     LEFT JOIN vales v ON v.id = mv.vale_id
     LEFT JOIN users w ON w.id = v.trabajador_id
     LEFT JOIN users sup ON sup.id = v.autorizado_por
     LEFT JOIN users alm ON alm.id = mv.user_id
     LEFT JOIN trailers t ON t.id = mv.trailer_id
     WHERE ${where.join(' AND ')}
     ORDER BY mv.created_at DESC`, ...params
  );
}

export default function register(r) {
  r.get('/api/reyna/resumen', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'reyna.leer');

    const mesActual = new Date().toISOString().slice(0, 7);
    const kpi = get(
      `SELECT
         COALESCE(SUM(CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END), 0) AS total_historico,
         COALESCE(SUM(CASE WHEN strftime('%Y-%m', mv.created_at) = ?
                           THEN (CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END)
                           ELSE 0 END), 0) AS total_mes
       FROM movimientos mv
       WHERE mv.empresa = 'REYNA' AND mv.tipo IN ('SALIDA','DEVOLUCION')`, mesActual
    );

    const cerrado = get(
      `SELECT COALESCE(SUM(total), 0) AS n FROM reyna_cierres WHERE estado = 'CERRADO'`
    ).n;
    const ajustes = get('SELECT COALESCE(SUM(importe), 0) AS n FROM reyna_ajustes').n;

    return {
      total_historico: kpi.total_historico,
      total_mes: kpi.total_mes,
      total_cerrado: cerrado + ajustes,
      por_cobrar: kpi.total_historico - cerrado - ajustes,
      periodo_actual: mesActual,
      vales: get(`SELECT COUNT(*) AS n FROM vales WHERE empresa = 'REYNA'`).n,
      vales_mes: get(
        `SELECT COUNT(*) AS n FROM vales WHERE empresa = 'REYNA' AND strftime('%Y-%m', created_at) = ?`, mesActual
      ).n,
      trabajadores: get(`SELECT COUNT(*) AS n FROM users WHERE empresa = 'REYNA' AND activo = 1`).n,
      por_mes: all(
        `SELECT strftime('%Y-%m', mv.created_at) AS periodo,
                COALESCE(SUM(CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END), 0) AS importe,
                COUNT(DISTINCT mv.vale_id) AS vales
         FROM movimientos mv WHERE mv.empresa = 'REYNA' AND mv.tipo IN ('SALIDA','DEVOLUCION')
         GROUP BY periodo ORDER BY periodo DESC LIMIT 12`
      ),
      top_materiales: all(
        `SELECT m.sku, m.nombre, SUM(mv.cantidad) AS cantidad,
                SUM(CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END) AS importe
         FROM movimientos mv JOIN materiales m ON m.id = mv.material_id
         WHERE mv.empresa = 'REYNA' AND mv.tipo IN ('SALIDA','DEVOLUCION')
         GROUP BY m.id ORDER BY importe DESC LIMIT 10`
      ),
      por_trabajador: all(
        `SELECT w.nombre, w.employee_id,
                COUNT(DISTINCT v.id) AS vales,
                COALESCE(SUM(CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END), 0) AS importe
         FROM movimientos mv
         JOIN vales v ON v.id = mv.vale_id
         JOIN users w ON w.id = v.trabajador_id
         WHERE mv.empresa = 'REYNA' AND mv.tipo IN ('SALIDA','DEVOLUCION')
         GROUP BY w.id ORDER BY importe DESC`
      )
    };
  });

  r.get('/api/reyna/estado-cuenta', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'reyna.leer');
    const periodo = ctx.query.periodo && periodoValido(ctx.query.periodo) ? ctx.query.periodo : null;
    const lineas = lineasEstadoCuenta(periodo, ctx.query);
    const total = lineas.reduce((s, l) => s + (l.importe || 0), 0);
    const cierre = periodo ? get('SELECT * FROM reyna_cierres WHERE periodo = ?', periodo) : null;
    return {
      periodo, lineas, total, num_lineas: lineas.length,
      cierre, cerrado: !!cierre,
      periodos: all(
        `SELECT DISTINCT strftime('%Y-%m', created_at) AS periodo FROM movimientos
         WHERE empresa = 'REYNA' ORDER BY periodo DESC`
      ).map((p) => p.periodo)
    };
  });

  r.get('/api/reyna/cierres', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'reyna.leer');
    return {
      cierres: all(
        `SELECT c.*, u.nombre AS cerrado_por_nombre,
                (SELECT COALESCE(SUM(importe), 0) FROM reyna_ajustes a WHERE a.cierre_id = c.id) AS ajustes
         FROM reyna_cierres c LEFT JOIN users u ON u.id = c.cerrado_por
         ORDER BY c.periodo DESC`
      )
    };
  });

  // -------------------------------------------------------------------------
  // CIERRE MENSUAL. Despues del cierre nada se modifica silenciosamente:
  // cualquier cambio posterior debe registrarse como AJUSTE con motivo.
  // -------------------------------------------------------------------------
  r.post('/api/reyna/cierres', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'reyna.cerrar');
    const periodo = String(ctx.body.periodo || '');
    if (!periodoValido(periodo)) throw badRequest('Indique el periodo en formato AAAA-MM');
    if (get('SELECT 1 AS x FROM reyna_cierres WHERE periodo = ?', periodo)) {
      throw conflict(`El periodo ${periodo} ya fue cerrado`);
    }
    const mesActual = new Date().toISOString().slice(0, 7);
    if (periodo > mesActual) throw badRequest('No se puede cerrar un periodo futuro');

    const lineas = lineasEstadoCuenta(periodo);
    const total = lineas.reduce((s, l) => s + (l.importe || 0), 0);

    const resultado = tx(() => {
      const info = run(
        `INSERT INTO reyna_cierres (periodo, total, lineas, estado, cerrado_por, notas)
         VALUES (?, ?, ?, 'CERRADO', ?, ?)`,
        periodo, total, lineas.length, user.id, ctx.body.notas || null
      );
      const cierreId = Number(info.lastInsertRowid);
      // Los vales del periodo quedan marcados con el cierre en que aparecieron.
      run(
        `UPDATE vales SET cierre_reyna_id = ?
         WHERE empresa = 'REYNA' AND cierre_reyna_id IS NULL
           AND id IN (SELECT DISTINCT vale_id FROM movimientos
                      WHERE empresa = 'REYNA' AND vale_id IS NOT NULL
                        AND strftime('%Y-%m', created_at) = ?)`, cierreId, periodo
      );
      audit({ user, ip: ctx.ip }, {
        accion: 'REYNA_CIERRE_MENSUAL', entidad: 'reyna_cierres', entidad_id: cierreId,
        nuevo: { periodo, total, lineas: lineas.length }, motivo: ctx.body.notas || null
      });
      return { id: cierreId, periodo, total, lineas: lineas.length };
    });
    return resultado;
  });

  r.post('/api/reyna/cierres/:id/ajuste', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'reyna.cerrar');
    const cierre = get('SELECT * FROM reyna_cierres WHERE id = ?', Number(ctx.params.id));
    if (!cierre) throw notFound('Cierre no encontrado');
    const importe = Number(ctx.body.importe);
    if (!Number.isFinite(importe) || importe === 0) throw badRequest('Indique el importe del ajuste');
    const motivo = String(ctx.body.motivo || '').trim();
    if (!motivo) throw badRequest('Todo ajuste posterior a un cierre requiere motivo');

    const info = run(
      'INSERT INTO reyna_ajustes (cierre_id, importe, motivo, user_id) VALUES (?, ?, ?, ?)',
      cierre.id, importe, motivo, user.id
    );
    audit({ user, ip: ctx.ip }, {
      accion: 'REYNA_AJUSTE', entidad: 'reyna_cierres', entidad_id: cierre.id,
      antes: { total: cierre.total }, nuevo: { ajuste: importe }, motivo
    });
    return { id: Number(info.lastInsertRowid) };
  });

  r.get('/api/reyna/trabajadores', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'reyna.leer');
    return {
      trabajadores: all(
        `SELECT u.id, u.employee_id, u.nombre, u.rol, u.activo, a.nombre AS area,
                (SELECT COUNT(*) FROM vales v WHERE v.trabajador_id = u.id) AS vales,
                (SELECT COALESCE(SUM(mv.importe), 0) FROM movimientos mv
                   JOIN vales v ON v.id = mv.vale_id
                   WHERE v.trabajador_id = u.id AND mv.tipo = 'SALIDA') AS importe
         FROM users u LEFT JOIN areas a ON a.id = u.area_id
         WHERE u.empresa = 'REYNA' ORDER BY u.rol, u.nombre`
      )
    };
  });
}
