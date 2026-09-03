/** Cola del almacen, estilo preparacion de pedidos. */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chip, chipEstado, numero, haceRato, cargando, vacio, pestanas
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, alLlegarNotificacion } from '../app.js';
import { ir } from '../router.js';

const SECCIONES = [
  { id: 'nuevos', texto: 'Nuevos' },
  { id: 'en_preparacion', texto: 'En preparacion' },
  { id: 'preparados', texto: 'Preparados' },
  { id: 'entrega_parcial', texto: 'Entrega parcial' },
  { id: 'completados', texto: 'Completados' }
];

export async function render() {
  tituloVista('Cola de almacen', 'Vales autorizados listos para surtir');

  const contenedor = h('div', { clase: 'columna' });
  const barra = h('div');
  const lista = h('div');
  let seccion = 'nuevos';

  contenedor.appendChild(barra);
  contenedor.appendChild(lista);
  await cargar();
  // El almacen tiene esta cola abierta todo el dia: cuando un supervisor
  // autoriza un vale, aparece solo.
  alLlegarNotificacion(() => cargar({ silencioso: true }));
  return contenedor;

  // En la recarga silenciosa la lista no se vacia mientras llegan los datos:
  // asi no parpadea ni brinca la pantalla debajo del dedo.
  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) {
      vaciar(lista);
      lista.appendChild(cargando());
    }
    const cola = await api.get('/api/almacen/cola');

    vaciar(barra);
    barra.appendChild(pestanas(
      SECCIONES.map((s) => ({ ...s, cuenta: (cola[s.id] || []).length })),
      seccion,
      (id) => { seccion = id; pintar(cola); }
    ));
    pintar(cola);
  }

  function pintar(cola) {
    vaciar(lista);
    const filas = cola[seccion] || [];
    if (!filas.length) {
      lista.appendChild(tarjeta(null, vacio('Nada en esta seccion',
        seccion === 'nuevos' ? 'Los vales autorizados por los supervisores apareceran aqui.' : '', 'caja')));
      return;
    }

    lista.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        filas.map((v) => h('button', {
          clase: 'lista-item',
          onclick: () => ir(seccion === 'completados' ? `/vales/${v.id}` : `/almacen/${v.id}`)
        },
          h('div', { clase: 'lista-item-cuerpo' },
            h('div', { clase: 'gap-s' },
              h('span', { clase: 'lista-item-titulo mono', texto: v.folio }),
              chipEstado(v.estado),
              v.prioridad && v.prioridad !== 'NORMAL'
                ? chip(v.prioridad, v.prioridad === 'URGENTE' ? 'rojo' : 'ambar') : null,
              v.empresa === 'REYNA' ? chip('Externa', 'morado') : null,
              v.lineas_sin_stock ? chip(`${v.lineas_sin_stock} sin existencia`, 'rojo') : null
            ),
            h('div', { clase: 'lista-item-sub' },
              `${v.trabajador_nombre} · Trailer ${v.trailer_numero}` +
              (v.area_nombre ? ` · ${v.area_nombre}` : '') +
              (v.num_lineas !== undefined ? ` · ${v.num_lineas} materiales` : '') +
              (v.lineas_pendientes ? ` · ${v.lineas_pendientes} por surtir` : ''))
          ),
          h('div', { clase: 'lista-item-fin' },
            h('div', { clase: 'pequeno silencio', texto: haceRato(v.autorizado_at || v.entregado_at || v.created_at) }),
            seccion !== 'completados'
              ? h('span', { clase: 'btn btn-s btn-primario mt', texto: 'Abrir' }) : null
          )
        ))
      )
    ));
  }
}
