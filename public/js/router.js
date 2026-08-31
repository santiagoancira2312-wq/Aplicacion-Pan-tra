/** Enrutador de la aplicacion de una sola pagina (History API). */

const rutas = [];
let alNavegar = null;

export function ruta(patron, cargador) {
  const claves = [];
  const regex = new RegExp('^' + patron.replace(/:[A-Za-z_]+/g, (m) => {
    claves.push(m.slice(1));
    return '([^/]+)';
  }).replace(/\/$/, '') + '/?$');
  rutas.push({ patron, regex, claves, cargador });
}

export function resolver(camino) {
  for (const r of rutas) {
    const m = camino.match(r.regex);
    if (!m) continue;
    const params = {};
    r.claves.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { cargador: r.cargador, params, patron: r.patron };
  }
  return null;
}

export function ir(camino, { reemplazar = false } = {}) {
  if (reemplazar) history.replaceState({}, '', camino);
  else history.pushState({}, '', camino);
  if (alNavegar) alNavegar(camino);
}

export function iniciar(manejador) {
  alNavegar = manejador;
  window.addEventListener('popstate', () => manejador(location.pathname));

  // Cualquier enlace interno navega sin recargar.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/"]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    ir(a.getAttribute('href'));
  });

  manejador(location.pathname);
}

export const caminoActual = () => location.pathname;
