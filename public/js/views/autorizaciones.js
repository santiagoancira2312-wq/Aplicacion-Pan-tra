/**
 * Autorizaciones del supervisor de area.
 * Puede aprobar, aprobar parcialmente, rechazar o solicitar correccion.
 * Nunca modifica la cantidad SOLICITADA: solo la AUTORIZADA.
 */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chipEstado, chip, numero, fechaHora, haceRato, cargando,
  vacio, modal, avisoOk, avisoError, pestanas, tabla
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, estado, actualizarPendientes, alLlegarNotificacion } from '../app.js';
import { ir } from '../router.js';

export async function render() {
  tituloVista('Autorizaciones', 'Solicitudes de su area pendientes de decision');

  const contenedor = h('div', { clase: 'columna' });
  const lista = h('div');
  let filtro = 'PENDIENTE';

  const barra = h('div');
  contenedor.appendChild(barra);
  contenedor.appendChild(lista);
  await cargar();
  // El supervisor se queda parado en esta pantalla esperando: cuando entra un
  // vale nuevo, la lista se actualiza sola.
  alLlegarNotificacion(() => cargar({ silencioso: true }));
  return contenedor;

  // En la recarga silenciosa la lista no se vacia mientras llegan los datos:
  // asi no parpadea ni brinca la pantalla debajo del dedo.
  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) {
      vaciar(lista);
      lista.appendChild(cargando());
    }
    const [{ vales }, resumen] = await Promise.all([
      api.get(`/api/vales?estado=${filtro}&limit=100`),
      api.get('/api/vales/resumen')
    ]);

    vaciar(barra);
    barra.appendChild(pestanas([
      { id: 'PENDIENTE', texto: 'Pendientes', cuenta: resumen.pendientes },
      { id: 'APROBADO,APROBADO_PARCIAL', texto: 'Aprobados', cuenta: resumen.aprobados },
      { id: 'ENTREGADO,ENTREGA_PARCIAL,CERRADO', texto: 'Entregados', cuenta: resumen.entregados },
      { id: 'RECHAZADO,CORRECCION', texto: 'Rechazados', cuenta: resumen.rechazados }
    ], filtro, (id) => { filtro = id; cargar(); }));

    vaciar(lista);
    if (!vales.length) {
      lista.appendChild(tarjeta(null, vacio(
        filtro === 'PENDIENTE' ? 'No hay solicitudes pendientes' : 'Sin vales en este estado',
        filtro === 'PENDIENTE' ? 'Cuando un trabajador envie un vale aparecera aqui.' : '',
        'check'
      )));
      return;
    }

    lista.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        vales.map((v) => h('button', {
          clase: 'lista-item',
          onclick: async () => {
            const datos = await api.get(`/api/vales/${v.id}`);
            if (v.estado === 'PENDIENTE') decidirVale(datos, cargar);
            else ir(`/vales/${v.id}`);
          }
        },
          h('div', { clase: 'lista-item-cuerpo' },
            h('div', { clase: 'gap-s' },
              h('span', { clase: 'lista-item-titulo mono', texto: v.folio }),
              chipEstado(v.estado),
              v.empresa === 'REYNA' ? chip('Externa', 'morado') : null,
              v.prioridad !== 'NORMAL' ? chip(v.prioridad, v.prioridad === 'URGENTE' ? 'rojo' : 'ambar') : null
            ),
            h('div', { clase: 'lista-item-sub' },
              `${v.trabajador_nombre} · Trailer ${v.trailer_numero} · ${v.num_lineas} ${v.num_lineas === 1 ? 'material' : 'materiales'}` +
              (v.num_kits ? ` · ${v.num_kits} ${v.num_kits === 1 ? 'kit' : 'kits'}` : ''))
          ),
          h('div', { clase: 'lista-item-fin' },
            h('div', { clase: 'pequeno silencio', texto: haceRato(v.created_at) }),
            v.estado === 'PENDIENTE' ? h('span', { clase: 'btn btn-s btn-verde mt', texto: 'Revisar' }) : null
          )
        ))
      )
    ));
  }
}

/**
 * Ventana de decision. Muestra por linea: estandar del kit, solicitado,
 * existencias y la cantidad autorizada editable.
 */
