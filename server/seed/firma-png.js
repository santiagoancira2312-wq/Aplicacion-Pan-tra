import zlib from 'node:zlib';

/**
 * Generador de firmas de demostracion.
 * Dibuja un trazo distinto para cada entrega y lo codifica como PNG real,
 * de modo que la firma se vea en pantalla igual que una capturada con el dedo.
 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}

/** PNG en escala de grises de 8 bits. */
function png(width, height, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bits por muestra
  ihdr[9] = 0;   // escala de grises
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filtro None
    pixeles.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export function firmaDemo(random, ancho = 320, alto = 110) {
  const px = Buffer.alloc(ancho * alto, 255);
  const punto = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const a = xi + dx, b = yi + dy;
        if (a >= 0 && a < ancho && b >= 0 && b < alto) {
          px[b * ancho + a] = Math.min(px[b * ancho + a], dx === 0 && dy === 0 ? 20 : 90);
        }
      }
    }
  };

  // Trazo principal: suma de senoidales con parametros aleatorios.
  const base = alto * 0.6;
  const a1 = 12 + random() * 18, f1 = 0.03 + random() * 0.04, p1 = random() * 6;
  const a2 = 6 + random() * 12, f2 = 0.08 + random() * 0.09, p2 = random() * 6;
  const inicio = 20 + random() * 20;
  const fin = ancho - 20 - random() * 40;
  for (let x = inicio; x < fin; x += 0.5) {
    const t = (x - inicio) / (fin - inicio);
    const amortiguacion = Math.sin(Math.PI * t) * 0.9 + 0.1;
    punto(x, base - (a1 * Math.sin(f1 * x + p1) + a2 * Math.sin(f2 * x + p2)) * amortiguacion);
  }
  // Rubrica final.
  const rx = fin, ry = base;
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    punto(rx - 60 * t + random() * 2, ry + 18 * Math.sin(t * Math.PI * 1.5) - 4);
  }

  return 'data:image/png;base64,' + png(ancho, alto, px).toString('base64');
}
