/** Redireccion inicial segun el rol (el enrutador la resuelve antes de llegar aqui). */
import { h } from '../ui.js';
export async function render() {
  return h('div', { clase: 'cargando' }, h('div', { clase: 'girador' }));
}
