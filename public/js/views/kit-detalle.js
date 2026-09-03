/** Detalle de un kit y su historial de versiones. */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chip, numero, moneda, fechaHora, cargando, tabla,
  avisoOk, avisoError, confirmar, semaforo, alEscribir
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';
import { editorKit } from './kits.js';

export async function render({ params }) {
  const contenedor = h('div', { clase: 'columna' });
  await pintar();
  return contenedor;

  async function pintar(versionId = null) {
    vaciar(contenedor);
    contenedor.appendChild(cargando());
    const [datos, catalogos] = await Promise.all([
      api.get(`/api/kits/${params.id}`),
      api.get('/api/catalogos')
    ]);
    const { kit, versiones, version_vigente } = datos;
    let items = datos.items;
    let versionMostrada = version_vigente;

    if (versionId && versionId !== (version_vigente && version_vigente.id)) {
      const r = await api.get(`/api/kits/version/${versionId}`);
      items = r.items;
      versionMostrada = versiones.find((v) => v.id === versionId);
    }

    tituloVista(kit.nombre, `${kit.codigo} · ${kit.area_nombre || 'Sin area'}`);
    vaciar(contenedor);

    const verCostos = puede('costos.leer');
    const total = items.reduce((s, i) => s + (i.costo_linea || 0), 0);

    const acciones = [];
    if (puede('kits.escribir')) {
      acciones.push(h('button', {
        clase: 'btn btn-primario',
        onclick: () => editorKit(catalogos, kit, () => pintar(), items)
      }, icono('mas', 18), 'Nueva version'));
      acciones.push(h('button', {
        clase: 'btn',
        onclick: alEscribir(async () => {
          const ok = await confirmar({
            titulo: kit.activo ? 'Desactivar kit' : 'Activar kit',
            mensaje: kit.activo
              ? 'El kit dejara de aparecer al crear vales. Los vales historicos no se modifican.'
              : 'El kit volvera a estar disponible al crear vales.',
            textoOk: kit.activo ? 'Desactivar' : 'Activar'
          });
          if (!ok) return;
          try {
            await api.put(`/api/kits/${kit.id}`, { activo: !kit.activo });
            avisoOk('Kit actualizado');
            pintar();
          } catch (err) { avisoError(err.message); }
        })
      }, kit.activo ? 'Desactivar' : 'Activar'));
    }

    contenedor.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('div', {},
          h('div', { clase: 'gap-s' },
            h('h2', { texto: kit.nombre }),
            chip(`Version ${versionMostrada ? versionMostrada.version : 1}`, 'acento'),
            versionMostrada && versionMostrada.estado === 'HISTORICA' ? chip('Historica', 'gris') : chip('Vigente', 'verde'),
            kit.activo ? null : chip('Kit inactivo', 'gris')
          ),
          h('div', { clase: 'pequeno silencio mt', texto: kit.descripcion || kit.codigo })
        ),
        h('div', { clase: 'gap', style: 'margin-left:auto' }, acciones)
      ),
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: 'SKU' }, { titulo: 'Material' }, { titulo: 'Cantidad estandar', num: true },
            { titulo: 'Unidad' }, { titulo: 'Disponible', num: true },
            verCostos ? { titulo: 'Costo linea', num: true } : null].filter(Boolean),
          items.map((i) => h('tr', {},
            h('td', { clase: 'mono pequeno', texto: i.sku }),
            h('td', { clase: 'negrita', texto: i.nombre }),
            h('td', { clase: 'num negrita', texto: numero(i.cantidad_estandar) }),
            h('td', { clase: 'pequeno', texto: i.unidad }),
            h('td', { clase: 'num' }, h('div', { clase: `semaforo ${i.semaforo || 'NORMAL'}`, style: 'justify-content:flex-end' },
              numero(i.disponible ?? 0))),
            verCostos ? h('td', { clase: 'num mono', texto: moneda(i.costo_linea || 0) }) : null
          ))
        )
      ),
      verCostos ? h('div', { clase: 'tarjeta-pie' },
        h('span', { clase: 'negrita', texto: `Costo estandar del kit: ${moneda(total)}` }),
        h('span', { clase: 'pequeno silencio', texto: 'Calculado con el costo vigente de cada material.' })
      ) : null
    ));

    contenedor.appendChild(tarjeta('Versiones del kit',
      tabla(
        [{ titulo: 'Version' }, { titulo: 'Estado' }, { titulo: 'Creada' }, { titulo: 'Usos en vales', num: true },
          { titulo: 'Notas' }, { titulo: '' }],
        versiones.map((v) => h('tr', {},
          h('td', { clase: 'negrita', texto: `V${v.version}` }),
          h('td', {}, chip(v.estado === 'VIGENTE' ? 'Vigente' : 'Historica', v.estado === 'VIGENTE' ? 'verde' : 'gris')),
          h('td', { clase: 'pequeno', texto: fechaHora(v.created_at) }),
          h('td', { clase: 'num', texto: numero(v.usos) }),
          h('td', { clase: 'pequeno silencio', texto: v.notas || '—' }),
          h('td', {}, h('button', { clase: 'btn btn-s', onclick: () => pintar(v.id) }, 'Ver contenido'))
        ))
      ), null, { sinRelleno: true }
    ));
  }
}
