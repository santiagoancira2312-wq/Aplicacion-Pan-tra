/**
 * Detalle de un vale: trazabilidad completa de principio a fin.
 * Muestra siempre estandar / solicitado / autorizado / entregado / pendiente.
 */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chipEstado, chip, numero, moneda, fechaHora, fecha,
  cantidades, avisoOk, avisoError, modal, pedirTexto, confirmar, tabla
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, estado, puede } from '../app.js';
import { ir } from '../router.js';
import { decidirVale } from './autorizaciones.js';

export async function render({ params }) {
  const contenedor = h('div', { clase: 'columna' });
  await pintar();
  return contenedor;

  async function pintar() {
    const datos = await api.get(`/api/vales/${params.id}`);
    const { vale, items, kits, entregas, devoluciones, movimientos, bitacora, totales } = datos;
    tituloVista(vale.folio, `Trailer ${vale.trailer_numero} · ${vale.trabajador_nombre}`);
    vaciar(contenedor);

    const verCostos = puede('costos.leer');
    const esSupervisorDelVale = estado.user.rol === 'ADMIN'
      || (estado.user.rol === 'SUPERVISOR' && (vale.area_id === estado.user.area_id || vale.supervisor_id === estado.user.id));

    // ------------------------------------------------------------ Cabecera
    const acciones = [];
    if (vale.estado === 'PENDIENTE' && esSupervisorDelVale && puede('vales.autorizar')) {
      acciones.push(h('button', {
        clase: 'btn btn-verde',
        onclick: () => decidirVale(datos, pintar)
      }, icono('check', 18), 'Revisar y autorizar'));
    }
    if (vale.estado === 'PENDIENTE' && vale.trabajador_id === estado.user.id) {
      acciones.push(h('button', {
        clase: 'btn',
        onclick: async () => {
          const motivo = await pedirTexto({ titulo: 'Cancelar vale', etiqueta: 'Motivo de la cancelacion', textoOk: 'Cancelar vale' });
          if (!motivo) return;
          try {
            await api.post(`/api/vales/${vale.id}/cancelar`, { motivo });
            avisoOk('Vale cancelado');
            pintar();
          } catch (err) { avisoError(err.message); }
        }
      }, 'Cancelar vale'));
    }
    if (puede('vales.preparar') && ['APROBADO', 'APROBADO_PARCIAL', 'EN_PREPARACION', 'PREPARADO', 'ENTREGA_PARCIAL'].includes(vale.estado)) {
      acciones.push(h('button', { clase: 'btn btn-primario', onclick: () => ir(`/almacen/${vale.id}`) }, icono('caja', 18), 'Preparar y entregar'));
    }
    if (puede('inventario.devoluciones') && entregas.length) {
      acciones.push(h('button', { clase: 'btn', onclick: () => registrarDevolucion(datos, pintar) }, icono('volver', 18), 'Registrar devolucion'));
    }

    contenedor.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('div', {},
          h('div', { clase: 'gap-s' },
            h('h2', { clase: 'mono', texto: vale.folio }),
            chipEstado(vale.estado),
            vale.empresa === 'REYNA' ? chip('Empresa externa', 'morado') : null,
            vale.prioridad !== 'NORMAL' ? chip(vale.prioridad, vale.prioridad === 'URGENTE' ? 'rojo' : 'ambar') : null
          ),
          h('div', { clase: 'silencio pequeno mt', texto: `Creado ${fechaHora(vale.created_at)}` })
        ),
        h('div', { clase: 'gap', style: 'margin-left:auto' }, acciones)
      ),
      h('div', { clase: 'tarjeta-cuerpo' },
        h('div', { clase: 'rejilla c4' },
          dato('Trailer', `#${vale.trailer_numero}`, vale.trailer_cliente),
          dato('Trabajador', vale.trabajador_nombre, vale.trabajador_clave),
          dato('Area', vale.area_nombre || '—', vale.empresa === 'REYNA' ? 'Empresa externa' : 'Interna'),
          dato('Supervisor', vale.autorizado_por_nombre || vale.supervisor_nombre || '—',
            vale.autorizado_at ? `Autorizo ${fechaHora(vale.autorizado_at)}` : 'Pendiente de autorizacion'),
          vale.preparado_por_nombre ? dato('Preparo', vale.preparado_por_nombre, fechaHora(vale.preparado_at)) : null,
          vale.entregado_por_nombre ? dato('Entrego', vale.entregado_por_nombre, fechaHora(vale.entregado_at)) : null,
          verCostos ? dato('Importe entregado', moneda(totales.importe), 'Precio historico al entregar') : null,
          vale.cierre_reyna_id ? dato('Cierre mensual', `Cierre #${vale.cierre_reyna_id}`, 'Incluido en estado de cuenta') : null
        ),
        vale.notas ? h('div', { clase: 'aviso mt', texto: `Nota del solicitante: ${vale.notas}` }) : null,
        vale.motivo_rechazo ? h('div', { clase: 'aviso rojo mt' },
          h('div', { clase: 'aviso-titulo', texto: `Motivo: ${vale.motivo_rechazo}` }),
          vale.comentario_rechazo ? h('div', { texto: vale.comentario_rechazo }) : null
        ) : null,
        vale.motivo_cierre ? h('div', { clase: 'aviso ambar mt' },
          h('div', { clase: 'aviso-titulo', texto: 'Pendiente cerrado' }),
          h('div', { texto: vale.motivo_cierre })
        ) : null
      )
    ));

    // ------------------------------------------------------------ Lineas
    const bloques = [];
    for (const k of kits) {
      const suyas = items.filter((i) => i.vale_kit_id === k.id);
      bloques.push(h('div', {},
        h('div', { clase: 'kit-encabezado' },
          icono('kit', 16),
          h('span', { texto: `${k.nombre_snapshot} · Version ${k.version_snapshot}` }),
          h('span', { clase: 'pequeno', style: 'margin-left:auto;font-weight:500' },
            `${suyas.length} materiales del kit`)
        ),
        suyas.map(fila)
      ));
    }
    const sueltos = items.filter((i) => !i.vale_kit_id);
    if (sueltos.length) {
      bloques.push(h('div', {},
        h('div', { clase: 'kit-encabezado', style: 'background:var(--superficie-2);color:var(--texto-2)' },
          icono('caja', 16), h('span', { texto: 'Materiales individuales' })),
        sueltos.map(fila)
      ));
    }

    contenedor.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('h2', { texto: 'Materiales del vale' }),
        h('div', { clase: 'gap-s pequeno silencio', style: 'margin-left:auto' },
          `Solicitado ${numero(totales.solicitado)} · Autorizado ${numero(totales.autorizado)} · ` +
          `Entregado ${numero(totales.entregado)}` + (totales.pendiente ? ` · Pendiente ${numero(totales.pendiente)}` : '')
        )
      ),
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' }, bloques)
    ));

    function fila(it) {
      return h('div', { clase: 'linea-vale', style: 'flex-wrap:wrap' },
        h('div', { clase: 'linea-vale-datos', style: 'min-width:240px' },
          h('div', { clase: 'linea-vale-nombre', texto: it.nombre_snapshot }),
          h('div', { clase: 'linea-vale-meta' },
            `${it.sku_snapshot} · ${it.unidad}`,
            it.ubicacion ? ` · Ubicacion ${it.ubicacion}` : '',
            verCostos && it.precio_unitario ? ` · ${moneda(it.precio_unitario)} c/u` : ''
          ),
          it.motivo_linea ? h('div', { clase: 'pequeno', style: 'color:var(--rojo)', texto: it.motivo_linea }) : null
        ),
        cantidades(it, it.unidad),
        h('div', { style: 'margin-left:auto' },
          chip(etiquetaLinea(it.estado_linea), colorLinea(it.estado_linea)),
          verCostos && it.importe ? h('div', { clase: 'pequeno mono derecha mt', texto: moneda(it.importe) }) : null
        )
      );
    }

    // ------------------------------------------------------------ Entregas y firmas
    if (entregas.length) {
      contenedor.appendChild(tarjeta('Entregas y firmas',
        h('div', { clase: 'columna' }, entregas.map((e) => h('div', {
          style: 'border:1px solid var(--borde);border-radius:var(--r-m);padding:14px'
        },
          h('div', { clase: 'gap mb' },
            chip(e.tipo === 'TOTAL' ? 'Entrega total' : 'Entrega parcial', e.tipo === 'TOTAL' ? 'verde' : 'acento'),
            h('span', { clase: 'pequeno silencio', texto: fechaHora(e.created_at) })
          ),
          h('div', { clase: 'rejilla c3' },
            dato('Recibio', e.receptor_nombre, 'Firma capturada en el dispositivo'),
            dato('Entrego', e.almacenista, 'Almacen'),
            e.firma ? h('div', {},
              h('div', { clase: 'kpi-etiqueta mb', texto: 'Firma digital' }),
              h('img', { src: e.firma, clase: 'firma-imagen', alt: `Firma de ${e.receptor_nombre}`, style: 'max-height:90px' })
            ) : null
          ),
          h('div', { clase: 'mt' }, tabla(
            [{ titulo: 'Material' }, { titulo: 'Cantidad', num: true }, verCostos ? { titulo: 'Importe', num: true } : null].filter(Boolean),
            e.items.map((i) => h('tr', {},
              h('td', {}, h('div', { texto: i.nombre_snapshot }), h('div', { clase: 'pequeno silencio', texto: i.sku_snapshot })),
              h('td', { clase: 'num negrita', texto: numero(i.cantidad) }),
              verCostos ? h('td', { clase: 'num mono', texto: moneda(i.importe) }) : null
            )),
            { compacta: true }
          ))
        )))
      ));
    }

    if (devoluciones.length) {
      contenedor.appendChild(tarjeta('Devoluciones confirmadas por almacen',
        h('div', { clase: 'columna' }, devoluciones.map((d) => h('div', {},
          h('div', { clase: 'gap mb' }, chip('Devolucion', 'azul'),
            h('span', { clase: 'pequeno silencio', texto: `${fechaHora(d.created_at)} · ${d.almacenista}` })),
          h('div', { clase: 'aviso', texto: `Motivo: ${d.motivo}` }),
          tabla([{ titulo: 'Material' }, { titulo: 'Cantidad', num: true }],
            d.items.map((i) => h('tr', {},
              h('td', { texto: i.nombre_snapshot }),
              h('td', { clase: 'num negrita', texto: numero(i.cantidad) })
            )), { compacta: true })
        )))
      ));
    }

    // ------------------------------------------------------------ Trazabilidad
    if (movimientos.length && puede('movimientos.leer')) {
      contenedor.appendChild(tarjeta('Movimientos de inventario generados',
        tabla(
          [{ titulo: 'Fecha' }, { titulo: 'Tipo' }, { titulo: 'Material' }, { titulo: 'Cantidad', num: true },
            { titulo: 'Antes', num: true }, { titulo: 'Despues', num: true }, { titulo: 'Usuario' }],
          movimientos.map((m) => h('tr', {},
            h('td', { clase: 'pequeno', texto: fechaHora(m.created_at) }),
            h('td', {}, chip(m.tipo, m.signo > 0 ? 'verde' : 'rojo')),
            h('td', {}, h('div', { texto: m.material }), h('div', { clase: 'pequeno silencio mono', texto: m.sku })),
            h('td', { clase: 'num negrita' }, `${m.signo > 0 ? '+' : '−'}${numero(m.cantidad)}`),
            h('td', { clase: 'num silencio', texto: numero(m.stock_antes) }),
            h('td', { clase: 'num', texto: numero(m.stock_despues) }),
            h('td', { clase: 'pequeno', texto: m.usuario })
          )),
          { compacta: true }
        ), null, { sinRelleno: true }
      ));
    }

    contenedor.appendChild(tarjeta('Bitacora del vale',
      h('div', { clase: 'columna' }, bitacora.length ? bitacora.map((b) => h('div', { clase: 'gap' },
        h('span', { clase: 'pequeno mono silencio', style: 'min-width:150px', texto: fechaHora(b.created_at) }),
        chip(b.accion.replace(/_/g, ' '), 'gris'),
        h('span', { clase: 'pequeno', texto: b.user_nombre }),
        b.motivo ? h('span', { clase: 'pequeno silencio', texto: `— ${b.motivo}` }) : null
      )) : h('div', { clase: 'silencio', texto: 'Sin eventos registrados' }))
    ));
  }
}

