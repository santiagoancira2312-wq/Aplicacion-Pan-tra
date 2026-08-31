/** Inventario con semaforo, disponible y comprometido. */
import { api, qs } from '../api.js';
import {
  h, vaciar, tarjeta, kpi, numero, moneda, monedaCorta, semaforo, cargando,
  vacio, tabla, campo, selector, chip, modal, avisoOk, avisoError
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';
import { ir } from '../router.js';

export async function render() {
  tituloVista('Inventario', 'Existencias, comprometido y disponible');

  const catalogos = await api.get('/api/catalogos');
  const filtros = { q: '', semaforo: '', categoria_id: '' };
  const contenedor = h('div', { clase: 'columna' });
  const resultados = h('div');

  const buscar = h('input', { type: 'search', placeholder: 'SKU o nombre del material' });
  let temporizador;
  buscar.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { filtros.q = buscar.value.trim(); cargar(); }, 250);
  });

  const acciones = [];
  if (puede('catalogo.escribir')) {
    acciones.push(h('button', { clase: 'btn btn-primario', onclick: () => formularioMaterial(catalogos, null, cargar) }, icono('mas', 18), 'Nuevo material'));
  }
  if (puede('inventario.ajustes')) {
    acciones.push(h('button', { clase: 'btn', onclick: () => formularioAjuste(cargar) }, icono('movimientos', 18), 'Ajuste de inventario'));
  }

  contenedor.appendChild(tarjeta('Filtros', h('div', { clase: 'fila' },
    campo('Buscar', buscar),
    campo('Semaforo', selector([
      { valor: 'NORMAL', texto: 'Normal' }, { valor: 'BAJO', texto: 'Bajo' },
      { valor: 'CRITICO', texto: 'Critico' }, { valor: 'AGOTADO', texto: 'Agotado' }
    ], { vacio: 'Todos', onchange: (v) => { filtros.semaforo = v; cargar(); } })),
    campo('Categoria', selector(catalogos.categorias.map((c) => ({ valor: c.id, texto: c.nombre })),
      { vacio: 'Todas', onchange: (v) => { filtros.categoria_id = v; cargar(); } }))
  ), acciones.length ? acciones : null));
  contenedor.appendChild(resultados);

  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(resultados);
    resultados.appendChild(cargando());
    const { inventario, resumen } = await api.get('/api/inventario' + qs(filtros));
    vaciar(resultados);

    resultados.appendChild(h('div', { clase: 'rejilla c4 mb' },
      kpi('Materiales', numero(resumen.total_materiales)),
      resumen.valor_total !== undefined ? kpi('Valor del inventario', monedaCorta(resumen.valor_total), '', 'acento') : null,
      kpi('Bajo minimo', numero(resumen.bajos + resumen.criticos), 'Requieren atencion', 'ambar'),
      kpi('Agotados', numero(resumen.agotados), 'Sin existencia', 'rojo')
    ));

    if (!inventario.length) {
      resultados.appendChild(tarjeta(null, vacio('Sin materiales', 'Ajuste los filtros.', 'etiqueta')));
      return;
    }

    const verCostos = puede('costos.leer');
    resultados.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: 'SKU' }, { titulo: 'Material' }, { titulo: 'Categoria' }, { titulo: 'Fisico', num: true },
            { titulo: 'Comprometido', num: true }, { titulo: 'Disponible', num: true }, { titulo: 'Minimo', num: true },
            { titulo: 'Reorden', num: true }, { titulo: 'Ubicacion' },
            verCostos ? { titulo: 'Costo', num: true } : null,
            verCostos ? { titulo: 'Valor', num: true } : null,
            { titulo: 'Semaforo' }].filter(Boolean),
          inventario.map((m) => h('tr', { clase: 'clic', onclick: () => ir(`/inventario/${m.id}`) },
            h('td', { clase: 'mono pequeno', texto: m.sku }),
            h('td', { clase: 'negrita', texto: m.nombre }),
            h('td', { clase: 'pequeno silencio', texto: m.categoria || '—' }),
            h('td', { clase: 'num negrita' }, `${numero(m.stock_fisico)} ${m.unidad}`),
            h('td', { clase: 'num silencio', texto: numero(m.comprometido) }),
            h('td', { clase: 'num negrita', texto: numero(m.disponible) }),
            h('td', { clase: 'num silencio', texto: numero(m.stock_min) }),
            h('td', { clase: 'num silencio', texto: numero(m.punto_reorden) }),
            h('td', { clase: 'mono pequeno', texto: m.ubicacion || '—' }),
            verCostos ? h('td', { clase: 'num mono', texto: moneda(m.costo) }) : null,
            verCostos ? h('td', { clase: 'num mono', texto: moneda(m.valor) }) : null,
            h('td', {}, semaforo(m.semaforo))
          ))
        )
      )
    ));
  }
}

