/** Pantalla principal del trabajador: crear vale y seguir sus propios vales. */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chipEstado, chip, numero, haceRato, fechaHora,
  cargando, vacio, pestanas
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, estado } from '../app.js';
import { ir } from '../router.js';

export async function render() {
  tituloVista('Mis vales', 'Solicitudes que usted ha creado');

  const contenedor = h('div', { clase: 'columna' });
  const lista = h('div');
  const barra = h('div');
  let filtro = '';

  contenedor.appendChild(h('div', { clase: 'acciones-grandes' },
    h('button', {
      clase: 'accion-grande destacada',
      onclick: () => ir('/vale/nuevo')
    },
      h('div', { clase: 'icono' }, icono('mas', 26)),
      h('div', { clase: 'titulo', texto: 'CREAR VALE' }),
      h('div', { clase: 'sub', texto: 'Seleccione trailer, agregue materiales o kits y envie' })
    )
  ));
  contenedor.appendChild(barra);
  contenedor.appendChild(lista);

  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(lista);
    lista.appendChild(cargando());

    const resumen = await api.get('/api/vales/resumen');
    vaciar(barra);
    barra.appendChild(pestanas([
      { id: '', texto: 'Todos' },
      { id: 'PENDIENTE', texto: 'Pendientes', cuenta: resumen.pendientes },
      { id: 'APROBADO,APROBADO_PARCIAL', texto: 'Aprobados', cuenta: resumen.aprobados },
      { id: 'EN_PREPARACION,PREPARADO', texto: 'Preparados', cuenta: resumen.preparados },
      { id: 'ENTREGADO,ENTREGA_PARCIAL,CERRADO', texto: 'Entregados', cuenta: resumen.entregados },
      { id: 'RECHAZADO,CORRECCION', texto: 'Rechazados', cuenta: resumen.rechazados }
    ], filtro, (id) => { filtro = id; cargar(); }));

    const { vales } = await api.get(`/api/vales?limit=80${filtro ? `&estado=${filtro}` : ''}`);
    vaciar(lista);

    if (!vales.length) {
      lista.appendChild(tarjeta(null, vacio('Sin vales en esta seccion',
        'Cuando cree un vale aparecera aqui con su estatus.', 'lista')));
      return;
    }

    lista.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        vales.map((v) => h('button', {
          clase: 'lista-item',
          onclick: () => ir(`/vales/${v.id}`)
        },
          h('div', { clase: 'lista-item-cuerpo' },
            h('div', { clase: 'gap-s' },
              h('span', { clase: 'lista-item-titulo mono', texto: v.folio }),
              chipEstado(v.estado)
            ),
            h('div', { clase: 'lista-item-sub' },
              `Trailer ${v.trailer_numero} · ${v.num_lineas} ${v.num_lineas === 1 ? 'material' : 'materiales'}` +
              (v.num_kits ? ` · ${v.num_kits} ${v.num_kits === 1 ? 'kit' : 'kits'}` : ''))
          ),
          h('div', { clase: 'lista-item-fin' },
            h('div', { clase: 'pequeno silencio', texto: haceRato(v.created_at) }),
            h('div', { clase: 'pequeno silencio', texto: fechaHora(v.created_at).split(',')[0] })
          )
        ))
      )
    ));
  }
}
