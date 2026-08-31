/** Administracion de usuarios: altas, roles, PIN, contrasena y bloqueos. */
import { api, qs } from '../api.js';
import {
  h, vaciar, tarjeta, chip, numero, fechaHora, cargando, vacio, tabla, campo,
  selector, modal, avisoOk, avisoError, confirmar, iniciales
} from '../ui.js';
import { icono } from '../iconos.js';
import { tituloVista, puede } from '../app.js';

const ROLES = [
  { valor: 'TRABAJADOR', texto: 'Trabajador de planta' },
  { valor: 'SUPERVISOR', texto: 'Supervisor de area' },
  { valor: 'ALMACEN', texto: 'Almacen / control de inventario' },
  { valor: 'DIRECCION', texto: 'Direccion / gerencia' },
  { valor: 'ADMIN', texto: 'Administrador general' }
];

export async function render() {
  tituloVista('Usuarios', 'Altas, roles, accesos y restablecimiento de credenciales');

  const contenedor = h('div', { clase: 'columna' });
  const lista = h('div');
  const catalogos = await api.get('/api/catalogos');
  const filtros = { q: '', rol: '', empresa: '' };

  const buscar = h('input', { type: 'search', placeholder: 'Nombre, clave o correo' });
  let temporizador;
  buscar.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { filtros.q = buscar.value.trim(); cargar(); }, 250);
  });

  contenedor.appendChild(tarjeta('Filtros', h('div', { clase: 'fila' },
    campo('Buscar', buscar),
    campo('Rol', selector(ROLES, { vacio: 'Todos', onchange: (v) => { filtros.rol = v; cargar(); } })),
    campo('Empresa', selector([{ valor: 'INTERNA', texto: 'Interna' }, { valor: 'REYNA', texto: 'Externa' }],
      { vacio: 'Todas', onchange: (v) => { filtros.empresa = v; cargar(); } }))
  ), puede('usuarios.escribir') ? [
    h('button', { clase: 'btn btn-primario', onclick: () => formulario(null) }, icono('mas', 18), 'Nuevo usuario')
  ] : null));
  contenedor.appendChild(lista);

  await cargar();
  return contenedor;

  async function cargar() {
    vaciar(lista);
    lista.appendChild(cargando());
    const { usuarios } = await api.get('/api/usuarios' + qs(filtros));
    vaciar(lista);

    if (!usuarios.length) {
      lista.appendChild(tarjeta(null, vacio('Sin usuarios', 'Ajuste los filtros.', 'usuarios')));
      return;
    }

    lista.appendChild(h('div', { clase: 'tarjeta' },
      h('div', { clase: 'tarjeta-cuerpo sin-relleno' },
        tabla(
          [{ titulo: '' }, { titulo: 'Clave' }, { titulo: 'Nombre' }, { titulo: 'Rol' }, { titulo: 'Empresa' },
            { titulo: 'Area' }, { titulo: 'Supervisor' }, { titulo: 'Vales', num: true },
            { titulo: 'Ultimo acceso' }, { titulo: 'Estado' }, puede('usuarios.escribir') ? { titulo: '' } : null].filter(Boolean),
          usuarios.map((u) => h('tr', {},
            h('td', {}, h('div', { clase: 'avatar', style: 'width:32px;height:32px;font-size:11px', texto: iniciales(u.nombre) })),
            h('td', { clase: 'mono pequeno', texto: u.employee_id }),
            h('td', {}, h('div', { clase: 'negrita', texto: u.nombre }),
              u.email ? h('div', { clase: 'pequeno silencio', texto: u.email }) : null),
            h('td', {}, chip(u.rol, u.rol === 'ADMIN' ? 'rojo' : u.rol === 'DIRECCION' ? 'morado'
              : u.rol === 'SUPERVISOR' ? 'azul' : u.rol === 'ALMACEN' ? 'acento' : 'gris')),
            h('td', { clase: 'pequeno', texto: u.empresa === 'REYNA' ? 'Externa' : 'Interna' }),
            h('td', { clase: 'pequeno', texto: u.area || '—' }),
            h('td', { clase: 'pequeno silencio', texto: u.supervisor || '—' }),
            h('td', { clase: 'num', texto: numero(u.vales) }),
            h('td', { clase: 'pequeno silencio', texto: u.last_login_at ? fechaHora(u.last_login_at) : 'Nunca' }),
            h('td', {}, u.locked_until ? chip('Bloqueado', 'rojo')
              : chip(u.activo ? 'Activo' : 'Inactivo', u.activo ? 'verde' : 'gris'),
              u.twofa_enabled ? chip('2FA', 'morado') : null),
            puede('usuarios.escribir')
              ? h('td', {}, h('div', { clase: 'gap-s' },
                h('button', { clase: 'btn btn-s', onclick: () => formulario(u) }, 'Editar'),
                h('button', { clase: 'btn btn-s', onclick: () => credenciales(u) }, 'Credenciales')
              ))
              : null
          ))
        )
      )
    ));
  }

  function formulario(usuario) {
    const esNuevo = !usuario;
    const employeeId = h('input', { type: 'text', valor: usuario ? usuario.employee_id : '', disabled: !esNuevo, placeholder: 'EMP-026' });
    const nombre = h('input', { type: 'text', valor: usuario ? usuario.nombre : '' });
    const email = h('input', { type: 'email', valor: usuario && usuario.email ? usuario.email : '' });
    const telefono = h('input', { type: 'tel', valor: usuario && usuario.telefono ? usuario.telefono : '' });
    const rol = selector(ROLES, { valor: usuario ? usuario.rol : 'TRABAJADOR' });
    const empresa = selector([{ valor: 'INTERNA', texto: 'Interna' }, { valor: 'REYNA', texto: 'Externa' }],
      { valor: usuario ? usuario.empresa : 'INTERNA' });
    const area = selector(catalogos.areas.map((a) => ({ valor: a.id, texto: a.nombre })),
      { valor: usuario ? usuario.area_id : '', vacio: 'Sin area' });
    const supervisor = h('select', {});
    const pin = h('input', { type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: '6 digitos' });
    const password = h('input', { type: 'text', placeholder: 'Minimo 10 caracteres' });
    const activo = selector([{ valor: '1', texto: 'Activo' }, { valor: '0', texto: 'Inactivo' }],
      { valor: usuario ? String(usuario.activo) : '1' });

    api.get('/api/usuarios?rol=SUPERVISOR').then(({ usuarios }) => {
      supervisor.appendChild(h('option', { value: '' }, 'Sin supervisor asignado'));
      for (const s of usuarios) {
        supervisor.appendChild(h('option', {
          value: String(s.id), selected: usuario && usuario.supervisor_id === s.id
        }, `${s.nombre} (${s.area || 'sin area'})`));
      }
    });

    modal({
      titulo: esNuevo ? 'Nuevo usuario' : `Editar ${usuario.nombre}`,
      ancho: 'ancho',
      cuerpo: h('div', {},
        h('div', { clase: 'fila' }, campo('ID de empleado', employeeId), campo('Nombre completo', nombre)),
        h('div', { clase: 'fila' }, campo('Correo', email), campo('Telefono', telefono)),
        h('div', { clase: 'fila' }, campo('Rol', rol), campo('Empresa', empresa), campo('Area', area)),
        campo('Supervisor', supervisor),
        esNuevo ? h('div', { clase: 'fila' },
          campo('PIN de 6 digitos', pin, 'Para trabajadores, supervisores y almacen'),
          campo('Contrasena', password, 'Para Administracion y Direccion')
        ) : campo('Estado', activo)
      ),
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Guardar',
          clase: 'btn-primario',
          accion: async (cerrar) => {
            const cuerpo = {
              employee_id: employeeId.value.trim(), nombre: nombre.value.trim(),
              email: email.value.trim() || null, telefono: telefono.value.trim() || null,
              rol: rol.value, empresa: empresa.value,
              area_id: area.value ? Number(area.value) : null,
              supervisor_id: supervisor.value ? Number(supervisor.value) : null
            };
            if (esNuevo) {
              cuerpo.pin = pin.value.trim();
              cuerpo.password = password.value;
            } else {
              cuerpo.activo = activo.value === '1';
            }
            try {
              if (esNuevo) await api.post('/api/usuarios', cuerpo);
              else await api.put(`/api/usuarios/${usuario.id}`, cuerpo);
              cerrar();
              avisoOk('Usuario guardado');
              cargar();
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }

  function credenciales(usuario) {
    const pin = h('input', { type: 'text', inputmode: 'numeric', maxlength: '6', placeholder: 'Nuevo PIN de 6 digitos' });
    const password = h('input', { type: 'text', placeholder: 'Nueva contrasena (minimo 10 caracteres)' });
    const motivo = h('input', { type: 'text', placeholder: 'Motivo (queda en auditoria)' });

    modal({
      titulo: `Credenciales de ${usuario.nombre}`,
      cuerpo: h('div', {},
        usuario.locked_until ? h('div', { clase: 'aviso rojo' },
          h('div', { clase: 'aviso-titulo', texto: 'Cuenta bloqueada por intentos fallidos' }),
          h('button', {
            clase: 'btn btn-s mt',
            onclick: async () => {
              await api.post(`/api/usuarios/${usuario.id}/desbloquear`);
              avisoOk('Usuario desbloqueado');
              cargar();
            }
          }, 'Desbloquear ahora')
        ) : null,
        campo('Restablecer PIN', pin, 'Se usa en los dispositivos de planta'),
        campo('Restablecer contrasena', password, 'Cierra las sesiones abiertas del usuario'),
        campo('Motivo', motivo)
      ),
      acciones: [
        { texto: 'Cerrar' },
        {
          texto: 'Aplicar',
          clase: 'btn-primario',
          accion: async (cerrar) => {
            try {
              if (pin.value.trim()) {
                await api.post(`/api/usuarios/${usuario.id}/restablecer-pin`,
                  { pin: pin.value.trim(), motivo: motivo.value.trim() });
              }
              if (password.value) {
                await api.post(`/api/usuarios/${usuario.id}/restablecer-password`,
                  { password: password.value, motivo: motivo.value.trim() });
              }
              cerrar();
              avisoOk('Credenciales actualizadas');
              cargar();
            } catch (err) { avisoError(err.message); }
          }
        }
      ]
    });
  }
}
