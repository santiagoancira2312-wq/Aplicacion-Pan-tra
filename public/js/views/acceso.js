/**
 * Pantalla de acceso.
 * Planta: ID de empleado + PIN de 6 digitos con teclado grande (iPads compartidos).
 * Administrativos: usuario/correo + contrasena, con 2FA cuando esta habilitado.
 */
import { api } from '../api.js';
import { h, vaciar, avisoError, avisoOk } from '../ui.js';

export async function render({ alEntrar }) {
  let modo = 'PIN';
  const panel = h('div', { clase: 'acceso-caja' });

  let restriccion = { red_autorizada: true, restriccion_red: false, captcha: false, reto: null };
  try { restriccion = await api.get('/api/auth/estado'); } catch { /* se resuelve al enviar */ }

  /**
   * Verificacion adicional: solo aparece tras varios intentos fallidos.
   * En el uso normal de planta nunca se muestra, la prioridad es la velocidad.
   */
  function campoVerificacion() {
    const respuesta = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'Resultado' });
    const pregunta = h('span', { clase: 'negrita' });
    const caja = h('div', { clase: 'campo oculto' },
      h('label', { texto: 'Verificacion de seguridad' }),
      h('div', { clase: 'gap' }, h('span', {}, 'Cuanto es ', pregunta, '?'), respuesta)
    );
    const mostrar = (reto) => {
      if (!reto) return;
      pregunta.textContent = reto;
      caja.classList.remove('oculto');
      respuesta.value = '';
    };
    if (restriccion.captcha && restriccion.reto) mostrar(restriccion.reto);
    return { caja, respuesta, mostrar };
  }

  function cambiar(nuevo) {
    modo = nuevo;
    vaciar(panel);
    panel.appendChild(modo === 'PIN' ? formularioPin() : formularioPassword());
  }

  // ---------------------------------------------------------------- PIN
  function formularioPin() {
    let pin = '';
    const empleado = h('input', {
      type: 'text', inputmode: 'text', autocapitalize: 'characters', autocomplete: 'username',
      placeholder: 'Ejemplo: EMP-001', 'aria-label': 'ID de empleado'
    });
    const puntos = h('div', { clase: 'pin-puntos' });
    const error = h('div', { clase: 'campo-error centrado oculto' });
    const verificacion = campoVerificacion();
    const entrar = h('button', { clase: 'btn btn-primario btn-bloque btn-xl mt', disabled: true }, 'ENTRAR');

    const pintarPuntos = () => {
      vaciar(puntos);
      for (let i = 0; i < 6; i++) puntos.appendChild(h('span', { clase: `pin-punto ${i < pin.length ? 'lleno' : ''}` }));
      entrar.disabled = pin.length !== 6 || !empleado.value.trim();
    };
    pintarPuntos();
    empleado.addEventListener('input', pintarPuntos);

    const teclear = (d) => {
      if (pin.length >= 6) return;
      pin += d;
      error.classList.add('oculto');
      pintarPuntos();
      if (pin.length === 6 && empleado.value.trim()) enviar();
    };
    const borrar = () => { pin = pin.slice(0, -1); pintarPuntos(); };

    async function enviar() {
      if (pin.length !== 6 || !empleado.value.trim()) return;
      entrar.disabled = true;
      entrar.textContent = 'VERIFICANDO...';
      try {
        const { user } = await api.post('/api/auth/login-pin', {
          employee_id: empleado.value.trim(), pin, verificacion: verificacion.respuesta.value.trim()
        });
        avisoOk(`Bienvenido, ${user.nombre.split(' ')[0]}`);
        alEntrar(user);
      } catch (err) {
        pin = '';
        pintarPuntos();
        if (err.datos && err.datos.reto) verificacion.mostrar(err.datos.reto);
        error.textContent = err.message;
        error.classList.remove('oculto');
        entrar.textContent = 'ENTRAR';
      }
    }
    entrar.addEventListener('click', enviar);

    const teclado = h('div', { clase: 'teclado' },
      ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) =>
        h('button', { clase: 'tecla', type: 'button', onclick: () => teclear(d) }, d)),
      h('button', { clase: 'tecla accion', type: 'button', onclick: () => { pin = ''; pintarPuntos(); } }, 'Limpiar'),
      h('button', { clase: 'tecla', type: 'button', onclick: () => teclear('0') }, '0'),
      h('button', { clase: 'tecla accion', type: 'button', onclick: borrar }, '⌫')
    );

    document.onkeydown = (e) => {
      // El manejador vive en el documento, asi que hay que acotarlo por las dos
      // vias: la pantalla tiene que seguir puesta, y no se debe estar
      // escribiendo en un campo. Sin lo segundo, teclear "EMP-001" en el ID
      // metia sus tres digitos al PIN sin que se notara, y el acceso fallaba
      // despues sin que nadie entendiera por que.
      if (modo !== 'PIN' || !puntos.isConnected) return;
      if (e.key === 'Enter') return enviar();
      const enCampo = document.activeElement
        && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (enCampo) return;
      if (/^\d$/.test(e.key)) teclear(e.key);
      else if (e.key === 'Backspace') borrar();
    };

    return h('div', {},
      h('h1', { texto: 'Acceso de planta' }),
      h('p', { clase: 'silencio', texto: 'Ingrese su ID de empleado y su PIN de 6 digitos.' }),
      restriccion.restriccion_red && !restriccion.red_autorizada
        ? h('div', { clase: 'aviso rojo mt' },
          h('div', { clase: 'aviso-titulo', texto: 'Dispositivo fuera de la red autorizada' }),
          h('div', { texto: 'Crear vales y entregar material solo se puede desde la red de la planta. El supervisor si puede autorizar desde fuera.' }))
        : null,
      h('div', { clase: 'campo mt' }, h('label', { texto: 'ID de empleado' }), empleado),
      puntos,
      verificacion.caja,
      error,
      teclado,
      entrar,
      h('div', { clase: 'sep' }),
      h('button', { clase: 'btn btn-plano btn-bloque', onclick: () => cambiar('PASSWORD') },
        'Acceso administrativo con contrasena'),
      credencialesDemo()
    );
  }

  // ----------------------------------------------------------- Contrasena
  function formularioPassword() {
    document.onkeydown = null;
    const usuario = h('input', { type: 'text', autocomplete: 'username', placeholder: 'correo@empresa.com' });
    const password = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Su contrasena' });
    const codigo = h('input', {
      type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: '000000', autocomplete: 'one-time-code'
    });
    const campo2fa = h('div', { clase: 'campo oculto' },
      h('label', { texto: 'Codigo de verificacion (2FA)' }), codigo,
      h('div', { clase: 'campo-ayuda', texto: 'Codigo de 6 digitos de su aplicacion de autenticacion.' })
    );
    const error = h('div', { clase: 'campo-error oculto' });
    const verificacion = campoVerificacion();
    const boton = h('button', { clase: 'btn btn-primario btn-bloque btn-xl', type: 'submit' }, 'ENTRAR');

    const formulario = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        error.classList.add('oculto');
        boton.disabled = true;
        boton.textContent = 'VERIFICANDO...';
        try {
          const respuesta = await api.post('/api/auth/login', {
            usuario: usuario.value.trim(), password: password.value, codigo: codigo.value.trim(),
            verificacion: verificacion.respuesta.value.trim()
          });
          if (respuesta.requiere_2fa) {
            campo2fa.classList.remove('oculto');
            codigo.focus();
            boton.disabled = false;
            boton.textContent = 'VERIFICAR CODIGO';
            return;
          }
          if (respuesta.sugerir_2fa) {
            avisoOk('Recomendacion: active la verificacion en dos pasos desde su perfil.');
          }
          alEntrar(respuesta.user);
        } catch (err) {
          if (err.datos && err.datos.reto) verificacion.mostrar(err.datos.reto);
          error.textContent = err.message;
          error.classList.remove('oculto');
          boton.disabled = false;
          boton.textContent = 'ENTRAR';
          avisoError(err.message);
        }
      }
    },
      h('div', { clase: 'campo' }, h('label', { texto: 'Usuario o correo' }), usuario),
      h('div', { clase: 'campo' }, h('label', { texto: 'Contrasena' }), password),
      campo2fa,
      verificacion.caja,
      error,
      boton
    );

    return h('div', {},
      h('h1', { texto: 'Acceso administrativo' }),
      h('p', { clase: 'silencio', texto: 'Para Administracion, Direccion y supervisores en acceso remoto.' }),
      h('div', { clase: 'mt' }, formulario),
      h('div', { clase: 'sep' }),
      h('button', { clase: 'btn btn-plano btn-bloque', onclick: () => cambiar('PIN') },
        'Volver al acceso de planta (ID + PIN)'),
      credencialesDemo()
    );
  }

  function credencialesDemo() {
    return h('details', { clase: 'mt pequeno silencio' },
      h('summary', { style: 'cursor:pointer;padding:8px 0', texto: 'Accesos de demostracion' }),
      h('div', { clase: 'mono pequeno', style: 'line-height:1.9' },
        h('div', { texto: 'Trabajador       EMP-001 / PIN 300001' }),
        h('div', { texto: 'Supervisor       SUP-01 / PIN 100001' }),
        h('div', { texto: 'Almacen          ALM-01 / PIN 200001' }),
        h('div', { texto: 'Trabajador ext.  RNA-001 / PIN 400001' }),
        h('div', { texto: 'Supervisor ext.  RSU-01 / PIN 400010' }),
        h('div', { texto: 'Administrador    admin@demo.local / Demo.Admin.2026' }),
        h('div', { texto: 'Direccion        direccion@demo.local / Demo.Direccion.2026' })
      )
    );
  }

  cambiar('PIN');

  return h('div', { clase: 'acceso' },
    h('div', { clase: 'acceso-arte' },
      h('div', {},
        h('div', { clase: 'marca', style: 'padding:0;border:none' },
          h('div', { clase: 'marca-icono', texto: 'DV' }),
          h('div', { clase: 'marca-texto' },
            h('div', { clase: 'marca-titulo', texto: 'Demo Aplicacion' }),
            h('div', { clase: 'marca-sub', texto: 'Vales e inventario' })
          )
        )
      ),
      h('div', {},
        h('div', { clase: 'acceso-lema', texto: 'El vale de papel, resuelto en menos de un minuto.' }),
        h('ul', { clase: 'acceso-lista' },
          ['Vales digitales con folio automatico y trailer obligatorio',
            'Kits editables sin perder la cantidad estandar',
            'Autorizacion del supervisor y cola de preparacion en almacen',
            'Firma con el dedo al entregar y descuento real de inventario',
            'Trazabilidad completa: solicitado, autorizado y entregado'
          ].map((t) => h('li', {}, h('span', { clase: 'marca-check', texto: '✓' }), h('span', { texto: t })))
        )
      ),
      h('div', { clase: 'acceso-pie' },
        'Demostracion con informacion ficticia. Sin logotipos, nombres ni colores de ninguna empresa real.')
    ),
    h('div', { clase: 'acceso-panel' }, panel)
  );
}
