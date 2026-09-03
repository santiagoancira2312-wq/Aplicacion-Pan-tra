import { all } from '../db.js';
import { notFound, forbidden } from '../lib/http.js';
import { requireUser } from './auth.js';
import { requirePerm, puedeVerCostos } from '../lib/rbac.js';
import { toCsv, csvFilename } from '../lib/csv.js';
import { audit } from '../lib/audit.js';

/**
 * Exportacion a Excel (CSV con BOM). La aplicacion es la fuente de verdad;
 * Excel se usa solo para reportes, analisis e integraciones administrativas.
 *
 * El campo `reyna` dice que puede sacar de cada reporte un usuario de la
 * empresa externa. Antes se filtraba por la columna Empresa, y los reportes
 * que no la tienen se salvaban enteros del filtro: por ahi salia el consumo
 * de cada trailer interno con su cliente y modelo.
 *   'columna'  las filas se filtran por su columna Empresa
 *   'propio'   el reporte ya es solo de la empresa externa
 *   (nada)     no esta disponible para la empresa externa
 */
const REPORTES = {
  inventario: {
    permiso: 'inventario.leer',
    sql: `SELECT sku AS SKU, nombre AS Material, categoria AS Categoria, unidad AS Unidad,
                 stock_fisico AS "Stock fisico", comprometido AS Comprometido, disponible AS Disponible,
                 stock_min AS Minimo, stock_max AS Maximo, punto_reorden AS "Punto de reorden",
                 ubicacion AS Ubicacion, proveedor AS Proveedor, semaforo AS Semaforo,
                 costo AS "Costo unitario", valor AS "Valor total"
          FROM v_inventario WHERE activo = 1 ORDER BY nombre`,
    costos: ['Costo unitario', 'Valor total']
  },

  movimientos: {
    permiso: 'movimientos.leer',
    reyna: 'columna',
    sql: `SELECT mv.created_at AS Fecha, mv.tipo AS Tipo, m.sku AS SKU, m.nombre AS Material,
                 mv.cantidad AS Cantidad, un.codigo AS Unidad, mv.stock_antes AS "Stock antes",
                 mv.stock_despues AS "Stock despues", v.folio AS Folio, t.numero AS Trailer,
                 a.nombre AS Area, mv.empresa AS Empresa, us.nombre AS Usuario, mv.motivo AS Motivo,
                 mv.precio_unitario AS "Precio unitario", mv.importe AS Importe
          FROM movimientos mv
          JOIN materiales m ON m.id = mv.material_id
          JOIN unidades un ON un.id = m.unidad_id
          JOIN users us ON us.id = mv.user_id
          LEFT JOIN vales v ON v.id = mv.vale_id
          LEFT JOIN trailers t ON t.id = mv.trailer_id
          LEFT JOIN areas a ON a.id = mv.area_id
          ORDER BY mv.created_at DESC`,
    costos: ['Precio unitario', 'Importe']
  },

  vales: {
    permiso: 'vales.todos',
    sql: `SELECT v.folio AS Folio, v.created_at AS Fecha, v.estado AS Estado, v.empresa AS Empresa,
                 w.nombre AS Trabajador, a.nombre AS Area, t.numero AS Trailer,
                 s.nombre AS Supervisor, v.autorizado_at AS "Fecha autorizacion",
                 v.entregado_at AS "Fecha entrega", mr.texto AS "Motivo rechazo",
                 (SELECT COUNT(*) FROM vale_items vi WHERE vi.vale_id = v.id) AS Lineas,
                 (SELECT COALESCE(SUM(vi.importe), 0) FROM vale_items vi WHERE vi.vale_id = v.id) AS Importe
          FROM vales v
          JOIN users w ON w.id = v.trabajador_id
          JOIN trailers t ON t.id = v.trailer_id
          LEFT JOIN areas a ON a.id = v.area_id
          LEFT JOIN users s ON s.id = v.autorizado_por
          LEFT JOIN motivos_rechazo mr ON mr.id = v.motivo_rechazo_id
          ORDER BY v.created_at DESC`,
    costos: ['Importe']
  },

  detalle_vales: {
    permiso: 'vales.todos',
    reyna: 'columna',
    sql: `SELECT v.folio AS Folio, v.created_at AS Fecha, v.estado AS Estado, v.empresa AS Empresa,
                 w.nombre AS Trabajador, t.numero AS Trailer, a.nombre AS Area,
                 vk.nombre_snapshot AS Kit, vk.version_snapshot AS "Version kit",
                 vi.sku_snapshot AS SKU, vi.nombre_snapshot AS Material, un.codigo AS Unidad,
                 vi.cantidad_estandar AS Estandar, vi.cantidad_solicitada AS Solicitado,
                 vi.cantidad_autorizada AS Autorizado, vi.cantidad_entregada AS Entregado,
                 (vi.cantidad_autorizada - vi.cantidad_entregada) AS Pendiente,
                 vi.estado_linea AS "Estado linea",
                 vi.precio_unitario AS "Precio unitario", vi.importe AS Importe
          FROM vale_items vi
          JOIN vales v ON v.id = vi.vale_id
          JOIN users w ON w.id = v.trabajador_id
          JOIN trailers t ON t.id = v.trailer_id
          JOIN unidades un ON un.id = vi.unidad_id
          LEFT JOIN areas a ON a.id = v.area_id
          LEFT JOIN vale_kits vk ON vk.id = vi.vale_kit_id
          ORDER BY v.created_at DESC, vi.id`,
    costos: ['Precio unitario', 'Importe']
  },

  trabajadores: {
    permiso: 'usuarios.leer',
    reyna: 'columna',
    sql: `SELECT u.employee_id AS "ID empleado", u.nombre AS Nombre, u.rol AS Rol, u.empresa AS Empresa,
                 a.nombre AS Area, s.nombre AS Supervisor,
                 CASE u.activo WHEN 1 THEN 'Activo' ELSE 'Inactivo' END AS Estado,
                 u.last_login_at AS "Ultimo acceso",
                 (SELECT COUNT(*) FROM vales v WHERE v.trabajador_id = u.id) AS Vales
          FROM users u LEFT JOIN areas a ON a.id = u.area_id LEFT JOIN users s ON s.id = u.supervisor_id
          ORDER BY u.rol, u.nombre`
  },

  consumo_trailer: {
    permiso: 'inventario.leer',
    sql: `SELECT t.numero AS Trailer, t.cliente AS Cliente, t.modelo AS Modelo, t.estado AS Estado,
                 COUNT(DISTINCT mv.vale_id) AS Vales,
                 COALESCE(SUM(CASE WHEN mv.tipo = 'SALIDA' THEN mv.cantidad ELSE -mv.cantidad END), 0) AS "Piezas netas",
                 COALESCE(SUM(CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END), 0) AS "Costo total"
          FROM trailers t
          LEFT JOIN movimientos mv ON mv.trailer_id = t.id AND mv.tipo IN ('SALIDA','DEVOLUCION')
          GROUP BY t.id ORDER BY "Costo total" DESC`,
    costos: ['Costo total']
  },

  consumo_area: {
    permiso: 'inventario.leer',
    sql: `SELECT COALESCE(a.nombre, 'Sin area') AS Area, COUNT(DISTINCT mv.vale_id) AS Vales,
                 COALESCE(SUM(CASE WHEN mv.tipo = 'SALIDA' THEN mv.importe ELSE -mv.importe END), 0) AS Importe
          FROM movimientos mv LEFT JOIN areas a ON a.id = mv.area_id
          WHERE mv.tipo IN ('SALIDA','DEVOLUCION')
          GROUP BY mv.area_id ORDER BY Importe DESC`,
    costos: ['Importe']
  },

  consumo_reyna: {
    permiso: 'reyna.leer',
    reyna: 'propio',
    sql: `SELECT mv.created_at AS Fecha, v.folio AS Folio, w.nombre AS Trabajador, t.numero AS Trailer,
                 m.sku AS SKU, m.nombre AS Material, mv.cantidad AS Cantidad, un.codigo AS Unidad,
                 mv.precio_unitario AS Precio,
                 CASE WHEN mv.tipo = 'DEVOLUCION' THEN -mv.importe ELSE mv.importe END AS Importe,
                 sup.nombre AS Supervisor, alm.nombre AS Almacenista, mv.tipo AS Tipo
          FROM movimientos mv
          JOIN materiales m ON m.id = mv.material_id
          JOIN unidades un ON un.id = m.unidad_id
          LEFT JOIN vales v ON v.id = mv.vale_id
          LEFT JOIN users w ON w.id = v.trabajador_id
          LEFT JOIN users sup ON sup.id = v.autorizado_por
          LEFT JOIN users alm ON alm.id = mv.user_id
          LEFT JOIN trailers t ON t.id = mv.trailer_id
          WHERE mv.empresa = 'REYNA' AND mv.tipo IN ('SALIDA','DEVOLUCION')
          ORDER BY mv.created_at DESC`,
    costos: ['Precio', 'Importe']
  },

  kits: {
    permiso: 'kits.leer',
    sql: `SELECT k.codigo AS Codigo, k.nombre AS Kit, kv.version AS Version, kv.estado AS "Estado version",
                 ar.nombre AS Area, m.sku AS SKU, m.nombre AS Material,
                 ki.cantidad_estandar AS "Cantidad estandar", un.codigo AS Unidad,
                 m.costo AS "Costo unitario", (ki.cantidad_estandar * m.costo) AS "Costo linea"
          FROM kits k
          JOIN kit_versiones kv ON kv.kit_id = k.id
          JOIN kit_items ki ON ki.kit_version_id = kv.id
          JOIN materiales m ON m.id = ki.material_id
          JOIN unidades un ON un.id = ki.unidad_id
          LEFT JOIN areas ar ON ar.id = k.area_id
          ORDER BY k.nombre, kv.version, m.nombre`,
    costos: ['Costo unitario', 'Costo linea']
  },

  alertas: {
    permiso: 'inventario.leer',
    sql: `SELECT semaforo AS Semaforo, sku AS SKU, nombre AS Material, unidad AS Unidad,
                 stock_fisico AS "Stock fisico", comprometido AS Comprometido, disponible AS Disponible,
                 stock_min AS Minimo, punto_reorden AS "Punto de reorden", ubicacion AS Ubicacion
          FROM v_inventario WHERE activo = 1 AND semaforo <> 'NORMAL'
          ORDER BY CASE semaforo WHEN 'AGOTADO' THEN 0 WHEN 'CRITICO' THEN 1 ELSE 2 END, nombre`
  },

  auditoria: {
    permiso: 'auditoria.leer',
    sql: `SELECT created_at AS Fecha, user_nombre AS Usuario, accion AS Accion, entidad AS Entidad,
                 entidad_id AS "ID", valor_antes AS "Valor anterior", valor_nuevo AS "Valor nuevo",
                 motivo AS Motivo, ip AS IP
          FROM auditoria ORDER BY created_at DESC LIMIT 5000`
  }
};

