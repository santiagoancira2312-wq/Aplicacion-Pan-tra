/**
 * Juego de iconos propio en SVG (trazo de 24x24).
 * Se dibujan con currentColor para adaptarse al tema claro y oscuro.
 * Se evitan los emoji para conservar un aspecto industrial y consistente
 * en iPad, Android, Windows y Mac.
 */
const NS = 'http://www.w3.org/2000/svg';

const TRAZOS = {
  mas: ['M12 5v14', 'M5 12h14'],
  documento: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
  lista: ['M9 4h6v3H9z', 'M15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2',
    'M9 12h6', 'M9 16h4'],
  check: ['M20 6L9 17l-5-5'],
  checkCirculo: ['M22 11.1V12a10 10 0 1 1-5.9-9.1', 'M22 4L12 14l-3-3'],
  caja: ['M21 8l-9-5-9 5 9 5 9-5z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'],
  etiqueta: ['M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6z'],
  entrada: ['M12 3v11', 'M8 11l4 4 4-4', 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'],
  movimientos: ['M3 8h13l-3-3', 'M21 16H8l3 3'],
  kit: ['M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z',
    'M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3', 'M3 13h18'],
  camion: ['M3 6h11v10H3z', 'M14 9h4l3 3v4h-7z', 'M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
  panel: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  tendencia: ['M3 17l6-6 4 4 7-7', 'M15 8h5v5'],
  edificio: ['M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16', 'M14 10h4a2 2 0 0 1 2 2v9', 'M2 21h20',
    'M8 7h2', 'M8 11h2', 'M8 15h2'],
  descargar: ['M12 3v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  usuarios: ['M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M22 20v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  lupa: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  ajustes: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z'],
  persona: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  campana: ['M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  actualizar: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  basura: ['M3 6h18', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
  cerrar: ['M18 6L6 18', 'M6 6l12 12'],
  firma: ['M3 20h18', 'M5 16c3-1 4-9 7-9s2 7 5 7c1.5 0 2-1 2-1'],
  alerta: ['M12 3l9 16H3z', 'M12 9v5', 'M12 17h.01'],
  reloj: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  candado: ['M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
    'M8 11V7a4 4 0 1 1 8 0v4'],
  salir: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  volver: ['M19 12H5', 'M12 19l-7-7 7-7']
};

export function icono(nombre, tamano = 20) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(tamano));
  svg.setAttribute('height', String(tamano));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.flex = 'none';
  for (const d of TRAZOS[nombre] || TRAZOS.documento) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d.replace(/\s+/g, ' '));
    svg.appendChild(path);
  }
  return svg;
}

export const ICONOS = Object.keys(TRAZOS);
