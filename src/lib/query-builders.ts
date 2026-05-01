export type SerialType = 'card' | 'motherserial' | 'batch'

export interface QueryResult {
  label: string
  sql:   string
}

// ── Serial Inquiry ─────────────────────────────────────────────────────────────

export function buildSerialQueries(serialType: SerialType, serial: string): QueryResult[] {
  const s = serial.trim()
  if (!s) return []

  if (serialType === 'card') {
    return [
      { label: 'card',       sql: `SELECT * FROM card WHERE serialno = '${s}'` },
      { label: 'log_pass',   sql: `SELECT * FROM log_pass WHERE cardno = '${s}_1' ORDER BY lastupdate` },
      { label: 'log_repair', sql: `SELECT * FROM log_repair WHERE cardno = '${s}_1' ORDER BY lastupdate` },
      { label: 'log_link',   sql: `SELECT * FROM log_link WHERE serialno = '${s}' or serialnoLink = '${s}'` },
    ]
  } else if (serialType === 'motherserial') {
    return [
      { label: 'motherserial', sql: `SELECT * FROM motherserial WHERE motherserial = '${s}'` },
      { label: 'log_mother',   sql: `SELECT * FROM log_mother WHERE motherserial = '${s}' ORDER BY lastupdate` },
      { label: 'log_repair',   sql: `SELECT * FROM log_repair WHERE cardno = '${s}' ORDER BY lastupdate` },
      { label: 'log_link',     sql: `SELECT * FROM log_link WHERE serialno = '${s}' or serialnoLink = '${s}' ORDER BY lastupdate` },
    ]
  } else {
    return [
      { label: 'batch',      sql: `SELECT * FROM batch WHERE batchno = '${s}'` },
      { label: 'log_batch',  sql: `SELECT * FROM log_batch WHERE batchno = '${s}_1' ORDER BY lastupdate` },
      { label: 'log_repair', sql: `SELECT * FROM log_repair WHERE cardno = '${s}_1' ORDER BY lastupdate` },
      { label: 'log_link',   sql: `SELECT * FROM log_link WHERE serialno = '${s}' or serialnoLink = '${s}' ORDER BY lastupdate` },
    ]
  }
}

// ── Model Route Checker ────────────────────────────────────────────────────────

export function buildRouteQuery(partno: string): string {
  const p = partno.trim()
  if (!p) return ''
  return `EXEC checkModelRoute '${p}'`
}

// ── Bulk Inquiry ───────────────────────────────────────────────────────────────

export function formatIn(values: string[]): string {
  return values.map(v => `  '${v}'`).join(',\n')
}

export function buildBulkCardQuery(serials: string[]): string {
  if (!serials.length) return ''
  return `SELECT * FROM card\nWHERE serialno IN (\n${formatIn(serials)}\n)\nORDER BY lastupdate;`
}

export function buildBulkLogPassQuery(serials: string[]): string {
  if (!serials.length) return ''
  const suffixed = serials.map(s => `${s}_1`)
  return `SELECT * FROM log_pass\nWHERE cardno IN (\n${formatIn(suffixed)}\n)\nORDER BY cardno, lastupdate;`
}