/** Alta y edicion de material, con alias. */
export function formularioMaterial(catalogos, material, alTerminar) {
  const c = (nombre, control, ayuda) => campo(nombre, control, ayuda);
  const sku = h('input', { type: 'text', valor: material ? material.sku : '', disabled: !!material });
  const nombre = h('input', { type: 'text', valor: material ? material.nombre : '' });
  const descripcion = h('input', { type: 'text', valor: material && material.descripcion ? material.descripcion : '' });
  const unidad = selector(catalogos.unidades.map((u) => ({ valor: u.id, texto: `${u.codigo} — ${u.nombre}` })),
    { valor: material ? material.unidad_id : '' });
  const categoria = selector(catalogos.categorias.map((x) => ({ valor: x.id, texto: x.nombre })),
    { valor: material ? material.categoria_id : '', vacio: 'Sin categoria' });
  const proveedor = selector(catalogos.proveedores.map((p) => ({ valor: p.id, texto: p.nombre })),
    { valor: material ? material.proveedor_id : '', vacio: 'Sin proveedor' });
  const num = (v) => h('input', { type: 'number', step: '0.01', min: '0', valor: String(v ?? 0) });
  const stockMin = num(material && material.stock_min);
  const stockMax = num(material && material.stock_max);
  const reorden = num(material && material.punto_reorden);
  const costo = num(material && material.costo);
  const ubicacion = h('input', { type: 'text', valor: material && material.ubicacion ? material.ubicacion : '' });
  const alias = h('input', {
    type: 'text',
    valor: material && material.alias ? material.alias.join(', ') : '',
    placeholder: 'tornillo chico, pijas'
  });
  const motivo = h('input', { type: 'text', placeholder: 'Motivo del cambio (queda en auditoria)' });

  modal({
    titulo: material ? `Editar ${material.nombre}` : 'Nuevo material',
    ancho: 'ancho',
    cuerpo: h('div', {},
      h('div', { clase: 'fila' }, c('SKU', sku), c('Nombre oficial', nombre)),
      c('Descripcion', descripcion),
      h('div', { clase: 'fila' }, c('Unidad', unidad), c('Categoria', categoria), c('Proveedor', proveedor)),
      h('div', { clase: 'fila' },
        c('Stock minimo', stockMin), c('Stock maximo', stockMax),
        c('Punto de reorden', reorden), c('Costo unitario', costo)),
      h('div', { clase: 'fila' }, c('Ubicacion', ubicacion),
        c('Alias (separados por coma)', alias, 'Permiten buscar el material por su apodo en planta')),
      material ? c('Motivo', motivo) : null
    ),
    acciones: [
      { texto: 'Cancelar' },
      {
        texto: 'Guardar',
        clase: 'btn-primario',
        accion: async (cerrar) => {
          const cuerpo = {
            sku: sku.value.trim(), nombre: nombre.value.trim(), descripcion: descripcion.value.trim(),
            unidad_id: Number(unidad.value), categoria_id: categoria.value ? Number(categoria.value) : null,
            proveedor_id: proveedor.value ? Number(proveedor.value) : null,
            stock_min: Number(stockMin.value), stock_max: Number(stockMax.value),
            punto_reorden: Number(reorden.value), costo: Number(costo.value),
            ubicacion: ubicacion.value.trim(),
            alias: alias.value.split(',').map((a) => a.trim()).filter(Boolean),
            motivo: motivo.value.trim() || null
          };
          try {
            if (material) await api.put(`/api/materiales/${material.id}`, cuerpo);
            else await api.post('/api/materiales', cuerpo);
            cerrar();
            avisoOk('Material guardado');
            alTerminar();
          } catch (err) { avisoError(err.message); }
        }
      }
    ]
  });
}

/** Ajustes, mermas y danos. Siempre con motivo. */
export function formularioAjuste(alTerminar, materialFijo = null) {
  const buscador = h('input', { type: 'search', placeholder: 'Buscar material...' });
  const resultados = h('div', { clase: 'resultados oculto' });
  const elegido = h('div', { clase: 'aviso oculto' });
  let materialId = materialFijo ? materialFijo.id : null;

  if (materialFijo) {
    elegido.classList.remove('oculto');
    elegido.textContent = `${materialFijo.nombre} (${materialFijo.sku})`;
    buscador.classList.add('oculto');
  }

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
            materialId = m.id;
            elegido.textContent = `${m.nombre} (${m.sku}) — existencia ${numero(m.stock_fisico)} ${m.unidad}`;
            elegido.classList.remove('oculto');
            resultados.classList.add('oculto');
            buscador.value = '';
          }
        },
          h('div', { style: 'flex:1' },
            h('div', { clase: 'resultado-nombre', texto: m.nombre }),
            h('div', { clase: 'resultado-meta', texto: `${m.sku} · existencia ${numero(m.stock_fisico)}` })
          )
        ));
      }
      resultados.classList.remove('oculto');
    }, 220);
  });

  const tipo = selector([
    { valor: 'AJUSTE_POSITIVO', texto: 'Ajuste positivo (entra)' },
    { valor: 'AJUSTE_NEGATIVO', texto: 'Ajuste negativo (sale)' },
    { valor: 'MERMA', texto: 'Merma' },
    { valor: 'DANO', texto: 'Dano' },
    { valor: 'CORRECCION', texto: 'Correccion' }
  ], { valor: 'AJUSTE_NEGATIVO' });
  const cantidad = h('input', { type: 'number', min: '0', step: '0.01', valor: '1' });
  const motivo = h('textarea', { rows: 2, placeholder: 'Motivo obligatorio (queda en auditoria)' });

  modal({
    titulo: 'Ajuste de inventario',
    cuerpo: h('div', {},
      h('div', { clase: 'campo' }, h('label', { texto: 'Material' }), buscador, resultados, elegido),
      h('div', { clase: 'fila' }, campo('Tipo', tipo), campo('Cantidad', cantidad)),
      campo('Motivo', motivo)
    ),
    acciones: [
      { texto: 'Cancelar' },
      {
        texto: 'Registrar ajuste',
        clase: 'btn-primario',
        accion: async (cerrar) => {
          if (!materialId) return avisoError('Seleccione un material');
          if (!motivo.value.trim()) return avisoError('El motivo es obligatorio');
          try {
            await api.post('/api/inventario/ajuste', {
              material_id: materialId, tipo: tipo.value,
              cantidad: Number(cantidad.value), motivo: motivo.value.trim()
            });
            cerrar();
            avisoOk('Ajuste registrado');
            alTerminar();
          } catch (err) { avisoError(err.message); }
        }
      }
    ]
  });
}
