/** Exportacion a CSV compatible con Excel (BOM + separador coma). */
export function toCsv(rows, columns) {
  if (!columns) columns = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = columns.map((c) => esc(c.label || c)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key || c])).join(',')).join('\n');
  return '\uFEFF' + head + '\n' + body + '\n';
}

export function csvFilename(nombre) {
  const d = new Date().toISOString().slice(0, 10);
  return `${nombre}_${d}.csv`;
}