function dato(etiqueta, valor, nota = '') {
  return h('div', {},
    h('div', { clase: 'kpi-etiqueta', texto: etiqueta }),
    h('div', { style: 'font-size:16px;font-weight:650', texto: valor }),
    nota ? h('div', { clase: 'pequeno silencio', texto: nota }) : null
  );
}

const etiquetaLinea = (e) => ({
  PENDIENTE: 'Pendiente', AUTORIZADA: 'Autorizada', RECHAZADA: 'No autorizada',
  PARCIAL: 'Entrega parcial', ENTREGADA: 'Entregada', CERRADA: 'Cerrada'
}[e] || e);

const colorLinea = (e) => ({
  PENDIENTE: 'ambar', AUTORIZADA: 'azul', RECHAZADA: 'rojo',
  PARCIAL: 'acento', ENTREGADA: 'verde', CERRADA: 'gris'
}[e] || 'gris');

/** Registro de devolucion (solo almacen). */
export function registrarDevolucion(datos, alTerminar) {
  const { vale, items } = datos;
  const candidatos = items.filter((i) => i.cantidad_entregada > 0);
  const seleccion = new Map();

  const motivo = h('select', {},
    ...['Material sobrante del trailer', 'Material equivocado', 'Material danado',
      'Cambio de especificacion', 'Otro'].map((m) => h('option', { value: m }, m))
  );

  const cuerpo = h('div', {},
    h('p', { clase: 'silencio', texto: 'Una devolucion solo es valida cuando el almacen la confirma fisicamente.' }),
    h('div', { clase: 'campo' }, h('label', { texto: 'Motivo' }), motivo),
    h('div', { style: 'border:1px solid var(--borde);border-radius:var(--r-m)' },
      candidatos.map((it) => {
        const input = h('input', {
          type: 'number', min: '0', max: String(it.cantidad_entregada), step: '0.01', valor: '0',
          onchange: () => seleccion.set(it.id, Number(input.value) || 0)
        });
        return h('div', { clase: 'linea-vale' },
          h('div', { clase: 'linea-vale-datos' },
            h('div', { clase: 'linea-vale-nombre', texto: it.nombre_snapshot }),
            h('div', { clase: 'linea-vale-meta', texto: `Entregado: ${numero(it.cantidad_entregada)} ${it.unidad}` })
          ),
          h('div', { clase: 'cantidad-control' }, input)
        );
      })
    )
  );

  modal({
    titulo: `Registrar devolucion · ${vale.folio}`,
    ancho: 'ancho',
    cuerpo,
    acciones: [
      { texto: 'Cancelar' },
      {
        texto: 'Confirmar devolucion',
        clase: 'btn-primario',
        accion: async (cerrar) => {
          const lineas = [...seleccion.entries()]
            .filter(([, c]) => c > 0)
            .map(([vale_item_id, cantidad]) => ({ vale_item_id, cantidad }));
          if (!lineas.length) return avisoError('Indique al menos una cantidad devuelta');
          try {
            await api.post(`/api/almacen/vales/${vale.id}/devolucion`, { motivo: motivo.value, lineas });
            cerrar();
            avisoOk('Devolucion registrada. El inventario fue actualizado.');
            alTerminar();
          } catch (err) { avisoError(err.message); }
        }
      }
    ]
  });
}