export default function register(r) {
  r.get('/api/exportar', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'exportar');
    return {
      reportes: Object.entries(REPORTES)
        .filter(([, def]) => {
          if (user.empresa === 'REYNA' && !def.reyna) return false;
          try { requirePerm(user, def.permiso); return true; } catch { return false; }
        })
        .map(([nombre]) => nombre)
    };
  });

  r.get('/api/exportar/:reporte', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'exportar');
    const nombre = ctx.params.reporte;
    const def = REPORTES[nombre];
    if (!def) throw notFound('Reporte no disponible');
    requirePerm(user, def.permiso);

    // Un usuario de la empresa externa solo exporta su propia informacion.
    if (user.empresa === 'REYNA' && !def.reyna) {
      throw forbidden('Ese reporte contiene informacion de la empresa interna');
    }
    let filas = all(def.sql);
    if (user.empresa === 'REYNA' && def.reyna === 'columna') {
      filas = filas.filter((f) => f.Empresa === 'REYNA');
    }
    if (!puedeVerCostos(user) && def.costos) {
      filas = filas.map((f) => {
        const copia = { ...f };
        for (const c of def.costos) delete copia[c];
        return copia;
      });
    }

    audit(ctx, { accion: 'EXPORTACION', entidad: 'reportes', entidad_id: nombre, nuevo: { filas: filas.length } });

    const csv = toCsv(filas);
    ctx.res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(nombre)}"`,
      'Cache-Control': 'no-store'
    });
    ctx.res.end(csv);
  });
}
