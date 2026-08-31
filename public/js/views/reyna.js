/**
 * Modulo de la empresa externa.
 * Mismo inventario fisico, pero cada consumo guarda empresa responsable,
 * precio unitario historico e importe, con cierre mensual y estado de cuenta.
 */
import { api, qs } from '../api.js';
import {
  h, vaciar, tarjeta, kpi, chip, numero, moneda, monedaCorta, fecha, fechaHora,
  cargando, vacio, tabla, pestanas, campo, selector, modal, confirmar,
  pedirTexto, avisoOk, avisoError
} from '../ui.js';
import { icono } from '../iconos.js';
import { barras, barrasHorizontales } from '../graficas.js';
import { tituloVista, puede } from '../app.js';
import { ir } from '../router.js';

export async function render() {
  tituloVista('Empresa externa', 'Consumo, estado de cuenta y cierre mensual');

  const contenedor = h('div', { clase: 'columna' });
  const barra = h('div');
  const cuerpo = h('div');
  let seccion = 'resumen';

  const secciones = [
    { id: 'resumen', texto: 'Resumen' },
    { id: 'estado', texto: 'Estado de cuenta' },
    { id: 'cierres', texto: 'Cierres mensuales' },
    { id: 'trabajadores', texto: 'Trabajadores' }
  ];

  const pintarBarra = () => {
    vaciar(barra);
    barra.appendChild(pestanas(secciones, seccion, (id) => { seccion = id; pintarBarra(); cargar(); }));
  };
  pintarBarra();
  contenedor.appendChild(barra);
  contenedor.appendChild(cuerpo);
  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(cuerpo);
    cuerpo.appendChild(cargando());
    if (seccion === 'resumen') return resumen();
    if (seccion === 'estado') return estadoCuenta();
    if (seccion === 'cierres') return cierres();
    return trabajadores();
  }

  async function resumen() {
    const d = await api.get('/api/reyna/resumen');
    vaciar(cuerpo);

    cuerpo.appendChild(h('div', { clase: 'rejilla c4 mb' },
      kpi('Consumo del mes', monedaCorta(d.total_mes), d.periodo_actual, 'acento'),
      kpi('Por cobrar', monedaCorta(d.por_cobrar), 'Aun no incluido en un cierre', 'verde'),
      kpi('Total historico', monedaCorta(d.total_historico), `${numero(d.vales)} vales`),
      kpi('Trabajadores activos', numero(d.trabajadores), `${numero(d.vales_mes)} vales este mes`)
    ));

    if (d.por_mes.length) {
      cuerpo.appendChild(tarjeta('Consumo por mes',
        barras([...d.por_mes].reverse().map((m) => ({ etiqueta: mesCorto(m.periodo), valor: m.importe })),
          { formato: monedaCorta, etiqueta: 'Consumo mensual de la empresa externa' })));
    }

    cuerpo.appendChild(h('div', { clase: 'rejilla c2' },
      tarjeta('Materiales mas consumidos',
        d.top_materiales.length
          ? barrasHorizontales(d.top_materiales.map((m) => ({ etiqueta: m.nombre, valor: m.importe })), { formato: monedaCorta })
          : vacio('Sin consumo', '', 'caja')),
      tarjeta('Consumo por trabajador',
        d.por_trabajador.length
          ? barrasHorizontales(d.por_trabajador.map((t) => ({ etiqueta: t.nombre, valor: t.importe })), { formato: monedaCorta })
          : vacio('Sin consumo', '', 'usuarios'))
    ));
  }

  async function estadoCuenta(periodo = '') {
    const datos = await api.get('/api/reyna/estado-cuenta' + qs({ periodo }));
    vaciar(cuerpo);

    const selectorPeriodo = selector(datos.periodos.map((p) => ({ valor: p, texto: p })), {
      valor: periodo, vacio: 'Todo el historico',
      onchange: (v) => { vaciar(cuerpo); cuerpo.appendChild(cargando()); estadoCuenta(v); }
    });

    cuerpo.appendChild(tarjeta('Periodo', h('div', { clase: 'fila' },
      campo('Mes', selectorPeriodo),
      h('div', {},
        h('div', { clase: 'kpi-etiqueta', texto: 'Total del periodo' }),
        h('div', { style: 'font-size:24px;font-weight:700', texto: moneda(datos.total) })
      ),
      datos.cerrado ? h('div', {}, chip(`Periodo cerrado el ${fecha(datos.cierre.cerrado_at)}`, 'verde')) : null
    ), [
      h('button', {
        clase: 'btn', onclick: () => api.descargar('/api/exportar/consumo_reyna')
      }, icono('descargar', 18), 'Exportar a Excel')
    ]));

    if (!datos.lineas.length) {
      cuerpo.appendChild(tarjeta(null, vacio('Sin consumos en el periodo', '', 'edificio')));
      return;
    }

    cuerpo.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('h2', { texto: `${datos.num_lineas} lineas` }),
        h('span', { clase: 'pequeno silencio', style: 'margin-left:auto',
          texto: 'El precio unitario es el vigente al momento de la entrega y no cambia despues.' })
      ),
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: 'Fecha' }, { titulo: 'Folio' }, { titulo: 'Trabajador' }, { titulo: 'Trailer' },
            { titulo: 'SKU' }, { titulo: 'Material' }, { titulo: 'Cantidad', num: true },
            { titulo: 'Precio', num: true }, { titulo: 'Importe', num: true },
            { titulo: 'Supervisor' }, { titulo: 'Almacenista' }],
          datos.lineas.slice(0, 400).map((l) => h('tr', {
            clase: l.vale_id ? 'clic' : '', onclick: l.vale_id ? () => ir(`/vales/${l.vale_id}`) : null
          },
            h('td', { clase: 'pequeno', texto: fechaHora(l.fecha) }),
            h('td', { clase: 'mono pequeno', texto: l.folio || '—' }),
            h('td', { clase: 'pequeno', texto: l.trabajador || '—' }),
            h('td', { clase: 'mono pequeno', texto: l.trailer || '—' }),
            h('td', { clase: 'mono pequeno', texto: l.sku }),
            h('td', { texto: l.material }),
            h('td', { clase: 'num' }, `${l.tipo === 'DEVOLUCION' ? '−' : ''}${numero(l.cantidad)} ${l.unidad}`),
            h('td', { clase: 'num mono', texto: moneda(l.precio) }),
            h('td', { clase: 'num mono negrita', style: l.importe < 0 ? 'color:var(--verde)' : '', texto: moneda(l.importe) }),
            h('td', { clase: 'pequeno silencio', texto: l.supervisor || '—' }),
            h('td', { clase: 'pequeno silencio', texto: l.almacenista || '—' })
          ))
        )
      ),
      h('div', { clase: 'tarjeta-pie' },
        h('span', { clase: 'negrita grande', texto: `Total: ${moneda(datos.total)}` }))
    ));
  }

  async function cierres() {
    const { cierres } = await api.get('/api/reyna/cierres');
    vaciar(cuerpo);

    const acciones = puede('reyna.cerrar')
      ? [h('button', { clase: 'btn btn-primario', onclick: nuevoCierre }, icono('candado', 18), 'Cerrar mes')]
      : null;

    cuerpo.appendChild(tarjeta('Cierres mensuales',
      cierres.length
        ? tabla(
          [{ titulo: 'Periodo' }, { titulo: 'Lineas', num: true }, { titulo: 'Total', num: true },
            { titulo: 'Ajustes posteriores', num: true }, { titulo: 'Total ajustado', num: true },
            { titulo: 'Cerrado por' }, { titulo: 'Fecha' }, puede('reyna.cerrar') ? { titulo: '' } : null].filter(Boolean),
          cierres.map((c) => h('tr', {},
            h('td', { clase: 'negrita', texto: c.periodo }),
            h('td', { clase: 'num', texto: numero(c.lineas) }),
            h('td', { clase: 'num mono', texto: moneda(c.total) }),
            h('td', { clase: 'num mono', texto: c.ajustes ? moneda(c.ajustes) : '—' }),
            h('td', { clase: 'num mono negrita', texto: moneda(c.total + (c.ajustes || 0)) }),
            h('td', { clase: 'pequeno', texto: c.cerrado_por_nombre || '—' }),
            h('td', { clase: 'pequeno', texto: fecha(c.cerrado_at) }),
            puede('reyna.cerrar')
              ? h('td', {}, h('button', { clase: 'btn btn-s', onclick: () => ajuste(c) }, 'Ajuste'))
              : null
          ))
        )
        : vacio('Sin cierres registrados', 'Cierre un mes para generar el estado de cuenta definitivo.', 'candado'),
      acciones, { sinRelleno: cierres.length > 0 }
    ));

    cuerpo.appendChild(h('div', { clase: 'aviso' },
      h('div', { clase: 'aviso-titulo', texto: 'Regla del cierre' }),
      h('div', { texto: 'Despues de cerrar un mes los movimientos no se modifican en silencio. Cualquier cambio posterior se registra como AJUSTE con motivo y queda en auditoria.' })
    ));

    async function nuevoCierre() {
      const hoy = new Date();
      const opciones = [];
      for (let i = 1; i <= 6; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 1);
        const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!cierres.find((c) => c.periodo === periodo)) opciones.push({ valor: periodo, texto: periodo });
      }
      if (!opciones.length) return avisoError('No hay periodos pendientes de cerrar');

      const sel = selector(opciones, { valor: opciones[0].valor });
      const notas = h('input', { type: 'text', placeholder: 'Notas del cierre (opcional)' });
      const resumen = h('div', { clase: 'aviso mt' });

      const actualizar = async () => {
        const d = await api.get('/api/reyna/estado-cuenta' + qs({ periodo: sel.value }));
        vaciar(resumen);
        resumen.appendChild(h('div', { clase: 'aviso-titulo', texto: `Periodo ${sel.value}` }));
        resumen.appendChild(h('div', { texto: `${d.num_lineas} lineas por un total de ${moneda(d.total)}` }));
      };
      sel.addEventListener('change', actualizar);
      actualizar();

      modal({
        titulo: 'Cerrar mes',
        cuerpo: h('div', {}, campo('Periodo', sel), campo('Notas', notas), resumen),
        acciones: [
          { texto: 'Cancelar' },
          {
            texto: 'Cerrar periodo',
            clase: 'btn-primario',
            accion: async (cerrar) => {
              try {
                const r = await api.post('/api/reyna/cierres', { periodo: sel.value, notas: notas.value.trim() });
                cerrar();
                avisoOk(`Periodo ${r.periodo} cerrado por ${moneda(r.total)}`);
                cargar();
              } catch (err) { avisoError(err.message); }
            }
          }
        ]
      });
    }

    async function ajuste(cierre) {
      const importe = h('input', { type: 'number', step: '0.01', placeholder: '0.00' });
      const motivo = h('textarea', { rows: 2, placeholder: 'Motivo del ajuste (obligatorio)' });
      modal({
        titulo: `Ajuste al cierre ${cierre.periodo}`,
        cuerpo: h('div', {},
          h('div', { clase: 'aviso', texto: 'El movimiento original no se modifica. El ajuste queda registrado por separado y en auditoria.' }),
          campo('Importe del ajuste (positivo o negativo)', importe),
          campo('Motivo', motivo)
        ),
        acciones: [
          { texto: 'Cancelar' },
          {
            texto: 'Registrar ajuste',
            clase: 'btn-primario',
            accion: async (cerrarModal) => {
              if (!motivo.value.trim()) return avisoError('El motivo es obligatorio');
              try {
                await api.post(`/api/reyna/cierres/${cierre.id}/ajuste`, {
                  importe: Number(importe.value), motivo: motivo.value.trim()
                });
                cerrarModal();
                avisoOk('Ajuste registrado');
                cargar();
              } catch (err) { avisoError(err.message); }
            }
          }
        ]
      });
    }
  }

  async function trabajadores() {
    const { trabajadores } = await api.get('/api/reyna/trabajadores');
    vaciar(cuerpo);
    cuerpo.appendChild(tarjeta('Personal de la empresa externa',
      tabla(
        [{ titulo: 'Clave' }, { titulo: 'Nombre' }, { titulo: 'Rol' }, { titulo: 'Area' },
          { titulo: 'Vales', num: true }, { titulo: 'Consumo', num: true }, { titulo: 'Estado' }],
        trabajadores.map((t) => h('tr', {},
          h('td', { clase: 'mono pequeno', texto: t.employee_id }),
          h('td', { clase: 'negrita', texto: t.nombre }),
          h('td', {}, chip(t.rol, t.rol === 'SUPERVISOR' ? 'azul' : 'gris')),
          h('td', { clase: 'pequeno', texto: t.area || '—' }),
          h('td', { clase: 'num', texto: numero(t.vales) }),
          h('td', { clase: 'num mono', texto: moneda(t.importe) }),
          h('td', {}, chip(t.activo ? 'Activo' : 'Inactivo', t.activo ? 'verde' : 'gris'))
        ))
      ), null, { sinRelleno: true }
    ));
  }
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function mesCorto(periodo) {
  const [anio, mes] = String(periodo).split('-');
  return `${MESES[Number(mes) - 1] || mes} ${anio.slice(2)}`;
}
