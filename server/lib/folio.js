import { db, get, setting } from '../db.js';

/**
 * Folio automatico unico y con formato configurable desde la interfaz.
 * Formato por defecto: PT-{YYYY}-{SEQ:6}  ->  PT-2026-000001
 * Tokens: {YYYY} {YY} {MM} {DD} {SEQ:n}
 */
export function generarFolio(tabla = 'vales', settingKey = 'folio_formato') {
  const formato = setting(settingKey, 'PT-{YYYY}-{SEQ:6}');
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const base = formato
    .replace('{YYYY}', yyyy)
    .replace('{YY}', yyyy.slice(2))
    .replace('{MM}', String(now.getMonth() + 1).padStart(2, '0'))
    .replace('{DD}', String(now.getDate()).padStart(2, '0'));

  const m = base.match(/\{SEQ:(\d+)\}/);
  const ancho = m ? Number(m[1]) : 6;
  const prefijo = base.split('{SEQ')[0];

  // La secuencia se reinicia por prefijo (por ano si el formato incluye {YYYY}).
  const row = get(
    `SELECT folio FROM ${tabla} WHERE folio LIKE ? ORDER BY id DESC LIMIT 1`,
    prefijo + '%'
  );
  let siguiente = 1;
  if (row) {
    const n = parseInt(String(row.folio).slice(prefijo.length).replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) siguiente = n + 1;
  }

  const sufijo = base.split('}').slice(-1)[0];
  const armar = (n) => prefijo + String(n).padStart(ancho, '0') + sufijo;

  let folio = armar(siguiente);
  // Garantia adicional de unicidad ante concurrencia.
  while (get(`SELECT 1 AS x FROM ${tabla} WHERE folio = ?`, folio)) {
    siguiente += 1;
    folio = armar(siguiente);
  }
  return folio;
}
