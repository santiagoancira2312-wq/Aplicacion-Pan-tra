/** Analitica: kit estandar contra consumo real, prediccion y anomalias. */
import { api, qs } from '../api.js';
import {
  h, vaciar, tarjeta, kpi, chip, numero, moneda, monedaCorta, fecha, cargando,
  vacio, tabla, pestanas, campo, selector
} from '../ui.js';
import { icono } from '../iconos.js';
import { barrasHorizontales } from '../graficas.js';
import { tituloVista, puede, estado } from '../app.js';

export async function render() {
  tituloVista('Analitica', 'Kits, prediccion de inventario y patrones de consumo');

  const contenedor = h('div', { clase: 'columna' });
  const barra = h('div');
  const cuerpo = h('div');
  const disponibles = [];

  if (puede('analitica.leer') || puede('analitica.area')) disponibles.push({ id: 'kits', texto: 'Kits: estandar vs real' });
  if (puede('inventario.leer')) disponibles.push({ id: 'prediccion', texto: 'Prediccion de inventario' });
  if (puede('analitica.leer')) disponibles.push({ id: 'anomalias', texto: 'Patrones a revisar' });
  if (estado.user.rol === 'SUPERVISOR' || puede('analitica.leer')) disponibles.push({ id: 'area', texto: 'Consumo por area' });

  let actual = disponibles.length ? disponibles[0].id : null;
  contenedor.appendChild(barra);
  contenedor.appendChild(cuerpo);

  const pintarBarra = () => {
    vaciar(barra);
    barra.appendChild(pestanas(disponibles, actual, (id) => { actual = id; pintarBarra(); cargar(); }));
  };
  pintarBarra();
  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(cuerpo);
    cuerpo.appendChild(cargando());
    try {
      if (actual === 'kits') await pintarKits();
      else if (actual === 'prediccion') await pintarPrediccion();
      else if (actual === 'anomalias') await pintarAnomalias();
      else await pintarArea();
    } catch (err) {
      vaciar(cuerpo);
      cuerpo.appendChild(h('div', { clase: 'aviso rojo', texto: err.message }));
    }
  }

  // -------------------------------------------------------------- Kits
  async function pintarKits() {
    const { kits, detalle } = await api.get('/api/analitica/kits');
    vaciar(cuerpo);
    const verCostos = puede('costos.leer');

    if (!kits.length) {
      cuerpo.appendChild(tarjeta(null, vacio('Sin kits utilizados todavia', '', 'kit')));
      return;
    }

    cuerpo.appendChild(tarjeta('Consumo real contra la cantidad estandar del kit',
      tabla(
        [{ titulo: 'Kit' }, { titulo: 'Version' }, { titulo: 'Usos', num: true },
          { titulo: 'Estandar', num: true }, { titulo: 'Solicitado', num: true },
          { titulo: 'Autorizado', num: true }, { titulo: 'Entregado', num: true },
          { titulo: 'Variacion', num: true },
          verCostos ? { titulo: 'Costo estandar', num: true } : null,
          verCostos ? { titulo: 'Costo real', num: true } : null,
          verCostos ? { titulo: 'Diferencia', num: true } : null].filter(Boolean),
        kits.map((k) => h('tr', {},
          h('td', { clase: 'negrita', texto: k.nombre }),
          h('td', {}, chip(`V${k.version}`, 'acento')),
          h('td', { clase: 'num', texto: numero(k.usos) }),
          h('td', { clase: 'num silencio', texto: numero(k.estandar) }),
          h('td', { clase: 'num', texto: numero(k.solicitado) }),
          h('td', { clase: 'num', texto: numero(k.autorizado) }),
          h('td', { clase: 'num negrita', texto: numero(k.entregado) }),
          h('td', { clase: 'num' }, chip(
            `${k.variacion_pct > 0 ? '+' : ''}${numero(k.variacion_pct)}%`,
            k.variacion_pct > 10 ? 'rojo' : k.variacion_pct < -10 ? 'azul' : 'verde')),
          verCostos ? h('td', { clase: 'num mono silencio', texto: moneda(k.costo_estandar) }) : null,
          verCostos ? h('td', { clase: 'num mono', texto: moneda(k.costo_real) }) : null,
          verCostos ? h('td', { clase: 'num mono negrita', style: k.variacion_costo > 0 ? 'color:var(--rojo)' : 'color:var(--verde)' },
            `${k.variacion_costo > 0 ? '+' : ''}${moneda(k.variacion_costo)}`) : null
        ))
      ), null, { sinRelleno: true }
    ));

    const mayores = detalle
      .filter((d) => d.estandar > 0)
      .sort((a, b) => Math.abs(b.variacion_pct) - Math.abs(a.variacion_pct))
      .slice(0, 12);

    if (mayores.length) {
      cuerpo.appendChild(tarjeta('Materiales con mayor desviacion respecto del estandar',
        tabla(
          [{ titulo: 'Kit' }, { titulo: 'Material' }, { titulo: 'Estandar', num: true },
            { titulo: 'Solicitado', num: true }, { titulo: 'Entregado', num: true }, { titulo: 'Variacion', num: true }],
          mayores.map((d) => h('tr', {},
            h('td', { clase: 'pequeno silencio', texto: d.kit }),
            h('td', {}, h('div', { clase: 'negrita', texto: d.material }), h('div', { clase: 'pequeno silencio mono', texto: d.sku })),
            h('td', { clase: 'num silencio', texto: numero(d.estandar) }),
            h('td', { clase: 'num', texto: numero(d.solicitado) }),
            h('td', { clase: 'num negrita', texto: numero(d.entregado) }),
            h('td', { clase: 'num' }, chip(`${d.variacion_pct > 0 ? '+' : ''}${numero(d.variacion_pct)}%`,
              Math.abs(d.variacion_pct) > 25 ? 'ambar' : 'gris'))
          )), { compacta: true }
        ), null, { sinRelleno: true }
      ));
      cuerpo.lastChild.appendChild(h('div', { clase: 'tarjeta-pie' },
        h('span', { clase: 'pequeno silencio',
          texto: 'Una desviacion constante sugiere actualizar la cantidad estandar del kit creando una nueva version.' })));
    }
  }

  // -------------------------------------------------------- Prediccion
  async function pintarPrediccion() {
    const { prediccion, parametros, por_comprar } = await api.get('/api/analitica/prediccion');
    vaciar(cuerpo);

    const criticos = prediccion.filter((p) => p.requiere_compra);
    cuerpo.appendChild(h('div', { clase: 'rejilla c4 mb' },
      kpi('Materiales por comprar', numero(por_comprar), 'Bajo punto de reorden', por_comprar ? 'ambar' : 'verde'),
      kpi('Horizonte corto', `${parametros.dias_corto} dias`, 'Consumo esperado'),
      kpi('Horizonte largo', `${parametros.dias_largo} dias`, 'Consumo esperado'),
      kpi('Materiales analizados', numero(prediccion.length))
    ));

    cuerpo.appendChild(tarjeta('Estimacion de agotamiento y compra sugerida',
      tabla(
        [{ titulo: 'SKU' }, { titulo: 'Material' }, { titulo: 'Existencia', num: true },
          { titulo: 'Consumo diario', num: true }, { titulo: 'Tendencia', num: true },
          { titulo: 'Dias de inventario', num: true }, { titulo: 'Fecha estimada' },
          { titulo: `Esperado ${parametros.dias_corto}d`, num: true },
          { titulo: `Esperado ${parametros.dias_largo}d`, num: true },
          { titulo: 'Compra sugerida', num: true }],
        prediccion.slice(0, 60).map((p) => h('tr', {},
          h('td', { clase: 'mono pequeno', texto: p.sku }),
          h('td', { clase: 'negrita', texto: p.nombre }),
          h('td', { clase: 'num' }, `${numero(p.stock_fisico)} ${p.unidad}`),
          h('td', { clase: 'num', texto: numero(p.consumo_diario) }),
          h('td', { clase: 'num' }, p.tendencia_pct
            ? chip(`${p.tendencia_pct > 0 ? '+' : ''}${numero(p.tendencia_pct)}%`, p.tendencia_pct > 20 ? 'ambar' : 'gris')
            : '—'),
          h('td', { clase: 'num negrita' }, p.dias_inventario === null ? '—' : numero(p.dias_inventario)),
          h('td', { clase: 'pequeno', texto: p.fecha_agotamiento ? fecha(p.fecha_agotamiento) : '—' }),
          h('td', { clase: 'num silencio', texto: numero(p.consumo_esperado_corto) }),
          h('td', { clase: 'num silencio', texto: numero(p.consumo_esperado_largo) }),
          h('td', { clase: 'num' }, p.requiere_compra
            ? chip(numero(p.cantidad_sugerida), 'ambar') : h('span', { clase: 'silencio', texto: '—' }))
        )), { compacta: true }
      ), null, { sinRelleno: true }
    ));
    cuerpo.lastChild.appendChild(h('div', { clase: 'tarjeta-pie' },
      h('span', { clase: 'pequeno silencio',
        texto: 'Metodos sencillos: consumo promedio, media movil ponderada, tendencia reciente, punto de reorden y lead time del proveedor.' })));
  }

  // --------------------------------------------------------- Anomalias
  async function pintarAnomalias() {
    const { anomalias, aviso } = await api.get('/api/analitica/anomalias');
    vaciar(cuerpo);

    cuerpo.appendChild(h('div', { clase: 'aviso' },
      h('div', { clase: 'aviso-titulo', texto: 'Estos indicadores no implican responsabilidad de ninguna persona' }),
      h('div', { texto: aviso })
    ));

    if (!anomalias.length) {
      cuerpo.appendChild(tarjeta(null, vacio('Sin patrones fuera de lo habitual',
        'El consumo se comporta dentro de los rangos esperados.', 'check')));
      return;
    }

    cuerpo.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        anomalias.map((a) => h('div', { clase: 'linea-vale' },
          h('div', { style: 'flex:0 0 90px' },
            chip(a.severidad, a.severidad === 'ALTA' ? 'rojo' : a.severidad === 'MEDIA' ? 'ambar' : 'gris')),
          h('div', { clase: 'linea-vale-datos' },
            h('div', { clase: 'linea-vale-nombre', texto: a.titulo }),
            h('div', { clase: 'linea-vale-meta', texto: a.detalle }),
            h('div', { clase: 'pequeno', style: 'color:var(--acento-fuerte)', texto: a.mensaje })
          ),
          h('div', {}, chip(a.tipo.replace(/_/g, ' '), 'gris'))
        ))
      )
    ));
  }

  // ------------------------------------------------------------- Area
  async function pintarArea() {
    const catalogos = await api.get('/api/catalogos');
    const filtro = h('div');
    let areaId = estado.user.area_id || (catalogos.areas[0] && catalogos.areas[0].id);

    const resultado = h('div');
    if (puede('analitica.leer')) {
      filtro.appendChild(tarjeta('Area', campo('Seleccione el area',
        selector(catalogos.areas.map((a) => ({ valor: a.id, texto: a.nombre })),
          { valor: areaId, onchange: (v) => { areaId = Number(v); pintar(); } }))));
    }

    vaciar(cuerpo);
    cuerpo.appendChild(filtro);
    cuerpo.appendChild(resultado);
    await pintar();

    async function pintar() {
      vaciar(resultado);
      resultado.appendChild(cargando());
      const datos = await api.get('/api/analitica/area' + qs({ area_id: areaId }));
      vaciar(resultado);

      resultado.appendChild(h('div', { clase: 'rejilla c4 mb' },
        kpi('Vales del area', numero(datos.vales.total || 0)),
        kpi('Pendientes', numero(datos.vales.pendientes || 0), '', datos.vales.pendientes ? 'ambar' : ''),
        kpi('Entregados', numero(datos.vales.entregados || 0), '', 'verde'),
        kpi('Rechazados', numero(datos.vales.rechazados || 0))
      ));

      resultado.appendChild(tarjeta(`Materiales mas consumidos en ${datos.area || 'el area'} (90 dias)`,
        datos.consumo.length
          ? barrasHorizontales(datos.consumo.slice(0, 15).map((c) => ({ etiqueta: c.nombre, valor: c.cantidad })),
            { formato: numero, etiqueta: 'Consumo del area' })
          : vacio('Sin consumo registrado', '', 'tendencia')
      ));
    }
  }
}
