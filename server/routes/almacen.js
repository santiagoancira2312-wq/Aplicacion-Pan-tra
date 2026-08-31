import crypto from 'node:crypto';
import { all, get, run, tx } from '../db.js';
import { badRequest, notFound, forbidden, conflict } from '../lib/http.js';
import { requireUser } from './auth.js';
import { requirePerm } from '../lib/rbac.js';
import { audit } from '../lib/audit.js';
import { notificar } from '../lib/notify.js';
import { detalleVale } from './vales.js';
import { redondearPorUnidad } from '../lib/unidades.js';

const round = (n) => Math.round(n * 1000) / 1000;

/** Registra un movimiento y actualiza el stock fisico en la misma transaccion. */
export function aplicarMovimiento({
  tipo, materialId, cantidad, signo, userId, valeId = null, valeItemId = null,
  entregaId = null, entradaId = null, empresa = null, trailerId = null, areaId = null,
  precio = 0, motivo = null, referencia = null
}) {
  const mat = get('SELECT id, stock_fisico FROM materiales WHERE id = ?', materialId);
  if (!mat) throw badRequest('Material no encontrado');
  const antes = mat.stock_fisico;
  const despues = round(antes + signo * cantidad);
  run('UPDATE materiales SET stock_fisico = ?, updated_at = datetime(\'now\') WHERE id = ?', despues, materialId);
  run(
    `INSERT INTO movimientos
       (tipo, material_id, cantidad, signo, stock_antes, stock_despues, vale_id, vale_item_id,
        entrega_id, entrada_id, empresa, trailer_id, area_id, precio_unitario, importe, motivo, referencia, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tipo, materialId, cantidad, signo, antes, despues, valeId, valeItemId,
    entregaId, entradaId, empresa, trailerId, areaId, precio, round(cantidad * precio),
    motivo, referencia, userId
  );
  return { antes, despues };
}

/** Recalcula el estado del vale a partir de lo realmente entregado. */
function recalcularEstadoVale(valeId) {
  const items = all('SELECT * FROM vale_items WHERE vale_id = ?', valeId);
  const conAutorizacion = items.filter((i) => i.cantidad_autorizada > 0);
  const completas = conAutorizacion.length > 0
    && conAutorizacion.every((i) => i.cantidad_entregada >= i.cantidad_autorizada);
  const algunaEntrega = items.some((i) => i.cantidad_entregada > 0);

  for (const it of items) {
    if (it.cantidad_autorizada <= 0) continue;
    const estado = it.cantidad_entregada >= it.cantidad_autorizada ? 'ENTREGADA'
      : it.cantidad_entregada > 0 ? 'PARCIAL' : 'AUTORIZADA';
    run('UPDATE vale_items SET estado_linea = ? WHERE id = ?', estado, it.id);
  }

  const estado = completas ? 'ENTREGADO' : algunaEntrega ? 'ENTREGA_PARCIAL' : 'PREPARADO';
  if (completas) {
    run(`UPDATE vales SET estado = 'ENTREGADO', entregado_at = datetime('now') WHERE id = ?`, valeId);
  } else {
    run(`UPDATE vales SET estado = ? WHERE id = ?`, estado, valeId);
  }
  return estado;
}

export default function register(r) {
  // -------------------------------------------------------------------------
  // Cola del almacen, estilo preparacion de pedidos
  // -------------------------------------------------------------------------
  r.get('/api/almacen/cola', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'vales.preparar');

    const filas = all(
      `SELECT v.id, v.folio, v.estado, v.prioridad, v.created_at, v.autorizado_at, v.empresa,
              t.numero AS trailer_numero, a.nombre AS area_nombre,
              w.nombre AS trabajador_nombre,
              (SELECT COUNT(*) FROM vale_items vi WHERE vi.vale_id = v.id AND vi.cantidad_autorizada > 0) AS num_lineas,
              (SELECT COUNT(*) FROM vale_items vi WHERE vi.vale_id = v.id
                 AND vi.cantidad_autorizada > vi.cantidad_entregada) AS lineas_pendientes,
              (SELECT COUNT(*) FROM vale_items vi
                 JOIN v_inventario inv ON inv.id = vi.material_id
                 WHERE vi.vale_id = v.id AND vi.cantidad_autorizada - vi.cantidad_entregada > inv.stock_fisico) AS lineas_sin_stock
       FROM vales v
       JOIN trailers t ON t.id = v.trailer_id
       LEFT JOIN areas a ON a.id = v.area_id
       JOIN users w ON w.id = v.trabajador_id
       WHERE v.estado IN ('APROBADO','APROBADO_PARCIAL','EN_PREPARACION','PREPARADO','ENTREGA_PARCIAL')
       ORDER BY CASE v.prioridad WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
                v.autorizado_at`
    );

    const completados = all(
      `SELECT v.id, v.folio, v.estado, v.entregado_at, t.numero AS trailer_numero, w.nombre AS trabajador_nombre
       FROM vales v JOIN trailers t ON t.id = v.trailer_id JOIN users w ON w.id = v.trabajador_id
       WHERE v.estado IN ('ENTREGADO','CERRADO') ORDER BY v.entregado_at DESC LIMIT 30`
    );

    return {
      nuevos: filas.filter((f) => ['APROBADO', 'APROBADO_PARCIAL'].includes(f.estado)),
      en_preparacion: filas.filter((f) => f.estado === 'EN_PREPARACION'),
      preparados: filas.filter((f) => f.estado === 'PREPARADO'),
      entrega_parcial: filas.filter((f) => f.estado === 'ENTREGA_PARCIAL'),
      completados
    };
  });

  /** Lista de surtido: que tomar y de que ubicacion. */
  r.get('/api/almacen/vales/:id/preparacion', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'vales.preparar');
    const valeId = Number(ctx.params.id);
    const detalle = detalleVale(valeId, null);
    const lineas = detalle.items
      .filter((i) => i.cantidad_autorizada > 0)
      .map((i) => ({
        ...i,
        por_surtir: Math.max(0, i.cantidad_autorizada - i.cantidad_entregada),
        alcanza: i.stock_fisico >= Math.max(0, i.cantidad_autorizada - i.cantidad_entregada)
      }))
      .sort((a, b) => String(a.ubicacion || '').localeCompare(String(b.ubicacion || '')));
    return { vale: detalle.vale, lineas, kits: detalle.kits };
  });

  r.post('/api/almacen/vales/:id/estado', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'vales.preparar');
    const valeId = Number(ctx.params.id);
    const vale = get('SELECT * FROM vales WHERE id = ?', valeId);
    if (!vale) throw notFound('Vale no encontrado');

    const nuevo = String(ctx.body.estado || '').toUpperCase();
    const permitidos = {
      EN_PREPARACION: ['APROBADO', 'APROBADO_PARCIAL'],
      PREPARADO: ['APROBADO', 'APROBADO_PARCIAL', 'EN_PREPARACION']
    };
    if (!permitidos[nuevo]) throw badRequest('Estado no valido para el almacen');
    if (!permitidos[nuevo].includes(vale.estado)) {
      throw conflict(`No se puede pasar de ${vale.estado} a ${nuevo}`);
    }

    const campo = nuevo === 'EN_PREPARACION' ? 'preparacion_at' : 'preparado_at';
    run(`UPDATE vales SET estado = ?, ${campo} = datetime('now'), preparado_por = ? WHERE id = ?`, nuevo, user.id, valeId);
    audit(ctx, { accion: `VALE_${nuevo}`, entidad: 'vales', entidad_id: valeId, antes: { estado: vale.estado }, nuevo: { estado: nuevo } });

    if (nuevo === 'PREPARADO') {
      notificar(vale.trabajador_id, {
        tipo: 'VALE_PREPARADO', titulo: `Vale ${vale.folio} preparado`,
        cuerpo: 'Su material esta listo para recoger en el almacen.', vale_id: valeId
      });
    }
    return { estado: nuevo };
  });

  // -------------------------------------------------------------------------
  // ENTREGA FISICA: unico momento en que disminuye el inventario.
  // Admite entrega parcial y exige firma digital del receptor.
  // -------------------------------------------------------------------------
  r.post('/api/almacen/vales/:id/entregar', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'vales.entregar');

    const valeId = Number(ctx.params.id);
    const vale = get('SELECT * FROM vales WHERE id = ?', valeId);
    if (!vale) throw notFound('Vale no encontrado');
    if (!['APROBADO', 'APROBADO_PARCIAL', 'EN_PREPARACION', 'PREPARADO', 'ENTREGA_PARCIAL'].includes(vale.estado)) {
      throw conflict(`El vale no esta en condiciones de entrega (estado: ${vale.estado})`);
    }

    const firma = String(ctx.body.firma || '');
    if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(firma) || firma.length < 500) {
      throw badRequest('Se requiere la firma del receptor para registrar la entrega');
    }
    const receptorNombre = String(ctx.body.receptor_nombre || '').trim();
    if (!receptorNombre) throw badRequest('Indique quien recibe el material');

    const lineas = Array.isArray(ctx.body.lineas) ? ctx.body.lineas : [];
    if (!lineas.length) throw badRequest('Indique las cantidades entregadas');

    const resultado = tx(() => {
      // Nunca se reutiliza una firma anterior.
      const hash = crypto.createHash('sha256').update(firma).digest('hex');
      if (get('SELECT 1 AS x FROM firmas WHERE hash = ?', hash)) {
        throw conflict('Esa firma ya fue registrada anteriormente. Solicite una firma nueva.');
      }

      const items = new Map(all('SELECT * FROM vale_items WHERE vale_id = ?', valeId).map((i) => [i.id, i]));
      const aEntregar = [];

      for (const l of lineas) {
        const it = items.get(Number(l.vale_item_id));
        if (!it) throw badRequest('Linea de vale no valida');
        const cantidad = redondearPorUnidad(Number(l.cantidad), it.unidad_id);
        if (!Number.isFinite(cantidad) || cantidad < 0) throw badRequest(`Cantidad no valida en ${it.nombre_snapshot}`);
        if (cantidad === 0) continue;

        const pendiente = round(it.cantidad_autorizada - it.cantidad_entregada);
        if (cantidad > pendiente) {
          throw badRequest(`No puede entregar mas de lo autorizado en ${it.nombre_snapshot} (pendiente: ${pendiente})`);
        }
        const mat = get('SELECT stock_fisico, costo FROM materiales WHERE id = ?', it.material_id);
        if (cantidad > mat.stock_fisico) {
          throw conflict(`Stock fisico insuficiente de ${it.nombre_snapshot}. Existencia: ${mat.stock_fisico}`);
        }
        aEntregar.push({ it, cantidad, precio: mat.costo });
      }

      if (!aEntregar.length) throw badRequest('No se indico ninguna cantidad a entregar');

      const totalAutorizado = [...items.values()].reduce((s, i) => s + i.cantidad_autorizada, 0);
      const totalEntregado = [...items.values()].reduce((s, i) => s + i.cantidad_entregada, 0)
        + aEntregar.reduce((s, x) => s + x.cantidad, 0);
      const tipo = totalEntregado >= totalAutorizado ? 'TOTAL' : 'PARCIAL';

      const firmaInfo = run(
        `INSERT INTO firmas (vale_id, firmante, firmante_id, almacenista_id, data_url, hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        valeId, receptorNombre, vale.trabajador_id, user.id, firma, hash
      );
      const firmaId = Number(firmaInfo.lastInsertRowid);

      const entregaInfo = run(
        `INSERT INTO entregas (vale_id, almacenista_id, receptor_id, receptor_nombre, tipo, firma_id, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        valeId, user.id, vale.trabajador_id, receptorNombre, tipo, firmaId,
        ctx.body.notas ? String(ctx.body.notas).slice(0, 500) : null
      );
      const entregaId = Number(entregaInfo.lastInsertRowid);
      run('UPDATE firmas SET entrega_id = ? WHERE id = ?', entregaId, firmaId);

      for (const { it, cantidad, precio } of aEntregar) {
        // Precio historico: se congela el costo vigente al momento de la entrega.
        run(
          `UPDATE vale_items
             SET cantidad_entregada = ?, precio_unitario = COALESCE(precio_unitario, ?),
                 importe = importe + ?
           WHERE id = ?`,
          round(it.cantidad_entregada + cantidad), precio, round(cantidad * precio), it.id
        );
        run(
          'INSERT INTO entrega_items (entrega_id, vale_item_id, cantidad, precio_unitario, importe) VALUES (?, ?, ?, ?, ?)',
          entregaId, it.id, cantidad, precio, round(cantidad * precio)
        );
        aplicarMovimiento({
          tipo: 'SALIDA', materialId: it.material_id, cantidad, signo: -1, userId: user.id,
          valeId, valeItemId: it.id, entregaId, empresa: vale.empresa, trailerId: vale.trailer_id,
          areaId: vale.area_id, precio, referencia: vale.folio,
          motivo: `Entrega de vale ${vale.folio}`
        });
      }

      run('UPDATE vales SET entregado_por = ? WHERE id = ?', user.id, valeId);
      const estado = recalcularEstadoVale(valeId);

      audit({ user, ip: ctx.ip }, {
        accion: 'ENTREGA_REGISTRADA', entidad: 'vales', entidad_id: valeId,
        nuevo: { entrega_id: entregaId, tipo, lineas: aEntregar.length, estado },
        motivo: `Recibio: ${receptorNombre}`
      });
      notificar(vale.trabajador_id, {
        tipo: 'VALE_ENTREGADO',
        titulo: `Vale ${vale.folio}: ${tipo === 'TOTAL' ? 'entrega completa' : 'entrega parcial'}`,
        cuerpo: `Registrada por ${user.nombre}.`, vale_id: valeId
      });

      return { entrega_id: entregaId, tipo, estado };
    });

    return { ...resultado, ...detalleVale(valeId, user) };
  });

  // -------------------------------------------------------------------------
  // Devoluciones: solo son validas cuando el ALMACEN las confirma.
  // -------------------------------------------------------------------------
  r.post('/api/almacen/vales/:id/devolucion', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'inventario.devoluciones');

    const valeId = Number(ctx.params.id);
    const vale = get('SELECT * FROM vales WHERE id = ?', valeId);
    if (!vale) throw notFound('Vale no encontrado');

    const motivo = String(ctx.body.motivo || '').trim();
    if (!motivo) throw badRequest('Indique el motivo de la devolucion');
    const lineas = Array.isArray(ctx.body.lineas) ? ctx.body.lineas : [];
    if (!lineas.length) throw badRequest('Indique el material devuelto');

    const resultado = tx(() => {
      const devInfo = run(
        'INSERT INTO devoluciones (vale_id, almacenista_id, motivo, notas) VALUES (?, ?, ?, ?)',
        valeId, user.id, motivo, ctx.body.notas ? String(ctx.body.notas).slice(0, 500) : null
      );
      const devolucionId = Number(devInfo.lastInsertRowid);
      let n = 0;

      for (const l of lineas) {
        const it = get('SELECT * FROM vale_items WHERE id = ? AND vale_id = ?', Number(l.vale_item_id), valeId);
        if (!it) throw badRequest('Linea de vale no valida');
        const cantidad = redondearPorUnidad(Number(l.cantidad), it.unidad_id);
        if (!(cantidad > 0)) continue;

        const yaDevuelto = get(
          'SELECT COALESCE(SUM(cantidad), 0) AS n FROM devolucion_items WHERE vale_item_id = ?', it.id
        ).n;
        if (cantidad > round(it.cantidad_entregada - yaDevuelto)) {
          throw badRequest(`No puede devolver mas de lo entregado en ${it.nombre_snapshot}`);
        }

        const precio = it.precio_unitario || 0;
        run(
          `INSERT INTO devolucion_items (devolucion_id, vale_item_id, material_id, cantidad, precio_unitario, importe)
           VALUES (?, ?, ?, ?, ?, ?)`,
          devolucionId, it.id, it.material_id, cantidad, precio, round(cantidad * precio)
        );
        // El importe del vale se reduce: lo devuelto no se cobra.
        run('UPDATE vale_items SET importe = MAX(importe - ?, 0) WHERE id = ?', round(cantidad * precio), it.id);
        aplicarMovimiento({
          tipo: 'DEVOLUCION', materialId: it.material_id, cantidad, signo: +1, userId: user.id,
          valeId, valeItemId: it.id, empresa: vale.empresa, trailerId: vale.trailer_id,
          areaId: vale.area_id, precio, motivo, referencia: vale.folio
        });
        n += 1;
      }

      if (!n) throw badRequest('No se registro ninguna cantidad devuelta');
      audit({ user, ip: ctx.ip }, {
        accion: 'DEVOLUCION_REGISTRADA', entidad: 'vales', entidad_id: valeId,
        nuevo: { devolucion_id: devolucionId, lineas: n }, motivo
      });
      return { devolucion_id: devolucionId, lineas: n };
    });

    return { ...resultado, ...detalleVale(valeId, user) };
  });

  /** Cerrar lo pendiente de un vale cuando ya no sera necesario. */
  r.post('/api/almacen/vales/:id/cerrar-pendiente', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'vales.cerrar');
    const valeId = Number(ctx.params.id);
    const vale = get('SELECT * FROM vales WHERE id = ?', valeId);
    if (!vale) throw notFound('Vale no encontrado');
    if (!['ENTREGA_PARCIAL', 'PREPARADO', 'APROBADO', 'APROBADO_PARCIAL', 'EN_PREPARACION'].includes(vale.estado)) {
      throw conflict('El vale no tiene pendientes por cerrar');
    }
    const motivo = String(ctx.body.motivo || '').trim();
    if (!motivo) throw badRequest('Indique el motivo del cierre');

    tx(() => {
      run(
        `UPDATE vale_items SET estado_linea = 'CERRADA', motivo_linea = ?
         WHERE vale_id = ? AND cantidad_autorizada > cantidad_entregada`, motivo, valeId
      );
      run(
        `UPDATE vales SET estado = 'CERRADO', cerrado_por = ?, cerrado_at = datetime('now'), motivo_cierre = ?
         WHERE id = ?`, user.id, motivo, valeId
      );
      audit({ user, ip: ctx.ip }, {
        accion: 'VALE_CERRADO', entidad: 'vales', entidad_id: valeId,
        antes: { estado: vale.estado }, nuevo: { estado: 'CERRADO' }, motivo
      });
    });
    notificar(vale.trabajador_id, {
      tipo: 'VALE_CERRADO', titulo: `Vale ${vale.folio} cerrado`,
      cuerpo: motivo, vale_id: valeId
    });
    return detalleVale(valeId, user);
  });
}
