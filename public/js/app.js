/**
 * Armazon de la aplicacion: sesion, navegacion por rol, cabecera,
 * notificaciones y cierre de sesion por inactividad.
 */
import { api, alPerderSesion } from './api.js';
import { h, vaciar, aviso, avisoError, cargando, iniciales, haceRato, chip } from './ui.js';
import { ruta, resolver, ir, iniciar, caminoActual } from './router.js';
import { icono } from './iconos.js';

export const estado = {
  user: null,
  notificaciones: [],
  // Notificaciones sin leer (el punto de la campana) y vales esperando
  // autorizacion (el numero junto a Autorizaciones). No son lo mismo: el menu
  // decia 1 mientras la pantalla decia 5, y bastaba abrir la campana para que
  // el menu se quedara en 0 con vales todavia esperando.
  pendientes: 0,
  valesPendientes: 0,
  catalogos: null
};

export const puede = (permiso) => !!(estado.user && (
  estado.user.permisos.includes('*') || estado.user.permisos.includes(permiso)
));

// --------------------------------------------------------------------------
// Rutas (cada vista se carga cuando se necesita)
// --------------------------------------------------------------------------
ruta('/acceso', () => import('./views/acceso.js'));
ruta('/', () => import('./views/inicio.js'));
ruta('/mis-vales', () => import('./views/mis-vales.js'));
ruta('/vale/nuevo', () => import('./views/vale-nuevo.js'));
ruta('/vales', () => import('./views/vales.js'));
ruta('/vales/:id', () => import('./views/vale-detalle.js'));
ruta('/autorizaciones', () => import('./views/autorizaciones.js'));
ruta('/almacen', () => import('./views/almacen.js'));
ruta('/almacen/:id', () => import('./views/almacen-preparar.js'));
ruta('/inventario', () => import('./views/inventario.js'));
ruta('/inventario/:id', () => import('./views/material.js'));
ruta('/entradas', () => import('./views/entradas.js'));
ruta('/movimientos', () => import('./views/movimientos.js'));
ruta('/kits', () => import('./views/kits.js'));
ruta('/kits/:id', () => import('./views/kit-detalle.js'));
ruta('/trailers', () => import('./views/trailers.js'));
ruta('/panel', () => import('./views/panel.js'));
ruta('/analitica', () => import('./views/analitica.js'));
ruta('/reyna', () => import('./views/reyna.js'));
ruta('/usuarios', () => import('./views/usuarios.js'));
ruta('/auditoria', () => import('./views/auditoria.js'));
ruta('/configuracion', () => import('./views/configuracion.js'));
ruta('/exportar', () => import('./views/exportar.js'));
ruta('/perfil', () => import('./views/perfil.js'));

// --------------------------------------------------------------------------
// Menu segun el rol
// --------------------------------------------------------------------------
function menu() {
  const u = estado.user;
  if (!u) return [];
  const grupos = [];

  if (u.rol === 'TRABAJADOR') {
    grupos.push({ titulo: 'Vales', items: [
      { camino: '/vale/nuevo', icono: 'mas', texto: 'Crear vale' },
      { camino: '/mis-vales', icono: 'lista', texto: 'Mis vales' }
    ] });
    return grupos;
  }

  const operacion = [];
  if (puede('vales.crear')) operacion.push({ camino: '/vale/nuevo', icono: 'mas', texto: 'Crear vale' });
  if (u.rol === 'SUPERVISOR') {
    operacion.push({ camino: '/autorizaciones', icono: 'check', texto: 'Autorizaciones', badge: 'pendientes' });
  }
  if (puede('vales.preparar')) operacion.push({ camino: '/almacen', icono: 'caja', texto: 'Cola de almacen' });
  if (puede('vales.todos') || u.rol === 'SUPERVISOR') operacion.push({ camino: '/vales', icono: 'documento', texto: 'Vales' });
  if (u.rol === 'SUPERVISOR') operacion.push({ camino: '/mis-vales', icono: 'lista', texto: 'Mis vales' });
  if (operacion.length) grupos.push({ titulo: 'Operacion', items: operacion });

  const almacen = [];
  if (puede('inventario.leer')) almacen.push({ camino: '/inventario', icono: 'etiqueta', texto: 'Inventario' });
  if (puede('inventario.entradas')) almacen.push({ camino: '/entradas', icono: 'entrada', texto: 'Entradas' });
  if (puede('movimientos.leer')) almacen.push({ camino: '/movimientos', icono: 'movimientos', texto: 'Movimientos' });
  if (puede('kits.leer')) almacen.push({ camino: '/kits', icono: 'kit', texto: 'Kits' });
  if (puede('trailers.leer')) almacen.push({ camino: '/trailers', icono: 'camion', texto: 'Trailers' });
  if (almacen.length) grupos.push({ titulo: 'Almacen y catalogo', items: almacen });

  const analisis = [];
  if (puede('dashboard.leer') || u.rol === 'ADMIN') analisis.push({ camino: '/panel', icono: 'panel', texto: 'Panel ejecutivo' });
  if (puede('analitica.leer') || puede('analitica.area')) analisis.push({ camino: '/analitica', icono: 'tendencia', texto: 'Analitica' });
  if (puede('reyna.leer')) analisis.push({ camino: '/reyna', icono: 'edificio', texto: 'Empresa externa' });
  if (puede('exportar')) analisis.push({ camino: '/exportar', icono: 'descargar', texto: 'Exportar' });
  if (analisis.length) grupos.push({ titulo: 'Analisis', items: analisis });

  const admin = [];
  if (puede('usuarios.leer')) admin.push({ camino: '/usuarios', icono: 'usuarios', texto: 'Usuarios' });
  if (puede('auditoria.leer')) admin.push({ camino: '/auditoria', icono: 'lupa', texto: 'Auditoria' });
  if (puede('config.escribir')) admin.push({ camino: '/configuracion', icono: 'ajustes', texto: 'Configuracion' });
  if (admin.length) grupos.push({ titulo: 'Administracion', items: admin });

  return grupos;
}

