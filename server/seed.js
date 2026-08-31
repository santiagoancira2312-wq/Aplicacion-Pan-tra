/**
 * Carga de datos de DEMOSTRACION.
 *
 *   node server/seed.js            -> carga si la base esta vacia
 *   node server/seed.js --reset    -> borra la base y la vuelve a crear
 *
 * Toda la informacion es ficticia. Esta pensada para sustituirse despues por
 * trabajadores, materiales, kits, inventario, trailers, costos y areas reales
 * desde la propia interfaz, sin reconstruir la aplicacion.
 */
import fs from 'node:fs';
import { DB_FILE } from './config.js';

const reset = process.argv.includes('--reset');
if (reset) {
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`, `${DB_FILE}-journal`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log('Base de datos anterior eliminada.');
}

const { db, all, get, run, tx, migrate } = await import('./db.js');
const { hashSecret, generateTotpSecret } = await import('./lib/auth.js');
const { firmaDemo } = await import('./seed/firma-png.js');
const D = await import('./seed/datos.js');

migrate();

if (get('SELECT COUNT(*) AS n FROM users').n > 0 && !reset) {
  console.log('La base ya contiene informacion. Use --reset para regenerar el demo.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
let semilla = 20260101;
const random = () => {
  semilla |= 0; semilla = (semilla + 0x6D2B79F5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const entre = (a, b) => a + Math.floor(random() * (b - a + 1));
const elegir = (arr) => arr[Math.floor(random() * arr.length)];
const round = (n) => Math.round(n * 1000) / 1000;

const HOY = new Date();
const ts = (diasAtras, hora = null, minuto = null) => {
  const d = new Date(HOY.getTime() - diasAtras * 86400000);
  d.setUTCHours(hora == null ? entre(13, 23) : hora, minuto == null ? entre(0, 59) : minuto, entre(0, 59), 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const DIAS_HISTORIA = 200;

console.log('Generando datos de demostracion...');

tx(() => {
  // -------------------------------------------------------------------------
  // Catalogos base
  // -------------------------------------------------------------------------
  const areas = {};
  for (const [codigo, nombre, desc] of D.AREAS) {
    areas[codigo] = Number(run('INSERT INTO areas (codigo, nombre, descripcion) VALUES (?, ?, ?)', codigo, nombre, desc).lastInsertRowid);
  }

  const unidades = {};
  const decimalesUnidad = {};
  for (const [codigo, nombre, dec] of D.UNIDADES) {
    unidades[codigo] = Number(run('INSERT INTO unidades (codigo, nombre, decimales) VALUES (?, ?, ?)', codigo, nombre, dec).lastInsertRowid);
    decimalesUnidad[unidades[codigo]] = dec;
  }
  // Las cantidades siempre respetan los decimales de la unidad: no existen 1.77 piezas.
  const porUnidad = (cantidad, unidadId) => {
    const f = 10 ** (decimalesUnidad[unidadId] ?? 2);
    return Math.max(1 / f, Math.round(Number(cantidad) * f) / f);
  };

  const categorias = {};
  for (const nombre of D.CATEGORIAS) {
    categorias[nombre] = Number(run('INSERT INTO categorias (nombre) VALUES (?)', nombre).lastInsertRowid);
  }

  const proveedores = [];
  for (const [nombre, contacto, tel, email, lead] of D.PROVEEDORES) {
    proveedores.push(Number(run(
      'INSERT INTO proveedores (nombre, contacto, telefono, email, lead_time_dias) VALUES (?, ?, ?, ?, ?)',
      nombre, contacto, tel, email, lead
    ).lastInsertRowid));
  }

  for (const [i, [texto, requiere]] of D.MOTIVOS_RECHAZO.entries()) {
    run('INSERT INTO motivos_rechazo (texto, requiere_comentario, orden) VALUES (?, ?, ?)', texto, requiere, i);
  }

  // -------------------------------------------------------------------------
  // Materiales (stock inicial en cero: entra por movimientos de ENTRADA)
  // -------------------------------------------------------------------------
  const materiales = {};
  for (const [sku, nombre, cat, uni, costo, min, max, reorden, ubic, provIdx, alias] of D.MATERIALES) {
    const id = Number(run(
      `INSERT INTO materiales (sku, nombre, categoria_id, unidad_id, stock_fisico, stock_min, stock_max,
                               punto_reorden, costo, ubicacion, proveedor_id, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      sku, nombre, categorias[cat], unidades[uni], min, max, reorden, costo, ubic,
      proveedores[provIdx - 1], ts(DIAS_HISTORIA + 5)
    ).lastInsertRowid);
    materiales[sku] = {
      id, sku, nombre, unidad_id: unidades[uni], costo, min, max, reorden,
      categoria: cat, decimales: decimalesUnidad[unidades[uni]]
    };
    run('INSERT INTO material_costos (material_id, costo, vigente_desde, motivo) VALUES (?, ?, ?, ?)',
      id, costo, ts(DIAS_HISTORIA + 5), 'Costo inicial del catalogo');
    for (const a of alias) run('INSERT OR IGNORE INTO material_alias (material_id, alias) VALUES (?, ?)', id, a);
  }

  // -------------------------------------------------------------------------
  // Trailers
  // -------------------------------------------------------------------------
  const trailers = [];
  for (const [i, [numero, modelo, tamano, cliente, tipo, estado]] of D.TRAILERS.entries()) {
    const inicio = ts(DIAS_HISTORIA - i * 18, 14, 0).slice(0, 10);
    const fin = estado === 'TERMINADO' ? ts(DIAS_HISTORIA - i * 18 - 60, 14, 0).slice(0, 10) : null;
    const id = Number(run(
      `INSERT INTO trailers (numero, modelo, tamano, cliente, tipo_config, fecha_inicio, fecha_fin, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      numero, modelo, tamano, cliente, tipo, inicio, fin, estado
    ).lastInsertRowid);
    trailers.push({ id, numero, estado });
  }
  const trailersActivos = trailers.filter((t) => t.estado !== 'PLANEADO');

  // -------------------------------------------------------------------------
  // Usuarios
  // Credenciales de demostracion (ficticias):
  //   Administrador  admin@demo.local        / Demo.Admin.2026
  //   Direccion      direccion@demo.local    / Demo.Direccion.2026
  //   Supervisores   ID SUP-01..SUP-05       / PIN 100001..100005
  //   Almacen        ID ALM-01..ALM-03       / PIN 200001..200003
  //   Trabajadores   ID EMP-001..EMP-025     / PIN 300001...
  //   Reyna          ID RNA-001..RNA-005     / PIN 400001...  (supervisor RSU-01 / 400010)
  // -------------------------------------------------------------------------
  const usuarios = { supervisores: [], trabajadores: [], almacen: [], reyna: [], reynaSup: null };
  let nombreIdx = 0;
  const siguienteNombre = () => D.NOMBRES[nombreIdx++ % D.NOMBRES.length];

  const crearUsuario = (datos) => Number(run(
    `INSERT INTO users (employee_id, nombre, email, rol, empresa, area_id, supervisor_id, telefono,
                        pin_hash, password_hash, twofa_secret, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    datos.employee_id, datos.nombre, datos.email || null, datos.rol, datos.empresa || 'INTERNA',
    datos.area_id || null, datos.supervisor_id || null, datos.telefono || null,
    datos.pin ? hashSecret(datos.pin) : null,
    datos.password ? hashSecret(datos.password) : null,
    ['ADMIN', 'DIRECCION'].includes(datos.rol) ? generateTotpSecret() : null,
    ts(DIAS_HISTORIA + 10, 15, 0)
  ).lastInsertRowid);

  const adminId = crearUsuario({
    employee_id: 'ADM-01', nombre: 'Administrador General (Demo)', email: 'admin@demo.local',
    rol: 'ADMIN', password: 'Demo.Admin.2026', telefono: '81-5555-0001'
  });

  for (const [i, correo] of ['direccion@demo.local', 'gerencia@demo.local'].entries()) {
    crearUsuario({
      employee_id: `DIR-0${i + 1}`, nombre: siguienteNombre(), email: correo, rol: 'DIRECCION',
      password: i === 0 ? 'Demo.Direccion.2026' : 'Demo.Gerencia.2026'
    });
  }

  const areasSupervisadas = ['ELE', 'PLO', 'GAS', 'LAM', 'ACA'];
  for (const [i, codigo] of areasSupervisadas.entries()) {
    const id = crearUsuario({
      employee_id: `SUP-0${i + 1}`, nombre: siguienteNombre(),
      email: `supervisor${i + 1}@demo.local`, rol: 'SUPERVISOR', area_id: areas[codigo],
      pin: String(100001 + i), password: `Demo.Supervisor${i + 1}.2026`
    });
    usuarios.supervisores.push({ id, area_id: areas[codigo], codigo });
  }

  for (let i = 0; i < 3; i++) {
    usuarios.almacen.push(crearUsuario({
      employee_id: `ALM-0${i + 1}`, nombre: siguienteNombre(), email: `almacen${i + 1}@demo.local`,
      rol: 'ALMACEN', pin: String(200001 + i), password: `Demo.Almacen${i + 1}.2026`
    }));
  }

  for (let i = 0; i < 25; i++) {
    const sup = usuarios.supervisores[i % usuarios.supervisores.length];
    const id = crearUsuario({
      employee_id: `EMP-${String(i + 1).padStart(3, '0')}`, nombre: siguienteNombre(),
      rol: 'TRABAJADOR', area_id: sup.area_id, supervisor_id: sup.id, pin: String(300001 + i)
    });
    usuarios.trabajadores.push({ id, area_id: sup.area_id, supervisor_id: sup.id, empresa: 'INTERNA' });
  }

  // Empresa externa: mismo inventario, flujo trabajador -> supervisor Reyna -> almacen.
  usuarios.reynaSup = crearUsuario({
    employee_id: 'RSU-01', nombre: siguienteNombre(), email: 'supervisor.reyna@demo.local',
    rol: 'SUPERVISOR', empresa: 'REYNA', area_id: areas.ACA, pin: '400010', password: 'Demo.Reyna.2026'
  });
  for (let i = 0; i < 5; i++) {
    const id = crearUsuario({
      employee_id: `RNA-${String(i + 1).padStart(3, '0')}`, nombre: siguienteNombre(),
      rol: 'TRABAJADOR', empresa: 'REYNA', area_id: areas.ACA,
      supervisor_id: usuarios.reynaSup, pin: String(400001 + i)
    });
    usuarios.reyna.push({ id, area_id: areas.ACA, supervisor_id: usuarios.reynaSup, empresa: 'REYNA' });
  }

  // -------------------------------------------------------------------------
  // Kits (y una segunda version para demostrar el versionado)
  // -------------------------------------------------------------------------
  const kits = [];
  for (const [codigo, nombre, areaCod, descripcion, items] of D.KITS) {
    const kitId = Number(run(
      'INSERT INTO kits (codigo, nombre, area_id, descripcion, created_at) VALUES (?, ?, ?, ?, ?)',
      codigo, nombre, areas[areaCod], descripcion, ts(DIAS_HISTORIA, 16, 0)
    ).lastInsertRowid);
    const versionId = Number(run(
      `INSERT INTO kit_versiones (kit_id, version, estado, notas, created_by, created_at)
       VALUES (?, 1, 'VIGENTE', ?, ?, ?)`,
      kitId, 'Version inicial del demo', adminId, ts(DIAS_HISTORIA, 16, 0)
    ).lastInsertRowid);
    let orden = 0;
    for (const [sku, cantidad] of items) {
      const m = materiales[sku];
      run(
        'INSERT INTO kit_items (kit_version_id, material_id, cantidad_estandar, unidad_id, orden) VALUES (?, ?, ?, ?, ?)',
        versionId, m.id, cantidad, m.unidad_id, orden++
      );
    }
    kits.push({ id: kitId, codigo, nombre, area_id: areas[areaCod], versionId, version: 1 });
  }

  // -------------------------------------------------------------------------
  // Motor de inventario para la historia simulada
  // -------------------------------------------------------------------------
  const stock = new Map(Object.values(materiales).map((m) => [m.id, 0]));
  const costoVigente = new Map(Object.values(materiales).map((m) => [m.id, m.costo]));

  const movimiento = ({ tipo, materialId, cantidad, signo, userId, fecha, valeId = null, valeItemId = null,
    entregaId = null, entradaId = null, empresa = null, trailerId = null, areaId = null, precio = 0,
    motivo = null, referencia = null }) => {
    const antes = stock.get(materialId);
    const despues = round(antes + signo * cantidad);
    stock.set(materialId, despues);
    run(
      `INSERT INTO movimientos (tipo, material_id, cantidad, signo, stock_antes, stock_despues, vale_id,
         vale_item_id, entrega_id, entrada_id, empresa, trailer_id, area_id, precio_unitario, importe,
         motivo, referencia, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tipo, materialId, cantidad, signo, antes, despues, valeId, valeItemId, entregaId, entradaId,
      empresa, trailerId, areaId, precio, round(cantidad * precio), motivo, referencia, userId, fecha
    );
  };

  let folioEntrada = 0;
  const registrarEntrada = (fecha, lineas, proveedorId, nota) => {
    folioEntrada += 1;
    const anio = fecha.slice(0, 4);
    const folio = `ENT-${anio}-${String(folioEntrada).padStart(5, '0')}`;
    const almacenista = elegir(usuarios.almacen);
    const entradaId = Number(run(
      'INSERT INTO entradas (folio, proveedor_id, orden_compra, fecha, user_id, notas, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      folio, proveedorId, `OC-${anio}-${String(folioEntrada).padStart(4, '0')}`, fecha, almacenista, nota, fecha
    ).lastInsertRowid);
    for (const { material, cantidad, costo } of lineas) {
      run('INSERT INTO entrada_items (entrada_id, material_id, cantidad, costo, unidad_id) VALUES (?, ?, ?, ?, ?)',
        entradaId, material.id, cantidad, costo, material.unidad_id);
      movimiento({
        tipo: 'ENTRADA', materialId: material.id, cantidad, signo: +1, userId: almacenista,
        fecha, entradaId, precio: costo, motivo: `Entrada ${folio}`, referencia: folio
      });
    }
    return entradaId;
  };

  // Abasto inicial y reabastecimientos periodicos.
  const listaMateriales = Object.values(materiales);
  registrarEntrada(
    ts(DIAS_HISTORIA, 9, 30),
    listaMateriales.map((m) => ({ material: m, cantidad: Math.ceil(m.max * 2) || 80, costo: m.costo })),
    proveedores[0], 'Abasto inicial del almacen (demo)'
  );

  for (const dia of [DIAS_HISTORIA - 30, DIAS_HISTORIA - 60, DIAS_HISTORIA - 90, DIAS_HISTORIA - 120, DIAS_HISTORIA - 150, 25]) {
    const fecha = ts(dia, 9, 15);
    const seleccion = listaMateriales.filter(() => random() < 0.6);
    const lineas = seleccion.map((m) => {
      // A partir de la mitad de la historia algunos costos suben: el precio
      // usado en entregas anteriores NO se modifica (precio historico).
      let costo = costoVigente.get(m.id);
      if (dia < DIAS_HISTORIA - 90 && random() < 0.25) {
        costo = round(costo * (1 + 0.04 + random() * 0.09));
        costoVigente.set(m.id, costo);
        run('UPDATE materiales SET costo = ? WHERE id = ?', costo, m.id);
        run('INSERT INTO material_costos (material_id, costo, vigente_desde, user_id, motivo) VALUES (?, ?, ?, ?, ?)',
          m.id, costo, fecha, adminId, 'Actualizacion de costo por compra');
      }
      return { material: m, cantidad: Math.ceil(m.max * (0.6 + random() * 0.6)) || 30, costo };
    });
    if (lineas.length) registrarEntrada(fecha, lineas, elegir(proveedores), 'Reabastecimiento programado');
  }

  // -------------------------------------------------------------------------
  // 200 vales historicos
  // -------------------------------------------------------------------------
  const materialesPorArea = {
    ELE: listaMateriales.filter((m) => ['Electrico', 'Equipos', 'Consumibles'].includes(m.categoria)),
    PLO: listaMateriales.filter((m) => ['Plomeria', 'Equipos', 'Consumibles'].includes(m.categoria)),
    GAS: listaMateriales.filter((m) => ['Gas', 'Equipos', 'Consumibles'].includes(m.categoria)),
    LAM: listaMateriales.filter((m) => ['Lamina y aislamiento', 'Ferreteria', 'Consumibles'].includes(m.categoria)),
    ACA: listaMateriales.filter((m) => ['Acabados', 'Ferreteria', 'Consumibles', 'Pintura'].includes(m.categoria)),
    PIN: listaMateriales.filter((m) => ['Pintura', 'Consumibles'].includes(m.categoria)),
    SOL: listaMateriales.filter((m) => ['Soldadura y estructura', 'Consumibles'].includes(m.categoria)),
    CAR: listaMateriales.filter((m) => ['Acabados', 'Ferreteria'].includes(m.categoria))
  };
  const areaPorId = Object.fromEntries(Object.entries(areas).map(([c, id]) => [id, c]));
  const kitsPorArea = {};
  for (const k of kits) (kitsPorArea[areaPorId[k.area_id]] ||= []).push(k);

  const TOTAL_VALES = 200;
  let folioSeq = 0;
  const valesCreados = [];

  // Fechas ordenadas: mas actividad en las semanas recientes.
  const dias = [];
  for (let i = 0; i < TOTAL_VALES; i++) {
    const sesgo = random() ** 1.6; // concentra vales cerca del presente
    dias.push(Math.floor(sesgo * (DIAS_HISTORIA - 5)));
  }
  dias.sort((a, b) => b - a);

  for (const diasAtras of dias) {
    const esReyna = random() < 0.16;
    const trabajador = esReyna ? elegir(usuarios.reyna) : elegir(usuarios.trabajadores);
    const areaCod = areaPorId[trabajador.area_id];
    const trailer = elegir(trailersActivos);
    const creado = ts(diasAtras);

    folioSeq += 1;
    const folio = `PT-${creado.slice(0, 4)}-${String(folioSeq).padStart(6, '0')}`;

    const valeId = Number(run(
      `INSERT INTO vales (folio, trabajador_id, empresa, area_id, supervisor_id, trailer_id, estado, prioridad, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?)`,
      folio, trabajador.id, esReyna ? 'REYNA' : 'INTERNA', trabajador.area_id, trabajador.supervisor_id,
      trailer.id, random() < 0.12 ? 'ALTA' : random() < 0.04 ? 'URGENTE' : 'NORMAL', creado
    ).lastInsertRowid);

    // Contenido: kits del area y materiales sueltos.
    const lineas = [];
    let orden = 0;
    const disponiblesArea = materialesPorArea[areaCod] || listaMateriales;
    const kitsArea = kitsPorArea[areaCod] || [];

    if (kitsArea.length && random() < 0.55) {
      const numKits = random() < 0.2 ? 2 : 1;
      const usados = new Set();
      for (let k = 0; k < numKits; k++) {
        const kit = elegir(kitsArea);
        if (usados.has(kit.id)) continue;
        usados.add(kit.id);
        const valeKitId = Number(run(
          `INSERT INTO vale_kits (vale_id, kit_id, kit_version_id, codigo_snapshot, nombre_snapshot, version_snapshot)
           VALUES (?, ?, ?, ?, ?, ?)`,
          valeId, kit.id, kit.versionId, kit.codigo, kit.nombre, kit.version
        ).lastInsertRowid);

        for (const ki of all('SELECT * FROM kit_items WHERE kit_version_id = ? ORDER BY orden', kit.versionId)) {
          // El trabajador puede ajustar la cantidad del kit para ESTE vale.
          let cantidad = ki.cantidad_estandar;
          if (random() < 0.3) {
            const factor = 0.7 + random() * 0.7;
            cantidad = porUnidad(Math.max(1 / 100, ki.cantidad_estandar * factor), ki.unidad_id);
          }
          lineas.push({ materialId: ki.material_id, estandar: ki.cantidad_estandar, cantidad, valeKitId, orden: orden++ });
        }
      }
    }

    const sueltos = entre(kitsArea.length ? 0 : 1, 4);
    const yaIncluidos = new Set(lineas.map((l) => l.materialId));
    for (let i = 0; i < sueltos; i++) {
      const m = elegir(disponiblesArea);
      if (!m || yaIncluidos.has(m.id)) continue;
      yaIncluidos.add(m.id);
      const base = m.costo > 3000 ? entre(1, 2) : m.costo > 500 ? entre(1, 4) : entre(2, 30);
      lineas.push({ materialId: m.id, estandar: null, cantidad: base, valeKitId: null, orden: orden++ });
    }
    if (!lineas.length) {
      const m = elegir(listaMateriales);
      lineas.push({ materialId: m.id, estandar: null, cantidad: entre(1, 10), valeKitId: null, orden: 0 });
    }

    const itemIds = [];
    for (const l of lineas) {
      const m = listaMateriales.find((x) => x.id === l.materialId);
      const id = Number(run(
        `INSERT INTO vale_items (vale_id, material_id, vale_kit_id, sku_snapshot, nombre_snapshot, unidad_id,
                                 cantidad_estandar, cantidad_solicitada, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        valeId, m.id, l.valeKitId, m.sku, m.nombre, m.unidad_id, l.estandar, l.cantidad, l.orden
      ).lastInsertRowid);
      itemIds.push({ id, materialId: m.id, solicitada: l.cantidad });
    }

    run(
      `INSERT INTO auditoria (user_id, user_nombre, accion, entidad, entidad_id, valor_nuevo, created_at)
       VALUES (?, (SELECT nombre FROM users WHERE id = ?), 'VALE_CREADO', 'vales', ?, ?, ?)`,
      trabajador.id, trabajador.id, String(valeId), JSON.stringify({ folio, lineas: itemIds.length }), creado
    );

    valesCreados.push({ valeId, folio, diasAtras, creado, trabajador, trailer, esReyna, itemIds, areaId: trabajador.area_id });
  }

  // -------------------------------------------------------------------------
  // Flujo de cada vale: autorizacion, preparacion, entrega y firma
  // -------------------------------------------------------------------------
  let entregasTotales = 0, parciales = 0, rechazados = 0, pendientes = 0;

  for (const v of [...valesCreados].reverse()) { // cronologico
    const supervisorId = v.trabajador.supervisor_id;
    const antiguo = v.diasAtras > 8;
    const suerte = random();

    // Vales recientes que siguen esperando autorizacion.
    if (!antiguo && suerte < 0.18) { pendientes += 1; continue; }

    const autorizado = ts(v.diasAtras, null, null) > v.creado
      ? ts(v.diasAtras, null, null) : v.creado;
    const fechaAut = new Date(new Date(v.creado + 'Z').getTime() + entre(8, 240) * 60000)
      .toISOString().slice(0, 19).replace('T', ' ');

    // Rechazo o solicitud de correccion.
    if (suerte > 0.93) {
      const motivo = get('SELECT * FROM motivos_rechazo ORDER BY RANDOM() LIMIT 1');
      const estado = random() < 0.6 ? 'RECHAZADO' : 'CORRECCION';
      run(
        `UPDATE vales SET estado = ?, motivo_rechazo_id = ?, comentario_rechazo = ?, autorizado_por = ?, autorizado_at = ?
         WHERE id = ?`,
        estado, motivo.id, motivo.requiere_comentario ? 'Revisar con el supervisor de area.' : null,
        supervisorId, fechaAut, v.valeId
      );
      run(`UPDATE vale_items SET estado_linea = 'RECHAZADA' WHERE vale_id = ?`, v.valeId);
      run(
        `INSERT INTO auditoria (user_id, user_nombre, accion, entidad, entidad_id, valor_nuevo, motivo, created_at)
         VALUES (?, (SELECT nombre FROM users WHERE id = ?), ?, 'vales', ?, ?, ?, ?)`,
        supervisorId, supervisorId, `VALE_${estado}`, String(v.valeId),
        JSON.stringify({ estado }), motivo.texto, fechaAut
      );
      rechazados += 1;
      continue;
    }

    // Autorizacion total o parcial.
    let recorte = false;
    for (const it of v.itemIds) {
      let autorizada = it.solicitada;
      if (random() < 0.12) {
        const mat = listaMateriales.find((m) => m.id === it.materialId);
        autorizada = porUnidad(it.solicitada * (0.4 + random() * 0.5), mat.unidad_id);
        recorte = true;
      }
      it.autorizada = autorizada;
      run(`UPDATE vale_items SET cantidad_autorizada = ?, estado_linea = 'AUTORIZADA' WHERE id = ?`, autorizada, it.id);
    }
    const estadoAut = recorte ? 'APROBADO_PARCIAL' : 'APROBADO';
    run('UPDATE vales SET estado = ?, autorizado_por = ?, autorizado_at = ? WHERE id = ?',
      estadoAut, supervisorId, fechaAut, v.valeId);
    run(
      `INSERT INTO auditoria (user_id, user_nombre, accion, entidad, entidad_id, valor_nuevo, created_at)
       VALUES (?, (SELECT nombre FROM users WHERE id = ?), 'VALE_AUTORIZADO', 'vales', ?, ?, ?)`,
      supervisorId, supervisorId, String(v.valeId), JSON.stringify({ estado: estadoAut }), fechaAut
    );

    // Vales recientes que aun estan en el almacen.
    if (!antiguo) {
      const r = random();
      if (r < 0.22) continue;                                   // en la cola, sin tocar
      if (r < 0.34) {
        run(`UPDATE vales SET estado = 'EN_PREPARACION', preparacion_at = ?, preparado_por = ? WHERE id = ?`,
          fechaAut, elegir(usuarios.almacen), v.valeId);
        continue;
      }
      if (r < 0.46) {
        run(`UPDATE vales SET estado = 'PREPARADO', preparado_at = ?, preparado_por = ? WHERE id = ?`,
          fechaAut, elegir(usuarios.almacen), v.valeId);
        continue;
      }
    }

    // Preparacion y entrega fisica.
    const almacenista = elegir(usuarios.almacen);
    const fechaPrep = new Date(new Date(fechaAut + 'Z').getTime() + entre(10, 180) * 60000)
      .toISOString().slice(0, 19).replace('T', ' ');
    const fechaEnt = new Date(new Date(fechaPrep + 'Z').getTime() + entre(5, 120) * 60000)
      .toISOString().slice(0, 19).replace('T', ' ');
    run('UPDATE vales SET preparacion_at = ?, preparado_at = ?, preparado_por = ? WHERE id = ?',
      fechaAut, fechaPrep, almacenista, v.valeId);

    const entregas = [];
    for (const it of v.itemIds) {
      const disponible = stock.get(it.materialId);
      let cantidad = it.autorizada;
      // A veces no alcanza el material fisico: se genera entrega parcial.
      const matLinea = listaMateriales.find((m) => m.id === it.materialId);
      if (cantidad > disponible) cantidad = Math.max(0, porUnidad(disponible, matLinea.unidad_id));
      else if (random() < 0.04) cantidad = porUnidad(cantidad * (0.3 + random() * 0.5), matLinea.unidad_id);
      if (cantidad > it.autorizada) cantidad = it.autorizada;
      if (cantidad > 0) entregas.push({ it, cantidad });
    }
    if (!entregas.length) continue;

    const completa = entregas.length === v.itemIds.length
      && entregas.every((e) => e.cantidad >= e.it.autorizada);
    const receptor = get('SELECT nombre FROM users WHERE id = ?', v.trabajador.id).nombre;
    const firmaId = Number(run(
      'INSERT INTO firmas (vale_id, firmante, firmante_id, almacenista_id, data_url, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      v.valeId, receptor, v.trabajador.id, almacenista, firmaDemo(random),
      `demo-${v.valeId}-${Math.floor(random() * 1e9)}`, fechaEnt
    ).lastInsertRowid);
    const entregaId = Number(run(
      `INSERT INTO entregas (vale_id, almacenista_id, receptor_id, receptor_nombre, tipo, firma_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      v.valeId, almacenista, v.trabajador.id, receptor, completa ? 'TOTAL' : 'PARCIAL', firmaId, fechaEnt
    ).lastInsertRowid);
    run('UPDATE firmas SET entrega_id = ? WHERE id = ?', entregaId, firmaId);

    for (const { it, cantidad } of entregas) {
      const precio = costoVigente.get(it.materialId);
      run(
        `UPDATE vale_items SET cantidad_entregada = ?, precio_unitario = ?, importe = ?, estado_linea = ? WHERE id = ?`,
        cantidad, precio, round(cantidad * precio),
        cantidad >= it.autorizada ? 'ENTREGADA' : 'PARCIAL', it.id
      );
      run('INSERT INTO entrega_items (entrega_id, vale_item_id, cantidad, precio_unitario, importe) VALUES (?, ?, ?, ?, ?)',
        entregaId, it.id, cantidad, precio, round(cantidad * precio));
      movimiento({
        tipo: 'SALIDA', materialId: it.materialId, cantidad, signo: -1, userId: almacenista,
        fecha: fechaEnt, valeId: v.valeId, valeItemId: it.id, entregaId,
        empresa: v.esReyna ? 'REYNA' : 'INTERNA', trailerId: v.trailer.id, areaId: v.areaId,
        precio, motivo: `Entrega de vale ${v.folio}`, referencia: v.folio
      });
    }

    run('UPDATE vales SET estado = ?, entregado_por = ?, entregado_at = ? WHERE id = ?',
      completa ? 'ENTREGADO' : 'ENTREGA_PARCIAL', almacenista, fechaEnt, v.valeId);
    run(
      `INSERT INTO auditoria (user_id, user_nombre, accion, entidad, entidad_id, valor_nuevo, motivo, created_at)
       VALUES (?, (SELECT nombre FROM users WHERE id = ?), 'ENTREGA_REGISTRADA', 'vales', ?, ?, ?, ?)`,
      almacenista, almacenista, String(v.valeId),
      JSON.stringify({ tipo: completa ? 'TOTAL' : 'PARCIAL' }), `Recibio: ${receptor}`, fechaEnt
    );
    entregasTotales += 1;
    if (!completa) parciales += 1;

    // Algunas entregas parciales antiguas se cierran por decision del almacen.
    if (!completa && v.diasAtras > 40 && random() < 0.5) {
      const fechaCierre = new Date(new Date(fechaEnt + 'Z').getTime() + entre(3, 20) * 86400000)
        .toISOString().slice(0, 19).replace('T', ' ');
      run(`UPDATE vale_items SET estado_linea = 'CERRADA', motivo_linea = ? WHERE vale_id = ? AND cantidad_autorizada > cantidad_entregada`,
        'Material ya no requerido para este trailer', v.valeId);
      run(`UPDATE vales SET estado = 'CERRADO', cerrado_por = ?, cerrado_at = ?, motivo_cierre = ? WHERE id = ?`,
        almacenista, fechaCierre, 'Material ya no requerido para este trailer', v.valeId);
    }

    // Devoluciones ocasionales confirmadas por el almacen.
    if (completa && random() < 0.06) {
      const fechaDev = new Date(new Date(fechaEnt + 'Z').getTime() + entre(1, 10) * 86400000)
        .toISOString().slice(0, 19).replace('T', ' ');
      if (fechaDev < ts(0, 23, 59)) {
        const linea = elegir(entregas);
        const cantidad = Math.max(1, Math.floor(linea.cantidad * 0.3));
        if (cantidad > 0 && cantidad <= linea.cantidad) {
          const devId = Number(run(
            'INSERT INTO devoluciones (vale_id, almacenista_id, motivo, created_at) VALUES (?, ?, ?, ?)',
            v.valeId, almacenista, 'Material sobrante del trailer', fechaDev
          ).lastInsertRowid);
          const precio = costoVigente.get(linea.it.materialId);
          run(
            'INSERT INTO devolucion_items (devolucion_id, vale_item_id, material_id, cantidad, precio_unitario, importe) VALUES (?, ?, ?, ?, ?, ?)',
            devId, linea.it.id, linea.it.materialId, cantidad, precio, round(cantidad * precio)
          );
          run('UPDATE vale_items SET importe = MAX(importe - ?, 0) WHERE id = ?', round(cantidad * precio), linea.it.id);
          movimiento({
            tipo: 'DEVOLUCION', materialId: linea.it.materialId, cantidad, signo: +1, userId: almacenista,
            fecha: fechaDev, valeId: v.valeId, valeItemId: linea.it.id,
            empresa: v.esReyna ? 'REYNA' : 'INTERNA', trailerId: v.trailer.id, areaId: v.areaId,
            precio, motivo: 'Material sobrante del trailer', referencia: v.folio
          });
        }
      }
    }
  }

  // Algunos ajustes de inventario para mostrar el modulo de movimientos.
  for (let i = 0; i < 12; i++) {
    const m = elegir(listaMateriales);
    if (stock.get(m.id) < 5) continue;
    const tipo = elegir(['MERMA', 'DANO', 'AJUSTE_NEGATIVO', 'AJUSTE_POSITIVO']);
    const cantidad = entre(1, 4);
    movimiento({
      tipo, materialId: m.id, cantidad, signo: tipo === 'AJUSTE_POSITIVO' ? +1 : -1,
      userId: elegir(usuarios.almacen), fecha: ts(entre(2, 120)), precio: costoVigente.get(m.id),
      motivo: tipo === 'MERMA' ? 'Merma detectada en conteo fisico'
        : tipo === 'DANO' ? 'Material danado durante maniobra'
          : 'Ajuste por conteo ciclico de inventario'
    });
  }

  // Sincroniza el stock final calculado con la tabla de materiales.
  for (const [materialId, cantidad] of stock) {
    run('UPDATE materiales SET stock_fisico = ? WHERE id = ?', Math.max(0, round(cantidad)), materialId);
  }

  // -------------------------------------------------------------------------
  // Segunda version del Kit Electrico (los vales anteriores conservan la V1)
  // -------------------------------------------------------------------------
  const kitEle = kits.find((k) => k.codigo === D.KIT_V2.codigo);
  if (kitEle) {
    run(`UPDATE kit_versiones SET estado = 'HISTORICA' WHERE kit_id = ?`, kitEle.id);
    const v2 = Number(run(
      `INSERT INTO kit_versiones (kit_id, version, estado, notas, created_by, created_at)
       VALUES (?, 2, 'VIGENTE', ?, ?, ?)`,
      kitEle.id, D.KIT_V2.notas, adminId, ts(12, 11, 0)
    ).lastInsertRowid);
    let orden = 0;
    for (const [sku, cantidad] of D.KIT_V2.items) {
      const m = materiales[sku];
      run('INSERT INTO kit_items (kit_version_id, material_id, cantidad_estandar, unidad_id, orden) VALUES (?, ?, ?, ?, ?)',
        v2, m.id, cantidad, m.unidad_id, orden++);
    }
    run(
      `INSERT INTO auditoria (user_id, user_nombre, accion, entidad, entidad_id, valor_nuevo, motivo, created_at)
       VALUES (?, 'Administrador General (Demo)', 'KIT_NUEVA_VERSION', 'kits', ?, ?, ?, ?)`,
      adminId, String(kitEle.id), JSON.stringify({ version: 2 }), D.KIT_V2.notas, ts(12, 11, 0)
    );
  }

  // -------------------------------------------------------------------------
  // Cierres mensuales de la empresa externa (meses completos anteriores)
  // -------------------------------------------------------------------------
  const periodos = all(
    `SELECT DISTINCT strftime('%Y-%m', created_at) AS periodo FROM movimientos
     WHERE empresa = 'REYNA' ORDER BY periodo`
  ).map((p) => p.periodo);
  const periodoActual = new Date().toISOString().slice(0, 7);
  for (const periodo of periodos) {
    if (periodo >= periodoActual) continue;
    const resumen = get(
      `SELECT COUNT(*) AS lineas,
              COALESCE(SUM(CASE WHEN tipo = 'SALIDA' THEN importe ELSE -importe END), 0) AS total
       FROM movimientos WHERE empresa = 'REYNA' AND tipo IN ('SALIDA','DEVOLUCION')
         AND strftime('%Y-%m', created_at) = ?`, periodo
    );
    if (!resumen.lineas) continue;
    const cerradoPor = elegir(usuarios.almacen);
    const cierreId = Number(run(
      `INSERT INTO reyna_cierres (periodo, total, lineas, estado, cerrado_por, cerrado_at, notas)
       VALUES (?, ?, ?, 'CERRADO', ?, ?, ?)`,
      periodo, resumen.total, resumen.lineas, cerradoPor,
      `${periodo}-28 18:00:00`, 'Cierre mensual de consumos (demo)'
    ).lastInsertRowid);
    run(
      `UPDATE vales SET cierre_reyna_id = ?
       WHERE empresa = 'REYNA' AND cierre_reyna_id IS NULL
         AND id IN (SELECT DISTINCT vale_id FROM movimientos
                    WHERE empresa = 'REYNA' AND vale_id IS NOT NULL AND strftime('%Y-%m', created_at) = ?)`,
      cierreId, periodo
    );
  }

  // -------------------------------------------------------------------------
  // Notificaciones vivas para la demostracion
  // -------------------------------------------------------------------------
  for (const v of all(
    `SELECT v.id, v.folio, v.supervisor_id, t.numero, u.nombre
     FROM vales v JOIN trailers t ON t.id = v.trailer_id JOIN users u ON u.id = v.trabajador_id
     WHERE v.estado = 'PENDIENTE'`
  )) {
    if (!v.supervisor_id) continue;
    run(
      'INSERT INTO notificaciones (user_id, tipo, titulo, cuerpo, vale_id) VALUES (?, ?, ?, ?, ?)',
      v.supervisor_id, 'VALE_PENDIENTE', 'Nueva solicitud pendiente',
      `${v.nombre} creo el vale ${v.folio}. Trailer: ${v.numero}`, v.id
    );
  }
  for (const v of all(
    `SELECT id, folio FROM vales WHERE estado IN ('APROBADO','APROBADO_PARCIAL') LIMIT 12`
  )) {
    for (const alm of usuarios.almacen) {
      run('INSERT INTO notificaciones (user_id, tipo, titulo, cuerpo, vale_id) VALUES (?, ?, ?, ?, ?)',
        alm, 'VALE_PARA_PREPARAR', 'Nuevo vale para preparar', `Vale ${v.folio} autorizado`, v.id);
    }
  }

  console.log(`  Vales generados: ${valesCreados.length} (entregas ${entregasTotales}, parciales ${parciales}, rechazados ${rechazados}, pendientes ${pendientes})`);
});

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
const resumen = {
  usuarios: get('SELECT COUNT(*) AS n FROM users').n,
  materiales: get('SELECT COUNT(*) AS n FROM materiales').n,
  kits: get('SELECT COUNT(*) AS n FROM kits').n,
  versiones_kit: get('SELECT COUNT(*) AS n FROM kit_versiones').n,
  trailers: get('SELECT COUNT(*) AS n FROM trailers').n,
  vales: get('SELECT COUNT(*) AS n FROM vales').n,
  lineas_vale: get('SELECT COUNT(*) AS n FROM vale_items').n,
  movimientos: get('SELECT COUNT(*) AS n FROM movimientos').n,
  entregas: get('SELECT COUNT(*) AS n FROM entregas').n,
  firmas: get('SELECT COUNT(*) AS n FROM firmas').n,
  devoluciones: get('SELECT COUNT(*) AS n FROM devoluciones').n,
  cierres_reyna: get('SELECT COUNT(*) AS n FROM reyna_cierres').n,
  valor_inventario: Math.round(get('SELECT COALESCE(SUM(stock_fisico * costo), 0) AS v FROM materiales').v)
};

console.log('\nDemo listo:');
for (const [k, v] of Object.entries(resumen)) console.log(`  ${k.padEnd(18)} ${v}`);
console.log('\nAcceso de demostracion (datos ficticios):');
console.log('  Administrador   admin@demo.local / Demo.Admin.2026');
console.log('  Direccion       direccion@demo.local / Demo.Direccion.2026');
console.log('  Supervisor      ID SUP-01  PIN 100001');
console.log('  Almacen         ID ALM-01  PIN 200001');
console.log('  Trabajador      ID EMP-001 PIN 300001');
console.log('  Trabajador Reyna ID RNA-001 PIN 400001');
console.log('  Supervisor Reyna ID RSU-01  PIN 400010');
db.close();
