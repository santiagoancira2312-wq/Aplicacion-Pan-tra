/**
 * Configuracion general.
 * Permite al Administrador cambiar el comportamiento del sistema sin tocar codigo.
 */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chip, cargando, campo, modal, avisoOk, avisoError, tabla, confirmar
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista } from '../app.js';

const DESCRIPCIONES = {
  folio_formato: ['Formato del folio de vales', 'Tokens disponibles: {YYYY} {YY} {MM} {DD} {SEQ:n}. Ejemplo: PT-{YYYY}-{SEQ:6}'],
  folio_entrada_formato: ['Formato del folio de entradas', 'Mismo formato de tokens que el folio de vales'],
  folio_secuencia_anual: ['Reiniciar la secuencia cada ano', '1 = si, 0 = no'],
  empresa_externa_nombre: ['Nombre de la empresa externa', 'Etiqueta que se muestra en los reportes'],
  moneda: ['Moneda', 'Codigo ISO, por ejemplo MXN'],
  sesion_pin_minutos: ['Minutos de inactividad en dispositivos compartidos', 'Cierre automatico de sesion con PIN'],
  sesion_password_minutos: ['Minutos de sesion administrativa', 'Para accesos con contrasena'],
  restriccion_red_activa: ['Restringir creacion de vales por red', '1 = solo desde las redes autorizadas'],
  redes_permitidas: ['Redes autorizadas (CIDR)', 'Separadas por coma. Ejemplo: 10.0.0.0/8,192.168.1.0/24'],
  captcha_umbral_intentos: ['Intentos fallidos antes de verificacion adicional', 'Dentro de la planta la prioridad es la velocidad'],
  dias_prediccion_corto: ['Horizonte corto de prediccion (dias)', ''],
  dias_prediccion_largo: ['Horizonte largo de prediccion (dias)', ''],
  anomalia_factor: ['Factor para marcar consumo inusual', 'Veces por encima del promedio historico'],
  requiere_2fa_admin: ['Sugerir 2FA a Administracion y Direccion', '1 = si, 0 = no']
};

export async function render() {
  tituloVista('Configuracion', 'Parametros operativos editables sin modificar codigo');

  const contenedor = h('div', { clase: 'columna' });
  const cuerpo = h('div');
  contenedor.appendChild(cuerpo);
  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(cuerpo);
    cuerpo.appendChild(cargando());
    const [{ configuracion }, { motivos }] = await Promise.all([
      api.get('/api/admin/configuracion'),
      api.get('/api/admin/motivos-rechazo')
    ]);
    vaciar(cuerpo);

    const campos = new Map();
    const controles = configuracion.map((c) => {
      const [titulo, ayuda] = DESCRIPCIONES[c.key] || [c.key, ''];
      const input = h('input', { type: 'text', valor: c.value });
      campos.set(c.key, input);
      return h('div', { style: 'flex:1 1 320px' }, campo(titulo, input, ayuda || c.key));
    });

    cuerpo.appendChild(tarjeta('Parametros del sistema',
      h('div', {},
        h('div', { clase: 'fila' }, controles),
        h('div', { clase: 'aviso mt', texto: 'Cada cambio queda registrado en auditoria con su valor anterior y su valor nuevo.' })
      ),
      [h('button', {
        clase: 'btn btn-primario',
        onclick: async () => {
          const cambios = {};
          for (const [k, input] of campos) cambios[k] = input.value.trim();
          try {
            const r = await api.put('/api/admin/configuracion', { configuracion: cambios });
            avisoOk(r.aplicados.length ? `Configuracion actualizada (${r.aplicados.length} cambios)` : 'Sin cambios que guardar');
            cargar();
          } catch (err) { avisoError(err.message); }
        }
      }, 'Guardar configuracion')]
    ));

    // Motivos de rechazo configurables.
    cuerpo.appendChild(tarjeta('Motivos de rechazo',
      tabla(
        [{ titulo: 'Motivo' }, { titulo: 'Requiere comentario' }, { titulo: 'Estado' }, { titulo: '' }],
        motivos.map((m) => h('tr', {},
          h('td', { clase: 'negrita', texto: m.texto }),
          h('td', {}, m.requiere_comentario ? chip('Si', 'ambar') : chip('No', 'gris')),
          h('td', {}, chip(m.activo ? 'Activo' : 'Inactivo', m.activo ? 'verde' : 'gris')),
          h('td', {}, h('button', {
            clase: 'btn btn-s',
            onclick: async () => {
              await api.put(`/api/admin/motivos-rechazo/${m.id}`, { activo: !m.activo });
              avisoOk('Motivo actualizado');
              cargar();
            }
          }, m.activo ? 'Desactivar' : 'Activar'))
        ))
      ),
      [h('button', { clase: 'btn btn-primario', onclick: nuevoMotivo }, icono('mas', 18), 'Nuevo motivo')],
      { sinRelleno: true }
    ));

    // Sesiones abiertas.
    const { sesiones } = await api.get('/api/admin/sesiones');
    cuerpo.appendChild(tarjeta(`Sesiones activas (${sesiones.length})`,
      tabla(
        [{ titulo: 'Usuario' }, { titulo: 'Rol' }, { titulo: 'Tipo' }, { titulo: 'IP' },
          { titulo: 'Ultima actividad' }, { titulo: '' }],
        sesiones.map((s) => h('tr', {},
          h('td', {}, h('div', { clase: 'negrita', texto: s.nombre }),
            h('div', { clase: 'pequeno silencio mono', texto: s.employee_id })),
          h('td', { clase: 'pequeno', texto: s.rol }),
          h('td', {}, chip(s.kind === 'PIN' ? 'PIN' : 'Contrasena', s.kind === 'PIN' ? 'acento' : 'azul')),
          h('td', { clase: 'mono pequeno', texto: s.ip || '—' }),
          h('td', { clase: 'pequeno', texto: s.last_seen_at }),
          h('td', {}, h('button', {
            clase: 'btn btn-s',
            onclick: async () => {
              const ok = await confirmar({
                titulo: 'Cerrar sesion',
                mensaje: `Se cerrara la sesion activa de ${s.nombre}.`,
                textoOk: 'Cerrar sesion', claseOk: 'btn-rojo'
              });
              if (!ok) return;
              await api.del(`/api/admin/sesiones/${s.id}`);
              avisoOk('Sesion cerrada');
              cargar();
            }
          }, 'Cerrar'))
        ))
      ), null, { sinRelleno: true }
    ));
  }

  function nuevoMotivo() {
    const texto = h('input', { type: 'text', placeholder: 'Texto del motivo' });
    const requiere = h('select', {}, h('option', { value: '0' }, 'No'), h('option', { value: '1' }, 'Si'));
    modal({
      titulo: 'Nuevo motivo de rechazo',
      cuerpo: h('div', {}, campo('Motivo', texto), campo('Requiere comentario', requiere)),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar',
          clase: 'btn-primario',
          accion: async (cerrar) => {
            if (!texto.value.trim()) return avisoError('Escriba el motivo');
            try {
              await api.post('/api/admin/motivos-rechazo', {
                texto: texto.value.trim(), requiere_comentario: requiere.value === '1'
              });
              cerrar();
              avisoOk('Motivo agregado');
              cargar();
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }
}