/** Accesos rapidos de la barra inferior en telefonos. */
function menuInferior() {
  const u = estado.user;
  if (!u) return [];
  if (u.rol === 'TRABAJADOR') {
    return [
      { camino: '/vale/nuevo', icono: 'mas', texto: 'Crear' },
      { camino: '/mis-vales', icono: 'lista', texto: 'Mis vales' },
      { camino: '/perfil', icono: 'persona', texto: 'Perfil' }
    ];
  }
  const items = [];
  const grupos = menu();
  for (const g of grupos) for (const it of g.items) items.push({ ...it, texto: it.texto.split(' ')[0] });
  return items.slice(0, 4).concat([{ camino: '/perfil', icono: 'persona', texto: 'Perfil' }]);
}

// --------------------------------------------------------------------------
// Armazon
// --------------------------------------------------------------------------
let refs = {};

function construirShell() {
  const u = estado.user;
  const lateral = h('aside', { clase: 'lateral', id: 'lateral' },
    h('div', { clase: 'marca' },
      h('div', { clase: 'marca-icono', texto: 'DV' }),
      h('div', { clase: 'marca-texto' },
        h('div', { clase: 'marca-titulo', texto: 'Demo Aplicacion' }),
        h('div', { clase: 'marca-sub', texto: 'Vales e inventario' })
      )
    ),
    h('nav', { clase: 'nav', id: 'nav' }),
    h('div', { clase: 'lateral-pie' },
      h('button', {
        clase: 'usuario-tarjeta', style: 'background:none;border:none;width:100%;cursor:pointer;padding:8px 6px',
        onclick: () => ir('/perfil')
      },
        h('div', { clase: 'avatar', texto: iniciales(u.nombre) }),
        h('div', { clase: 'usuario-datos' },
          h('div', { clase: 'usuario-nombre', texto: u.nombre }),
          h('div', { clase: 'usuario-rol', texto: `${etiquetaRol(u.rol)}${u.empresa === 'REYNA' ? ' - Externa' : ''}` })
        )
      ),
      h('button', { clase: 'btn btn-oscuro btn-bloque', onclick: cerrarSesion }, 'CERRAR SESION')
    )
  );

  const titulo = h('div', {},
    h('h1', { id: 'titulo-vista', texto: 'Demo Aplicacion' }),
    h('div', { clase: 'cabecera-sub', id: 'subtitulo-vista' })
  );

  const cabecera = h('header', { clase: 'cabecera' },
    h('button', {
      clase: 'btn btn-plano btn-icono oculto', id: 'boton-menu', 'aria-label': 'Menu',
      onclick: () => document.getElementById('lateral').classList.toggle('abierto')
    }, icono('menu', 22)),
    titulo,
    h('div', { clase: 'cabecera-acciones' },
      buscadorGlobal(),
      campana(),
      h('button', { clase: 'btn btn-plano btn-icono', title: 'Actualizar', onclick: () => navegar(caminoActual()) }, icono('actualizar', 19))
    )
  );

  const contenido = h('main', { clase: 'contenido', id: 'contenido' }, cargando());

  const shell = h('div', { clase: 'shell' },
    lateral,
    h('div', { clase: 'principal' },
      cabecera,
      contenido,
      h('div', { clase: 'marca-agua' },
        'Demostracion con informacion ficticia. No representa datos reales de ninguna empresa.')
    ),
    h('nav', { clase: 'barra-inferior', id: 'barra-inferior' })
  );

  // campana() ya dejo su punto en refs unas lineas arriba: se conserva, porque
  // si no el aviso de pendientes queda apagado para siempre.
  refs = {
    shell, contenido, titulo: titulo.firstChild, subtitulo: titulo.lastChild, punto: refs.punto
  };
  return shell;
}

