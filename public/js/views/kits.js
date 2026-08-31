/** Kits maestros: conjuntos predeterminados de materiales, con versiones. */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chip, numero, moneda, cargando, vacio, campo, selector,
  modal, avisoOk, avisoError, tabla
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';
import { ir } from '../router.js';

export async function render() {
  tituloVista('Kits', 'Conjuntos estandar de materiales por proceso');

  const contenedor = h('div', { clase: 'columna' });
  const lista = h('div');
  const catalogos = await api.get('/api/catalogos');

  contenedor.appendChild(h('div', { clase: 'tarjeta' },
    h('div', { clase: 'tarjeta-cabecera' },
      h('div', {},
        h('h2', { texto: 'Kits configurados' }),
        h('div', { clase: 'pequeno silencio',
          texto: 'La cantidad estandar es la configuracion tipica; el trabajador puede ajustarla en cada vale sin modificar el kit.' })
      ),
      puede('kits.escribir')
        ? h('button', { clase: 'btn btn-primario', style: 'margin-left:auto', onclick: () => editorKit(catalogos, null, cargar) }, icono('mas', 18), 'Nuevo kit')
        : null
    )
  ));
  contenedor.appendChild(lista);
  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(lista);
    lista.appendChild(cargando());
    const { kits } = await api.get('/api/kits?incluir_inactivos=1');
    vaciar(lista);

    if (!kits.length) {
      lista.appendChild(tarjeta(null, vacio('Sin kits', 'Cree el primer kit desde el boton superior.', 'kit')));
      return;
    }

    lista.appendChild(h('div', { clase: 'rejilla c3' },
      kits.map((k) => h('button', {
        clase: 'accion-grande', onclick: () => ir(`/kits/${k.id}`), style: 'min-height:150px'
      },
        h('div', { clase: 'gap-s' },
          h('span', { clase: 'titulo', texto: k.nombre }),
          k.activo ? null : chip('Inactivo', 'gris')
        ),
        h('div', { clase: 'sub mono', texto: k.codigo }),
        h('div', { clase: 'gap-s', style: 'margin-top:8px' },
          chip(`Version ${k.version || 1}`, 'acento'),
          chip(`${k.num_materiales || 0} materiales`, 'gris'),
          k.area_nombre ? chip(k.area_nombre, 'azul') : null
        ),
        k.costo_estandar !== undefined
          ? h('div', { clase: 'sub', style: 'margin-top:8px', texto: `Costo estandar: ${moneda(k.costo_estandar)}` })
          : null
      ))
    ));
  }
}

/** Editor de kit: alta o nueva version. */
export function editorKit(catalogos, kit, alTerminar, itemsIniciales = []) {
  const esNuevo = !kit;
  const codigo = h('input', { type: 'text', valor: kit ? kit.codigo : '', disabled: !esNuevo, placeholder: 'KIT-XXX' });
  const nombre = h('input', { type: 'text', valor: kit ? kit.nombre : '', placeholder: 'Kit Mini Split' });
  const area = selector(catalogos.areas.map((a) => ({ valor: a.id, texto: a.nombre })),
    { valor: kit ? kit.area_id : '', vacio: 'Sin area' });
  const descripcion = h('input', { type: 'text', valor: kit && kit.descripcion ? kit.descripcion : '' });
  const notas = h('input', { type: 'text', placeholder: esNuevo ? 'Version inicial' : 'Motivo de la nueva version' });

  const items = itemsIniciales.map((i) => ({
    material_id: i.material_id, nombre: i.nombre, sku: i.sku, unidad: i.unidad,
    cantidad_estandar: i.cantidad_estandar
  }));

  const tablaItems = h('div');
  const buscador = h('input', { type: 'search', placeholder: 'Buscar material para agregar al kit...' });
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
            if (!items.find((i) => i.material_id === m.id)) {
              items.push({ material_id: m.id, nombre: m.nombre, sku: m.sku, unidad: m.unidad, cantidad_estandar: 1 });
              pintarItems();
            }
            buscador.value = '';
            resultados.classList.add('oculto');
          }
        },
          h('div', { style: 'flex:1' },
            h('div', { clase: 'resultado-nombre', texto: m.nombre }),
            h('div', { clase: 'resultado-meta', texto: `${m.sku} · ${m.unidad}` })
          )
        ));
      }
      resultados.classList.remove('oculto');
    }, 220);
  });

  function pintarItems() {
    vaciar(tablaItems);
    if (!items.length) {
      tablaItems.appendChild(h('div', { clase: 'vacio', style: 'padding:24px', texto: 'Agregue los materiales del kit' }));
      return;
    }
    tablaItems.appendChild(tabla(
      [{ titulo: 'Material' }, { titulo: 'Cantidad estandar', num: true }, { titulo: '' }],
      items.map((it, i) => {
        const input = h('input', {
          type: 'number', min: '0.01', step: '0.01', valor: String(it.cantidad_estandar), style: 'width:120px',
          onchange: () => { it.cantidad_estandar = Number(input.value) || 0; }
        });
        return h('tr', {},
          h('td', {}, h('div', { texto: it.nombre }), h('div', { clase: 'pequeno silencio mono', texto: `${it.sku} · ${it.unidad}` })),
          h('td', { clase: 'num' }, input),
          h('td', {}, h('button', { clase: 'btn btn-plano btn-icono', onclick: () => { items.splice(i, 1); pintarItems(); } }, icono('basura', 18)))
        );
      }), { compacta: true }
    ));
  }
  pintarItems();

  modal({
    titulo: esNuevo ? 'Nuevo kit' : `Nueva version de ${kit.nombre}`,
    ancho: 'ancho',
    cuerpo: h('div', {},
      esNuevo ? h('div', { clase: 'fila' }, campo('Codigo', codigo), campo('Nombre', nombre), campo('Area', area)) : null,
      esNuevo ? campo('Descripcion', descripcion) : h('div', { clase: 'aviso' },
        'Los vales anteriores conservan la version que utilizaron. Esta nueva version aplicara solo a los vales futuros.'),
      campo(esNuevo ? 'Notas de la version' : 'Motivo del cambio', notas),
      h('div', { clase: 'campo' }, h('label', { texto: 'Agregar material' }), buscador, resultados),
      tablaItems
    ),
    acciones: [
      { texto: 'Cancelar' },
      {
        texto: esNuevo ? 'Crear kit' : 'Crear nueva version',
        clase: 'btn-primario',
        accion: async (cerrar) => {
          if (!items.length) return avisoError('El kit debe incluir al menos un material');
          const cuerpoItems = items.map((i) => ({ material_id: i.material_id, cantidad_estandar: i.cantidad_estandar }));
          try {
            if (esNuevo) {
              if (!codigo.value.trim() || !nombre.value.trim()) return avisoError('Codigo y nombre son obligatorios');
              await api.post('/api/kits', {
                codigo: codigo.value.trim(), nombre: nombre.value.trim(),
                area_id: area.value ? Number(area.value) : null,
                descripcion: descripcion.value.trim(), notas: notas.value.trim(), items: cuerpoItems
              });
            } else {
              await api.post(`/api/kits/${kit.id}/versiones`, { notas: notas.value.trim(), items: cuerpoItems });
            }
            cerrar();
            avisoOk(esNuevo ? 'Kit creado' : 'Nueva version creada');
            alTerminar();
          } catch (err) { avisoError(err.message); }
        }
      }
    ]
  });
}
