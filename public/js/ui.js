/** Utilidades de interfaz: construccion de DOM, formatos, modales y avisos. */
import { icono } from './iconos.js';

// --------------------------------------------------------------------------
// Construccion de elementos (sin innerHTML: el contenido siempre va como texto)
// --------------------------------------------------------------------------
export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'clase') el.className = v;
    else if (k === 'texto') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;            // solo para SVG generado internamente
    else if (k === 'estilo') Object.assign(el.style, v);
    else if (k === 'datos') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'valor') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const hijo of hijos.flat(4)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.appendChild(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

export const vaciar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// --------------------------------------------------------------------------
// Formatos
// --------------------------------------------------------------------------
const fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
const fmtMonedaCorta = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const fmtNumero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

export const moneda = (n) => fmtMoneda.format(Number(n) || 0);
export const monedaCorta = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${fmtNumero.format(v / 1_000_000)} M`;
  if (Math.abs(v) >= 10_000) return `$${fmtNumero.format(Math.round(v / 1000))} k`;
  return fmtMonedaCorta.format(v);
};
export const numero = (n) => fmtNumero.format(Number(n) || 0);

/** Las fechas llegan de SQLite en UTC ("YYYY-MM-DD HH:MM:SS"). */
export function aFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const s = String(valor).trim();
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + (s.length <= 19 ? 'Z' : '');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fecha(valor, conHora = false) {
  const d = aFecha(valor);
  if (!d) return '—';
  const opciones = { day: '2-digit', month: 'short', year: 'numeric' };
  if (conHora) { opciones.hour = '2-digit'; opciones.minute = '2-digit'; }
  return d.toLocaleString('es-MX', opciones);
}

export function fechaHora(valor) { return fecha(valor, true); }

export function haceRato(valor) {
  const d = aFecha(valor);
  if (!d) return '—';
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'hace unos segundos';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  if (seg < 604800) return `hace ${Math.floor(seg / 86400)} d`;
  return fecha(valor);
}

export const iniciales = (nombre) => String(nombre || '?')
  .split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();

// --------------------------------------------------------------------------
// Estados
// --------------------------------------------------------------------------
export const ESTADOS = {
  PENDIENTE: { texto: 'Pendiente', color: 'ambar' },
  APROBADO: { texto: 'Aprobado', color: 'azul' },
  APROBADO_PARCIAL: { texto: 'Aprobado parcial', color: 'azul' },
  RECHAZADO: { texto: 'Rechazado', color: 'rojo' },
  CORRECCION: { texto: 'Requiere correccion', color: 'rojo' },
  EN_PREPARACION: { texto: 'En preparacion', color: 'morado' },
  PREPARADO: { texto: 'Preparado', color: 'morado' },
  ENTREGA_PARCIAL: { texto: 'Entrega parcial', color: 'acento' },
  ENTREGADO: { texto: 'Entregado', color: 'verde' },
  CERRADO: { texto: 'Cerrado', color: 'gris' },
  CANCELADO: { texto: 'Cancelado', color: 'gris' }
};

export function chipEstado(estado) {
  const def = ESTADOS[estado] || { texto: estado, color: 'gris' };
  return h('span', { clase: `chip ${def.color}` }, h('span', { clase: 'chip-punto' }), def.texto);
}

export const chip = (texto, color = 'gris') => h('span', { clase: `chip ${color}` }, texto);

export function semaforo(estado) {
  const textos = { NORMAL: 'Normal', BAJO: 'Bajo', CRITICO: 'Critico', AGOTADO: 'Agotado' };
  return h('span', { clase: `semaforo ${estado}` }, textos[estado] || estado);
}

// --------------------------------------------------------------------------
// Avisos flotantes
// --------------------------------------------------------------------------
export function aviso(mensaje, tipo = '') {
  const cont = document.getElementById('avisos');
  const el = h('div', { clase: `toast ${tipo}`, role: 'status' },
    icono(tipo === 'error' ? 'alerta' : tipo === 'ok' ? 'check' : 'documento', 18),
    h('span', { texto: mensaje })
  );
  cont.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s';
    setTimeout(() => el.remove(), 260);
  }, tipo === 'error' ? 6000 : 3400);
}

export const avisoOk = (m) => aviso(m, 'ok');
export const avisoError = (m) => aviso(m, 'error');

// --------------------------------------------------------------------------
// Modales
// --------------------------------------------------------------------------
export function modal({ titulo, cuerpo, acciones = [], ancho = '', alCerrar }) {
  const capas = document.getElementById('capas');
  const velo = h('div', { clase: 'velo' });

  const cerrar = () => {
    velo.remove();
    document.removeEventListener('keydown', escape);
    if (alCerrar) alCerrar();
  };
  const escape = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', escape);

  const pie = acciones.length
    ? h('div', { clase: 'modal-pie' }, acciones.map((a) => h('button', {
      clase: `btn ${a.clase || ''}`,
      onclick: () => { if (a.accion) a.accion(cerrar); else cerrar(); },
      disabled: a.desactivado
    }, a.texto)))
    : null;

  const caja = h('div', { clase: `modal ${ancho}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { clase: 'modal-cabecera' },
      h('h2', { texto: titulo }),
      h('button', { clase: 'btn btn-plano btn-icono', style: 'margin-left:auto', onclick: cerrar, 'aria-label': 'Cerrar' }, icono('cerrar', 19))
    ),
    h('div', { clase: 'modal-cuerpo' }, cuerpo),
    pie
  );

  velo.addEventListener('click', (e) => { if (e.target === velo) cerrar(); });
  velo.appendChild(caja);
  capas.appendChild(velo);
  return { cerrar, caja };
}

