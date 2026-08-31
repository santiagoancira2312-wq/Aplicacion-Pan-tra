/** Movimientos de inventario con filtros. Trazabilidad de cada operacion. */
import { api, qs } from '../api.js';
import {
  h, vaciar, tarjeta, chip, numero, moneda, fechaHora, cargando, vacio,
  tabla, campo, selector
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';
import { ir } from '../router.js';

const TIPOS = ['ENTRADA', 'SALIDA', 'DEVOLUCION', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'MERMA', 'DANO', 'CORRECCION'];

export async function render() {
  tituloVista('Movimientos', 'Entradas, salidas, devoluciones y ajustes');

  const catalogos = await api.get('/api/catalogos');
  const filtros = { tipo: '', empresa: '', trailer_id: '', desde: '', hasta: '' };
  const contenedor = h('div', { clase: 'columna' });
  const resultados = h('div');

  contenedor.appendChild(tarjeta('Filtros', h('div', { clase: 'fila' },
    campo('Tipo', selector(TIPOS.map((t) => ({ valor: t, texto: t.replace('_', ' ') })),
      { vacio: 'Todos', onchange: (v) => { filtros.tipo = v; cargar(); } })),
    campo('Empresa', selector([{ valor: 'INTERNA', texto: 'Interna' }, { valor: 'REYNA', texto: 'Externa' }],
      { vacio: 'Todas', onchange: (v) => { filtros.empresa = v; cargar(); } })),
    campo('Trailer', selector(catalogos.trailers.map((t) => ({ valor: t.id, texto: `Trailer ${t.numero}` })),
      { vacio: 'Todos', onchange: (v) => { filtros.trailer_id = v; cargar(); } })),
    campo('Desde', h('input', { type: 'date', onchange: (e) => { filtros.desde = e.target.value; cargar(); } })),
    campo('Hasta', h('input', { type: 'date', onchange: (e) => { filtros.hasta = e.target.value; cargar(); } }))
  )));
  contenedor.appendChild(resultados);

  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(resultados);
    resultados.appendChild(cargando());
    const { movimientos } = await api.get('/api/movimientos' + qs({ ...filtros, limit: 400 }));
    vaciar(resultados);

    if (!movimientos.length) {
      resultados.appendChild(tarjeta(null, vacio('Sin movimientos', 'Ajuste los filtros.', 'movimientos')));
      return;
    }

    const verCostos = puede('costos.leer');
    resultados.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' }, h('h2', { texto: `${movimientos.length} movimientos` })),
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: 'Fecha' }, { titulo: 'Tipo' }, { titulo: 'Material' }, { titulo: 'Cantidad', num: true },
            { titulo: 'Antes', num: true }, { titulo: 'Despues', num: true }, { titulo: 'Folio' },
            { titulo: 'Trailer' }, { titulo: 'Empresa' }, { titulo: 'Usuario' },
            verCostos ? { titulo: 'Importe', num: true } : null].filter(Boolean),
          movimientos.map((m) => h('tr', {
            clase: m.vale_id ? 'clic' : '', onclick: m.vale_id ? () => ir(`/vales/${m.vale_id}`) : null
          },
            h('td', { clase: 'pequeno', texto: fechaHora(m.created_at) }),
            h('td', {}, chip(m.tipo.replace('_', ' '), m.signo > 0 ? 'verde' : 'rojo')),
            h('td', {}, h('div', { texto: m.material }), h('div', { clase: 'pequeno silencio mono', texto: m.sku })),
            h('td', { clase: 'num negrita' }, `${m.signo > 0 ? '+' : '−'}${numero(m.cantidad)} ${m.unidad}`),
            h('td', { clase: 'num silencio', texto: numero(m.stock_antes) }),
            h('td', { clase: 'num', texto: numero(m.stock_despues) }),
            h('td', { clase: 'mono pequeno', texto: m.folio || '—' }),
            h('td', { clase: 'mono pequeno', texto: m.trailer || '—' }),
            h('td', { clase: 'pequeno', texto: m.empresa === 'REYNA' ? 'Externa' : m.empresa === 'INTERNA' ? 'Interna' : '—' }),
            h('td', { clase: 'pequeno', texto: m.usuario }),
            verCostos ? h('td', { clase: 'num mono', texto: moneda(m.importe) }) : null
          ))
        )
      )
    ));
  }
}
