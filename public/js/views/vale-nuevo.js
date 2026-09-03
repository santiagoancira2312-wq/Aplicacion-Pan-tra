/**
 * Crear vale.
 * Objetivo: menos de un minuto. Folio, trabajador, empresa, area, supervisor,
 * fecha y hora son automaticos; el trabajador solo elige TRAILER y MATERIALES/KITS.
 */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, campo, aviso, avisoError, avisoOk, chip, numero,
  controlCantidad, modal, confirmar, cargando, vacio
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, estado } from '../app.js';
import { ir } from '../router.js';

export async function render() {
  tituloVista('Crear vale', 'Seleccione el trailer y agregue materiales o kits');

  const [catalogos, kitsResp] = await Promise.all([
    api.get('/api/catalogos'),
    api.get('/api/kits')
  ]);
  const kits = kitsResp.kits.filter((k) => k.version_id);

  // Estado del vale en edicion.
  const borrador = {
    trailer_id: null,
    prioridad: 'NORMAL',
    notas: '',
    sueltos: [],   // { material, cantidad }
    kits: []       // { kit, items: [{ material, estandar, cantidad }] }
  };

  const contenedor = h('div', { clase: 'columna' });
  const pasoTrailer = h('div');
  const pasoContenido = h('div');
  const resumen = h('div', { clase: 'resumen-vale' });

  // ------------------------------------------------------------ Paso 1
  function pintarTrailer() {
    vaciar(pasoTrailer);
    const seleccionado = catalogos.trailers.find((t) => t.id === borrador.trailer_id);

    if (seleccionado) {
      pasoTrailer.appendChild(tarjeta(null, h('div', { clase: 'gap' },
        h('div', { style: 'flex:1' },
          h('div', { clase: 'kpi-etiqueta', texto: 'Trailer seleccionado' }),
          h('div', { style: 'font-size:22px;font-weight:700' }, `Trailer ${seleccionado.numero}`),
          h('div', { clase: 'silencio pequeno', texto: [seleccionado.modelo, seleccionado.cliente].filter(Boolean).join(' · ') })
        ),
        h('button', { clase: 'btn', onclick: () => { borrador.trailer_id = null; pintarTrailer(); pintarContenido(); } }, 'Cambiar')
      )));
      return;
    }

    pasoTrailer.appendChild(tarjeta('1. Numero de trailer',
      h('div', { clase: 'acciones-grandes' },
        catalogos.trailers.map((t) => h('button', {
          clase: 'accion-grande',
          style: 'min-height:104px',
          onclick: () => { borrador.trailer_id = t.id; pintarTrailer(); pintarContenido(); }
        },
          h('div', { clase: 'titulo', texto: `Trailer ${t.numero}` }),
          h('div', { clase: 'sub', texto: t.cliente || t.modelo || '' }),
          h('div', { style: 'margin-top:6px' }, chip(t.estado === 'EN_PROCESO' ? 'En proceso' : 'Planeado',
            t.estado === 'EN_PROCESO' ? 'verde' : 'gris'))
        ))
      )
    ));
  }

  // ------------------------------------------------------------ Paso 2
  function pintarContenido() {
    vaciar(pasoContenido);
    if (!borrador.trailer_id) {
      pasoContenido.appendChild(tarjeta('2. Materiales y kits',
        h('div', { clase: 'vacio', texto: 'Primero seleccione el numero de trailer.' })));
      pintarResumen();
      return;
    }

    // Buscador de materiales con alias.
    const resultados = h('div', { clase: 'resultados oculto' });
    const buscador = h('input', {
      type: 'search', placeholder: 'Buscar material por nombre, SKU o apodo...',
      'aria-label': 'Buscar material'
    });
    let temporizador;
    buscador.addEventListener('input', () => {
      clearTimeout(temporizador);
      const q = buscador.value.trim();
      if (q.length < 2) { resultados.classList.add('oculto'); return; }
      temporizador = setTimeout(() => buscar(q), 200);
    });

    async function buscar(q) {
      try {
        const { materiales } = await api.get(`/api/materiales?q=${encodeURIComponent(q)}&limit=25`);
        vaciar(resultados);
        if (!materiales.length) {
          resultados.appendChild(h('div', { clase: 'vacio', style: 'padding:26px' },
            h('div', { clase: 'vacio-titulo', texto: 'Sin coincidencias' }),
            h('div', { clase: 'pequeno', texto: 'El material debe existir en el catalogo. Consulte a su supervisor.' })
          ));
        }
        for (const m of materiales) {
          const coincideAlias = m.alias.find((a) => a.toLowerCase().includes(q.toLowerCase()));
          resultados.appendChild(h('button', {
            clase: 'resultado', type: 'button',
            onclick: () => { agregarSuelto(m); buscador.value = ''; resultados.classList.add('oculto'); }
          },
            h('div', { style: 'flex:1;min-width:0' },
              h('div', { clase: 'resultado-nombre', texto: m.nombre }),
              h('div', { clase: 'resultado-meta' }, `${m.sku} · ${m.unidad} · Disponible: ${numero(m.disponible)}`),
              coincideAlias ? h('div', { clase: 'resultado-alias', texto: `tambien conocido como "${coincideAlias}"` }) : null
            ),
            h('span', { clase: `semaforo ${m.semaforo}` }),
            h('span', { clase: 'btn btn-s btn-primario', texto: 'Agregar' })
          ));
        }
        resultados.classList.remove('oculto');
      } catch (err) { avisoError(err.message); }
    }

    pasoContenido.appendChild(tarjeta('2. Materiales y kits',
      h('div', {},
        h('div', { clase: 'gap mb' },
          h('button', { clase: 'btn btn-primario', onclick: elegirKit }, icono('kit', 18), 'Agregar kit'),
          kits.length ? h('span', { clase: 'silencio pequeno', texto: `${kits.length} kits disponibles` }) : null
        ),
        h('div', { clase: 'buscador' },
          h('span', { clase: 'lupa' }, icono('lupa', 17)), buscador
        ),
        resultados
      )
    ));

    pintarLineas();
    pintarResumen();
  }

  // ------------------------------------------------------------ Kits
  function elegirKit() {
    const cuerpo = h('div', { clase: 'columna' });
    const { cerrar } = modal({
      titulo: 'Agregar kit al vale',
      ancho: 'ancho',
      cuerpo,
      acciones: [{ texto: 'Cerrar' }]
    });

    if (!kits.length) {
      cuerpo.appendChild(vacio('Sin kits disponibles', 'El administrador puede crearlos desde el catalogo.', 'kit'));
      return;
    }

    for (const k of kits) {
      cuerpo.appendChild(h('button', {
        clase: 'lista-item', type: 'button',
        onclick: async () => { cerrar(); await agregarKit(k); }
      },
        h('div', { clase: 'lista-item-cuerpo' },
          h('div', { clase: 'lista-item-titulo', texto: k.nombre }),
          h('div', { clase: 'lista-item-sub' },
            `${k.codigo} · Version ${k.version} · ${k.num_materiales} materiales${k.area_nombre ? ' · ' + k.area_nombre : ''}`)
        ),
        h('span', { clase: 'btn btn-s btn-primario', texto: 'Agregar' })
      ));
    }
  }

  async function agregarKit(k) {
    try {
      const { items } = await api.get(`/api/kits/version/${k.version_id}`);
      borrador.kits.push({
        kit: k,
        items: items.map((i) => ({
          material_id: i.material_id, sku: i.sku, nombre: i.nombre, unidad: i.unidad,
          disponible: i.disponible, semaforo: i.semaforo,
          estandar: i.cantidad_estandar, cantidad: i.cantidad_estandar
        }))
      });
      avisoOk(`${k.nombre} agregado. Puede ajustar las cantidades para este vale.`);
      pintarLineas();
      pintarResumen();
    } catch (err) { avisoError(err.message); }
  }

  function agregarSuelto(m) {
    const existente = borrador.sueltos.find((s) => s.material.id === m.id);
    if (existente) {
      existente.cantidad += 1;
      aviso(`${m.nombre}: cantidad actualizada`);
    } else {
      borrador.sueltos.push({ material: m, cantidad: 1 });
    }
    pintarLineas();
    pintarResumen();
  }

  // ------------------------------------------------------------ Lineas
  const lineas = h('div');

  function pintarLineas() {
    vaciar(lineas);
    if (!borrador.sueltos.length && !borrador.kits.length) {
      lineas.appendChild(tarjeta('Contenido del vale',
        vacio('Todavia no hay materiales', 'Busque un material o agregue un kit completo.', 'caja')));
      return;
    }

    const bloques = [];

    for (const [indice, k] of borrador.kits.entries()) {
      bloques.push(h('div', {},
        h('div', { clase: 'kit-encabezado' },
          icono('kit', 16),
          h('span', { texto: `${k.kit.nombre} · V${k.kit.version}` }),
          h('button', {
            clase: 'btn btn-s btn-plano',
            onclick: () => { borrador.kits.splice(indice, 1); pintarLineas(); pintarResumen(); }
          }, 'Quitar kit')
        ),
        k.items.map((it, i) => lineaEditable(it, {
          alCambiar: (v) => { it.cantidad = v; pintarResumen(); },
          alQuitar: () => { k.items.splice(i, 1); if (!k.items.length) borrador.kits.splice(indice, 1); pintarLineas(); pintarResumen(); },
          estandar: it.estandar
        }))
      ));
    }

    if (borrador.sueltos.length) {
      bloques.push(h('div', {},
        h('div', { clase: 'kit-encabezado', style: 'background:var(--superficie-2);color:var(--texto-2)' },
          icono('caja', 16), h('span', { texto: 'Materiales individuales' })),
        borrador.sueltos.map((s, i) => lineaEditable({
          nombre: s.material.nombre, sku: s.material.sku, unidad: s.material.unidad,
          disponible: s.material.disponible, semaforo: s.material.semaforo, cantidad: s.cantidad
        }, {
          alCambiar: (v) => { s.cantidad = v; pintarResumen(); },
          alQuitar: () => { borrador.sueltos.splice(i, 1); pintarLineas(); pintarResumen(); }
        }))
      ));
    }

    lineas.appendChild(tarjeta('3. Cantidades', h('div', {}, bloques), null, { sinRelleno: true }));
  }

  function lineaEditable(it, { alCambiar, alQuitar, estandar = null }) {
    const nota = h('span', { clase: 'pequeno', style: 'color:var(--acento-fuerte)' });
    const actualizarNota = (v) => {
      nota.textContent = estandar !== null && v !== estandar
        ? `Ajustado (estandar del kit: ${numero(estandar)})` : '';
    };
    actualizarNota(it.cantidad);

    return h('div', { clase: 'linea-vale' },
      h('div', { clase: 'linea-vale-datos' },
        h('div', { clase: 'linea-vale-nombre', texto: it.nombre }),
        h('div', { clase: 'linea-vale-meta' },
          `${it.sku} · ${it.unidad}`,
          estandar !== null ? ` · estandar ${numero(estandar)}` : '',
          it.disponible !== undefined ? ` · disponible ${numero(it.disponible)}` : ''
        ),
        nota
      ),
      controlCantidad(it.cantidad, (v) => { alCambiar(v); actualizarNota(v); }),
      h('button', { clase: 'btn btn-plano btn-icono', onclick: alQuitar, 'aria-label': 'Quitar' }, icono('basura', 18))
    );
  }

  // ------------------------------------------------------------ Resumen
  function pintarResumen() {
    vaciar(resumen);
    const totalLineas = borrador.sueltos.length + borrador.kits.reduce((s, k) => s + k.items.length, 0);
    const listo = borrador.trailer_id && totalLineas > 0;

    const enviar = h('button', {
      clase: 'btn btn-primario btn-xl', disabled: !listo,
      onclick: revisarYEnviar
    }, 'REVISAR Y ENVIAR');

    resumen.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-pie', style: 'border-top:none' },
        h('div', { style: 'flex:1' },
          h('div', { clase: 'kpi-etiqueta', texto: 'Resumen' }),
          h('div', { clase: 'grande negrita' },
            `${totalLineas} ${totalLineas === 1 ? 'material' : 'materiales'}` +
            (borrador.kits.length ? ` · ${borrador.kits.length} kit(s)` : '')
          ),
          h('div', { clase: 'pequeno silencio' },
            `Solicita: ${estado.user.nombre} · Area: ${estado.user.area || 'Sin area'} · ` +
            `Supervisor: ${estado.user.supervisor || 'Por asignar'}`)
        ),
        enviar
      )
    ));
  }

  // ------------------------------------------------------------ Envio
  async function revisarYEnviar() {
    const trailer = catalogos.trailers.find((t) => t.id === borrador.trailer_id);
    const filas = [];
    for (const k of borrador.kits) {
      for (const it of k.items) filas.push({ ...it, kit: k.kit.nombre });
    }
    for (const s of borrador.sueltos) {
      filas.push({ nombre: s.material.nombre, sku: s.material.sku, unidad: s.material.unidad, cantidad: s.cantidad, estandar: null });
    }

    const prioridad = h('select', {},
      ...['NORMAL', 'ALTA', 'URGENTE', 'BAJA'].map((p) => h('option', { value: p, selected: p === borrador.prioridad }, p))
    );
    const notas = h('textarea', { placeholder: 'Opcional: alguna aclaracion para el supervisor', rows: 2 });

    const cuerpo = h('div', {},
      h('div', { clase: 'aviso' },
        h('div', { clase: 'aviso-titulo', texto: `Trailer ${trailer.numero}` }),
        h('div', { texto: `${filas.length} materiales. El folio se asigna automaticamente al enviar.` })
      ),
      h('div', { clase: 'tabla-envoltura', style: 'max-height:320px;overflow-y:auto' },
        h('table', { clase: 'tabla-compacta' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Material'), h('th', {}, 'Kit'), h('th', { clase: 'num' }, 'Cantidad'))),
          h('tbody', {}, filas.map((f) => h('tr', {},
            h('td', {}, h('div', { clase: 'negrita', texto: f.nombre }), h('div', { clase: 'pequeno silencio', texto: f.sku })),
            h('td', { clase: 'pequeno silencio', texto: f.kit || '—' }),
            h('td', { clase: 'num negrita' }, `${numero(f.cantidad)} ${f.unidad}`)
          )))
        )
      ),
      h('div', { clase: 'fila mt' },
        campo('Prioridad', prioridad),
        campo('Notas', notas)
      )
    );

    modal({
      titulo: 'Revisar vale',
      ancho: 'ancho',
      cuerpo,
      acciones: [
        { texto: 'Seguir editando' },
        {
          texto: 'ENVIAR VALE',
          clase: 'btn-primario',
          accion: async (cerrar) => {
            try {
              const respuesta = await api.post('/api/vales', {
                trailer_id: borrador.trailer_id,
                prioridad: prioridad.value,
                notas: notas.value.trim(),
                items: borrador.sueltos.map((s) => ({ material_id: s.material.id, cantidad: s.cantidad })),
                kits: borrador.kits.map((k) => ({
                  kit_id: k.kit.id,
                  kit_version_id: k.kit.version_id,
                  items: k.items.map((i) => ({ material_id: i.material_id, cantidad: i.cantidad }))
                }))
              });
              cerrar();
              avisoOk(`Vale ${respuesta.folio} enviado a su supervisor`);
              ir(`/vales/${respuesta.id}`);
            } catch (err) {
              avisoError(err.message);
            }
          }
        }
      ]
    });
  }

  pintarTrailer();
  pintarContenido();

  contenedor.appendChild(pasoTrailer);
  contenedor.appendChild(pasoContenido);
  contenedor.appendChild(lineas);
  contenedor.appendChild(resumen);
  return contenedor;
}
