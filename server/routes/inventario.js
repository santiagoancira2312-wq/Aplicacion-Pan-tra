import { all, get, run, tx } from '../db.js';
import { badRequest, notFound } from '../lib/http.js';
import { requireUser } from './auth.js';
import { requirePerm, puedeVerCostos } from '../lib/rbac.js';
import { audit } from '../lib/audit.js';
import { generarFolio } from '../lib/folio.js';
import { aplicarMovimiento } from './almacen.js';
import { redondearPorUnidad } from '../lib/unidades.js';
import { MAX_CANTIDAD_MOVIMIENTO, MAX_COSTO_UNITARIO } from '../config.js';

export default function register(r) {
  // -------------------------------------------------------------------------
  // Inventario con semaforo: NORMAL / BAJO / CRITICO / AGOTADO
  // -------------------------------------------------------------------------
  r.get('/api/inventario', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'inventario.leer');
    const where = [];
    const params = [];
    if (ctx.query.incluir_inactivos !== '1') where.push('activo = 1');
    if (ctx.query.semaforo) { where.push('semaforo = ?'); params.push(ctx.query.semaforo); }
    if (ctx.query.categoria_id) { where.push('categoria_id = ?'); params.push(ctx.query.categoria_id); }
    if (ctx.query.q) {
      where.push('(sku LIKE ? OR nombre LIKE ?)');
      params.push(`%${ctx.query.q}%`, `%${ctx.query.q}%`);
    }
    const filas = all(
      `SELECT * FROM v_inventario WHERE ${where.length ? where.join(' AND ') : '1=1'} ORDER BY nombre`, ...params
    );
    const resumen = {
      total_materiales: filas.length,
      valor_total: filas.reduce((s, f) => s + f.valor, 0),
      agotados: filas.filter((f) => f.semaforo === 'AGOTADO').length,
      criticos: filas.filter((f) => f.semaforo === 'CRITICO').length,
      bajos: filas.filter((f) => f.semaforo === 'BAJO').length
    };
    if (!puedeVerCostos(user)) delete resumen.valor_total;
    return {
      inventario: puedeVerCostos(user) ? filas : filas.map(({ costo, valor, ...f }) => f),
      resumen
    };
  });

  // -------------------------------------------------------------------------
  // Movimientos (trazabilidad)
  // -------------------------------------------------------------------------
  r.get('/api/movimientos', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'movimientos.leer');
    const where = [];
    const params = [];
    if (ctx.query.tipo) {
      const tipos = String(ctx.query.tipo).split(',');
      where.push(`mv.tipo IN (${tipos.map(() => '?').join(',')})`);
      params.push(...tipos);
    }
    if (ctx.query.material_id) { where.push('mv.material_id = ?'); params.push(ctx.query.material_id); }
    if (ctx.query.empresa) { where.push('mv.empresa = ?'); params.push(ctx.query.empresa); }
    if (ctx.query.trailer_id) { where.push('mv.trailer_id = ?'); params.push(ctx.query.trailer_id); }
    if (ctx.query.desde) { where.push('date(mv.created_at) >= date(?)'); params.push(ctx.query.desde); }
    if (ctx.query.hasta) { where.push('date(mv.created_at) <= date(?)'); params.push(ctx.query.hasta); }
    if (user.empresa === 'REYNA') { where.push('mv.empresa = ?'); params.push('REYNA'); }

    const limit = Math.min(Number(ctx.query.limit) || 200, 1000);
    const filas = all(
      `SELECT mv.*, m.sku, m.nombre AS material, u.codigo AS unidad,
              us.nombre AS usuario, v.folio, t.numero AS trailer, a.nombre AS area
       FROM movimientos mv
       JOIN materiales m ON m.id = mv.material_id
       JOIN unidades u ON u.id = m.unidad_id
       JOIN users us ON us.id = mv.user_id
       LEFT JOIN vales v ON v.id = mv.vale_id
       LEFT JOIN trailers t ON t.id = mv.trailer_id
       LEFT JOIN areas a ON a.id = mv.area_id
       WHERE ${where.length ? where.join(' AND ') : '1=1'}
       ORDER BY mv.created_at DESC, mv.id DESC LIMIT ?`, ...params, limit
    );
    return { movimientos: puedeVerCostos(user) ? filas : filas.map(({ precio_unitario, importe, ...f }) => f) };
  });

  // -------------------------------------------------------------------------
  // Entradas de almacen
  // -------------------------------------------------------------------------
  r.get('/api/entradas', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'inventario.leer');
    const filas = all(
      `SELECT e.*, p.nombre AS proveedor, u.nombre AS usuario,
              (SELECT COUNT(*) FROM entrada_items ei WHERE ei.entrada_id = e.id) AS num_lineas,
              (SELECT COALESCE(SUM(ei.cantidad * ei.costo), 0) FROM entrada_items ei WHERE ei.entrada_id = e.id) AS total
       FROM entradas e
       LEFT JOIN proveedores p ON p.id = e.proveedor_id
       JOIN users u ON u.id = e.user_id
       ORDER BY e.created_at DESC LIMIT 100`
    );
    return { entradas: filas };
  });

  r.get('/api/entradas/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'inventario.leer');
    const entrada = get(
      `SELECT e.*, p.nombre AS proveedor, u.nombre AS usuario FROM entradas e
       LEFT JOIN proveedores p ON p.id = e.proveedor_id JOIN users u ON u.id = e.user_id WHERE e.id = ?`,
      Number(ctx.params.id)
    );
    if (!entrada) throw notFound('Entrada no encontrada');
    const items = all(
      `SELECT ei.*, m.sku, m.nombre, un.codigo AS unidad FROM entrada_items ei
       JOIN materiales m ON m.id = ei.material_id
       LEFT JOIN unidades un ON un.id = COALESCE(ei.unidad_id, m.unidad_id)
       WHERE ei.entrada_id = ?`, entrada.id
    );
    return { entrada, items };
  });

  r.post('/api/entradas', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'inventario.entradas');
    const items = Array.isArray(ctx.body.items) ? ctx.body.items : [];
    if (!items.length) throw badRequest('Agregue al menos un material a la entrada');

    const resultado = tx(() => {
      const folio = generarFolio('entradas', 'folio_entrada_formato');
      const info = run(
        `INSERT INTO entradas (folio, proveedor_id, orden_compra, fecha, user_id, notas)
         VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?)`,
        folio, ctx.body.proveedor_id || null, ctx.body.orden_compra || null,
        ctx.body.fecha || null, user.id, ctx.body.notas || null
      );
      const entradaId = Number(info.lastInsertRowid);
      let total = 0;

      for (const it of items) {
        const mat = get('SELECT * FROM materiales WHERE id = ? AND activo = 1', Number(it.material_id));
        if (!mat) throw badRequest('Material no valido en la entrada');
        const cantidad = redondearPorUnidad(Number(it.cantidad), mat.unidad_id);
        if (!Number.isFinite(cantidad) || cantidad <= 0) throw badRequest(`Cantidad no valida para ${mat.nombre}`);
        if (cantidad > MAX_CANTIDAD_MOVIMIENTO) {
          throw badRequest(
            `La cantidad de ${mat.nombre} es demasiado alta (maximo ${MAX_CANTIDAD_MOVIMIENTO} por linea). Revise si sobra un cero.`
          );
        }
        const costo = it.costo !== undefined && it.costo !== null && it.costo !== '' ? Number(it.costo) : mat.costo;
        if (!Number.isFinite(costo) || costo < 0) {
          throw badRequest(`Costo no valido para ${mat.nombre}: no puede ser negativo ni quedar vacio`);
        }
        if (costo > MAX_COSTO_UNITARIO) {
          throw badRequest(`El costo de ${mat.nombre} es demasiado alto (maximo ${MAX_COSTO_UNITARIO} por unidad)`);
        }

        run(
          'INSERT INTO entrada_items (entrada_id, material_id, cantidad, costo, unidad_id) VALUES (?, ?, ?, ?, ?)',
          entradaId, mat.id, cantidad, costo, mat.unidad_id
        );
        aplicarMovimiento({
          tipo: 'ENTRADA', materialId: mat.id, cantidad, signo: +1, userId: user.id,
          entradaId, precio: costo, referencia: ctx.body.orden_compra || folio,
          motivo: `Entrada ${folio}`
        });
        // Si el costo de compra cambia, se registra como nuevo costo vigente (historico).
        if (costo !== mat.costo && costo > 0) {
          run('UPDATE materiales SET costo = ? WHERE id = ?', costo, mat.id);
          run('INSERT INTO material_costos (material_id, costo, user_id, motivo) VALUES (?, ?, ?, ?)',
            mat.id, costo, user.id, `Entrada ${folio}`);
        }
        total += cantidad * costo;
      }

      audit({ user, ip: ctx.ip }, {
        accion: 'ENTRADA_REGISTRADA', entidad: 'entradas', entidad_id: entradaId,
        nuevo: { folio, lineas: items.length, total }
      });
      return { id: entradaId, folio, total };
    });
    return resultado;
  });

  // -------------------------------------------------------------------------
  // Ajustes, mermas y danos (siempre con motivo y auditoria)
  // -------------------------------------------------------------------------
  r.post('/api/inventario/ajuste', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'inventario.ajustes');
    const tipo = String(ctx.body.tipo || '').toUpperCase();
    if (!['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'MERMA', 'DANO', 'CORRECCION'].includes(tipo)) {
      throw badRequest('Tipo de ajuste no valido');
    }
    const motivo = String(ctx.body.motivo || '').trim();
    if (!motivo) throw badRequest('Todo ajuste requiere un motivo');
    const materialId = Number(ctx.body.material_id);
    const mat = get('SELECT * FROM materiales WHERE id = ?', materialId);
    if (!mat) throw notFound('Material no encontrado');
    const cantidad = redondearPorUnidad(Number(ctx.body.cantidad), mat.unidad_id);
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw badRequest('Cantidad no valida');
    const signo = tipo === 'AJUSTE_POSITIVO' ? +1 : -1;
    if (signo < 0 && cantidad > mat.stock_fisico) {
      throw badRequest(`No puede descontar mas de la existencia actual (${mat.stock_fisico})`);
    }

    const res = tx(() => {
      const mov = aplicarMovimiento({
        tipo, materialId, cantidad, signo, userId: user.id,
        precio: mat.costo, motivo, referencia: ctx.body.referencia || null
      });
      audit({ user, ip: ctx.ip }, {
        accion: `INVENTARIO_${tipo}`, entidad: 'materiales', entidad_id: materialId,
        antes: { stock_fisico: mov.antes }, nuevo: { stock_fisico: mov.despues }, motivo
      });
      return mov;
    });
    return { ok: true, ...res };
  });
}
