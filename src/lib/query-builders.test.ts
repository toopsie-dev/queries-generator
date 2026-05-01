import { describe, it, expect } from 'vitest'
import {
  buildSerialQueries,
  buildRouteQuery,
  formatIn,
  buildBulkCardQuery,
  buildBulkLogPassQuery,
} from '@/lib/query-builders'

// ── buildSerialQueries ─────────────────────────────────────────────────────────

describe('buildSerialQueries', () => {
  describe('empty / whitespace input', () => {
    it('returns empty array for empty string', () => {
      expect(buildSerialQueries('card', '')).toEqual([])
    })

    it('returns empty array for whitespace-only string', () => {
      expect(buildSerialQueries('card', '   ')).toEqual([])
    })
  })

  describe('card type', () => {
    const serial = 'C12345'
    const results = buildSerialQueries('card', serial)

    it('returns 4 queries', () => {
      expect(results).toHaveLength(4)
    })

    it('generates card SELECT query', () => {
      expect(results[0]).toEqual({
        label: 'card',
        sql: `SELECT * FROM card WHERE serialno = '${serial}'`,
      })
    })

    it('generates log_pass query with _1 suffix', () => {
      expect(results[1]).toEqual({
        label: 'log_pass',
        sql: `SELECT * FROM log_pass WHERE cardno = '${serial}_1' ORDER BY lastupdate`,
      })
    })

    it('generates log_repair query with _1 suffix', () => {
      expect(results[2]).toEqual({
        label: 'log_repair',
        sql: `SELECT * FROM log_repair WHERE cardno = '${serial}_1' ORDER BY lastupdate`,
      })
    })

    it('generates log_link query for both directions', () => {
      expect(results[3]).toEqual({
        label: 'log_link',
        sql: `SELECT * FROM log_link WHERE serialno = '${serial}' or serialnoLink = '${serial}'`,
      })
    })

    it('trims whitespace from serial', () => {
      const trimmed = buildSerialQueries('card', '  C12345  ')
      expect(trimmed[0].sql).toContain("'C12345'")
    })
  })

  describe('motherserial type', () => {
    const serial = 'MB98765'
    const results = buildSerialQueries('motherserial', serial)

    it('returns 4 queries', () => {
      expect(results).toHaveLength(4)
    })

    it('generates motherserial SELECT query', () => {
      expect(results[0]).toEqual({
        label: 'motherserial',
        sql: `SELECT * FROM motherserial WHERE motherserial = '${serial}'`,
      })
    })

    it('generates log_mother query', () => {
      expect(results[1]).toEqual({
        label: 'log_mother',
        sql: `SELECT * FROM log_mother WHERE motherserial = '${serial}' ORDER BY lastupdate`,
      })
    })

    it('generates log_repair query without _1 suffix', () => {
      expect(results[2]).toEqual({
        label: 'log_repair',
        sql: `SELECT * FROM log_repair WHERE cardno = '${serial}' ORDER BY lastupdate`,
      })
    })

    it('generates log_link query with ORDER BY', () => {
      expect(results[3]).toEqual({
        label: 'log_link',
        sql: `SELECT * FROM log_link WHERE serialno = '${serial}' or serialnoLink = '${serial}' ORDER BY lastupdate`,
      })
    })
  })

  describe('batch type', () => {
    const serial = 'BT001'
    const results = buildSerialQueries('batch', serial)

    it('returns 4 queries', () => {
      expect(results).toHaveLength(4)
    })

    it('generates batch SELECT query', () => {
      expect(results[0]).toEqual({
        label: 'batch',
        sql: `SELECT * FROM batch WHERE batchno = '${serial}'`,
      })
    })

    it('generates log_batch query with _1 suffix', () => {
      expect(results[1]).toEqual({
        label: 'log_batch',
        sql: `SELECT * FROM log_batch WHERE batchno = '${serial}_1' ORDER BY lastupdate`,
      })
    })

    it('generates log_repair query with _1 suffix', () => {
      expect(results[2]).toEqual({
        label: 'log_repair',
        sql: `SELECT * FROM log_repair WHERE cardno = '${serial}_1' ORDER BY lastupdate`,
      })
    })

    it('generates log_link query for both directions', () => {
      expect(results[3]).toEqual({
        label: 'log_link',
        sql: `SELECT * FROM log_link WHERE serialno = '${serial}' or serialnoLink = '${serial}' ORDER BY lastupdate`,
      })
    })
  })
})

