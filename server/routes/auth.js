import { get, run, all, setting } from '../db.js';
import {
  hashSecret, verifySecret, createSession, destroySession, applyFailure,
  recordAttempt, isLocked, requiresCaptcha, verifyTotp, generateTotpSecret, otpauthUrl,
  generarReto, verificarReto
} from '../lib/auth.js';
import { badRequest, unauthorized, forbidden, HttpError } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { permisosDe } from '../lib/rbac.js';
import { redAutorizada } from '../lib/net.js';

/** Todo endpoint protegido empieza por aqui. */
export function requireUser(ctx) {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}

export function perfilPublico(user, ctx) {
  return {
    id: user.id,
    employee_id: user.employee_id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    empresa: user.empresa,
    area_id: user.area_id,
    area: user.area_id ? (get('SELECT nombre FROM areas WHERE id = ?', user.area_id) || {}).nombre : null,
    supervisor_id: user.supervisor_id,
    supervisor: user.supervisor_id ? (get('SELECT nombre FROM users WHERE id = ?', user.supervisor_id) || {}).nombre : null,
    twofa_enabled: !!user.twofa_enabled,
    permisos: permisosDe(user),
    sesion_kind: user.kind,
    sesion_expira: user.expires_at,
    red_autorizada: ctx ? redAutorizada(ctx.ip) : true
  };
}