const etiquetaRol = (rol) => ({
  ADMIN: 'Administrador general', DIRECCION: 'Direccion', SUPERVISOR: 'Supervisor de area',
  ALMACEN: 'Almacen / inventario', TRABAJADOR: 'Trabajador de planta'
}[rol] || rol);

function pintarMenu() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  vaciar(nav);
  const actual = caminoActual();
  for (const grupo of menu()) {
    nav.appendChild(h('div', { clase: 'nav-grupo' },
      h('div', { clase: 'nav-titulo', texto: grupo.titulo }),
      grupo.items.map((it) => h('button', {
        clase: `nav-item ${actual === it.camino || (it.camino !== '/' && actual.startsWith(it.camino)) ? 'activo' : ''}`,
        onclick: () => {
          document.getElementById('lateral').classList.remove('abierto');
          ir(it.camino);
        }
      },
        h('span', { clase: 'icono' }, icono(it.icono, 19)),
        h('span', { texto: it.texto }),
        it.badge === 'pendientes' && estado.valesPendientes
          ? h('span', { clase: 'nav-badge', texto: String(estado.valesPendientes) }) : null
      ))
    ));
  }

  const inferior = document.getElementById('barra-inferior');
  if (inferior) {
    vaciar(inferior);
    for (const it of menuInferior()) {
      inferior.appendChild(h('button', {
        clase: actual.startsWith(it.camino) ? 'activo' : '',
        onclick: () => ir(it.camino)
      },
        h('span', { clase: 'icono' }, icono(it.icono, 20)),
        h('span', { texto: it.texto })
      ));
    }
  }

  const boton = document.getElementById('boton-menu');
  if (boton) boton.classList.toggle('oculto', window.innerWidth > 820 ? true : false);
}

// --------------------------------------------------------------------------
// Buscador global y notificaciones
// --------------------------------------------------------------------------
function buscadorGlobal() {
  const panel = h('div', { clase: 'buscador-panel oculto' });
  const input = h('input', {
    type: 'search', placeholder: 'Buscar folio, SKU, material, trailer...', 'aria-label': 'Buscador global'
  });
  let temporizador;

  const cerrar = () => panel.classList.add('oculto');
  input.addEventListener('input', () => {
    clearTimeout(temporizador);
    const q = input.value.trim();
    if (q.length < 2) return cerrar();
    temporizador = setTimeout(async () => {
      try {
        const { resultados } = await api.get(`/api/buscar?q=${encodeURIComponent(q)}`);
        vaciar(panel);
        if (!resultados.length) {
          panel.appendChild(h('div', { clase: 'vacio', style: 'padding:24px', texto: 'Sin coincidencias' }));
        }
        for (const r of resultados) {
          panel.appendChild(h('button', {
            clase: 'resultado',
            onclick: () => { cerrar(); input.value = ''; ir(r.ruta); }
          },
            chip(r.tipo, r.tipo === 'VALE' ? 'azul' : r.tipo === 'MATERIAL' ? 'acento' : 'gris'),
            h('div', { style: 'flex:1;min-width:0' },
              h('div', { clase: 'resultado-nombre truncar', texto: r.titulo }),
              h('div', { clase: 'resultado-meta truncar', texto: r.detalle })
            )
          ));
        }
        panel.classList.remove('oculto');
      } catch { /* la busqueda no interrumpe el trabajo */ }
    }, 220);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.buscador-global')) cerrar();
  });

  return h('div', { clase: 'buscador-global buscador' },
    h('span', { clase: 'lupa' }, icono('lupa', 17)), input, panel
  );
}