export function confirmar({ titulo, mensaje, textoOk = 'Confirmar', claseOk = 'btn-primario' }) {
  return new Promise((resolve) => {
    let decidido = false;
    modal({
      titulo,
      ancho: 'angosto',
      cuerpo: h('p', { texto: mensaje }),
      alCerrar: () => { if (!decidido) resolve(false); },
      acciones: [
        { texto: 'Cancelar', accion: (c) => { decidido = true; c(); resolve(false); } },
        { texto: textoOk, clase: claseOk, accion: (c) => { decidido = true; c(); resolve(true); } }
      ]
    });
  });
}

/** Pide un texto obligatorio (motivos de cierre, ajustes, etc.). */
export function pedirTexto({ titulo, etiqueta, textoOk = 'Guardar', valor = '', multilinea = true }) {
  return new Promise((resolve) => {
    let decidido = false;
    const campo = h(multilinea ? 'textarea' : 'input', { valor, rows: 3 });
    const error = h('div', { clase: 'campo-error oculto', texto: 'Este dato es obligatorio' });
    modal({
      titulo,
      ancho: 'angosto',
      cuerpo: h('div', { clase: 'campo' }, h('label', { texto: etiqueta }), campo, error),
      alCerrar: () => { if (!decidido) resolve(null); },
      acciones: [
        { texto: 'Cancelar', accion: (c) => { decidido = true; c(); resolve(null); } },
        {
          texto: textoOk,
          clase: 'btn-primario',
          accion: (c) => {
            const v = campo.value.trim();
            if (!v) { error.classList.remove('oculto'); campo.focus(); return; }
            decidido = true; c(); resolve(v);
          }
        }
      ]
    });
    setTimeout(() => campo.focus(), 60);
  });
}

// --------------------------------------------------------------------------
// Bloques reutilizables
// --------------------------------------------------------------------------
export const cargando = () => h('div', { clase: 'cargando' }, h('div', { clase: 'girador' }));

export const vacio = (titulo, detalle = '', nombreIcono = 'documento') => h('div', { clase: 'vacio' },
  h('div', { clase: 'vacio-icono' }, icono(nombreIcono, 38)),
  h('div', { clase: 'vacio-titulo', texto: titulo }),
  detalle ? h('div', { texto: detalle }) : null
);

export function kpi(etiqueta, valor, nota = '', clase = '') {
  return h('div', { clase: `kpi ${clase}` },
    h('div', { clase: 'kpi-etiqueta', texto: etiqueta }),
    h('div', { clase: 'kpi-valor', texto: valor }),
    nota ? h('div', { clase: 'kpi-nota', texto: nota }) : null
  );
}

export function tarjeta(titulo, contenido, acciones = null, opciones = {}) {
  return h('div', { clase: 'tarjeta' },
    titulo ? h('div', { clase: 'tarjeta-cabecera' },
      h('h2', { texto: titulo }),
      acciones ? h('div', { clase: 'gap', style: 'margin-left:auto' }, acciones) : null
    ) : null,
    h('div', { clase: `tarjeta-cuerpo ${opciones.sinRelleno ? 'sin-relleno' : ''}` }, contenido)
  );
}

