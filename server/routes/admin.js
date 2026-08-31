import { all, get, run, tx, setSetting, setting } from '../db.js';
import { badRequest, notFound, conflict, forbidden } from '../lib/http.js';
import { requireUser } from './auth.js';
import { requirePerm, can } from '../lib/rbac.js';
import { audit, diff } from '../lib/audit.js';
import { hashSecret } from '../lib/auth.js';
import { sentenciaActualizacion } from '../lib/sql.js';
import { DEFAULT_SETTINGS } from '../config.js';

const ROLES = ['ADMIN', 'DIRECCION', 'SUPERVISOR', 'ALMACEN', 'TRABAJADOR'];
const EMPRESAS = ['INTERNA', 'REYNA'];
const CAMPOS_USER = ['nombre', 'email', 'rol', 'empresa', 'area_id', 'supervisor_id', 'telefono', 'activo'];

export default function register(r) {
  // -------------------------------------------------------------------------
  // Usuarios
  // -------------------------------------------------------------------------
  r.get('/api/usuarios', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'usuarios.leer');
    const where = [];
    const params = [];
    if (ctx.query.rol) { where.push('u.rol = ?'); params.push(ctx.query.rol); }
    if (ctx.query.empresa) { where.push('u.empresa = ?'); params.push(ctx.query.empresa); }
    if (ctx.query.area_id) { where.push('u.area_id = ?'); params.push(ctx.query.area_id); }
    if (ctx.query.q) {
      where.push('(u.nombre LIKE ? OR u.employee_id LIKE ? OR u.email LIKE ?)');
      const like = `%${ctx.query.q}%`;
      params.push(like, like, like);
    }
    if (user.empresa === 'REYNA') { where.push("u.empresa = 'REYNA'"); }

    return {
      usuarios: all(
        `SELECT u.id, u.employee_id, u.nombre, u.email, u.rol, u.empresa, u.area_id, u.telefono,
                u.activo, u.twofa_enabled, u.last_login_at, u.locked_until, u.created_at,
                a.nombre AS area, s.nombre AS supervisor, u.supervisor_id,
                (SELECT COUNT(*) FROM vales v WHERE v.trabajador_id = u.id) AS vales
         FROM users u LEFT JOIN areas a ON a.id = u.area_id LEFT JOIN users s ON s.id = u.supervisor_id
         WHERE ${where.length ? where.join(' AND ') : '1=1'}
         ORDER BY u.activo DESC, u.rol, u.nombre`, ...params
      )
    };
  });

  r.post('/api/usuarios', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'usuarios.escribir');
    const b = ctx.body;
    const employeeId = String(b.employee_id || '').trim();
    if (!employeeId || !b.nombre) throw badRequest('ID de empleado y nombre son obligatorios');
    if (!ROLES.includes(b.rol)) throw badRequest('Rol no valido');
    if (b.empresa && !EMPRESAS.includes(b.empresa)) throw badRequest('Empresa no valida');
    if (get('SELECT 1 AS x FROM users WHERE employee_id = ? COLLATE NOCASE', employeeId)) {
      throw conflict('Ya existe un usuario con ese ID de empleado');
    }
    if (b.email && get('SELECT 1 AS x FROM users WHERE email = ? COLLATE NOCASE', String(b.email))) {
      throw conflict('Ya existe un usuario con ese correo');
    }

    const pin = String(b.pin || '');
    if (pin && !/^\d{6}$/.test(pin)) throw badRequest('El PIN debe tener 6 digitos');
    const password = String(b.password || '');
    if (password && password.length < 10) throw badRequest('La contrasena debe tener al menos 10 caracteres');
    if (['ADMIN', 'DIRECCION'].includes(b.rol) && !password) {
      throw badRequest('Los usuarios administrativos requieren contrasena');
    }
    if (['TRABAJADOR', 'SUPERVISOR', 'ALMACEN'].includes(b.rol) && !pin) {
      throw badRequest('Los usuarios de planta requieren un PIN de 6 digitos');
    }

    const info = run(
      `INSERT INTO users (employee_id, nombre, email, rol, empresa, area_id, supervisor_id, telefono, pin_hash, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      employeeId, String(b.nombre).trim(), b.email || null, b.rol, b.empresa || 'INTERNA',
      b.area_id || null, b.supervisor_id || null, b.telefono || null,
      pin ? hashSecret(pin) : null, password ? hashSecret(password) : null
    );
    audit({ user, ip: ctx.ip }, {
      accion: 'USUARIO_CREADO', entidad: 'users', entidad_id: info.lastInsertRowid,
      nuevo: { employee_id: employeeId, nombre: b.nombre, rol: b.rol, empresa: b.empresa || 'INTERNA' }
    });
    return { id: Number(info.lastInsertRowid) };
  });

  r.put('/api/usuarios/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'usuarios.escribir');
    const id = Number(ctx.params.id);
    const antes = get('SELECT * FROM users WHERE id = ?', id);
    if (!antes) throw notFound('Usuario no encontrado');
    const b = ctx.body;
    if (b.rol && !ROLES.includes(b.rol)) throw badRequest('Rol no valido');
    if (b.empresa && !EMPRESAS.includes(b.empresa)) throw badRequest('Empresa no valida');
    // Nunca dejar el sistema sin administrador activo.
    if (antes.rol === 'ADMIN' && (b.activo === false || b.activo === 0 || (b.rol && b.rol !== 'ADMIN'))) {
      const otros = get(`SELECT COUNT(*) AS n FROM users WHERE rol = 'ADMIN' AND activo = 1 AND id <> ?`, id).n;
      if (otros === 0) throw conflict('Debe existir al menos un Administrador activo');
    }

    const { sql, valores } = sentenciaActualizacion(
      'users', CAMPOS_USER, b, ["updated_at = datetime('now')"]
    );
    run(sql, ...valores, id);
    // Al desactivar se cierran sus sesiones abiertas.
    if (b.activo === false || b.activo === 0) {
      run(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`, id);
    }
    const cambios = diff(antes, b, CAMPOS_USER);
    audit({ user, ip: ctx.ip }, {
      accion: 'USUARIO_ACTUALIZADO', entidad: 'users', entidad_id: id,
      antes: cambios ? cambios.antes : null, nuevo: cambios ? cambios.nuevo : null, motivo: b.motivo || null
    });
    return { ok: true };
  });

  r.post('/api/usuarios/:id/restablecer-pin', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'usuarios.escribir');
    const id = Number(ctx.params.id);
    if (!get('SELECT 1 AS x FROM users WHERE id = ?', id)) throw notFound('Usuario no encontrado');
    const pin = String(ctx.body.pin || '');
    if (!/^\d{6}$/.test(pin)) throw badRequest('El PIN debe tener exactamente 6 digitos');
    run(`UPDATE users SET pin_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?`,
      hashSecret(pin), id);
    audit({ user, ip: ctx.ip }, { accion: 'PIN_RESTABLECIDO', entidad: 'users', entidad_id: id, motivo: ctx.body.motivo || null });
    return { ok: true };
  });

  r.post('/api/usuarios/:id/restablecer-password', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'usuarios.escribir');
    const id = Number(ctx.params.id);
    if (!get('SELECT 1 AS x FROM users WHERE id = ?', id)) throw notFound('Usuario no encontrado');
    const password = String(ctx.body.password || '');
    if (password.length < 10) throw badRequest('La contrasena debe tener al menos 10 caracteres');
    run(`UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?`,
      hashSecret(password), id);
    run(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`, id);
    audit({ user, ip: ctx.ip }, { accion: 'PASSWORD_RESTABLECIDA', entidad: 'users', entidad_id: id, motivo: ctx.body.motivo || null });
    return { ok: true };
  });

  r.post('/api/usuarios/:id/desbloquear', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'usuarios.escribir');
    run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', Number(ctx.params.id));
    audit({ user, ip: ctx.ip }, { accion: 'USUARIO_DESBLOQUEADO', entidad: 'users', entidad_id: ctx.params.id });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Motivos de rechazo (configurables por el Administrador)
  // -------------------------------------------------------------------------
  r.get('/api/admin/motivos-rechazo', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.escribir');
    return { motivos: all('SELECT * FROM motivos_rechazo ORDER BY orden, id') };
  });

  r.post('/api/admin/motivos-rechazo', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.escribir');
    const texto = String(ctx.body.texto || '').trim();
    if (!texto) throw badRequest('Escriba el motivo');
    const info = run(
      'INSERT INTO motivos_rechazo (texto, requiere_comentario, orden) VALUES (?, ?, ?)',
      texto, ctx.body.requiere_comentario ? 1 : 0, Number(ctx.body.orden) || 99
    );
    audit({ user, ip: ctx.ip }, { accion: 'MOTIVO_CREADO', entidad: 'motivos_rechazo', entidad_id: info.lastInsertRowid, nuevo: { texto } });
    return { id: Number(info.lastInsertRowid) };
  });

  r.put('/api/admin/motivos-rechazo/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'catalogo.escribir');
    const antes = get('SELECT * FROM motivos_rechazo WHERE id = ?', Number(ctx.params.id));
    if (!antes) throw notFound('Motivo no encontrado');
    const { sql, valores } = sentenciaActualizacion(
      'motivos_rechazo', ['texto', 'requiere_comentario', 'activo', 'orden'], ctx.body
    );
    run(sql, ...valores, antes.id);
    audit({ user, ip: ctx.ip }, { accion: 'MOTIVO_ACTUALIZADO', entidad: 'motivos_rechazo', entidad_id: antes.id, antes, nuevo: ctx.body });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Configuracion general (folio, sesiones, red autorizada, umbrales)
  // -------------------------------------------------------------------------
  r.get('/api/admin/configuracion', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'config.escribir');
    const filas = all('SELECT * FROM settings ORDER BY key');
    return { configuracion: filas, valores_por_defecto: DEFAULT_SETTINGS };
  });

  r.put('/api/admin/configuracion', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'config.escribir');
    const cambios = ctx.body.configuracion || {};
    const aplicados = [];
    tx(() => {
      for (const [key, value] of Object.entries(cambios)) {
        const antes = setting(key, null);
        if (String(antes) === String(value)) continue;
        setSetting(key, value, user.id);
        aplicados.push(key);
        audit({ user, ip: ctx.ip }, {
          accion: 'CONFIGURACION_MODIFICADA', entidad: 'settings', entidad_id: key,
          antes: { [key]: antes }, nuevo: { [key]: value }, motivo: ctx.body.motivo || null
        });
      }
    });
    return { ok: true, aplicados };
  });

  // -------------------------------------------------------------------------
  // Auditoria
  // -------------------------------------------------------------------------
  r.get('/api/auditoria', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'auditoria.leer');
    const where = [];
    const params = [];
    if (ctx.query.entidad) { where.push('entidad = ?'); params.push(ctx.query.entidad); }
    if (ctx.query.entidad_id) { where.push('entidad_id = ?'); params.push(String(ctx.query.entidad_id)); }
    if (ctx.query.user_id) { where.push('user_id = ?'); params.push(ctx.query.user_id); }
    if (ctx.query.accion) { where.push('accion LIKE ?'); params.push(`%${ctx.query.accion}%`); }
    if (ctx.query.desde) { where.push('date(created_at) >= date(?)'); params.push(ctx.query.desde); }
    if (ctx.query.hasta) { where.push('date(created_at) <= date(?)'); params.push(ctx.query.hasta); }
    // Direccion consulta auditoria de alto nivel, sin el detalle de accesos.
    if (user.rol === 'DIRECCION') where.push("accion NOT IN ('LOGIN','LOGOUT','LOGIN_PIN')");

    const limit = Math.min(Number(ctx.query.limit) || 200, 1000);
    return {
      registros: all(
        `SELECT * FROM auditoria WHERE ${where.length ? where.join(' AND ') : '1=1'}
         ORDER BY created_at DESC, id DESC LIMIT ?`, ...params, limit
      ),
      acciones: all('SELECT DISTINCT accion FROM auditoria ORDER BY accion').map((a) => a.accion)
    };
  });

  /** Sesiones activas: util para vigilar iPads compartidos. */
  r.get('/api/admin/sesiones', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'usuarios.escribir');
    return {
      sesiones: all(
        `SELECT s.id, s.kind, s.ip, s.created_at, s.last_seen_at, s.expires_at,
                u.nombre, u.employee_id, u.rol
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.revoked_at IS NULL AND s.expires_at > datetime('now')
         ORDER BY s.last_seen_at DESC`
      )
    };
  });

  r.delete('/api/admin/sesiones/:id', (ctx) => {
    const user = requireUser(ctx);
    requirePerm(user, 'usuarios.escribir');
    run(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?`, ctx.params.id);
    audit({ user, ip: ctx.ip }, { accion: 'SESION_REVOCADA', entidad: 'sessions', entidad_id: ctx.params.id });
    return { ok: true };
  });
}
