/**
 * Graficas en SVG generadas en el propio navegador.
 * Sin librerias externas: la aplicacion no carga recursos de terceros.
 * Los colores salen de las variables del tema, asi funcionan en claro y oscuro.
 */
import { h, numero, monedaCorta } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, props = {}, ...hijos) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'texto') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const hijo of hijos.flat(3)) {
    if (hijo) el.appendChild(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export const PALETA = [
  'var(--acento)', 'var(--azul)', 'var(--verde)', 'var(--morado)',
  'var(--rojo)', 'var(--ambar)', '#4d8f8b', '#8a6d3b', '#5c6673', '#a35a86'
];

const ejeTexto = { fill: 'var(--texto-3)', 'font-size': '11', 'font-family': 'inherit' };

function envoltura(svg, etiqueta) {
  return h('div', { clase: 'grafica', role: 'img', 'aria-label': etiqueta }, svg);
}

/** Escala "bonita" para el eje vertical. */
function escala(max) {
  if (max <= 0) return { max: 1, paso: 1 };
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const m of [1, 2, 2.5, 5, 10]) {
    const paso = base * m;
    if (max / paso <= 4.5) return { max: Math.ceil(max / paso) * paso, paso };
  }
  return { max: Math.ceil(max / base) * base, paso: base };
}

// --------------------------------------------------------------------------
// Barras verticales (una o dos series)
// --------------------------------------------------------------------------
export function barras(datos, { alto = 220, formato = numero, series = null, etiqueta = 'Grafica de barras' } = {}) {
  const W = 720, H = alto, ML = 58, MR = 12, MT = 14, MB = 42;
  const ancho = W - ML - MR;
  const altoUtil = H - MT - MB;
  if (!datos.length) return envoltura(s('svg', { viewBox: `0 0 ${W} ${H}` }), etiqueta);

  const claves = series ? series.map((x) => x.clave) : ['valor'];
  const maximo = Math.max(...datos.map((d) => Math.max(...claves.map((c) => Number(d[c]) || 0))), 0);
  const esc = escala(maximo);
  const y = (v) => MT + altoUtil - (v / esc.max) * altoUtil;

  const paso = ancho / datos.length;
  const anchoGrupo = Math.min(paso * 0.68, 54);
  const anchoBarra = anchoGrupo / claves.length;

  const nodos = [];
  for (let i = 0; i * esc.paso <= esc.max + 0.001; i++) {
    const v = i * esc.paso;
    nodos.push(s('line', { x1: ML, x2: W - MR, y1: y(v), y2: y(v), stroke: 'var(--borde)', 'stroke-width': 1 }));
    nodos.push(s('text', { x: ML - 8, y: y(v) + 4, 'text-anchor': 'end', ...ejeTexto, texto: formato(v) }));
  }

  datos.forEach((d, i) => {
    const x0 = ML + paso * i + (paso - anchoGrupo) / 2;
    claves.forEach((clave, j) => {
      const valor = Number(d[clave]) || 0;
      const altura = Math.max(0, y(0) - y(valor));
      nodos.push(s('rect', {
        x: x0 + j * anchoBarra, y: y(valor), width: Math.max(2, anchoBarra - 3), height: altura,
        rx: 3, fill: series ? series[j].color : PALETA[0]
      }, s('title', { texto: `${d.etiqueta}: ${formato(valor)}` })));
    });
    nodos.push(s('text', {
      x: ML + paso * i + paso / 2, y: H - MB + 18, 'text-anchor': 'middle', ...ejeTexto,
      texto: String(d.etiqueta)
    }));
  });

  return envoltura(s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' }, nodos), etiqueta);
}

// --------------------------------------------------------------------------
// Linea con area
// --------------------------------------------------------------------------
export function linea(datos, { alto = 200, formato = numero, color = 'var(--acento)', etiqueta = 'Tendencia' } = {}) {
  const W = 720, H = alto, ML = 58, MR = 12, MT = 14, MB = 34;
  const ancho = W - ML - MR;
  const altoUtil = H - MT - MB;
  if (datos.length < 2) return envoltura(s('svg', { viewBox: `0 0 ${W} ${H}` }), etiqueta);

  const maximo = Math.max(...datos.map((d) => Number(d.valor) || 0), 0);
  const esc = escala(maximo);
  const x = (i) => ML + (ancho * i) / (datos.length - 1);
  const y = (v) => MT + altoUtil - (v / esc.max) * altoUtil;

  const nodos = [];
  for (let i = 0; i * esc.paso <= esc.max + 0.001; i++) {
    const v = i * esc.paso;
    nodos.push(s('line', { x1: ML, x2: W - MR, y1: y(v), y2: y(v), stroke: 'var(--borde)', 'stroke-width': 1 }));
    nodos.push(s('text', { x: ML - 8, y: y(v) + 4, 'text-anchor': 'end', ...ejeTexto, texto: formato(v) }));
  }

  const puntos = datos.map((d, i) => `${x(i).toFixed(1)},${y(Number(d.valor) || 0).toFixed(1)}`);
  nodos.push(s('polygon', {
    points: `${ML},${y(0)} ${puntos.join(' ')} ${x(datos.length - 1)},${y(0)}`,
    fill: color, opacity: '.13'
  }));
  nodos.push(s('polyline', {
    points: puntos.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round'
  }));

  const cada = Math.ceil(datos.length / 8);
  datos.forEach((d, i) => {
    if (datos.length <= 40) {
      nodos.push(s('circle', { cx: x(i), cy: y(Number(d.valor) || 0), r: 2.6, fill: color },
        s('title', { texto: `${d.etiqueta}: ${formato(d.valor)}` })));
    }
    if (i % cada === 0 || i === datos.length - 1) {
      nodos.push(s('text', { x: x(i), y: H - MB + 18, 'text-anchor': 'middle', ...ejeTexto, texto: String(d.etiqueta) }));
    }
  });

  return envoltura(s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' }, nodos), etiqueta);
}

// --------------------------------------------------------------------------
// Barras horizontales (rankings)
// --------------------------------------------------------------------------
export function barrasHorizontales(datos, { formato = numero, color = 'var(--acento)', etiqueta = 'Ranking' } = {}) {
  if (!datos.length) return h('div', { clase: 'vacio', texto: 'Sin informacion' });
  const maximo = Math.max(...datos.map((d) => Number(d.valor) || 0), 1);
  return h('div', { clase: 'columna', role: 'img', 'aria-label': etiqueta },
    datos.map((d) => h('div', {},
      h('div', { clase: 'gap', style: 'justify-content:space-between;margin-bottom:4px' },
        h('span', { clase: 'truncar', style: 'font-size:13.5px;font-weight:550;max-width:70%', texto: d.etiqueta }),
        h('span', { clase: 'mono pequeno negrita', texto: formato(d.valor) })
      ),
      h('div', { clase: 'barra-progreso' },
        h('div', { estilo: { width: `${Math.max(2, ((Number(d.valor) || 0) / maximo) * 100)}%`, background: d.color || color } })
      )
    ))
  );
}

// --------------------------------------------------------------------------
// Dona
// --------------------------------------------------------------------------
export function dona(datos, { formato = numero, etiqueta = 'Distribucion', centro = null } = {}) {
  const total = datos.reduce((sum, d) => sum + (Number(d.valor) || 0), 0);
  if (!total) return h('div', { clase: 'vacio', texto: 'Sin informacion' });

  const R = 74, r = 47, C = 90;
  let angulo = -Math.PI / 2;
  const nodos = [];

  datos.forEach((d, i) => {
    const porcion = (Number(d.valor) || 0) / total;
    const fin = angulo + porcion * Math.PI * 2;
    const grande = porcion > 0.5 ? 1 : 0;
    const p = (radio, a) => `${(C + radio * Math.cos(a)).toFixed(2)} ${(C + radio * Math.sin(a)).toFixed(2)}`;
    // Un solo segmento del 100% se dibuja como anillo completo.
    const d2 = porcion >= 0.9999
      ? `M ${C - R} ${C} A ${R} ${R} 0 1 1 ${C + R} ${C} A ${R} ${R} 0 1 1 ${C - R} ${C} ` +
        `M ${C - r} ${C} A ${r} ${r} 0 1 0 ${C + r} ${C} A ${r} ${r} 0 1 0 ${C - r} ${C} Z`
      : `M ${p(R, angulo)} A ${R} ${R} 0 ${grande} 1 ${p(R, fin)} L ${p(r, fin)} A ${r} ${r} 0 ${grande} 0 ${p(r, angulo)} Z`;
    nodos.push(s('path', { d: d2, fill: d.color || PALETA[i % PALETA.length], 'fill-rule': 'evenodd' },
      s('title', { texto: `${d.etiqueta}: ${formato(d.valor)} (${Math.round(porcion * 100)}%)` })));
    angulo = fin;
  });

  if (centro) {
    nodos.push(s('text', {
      x: C, y: C - 2, 'text-anchor': 'middle', fill: 'var(--texto)',
      'font-size': '17', 'font-weight': '700', 'font-family': 'inherit', texto: centro.valor
    }));
    nodos.push(s('text', {
      x: C, y: C + 15, 'text-anchor': 'middle', fill: 'var(--texto-3)',
      'font-size': '10.5', 'font-family': 'inherit', texto: centro.etiqueta
    }));
  }

  return h('div', { style: 'display:flex;gap:20px;align-items:center;flex-wrap:wrap' },
    h('div', { clase: 'grafica', style: 'width:180px;flex:none', role: 'img', 'aria-label': etiqueta },
      s('svg', { viewBox: '0 0 180 180' }, nodos)),
    h('div', { clase: 'leyenda', style: 'flex-direction:column;gap:7px;flex:1;min-width:150px' },
      datos.map((d, i) => h('div', { clase: 'leyenda-item' },
        h('span', { clase: 'leyenda-color', estilo: { background: d.color || PALETA[i % PALETA.length] } }),
        h('span', { clase: 'truncar', style: 'flex:1', texto: d.etiqueta }),
        h('span', { clase: 'mono negrita', texto: formato(d.valor) })
      ))
    )
  );
}

export function leyenda(items) {
  return h('div', { clase: 'leyenda' }, items.map((it) => h('div', { clase: 'leyenda-item' },
    h('span', { clase: 'leyenda-color', estilo: { background: it.color } }),
    it.texto
  )));
}

export { monedaCorta };
