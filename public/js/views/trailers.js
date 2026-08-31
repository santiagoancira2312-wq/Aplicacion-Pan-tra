/** Trailers: alta, edicion, estado y costo acumulado. */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chip, numero, moneda, fecha, cargando, vacio, tabla,
  campo, selector, modal, avisoOk, avisoError
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';

const ESTADOS = ['PLANEADO', 'EN_PROCESO', 'TERMINADO', 'CERRADO'];

export async function render() {
  tituloVista('Trailers', 'Unidades en fabricacion y su consumo de materiales');

  const contenedor = h('div', { clase: 'columna' });
  const lista = h('div');

  contenedor.appendChild(h('div', { clase: 'tarjeta' },
    h('div', { clase: 'tarjeta-cabecera' },
      h('h2', { texto: 'Trailers registrados' }),
      puede('catalogo.escribir')
        ? h('button', { clase: 'btn btn-primario', style: 'margin-left:auto', onclick: () => formulario(null) }, icono('mas', 18), 'Nuevo trailer')
        : null
    )
  ));
  contenedor.appendChild(lista);
  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(lista);
    lista.appendChild(cargando());
    const { trailers } = await api.get('/api/trailers');
    vaciar(lista);

    if (!trailers.length) {
      lista.appendChild(tarjeta(null, vacio('Sin trailers', '', 'camion')));
      return;
    }

    const verCostos = puede('costos.leer');
    lista.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: 'Numero' }, { titulo: 'Modelo' }, { titulo: 'Cliente' }, { titulo: 'Tamano' },
            { titulo: 'Inicio' }, { titulo: 'Termino' }, { titulo: 'Estado' }, { titulo: 'Vales', num: true },
            verCostos ? { titulo: 'Costo acumulado', num: true } : null,
            puede('catalogo.escribir') ? { titulo: '' } : null].filter(Boolean),
          trailers.map((t) => h('tr', {},
            h('td', { clase: 'mono negrita', texto: t.numero }),
            h('td', { texto: t.modelo || '—' }),
            h('td', { clase: 'pequeno', texto: t.cliente || '—' }),
            h('td', { clase: 'pequeno silencio', texto: t.tamano || '—' }),
            h('td', { clase: 'pequeno', texto: t.fecha_inicio ? fecha(t.fecha_inicio) : '—' }),
            h('td', { clase: 'pequeno', texto: t.fecha_fin ? fecha(t.fecha_fin) : '—' }),
            h('td', {}, chip(t.estado.replace('_', ' '),
              t.estado === 'EN_PROCESO' ? 'verde' : t.estado === 'PLANEADO' ? 'azul' : 'gris')),
            h('td', { clase: 'num', texto: numero(t.num_vales) }),
            verCostos ? h('td', { clase: 'num mono negrita', texto: moneda(t.costo_total || 0) }) : null,
            puede('catalogo.escribir')
              ? h('td', {}, h('button', { clase: 'btn btn-s', onclick: () => formulario(t) }, 'Editar'))
              : null
          ))
        )
      )
    ));
  }

  function formulario(trailer) {
    const numeroInput = h('input', { type: 'text', valor: trailer ? trailer.numero : '', placeholder: '190' });
    const modelo = h('input', { type: 'text', valor: trailer && trailer.modelo ? trailer.modelo : '' });
    const tamano = h('input', { type: 'text', valor: trailer && trailer.tamano ? trailer.tamano : '' });
    const cliente = h('input', { type: 'text', valor: trailer && trailer.cliente ? trailer.cliente : '' });
    const tipo = h('input', { type: 'text', valor: trailer && trailer.tipo_config ? trailer.tipo_config : '' });
    const inicio = h('input', { type: 'date', valor: trailer && trailer.fecha_inicio ? String(trailer.fecha_inicio).slice(0, 10) : '' });
    const fin = h('input', { type: 'date', valor: trailer && trailer.fecha_fin ? String(trailer.fecha_fin).slice(0, 10) : '' });
    const estado = selector(ESTADOS.map((e) => ({ valor: e, texto: e.replace('_', ' ') })),
      { valor: trailer ? trailer.estado : 'PLANEADO' });

    modal({
      titulo: trailer ? `Editar trailer ${trailer.numero}` : 'Nuevo trailer',
      cuerpo: h('div', {},
        h('div', { clase: 'fila' }, campo('Numero', numeroInput), campo('Modelo', modelo), campo('Tamano', tamano)),
        h('div', { clase: 'fila' }, campo('Cliente', cliente), campo('Tipo de configuracion', tipo)),
        h('div', { clase: 'fila' }, campo('Fecha de inicio', inicio), campo('Fecha de terminacion', fin), campo('Estado', estado))
      ),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar',
          clase: 'btn-primario',
          accion: async (cerrar) => {
            const cuerpo = {
              numero: numeroInput.value.trim(), modelo: modelo.value.trim(), tamano: tamano.value.trim(),
              cliente: cliente.value.trim(), tipo_config: tipo.value.trim(),
              fecha_inicio: inicio.value || null, fecha_fin: fin.value || null, estado: estado.value
            };
            if (!cuerpo.numero) return avisoError('El numero de trailer es obligatorio');
            try {
              if (trailer) await api.put(`/api/trailers/${trailer.id}`, cuerpo);
              else await api.post('/api/trailers', cuerpo);
              cerrar();
              avisoOk('Trailer guardado');
              cargar();
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }
}
