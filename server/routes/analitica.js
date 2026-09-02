import { all, get, setting } from '../db.js';
import { requireUser } from './auth.js';
import { can, requirePerm, puedeVerCostos } from '../lib/rbac.js';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

export default function register(r) {
  // -------------------------------------------------------------------------
  // ANALITICA POR KIT: consumo real contra el estandar del kit maestro.
  // -------------------------------------------------------------------------
  r.get('/api/analitica/kits', (ctx) => {
    const user = requireUser(ctx);
    if (!can(user, 'analitica.leer') && !can(user, 'analitica.area')) requirePerm(user, 'analitica.leer');

    const where = [];
    const params = [];
    if (ctx.query.desde) { where.push('date(v.created_at) >= date(?)'); params.push(ctx.query.desde); }
    if (ctx.query.hasta) { where.push('date(v.created_at) <= date(?)'); params.push(ctx.query.hasta); }
    if (ctx.query.trailer_id) { where.push('v.trailer_id = ?'); params.push(ctx.query.trailer_id); }
    if (ctx.query.area_id) { where.push('v.area_id = ?'); params.push(ctx.query.area_id); }
    if (user.rol === 'SUPERVISOR') { where.push('v.area_id = ?'); params.push(user.area_id); }
    if (user.empresa === 'REYNA') { where.push("v.empresa = 'REYNA'"); }
    const filtro = where.length ? 'AND ' + where.join(' AND ') : '';

    const kits = all(
      `SELECT vk.kit_id, vk.codigo_snapshot AS codigo, vk.nombre_snapshot AS nombre,
              vk.version_snapshot AS version,
              COUNT(DISTINCT vk.id) AS usos,
              SUM(vi.cantidad_estandar) AS estandar,
              SUM(vi.cantidad_solicitada) AS solicitado,
              SUM(vi.cantidad_autorizada) AS autorizado,
              SUM(vi.cantidad_entregada) AS entregado,
              SUM(COALESCE(vi.cantidad_estandar, 0) * COALESCE(vi.precio_unitario, 0)) AS costo_estandar,
              SUM(vi.importe) AS costo_real
       FROM vale_kits vk
       JOIN vales v ON v.id = vk.vale_id
       JOIN vale_items vi ON vi.vale_kit_id = vk.id
       WHERE 1=1 ${filtro}
       GROUP BY vk.kit_id, vk.version_snapshot
       ORDER BY nombre, version`, ...params
    );

    const detalle = all(
      `SELECT vk.kit_id, vk.nombre_snapshot AS kit, vi.sku_snapshot AS sku, vi.nombre_snapshot AS material,
              SUM(vi.cantidad_estandar) AS estandar,
              SUM(vi.cantidad_solicitada) AS solicitado,
              SUM(vi.cantidad_autorizada) AS autorizado,
              SUM(vi.cantidad_entregada) AS entregado,
              COUNT(*) AS lineas
       FROM vale_kits vk
       JOIN vales v ON v.id = vk.vale_id
       JOIN vale_items vi ON vi.vale_kit_id = vk.id
       WHERE 1=1 ${filtro}
       GROUP BY vk.kit_id, vi.material_id
       ORDER BY kit, ABS(SUM(vi.cantidad_entregada) - SUM(vi.cantidad_estandar)) DESC`, ...params
    );

    // Quien no tiene permiso de costos no recibe importes, ni escondidos en el
    // JSON: el supervisor entra aqui con analitica.area y no ve costos.
    const verCostos = puedeVerCostos(user);
    return {
      kits: kits.map((k) => {
        const { costo_estandar, costo_real, ...resto } = k;
        const fila = {
          ...resto,
          variacion_cantidad: round2((k.entregado || 0) - (k.estandar || 0)),
          variacion_pct: k.estandar ? round2((((k.entregado || 0) - k.estandar) / k.estandar) * 100) : 0
        };
        if (verCostos) {
          fila.costo_estandar = costo_estandar;
          fila.costo_real = costo_real;
          fila.variacion_costo = round2((costo_real || 0) - (costo_estandar || 0));
        }
        return fila;
      }),
      detalle: detalle.map((d) => ({
        ...d,
        variacion: round2((d.entregado || 0) - (d.estandar || 0)),
        variacion_pct: d.estandar ? round2((((d.entregado || 0) - d.estandar) / d.estandar) * 100) : 0
      }))
    };
  });

  // -------------------------------------------------------------------------
  // PREDICCION con metodos sencillos: promedio, media movil y tendencia.
  // -------------------------------------------------------------------------
  r.get('/api/analitica/prediccion', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'inventario.leer');
    const corto = Number(setting('dias_prediccion_corto', '7'));
    const largo = Number(setting('dias_prediccion_largo', '30'));

    const filas = all(
      `SELECT inv.id, inv.sku, inv.nombre, inv.unidad, inv.stock_fisico, inv.disponible,
              inv.stock_min, inv.stock_max, inv.punto_reorden, inv.costo, inv.semaforo,
              COALESCE(p.lead_time_dias, 7) AS lead_time,
              COALESCE((SELECT SUM(mv.cantidad) FROM movimientos mv
                        WHERE mv.material_id = inv.id AND mv.tipo = 'SALIDA'
                          AND mv.created_at >= datetime('now','-90 days')), 0) AS consumo_90,
              COALESCE((SELECT SUM(mv.cantidad) FROM movimientos mv
                        WHERE mv.material_id = inv.id AND mv.tipo = 'SALIDA'
                          AND mv.created_at >= datetime('now','-30 days')), 0) AS consumo_30,
              COALESCE((SELECT SUM(mv.cantidad) FROM movimientos mv
                        WHERE mv.material_id = inv.id AND mv.tipo = 'SALIDA'
                          AND mv.created_at >= datetime('now','-7 days')), 0) AS consumo_7
       FROM v_inventario inv
       LEFT JOIN proveedores p ON p.id = inv.proveedor_id
       WHERE inv.activo = 1`
    );

    const prediccion = filas.map((f) => {
      // Media movil ponderada: la demanda reciente pesa mas que la historica.
      const diario90 = f.consumo_90 / 90;
      const diario30 = f.consumo_30 / 30;
      const diario7 = f.consumo_7 / 7;
      const diario = round2((diario7 * 0.5) + (diario30 * 0.3) + (diario90 * 0.2));
      const tendencia = diario30 > 0 ? round2(((diario7 - diario30) / diario30) * 100) : 0;

      const dias = diario > 0 ? Math.floor(f.stock_fisico / diario) : null;
      const fechaAgotamiento = dias != null && dias < 365
        ? new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10) : null;

      const esperadoCorto = round2(diario * corto);
      const esperadoLargo = round2(diario * largo);
      // Cantidad sugerida: cubrir el lead time mas el periodo largo, hasta el maximo.
      const objetivo = Math.max(f.stock_max || 0, diario * (largo + f.lead_time));
      const sugerido = Math.max(0, Math.ceil(objetivo - f.stock_fisico));

      return {
        id: f.id, sku: f.sku, nombre: f.nombre, unidad: f.unidad, semaforo: f.semaforo,
        stock_fisico: f.stock_fisico, disponible: f.disponible, punto_reorden: f.punto_reorden,
        lead_time: f.lead_time, consumo_diario: diario, tendencia_pct: tendencia,
        dias_inventario: dias, fecha_agotamiento: fechaAgotamiento,
        consumo_esperado_corto: esperadoCorto, consumo_esperado_largo: esperadoLargo,
        cantidad_sugerida: diario > 0 || f.stock_fisico < f.punto_reorden ? sugerido : 0,
        requiere_compra: f.stock_fisico <= f.punto_reorden || (dias != null && dias <= f.lead_time)
      };
    }).sort((a, b) => {
      const da = a.dias_inventario == null ? 9999 : a.dias_inventario;
      const dbb = b.dias_inventario == null ? 9999 : b.dias_inventario;
      return da - dbb;
    });

    return {
      prediccion,
      parametros: { dias_corto: corto, dias_largo: largo },
      por_comprar: prediccion.filter((p) => p.requiere_compra).length
    };
  });

  // -------------------------------------------------------------------------
  // DETECCION DE ANOMALIAS.
  // Nunca acusa a nadie: solo senala patrones que requieren revision.
  // -------------------------------------------------------------------------
  r.get('/api/analitica/anomalias', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'analitica.leer');
    const factor = Number(setting('anomalia_factor', '2.5'));
    const anomalias = [];
    const MENSAJE = 'Patron de consumo fuera del comportamiento habitual. Requiere revision.';

    // 1) Materiales con consumo reciente muy por encima de su historico.
    for (const m of all(
      `SELECT m.id, m.sku, m.nombre, un.codigo AS unidad,
              COALESCE(SUM(CASE WHEN mv.created_at >= datetime('now','-7 days') THEN mv.cantidad ELSE 0 END), 0) AS reciente,
              COALESCE(SUM(CASE WHEN mv.created_at < datetime('now','-7 days')
                                 AND mv.created_at >= datetime('now','-91 days') THEN mv.cantidad ELSE 0 END), 0) AS historico
       FROM materiales m JOIN unidades un ON un.id = m.unidad_id
       LEFT JOIN movimientos mv ON mv.material_id = m.id AND mv.tipo = 'SALIDA'
       GROUP BY m.id HAVING reciente > 0`
    )) {
      const promedioSemanal = m.historico / 12;
      if (promedioSemanal > 0 && m.reciente > promedioSemanal * factor) {
        anomalias.push({
          tipo: 'CONSUMO_ELEVADO', severidad: m.reciente > promedioSemanal * factor * 2 ? 'ALTA' : 'MEDIA',
          titulo: `${m.nombre} (${m.sku})`,
          detalle: `Consumo de 7 dias: ${round2(m.reciente)} ${m.unidad}. Promedio semanal historico: ${round2(promedioSemanal)} ${m.unidad}.`,
          mensaje: MENSAJE, material_id: m.id
        });
      }
    }

    // 2) Trabajadores con muchos rechazos.
    for (const w of all(
      `SELECT w.id, w.nombre, COUNT(*) AS total,
              SUM(CASE WHEN v.estado IN ('RECHAZADO','CORRECCION') THEN 1 ELSE 0 END) AS rechazados
       FROM vales v JOIN users w ON w.id = v.trabajador_id
       WHERE v.created_at >= datetime('now','-60 days')
       GROUP BY w.id HAVING total >= 5 AND rechazados * 100.0 / total >= 35`
    )) {
      anomalias.push({
        tipo: 'RECHAZOS_FRECUENTES', severidad: 'MEDIA',
        titulo: w.nombre,
        detalle: `${w.rechazados} de ${w.total} vales rechazados o devueltos a correccion en 60 dias.`,
        mensaje: 'Puede indicar necesidad de capacitacion o de revisar el catalogo. Requiere revision.',
        user_id: w.id
      });
    }

    // 3) Solicitudes muy frecuentes del mismo material para el mismo trailer.
    for (const s of all(
      `SELECT vi.nombre_snapshot AS material, t.numero AS trailer, COUNT(*) AS veces,
              SUM(vi.cantidad_solicitada) AS cantidad
       FROM vale_items vi JOIN vales v ON v.id = vi.vale_id JOIN trailers t ON t.id = v.trailer_id
       WHERE v.created_at >= datetime('now','-30 days')
       GROUP BY vi.material_id, v.trailer_id HAVING veces >= 6`
    )) {
      anomalias.push({
        tipo: 'SOLICITUDES_FRECUENTES', severidad: 'BAJA',
        titulo: `${s.material} - Trailer ${s.trailer}`,
        detalle: `${s.veces} solicitudes en 30 dias (total ${round2(s.cantidad)}).`,
        mensaje: MENSAJE
      });
    }

    // 4) Material solicitado fuera del area habitual.
    for (const a of all(
      `SELECT vi.nombre_snapshot AS material, ar.nombre AS area, COUNT(*) AS veces
       FROM vale_items vi
       JOIN vales v ON v.id = vi.vale_id
       LEFT JOIN areas ar ON ar.id = v.area_id
       JOIN kit_items ki ON ki.material_id = vi.material_id
       JOIN kit_versiones kv ON kv.id = ki.kit_version_id
       JOIN kits k ON k.id = kv.kit_id
       WHERE v.created_at >= datetime('now','-60 days') AND k.area_id IS NOT NULL
         AND v.area_id IS NOT NULL AND k.area_id <> v.area_id
       GROUP BY vi.material_id, v.area_id HAVING veces >= 4`
    )) {
      anomalias.push({
        tipo: 'USO_FUERA_DE_AREA', severidad: 'BAJA',
        titulo: `${a.material} en ${a.area}`,
        detalle: `${a.veces} solicitudes de un material asociado a otra area.`,
        mensaje: 'Puede ser normal. Requiere revision.'
      });
    }

    // 5) Kits con desviaciones frecuentes respecto de su estandar.
    for (const k of all(
      `SELECT vk.nombre_snapshot AS kit, COUNT(*) AS lineas,
              SUM(CASE WHEN vi.cantidad_solicitada > vi.cantidad_estandar * 1.25 THEN 1 ELSE 0 END) AS desviadas
       FROM vale_kits vk
       JOIN vale_items vi ON vi.vale_kit_id = vk.id
       JOIN vales v ON v.id = vk.vale_id
       WHERE vi.cantidad_estandar > 0 AND v.created_at >= datetime('now','-90 days')
       GROUP BY vk.kit_id HAVING lineas >= 10 AND desviadas * 100.0 / lineas >= 40`
    )) {
      anomalias.push({
        tipo: 'KIT_DESVIADO', severidad: 'MEDIA',
        titulo: k.kit,
        detalle: `${k.desviadas} de ${k.lineas} lineas se solicitan por encima del estandar.`,
        mensaje: 'El estandar del kit podria estar desactualizado. Requiere revision.'
      });
    }

    const orden = { ALTA: 0, MEDIA: 1, BAJA: 2 };
    anomalias.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
    return { anomalias, total: anomalias.length, aviso: 'Estos indicadores no implican responsabilidad de ninguna persona.' };
  });

  /** Consumo del departamento, para el supervisor de area. */
  r.get('/api/analitica/area', (ctx) => {
    const user = requireUser(ctx);
    if (!can(user, 'analitica.leer') && !can(user, 'analitica.area')) requirePerm(user, 'analitica.leer');
    const areaId = ctx.query.area_id && can(user, 'analitica.leer') ? Number(ctx.query.area_id) : user.area_id;
    if (!areaId) return { area_id: null, consumo: [], vales: {} };

    // Un usuario de la empresa externa solo cuenta el consumo de su empresa:
    // antes sumaba las dos y el total del area salia al doble.
    const empresa = user.empresa === 'REYNA' ? ['REYNA'] : [];
    const porEmpresa = (columna) => (empresa.length ? `AND ${columna} = ?` : '');

    return {
      area_id: areaId,
      area: (get('SELECT nombre FROM areas WHERE id = ?', areaId) || {}).nombre,
      consumo: all(
        `SELECT m.sku, m.nombre, SUM(mv.cantidad) AS cantidad, un.codigo AS unidad,
                COUNT(DISTINCT mv.vale_id) AS vales
         FROM movimientos mv JOIN materiales m ON m.id = mv.material_id
         JOIN unidades un ON un.id = m.unidad_id
         WHERE mv.area_id = ? AND mv.tipo = 'SALIDA' AND mv.created_at >= datetime('now','-90 days')
           ${porEmpresa('mv.empresa')}
         GROUP BY m.id ORDER BY cantidad DESC LIMIT 25`, areaId, ...empresa
      ),
      vales: get(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE estado = 'PENDIENTE') AS pendientes,
                COUNT(*) FILTER (WHERE estado = 'ENTREGADO') AS entregados,
                COUNT(*) FILTER (WHERE estado = 'RECHAZADO') AS rechazados
         FROM vales WHERE area_id = ? ${porEmpresa('empresa')}`, areaId, ...empresa
      )
    };
  });
}
