/** Ficha de un material: existencias, alias, costos historicos y movimientos. */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, kpi, chip, numero, moneda, fechaHora, semaforo,
  cargando, tabla, avisoOk
} from '../ui.js';
import { tituloVista, puede } from '../app.js';
import { formularioMaterial, formularioAjuste } from './inventario.js';

export async function render({ params }) {
  const contenedor = h('div', { clase: 'columna' });
  await pintar();
  return contenedor;

  async function pintar() {
    vaciar(contenedor);
    contenedor.appendChild(cargando());
    const [{ material, alias, movimientos, historial_costos }, catalogos] = await Promise.all([
      api.get(`/api/materiales/${params.id}`),
      api.get('/api/catalogos')
    ]);
    tituloVista(material.nombre, `${material.sku} · ${material.categoria || 'Sin categoria'}`);
    vaciar(contenedor);

    const verCostos = puede('costos.leer');
    const acciones = [];
    if (puede('catalogo.escribir')) {
      acciones.push(h('button', {
        clase: 'btn',
        onclick: () => formularioMaterial(catalogos, { ...material, alias: alias.map((a) => a.alias) }, pintar)
      }, 'Editar material'));
    }
    if (puede('inventario.ajustes')) {
      acciones.push(h('button', { clase: 'btn', onclick: () => formularioAjuste(pintar, material) }, 'Ajuste'));
    }

    contenedor.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('div', {},
          h('div', { clase: 'gap-s' }, h('h2', { texto: material.nombre }), semaforo(material.semaforo),
            material.activo ? null : chip('Inactivo', 'gris')),
          h('div', { clase: 'pequeno silencio mono mt', texto: material.sku })
        ),
        h('div', { clase: 'gap', style: 'margin-left:auto' }, acciones)
      ),
      h('div', { clase: 'tarjeta-cuerpo' },
        h('div', { clase: 'rejilla c4' },
          kpi('Stock fisico', `${numero(material.stock_fisico)} ${material.unidad}`),
          kpi('Comprometido', numero(material.comprometido), 'Autorizado sin entregar', 'ambar'),
          kpi('Disponible', numero(material.disponible), 'Fisico menos comprometido', 'verde'),
          verCostos ? kpi('Valor', moneda(material.valor), `${moneda(material.costo)} por ${material.unidad}`, 'acento') : null,
          kpi('Minimo', numero(material.stock_min)),
          kpi('Maximo', numero(material.stock_max)),
          kpi('Punto de reorden', numero(material.punto_reorden)),
          kpi('Ubicacion', material.ubicacion || '—', material.proveedor || '')
        ),
        alias.length ? h('div', { clase: 'mt' },
          h('div', { clase: 'kpi-etiqueta mb', texto: 'Alias reconocidos en planta' }),
          h('div', { clase: 'gap-s' }, alias.map((a) => chip(a.alias, 'acento')))
        ) : null,
        material.descripcion ? h('div', { clase: 'aviso mt', texto: material.descripcion }) : null
      )
    ));

    if (verCostos && historial_costos.length) {
      contenedor.appendChild(tarjeta('Historial de costos',
        tabla([{ titulo: 'Vigente desde' }, { titulo: 'Costo', num: true }, { titulo: 'Motivo' }],
          historial_costos.map((c) => h('tr', {},
            h('td', { clase: 'pequeno', texto: fechaHora(c.vigente_desde) }),
            h('td', { clase: 'num mono negrita', texto: moneda(c.costo) }),
            h('td', { clase: 'pequeno silencio', texto: c.motivo || '—' })
          )), { compacta: true }),
        null, { sinRelleno: true }
      ));
      contenedor.lastChild.appendChild(h('div', { clase: 'tarjeta-pie' },
        h('span', { clase: 'pequeno silencio',
          texto: 'El precio usado en una entrega no cambia retroactivamente: cada vale conserva el costo del dia en que se entrego.' })
      ));
    }

    if (movimientos.length) {
      contenedor.appendChild(tarjeta('Ultimos movimientos',
        tabla(
          [{ titulo: 'Fecha' }, { titulo: 'Tipo' }, { titulo: 'Cantidad', num: true },
            { titulo: 'Antes', num: true }, { titulo: 'Despues', num: true },
            { titulo: 'Folio' }, { titulo: 'Usuario' }, { titulo: 'Motivo' }],
          movimientos.map((m) => h('tr', {},
            h('td', { clase: 'pequeno', texto: fechaHora(m.created_at) }),
            h('td', {}, chip(m.tipo, m.signo > 0 ? 'verde' : 'rojo')),
            h('td', { clase: 'num negrita' }, `${m.signo > 0 ? '+' : '−'}${numero(m.cantidad)}`),
            h('td', { clase: 'num silencio', texto: numero(m.stock_antes) }),
            h('td', { clase: 'num', texto: numero(m.stock_despues) }),
            h('td', { clase: 'mono pequeno', texto: m.folio || '—' }),
            h('td', { clase: 'pequeno', texto: m.usuario }),
            h('td', { clase: 'pequeno silencio', texto: m.motivo || '—' })
          )), { compacta: true }
        ), null, { sinRelleno: true }
      ));
    }
  }
}
