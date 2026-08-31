import { all, get, run, tx } from '../db.js';
import { badRequest, notFound, conflict } from '../lib/http.js';
import { requireUser } from './auth.js';
import { requirePerm, puedeVerCostos, can } from '../lib/rbac.js';
import { audit, diff } from '../lib/audit.js';

const CAMPOS_MATERIAL = [
  'sku', 'nombre', 'descripcion', 'categoria_id', 'subcategoria_id', 'unidad_id',
  'stock_min', 'stock_max', 'punto_reorden', 'costo', 'ubicacion', 'proveedor_id', 'foto', 'activo'
];

function limpiarCostos(filas, user) {
  if (puedeVerCostos(user)) return filas;
  return filas.map((f) => {
    const { costo, valor, ...resto } = f;
    return resto;
  });
}

export default function register(r) {
  // -------------------------------------------------------------------------
  // Busqueda de materiales por SKU, nombre oficial o ALIAS.
  // El vale siempre guarda SKU + NOMBRE OFICIAL.
  // -------------------------------------------------------------------------
  r.get('/api/materiales', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.leer');

    const q = String(ctx.query.q || '').trim();
    const where = [];
    const params = [];
    if (ctx.query.incluir_inactivos !== '1') where.push('inv.activo = 1');
    if (ctx.query.categoria_id) { where.push('inv.categoria_id = ?'); params.push(ctx.query.categoria_id); }
    if (ctx.query.semaforo) { where.push('inv.semaforo = ?'); params.push(ctx.query.semaforo); }
    if (q) {
      where.push(`(inv.sku LIKE ? OR inv.nombre LIKE ? OR EXISTS
        (SELECT 1 FROM material_alias a WHERE a.material_id = inv.id AND a.alias LIKE ?))`);
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const limit = Math.min(Number(ctx.query.limit) || 100, 500);

    const filas = all(
      `SELECT inv.* FROM v_inventario inv
       WHERE ${where.length ? where.join(' AND ') : '1=1'}
       ORDER BY inv.nombre LIMIT ?`, ...params, limit
    );

    // Los alias se devuelven para que la interfaz explique por que aparecio el resultado.
    const conAlias = filas.map((f) => ({
      ...f,
      alias: all('SELECT alias FROM material_alias WHERE material_id = ?', f.id).map((a) => a.alias)
    }));

    return { materiales: limpiarCostos(conAlias, user), total: conAlias.length };
  });

  r.get('/api/materiales/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.leer');
    const mat = get('SELECT * FROM v_inventario WHERE id = ?', Number(ctx.params.id));
    if (!mat) throw notFound('Material no encontrado');
    const alias = all('SELECT * FROM material_alias WHERE material_id = ?', mat.id);
    const movimientos = can(user, 'movimientos.leer')
      ? all(
        `SELECT mv.*, u.nombre AS usuario, v.folio FROM movimientos mv
         JOIN users u ON u.id = mv.user_id LEFT JOIN vales v ON v.id = mv.vale_id
         WHERE mv.material_id = ? ORDER BY mv.created_at DESC LIMIT 50`, mat.id)
      : [];
    const costos = puedeVerCostos(user)
      ? all('SELECT * FROM material_costos WHERE material_id = ? ORDER BY vigente_desde DESC LIMIT 20', mat.id)
      : [];
    return { material: limpiarCostos([mat], user)[0], alias, movimientos, historial_costos: costos };
  });

  r.post('/api/materiales', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.escribir');
    const b = ctx.body;
    if (!b.sku || !b.nombre || !b.unidad_id) throw badRequest('SKU, nombre y unidad son obligatorios');
    if (get('SELECT 1 AS x FROM materiales WHERE sku = ?', String(b.sku))) throw conflict('Ya existe un material con ese SKU');

    const id = tx(() => {
      const info = run(
        `INSERT INTO materiales
           (sku, nombre, descripcion, categoria_id, subcategoria_id, unidad_id, stock_fisico,
            stock_min, stock_max, punto_reorden, costo, ubicacion, proveedor_id, foto)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        String(b.sku).trim(), String(b.nombre).trim(), b.descripcion || null,
        b.categoria_id || null, b.subcategoria_id || null, Number(b.unidad_id),
        Number(b.stock_min) || 0, Number(b.stock_max) || 0, Number(b.punto_reorden) || 0,
        Number(b.costo) || 0, b.ubicacion || null, b.proveedor_id || null, b.foto || null
      );
      const matId = Number(info.lastInsertRowid);
      if (Number(b.costo) > 0) {
        run('INSERT INTO material_costos (material_id, costo, user_id, motivo) VALUES (?, ?, ?, ?)',
          matId, Number(b.costo), user.id, 'Alta de material');
      }
      for (const alias of (b.alias || [])) {
        run('INSERT OR IGNORE INTO material_alias (material_id, alias) VALUES (?, ?)', matId, String(alias).trim());
      }
      audit({ user, ip: ctx.ip }, { accion: 'MATERIAL_CREADO', entidad: 'materiales', entidad_id: matId, nuevo: b });
      return matId;
    });
    return { id, material: get('SELECT * FROM v_inventario WHERE id = ?', id) };
  });

  r.put('/api/materiales/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.escribir');
    const id = Number(ctx.params.id);
    const antes = get('SELECT * FROM materiales WHERE id = ?', id);
    if (!antes) throw notFound('Material no encontrado');

    const b = ctx.body;
    const cambios = diff(antes, b, CAMPOS_MATERIAL);

    tx(() => {
      run(
        `UPDATE materiales SET
           nombre = COALESCE(?, nombre), descripcion = ?, categoria_id = ?, subcategoria_id = ?,
           unidad_id = COALESCE(?, unidad_id), stock_min = COALESCE(?, stock_min),
           stock_max = COALESCE(?, stock_max), punto_reorden = COALESCE(?, punto_reorden),
           ubicacion = ?, proveedor_id = ?, foto = ?,
           activo = COALESCE(?, activo), updated_at = datetime('now')
         WHERE id = ?`,
        b.nombre ?? null, b.descripcion ?? null, b.categoria_id ?? null, b.subcategoria_id ?? null,
        b.unidad_id ?? null, b.stock_min ?? null, b.stock_max ?? null, b.punto_reorden ?? null,
        b.ubicacion ?? null, b.proveedor_id ?? null, b.foto ?? null,
        b.activo === undefined ? null : (b.activo ? 1 : 0), id
      );

      // El costo se versiona: el precio ya usado en entregas no cambia retroactivamente.
      if (b.costo !== undefined && Number(b.costo) !== antes.costo) {
        run('UPDATE materiales SET costo = ? WHERE id = ?', Number(b.costo), id);
        run('INSERT INTO material_costos (material_id, costo, user_id, motivo) VALUES (?, ?, ?, ?)',
          id, Number(b.costo), user.id, b.motivo || 'Actualizacion de costo');
      }

      if (Array.isArray(b.alias)) {
        run('DELETE FROM material_alias WHERE material_id = ?', id);
        for (const alias of b.alias) {
          const t = String(alias).trim();
          if (t) run('INSERT OR IGNORE INTO material_alias (material_id, alias) VALUES (?, ?)', id, t);
        }
      }

      audit({ user, ip: ctx.ip }, {
        accion: 'MATERIAL_ACTUALIZADO', entidad: 'materiales', entidad_id: id,
        antes: cambios ? cambios.antes : null, nuevo: cambios ? cambios.nuevo : null, motivo: b.motivo || null
      });
    });
    return { material: get('SELECT * FROM v_inventario WHERE id = ?', id) };
  });

  // -------------------------------------------------------------------------
  // Catalogos auxiliares
  // -------------------------------------------------------------------------
  r.get('/api/catalogos', (ctx) => {
    const user = requireUser(ctx);
    return {
      unidades: all('SELECT * FROM unidades WHERE activo = 1 ORDER BY codigo'),
      categorias: all('SELECT * FROM categorias WHERE activo = 1 ORDER BY nombre'),
      proveedores: can(user, 'catalogo.leer') ? all('SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre') : [],
      areas: all('SELECT * FROM areas WHERE activo = 1 ORDER BY nombre'),
      trailers: all(`SELECT * FROM trailers WHERE activo = 1 AND estado IN ('PLANEADO','EN_PROCESO') ORDER BY numero`),
      motivos_rechazo: all('SELECT * FROM motivos_rechazo WHERE activo = 1 ORDER BY orden, id')
    };
  });

  for (const [ruta, tabla, campos] of [
    ['unidades', 'unidades', ['codigo', 'nombre', 'decimales', 'activo']],
    ['categorias', 'categorias', ['nombre', 'parent_id', 'activo']],
    ['proveedores', 'proveedores', ['nombre', 'contacto', 'telefono', 'email', 'lead_time_dias', 'activo']],
    ['areas', 'areas', ['codigo', 'nombre', 'descripcion', 'activo']]
  ]) {
    r.get(`/api/${ruta}`, (ctx) => {
      requireUser(ctx);
      return { [ruta]: all(`SELECT * FROM ${tabla} ORDER BY id`) };
    });

    r.post(`/api/${ruta}`, (ctx) => {
      const user = requireUser(ctx);
      requirePerm(user, 'catalogo.escribir');
      const cols = campos.filter((c) => ctx.body[c] !== undefined);
      if (!cols.length) throw badRequest('Sin datos');
      const info = run(
        `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        ...cols.map((c) => ctx.body[c])
      );
      audit({ user, ip: ctx.ip }, { accion: 'CATALOGO_CREADO', entidad: tabla, entidad_id: info.lastInsertRowid, nuevo: ctx.body });
      return { id: Number(info.lastInsertRowid) };
    });

    r.put(`/api/${ruta}/:id`, (ctx) => {
      const user = requireUser(ctx);
      requirePerm(user, 'catalogo.escribir');
      const antes = get(`SELECT * FROM ${tabla} WHERE id = ?`, Number(ctx.params.id));
      if (!antes) throw notFound('Registro no encontrado');
      const cols = campos.filter((c) => ctx.body[c] !== undefined);
      if (!cols.length) throw badRequest('Sin cambios');
      run(
        `UPDATE ${tabla} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        ...cols.map((c) => ctx.body[c]), Number(ctx.params.id)
      );
      const cambios = diff(antes, ctx.body, campos);
      audit({ user, ip: ctx.ip }, {
        accion: 'CATALOGO_ACTUALIZADO', entidad: tabla, entidad_id: ctx.params.id,
        antes: cambios ? cambios.antes : null, nuevo: cambios ? cambios.nuevo : null
      });
      return { ok: true };
    });
  }

  // -------------------------------------------------------------------------
  // Trailers
  // -------------------------------------------------------------------------
  r.get('/api/trailers', (ctx) => {
    const user = requireUser(ctx);
    const filas = all(
      `SELECT t.*,
              (SELECT COUNT(*) FROM vales v WHERE v.trailer_id = t.id) AS num_vales,
              (SELECT COALESCE(SUM(mv.importe), 0) FROM movimientos mv
                 WHERE mv.trailer_id = t.id AND mv.tipo = 'SALIDA') AS consumo,
              (SELECT COALESCE(SUM(mv.importe), 0) FROM movimientos mv
                 WHERE mv.trailer_id = t.id AND mv.tipo = 'DEVOLUCION') AS devuelto
       FROM trailers t ORDER BY t.numero`
    );
    const conCosto = filas.map((t) => ({ ...t, costo_total: (t.consumo || 0) - (t.devuelto || 0) }));
    return { trailers: puedeVerCostos(user) ? conCosto : conCosto.map(({ consumo, devuelto, costo_total, ...t }) => t) };
  });

  r.post('/api/trailers', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.escribir');
    const b = ctx.body;
    if (!b.numero) throw badRequest('El numero de trailer es obligatorio');
    if (get('SELECT 1 AS x FROM trailers WHERE numero = ?', String(b.numero))) throw conflict('Ese trailer ya existe');
    const info = run(
      `INSERT INTO trailers (numero, modelo, tamano, cliente, tipo_config, fecha_inicio, fecha_fin, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      String(b.numero).trim(), b.modelo || null, b.tamano || null, b.cliente || null,
      b.tipo_config || null, b.fecha_inicio || null, b.fecha_fin || null, b.estado || 'PLANEADO'
    );
    audit({ user, ip: ctx.ip }, { accion: 'TRAILER_CREADO', entidad: 'trailers', entidad_id: info.lastInsertRowid, nuevo: b });
    return { id: Number(info.lastInsertRowid) };
  });

  r.put('/api/trailers/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.escribir');
    const id = Number(ctx.params.id);
    const antes = get('SELECT * FROM trailers WHERE id = ?', id);
    if (!antes) throw notFound('Trailer no encontrado');
    const b = ctx.body;
    run(
      `UPDATE trailers SET numero = COALESCE(?, numero), modelo = ?, tamano = ?, cliente = ?,
              tipo_config = ?, fecha_inicio = ?, fecha_fin = ?, estado = COALESCE(?, estado),
              activo = COALESCE(?, activo)
       WHERE id = ?`,
      b.numero ?? null, b.modelo ?? null, b.tamano ?? null, b.cliente ?? null, b.tipo_config ?? null,
      b.fecha_inicio ?? null, b.fecha_fin ?? null, b.estado ?? null,
      b.activo === undefined ? null : (b.activo ? 1 : 0), id
    );
    const cambios = diff(antes, b, ['numero', 'modelo', 'tamano', 'cliente', 'tipo_config', 'fecha_inicio', 'fecha_fin', 'estado', 'activo']);
    audit({ user, ip: ctx.ip }, {
      accion: 'TRAILER_ACTUALIZADO', entidad: 'trailers', entidad_id: id,
      antes: cambios ? cambios.antes : null, nuevo: cambios ? cambios.nuevo : null, motivo: b.motivo || null
    });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Buscador global: folio, SKU, material, trabajador, trailer, area
  // -------------------------------------------------------------------------
  r.get('/api/buscar', (ctx) => {
    const user = requireUser(ctx);
    const q = String(ctx.query.q || '').trim();
    if (q.length < 2) return { resultados: [] };
    const like = `%${q}%`;
    const res = [];

    for (const v of all(
      `SELECT v.id, v.folio, v.estado, v.created_at, t.numero FROM vales v
       JOIN trailers t ON t.id = v.trailer_id
       WHERE (v.folio LIKE ?) ${user.rol === 'TRABAJADOR' ? 'AND v.trabajador_id = ?' : ''}
       ORDER BY v.created_at DESC LIMIT 8`,
      like, ...(user.rol === 'TRABAJADOR' ? [user.id] : [])
    )) res.push({ tipo: 'VALE', id: v.id, titulo: v.folio, detalle: `Trailer ${v.numero} - ${v.estado}`, ruta: `/vales/${v.id}` });

    for (const m of all(
      `SELECT id, sku, nombre FROM materiales
       WHERE activo = 1 AND (sku LIKE ? OR nombre LIKE ?
         OR EXISTS (SELECT 1 FROM material_alias a WHERE a.material_id = materiales.id AND a.alias LIKE ?))
       LIMIT 8`, like, like, like
    )) res.push({ tipo: 'MATERIAL', id: m.id, titulo: m.nombre, detalle: m.sku, ruta: `/inventario/${m.id}` });

    for (const t of all('SELECT id, numero, cliente FROM trailers WHERE numero LIKE ? LIMIT 5', like)) {
      res.push({ tipo: 'TRAILER', id: t.id, titulo: `Trailer ${t.numero}`, detalle: t.cliente || '', ruta: `/trailers/${t.id}` });
    }

    if (can(user, 'usuarios.leer') || can(user, 'vales.todos') || user.rol === 'SUPERVISOR') {
      for (const u of all(
        'SELECT id, nombre, employee_id, rol, empresa FROM users WHERE activo = 1 AND (nombre LIKE ? OR employee_id LIKE ?) LIMIT 6',
        like, like
      )) res.push({ tipo: 'PERSONA', id: u.id, titulo: u.nombre, detalle: `${u.employee_id} - ${u.rol} (${u.empresa})`, ruta: `/usuarios/${u.id}` });
    }

    return { resultados: res };
  });
}
