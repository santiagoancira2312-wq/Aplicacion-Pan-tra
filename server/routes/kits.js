import { all, get, run, tx } from '../db.js';
import { badRequest, notFound, conflict } from '../lib/http.js';
import { requireUser } from './auth.js';
import { requirePerm, puedeVerCostos } from '../lib/rbac.js';
import { audit } from '../lib/audit.js';
import { redondearPorUnidad } from '../lib/unidades.js';
import { sentenciaActualizacion } from '../lib/sql.js';

function itemsDeVersion(versionId, verCostos) {
  const filas = all(
    `SELECT ki.*, m.sku, m.nombre, m.costo, m.stock_fisico, u.codigo AS unidad,
            inv.disponible, inv.semaforo
     FROM kit_items ki
     JOIN materiales m ON m.id = ki.material_id
     JOIN unidades u ON u.id = ki.unidad_id
     LEFT JOIN v_inventario inv ON inv.id = ki.material_id
     WHERE ki.kit_version_id = ? ORDER BY ki.orden, ki.id`, versionId
  );
  return filas.map((f) => {
    const item = { ...f, costo_linea: f.cantidad_estandar * f.costo };
    if (!verCostos) { delete item.costo; delete item.costo_linea; }
    return item;
  });
}

export default function register(r) {
  // -------------------------------------------------------------------------
  // Kits vigentes para el trabajador y el supervisor
  // -------------------------------------------------------------------------
  r.get('/api/kits', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'kits.leer');
    const incluirInactivos = ctx.query.incluir_inactivos === '1';
    const filas = all(
      `SELECT k.*, a.nombre AS area_nombre,
              kv.id AS version_id, kv.version, kv.created_at AS version_at,
              (SELECT COUNT(*) FROM kit_items ki WHERE ki.kit_version_id = kv.id) AS num_materiales,
              (SELECT COALESCE(SUM(ki.cantidad_estandar * m.costo), 0) FROM kit_items ki
                 JOIN materiales m ON m.id = ki.material_id WHERE ki.kit_version_id = kv.id) AS costo_estandar
       FROM kits k
       LEFT JOIN areas a ON a.id = k.area_id
       LEFT JOIN kit_versiones kv ON kv.kit_id = k.id AND kv.estado = 'VIGENTE'
       ${incluirInactivos ? '' : 'WHERE k.activo = 1'}
       ORDER BY k.nombre`
    );
    const verCostos = puedeVerCostos(user);
    return {
      kits: filas.map((k) => (verCostos ? k : (({ costo_estandar, ...resto }) => resto)(k)))
    };
  });

  r.get('/api/kits/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'kits.leer');
    const kit = get(
      `SELECT k.*, a.nombre AS area_nombre FROM kits k LEFT JOIN areas a ON a.id = k.area_id WHERE k.id = ?`,
      Number(ctx.params.id)
    );
    if (!kit) throw notFound('Kit no encontrado');
    const versiones = all('SELECT * FROM kit_versiones WHERE kit_id = ? ORDER BY version DESC', kit.id);
    const vigente = versiones.find((v) => v.estado === 'VIGENTE') || versiones[0];
    const verCostos = puedeVerCostos(user);
    return {
      kit,
      versiones: versiones.map((v) => ({
        ...v,
        usos: get('SELECT COUNT(*) AS n FROM vale_kits WHERE kit_version_id = ?', v.id).n
      })),
      version_vigente: vigente || null,
      items: vigente ? itemsDeVersion(vigente.id, verCostos) : []
    };
  });

  /** Contenido de una version concreta (los vales antiguos conservan la suya). */
  r.get('/api/kits/version/:versionId', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'kits.leer');
    const version = get(
      `SELECT kv.*, k.codigo, k.nombre AS kit_nombre FROM kit_versiones kv
       JOIN kits k ON k.id = kv.kit_id WHERE kv.id = ?`, Number(ctx.params.versionId)
    );
    if (!version) throw notFound('Version de kit no encontrada');
    return { version, items: itemsDeVersion(version.id, puedeVerCostos(user)) };
  });

  // -------------------------------------------------------------------------
  // Alta de kit (Administrador). Crea la version 1.
  // -------------------------------------------------------------------------
  r.post('/api/kits', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'kits.escribir');
    const b = ctx.body;
    if (!b.codigo || !b.nombre) throw badRequest('Codigo y nombre del kit son obligatorios');
    if (get('SELECT 1 AS x FROM kits WHERE codigo = ?', String(b.codigo))) throw conflict('Ya existe un kit con ese codigo');
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) throw badRequest('El kit debe incluir al menos un material');

    const id = tx(() => {
      const info = run(
        'INSERT INTO kits (codigo, nombre, area_id, descripcion) VALUES (?, ?, ?, ?)',
        String(b.codigo).trim().toUpperCase(), String(b.nombre).trim(), b.area_id || null, b.descripcion || null
      );
      const kitId = Number(info.lastInsertRowid);
      const vInfo = run(
        `INSERT INTO kit_versiones (kit_id, version, estado, notas, created_by) VALUES (?, 1, 'VIGENTE', ?, ?)`,
        kitId, b.notas || 'Version inicial', user.id
      );
      insertarItems(Number(vInfo.lastInsertRowid), items);
      audit({ user, ip: ctx.ip }, {
        accion: 'KIT_CREADO', entidad: 'kits', entidad_id: kitId,
        nuevo: { codigo: b.codigo, nombre: b.nombre, materiales: items.length }
      });
      return kitId;
    });
    return { id };
  });

  r.put('/api/kits/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'kits.escribir');
    const kit = get('SELECT * FROM kits WHERE id = ?', Number(ctx.params.id));
    if (!kit) throw notFound('Kit no encontrado');
    const b = ctx.body;
    const { sql, valores } = sentenciaActualizacion('kits', ['nombre', 'area_id', 'descripcion', 'activo'], b);
    run(sql, ...valores, kit.id);
    audit({ user, ip: ctx.ip }, {
      accion: 'KIT_ACTUALIZADO', entidad: 'kits', entidad_id: kit.id,
      antes: { nombre: kit.nombre, area_id: kit.area_id, activo: kit.activo }, nuevo: b, motivo: b.motivo || null
    });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Nueva version del kit. Los vales historicos conservan su version original.
  // -------------------------------------------------------------------------
  r.post('/api/kits/:id/versiones', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'kits.escribir');
    const kit = get('SELECT * FROM kits WHERE id = ?', Number(ctx.params.id));
    if (!kit) throw notFound('Kit no encontrado');
    const items = Array.isArray(ctx.body.items) ? ctx.body.items : [];
    if (!items.length) throw badRequest('La nueva version debe incluir al menos un material');

    const resultado = tx(() => {
      const ultima = get('SELECT MAX(version) AS v FROM kit_versiones WHERE kit_id = ?', kit.id);
      const nueva = (ultima && ultima.v ? ultima.v : 0) + 1;
      run(`UPDATE kit_versiones SET estado = 'HISTORICA' WHERE kit_id = ? AND estado = 'VIGENTE'`, kit.id);
      const info = run(
        `INSERT INTO kit_versiones (kit_id, version, estado, notas, created_by) VALUES (?, ?, 'VIGENTE', ?, ?)`,
        kit.id, nueva, ctx.body.notas || null, user.id
      );
      const versionId = Number(info.lastInsertRowid);
      insertarItems(versionId, items);
      audit({ user, ip: ctx.ip }, {
        accion: 'KIT_NUEVA_VERSION', entidad: 'kits', entidad_id: kit.id,
        nuevo: { version: nueva, materiales: items.length }, motivo: ctx.body.notas || null
      });
      return { version_id: versionId, version: nueva };
    });
    return resultado;
  });

  function insertarItems(versionId, items) {
    let orden = 0;
    for (const it of items) {
      const mat = get('SELECT * FROM materiales WHERE id = ? AND activo = 1', Number(it.material_id));
      if (!mat) throw badRequest(`Material no valido en el kit (id ${it.material_id})`);
      const cantidad = redondearPorUnidad(Number(it.cantidad_estandar), mat.unidad_id);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw badRequest(`Cantidad estandar no valida para ${mat.nombre}`);
      }
      run(
        `INSERT INTO kit_items (kit_version_id, material_id, cantidad_estandar, unidad_id, notas, orden)
         VALUES (?, ?, ?, ?, ?, ?)`,
        versionId, mat.id, cantidad, mat.unidad_id, it.notas || null, orden++
      );
    }
  }
}
