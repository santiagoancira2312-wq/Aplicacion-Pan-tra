/**
 * Cliente de la API.
 * Regla del MVP: si no hay conexion se avisa con claridad y NUNCA se simula
 * que una operacion quedo guardada cuando no llego a la base de datos.
 */
export class ErrorApi extends Error {
  constructor(mensaje, status, datos) {
    super(mensaje);
    this.status = status;
    this.datos = datos || {};
  }
}

export const SIN_CONEXION = 'SIN CONEXION. No se pudo registrar la operacion.';

const oyentes = new Set();
export const alPerderSesion = (fn) => oyentes.add(fn);

async function peticion(metodo, ruta, cuerpo) {
  let res;
  try {
    res = await fetch(ruta, {
      method: metodo,
      headers: cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: 'same-origin'
    });
  } catch {
    throw new ErrorApi(SIN_CONEXION, 0);
  }

  if (res.status === 204) return {};

  const tipo = res.headers.get('content-type') || '';
  const datos = tipo.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    if (res.status === 401 && !ruta.includes('/auth/login')) {
      for (const fn of oyentes) fn();
    }
    const mensaje = (datos && datos.error) || `Error ${res.status}`;
    throw new ErrorApi(mensaje, res.status, datos);
  }
  return datos;
}

export const api = {
  get: (ruta) => peticion('GET', ruta),
  post: (ruta, cuerpo = {}) => peticion('POST', ruta, cuerpo),
  put: (ruta, cuerpo = {}) => peticion('PUT', ruta, cuerpo),
  del: (ruta) => peticion('DELETE', ruta),

  /** Descarga un reporte en formato Excel (CSV). */
  descargar(ruta) {
    const a = document.createElement('a');
    a.href = ruta;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
};

/** Construye una cadena de consulta omitiendo los valores vacios. */
export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