function campana() {
  const panel = h('div', { clase: 'panel-notificaciones oculto' });
  const punto = h('span', { clase: 'campana-punto oculto' });

  const boton = h('button', {
    clase: 'btn btn-plano btn-icono campana', 'aria-label': 'Notificaciones',
    onclick: async (e) => {
      e.stopPropagation();
      if (!panel.classList.contains('oculto')) return panel.classList.add('oculto');
      await pintarNotificaciones(panel);
      panel.classList.remove('oculto');
    }
  }, icono('campana', 20), punto);

  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.campana-envoltura')) panel.classList.add('oculto');
  });

  refs.punto = punto;
  return h('div', { clase: 'campana-envoltura' }, boton, panel);
}

async function pintarNotificaciones(panel) {
  vaciar(panel);
  panel.appendChild(cargando());
  try {
    const { notificaciones, pendientes } = await api.get('/api/notificaciones');
    estado.notificaciones = notificaciones;
    estado.pendientes = pendientes;
    vaciar(panel);
    panel.appendChild(h('div', { clase: 'tarjeta-cabecera', style: 'padding:12px 16px' },
      h('h3', { texto: 'Notificaciones' }),
      h('button', {
        clase: 'btn btn-plano btn-s', style: 'margin-left:auto',
        onclick: async () => { await api.post('/api/notificaciones/leer-todas'); pintarNotificaciones(panel); actualizarPendientes(); }
      }, 'Marcar leidas')
    ));
    if (!notificaciones.length) {
      panel.appendChild(h('div', { clase: 'vacio', style: 'padding:30px', texto: 'Sin notificaciones' }));
    }
    for (const n of notificaciones) {
      panel.appendChild(h('button', {
        clase: `notificacion ${n.leida_at ? '' : 'no-leida'}`,
        onclick: async () => {
          if (!n.leida_at) await api.post(`/api/notificaciones/${n.id}/leer`).catch(() => {});
          panel.classList.add('oculto');
          actualizarPendientes();
          if (n.vale_id) ir(`/vales/${n.vale_id}`);
        }
      },
        h('div', { clase: 'notificacion-titulo', texto: n.titulo }),
        n.cuerpo ? h('div', { clase: 'notificacion-cuerpo', texto: n.cuerpo }) : null,
        h('div', { clase: 'notificacion-fecha', texto: haceRato(n.created_at) })
      ));
    }
  } catch (err) {
    vaciar(panel);
    panel.appendChild(h('div', { clase: 'vacio', texto: err.message }));
  }
}

export async function actualizarPendientes() {
  // La llaman las vistas tras decidir un vale: el numero del menu tiene que
  // bajar en ese momento, no diez segundos despues.
  actualizarValesPendientes();
  try {
    const { notificaciones_pendientes } = await api.get('/api/auth/me');
    estado.pendientes = notificaciones_pendientes;
    if (refs.punto) refs.punto.classList.toggle('oculto', !notificaciones_pendientes);
    pintarMenu();
  } catch { /* la sesion caduca por su propia via */ }
}

// --------------------------------------------------------------------------
// Notificaciones en vivo
//
// La aplicacion pregunta sola cada pocos segundos mientras la pestana esta a
// la vista, para que el supervisor se entere de un vale nuevo sin recargar.
// Es aditivo: si la consulta falla no se muestra ningun error y todo lo demas
// sigue funcionando igual que antes.
// --------------------------------------------------------------------------
const MS_ENTRE_CONSULTAS = 10000;
let temporizadorNotificaciones = null;
// id mas alto ya conocido. En null todavia no hay linea base: la primera
// consulta solo la establece, para no anunciar el historial al entrar.
let ultimaNotificacionVista = null;
let audio = null;

/** Tono corto generado en el navegador: no hay archivos de sonido que cargar. */
function sonarAviso() {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    audio = audio || new Contexto();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const t0 = audio.currentTime;
    const oscilador = audio.createOscillator();
    const volumen = audio.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.setValueAtTime(880, t0);
    oscilador.frequency.setValueAtTime(1175, t0 + 0.09);
    volumen.gain.setValueAtTime(0.0001, t0);
    volumen.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    oscilador.connect(volumen).connect(audio.destination);
    oscilador.start(t0);
    oscilador.stop(t0 + 0.28);
  } catch { /* el sonido es un extra y nunca debe romper la aplicacion */ }
}

function vibrarAviso() {
  try { if (navigator.vibrate) navigator.vibrate([90, 60, 90]); } catch { /* opcional */ }
}