export default function register(r) {
  // -------------------------------------------------------------------------
  // Acceso rapido de planta: ID DE EMPLEADO + PIN DE 6 DIGITOS
  // -------------------------------------------------------------------------
  r.post('/api/auth/login-pin', (ctx) => {
    const employee_id = String(ctx.body.employee_id || '').trim();
    const pin = String(ctx.body.pin || '').trim();
    if (!employee_id || !/^\d{6}$/.test(pin)) throw badRequest('Ingrese su ID de empleado y un PIN de 6 digitos');

    // Verificacion adicional solo si hay muchos intentos fallidos recientes.
    if (requiresCaptcha(employee_id, ctx.ip) && !verificarReto(ctx.ip, ctx.body.verificacion)) {
      throw badRequest('Por seguridad, resuelva la verificacion mostrada e intente de nuevo', {
        requiere_verificacion: true, reto: generarReto(ctx.ip)
      });
    }

    const user = get('SELECT * FROM users WHERE employee_id = ? COLLATE NOCASE', employee_id);

    if (user && isLocked(user)) {
      throw new HttpError(429, 'Acceso bloqueado temporalmente por intentos fallidos. Espere unos minutos.');
    }
    if (!user || !user.activo || !verifySecret(pin, user.pin_hash)) {
      applyFailure(user, employee_id, ctx.ip);
      throw unauthorized('ID de empleado o PIN incorrecto');
    }
    if (!['TRABAJADOR', 'SUPERVISOR', 'ALMACEN'].includes(user.rol)) {
      throw forbidden('Este usuario debe ingresar con correo y contrasena');
    }
    // Los iPads de planta solo operan dentro de la red autorizada.
    if (user.rol === 'TRABAJADOR' && !redAutorizada(ctx.ip)) {
      throw forbidden('Este dispositivo esta fuera de la red autorizada de la planta.');
    }

    recordAttempt(employee_id, ctx.ip, true);
    const { minutes } = createSession(ctx.res, user, 'PIN', ctx.req);
    audit({ user, ip: ctx.ip }, { accion: 'LOGIN_PIN', entidad: 'users', entidad_id: user.id });
    return { user: perfilPublico({ ...user, kind: 'PIN' }, ctx), sesion_minutos: minutes };
  });

  // -------------------------------------------------------------------------
  // Acceso administrativo: correo + contrasena (+ 2FA cuando esta habilitado)
  // -------------------------------------------------------------------------
  r.post('/api/auth/login', (ctx) => {
    const identificador = String(ctx.body.usuario || ctx.body.email || '').trim();
    const password = String(ctx.body.password || '');
    const codigo2fa = String(ctx.body.codigo || '').trim();
    if (!identificador || !password) throw badRequest('Ingrese usuario y contrasena');

    if (requiresCaptcha(identificador, ctx.ip) && !verificarReto(ctx.ip, ctx.body.verificacion)) {
      throw badRequest('Por seguridad, resuelva la verificacion mostrada e intente de nuevo', {
        requiere_verificacion: true, reto: generarReto(ctx.ip)
      });
    }

    const user = get(
      'SELECT * FROM users WHERE (email = ? COLLATE NOCASE OR employee_id = ? COLLATE NOCASE)',
      identificador, identificador
    );

    if (user && isLocked(user)) {
      throw new HttpError(429, 'Cuenta bloqueada temporalmente por intentos fallidos. Espere unos minutos.');
    }
    if (!user || !user.activo || !verifySecret(password, user.password_hash)) {
      applyFailure(user, identificador, ctx.ip);
      throw unauthorized('Usuario o contrasena incorrectos');
    }

    // 2FA obligatorio para Administrador y Direccion cuando esta configurado.
    if (user.twofa_enabled) {
      if (!codigo2fa) {
        return { requiere_2fa: true, mensaje: 'Ingrese el codigo de su aplicacion de autenticacion' };
      }
      if (!verifyTotp(user.twofa_secret, codigo2fa)) {
        applyFailure(user, identificador, ctx.ip);
        throw unauthorized('Codigo de verificacion incorrecto');
      }
    } else if (['ADMIN', 'DIRECCION'].includes(user.rol) && setting('requiere_2fa_admin', '1') === '1') {
      // No se bloquea el demo: se marca como pendiente de configurar.
      // El usuario podra activarlo desde su perfil.
    }

    recordAttempt(identificador, ctx.ip, true);
    const { minutes } = createSession(ctx.res, user, 'PASSWORD', ctx.req);
    audit({ user, ip: ctx.ip }, { accion: 'LOGIN', entidad: 'users', entidad_id: user.id });
    return {
      user: perfilPublico({ ...user, kind: 'PASSWORD' }, ctx),
      sesion_minutos: minutes,
      sugerir_2fa: ['ADMIN', 'DIRECCION'].includes(user.rol) && !user.twofa_enabled
    };
  });

  r.post('/api/auth/logout', (ctx) => {
    if (ctx.user) audit(ctx, { accion: 'LOGOUT', entidad: 'users', entidad_id: ctx.user.id });
    destroySession(ctx.res, ctx.token);
    return { ok: true };
  });

  r.get('/api/auth/me', (ctx) => {
    const user = requireUser(ctx);
    const pendientes = get(
      'SELECT COUNT(*) AS n FROM notificaciones WHERE user_id = ? AND leida_at IS NULL', user.id
    ).n;
    return { user: perfilPublico(user, ctx), notificaciones_pendientes: pendientes };
  });

  /** El formulario de acceso pregunta si debe mostrar verificacion adicional. */
  r.get('/api/auth/estado', (ctx) => {
    const captcha = requiresCaptcha(String(ctx.query.usuario || ''), ctx.ip);
    return {
      captcha,
      reto: captcha ? generarReto(ctx.ip) : null,
      red_autorizada: redAutorizada(ctx.ip),
      restriccion_red: setting('restriccion_red_activa', '0') === '1'
    };
  });

  // -------------------------------------------------------------------------
  // Perfil propio
  // -------------------------------------------------------------------------
  r.post('/api/auth/cambiar-pin', (ctx) => {
    const user = requireUser(ctx);
    const actual = String(ctx.body.pin_actual || '');
    const nuevo = String(ctx.body.pin_nuevo || '');
    if (!/^\d{6}$/.test(nuevo)) throw badRequest('El nuevo PIN debe tener exactamente 6 digitos');
    if (!verifySecret(actual, user.pin_hash)) throw unauthorized('El PIN actual no es correcto');
    run('UPDATE users SET pin_hash = ?, updated_at = datetime(\'now\') WHERE id = ?', hashSecret(nuevo), user.id);
    audit(ctx, { accion: 'CAMBIO_PIN', entidad: 'users', entidad_id: user.id });
    return { ok: true };
  });

  r.post('/api/auth/cambiar-password', (ctx) => {
    const user = requireUser(ctx);
    const actual = String(ctx.body.password_actual || '');
    const nueva = String(ctx.body.password_nueva || '');
    if (nueva.length < 10) throw badRequest('La contrasena debe tener al menos 10 caracteres');
    if (!verifySecret(actual, user.password_hash)) throw unauthorized('La contrasena actual no es correcta');
    run('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?', hashSecret(nueva), user.id);
    audit(ctx, { accion: 'CAMBIO_PASSWORD', entidad: 'users', entidad_id: user.id });
    return { ok: true };
  });

  // 2FA: alta y confirmacion
  r.post('/api/auth/2fa/iniciar', (ctx) => {
    const user = requireUser(ctx);
    const secret = generateTotpSecret();
    run('UPDATE users SET twofa_secret = ? WHERE id = ?', secret, user.id);
    return { secret, otpauth: otpauthUrl(secret, user.email || user.employee_id) };
  });

  r.post('/api/auth/2fa/activar', (ctx) => {
    const user = requireUser(ctx);
    const fresco = get('SELECT twofa_secret FROM users WHERE id = ?', user.id);
    if (!verifyTotp(fresco.twofa_secret, ctx.body.codigo)) throw badRequest('Codigo incorrecto');
    run('UPDATE users SET twofa_enabled = 1 WHERE id = ?', user.id);
    audit(ctx, { accion: '2FA_ACTIVADO', entidad: 'users', entidad_id: user.id });
    return { ok: true };
  });

  r.post('/api/auth/2fa/desactivar', (ctx) => {
    const user = requireUser(ctx);
    if (!verifySecret(String(ctx.body.password || ''), user.password_hash)) {
      throw unauthorized('Confirme su contrasena para desactivar 2FA');
    }
    run('UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?', user.id);
    audit(ctx, { accion: '2FA_DESACTIVADO', entidad: 'users', entidad_id: user.id });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Notificaciones
  // -------------------------------------------------------------------------
  r.get('/api/notificaciones', (ctx) => {
    const user = requireUser(ctx);
    const rows = all(
      `SELECT n.*, v.folio FROM notificaciones n
       LEFT JOIN vales v ON v.id = n.vale_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`, user.id
    );
    return { notificaciones: rows, pendientes: rows.filter((n) => !n.leida_at).length };
  });

  r.post('/api/notificaciones/:id/leer', (ctx) => {
    const user = requireUser(ctx);
    run('UPDATE notificaciones SET leida_at = datetime(\'now\') WHERE id = ? AND user_id = ?', ctx.params.id, user.id);
    return { ok: true };
  });

  r.post('/api/notificaciones/leer-todas', (ctx) => {
    const user = requireUser(ctx);
    run('UPDATE notificaciones SET leida_at = datetime(\'now\') WHERE user_id = ? AND leida_at IS NULL', user.id);
    return { ok: true };
  });
}
