/**
 * Genera los iconos PNG de la PWA a partir de un diseno propio.
 * Marca neutra para el demo: un vale con marca de verificacion sobre fondo
 * grafito con acento ambar. No usa logotipos ni colores de ninguna empresa.
 *
 *   node tools/generar-iconos.js
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(DIR, { recursive: true });

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (tipo, datos) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
};

/** PNG RGBA de 8 bits. */
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const GRAFITO = [22, 27, 34];
const AMBAR = [217, 124, 21];
const AMBAR_C = [240, 158, 60];
const PAPEL = [246, 247, 249];

function dibujar(tamano, { maskable = false } = {}) {
  const px = Buffer.alloc(tamano * tamano * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= tamano || y >= tamano) return;
    const i = (y * tamano + x) * 4;
    const af = a / 255;
    px[i] = Math.round(px[i] * (1 - af) + r * af);
    px[i + 1] = Math.round(px[i + 1] * (1 - af) + g * af);
    px[i + 2] = Math.round(px[i + 2] * (1 - af) + b * af);
    px[i + 3] = Math.max(px[i + 3], a);
  };

  // Fondo: cuadrado redondeado (completo si es maskable).
  const radio = maskable ? 0 : tamano * 0.22;
  for (let y = 0; y < tamano; y++) {
    for (let x = 0; x < tamano; x++) {
      let dentro = true;
      if (radio > 0) {
        const cx = Math.min(Math.max(x, radio), tamano - radio);
        const cy = Math.min(Math.max(y, radio), tamano - radio);
        dentro = Math.hypot(x - cx, y - cy) <= radio;
      }
      if (!dentro) continue;
      // Degradado diagonal sutil.
      const t = (x + y) / (2 * tamano);
      set(x, y, [
        Math.round(GRAFITO[0] + t * 22),
        Math.round(GRAFITO[1] + t * 24),
        Math.round(GRAFITO[2] + t * 28)
      ]);
    }
  }

  const u = tamano / 100;                   // unidad relativa
  const margen = maskable ? 28 * u : 22 * u;
  const anchoVale = tamano - margen * 2;
  const altoVale = anchoVale * 1.18;
  const x0 = margen;
  const y0 = (tamano - altoVale) / 2;

  // Hoja del vale.
  const rHoja = 5 * u;
  for (let y = y0; y < y0 + altoVale; y++) {
    for (let x = x0; x < x0 + anchoVale; x++) {
      const cx = Math.min(Math.max(x, x0 + rHoja), x0 + anchoVale - rHoja);
      const cy = Math.min(Math.max(y, y0 + rHoja), y0 + altoVale - rHoja);
      if (Math.hypot(x - cx, y - cy) <= rHoja) set(Math.round(x), Math.round(y), PAPEL);
    }
  }

  // Pestana superior ambar (sujetapapeles).
  const pestanaAncho = anchoVale * 0.5;
  const px0 = x0 + (anchoVale - pestanaAncho) / 2;
  const py0 = y0 - 4 * u;
  for (let y = py0; y < py0 + 9 * u; y++) {
    for (let x = px0; x < px0 + pestanaAncho; x++) {
      set(Math.round(x), Math.round(y), AMBAR);
    }
  }

  // Renglones del vale.
  const renglon = (i, ancho) => {
    const y = y0 + altoVale * (0.32 + i * 0.13);
    for (let yy = y; yy < y + 3.4 * u; yy++) {
      for (let x = x0 + 11 * u; x < x0 + 11 * u + ancho; x++) {
        set(Math.round(x), Math.round(yy), [140, 149, 161]);
      }
    }
  };
  renglon(0, anchoVale * 0.54);
  renglon(1, anchoVale * 0.42);

  // Marca de verificacion ambar.
  const cx = x0 + anchoVale * 0.52;
  const cy = y0 + altoVale * 0.72;
  const grosor = 5.4 * u;
  const trazo = (ax, ay, bx, by) => {
    const pasos = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      for (let dy = -grosor / 2; dy <= grosor / 2; dy += 0.5) {
        for (let dx = -grosor / 2; dx <= grosor / 2; dx += 0.5) {
          if (dx * dx + dy * dy <= (grosor / 2) ** 2) {
            set(Math.round(x + dx), Math.round(y + dy), AMBAR_C);
          }
        }
      }
    }
  };
  trazo(cx - 15 * u, cy, cx - 5 * u, cy + 10 * u);
  trazo(cx - 5 * u, cy + 10 * u, cx + 16 * u, cy - 12 * u);

  return png(tamano, tamano, px);
}

for (const [nombre, tamano, opts] of [
  ['icono-180.png', 180, {}],
  ['icono-192.png', 192, {}],
  ['icono-512.png', 512, {}],
  ['icono-512-maskable.png', 512, { maskable: true }]
]) {
  fs.writeFileSync(path.join(DIR, nombre), dibujar(tamano, opts));
  console.log('  ' + nombre);
}

// Version vectorial para navegadores de escritorio.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Vale">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#20262f"/><stop offset="1" stop-color="#0f141a"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="url(#f)"/>
  <rect x="22" y="18" width="56" height="66" rx="5" fill="#f6f7f9"/>
  <rect x="36" y="14" width="28" height="9" rx="2.5" fill="#d97c15"/>
  <rect x="33" y="39" width="30" height="3.4" rx="1.7" fill="#8c95a1"/>
  <rect x="33" y="52" width="23" height="3.4" rx="1.7" fill="#8c95a1"/>
  <path d="M37 66 l7 7 l15 -16" fill="none" stroke="#f09e3c" stroke-width="5.4"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
fs.writeFileSync(path.join(DIR, 'icono.svg'), svg);
console.log('  icono.svg');
