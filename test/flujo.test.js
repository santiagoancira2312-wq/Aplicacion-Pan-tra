/**
 * Prueba de extremo a extremo del flujo principal:
 * login -> vale con kit -> autorizacion parcial -> preparacion ->
 * entrega parcial con firma -> devolucion -> inventario -> Reyna -> exportacion.
 *
 *   node --test test/
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3400 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-vales-'));
let servidor;

const cookies = new Map();

async function api(metodo, ruta, cuerpo, sesion = 'default') {
  const headers = { 'Content-Type': 'application/json' };
  if (cookies.get(sesion)) headers.Cookie = cookies.get(sesion);
  const res = await fetch(BASE + ruta, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of set) {
    const val = c.split(';')[0];
    if (val.endsWith('=')) cookies.delete(sesion);
    else cookies.set(sesion, val);
  }
  const texto = await res.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  return { status: res.status, datos };
}

before(async () => {
  const env = { ...process.env, DATA_DIR, PORT: String(PORT), NODE_NO_WARNINGS: '1' };
  const seed = spawn(process.execPath, ['server/seed.js', '--reset'], { env, stdio: 'ignore' });
  await new Promise((r) => seed.on('exit', r));

  servidor = spawn(process.execPath, ['server/index.js'], { env, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/api/auth/estado`);
      return;
    } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('El servidor no inicio');
});

after(() => {
  if (servidor) servidor.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('sin sesion no se accede a la informacion', async () => {
  const { status } = await api('GET', '/api/vales', undefined, 'anonimo');
  assert.equal(status, 401);
});

test('el PIN incorrecto no permite entrar', async () => {
  const { status } = await api('POST', '/api/auth/login-pin',
    { employee_id: 'EMP-001', pin: '999999' }, 'malo');
  assert.equal(status, 401);
});

test('flujo completo de un vale con kit', async () => {
  // 1. El trabajador entra con ID + PIN
  const login = await api('POST', '/api/auth/login-pin', { employee_id: 'EMP-001', pin: '300001' }, 'trabajador');
  assert.equal(login.status, 200);
  assert.equal(login.datos.user.rol, 'TRABAJADOR');
  const areaTrabajador = login.datos.user.area_id;

  // El trabajador no ve costos.
  const catalogo = await api('GET', '/api/materiales?limit=5', undefined, 'trabajador');
  assert.equal(catalogo.status, 200);
  assert.equal(catalogo.datos.materiales[0].costo, undefined);

  // Busqueda por alias: "tornillo chico" debe encontrar el nombre oficial.
  const alias = await api('GET', '/api/materiales?q=tornillo%20chico', undefined, 'trabajador');
  assert.ok(alias.datos.materiales.some((m) => m.nombre.includes('Tornillo autorroscante')));

  // 2. Crea un vale con un kit del area mas un material suelto
  const cats = await api('GET', '/api/catalogos', undefined, 'trabajador');
  const trailer = cats.datos.trailers[0];
  const kits = await api('GET', '/api/kits', undefined, 'trabajador');
  const kit = kits.datos.kits.find((k) => k.area_id === areaTrabajador && k.version_id) || kits.datos.kits[0];
  const kitDetalle = await api('GET', `/api/kits/version/${kit.version_id}`, undefined, 'trabajador');
  const primerItem = kitDetalle.datos.items[0];

  const creado = await api('POST', '/api/vales', {
    trailer_id: trailer.id,
    kits: [{
      kit_id: kit.id,
      // El trabajador ajusta la cantidad SOLO para este vale.
      items: [{ material_id: primerItem.material_id, cantidad: primerItem.cantidad_estandar + 7 }]
    }],
    items: [{ material_id: catalogo.datos.materiales[0].id, cantidad: 3 }]
  }, 'trabajador');

  assert.equal(creado.status, 200);
  assert.match(creado.datos.folio, /^PT-\d{4}-\d{6}$/);
  const valeId = creado.datos.id;

  const lineaAjustada = creado.datos.items.find((i) => i.material_id === primerItem.material_id);
  assert.equal(lineaAjustada.cantidad_estandar, primerItem.cantidad_estandar, 'se conserva la cantidad estandar del kit');
  assert.equal(lineaAjustada.cantidad_solicitada, primerItem.cantidad_estandar + 7, 'se guarda lo que pidio el trabajador');
  assert.equal(creado.datos.vale.estado, 'PENDIENTE');

  // El kit maestro no cambio.
  const kitTrasVale = await api('GET', `/api/kits/version/${kit.version_id}`, undefined, 'trabajador');
  assert.equal(kitTrasVale.datos.items[0].cantidad_estandar, primerItem.cantidad_estandar);

  // El trabajador no puede autorizar su propio vale.
  const intento = await api('POST', `/api/vales/${valeId}/autorizar`, { decision: 'APROBAR' }, 'trabajador');
  assert.equal(intento.status, 403);

  // 3. El supervisor autoriza parcialmente
  const sup = await api('POST', '/api/auth/login-pin', { employee_id: 'SUP-01', pin: '100001' }, 'supervisor');
  assert.equal(sup.status, 200);

  const detalle = await api('GET', `/api/vales/${valeId}`, undefined, 'supervisor');
  assert.equal(detalle.status, 200);
  const lineas = detalle.datos.items.map((i) => ({
    id: i.id,
    cantidad_autorizada: i.id === lineaAjustada.id ? i.cantidad_solicitada - 2 : i.cantidad_solicitada
  }));

  // No se puede autorizar mas de lo solicitado.
  const exceso = await api('POST', `/api/vales/${valeId}/autorizar`, {
    decision: 'PARCIAL',
    lineas: [{ id: lineaAjustada.id, cantidad_autorizada: lineaAjustada.cantidad_solicitada + 5 }]
  }, 'supervisor');
  assert.equal(exceso.status, 400);

  const autorizado = await api('POST', `/api/vales/${valeId}/autorizar`,
    { decision: 'PARCIAL', lineas }, 'supervisor');
  assert.equal(autorizado.status, 200);
  assert.equal(autorizado.datos.estado, 'APROBADO_PARCIAL');

  // 4. El almacen prepara y entrega parcialmente
  const alm = await api('POST', '/api/auth/login-pin', { employee_id: 'ALM-01', pin: '200001' }, 'almacen');
  assert.equal(alm.status, 200);

  const cola = await api('GET', '/api/almacen/cola', undefined, 'almacen');
  assert.ok(cola.datos.nuevos.some((v) => v.id === valeId));

  await api('POST', `/api/almacen/vales/${valeId}/estado`, { estado: 'EN_PREPARACION' }, 'almacen');
  await api('POST', `/api/almacen/vales/${valeId}/estado`, { estado: 'PREPARADO' }, 'almacen');

  const prep = await api('GET', `/api/almacen/vales/${valeId}/preparacion`, undefined, 'almacen');
  const objetivo = prep.datos.lineas.find((l) => l.id === lineaAjustada.id);
  const inventarioAntes = await api('GET', `/api/materiales/${objetivo.material_id}`, undefined, 'almacen');
  const stockAntes = inventarioAntes.datos.material.stock_fisico;

  // Sin firma no hay entrega.
  const sinFirma = await api('POST', `/api/almacen/vales/${valeId}/entregar`, {
    receptor_nombre: 'Receptor Demo',
    lineas: [{ vale_item_id: objetivo.id, cantidad: 1 }]
  }, 'almacen');
  assert.equal(sinFirma.status, 400);

  const firma = 'data:image/png;base64,' + Buffer.from(`firma-unica-${Date.now()}-${'x'.repeat(500)}`).toString('base64');
  const entregaParcial = Math.max(1, objetivo.por_surtir - 2);
  const entrega = await api('POST', `/api/almacen/vales/${valeId}/entregar`, {
    receptor_nombre: 'Receptor Demo',
    firma,
    lineas: [{ vale_item_id: objetivo.id, cantidad: entregaParcial }]
  }, 'almacen');
  assert.equal(entrega.status, 200);
  assert.equal(entrega.datos.tipo, 'PARCIAL');
  assert.equal(entrega.datos.vale.estado, 'ENTREGA_PARCIAL');

  // No se permite reutilizar una firma anterior.
  const repetida = await api('POST', `/api/almacen/vales/${valeId}/entregar`, {
    receptor_nombre: 'Receptor Demo', firma,
    lineas: [{ vale_item_id: objetivo.id, cantidad: 1 }]
  }, 'almacen');
  assert.equal(repetida.status, 409);

  // 5. El inventario solo baja al entregar fisicamente
  const inventarioDespues = await api('GET', `/api/materiales/${objetivo.material_id}`, undefined, 'almacen');
  assert.equal(inventarioDespues.datos.material.stock_fisico, stockAntes - entregaParcial);

  // 6. Se conservan las cuatro cantidades
  const final = await api('GET', `/api/vales/${valeId}`, undefined, 'almacen');
  const linea = final.datos.items.find((i) => i.id === lineaAjustada.id);
  assert.equal(linea.cantidad_estandar, primerItem.cantidad_estandar);
  assert.equal(linea.cantidad_solicitada, primerItem.cantidad_estandar + 7);
  assert.equal(linea.cantidad_autorizada, primerItem.cantidad_estandar + 5);
  assert.equal(linea.cantidad_entregada, entregaParcial);
  assert.equal(linea.pendiente, linea.cantidad_autorizada - entregaParcial);
  assert.ok(final.datos.entregas[0].firma.startsWith('data:image/png;base64,'));

  // 7. Devolucion confirmada por el almacen
  const devolucion = await api('POST', `/api/almacen/vales/${valeId}/devolucion`, {
    motivo: 'Material sobrante',
    lineas: [{ vale_item_id: linea.id, cantidad: 1 }]
  }, 'almacen');
  assert.equal(devolucion.status, 200);
  const trasDevolucion = await api('GET', `/api/materiales/${objetivo.material_id}`, undefined, 'almacen');
  assert.equal(trasDevolucion.datos.material.stock_fisico, stockAntes - entregaParcial + 1);
});

test('un trabajador no puede ver los vales de otros', async () => {
  await api('POST', '/api/auth/login-pin', { employee_id: 'EMP-002', pin: '300002' }, 'otro');
  const mios = await api('GET', '/api/vales', undefined, 'otro');
  assert.ok(mios.datos.vales.every((v) => v.trabajador_clave === 'EMP-002'));
});

test('el usuario de la empresa externa solo ve su informacion', async () => {
  await api('POST', '/api/auth/login-pin', { employee_id: 'RNA-001', pin: '400001' }, 'reyna');
  const vales = await api('GET', '/api/vales', undefined, 'reyna');
  assert.ok(vales.datos.vales.every((v) => v.empresa === 'REYNA'));
});

test('el consumo de la empresa externa conserva precio historico e importe', async () => {
  await api('POST', '/api/auth/login-pin', { employee_id: 'ALM-01', pin: '200001' }, 'almacen2');
  const estado = await api('GET', '/api/reyna/estado-cuenta', undefined, 'almacen2');
  assert.equal(estado.status, 200);
  assert.ok(estado.datos.lineas.length > 0);
  for (const l of estado.datos.lineas.slice(0, 20)) {
    assert.equal(typeof l.precio, 'number');
    assert.equal(typeof l.importe, 'number');
  }
  // El cierre de un periodo ya cerrado no se repite.
  const cierres = await api('GET', '/api/reyna/cierres', undefined, 'almacen2');
  if (cierres.datos.cierres.length) {
    const repetido = await api('POST', '/api/reyna/cierres',
      { periodo: cierres.datos.cierres[0].periodo }, 'almacen2');
    assert.equal(repetido.status, 409);
  }
});

test('el dashboard ejecutivo entrega KPIs y graficas', async () => {
  await api('POST', '/api/auth/login', { usuario: 'direccion@demo.local', password: 'Demo.Direccion.2026' }, 'direccion');
  const dash = await api('GET', '/api/dashboard', undefined, 'direccion');
  assert.equal(dash.status, 200);
  assert.ok(dash.datos.kpis.valor_inventario > 0);
  assert.ok(dash.datos.graficas.consumo_mensual.length > 0);
  assert.ok(dash.datos.graficas.top_materiales.length > 0);

  // Direccion consulta, pero no configura.
  const intento = await api('PUT', '/api/admin/configuracion', { configuracion: { moneda: 'USD' } }, 'direccion');
  assert.equal(intento.status, 403);
});

test('el administrador configura el sistema sin tocar codigo', async () => {
  const login = await api('POST', '/api/auth/login', { usuario: 'admin@demo.local', password: 'Demo.Admin.2026' }, 'admin');
  assert.equal(login.status, 200);

  const cfg = await api('PUT', '/api/admin/configuracion',
    { configuracion: { anomalia_factor: '3.0' }, motivo: 'Prueba automatizada' }, 'admin');
  assert.equal(cfg.status, 200);

  // El cambio quedo en auditoria.
  const auditoria = await api('GET', '/api/auditoria?accion=CONFIGURACION', undefined, 'admin');
  assert.ok(auditoria.datos.registros.some((a) => a.entidad_id === 'anomalia_factor'));

  // Alta de material y de un alias nuevo.
  const cats = await api('GET', '/api/catalogos', undefined, 'admin');
  const material = await api('POST', '/api/materiales', {
    sku: 'TEST-9001', nombre: 'Material de prueba', unidad_id: cats.datos.unidades[0].id,
    costo: 100, stock_min: 5, punto_reorden: 10, alias: ['prueba rapida']
  }, 'admin');
  assert.equal(material.status, 200);

  const busqueda = await api('GET', '/api/materiales?q=prueba%20rapida', undefined, 'admin');
  assert.ok(busqueda.datos.materiales.some((m) => m.sku === 'TEST-9001'));

  // Nueva version de kit sin alterar los vales historicos.
  const kits = await api('GET', '/api/kits', undefined, 'admin');
  const kit = kits.datos.kits[0];
  const detalle = await api('GET', `/api/kits/${kit.id}`, undefined, 'admin');
  const usosPrevios = detalle.datos.versiones[0].usos;
  const nueva = await api('POST', `/api/kits/${kit.id}/versiones`, {
    notas: 'Prueba automatizada',
    items: detalle.datos.items.map((i) => ({ material_id: i.material_id, cantidad_estandar: i.cantidad_estandar + 1 }))
  }, 'admin');
  assert.equal(nueva.status, 200);
  assert.equal(nueva.datos.version, kit.version + 1);

  const trasVersion = await api('GET', `/api/kits/${kit.id}`, undefined, 'admin');
  const anterior = trasVersion.datos.versiones.find((v) => v.version === kit.version);
  assert.equal(anterior.estado, 'HISTORICA');
  assert.equal(anterior.usos, usosPrevios, 'los vales historicos conservan su version');
});

test('una actualizacion parcial no borra los demas datos', async () => {
  // Desactivar un kit no debe perder su area ni su descripcion.
  const kits = await api('GET', '/api/kits?incluir_inactivos=1', undefined, 'admin');
  const kit = kits.datos.kits.find((k) => k.area_id) || kits.datos.kits[0];
  const antes = await api('GET', `/api/kits/${kit.id}`, undefined, 'admin');

  const apagado = await api('PUT', `/api/kits/${kit.id}`, { activo: false }, 'admin');
  assert.equal(apagado.status, 200);
  const despues = await api('GET', `/api/kits/${kit.id}`, undefined, 'admin');
  assert.equal(despues.datos.kit.activo, 0);
  assert.equal(despues.datos.kit.area_id, antes.datos.kit.area_id, 'conserva el area');
  assert.equal(despues.datos.kit.descripcion, antes.datos.kit.descripcion, 'conserva la descripcion');
  assert.equal(despues.datos.kit.nombre, antes.datos.kit.nombre);
  await api('PUT', `/api/kits/${kit.id}`, { activo: true }, 'admin');

  // Lo mismo al desactivar un usuario: conserva correo, area y supervisor.
  const usuarios = await api('GET', '/api/usuarios?rol=TRABAJADOR', undefined, 'admin');
  const objetivo = usuarios.datos.usuarios.find((u) => u.area_id && u.supervisor_id);
  await api('PUT', `/api/usuarios/${objetivo.id}`, { activo: false }, 'admin');
  const recargado = await api('GET', `/api/usuarios?q=${encodeURIComponent(objetivo.employee_id)}`, undefined, 'admin');
  const u2 = recargado.datos.usuarios.find((u) => u.id === objetivo.id);
  assert.equal(u2.activo, 0);
  assert.equal(u2.area_id, objetivo.area_id, 'conserva el area');
  assert.equal(u2.supervisor_id, objetivo.supervisor_id, 'conserva el supervisor');
  await api('PUT', `/api/usuarios/${objetivo.id}`, { activo: true }, 'admin');
});

test('el almacen nunca entrega mas de lo que hay en existencia', async () => {
  // Con un material agotado, la entrega debe rechazarse.
  const inv = await api('GET', '/api/inventario?semaforo=AGOTADO', undefined, 'admin');
  if (!inv.datos.inventario.length) return; // el demo puede no tener agotados
  const agotado = inv.datos.inventario[0];
  assert.ok(agotado.stock_fisico <= 0);

  const catalogos = await api('GET', '/api/catalogos', undefined, 'admin');
  const creado = await api('POST', '/api/vales', {
    trailer_id: catalogos.datos.trailers[0].id,
    items: [{ material_id: agotado.id, cantidad: 5 }]
  }, 'admin');
  assert.equal(creado.status, 200);

  await api('POST', `/api/vales/${creado.datos.id}/autorizar`, { decision: 'APROBAR' }, 'admin');
  const firma = 'data:image/png;base64,' + Buffer.from(`sin-stock-${Date.now()}-${'y'.repeat(500)}`).toString('base64');
  const entrega = await api('POST', `/api/almacen/vales/${creado.datos.id}/entregar`, {
    receptor_nombre: 'Prueba', firma,
    lineas: [{ vale_item_id: creado.datos.items[0].id, cantidad: 5 }]
  }, 'admin');
  assert.equal(entrega.status, 409, 'debe rechazar por existencia insuficiente');
  assert.match(entrega.datos.error, /insuficiente/i);
});

test('la exportacion a Excel entrega CSV', async () => {
  const res = await fetch(`${BASE}/api/exportar/inventario`, { headers: { Cookie: cookies.get('admin') } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const csv = await res.text();
  assert.ok(csv.split('\n').length > 10);
  assert.ok(csv.includes('SKU'));
});

test('la prediccion y las anomalias responden', async () => {
  const pred = await api('GET', '/api/analitica/prediccion', undefined, 'admin');
  assert.equal(pred.status, 200);
  assert.ok(pred.datos.prediccion.length > 0);
  assert.ok('dias_inventario' in pred.datos.prediccion[0]);

  const anom = await api('GET', '/api/analitica/anomalias', undefined, 'admin');
  assert.equal(anom.status, 200);
  assert.ok(Array.isArray(anom.datos.anomalias));

  const kitsAnalitica = await api('GET', '/api/analitica/kits', undefined, 'admin');
  assert.ok(kitsAnalitica.datos.kits.length > 0);
  assert.ok('variacion_cantidad' in kitsAnalitica.datos.kits[0]);
});

test('la restriccion de red tambien aplica al almacen', async () => {
  // Las redes por defecto incluyen 127.0.0.0/8 y las pruebas corren contra
  // localhost, asi que primero hay que dejar un rango que NO lo incluya.
  const antes = await api('GET', '/api/admin/configuracion', undefined, 'admin');
  const valorPrevio = (clave) => {
    const fila = antes.datos.configuracion.find((c) => c.key === clave);
    return fila ? fila.value : antes.datos.valores_por_defecto[clave];
  };
  const redesOriginales = valorPrevio('redes_permitidas');
  const restriccionOriginal = valorPrevio('restriccion_red_activa');

  const configurar = (configuracion) =>
    api('PUT', '/api/admin/configuracion', { configuracion }, 'admin');

  try {
    await configurar({ restriccion_red_activa: '1', redes_permitidas: '10.99.0.0/16' });

    const almacenFuera = await api('POST', '/api/auth/login-pin',
      { employee_id: 'ALM-01', pin: '200001' }, 'alm-fuera');
    assert.equal(almacenFuera.status, 403, 'el almacen no debe entrar desde fuera de la planta');
    assert.match(almacenFuera.datos.error, /fuera de la red/i);

    const trabajadorFuera = await api('POST', '/api/auth/login-pin',
      { employee_id: 'EMP-001', pin: '300001' }, 'emp-fuera');
    assert.equal(trabajadorFuera.status, 403, 'el trabajador sigue restringido');

    // El supervisor autoriza desde donde sea: no debe quedar restringido.
    const supervisorFuera = await api('POST', '/api/auth/login-pin',
      { employee_id: 'SUP-01', pin: '100001' }, 'sup-fuera');
    assert.equal(supervisorFuera.status, 200, 'el supervisor autoriza desde cualquier red');

    // Desde dentro de la red autorizada, el almacen entra normal.
    await configurar({ redes_permitidas: '127.0.0.0/8' });
    const almacenDentro = await api('POST', '/api/auth/login-pin',
      { employee_id: 'ALM-01', pin: '200001' }, 'alm-dentro');
    assert.equal(almacenDentro.status, 200, 'el almacen si entra desde la planta');
    assert.equal(almacenDentro.datos.user.rol, 'ALMACEN');
  } finally {
    await configurar({
      restriccion_red_activa: restriccionOriginal,
      redes_permitidas: redesOriginales
    });
  }
});

test('cerrar sesion invalida la cookie', async () => {
  await api('POST', '/api/auth/logout', {}, 'admin');
  const despues = await api('GET', '/api/auth/me', undefined, 'admin');
  assert.equal(despues.status, 401);
});