export function decidirVale(datos, alTerminar) {
  const { vale, items, kits } = datos;
  const autorizadas = new Map(items.map((i) => [i.id, i.cantidad_solicitada]));

  const filas = items.map((it) => {
    const input = h('input', {
      type: 'number', min: '0', max: String(it.cantidad_solicitada), step: '0.01',
      valor: String(it.cantidad_solicitada), clase: 'num-grande',
      style: 'width:110px',
      onchange: () => {
        let v = Number(input.value);
        if (!Number.isFinite(v) || v < 0) v = 0;
        if (v > it.cantidad_solicitada) {
          v = it.cantidad_solicitada;
          avisoError('No puede autorizar mas de lo solicitado');
        }
        input.value = String(v);
        autorizadas.set(it.id, v);
        marcar();
      }
    });
    const aviso = h('div', { clase: 'pequeno' });
    const marcar = () => {
      const v = autorizadas.get(it.id);
      aviso.textContent = v === 0 ? 'No se autoriza'
        : v < it.cantidad_solicitada ? `Autorizacion parcial (−${numero(it.cantidad_solicitada - v)})` : '';
      aviso.style.color = v === 0 ? 'var(--rojo)' : 'var(--acento-fuerte)';
    };
    marcar();

    const kit = kits.find((k) => k.id === it.vale_kit_id);
    return h('tr', {},
      h('td', {},
        h('div', { clase: 'negrita', texto: it.nombre_snapshot }),
        h('div', { clase: 'pequeno silencio mono', texto: it.sku_snapshot }),
        kit ? h('div', { clase: 'pequeno gap-s', style: 'color:var(--acento-fuerte)' },
          icono('kit', 14), `${kit.nombre_snapshot} V${kit.version_snapshot}`) : null
      ),
      h('td', { clase: 'num silencio' },
        it.cantidad_estandar !== null ? numero(it.cantidad_estandar) : '—'),
      h('td', { clase: 'num negrita' }, `${numero(it.cantidad_solicitada)} ${it.unidad}`),
      h('td', { clase: 'num' },
        h('div', { clase: `semaforo ${it.semaforo || 'NORMAL'}`, style: 'justify-content:flex-end' },
          numero(it.disponible ?? 0)),
        h('div', { clase: 'pequeno silencio', texto: `Fisico ${numero(it.stock_fisico ?? 0)}` })
      ),
      h('td', { clase: 'num' }, input, aviso)
    );
  });

  const cuerpo = h('div', {},
    h('div', { clase: 'rejilla c3 mb' },
      info('Folio', vale.folio),
      info('Trabajador', vale.trabajador_nombre),
      info('Trailer', `#${vale.trailer_numero}`),
      info('Area', vale.area_nombre || '—'),
      info('Empresa', vale.empresa === 'REYNA' ? 'Externa' : 'Interna'),
      info('Solicitado', fechaHora(vale.created_at))
    ),
    vale.notas ? h('div', { clase: 'aviso', texto: `Nota: ${vale.notas}` }) : null,
    tabla(
      [{ titulo: 'Material' }, { titulo: 'Estandar kit', num: true }, { titulo: 'Solicitado', num: true },
        { titulo: 'Disponible', num: true }, { titulo: 'Autoriza', num: true }],
      filas, { compacta: true }
    ),
    h('div', { clase: 'aviso mt', style: 'font-size:13px' },
      'La cantidad solicitada por el trabajador nunca se modifica. Usted define la cantidad autorizada.')
  );

  const { cerrar } = modal({
    titulo: `Revisar vale ${vale.folio}`,
    ancho: 'ancho',
    cuerpo,
    acciones: [
      { texto: 'Solicitar correccion', accion: () => rechazar('CORRECCION') },
      { texto: 'Rechazar', clase: 'btn-rojo', accion: () => rechazar('RECHAZAR') },
      { texto: 'APROBAR', clase: 'btn-verde', accion: () => aprobar() }
    ]
  });

  async function aprobar() {
    const lineas = [...autorizadas.entries()].map(([id, cantidad_autorizada]) => ({ id, cantidad_autorizada }));
    const hayRecorte = items.some((i) => autorizadas.get(i.id) !== i.cantidad_solicitada);
    try {
      const r = await api.post(`/api/vales/${vale.id}/autorizar`, {
        decision: hayRecorte ? 'PARCIAL' : 'APROBAR', lineas
      });
      cerrar();
      avisoOk(r.estado === 'APROBADO_PARCIAL'
        ? 'Vale aprobado parcialmente. El almacen ya lo tiene en su cola.'
        : 'Vale aprobado. El almacen ya lo tiene en su cola.');
      actualizarPendientes();
      alTerminar();
    } catch (err) { avisoError(err.message); }
  }

  async function rechazar(decision) {
    const { motivos } = await api.get('/api/motivos-rechazo');
    let motivoId = null;
    const comentario = h('textarea', { rows: 3, placeholder: 'Detalle (obligatorio si elige "Otro")' });
    const campoComentario = h('div', { clase: 'campo oculto' },
      h('label', { texto: 'Comentario' }), comentario);

    const opciones = h('div', { clase: 'columna' }, motivos.map((m) => h('button', {
      clase: 'lista-item',
      onclick: (e) => {
        motivoId = m.id;
        for (const b of opciones.querySelectorAll('.lista-item')) b.style.background = '';
        e.currentTarget.style.background = 'var(--acento-suave)';
        campoComentario.classList.toggle('oculto', !m.requiere_comentario);
      }
    },
      h('div', { clase: 'lista-item-cuerpo' }, h('div', { clase: 'lista-item-titulo', texto: m.texto })),
      m.requiere_comentario ? chip('Requiere detalle', 'ambar') : null
    )));

    modal({
      titulo: decision === 'RECHAZAR' ? 'Motivo del rechazo' : 'Solicitar correccion',
      cuerpo: h('div', {},
        h('p', { clase: 'silencio', texto: 'Seleccione un motivo. No necesita escribir texto salvo que elija "Otro".' }),
        opciones, campoComentario
      ),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Confirmar',
          clase: 'btn-rojo',
          accion: async (cerrarMotivo) => {
            if (!motivoId) return avisoError('Seleccione un motivo');
            try {
              await api.post(`/api/vales/${vale.id}/autorizar`, {
                decision, motivo_id: motivoId, comentario: comentario.value.trim()
              });
              cerrarMotivo();
              cerrar();
              avisoOk(decision === 'RECHAZAR' ? 'Vale rechazado' : 'Se solicito correccion al trabajador');
              actualizarPendientes();
              alTerminar();
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }
}

function info(etiqueta, valor) {
  return h('div', {},
    h('div', { clase: 'kpi-etiqueta', texto: etiqueta }),
    h('div', { clase: 'negrita', texto: valor })
  );
}
