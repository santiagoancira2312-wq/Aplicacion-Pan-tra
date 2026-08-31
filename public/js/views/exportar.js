/** Exportacion a Excel. La aplicacion es la fuente de verdad; Excel es reporte. */
import { api } from '../api.js';
import { h, tarjeta, avisoOk } from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista } from '../app.js';

const DESCRIPCIONES = {
  inventario: ['Inventario actual', 'Existencias, comprometido, disponible, minimos y valor', 'etiqueta'],
  movimientos: ['Movimientos', 'Entradas, salidas, devoluciones y ajustes con trazabilidad', 'movimientos'],
  vales: ['Vales', 'Cabecera de cada vale con estado y tiempos', 'documento'],
  detalle_vales: ['Detalle de vales', 'Linea por linea: estandar, solicitado, autorizado y entregado', 'lista'],
  trabajadores: ['Trabajadores', 'Personal, rol, area y actividad', 'usuarios'],
  consumo_trailer: ['Consumo por trailer', 'Costo acumulado de cada unidad', 'camion'],
  consumo_area: ['Consumo por area', 'Importe por departamento', 'panel'],
  consumo_reyna: ['Consumo de la empresa externa', 'Estado de cuenta detallado con precio historico', 'edificio'],
  kits: ['Kits', 'Contenido y cantidades estandar por version', 'kit'],
  alertas: ['Alertas de inventario', 'Materiales bajo minimo, criticos y agotados', 'alerta'],
  auditoria: ['Auditoria', 'Cambios criticos con valor anterior y nuevo', 'lupa']
};

export async function render() {
  tituloVista('Exportar', 'Reportes en formato Excel (CSV compatible)');

  const { reportes } = await api.get('/api/exportar');
  const contenedor = h('div', { clase: 'columna' });

  contenedor.appendChild(h('div', { clase: 'aviso' },
    h('div', { clase: 'aviso-titulo', texto: 'Una sola fuente de verdad' }),
    h('div', { texto: 'Toda transaccion se origina y se guarda en la aplicacion. Excel se usa para reportes, analisis e integraciones administrativas, nunca como base de datos.' })
  ));

  contenedor.appendChild(h('div', { clase: 'rejilla c3' },
    reportes.map((r) => {
      const [titulo, detalle, nombreIcono] = DESCRIPCIONES[r] || [r, '', 'documento'];
      return h('button', {
        clase: 'accion-grande',
        onclick: () => { api.descargar(`/api/exportar/${r}`); avisoOk(`Descargando ${titulo}...`); }
      },
        h('div', { clase: 'icono' }, icono(nombreIcono, 26)),
        h('div', { clase: 'titulo', texto: titulo }),
        h('div', { clase: 'sub', texto: detalle }),
        h('div', { clase: 'sub gap-s', style: 'margin-top:8px;font-weight:600' }, icono('descargar', 15), 'Descargar CSV')
      );
    })
  ));

  return contenedor;
}
