import { all, get, run, tx } from '../db.js';
import { badRequest, notFound, forbidden, conflict } from '../lib/http.js';
import { requireUser } from './auth.js';
import { can, requirePerm, alcanceVales, puedeVerCostos } from '../lib/rbac.js';
import { generarFolio } from '../lib/folio.js';
import { audit } from '../lib/audit.js';
import { notificar, notificarRol } from '../lib/notify.js';
import { redAutorizada } from '../lib/net.js';
import { redondearPorUnidad } from '../lib/unidades.js';
import { MAX_CANTIDAD_MOVIMIENTO } from '../config.js';

const ESTADOS_ABIERTOS = ['PENDIENTE', 'APROBADO', 'APROBADO_PARCIAL', 'EN_PREPARACION', 'PREPARADO', 'ENTREGA_PARCIAL'];

function num(v, campo) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw badRequest(`Cantidad no valida en ${campo}`);
  return Math.round(n * 1000) / 1000;
}

/**
 * Tope de sensatez, el mismo que ya tienen las entradas de almacen. No es una
 * regla de negocio: existe para que un dedazo (un cero de mas) no deje el
 * comprometido y la pantalla de inventario con numeros imposibles delante del
 * cliente, sin forma de deshacerlo desde la interfaz.
 */
function topeCantidad(cantidad, nombre) {
  if (cantidad > MAX_CANTIDAD_MOVIMIENTO) {
    throw badRequest(
      `La cantidad de ${nombre} es demasiado alta (maximo ${MAX_CANTIDAD_MOVIMIENTO} por linea). Revise si sobra un cero.`
    );
  }
  return cantidad;
}

/** Cabecera de vale con todos los nombres resueltos. */
const SELECT_VALE = `
  SELECT v.*,
         t.numero AS trailer_numero, t.cliente AS trailer_cliente,
         a.nombre AS area_nombre,
         w.nombre AS trabajador_nombre, w.employee_id AS trabajador_clave,
         s.nombre AS supervisor_nombre,
         au.nombre AS autorizado_por_nombre,
         pr.nombre AS preparado_por_nombre,
         en.nombre AS entregado_por_nombre,
         mr.texto AS motivo_rechazo,
         (SELECT COUNT(*) FROM vale_items vi WHERE vi.vale_id = v.id) AS num_lineas,
         (SELECT COUNT(*) FROM vale_kits vk WHERE vk.vale_id = v.id) AS num_kits
  FROM vales v
  JOIN trailers t ON t.id = v.trailer_id
  LEFT JOIN areas a ON a.id = v.area_id
  JOIN users w ON w.id = v.trabajador_id
  LEFT JOIN users s ON s.id = v.supervisor_id
  LEFT JOIN users au ON au.id = v.autorizado_por
  LEFT JOIN users pr ON pr.id = v.preparado_por
  LEFT JOIN users en ON en.id = v.entregado_por
  LEFT JOIN motivos_rechazo mr ON mr.id = v.motivo_rechazo_id
`;