// ── buildRouteQuery ────────────────────────────────────────────────────────────

describe('buildRouteQuery', () => {
  it('returns empty string for empty input', () => {
    expect(buildRouteQuery('')).toBe('')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(buildRouteQuery('   ')).toBe('')
  })

  it('generates EXEC query', () => {
    expect(buildRouteQuery('MODEL-X1')).toBe("EXEC checkModelRoute 'MODEL-X1'")
  })

  it('trims whitespace from part number', () => {
    expect(buildRouteQuery('  MODEL-X1  ')).toBe("EXEC checkModelRoute 'MODEL-X1'")
  })
})

// ── formatIn ──────────────────────────────────────────────────────────────────

describe('formatIn', () => {
  it('formats a single value', () => {
    expect(formatIn(['ABC'])).toBe("  'ABC'")
  })

  it('formats multiple values with commas and newlines', () => {
    expect(formatIn(['A', 'B', 'C'])).toBe("  'A',\n  'B',\n  'C'")
  })

  it('returns empty string for empty array', () => {
    expect(formatIn([])).toBe('')
  })
})

// ── buildBulkCardQuery ────────────────────────────────────────────────────────

describe('buildBulkCardQuery', () => {
  it('returns empty string for empty serials', () => {
    expect(buildBulkCardQuery([])).toBe('')
  })

  it('generates correct IN query for a single serial', () => {
    const sql = buildBulkCardQuery(['XXXXX01'])
    expect(sql).toBe(
      "SELECT * FROM card\nWHERE serialno IN (\n  'XXXXX01'\n)\nORDER BY lastupdate;"
    )
  })

  it('generates correct IN query for multiple serials', () => {
    const sql = buildBulkCardQuery(['XXXXX01', 'XXXXX02'])
    expect(sql).toBe(
      "SELECT * FROM card\nWHERE serialno IN (\n  'XXXXX01',\n  'XXXXX02'\n)\nORDER BY lastupdate;"
    )
  })

  it('includes ORDER BY lastupdate', () => {
    expect(buildBulkCardQuery(['S1'])).toContain('ORDER BY lastupdate')
  })
})

// ── buildBulkLogPassQuery ─────────────────────────────────────────────────────

describe('buildBulkLogPassQuery', () => {
  it('returns empty string for empty serials', () => {
    expect(buildBulkLogPassQuery([])).toBe('')
  })

  it('appends _1 suffix to each serial', () => {
    const sql = buildBulkLogPassQuery(['XXXXX01', 'XXXXX02'])
    expect(sql).toContain("'XXXXX01_1'")
    expect(sql).toContain("'XXXXX02_1'")
  })

  it('generates correct IN query for a single serial', () => {
    const sql = buildBulkLogPassQuery(['XXXXX01'])
    expect(sql).toBe(
      "SELECT * FROM log_pass\nWHERE cardno IN (\n  'XXXXX01_1'\n)\nORDER BY cardno, lastupdate;"
    )
  })

  it('generates correct IN query for multiple serials', () => {
    const sql = buildBulkLogPassQuery(['XXXXX01', 'XXXXX02'])
    expect(sql).toBe(
      "SELECT * FROM log_pass\nWHERE cardno IN (\n  'XXXXX01_1',\n  'XXXXX02_1'\n)\nORDER BY cardno, lastupdate;"
    )
  })

  it('includes ORDER BY cardno, lastupdate', () => {
    expect(buildBulkLogPassQuery(['S1'])).toContain('ORDER BY cardno, lastupdate')
  })
})
