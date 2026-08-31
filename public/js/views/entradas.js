/** Entradas de almacen: material recibido de proveedores. */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, numero, moneda, fechaHora, cargando, vacio, tabla,
  campo, selector, modal, avisoOk, avisoError, chip
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';

export async function render() {
  tituloVista('Entradas de almacen', 'Material recibido y alta de existencias');

  const catalogos = await api.get('/api/catalogos');
  const contenedor = h('div', { clase: 'columna' });
  const lista = h('div');

  contenedor.appendChild(h('div', { clase: 'tarjeta' },
    h('div', { clase: 'tarjeta-cabecera' },
      h('h2', { texto: 'Entradas registradas' }),
      puede('inventario.entradas')
        ? h('button', { clase: 'btn btn-primario', style: 'margin-left:auto', onclick: nuevaEntrada }, icono('entrada', 18), 'Registrar entrada')
        : null
    )
  ));
  contenedor.appendChild(lista);
  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(lista);
    lista.appendChild(cargando());
    const { entradas } = await api.get('/api/entradas');
    vaciar(lista);

    if (!entradas.length) {
      lista.appendChild(tarjeta(null, vacio('Sin entradas registradas', '', 'entrada')));
      return;
    }

    lista.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: 'Folio' }, { titulo: 'Fecha' }, { titulo: 'Proveedor' }, { titulo: 'Orden de compra' },
            { titulo: 'Lineas', num: true }, { titulo: 'Total', num: true }, { titulo: 'Registro' }],
          entradas.map((e) => h('tr', { clase: 'clic', onclick: () => verEntrada(e.id) },
            h('td', { clase: 'mono negrita', texto: e.folio }),
            h('td', { clase: 'pequeno', texto: fechaHora(e.fecha) }),
            h('td', { texto: e.proveedor || '—' }),
            h('td', { clase: 'mono pequeno', texto: e.orden_compra || '—' }),
            h('td', { clase: 'num', texto: numero(e.num_lineas) }),
            h('td', { clase: 'num mono', texto: moneda(e.total) }),
            h('td', { clase: 'pequeno silencio', texto: e.usuario })
          ))
        )
      )
    ));
  }

  async function verEntrada(id) {
    const { entrada, items } = await api.get(`/api/entradas/${id}`);
    modal({
      titulo: `Entrada ${entrada.folio}`,
      ancho: 'ancho',
      cuerpo: h('div', {},
        h('div', { clase: 'rejilla c3 mb' },
          h('div', {}, h('div', { clase: 'kpi-etiqueta', texto: 'Proveedor' }), h('div', { clase: 'negrita', texto: entrada.proveedor || '—' })),
          h('div', {}, h('div', { clase: 'kpi-etiqueta', texto: 'Orden de compra' }), h('div', { clase: 'negrita', texto: entrada.orden_compra || '—' })),
          h('div', {}, h('div', { clase: 'kpi-etiqueta', texto: 'Fecha' }), h('div', { clase: 'negrita', texto: fechaHora(entrada.fecha) }))
        ),
        tabla([{ titulo: 'Material' }, { titulo: 'Cantidad', num: true }, { titulo: 'Costo', num: true }, { titulo: 'Importe', num: true }],
          items.map((i) => h('tr', {},
            h('td', {}, h('div', { texto: i.nombre }), h('div', { clase: 'pequeno silencio mono', texto: i.sku })),
            h('td', { clase: 'num negrita' }, `${numero(i.cantidad)} ${i.unidad || ''}`),
            h('td', { clase: 'num mono', texto: moneda(i.costo) }),
            h('td', { clase: 'num mono', texto: moneda(i.cantidad * i.costo) })
          )), { compacta: true })
      ),
      acciones: [{ texto: 'Cerrar' }]
    });
  }

  function nuevaEntrada() {
    const lineas = [];
    const proveedor = selector(catalogos.proveedores.map((p) => ({ valor: p.id, texto: p.nombre })), { vacio: 'Sin proveedor' });
    const orden = h('input', { type: 'text', placeholder: 'OC-2026-0001' });
    const notas = h('input', { type: 'text', placeholder: 'Notas (opcional)' });
    const tablaLineas = h('div');
    const buscador = h('input', { type: 'search', placeholder: 'Buscar material para agregar...' });
    const resultados = h('div', { clase: 'resultados oculto' });

    let temporizador;
    buscador.addEventListener('input', () => {
      clearTimeout(temporizador);
      const q = buscador.value.trim();
      if (q.length < 2) return resultados.classList.add('oculto');
      temporizador = setTimeout(async () => {
        const { materiales } = await api.get(`/api/materiales?q=${encodeURIComponent(q)}&limit=15`);
        vaciar(resultados);
        for (const m of materiales) {
          resultados.appendChild(h('button', {
            clase: 'resultado', type: 'button',
            onclick: () => {
              if (!lineas.find((l) => l.material.id === m.id)) {
                lineas.push({ material: m, cantidad: 1, costo: m.costo ?? 0 });
                pintarLineas();
              }
              buscador.value = '';
              resultados.classList.add('oculto');
            }
          },
            h('div', { style: 'flex:1' },
              h('div', { clase: 'resultado-nombre', texto: m.nombre }),
              h('div', { clase: 'resultado-meta', texto: `${m.sku} · existencia ${numero(m.stock_fisico)} ${m.unidad}` })
            )
          ));
        }
        resultados.classList.remove('oculto');
      }, 220);
    });

    function pintarLineas() {
      vaciar(tablaLineas);
      if (!lineas.length) {
        tablaLineas.appendChild(h('div', { clase: 'vacio', style: 'padding:24px', texto: 'Agregue materiales a la entrada' }));
        return;
      }
      tablaLineas.appendChild(tabla(
        [{ titulo: 'Material' }, { titulo: 'Cantidad', num: true }, { titulo: 'Costo unitario', num: true }, { titulo: '' }],
        lineas.map((l, i) => {
          const cantidad = h('input', {
            type: 'number', min: '0.01', step: '0.01', valor: String(l.cantidad), style: 'width:100px',
            onchange: () => { l.cantidad = Number(cantidad.value) || 0; }
          });
          const costo = h('input', {
            type: 'number', min: '0', step: '0.01', valor: String(l.costo), style: 'width:110px',
            onchange: () => { l.costo = Number(costo.value) || 0; }
          });
          return h('tr', {},
            h('td', {}, h('div', { texto: l.material.nombre }), h('div', { clase: 'pequeno silencio mono', texto: l.material.sku })),
            h('td', { clase: 'num' }, cantidad),
            h('td', { clase: 'num' }, costo),
            h('td', {}, h('button', {
              clase: 'btn btn-plano btn-icono',
              onclick: () => { lineas.splice(i, 1); pintarLineas(); }
            }, icono('basura', 18)))
          );
        }), { compacta: true }
      ));
    }
    pintarLineas();

    modal({
      titulo: 'Registrar entrada de almacen',
      ancho: 'ancho',
      cuerpo: h('div', {},
        h('div', { clase: 'fila' }, campo('Proveedor', proveedor), campo('Orden de compra', orden), campo('Notas', notas)),
        h('div', { clase: 'campo' }, h('label', { texto: 'Agregar material' }), buscador, resultados),
        tablaLineas,
        h('div', { clase: 'aviso mt', texto: 'Al guardar, el inventario aumenta y se registra un movimiento de ENTRADA por cada material. Si el costo cambia, se guarda como nuevo costo vigente sin alterar los precios historicos ya usados.' })
      ),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Registrar entrada',
          clase: 'btn-primario',
          accion: async (cerrar) => {
            if (!lineas.length) return avisoError('Agregue al menos un material');
            try {
              const r = await api.post('/api/entradas', {
                proveedor_id: proveedor.value ? Number(proveedor.value) : null,
                orden_compra: orden.value.trim(), notas: notas.value.trim(),
                items: lineas.map((l) => ({ material_id: l.material.id, cantidad: l.cantidad, costo: l.costo }))
              });
              cerrar();
              avisoOk(`Entrada ${r.folio} registrada`);
              cargar();
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }
}