export function detalleVale(valeId, user) {
  const vale = get(`${SELECT_VALE} WHERE v.id = ?`, valeId);
  if (!vale) throw notFound('Vale no encontrado');

  // Alcance: nadie ve lo que no le corresponde.
  if (user) {
    if (user.rol === 'TRABAJADOR' && vale.trabajador_id !== user.id) throw forbidden('Solo puede consultar sus propios vales');
    if (user.rol === 'SUPERVISOR' && vale.area_id !== user.area_id && vale.trabajador_id !== user.id && vale.supervisor_id !== user.id) {
      throw forbidden('Este vale no pertenece a su area');
    }
    if (user.empresa === 'REYNA' && vale.empresa !== 'REYNA') throw forbidden('Sin acceso a este vale');
  }

  const verCostos = !user || puedeVerCostos(user);

  const items = all(
    `SELECT vi.*, u.codigo AS unidad, m.sku, m.ubicacion,
            vk.codigo_snapshot AS kit_codigo, vk.nombre_snapshot AS kit_nombre, vk.version_snapshot AS kit_version,
            inv.stock_fisico, inv.comprometido, inv.disponible, inv.semaforo
     FROM vale_items vi
     JOIN unidades u ON u.id = vi.unidad_id
     JOIN materiales m ON m.id = vi.material_id
     LEFT JOIN vale_kits vk ON vk.id = vi.vale_kit_id
     LEFT JOIN v_inventario inv ON inv.id = vi.material_id
     WHERE vi.vale_id = ? ORDER BY vi.vale_kit_id NULLS FIRST, vi.orden, vi.id`,
    valeId
  ).map((it) => {
    const linea = {
      ...it,
      pendiente: Math.max(0, (it.cantidad_autorizada || 0) - (it.cantidad_entregada || 0))
    };
    if (!verCostos) { delete linea.precio_unitario; delete linea.importe; }
    return linea;
  });

  const kits = all('SELECT * FROM vale_kits WHERE vale_id = ?', valeId);

  const entregas = all(
    `SELECT e.*, u.nombre AS almacenista, f.data_url AS firma, f.firmante, f.created_at AS firma_at
     FROM entregas e
     JOIN users u ON u.id = e.almacenista_id
     LEFT JOIN firmas f ON f.id = e.firma_id
     WHERE e.vale_id = ? ORDER BY e.created_at`, valeId
  ).map((e) => ({
    ...e,
    items: all(
      `SELECT ei.*, vi.nombre_snapshot, vi.sku_snapshot FROM entrega_items ei
       JOIN vale_items vi ON vi.id = ei.vale_item_id WHERE ei.entrega_id = ?`, e.id
    )
  }));

  const devoluciones = all(
    `SELECT d.*, u.nombre AS almacenista FROM devoluciones d
     JOIN users u ON u.id = d.almacenista_id WHERE d.vale_id = ? ORDER BY d.created_at`, valeId
  ).map((d) => ({
    ...d,
    items: all(
      `SELECT di.*, vi.nombre_snapshot, vi.sku_snapshot FROM devolucion_items di
       JOIN vale_items vi ON vi.id = di.vale_item_id WHERE di.devolucion_id = ?`, d.id
    )
  }));

  const movimientos = all(
    `SELECT mv.*, m.sku, m.nombre AS material, u.nombre AS usuario
     FROM movimientos mv JOIN materiales m ON m.id = mv.material_id
     JOIN users u ON u.id = mv.user_id
     WHERE mv.vale_id = ? ORDER BY mv.created_at`, valeId
  );

  const bitacora = all(
    `SELECT accion, user_nombre, motivo, created_at, valor_nuevo FROM auditoria
     WHERE entidad = 'vales' AND entidad_id = ? ORDER BY created_at`, String(valeId)
  );

  const totales = items.reduce((acc, it) => {
    acc.solicitado += it.cantidad_solicitada;
    acc.autorizado += it.cantidad_autorizada;
    acc.entregado += it.cantidad_entregada;
    acc.pendiente += it.pendiente;
    acc.importe += it.importe || 0;
    return acc;
  }, { solicitado: 0, autorizado: 0, entregado: 0, pendiente: 0, importe: 0 });
  if (!verCostos) delete totales.importe;

  return { vale, items, kits, entregas, devoluciones, movimientos, bitacora, totales };
}