/** Vales esperando la decision del supervisor, para el numero del menu. */
async function actualizarValesPendientes() {
  if (!estado.user || !puede('vales.autorizar')) return;
  try {
    const { pendientes } = await api.get('/api/vales/resumen');
    if (pendientes !== estado.valesPendientes) {
      estado.valesPendientes = pendientes;
      pintarMenu();
    }
  } catch { /* se reintenta en la vuelta siguiente */ }
}

async function consultarNotificaciones() {
  if (!estado.user) return;
  actualizarValesPendientes();
  try {
    const { notificaciones, pendientes } = await api.get('/api/notificaciones');
    estado.notificaciones = notificaciones;
    estado.pendientes = pendientes;
    if (refs.punto) refs.punto.classList.toggle('oculto', !pendientes);
    pintarMenu();

    const maximo = notificaciones.reduce((may, n) => Math.max(may, n.id), 0);
    if (ultimaNotificacionVista === null) { ultimaNotificacionVista = maximo; return; }

    const nuevas = notificaciones.filter((n) => n.id > ultimaNotificacionVista);
    if (!nuevas.length) {
      if (refrescoPendiente) refrescarVistaAbierta();
      return;
    }
    ultimaNotificacionVista = maximo;

    // Llegan de la mas reciente a la mas vieja: se muestran al reves para que
    // la ultima que aparece sea la mas nueva. Como mucho tres, para no tapar
    // la pantalla si se acumularon varias.
    for (const n of nuevas.slice(0, 3).reverse()) {
      aviso(n.cuerpo ? `${n.titulo}: ${n.cuerpo}` : n.titulo, 'ok');
    }
    sonarAviso();
    vibrarAviso();
    refrescarVistaAbierta();
  } catch { /* sin conexion o sesion caida: se reintenta en la siguiente vuelta */ }
}

// Vistas que saben recargar su lista sin rearmar la pantalla. La vista se
// registra al pintarse y navegar() lo limpia al cambiar de pantalla, para no
// recargar una que ya no esta a la vista.
let recargarVistaActual = null;
let refrescoPendiente = false;
export const alLlegarNotificacion = (fn) => { recargarVistaActual = fn; };

/**
 * Recarga la lista que el usuario tiene delante, si esa pantalla sabe hacerlo.
 * Nunca mientras hay una ventana abierta (una decision, un formulario, una
 * firma a medias): se deja para la vuelta siguiente. Si la recarga falla, la
 * lista se queda como estaba y no se muestra ningun error.
 */
async function refrescarVistaAbierta() {
  if (!recargarVistaActual) return;
  // A media accion no se toca la pantalla: queda pendiente y se hace en cuanto
  // la persona cierre lo que tenia abierto.
  if (document.querySelector('#capas .velo')) { refrescoPendiente = true; return; }
  refrescoPendiente = false;
  const desplazamiento = window.scrollY;
  try {
    await recargarVistaActual();
    window.scrollTo(0, desplazamiento);
  } catch { /* se reintenta cuando llegue la siguiente notificacion */ }
}

export function iniciarNotificacionesEnVivo() {
  detenerNotificacionesEnVivo();
  if (!estado.user || document.hidden) return;
  consultarNotificaciones();
  temporizadorNotificaciones = setInterval(consultarNotificaciones, MS_ENTRE_CONSULTAS);
}

export function detenerNotificacionesEnVivo() {
  clearInterval(temporizadorNotificaciones);
  temporizadorNotificaciones = null;
}

// Con la pestana en segundo plano no se consulta nada, para no gastar bateria
// en los iPads de planta. Al volver se consulta de inmediato.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) detenerNotificacionesEnVivo();
  else iniciarNotificacionesEnVivo();
});

// --------------------------------------------------------------------------
// Cierre de sesion e inactividad
// --------------------------------------------------------------------------
let temporizadorInactividad = null;

function vigilarInactividad() {
  clearTimeout(temporizadorInactividad);
  if (!estado.user || estado.user.sesion_kind !== 'PIN') return;
  // En los iPads compartidos la sesion se cierra sola tras la inactividad.
  temporizadorInactividad = setTimeout(async () => {
    await cerrarSesion(true);
    aviso('Sesion cerrada por inactividad. Vuelva a ingresar su PIN.');
  }, 5 * 60 * 1000);
}

for (const evento of ['click', 'keydown', 'touchstart', 'pointerdown', 'scroll']) {
  document.addEventListener(evento, () => { if (estado.user) vigilarInactividad(); }, { passive: true });
}

