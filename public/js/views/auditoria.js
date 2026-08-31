/** Auditoria: quien hizo que, cuando, con valor anterior y nuevo. */
import { api, qs } from '../api.js';
import {
  h, vaciar, tarjeta, chip, fechaHora, cargando, vacio, tabla, campo, selector, modal
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista } from '../app.js';

export async function render() {
  tituloVista('Auditoria', 'Registro de cambios criticos del sistema');

  const contenedor = h('div', { clase: 'columna' });
  const lista = h('div');
  const filtros = { accion: '', entidad: '', desde: '', hasta: '' };
  const primera = await api.get('/api/auditoria?limit=1');

  contenedor.appendChild(tarjeta('Filtros', h('div', { clase: 'fila' },
    campo('Accion', selector(primera.acciones.map((a) => ({ valor: a, texto: a.replace(/_/g, ' ') })),
      { vacio: 'Todas', onchange: (v) => { filtros.accion = v; cargar(); } })),
    campo('Entidad', selector(
      ['vales', 'materiales', 'users', 'kits', 'trailers', 'settings', 'entradas', 'reyna_cierres', 'reportes']
        .map((e) => ({ valor: e, texto: e })),
      { vacio: 'Todas', onchange: (v) => { filtros.entidad = v; cargar(); } })),
    campo('Desde', h('input', { type: 'date', onchange: (e) => { filtros.desde = e.target.value; cargar(); } })),
    campo('Hasta', h('input', { type: 'date', onchange: (e) => { filtros.hasta = e.target.value; cargar(); } }))
  )));
  contenedor.appendChild(lista);
  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(lista);
    lista.appendChild(cargando());
    const { registros } = await api.get('/api/auditoria' + qs({ ...filtros, limit: 300 }));
    vaciar(lista);

    if (!registros.length) {
      lista.appendChild(tarjeta(null, vacio('Sin registros', 'Ajuste los filtros.', 'lupa')));
      return;
    }

    lista.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cabecera' },
        h('h2', { texto: `${registros.length} registros` }),
        h('span', { clase: 'pequeno silencio', style: 'margin-left:auto',
          texto: 'La informacion historica no se elimina desde la interfaz.' })
      ),
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: 'Fecha' }, { titulo: 'Usuario' }, { titulo: 'Accion' }, { titulo: 'Entidad' },
            { titulo: 'ID' }, { titulo: 'Motivo' }, { titulo: '' }],
          registros.map((r) => h('tr', {},
            h('td', { clase: 'pequeno', texto: fechaHora(r.created_at) }),
            h('td', { texto: r.user_nombre || 'Sistema' }),
            h('td', {}, chip(r.accion.replace(/_/g, ' '), color(r.accion))),
            h('td', { clase: 'pequeno silencio', texto: r.entidad }),
            h('td', { clase: 'mono pequeno', texto: r.entidad_id || '—' }),
            h('td', { clase: 'pequeno', texto: r.motivo || '—' }),
            h('td', {}, (r.valor_antes || r.valor_nuevo)
              ? h('button', { clase: 'btn btn-s', onclick: () => detalle(r) }, 'Ver cambio')
              : null)
          ))
        )
      )
    ));
  }

  function detalle(r) {
    const bloque = (titulo, valor) => h('div', {},
      h('div', { clase: 'kpi-etiqueta mb', texto: titulo }),
      h('pre', {
        clase: 'mono pequeno',
        style: 'background:var(--superficie-2);padding:12px;border-radius:8px;overflow:auto;white-space:pre-wrap;margin:0'
      }, valor ? JSON.stringify(JSON.parse(valor), null, 2) : 'Sin datos')
    );
    modal({
      titulo: `${r.accion.replace(/_/g, ' ')} · ${r.entidad} ${r.entidad_id || ''}`,
      cuerpo: h('div', { clase: 'columna' },
        h('div', { clase: 'pequeno silencio', texto: `${fechaHora(r.created_at)} · ${r.user_nombre || 'Sistema'}${r.ip ? ' · ' + r.ip : ''}` }),
        r.motivo ? h('div', { clase: 'aviso', texto: `Motivo: ${r.motivo}` }) : null,
        bloque('Valor anterior', r.valor_antes),
        bloque('Valor nuevo', r.valor_nuevo)
      ),
      acciones: [{ texto: 'Cerrar' }]
    });
  }

  function color(accion) {
    if (accion.includes('RECHAZ') || accion.includes('CANCEL')) return 'rojo';
    if (accion.includes('CREAD') || accion.includes('REGISTRAD')) return 'verde';
    if (accion.includes('ACTUALIZ') || accion.includes('MODIFIC')) return 'ambar';
    if (accion.includes('LOGIN') || accion.includes('LOGOUT')) return 'gris';
    return 'azul';
  }
}