export default function register(r) {
  // -------------------------------------------------------------------------
  // Listado con filtros y alcance por rol / empresa
  // -------------------------------------------------------------------------
  r.get('/api/vales', (ctx) => {
    const user = requireUser(ctx);
    const scope = alcanceVales(user);
    const where = [scope.sql];
    const params = [...scope.params];
    const q = ctx.query;

    if (q.estado) {
      const estados = String(q.estado).split(',');
      where.push(`v.estado IN (${estados.map(() => '?').join(',')})`);
      params.push(...estados);
    }
    if (q.abiertos === '1') {
      where.push(`v.estado IN (${ESTADOS_ABIERTOS.map(() => '?').join(',')})`);
      params.push(...ESTADOS_ABIERTOS);
    }
    if (q.trailer_id) { where.push('v.trailer_id = ?'); params.push(q.trailer_id); }
    if (q.area_id) { where.push('v.area_id = ?'); params.push(q.area_id); }
    if (q.empresa) { where.push('v.empresa = ?'); params.push(q.empresa); }
    if (q.trabajador_id) { where.push('v.trabajador_id = ?'); params.push(q.trabajador_id); }
    if (q.desde) { where.push('date(v.created_at) >= date(?)'); params.push(q.desde); }
    if (q.hasta) { where.push('date(v.created_at) <= date(?)'); params.push(q.hasta); }
    if (q.buscar) {
      where.push('(v.folio LIKE ? OR w.nombre LIKE ? OR t.numero LIKE ?)');
      const like = `%${q.buscar}%`;
      params.push(like, like, like);
    }

    const limit = Math.min(Number(q.limit) || 100, 500);
    const offset = Number(q.offset) || 0;
    const filas = all(
      `${SELECT_VALE} WHERE ${where.join(' AND ')} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
    const total = get(
      `SELECT COUNT(*) AS n FROM vales v JOIN users w ON w.id = v.trabajador_id
       JOIN trailers t ON t.id = v.trailer_id WHERE ${where.join(' AND ')}`, ...params
    ).n;

    return { vales: filas, total, limit, offset };
  });

  /** Contadores para las pestanas del trabajador y del supervisor. */
  r.get('/api/vales/resumen', (ctx) => {
    const user = requireUser(ctx);
    const scope = alcanceVales(user);
    const filas = all(
      `SELECT v.estado, COUNT(*) AS n FROM vales v WHERE ${scope.sql} GROUP BY v.estado`, ...scope.params
    );
    const porEstado = Object.fromEntries(filas.map((f) => [f.estado, f.n]));
    return {
      por_estado: porEstado,
      pendientes: porEstado.PENDIENTE || 0,
      aprobados: (porEstado.APROBADO || 0) + (porEstado.APROBADO_PARCIAL || 0),
      preparados: (porEstado.EN_PREPARACION || 0) + (porEstado.PREPARADO || 0),
      entregados: (porEstado.ENTREGADO || 0) + (porEstado.ENTREGA_PARCIAL || 0),
      rechazados: (porEstado.RECHAZADO || 0) + (porEstado.CORRECCION || 0)
    };
  });

  r.get('/api/vales/:id', (ctx) => {
    const user = requireUser(ctx);
    return detalleVale(Number(ctx.params.id), user);
  });

  // -------------------------------------------------------------------------
  // Crear vale. El trabajador solo elige TRAILER + MATERIALES / KITS.
  // Folio, trabajador, empresa, area, supervisor, fecha y hora son automaticos.
  // -------------------------------------------------------------------------
  r.post('/api/vales', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'vales.crear');

    if (user.rol === 'TRABAJADOR' && !redAutorizada(ctx.ip)) {
      throw forbidden('Este dispositivo esta fuera de la red autorizada de la planta. No se puede crear el vale.');
    }

    const trailerId = Number(ctx.body.trailer_id);
    const trailer = get('SELECT * FROM trailers WHERE id = ? AND activo = 1', trailerId);
    if (!trailer) throw badRequest('Debe seleccionar un numero de trailer valido');
    if (['TERMINADO', 'CERRADO'].includes(trailer.estado)) {
      throw badRequest(`El trailer ${trailer.numero} esta ${trailer.estado.toLowerCase()} y no admite nuevos vales`);
    }

    const sueltos = Array.isArray(ctx.body.items) ? ctx.body.items : [];
    const kits = Array.isArray(ctx.body.kits) ? ctx.body.kits : [];
    if (!sueltos.length && !kits.length) throw badRequest('Agregue al menos un material o un kit al vale');

    // El supervisor asignado; si el trabajador no tiene uno, el de su area.
    let supervisorId = user.supervisor_id;
    if (!supervisorId) {
      const sup = get(
        `SELECT id FROM users WHERE rol = 'SUPERVISOR' AND activo = 1 AND empresa = ? AND area_id IS ?
         ORDER BY id LIMIT 1`, user.empresa, user.area_id
      );
      supervisorId = sup ? sup.id : null;
    }
    // Un supervisor que crea su propio vale lo autoriza su propia figura de area.
    if (user.rol === 'SUPERVISOR') supervisorId = user.supervisor_id || user.id;

    const resultado = tx(() => {
      const folio = generarFolio('vales', 'folio_formato');
      const info = run(
        `INSERT INTO vales (folio, trabajador_id, empresa, area_id, supervisor_id, trailer_id, estado, prioridad, notas)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?)`,
        folio, user.id, user.empresa, user.area_id, supervisorId, trailerId,
        ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'].includes(ctx.body.prioridad) ? ctx.body.prioridad : 'NORMAL',
        ctx.body.notas ? String(ctx.body.notas).slice(0, 500) : null
      );
      const valeId = Number(info.lastInsertRowid);
      let orden = 0;

      const insertItem = (materialId, cantidad, estandar, valeKitId) => {
        const mat = get('SELECT * FROM materiales WHERE id = ? AND activo = 1', materialId);
        if (!mat) throw badRequest(`Material no disponible en el catalogo (id ${materialId})`);
        // La cantidad se ajusta a los decimales que admite la unidad del material.
        cantidad = redondearPorUnidad(cantidad, mat.unidad_id);
        if (cantidad <= 0) throw badRequest(`La cantidad de ${mat.nombre} debe ser mayor a cero`);
        topeCantidad(cantidad, mat.nombre);
        run(
          `INSERT INTO vale_items
             (vale_id, material_id, vale_kit_id, sku_snapshot, nombre_snapshot, unidad_id,
              cantidad_estandar, cantidad_solicitada, orden)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          valeId, mat.id, valeKitId, mat.sku, mat.nombre, mat.unidad_id, estandar, cantidad, orden++
        );
      };

      // Materiales sueltos
      for (const it of sueltos) insertItem(Number(it.material_id), num(it.cantidad, 'material'), null, null);

      // Kits: se COPIA el contenido de la version vigente al vale.
      // Las cantidades pueden modificarse SOLO para este vale; el kit maestro no cambia.
      for (const k of kits) {
        let version = k.kit_version_id
          ? get('SELECT * FROM kit_versiones WHERE id = ?', Number(k.kit_version_id))
          : get(`SELECT * FROM kit_versiones WHERE kit_id = ? AND estado = 'VIGENTE' ORDER BY version DESC LIMIT 1`, Number(k.kit_id));
        if (!version) throw badRequest('El kit seleccionado no tiene una version vigente');
        const kit = get('SELECT * FROM kits WHERE id = ? AND activo = 1', version.kit_id);
        if (!kit) throw badRequest('Kit no disponible');

        const vk = run(
          `INSERT INTO vale_kits (vale_id, kit_id, kit_version_id, codigo_snapshot, nombre_snapshot, version_snapshot)
           VALUES (?, ?, ?, ?, ?, ?)`,
          valeId, kit.id, version.id, kit.codigo, kit.nombre, version.version
        );
        const valeKitId = Number(vk.lastInsertRowid);

        const base = all('SELECT * FROM kit_items WHERE kit_version_id = ? ORDER BY orden, id', version.id);
        if (!base.length) throw badRequest(`El kit ${kit.nombre} no tiene materiales configurados`);
        const ajustes = new Map((k.items || []).map((i) => [Number(i.material_id), i]));

        for (const ki of base) {
          const ajuste = ajustes.get(ki.material_id);
          if (ajuste && Number(ajuste.cantidad) === 0) continue; // el trabajador retiro esa linea
          const cantidad = ajuste ? num(ajuste.cantidad, 'kit') : ki.cantidad_estandar;
          insertItem(ki.material_id, cantidad, ki.cantidad_estandar, valeKitId);
        }
      }

      audit({ user, ip: ctx.ip }, {
        accion: 'VALE_CREADO', entidad: 'vales', entidad_id: valeId,
        nuevo: { folio, trailer: trailer.numero, lineas: orden }
      });

      // Notificacion inmediata al supervisor correspondiente.
      if (supervisorId && supervisorId !== user.id) {
        notificar(supervisorId, {
          tipo: 'VALE_PENDIENTE',
          titulo: 'Nueva solicitud pendiente',
          cuerpo: `${user.nombre} creo el vale ${folio}. Trailer: ${trailer.numero}`,
          vale_id: valeId
        });
      }
      return { id: valeId, folio };
    });

    return { ...resultado, ...detalleVale(resultado.id, user) };
  });

  // -------------------------------------------------------------------------
  // Autorizacion del supervisor
  // El supervisor NUNCA modifica la cantidad solicitada, solo la autorizada.
  // -------------------------------------------------------------------------
  r.post('/api/vales/:id/autorizar', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'vales.autorizar');

    const valeId = Number(ctx.params.id);
    const vale = get('SELECT * FROM vales WHERE id = ?', valeId);
    if (!vale) throw notFound('Vale no encontrado');
    if (vale.estado !== 'PENDIENTE') throw conflict(`El vale ya fue procesado (estado actual: ${vale.estado})`);
    if (user.rol !== 'ADMIN') {
      if (vale.area_id !== user.area_id && vale.supervisor_id !== user.id) {
        throw forbidden('Este vale no pertenece a su area');
      }
      if (user.empresa === 'REYNA' && vale.empresa !== 'REYNA') throw forbidden('Sin acceso a este vale');
    }

    const decision = String(ctx.body.decision || '').toUpperCase();
    if (!['APROBAR', 'PARCIAL', 'RECHAZAR', 'CORRECCION'].includes(decision)) {
      throw badRequest('Decision no valida');
    }

    const items = all('SELECT * FROM vale_items WHERE vale_id = ?', valeId);

    const resultado = tx(() => {
      if (decision === 'RECHAZAR' || decision === 'CORRECCION') {
        const motivoId = ctx.body.motivo_id ? Number(ctx.body.motivo_id) : null;
        const motivo = motivoId ? get('SELECT * FROM motivos_rechazo WHERE id = ? AND activo = 1', motivoId) : null;
        if (!motivo) throw badRequest('Seleccione un motivo');
        const comentario = String(ctx.body.comentario || '').trim();
        if (motivo.requiere_comentario && !comentario) throw badRequest('Este motivo requiere un comentario');

        run(
          `UPDATE vales SET estado = ?, motivo_rechazo_id = ?, comentario_rechazo = ?,
                  autorizado_por = ?, autorizado_at = datetime('now') WHERE id = ?`,
          decision === 'RECHAZAR' ? 'RECHAZADO' : 'CORRECCION', motivoId, comentario || null, user.id, valeId
        );
        run(`UPDATE vale_items SET estado_linea = 'RECHAZADA' WHERE vale_id = ?`, valeId);

        audit({ user, ip: ctx.ip }, {
          accion: decision === 'RECHAZAR' ? 'VALE_RECHAZADO' : 'VALE_CORRECCION',
          entidad: 'vales', entidad_id: valeId,
          antes: { estado: 'PENDIENTE' },
          nuevo: { estado: decision === 'RECHAZAR' ? 'RECHAZADO' : 'CORRECCION' },
          motivo: motivo.texto + (comentario ? ` - ${comentario}` : '')
        });
        notificar(vale.trabajador_id, {
          tipo: 'VALE_RECHAZADO',
          titulo: decision === 'RECHAZAR' ? `Vale ${vale.folio} rechazado` : `Vale ${vale.folio} requiere correccion`,
          cuerpo: motivo.texto + (comentario ? ` - ${comentario}` : ''),
          vale_id: valeId
        });
        return { estado: decision === 'RECHAZAR' ? 'RECHAZADO' : 'CORRECCION' };
      }

      // Aprobacion total o parcial por linea.
      const ajustes = new Map((ctx.body.lineas || []).map((l) => [Number(l.id), l]));
      let autorizadasTotales = 0, hayRecorte = 0;

      for (const it of items) {
        const ajuste = ajustes.get(it.id);
        let autorizada = ajuste != null && ajuste.cantidad_autorizada != null
          ? redondearPorUnidad(num(ajuste.cantidad_autorizada, it.nombre_snapshot), it.unidad_id)
          : it.cantidad_solicitada;
        if (autorizada > it.cantidad_solicitada) {
          throw badRequest(`No puede autorizar mas de lo solicitado en ${it.nombre_snapshot}`);
        }
        // Tambien aqui, no solo al crear: un vale hecho antes de este tope
        // sigue en la base y el supervisor no deberia poder autorizarlo entero.
        topeCantidad(autorizada, it.nombre_snapshot);
        if (autorizada < it.cantidad_solicitada) hayRecorte = 1;
        if (autorizada > 0) autorizadasTotales += 1;
        run(
          `UPDATE vale_items SET cantidad_autorizada = ?, estado_linea = ?, motivo_linea = ? WHERE id = ?`,
          autorizada, autorizada > 0 ? 'AUTORIZADA' : 'RECHAZADA',
          ajuste && ajuste.motivo ? String(ajuste.motivo).slice(0, 250) : null, it.id
        );
      }

      if (autorizadasTotales === 0) throw badRequest('No autorizo ninguna linea. Use RECHAZAR si esa es su decision.');

      const estado = hayRecorte ? 'APROBADO_PARCIAL' : 'APROBADO';
      run(
        `UPDATE vales SET estado = ?, autorizado_por = ?, autorizado_at = datetime('now') WHERE id = ?`,
        estado, user.id, valeId
      );

      audit({ user, ip: ctx.ip }, {
        accion: 'VALE_AUTORIZADO', entidad: 'vales', entidad_id: valeId,
        antes: { estado: 'PENDIENTE' }, nuevo: { estado, lineas_autorizadas: autorizadasTotales },
        motivo: ctx.body.comentario || null
      });

      // El almacen recibe el vale en su cola de preparacion.
      notificarRol('ALMACEN', {
        tipo: 'VALE_PARA_PREPARAR',
        titulo: 'Nuevo vale para preparar',
        cuerpo: `Vale ${vale.folio} autorizado por ${user.nombre}`,
        vale_id: valeId
      });
      notificar(vale.trabajador_id, {
        tipo: 'VALE_APROBADO',
        titulo: `Vale ${vale.folio} ${estado === 'APROBADO' ? 'aprobado' : 'aprobado parcialmente'}`,
        cuerpo: `Autorizado por ${user.nombre}. El almacen lo esta preparando.`,
        vale_id: valeId
      });
      return { estado };
    });

    return { ...resultado, ...detalleVale(valeId, user) };
  });

  /** Cancelar un vale propio que aun no ha sido autorizado. */
  r.post('/api/vales/:id/cancelar', (ctx) => {
    const user = requireUser(ctx);
    const valeId = Number(ctx.params.id);
    const vale = get('SELECT * FROM vales WHERE id = ?', valeId);
    if (!vale) throw notFound('Vale no encontrado');
    const propio = vale.trabajador_id === user.id;
    if (!propio && !can(user, 'vales.cerrar') && user.rol !== 'ADMIN') throw forbidden('No puede cancelar este vale');
    if (vale.estado !== 'PENDIENTE') throw conflict('Solo puede cancelarse un vale pendiente de autorizacion');
    const motivo = String(ctx.body.motivo || '').trim();
    if (!motivo) throw badRequest('Indique el motivo de la cancelacion');

    run(`UPDATE vales SET estado = 'CANCELADO', cerrado_por = ?, cerrado_at = datetime('now'), motivo_cierre = ? WHERE id = ?`,
      user.id, motivo, valeId);
    audit(ctx, { accion: 'VALE_CANCELADO', entidad: 'vales', entidad_id: valeId, antes: { estado: vale.estado }, nuevo: { estado: 'CANCELADO' }, motivo });
    return { ok: true };
  });

  r.get('/api/motivos-rechazo', (ctx) => {
    requireUser(ctx);
    return { motivos: all('SELECT * FROM motivos_rechazo WHERE activo = 1 ORDER BY orden, id') };
  });
}
