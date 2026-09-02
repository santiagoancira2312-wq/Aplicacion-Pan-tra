/**
 * Panel ejecutivo para Direccion y Administracion.
 * Se actualiza conforme se registran los movimientos.
 */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, kpi, chip, chipEstado, numero, moneda, monedaCorta,
  fechaHora, haceRato, cargando, tabla, semaforo, vacio, disponible
} from '../ui.js';
import { barras, linea, barrasHorizontales, dona, leyenda, PALETA } from '../graficas.js';
import { tituloVista, puede } from '../app.js';
import { ir } from '../router.js';

export async function render() {
  tituloVista('Panel ejecutivo', 'Indicadores en tiempo real de vales, inventario y consumo');

  const contenedor = h('div', { clase: 'columna' });
  const { kpis, graficas, actividad, generado } = await api.get('/api/dashboard');
  const verCostos = puede('costos.leer');

  // ------------------------------------------------------------- KPIs
  const tarjetas = [];
  if (verCostos) tarjetas.push(kpi('Valor del inventario', monedaCorta(kpis.valor_inventario), `${numero(kpis.materiales)} materiales`, 'acento'));
  if (verCostos) tarjetas.push(kpi('Consumo del mes', monedaCorta(kpis.consumo_mensual), `Hoy ${monedaCorta(kpis.consumo_hoy)}`, 'azul'));
  if (verCostos) tarjetas.push(kpi('Consumo semanal', monedaCorta(kpis.consumo_semanal), 'Ultimos 7 dias'));
  if (verCostos) tarjetas.push(kpi('Por cobrar a empresa externa', monedaCorta(kpis.reyna_por_cobrar), 'Consumo no cerrado', 'verde'));
  tarjetas.push(kpi('Vales hoy', numero(kpis.vales_hoy), `${numero(kpis.vales_total)} en total`));
  tarjetas.push(kpi('Pendientes de autorizar', numero(kpis.vales_pendientes), 'Esperan al supervisor', kpis.vales_pendientes ? 'ambar' : ''));
  tarjetas.push(kpi('En almacen', numero(kpis.vales_aprobados + kpis.vales_en_almacen), 'Aprobados y en preparacion'));
  tarjetas.push(kpi('Entregas parciales', numero(kpis.entregas_parciales), 'Vales abiertos', kpis.entregas_parciales ? 'ambar' : ''));
  tarjetas.push(kpi('Materiales bajo minimo', numero(kpis.materiales_bajo_minimo), `${numero(kpis.materiales_agotados)} agotados`,
    kpis.materiales_agotados ? 'rojo' : 'ambar'));
  tarjetas.push(kpi('Trailers activos', numero(kpis.trailers_activos), 'En proceso o planeados'));

  contenedor.appendChild(h('div', { clase: 'rejilla c4' }, tarjetas));

  // --------------------------------------------------------- Graficas
  if (verCostos && graficas.consumo_mensual && graficas.consumo_mensual.length) {
    contenedor.appendChild(tarjeta('Consumo mensual (interno y empresa externa)',
      h('div', {},
        barras(graficas.consumo_mensual.map((m) => ({ etiqueta: mesCorto(m.periodo), interna: m.interna, reyna: m.reyna })), {
          formato: monedaCorta,
          series: [
            { clave: 'interna', color: 'var(--acento)' },
            { clave: 'reyna', color: 'var(--azul)' }
          ],
          etiqueta: 'Consumo mensual por empresa'
        }),
        leyenda([
          { color: 'var(--acento)', texto: 'Consumo interno' },
          { color: 'var(--azul)', texto: 'Empresa externa' }
        ])
      )
    ));
  }

  contenedor.appendChild(h('div', { clase: 'rejilla c2' },
    tarjeta('Tendencia de los ultimos 30 dias',
      linea(graficas.tendencia_semanal.map((d) => ({ etiqueta: diaCorto(d.dia), valor: verCostos ? d.importe : d.vales })), {
        formato: verCostos ? monedaCorta : numero,
        etiqueta: 'Tendencia de consumo'
      })),
    tarjeta('Vales por estado',
      dona(graficas.vales_por_estado.map((v, i) => ({
        etiqueta: (v.estado || '').replace(/_/g, ' '), valor: v.n, color: PALETA[i % PALETA.length]
      })), {
        centro: { valor: numero(kpis.vales_total), etiqueta: 'vales' },
        etiqueta: 'Distribucion de vales por estado'
      }))
  ));

  contenedor.appendChild(h('div', { clase: 'rejilla c2' },
    tarjeta('Top 10 materiales por consumo',
      barrasHorizontales(graficas.top_materiales.map((m) => ({
        etiqueta: m.nombre, valor: verCostos ? m.importe : m.cantidad
      })), { formato: verCostos ? monedaCorta : numero, etiqueta: 'Materiales mas consumidos' })),
    tarjeta('Consumo por area',
      barrasHorizontales(graficas.consumo_por_area.map((a, i) => ({
        etiqueta: a.area, valor: verCostos ? a.importe : a.vales, color: PALETA[i % PALETA.length]
      })), { formato: verCostos ? monedaCorta : numero, etiqueta: 'Consumo por area' }))
  ));

  if (verCostos && graficas.consumo_por_trailer) {
    contenedor.appendChild(tarjeta('Costo por trailer',
      barrasHorizontales(graficas.consumo_por_trailer.map((t) => ({
        etiqueta: `Trailer ${t.numero}${t.cliente ? ' · ' + t.cliente : ''}`, valor: t.importe
      })), { formato: monedaCorta, etiqueta: 'Costo por trailer' })
    ));
  }

  // --------------------------------------------- Tiempos del proceso
  const t = graficas.tiempos || {};
  contenedor.appendChild(tarjeta('Tiempos promedio del proceso',
    h('div', { clase: 'rejilla c4' },
      kpi('Solicitud a autorizacion', minutos(t.solicitud_autorizacion)),
      kpi('Autorizacion a preparacion', minutos(t.autorizacion_preparacion)),
      kpi('Preparacion a entrega', minutos(t.preparacion_entrega)),
      kpi('Ciclo completo', minutos(t.total_ciclo), 'De la solicitud a la entrega', 'acento')
    )
  ));

  // ----------------------------------------------- Inventario critico
  if (graficas.inventario_critico.length) {
    contenedor.appendChild(tarjeta('Inventario que requiere atencion',
      tabla(
        [{ titulo: 'Semaforo' }, { titulo: 'SKU' }, { titulo: 'Material' }, { titulo: 'Fisico', num: true },
          { titulo: 'Disponible', num: true }, { titulo: 'Minimo', num: true }, { titulo: 'Reorden', num: true }],
        graficas.inventario_critico.map((m) => h('tr', { clase: 'clic', onclick: () => ir(`/inventario/${m.id || ''}`) },
          h('td', {}, semaforo(m.semaforo)),
          h('td', { clase: 'mono pequeno', texto: m.sku }),
          h('td', { clase: 'negrita', texto: m.nombre }),
          h('td', { clase: 'num' }, `${numero(m.stock_fisico)} ${m.unidad}`),
          h('td', { clase: 'num' }, disponible(m.disponible, m.unidad)),
          h('td', { clase: 'num silencio', texto: numero(m.stock_min) }),
          h('td', { clase: 'num silencio', texto: numero(m.punto_reorden) })
        )), { compacta: true }
      ), null, { sinRelleno: true }
    ));
  }

  // --------------------------------------------------- Actividad
  if (actividad.length) {
    contenedor.appendChild(tarjeta('Actividad reciente',
      h('div', {}, actividad.map((v) => h('button', {
        clase: 'lista-item', onclick: () => ir(`/vales/${v.id}`)
      },
        h('div', { clase: 'lista-item-cuerpo' },
          h('div', { clase: 'gap-s' },
            h('span', { clase: 'mono negrita', texto: v.folio }),
            chipEstado(v.estado),
            v.empresa === 'REYNA' ? chip('Externa', 'morado') : null
          ),
          h('div', { clase: 'lista-item-sub', texto: `${v.trabajador} · Trailer ${v.trailer}` })
        ),
        h('span', { clase: 'pequeno silencio', texto: haceRato(v.created_at) })
      ))), null, { sinRelleno: true }
    ));
  }

  contenedor.appendChild(h('div', { clase: 'pequeno silencio centrado',
    texto: `Informacion generada ${fechaHora(generado)}` }));

  return contenedor;
}

const minutos = (v) => {
  if (v === null || v === undefined) return '—';
  if (v < 60) return `${numero(v)} min`;
  if (v < 1440) return `${numero(Math.round(v / 6) / 10)} h`;
  return `${numero(Math.round(v / 144) / 10)} d`;
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const mesCorto = (periodo) => {
  const [a, m] = String(periodo).split('-');
  return `${MESES[Number(m) - 1] || m} ${String(a).slice(2)}`;
};
const diaCorto = (d) => {
  const p = String(d).split('-');
  return `${p[2]}/${p[1]}`;
};
