/** Perfil del usuario: datos, cambio de PIN o contrasena y verificacion en dos pasos. */
import { api } from '../api.js';
import {
  h, vaciar, tarjeta, chip, kpi, cargando, campo, modal, avisoOk, avisoError, iniciales
} from '../ui.js';
import { tituloVista, estado, cerrarSesion } from '../app.js';

export async function render() {
  tituloVista('Mi perfil', 'Datos de su cuenta y seguridad');

  const contenedor = h('div', { clase: 'columna' });
  const u = estado.user;

  contenedor.appendChild(h('div', { clase: 'tarjeta' },
    h('div', { clase: 'tarjeta-cuerpo' },
      h('div', { clase: 'gap', style: 'align-items:center' },
        h('div', { clase: 'avatar', style: 'width:62px;height:62px;font-size:21px', texto: iniciales(u.nombre) }),
        h('div', { style: 'flex:1' },
          h('h2', { texto: u.nombre }),
          h('div', { clase: 'gap-s mt' },
            chip(u.rol, 'azul'),
            chip(u.empresa === 'REYNA' ? 'Empresa externa' : 'Interna', u.empresa === 'REYNA' ? 'morado' : 'gris'),
            u.twofa_enabled ? chip('2FA activo', 'verde') : null
          )
        )
      ),
      h('div', { clase: 'rejilla c4 mt' },
        kpi('ID de empleado', u.employee_id),
        kpi('Area', u.area || '—'),
        kpi('Supervisor', u.supervisor || '—'),
        kpi('Tipo de sesion', u.sesion_kind === 'PIN' ? 'PIN de planta' : 'Contrasena',
          u.sesion_kind === 'PIN' ? 'Cierre automatico por inactividad' : '')
      )
    )
  ));

  const acciones = [];
  acciones.push(h('button', { clase: 'btn', onclick: cambiarPin }, 'Cambiar mi PIN'));
  if (u.email) acciones.push(h('button', { clase: 'btn', onclick: cambiarPassword }, 'Cambiar contrasena'));
  if (['ADMIN', 'DIRECCION', 'SUPERVISOR'].includes(u.rol)) {
    acciones.push(h('button', {
      clase: u.twofa_enabled ? 'btn' : 'btn btn-primario',
      onclick: u.twofa_enabled ? desactivar2fa : activar2fa
    }, u.twofa_enabled ? 'Desactivar verificacion en dos pasos' : 'Activar verificacion en dos pasos'));
  }
  acciones.push(h('button', { clase: 'btn btn-oscuro', onclick: () => cerrarSesion() }, 'CERRAR SESION'));

  contenedor.appendChild(tarjeta('Seguridad',
    h('div', {},
      h('p', { clase: 'silencio', texto: 'El PIN y la contrasena se guardan cifrados; nunca en texto plano.' }),
      h('div', { clase: 'gap mt' }, acciones)
    )
  ));

  contenedor.appendChild(tarjeta('Permisos de su rol',
    h('div', { clase: 'gap-s' }, u.permisos.map((p) => chip(p === '*' ? 'Acceso total' : p.replace(/\./g, ' · '), 'gris')))
  ));

  return contenedor;

  function cambiarPin() {
    const actual = h('input', { type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'PIN actual' });
    const nuevo = h('input', { type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: 'Nuevo PIN de 6 digitos' });
    modal({
      titulo: 'Cambiar PIN',
      ancho: 'angosto',
      cuerpo: h('div', {}, campo('PIN actual', actual), campo('Nuevo PIN', nuevo)),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar',
          clase: 'btn-primario',
          accion: async (cerrar) => {
            try {
              await api.post('/api/auth/cambiar-pin', { pin_actual: actual.value, pin_nuevo: nuevo.value });
              cerrar();
              avisoOk('PIN actualizado');
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }

  function cambiarPassword() {
    const actual = h('input', { type: 'password', placeholder: 'Contrasena actual' });
    const nueva = h('input', { type: 'password', placeholder: 'Nueva contrasena (minimo 10 caracteres)' });
    modal({
      titulo: 'Cambiar contrasena',
      ancho: 'angosto',
      cuerpo: h('div', {}, campo('Contrasena actual', actual), campo('Nueva contrasena', nueva)),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar',
          clase: 'btn-primario',
          accion: async (cerrar) => {
            try {
              await api.post('/api/auth/cambiar-password', { password_actual: actual.value, password_nueva: nueva.value });
              cerrar();
              avisoOk('Contrasena actualizada');
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }

  async function activar2fa() {
    try {
      const { secret, otpauth } = await api.post('/api/auth/2fa/iniciar');
      const codigo = h('input', { type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: '000000' });
      modal({
        titulo: 'Verificacion en dos pasos',
        cuerpo: h('div', {},
          h('p', { texto: 'Agregue esta clave en su aplicacion de autenticacion (por ejemplo, la app de codigos de su telefono) y escriba el codigo de 6 digitos que muestre.' }),
          h('div', { clase: 'aviso' },
            h('div', { clase: 'kpi-etiqueta', texto: 'Clave secreta' }),
            h('div', { clase: 'mono negrita', style: 'font-size:17px;letter-spacing:2px;word-break:break-all', texto: secret })
          ),
          h('div', { clase: 'pequeno silencio mono', style: 'word-break:break-all', texto: otpauth }),
          campo('Codigo de verificacion', codigo)
        ),
        acciones: [
          { texto: 'Cancelar' },
          {
            texto: 'Activar',
            clase: 'btn-primario',
            accion: async (cerrar) => {
              try {
                await api.post('/api/auth/2fa/activar', { codigo: codigo.value.trim() });
                cerrar();
                estado.user.twofa_enabled = true;
                avisoOk('Verificacion en dos pasos activada');
              } catch (err) { avisoError(err.message); }
            }
          }
        ]
      });
    } catch (err) { avisoError(err.message); }
  }

  function desactivar2fa() {
    const password = h('input', { type: 'password', placeholder: 'Confirme su contrasena' });
    modal({
      titulo: 'Desactivar verificacion en dos pasos',
      ancho: 'angosto',
      cuerpo: campo('Contrasena', password),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Desactivar',
          clase: 'btn-rojo',
          accion: async (cerrar) => {
            try {
              await api.post('/api/auth/2fa/desactivar', { password: password.value });
              cerrar();
              estado.user.twofa_enabled = false;
              avisoOk('Verificacion en dos pasos desactivada');
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }
}
