/** Consulta general de vales con filtros (supervisores, almacen, direccion). */
import { api, qs } from '../api.js';
import {
  h, vaciar, tarjeta, chipEstado, chip, numero, fechaHora, cargando, vacio,
  tabla, campo, selector
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';
import { ir } from '../router.js';

export async function render() {
  tituloVista('Vales', 'Consulta y seguimiento de solicitudes');

  const catalogos = await api.get('/api/catalogos');
  const filtros = { buscar: '', estado: '', trailer_id: '', area_id: '', empresa: '', desde: '', hasta: '' };

  const resultados = h('div');
  const contenedor = h('div', { clase: 'columna' });

  const buscar = h('input', { type: 'search', placeholder: 'Folio, trabajador o trailer' });
  let temporizador;
  buscar.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { filtros.buscar = buscar.value.trim(); cargar(); }, 250);
  });

  const controles = h('div', { clase: 'fila' },
    campo('Buscar', buscar),
    campo('Estado', selector([
      { valor: 'PENDIENTE', texto: 'Pendiente' },
      { valor: 'APROBADO,APROBADO_PARCIAL', texto: 'Aprobado' },
      { valor: 'EN_PREPARACION,PREPARADO', texto: 'En almacen' },
      { valor: 'ENTREGA_PARCIAL', texto: 'Entrega parcial' },
      { valor: 'ENTREGADO', texto: 'Entregado' },
      { valor: 'RECHAZADO,CORRECCION', texto: 'Rechazado' },
      { valor: 'CERRADO', texto: 'Cerrado' }
    ], { vacio: 'Todos', onchange: (v) => { filtros.estado = v; cargar(); } })),
    campo('Trailer', selector(catalogos.trailers.map((t) => ({ valor: t.id, texto: `Trailer ${t.numero}` })),
      { vacio: 'Todos', onchange: (v) => { filtros.trailer_id = v; cargar(); } })),
    campo('Area', selector(catalogos.areas.map((a) => ({ valor: a.id, texto: a.nombre })),
      { vacio: 'Todas', onchange: (v) => { filtros.area_id = v; cargar(); } })),
    campo('Empresa', selector([
      { valor: 'INTERNA', texto: 'Interna' }, { valor: 'REYNA', texto: 'Externa' }
    ], { vacio: 'Todas', onchange: (v) => { filtros.empresa = v; cargar(); } })),
    campo('Desde', h('input', { type: 'date', onchange: (e) => { filtros.desde = e.target.value; cargar(); } })),
    campo('Hasta', h('input', { type: 'date', onchange: (e) => { filtros.hasta = e.target.value; cargar(); } }))
  );

  contenedor.appendChild(tarjeta('Filtros', controles));
  contenedor.appendChild(resultados);
  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(resultados);
    resultados.appendChild(cargando());
    const { vales, total } = await api.get('/api/vales' + qs({ ...filtros, limit: 200 }));
    vaciar(resultados);

    if (!vales.length) {
      resultados.appendChild(tarjeta(null, vacio('Sin resultados', 'Ajuste los filtros de busqueda.', 'lupa')));
      return;
    }

    resultados.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('h2', { texto: `${vales.length} de ${total} vales` })
      ),
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: 'Folio' }, { titulo: 'Fecha' }, { titulo: 'Estado' }, { titulo: 'Trabajador' },
            { titulo: 'Area' }, { titulo: 'Trailer' }, { titulo: 'Lineas', num: true }],
          vales.map((v) => h('tr', {
            clase: 'clic', onclick: () => ir(`/vales/${v.id}`)
          },
            h('td', {},
              h('span', { clase: 'mono negrita', texto: v.folio }),
              v.empresa === 'REYNA' ? h('div', {}, chip('Externa', 'morado')) : null
            ),
            h('td', { clase: 'pequeno', texto: fechaHora(v.created_at) }),
            h('td', {}, chipEstado(v.estado)),
            h('td', { texto: v.trabajador_nombre }),
            h('td', { clase: 'pequeno', texto: v.area_nombre || '—' }),
            h('td', { clase: 'mono', texto: v.trailer_numero }),
            h('td', { clase: 'num', texto: numero(v.num_lineas) })
          ))
        )
      )
    ));
  }
}