/** Tabla con encabezados; `columnas` acepta {titulo, num, ancho}. */
export function tabla(columnas, filas, opciones = {}) {
  const cuerpo = filas.length
    ? filas
    : [h('tr', {}, h('td', { colspan: columnas.length, clase: 'centrado silencio', style: 'padding:32px' },
      opciones.vacio || 'Sin informacion'))];
  return h('div', { clase: 'tabla-envoltura' },
    h('table', { clase: opciones.compacta ? 'tabla-compacta' : '' },
      h('thead', {}, h('tr', {}, columnas.map((c) => h('th', {
        clase: c.num ? 'num' : '', style: c.ancho ? `width:${c.ancho}` : ''
      }, c.titulo || c)))),
      h('tbody', {}, cuerpo)
    )
  );
}

export function pestanas(items, activa, alCambiar) {
  return h('div', { clase: 'pestanas' }, items.map((it) => h('button', {
    clase: `pestana ${it.id === activa ? 'activa' : ''}`,
    onclick: () => alCambiar(it.id)
  }, it.texto, it.cuenta !== undefined && it.cuenta !== null
    ? h('span', { clase: 'cuenta', texto: String(it.cuenta) }) : null)));
}

/** Las cuatro cantidades que el sistema nunca debe perder. */
export function cantidades(linea, unidad = '') {
  const caja = (et, va, clase) => h('div', { clase: `cantidad-caja ${clase}` },
    h('div', { clase: 'et', texto: et }),
    h('div', { clase: 'va', texto: va === null || va === undefined ? '—' : numero(va) })
  );
  const pendiente = Math.max(0, (linea.cantidad_autorizada || 0) - (linea.cantidad_entregada || 0));
  return h('div', { clase: 'cantidades' },
    linea.cantidad_estandar !== null && linea.cantidad_estandar !== undefined
      ? caja('Estandar', linea.cantidad_estandar, 'estandar') : null,
    caja('Solicitado', linea.cantidad_solicitada, 'solicitado'),
    caja('Autorizado', linea.cantidad_autorizada, 'autorizado'),
    caja('Entregado', linea.cantidad_entregada, 'entregado'),
    pendiente > 0 ? caja('Pendiente', pendiente, 'pendiente') : null,
    unidad ? h('div', { clase: 'cantidad-caja', style: 'border:none' },
      h('div', { clase: 'et', texto: 'Unidad' }), h('div', { clase: 'va', texto: unidad })) : null
  );
}

/** Control tactil de cantidad con botones grandes. */
export function controlCantidad(valor, alCambiar, { min = 0, paso = 1 } = {}) {
  const input = h('input', {
    type: 'number', valor: String(valor), min: String(min), step: String(paso), inputmode: 'decimal',
    onchange: () => {
      let v = Number(input.value);
      if (!Number.isFinite(v) || v < min) v = min;
      input.value = String(v);
      alCambiar(v);
    }
  });
  const ajustar = (delta) => {
    let v = Math.round(((Number(input.value) || 0) + delta) * 1000) / 1000;
    if (v < min) v = min;
    input.value = String(v);
    alCambiar(v);
  };
  return h('div', { clase: 'cantidad-control' },
    h('button', { clase: 'cantidad-btn', type: 'button', onclick: () => ajustar(-paso), 'aria-label': 'Disminuir' }, '−'),
    input,
    h('button', { clase: 'cantidad-btn', type: 'button', onclick: () => ajustar(paso), 'aria-label': 'Aumentar' }, '+')
  );
}

export function campo(etiqueta, control, ayuda = '') {
  return h('div', { clase: 'campo' },
    h('label', { texto: etiqueta }),
    control,
    ayuda ? h('div', { clase: 'campo-ayuda', texto: ayuda }) : null
  );
}

export function selector(opciones, { valor = '', vacio = null, onchange } = {}) {
  const sel = h('select', { onchange: onchange ? (e) => onchange(e.target.value) : null });
  if (vacio !== null) sel.appendChild(h('option', { value: '' }, vacio));
  for (const o of opciones) {
    sel.appendChild(h('option', { value: String(o.valor), selected: String(o.valor) === String(valor) }, o.texto));
  }
  sel.value = String(valor);
  return sel;
}