export async function cerrarSesion(silencioso = false) {
  try { await api.post('/api/auth/logout'); } catch { /* la cookie se limpia igual */ }
  estado.user = null;
  estado.notificaciones = [];
  estado.valesPendientes = 0;
  detenerNotificacionesEnVivo();
  ultimaNotificacionVista = null;
  clearTimeout(temporizadorInactividad);
  ir('/acceso', { reemplazar: true });
  if (!silencioso) aviso('Sesion cerrada');
}

alPerderSesion(() => {
  if (!estado.user) return;
  estado.user = null;
  detenerNotificacionesEnVivo();
  ultimaNotificacionVista = null;
  ir('/acceso', { reemplazar: true });
  avisoError('Su sesion expiro. Ingrese nuevamente.');
});

// --------------------------------------------------------------------------
// Navegacion
// --------------------------------------------------------------------------
export function tituloVista(titulo, subtitulo = '') {
  if (refs.titulo) refs.titulo.textContent = titulo;
  if (refs.subtitulo) refs.subtitulo.textContent = subtitulo;
  document.title = `${titulo} - Demo Aplicacion`;
}

const INICIO_POR_ROL = {
  TRABAJADOR: '/mis-vales',
  SUPERVISOR: '/autorizaciones',
  ALMACEN: '/almacen',
  ADMIN: '/panel',
  DIRECCION: '/panel'
};

async function navegar(camino) {
  const app = document.getElementById('app');
  recargarVistaActual = null;
  refrescoPendiente = false;

  // Sin sesion solo existe la pantalla de acceso.
  if (!estado.user) {
    if (camino !== '/acceso') return ir('/acceso', { reemplazar: true });
    const modulo = await import('./views/acceso.js');
    vaciar(app);
    app.appendChild(await modulo.render({ alEntrar: entrar }));
    return;
  }

  if (camino === '/acceso') return ir(INICIO_POR_ROL[estado.user.rol] || '/', { reemplazar: true });
  if (camino === '/') return ir(INICIO_POR_ROL[estado.user.rol] || '/mis-vales', { reemplazar: true });

  if (!refs.shell || !refs.shell.isConnected) {
    vaciar(app);
    app.appendChild(construirShell());
  }
  pintarMenu();

  const destino = resolver(camino);
  const contenido = document.getElementById('contenido');
  vaciar(contenido);
  contenido.appendChild(cargando());
  window.scrollTo(0, 0);

  if (!destino) {
    vaciar(contenido);
    tituloVista('Pagina no encontrada');
    contenido.appendChild(h('div', { clase: 'vacio' },
      h('div', { clase: 'vacio-icono' }, icono('lupa', 38)),
      h('div', { clase: 'vacio-titulo', texto: 'Esa pagina no existe' }),
      h('button', { clase: 'btn btn-primario mt', onclick: () => ir('/') }, 'Volver al inicio')
    ));
    return;
  }

  try {
    const modulo = await destino.cargador();
    const vista = await modulo.render({ params: destino.params, estado, ir });
    vaciar(contenido);
    contenido.appendChild(vista);
    vigilarInactividad();
  } catch (err) {
    if (err && err.status === 401) return;
    vaciar(contenido);
    contenido.appendChild(h('div', { clase: 'aviso rojo' },
      h('div', { clase: 'aviso-titulo', texto: 'No se pudo mostrar la informacion' }),
      h('div', { texto: err.message || String(err) })
    ));
    contenido.appendChild(h('button', { clase: 'btn mt', onclick: () => navegar(camino) }, 'Reintentar'));
  }
}

async function entrar(user) {
  estado.user = user;
  const destino = INICIO_POR_ROL[user.rol] || '/mis-vales';
  ir(destino, { reemplazar: true });
  ultimaNotificacionVista = null;
  iniciarNotificacionesEnVivo();
}

// --------------------------------------------------------------------------
// Arranque
// --------------------------------------------------------------------------
async function arrancar() {
  try {
    const { user, notificaciones_pendientes } = await api.get('/api/auth/me');
    estado.user = user;
    estado.pendientes = notificaciones_pendientes;
  } catch { estado.user = null; }

  iniciar(navegar);
  if (estado.user) iniciarNotificacionesEnVivo();

  window.addEventListener('online', () => aviso('Conexion restablecida', 'ok'));
  window.addEventListener('offline', () => avisoError('SIN CONEXION. No se podran registrar operaciones.'));
  window.addEventListener('resize', pintarMenu);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* la PWA es opcional */ });
  }
}

arrancar();
