import { all, get } from '../db.js';
import { requireUser } from './auth.js';
import { can, puedeVerCostos } from '../lib/rbac.js';

const salidasNetas = `SUM(CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END)`;
const FILTRO_CONSUMO = `mv.tipo IN ('SALIDA','DEVOLUCION')`;

export default function register(r) {
  // -------------------------------------------------------------------------
  // Dashboard ejecutivo: se actualiza conforme se registran los movimientos.
  // -------------------------------------------------------------------------
  r.get('/api/dashboard', (ctx) => {
    const user = requireUser(ctx);
    const verCostos = puedeVerCostos(user);
    const hoy = new Date().toISOString().slice(0, 10);
    const mes = hoy.slice(0, 7);

    const inv = get(
      `SELECT COUNT(*) AS materiales,
              COALESCE(SUM(stock_fisico * costo), 0) AS valor,
              SUM(CASE WHEN semaforo = 'AGOTADO' THEN 1 ELSE 0 END) AS agotados,
              SUM(CASE WHEN semaforo = 'CRITICO' THEN 1 ELSE 0 END) AS criticos,
              SUM(CASE WHEN semaforo IN ('BAJO','CRITICO','AGOTADO') THEN 1 ELSE 0 END) AS bajo_minimo
       FROM v_inventario WHERE activo = 1`
    );

    const consumo = get(
      `SELECT
         COALESCE(${salidasNetas} FILTER (WHERE date(mv.created_at) = date('now')), 0) AS hoy,
         COALESCE(${salidasNetas} FILTER (WHERE date(mv.created_at) >= date('now','-6 days')), 0) AS semana,
         COALESCE(${salidasNetas} FILTER (WHERE strftime('%Y-%m', mv.created_at) = ?), 0) AS mes,
         COALESCE(${salidasNetas} FILTER (WHERE mv.empresa = 'INTERNA'), 0) AS interno,
         COALESCE(${salidasNetas} FILTER (WHERE mv.empresa = 'REYNA'), 0) AS reyna
       FROM movimientos mv WHERE ${FILTRO_CONSUMO}`, mes
    );

    const vales = get(
      `SELECT
         COUNT(*) FILTER (WHERE date(created_at) = date('now')) AS hoy,
         COUNT(*) FILTER (WHERE estado = 'PENDIENTE') AS pendientes,
         COUNT(*) FILTER (WHERE estado IN ('APROBADO','APROBADO_PARCIAL')) AS aprobados,
         COUNT(*) FILTER (WHERE estado IN ('EN_PREPARACION','PREPARADO')) AS en_almacen,
         COUNT(*) FILTER (WHERE estado = 'ENTREGADO') AS entregados,
         COUNT(*) FILTER (WHERE estado = 'ENTREGA_PARCIAL') AS entregas_parciales,
         COUNT(*) FILTER (WHERE estado = 'RECHAZADO') AS rechazados,
         COUNT(*) AS total
       FROM vales`
    );

    const reynaPorCobrar = get(
      `SELECT COALESCE(${salidasNetas}, 0) AS total FROM movimientos mv
       WHERE mv.empresa = 'REYNA' AND ${FILTRO_CONSUMO}`
    ).total;
    const reynaCerrado = get(`SELECT COALESCE(SUM(total), 0) AS n FROM reyna_cierres`).n
      + get('SELECT COALESCE(SUM(importe), 0) AS n FROM reyna_ajustes').n;

    const trailersActivos = get(
      `SELECT COUNT(*) AS n FROM trailers WHERE activo = 1 AND estado IN ('PLANEADO','EN_PROCESO')`
    ).n;

    const kpis = {
      valor_inventario: inv.valor,
      materiales: inv.materiales,
      materiales_bajo_minimo: inv.bajo_minimo,
      materiales_agotados: inv.agotados,
      materiales_criticos: inv.criticos,
      consumo_hoy: consumo.hoy,
      consumo_semanal: consumo.semana,
      consumo_mensual: consumo.mes,
      consumo_interno: consumo.interno,
      consumo_reyna: consumo.reyna,
      reyna_por_cobrar: reynaPorCobrar - reynaCerrado,
      vales_hoy: vales.hoy,
      vales_pendientes: vales.pendientes,
      vales_aprobados: vales.aprobados,
      vales_en_almacen: vales.en_almacen,
      vales_entregados: vales.entregados,
      entregas_parciales: vales.entregas_parciales,
      vales_rechazados: vales.rechazados,
      vales_total: vales.total,
      trailers_activos: trailersActivos
    };
    if (!verCostos) {
      for (const k of ['valor_inventario', 'consumo_hoy', 'consumo_semanal', 'consumo_mensual',
        'consumo_interno', 'consumo_reyna', 'reyna_por_cobrar']) delete kpis[k];
    }

    // -----------------------------------------------------------------------
    // Graficas
    // -----------------------------------------------------------------------
    const graficas = {
      consumo_mensual: all(
        `SELECT strftime('%Y-%m', mv.created_at) AS periodo,
                COALESCE(${salidasNetas}, 0) AS importe,
                COALESCE(SUM(CASE WHEN mv.empresa = 'INTERNA' THEN
                   (CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END) ELSE 0 END), 0) AS interna,
                COALESCE(SUM(CASE WHEN mv.empresa = 'REYNA' THEN
                   (CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END) ELSE 0 END), 0) AS reyna
         FROM movimientos mv WHERE ${FILTRO_CONSUMO}
         GROUP BY periodo ORDER BY periodo DESC LIMIT 12`
      ).reverse(),

      tendencia_semanal: all(
        `SELECT date(mv.created_at) AS dia, COALESCE(${salidasNetas}, 0) AS importe,
                COUNT(DISTINCT mv.vale_id) AS vales
         FROM movimientos mv
         WHERE ${FILTRO_CONSUMO} AND date(mv.created_at) >= date('now','-29 days')
         GROUP BY dia ORDER BY dia`
      ),

      top_materiales: all(
        `SELECT m.sku, m.nombre, SUM(mv.cantidad * mv.signo * -1) AS cantidad,
                COALESCE(${salidasNetas}, 0) AS importe
         FROM movimientos mv JOIN materiales m ON m.id = mv.material_id
         WHERE ${FILTRO_CONSUMO}
         GROUP BY m.id ORDER BY importe DESC LIMIT 10`
      ),

      consumo_por_area: all(
        `SELECT COALESCE(a.nombre, 'Sin area') AS area, COALESCE(${salidasNetas}, 0) AS importe,
                COUNT(DISTINCT mv.vale_id) AS vales
         FROM movimientos mv LEFT JOIN areas a ON a.id = mv.area_id
         WHERE ${FILTRO_CONSUMO} GROUP BY mv.area_id ORDER BY importe DESC`
      ),

      consumo_por_trailer: all(
        `SELECT t.numero, t.cliente, t.estado, COALESCE(${salidasNetas}, 0) AS importe,
                COUNT(DISTINCT mv.vale_id) AS vales
         FROM movimientos mv JOIN trailers t ON t.id = mv.trailer_id
         WHERE ${FILTRO_CONSUMO} GROUP BY t.id ORDER BY importe DESC LIMIT 15`
      ),

      vales_por_estado: all('SELECT estado, COUNT(*) AS n FROM vales GROUP BY estado ORDER BY n DESC'),

      inventario_critico: all(
        `SELECT sku, nombre, stock_fisico, disponible, stock_min, punto_reorden, unidad, semaforo
         FROM v_inventario WHERE activo = 1 AND semaforo <> 'NORMAL'
         ORDER BY CASE semaforo WHEN 'AGOTADO' THEN 0 WHEN 'CRITICO' THEN 1 ELSE 2 END, nombre LIMIT 25`
      ),

      // Tiempos del proceso, en minutos
      tiempos: get(
        `SELECT
           ROUND(AVG((julianday(autorizado_at) - julianday(created_at)) * 1440), 1) AS solicitud_autorizacion,
           ROUND(AVG((julianday(preparado_at) - julianday(autorizado_at)) * 1440), 1) AS autorizacion_preparacion,
           ROUND(AVG((julianday(entregado_at) - julianday(preparado_at)) * 1440), 1) AS preparacion_entrega,
           ROUND(AVG((julianday(entregado_at) - julianday(created_at)) * 1440), 1) AS total_ciclo
         FROM vales WHERE entregado_at IS NOT NULL`
      )
    };

    if (!verCostos) {
      delete graficas.consumo_mensual;
      delete graficas.consumo_por_trailer;
      graficas.top_materiales = graficas.top_materiales.map(({ importe, ...m }) => m);
      graficas.consumo_por_area = graficas.consumo_por_area.map(({ importe, ...m }) => m);
    }

    const actividad = can(user, 'vales.todos') || user.rol === 'SUPERVISOR'
      ? all(
        `SELECT v.id, v.folio, v.estado, v.created_at, t.numero AS trailer,
                w.nombre AS trabajador, v.empresa
         FROM vales v JOIN trailers t ON t.id = v.trailer_id JOIN users w ON w.id = v.trabajador_id
         ORDER BY v.created_at DESC LIMIT 12`)
      : [];

    return { kpis, graficas, actividad, generado: new Date().toISOString() };
  });

  /** Costo por trailer, con desglose por area. */
  r.get('/api/dashboard/trailers', (ctx) => {
    const user = requireUser(ctx);
    if (!puedeVerCostos(user)) return { trailers: [] };
    const trailers = all(
      `SELECT t.id, t.numero, t.cliente, t.modelo, t.estado, t.fecha_inicio, t.fecha_fin,
              COALESCE(${salidasNetas}, 0) AS costo,
              COUNT(DISTINCT mv.vale_id) AS vales
       FROM trailers t LEFT JOIN movimientos mv ON mv.trailer_id = t.id AND ${FILTRO_CONSUMO}
       GROUP BY t.id ORDER BY costo DESC`
    );
    return {
      trailers: trailers.map((t) => ({
        ...t,
        por_area: all(
          `SELECT COALESCE(a.nombre, 'Sin area') AS area, COALESCE(${salidasNetas}, 0) AS importe
           FROM movimientos mv LEFT JOIN areas a ON a.id = mv.area_id
           WHERE mv.trailer_id = ? AND ${FILTRO_CONSUMO} GROUP BY mv.area_id ORDER BY importe DESC`, t.id
        )
      }))
    };
  });
}
