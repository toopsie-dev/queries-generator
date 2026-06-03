<script setup lang="ts">
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, Copy, Check, Trash2, Table2, AlertCircle } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'

// ── Types ──────────────────────────────────────────────────────────────────────
interface RowData {
  account:   string
  serial:    string
  workorder: string
  model:     string
  revision:  string
  station:   string
  date:      string
}

// ── State ──────────────────────────────────────────────────────────────────────
const isDragging = ref(false)
const fileName   = ref('')
const rows       = ref<RowData[]>([])
const copied     = ref(false)
const error      = ref('')

// ── Column header aliases ──────────────────────────────────────────────────────
const COL_ALIASES: Record<string, keyof RowData> = {
  account:       'account',
  acct:          'account',
  serial:        'serial',
  serialno:      'serial',
  'serial no':   'serial',
  'serial number':'serial',
  workorder:     'workorder',
  'work order':  'workorder',
  wo:            'workorder',
  model:         'model',
  partno:        'model',
  'part no':     'model',
  'part number': 'model',
  revision:      'revision',
  rev:           'revision',
  station:       'station',
  stat:          'station',
  curstation:    'station',
  date:          'date',
  datetime:      'date',
  starttime:     'date',
}

function resolveHeader(h: string): keyof RowData | null {
  return COL_ALIASES[h.toLowerCase().trim()] ?? null
}

// ── Date formatting ────────────────────────────────────────────────────────────
function formatDate(val: unknown): string {
  if (val instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return (
      `${val.getFullYear()}-${p(val.getMonth() + 1)}-${p(val.getDate())} ` +
      `${p(val.getHours())}:${p(val.getMinutes())}:${p(val.getSeconds())}.000`
    )
  }
  return String(val ?? '').trim()
}

// ── File processing ────────────────────────────────────────────────────────────
const POSITIONAL_COLS: (keyof RowData)[] = [
  'account', 'serial', 'workorder', 'model', 'revision', 'station', 'date',
]

function processFile(file: File) {
  error.value = ''
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
    error.value = 'Please upload a valid Excel or CSV file (.xlsx, .xls, .csv).'
    return
  }
  fileName.value = file.name

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true })
      const matchedName = wb.SheetNames.find(n => { const k = n.toLowerCase().replace(/[\s_\-]/g, ''); return k.includes('manual') || k.includes('registration') })
      const sheet = wb.Sheets[matchedName ?? wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, cellDates: true })
        .filter((r) => (r as unknown[]).some((c) => c != null && String(c).trim() !== ''))

      if (grid.length === 0) { error.value = 'No data found in the file.'; return }

      const firstRow = (grid[0] as unknown[]).map((c) => String(c ?? '').trim())
      const hasHeaders = firstRow.some((h) => resolveHeader(h) !== null)

      let colMap: (keyof RowData | null)[]
      let dataRows: unknown[][]

      if (hasHeaders) {
        colMap   = firstRow.map((h) => resolveHeader(h))
        dataRows = grid.slice(1)
      } else {
        colMap   = POSITIONAL_COLS
        dataRows = grid
      }

      rows.value = dataRows
        .map((r) => {
          const row: RowData = { account: '', serial: '', workorder: '', model: '', revision: '', station: '', date: '' }
          colMap.forEach((key, i) => {
            if (!key) return
            const val = (r as unknown[])[i]
            if (val == null) return
            row[key] = key === 'date' ? formatDate(val) : String(val).trim()
          })
          return row
        })
        .filter((r) => r.serial !== '')
    } catch {
      error.value = 'Failed to parse the file. Make sure it is a valid Excel/CSV file.'
    }
  }
  reader.readAsBinaryString(file)
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file) processFile(file)
}
function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processFile(file)
}

// ── Duplicate detection ────────────────────────────────────────────────────────
const duplicateSerials = computed(() => {
  const seen = new Map<string, number>()
  for (const r of rows.value) seen.set(r.serial, (seen.get(r.serial) ?? 0) + 1)
  return [...seen.entries()].filter(([, c]) => c > 1).map(([s]) => s)
})
const hasDuplicates = computed(() => duplicateSerials.value.length > 0)

// ── Query mode toggle ─────────────────────────────────────────────────────────
const queryMode = ref<'card' | 'log_pass'>('card')

// ── SQL generation ─────────────────────────────────────────────────────────────
// card VALUES order (20 fields):
//   account, cardno, serialno, system21, workorder, partno, revision, linecode,
//   holdflag, packflag, shipflag, rtvflag, rejectflag,
//   status, lotno, lottype, curstation, starttime, lastupdate, lastupdatedby
//
// log_pass VALUES order (9 fields):
//   account, cardno, '', 0, station, '', 'GOOD', date, model
function q(v: string) { return `'${v.replace(/'/g, "''")}'` }

function insertCard(r: RowData): string {
  const cardno = r.serial + '_1'
  const vals = [
    q(r.account), q(cardno), q(r.serial),
    `''`,                  // system21
    q(r.workorder), q(r.model),
    q(r.revision), `''`,   // linecode
    '0', '0', '0', '0', '0', // flags
    `'GOOD'`,
    `''`, `''`,            // lotno, lottype
    q(r.station),
    q(r.date), q(r.date), // starttime, lastupdate
    `'CATS'`,             // lastupdatedby
  ].join(', ')
  return `INSERT INTO card VALUES(${vals})`
}

function insertLogPass(r: RowData): string {
  const cardno = r.serial + '_1'
  const vals = [
    q(r.account), q(cardno),
    `''`, '0',
    q(r.station), `''`,
    `'GOOD'`,
    q(r.date),
    `'CATS'`, 
  ].join(', ')
  return `INSERT INTO log_pass VALUES(${vals})`
}

const plainText = computed(() => {
  if (hasDuplicates.value) return ''
  const fn = queryMode.value === 'card' ? insertCard : insertLogPass
  return rows.value.map(fn).join('\n')
})

// ── Syntax highlighting ────────────────────────────────────────────────────────
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const SQL_KEYWORDS = /\b(INSERT|INTO|VALUES)\b/g
const SQL_TABLES   = /\b(card|log_pass)\b/g

const highlightedSql = computed(() => {
  if (!plainText.value) return ''
  return plainText.value
    .split('\n')
    .map((line) =>
      line
        .split(/('+[^']*'+)/g)
        .map((part) => {
          if (part.startsWith("'") && part.endsWith("'"))
            return `<span class="sql-string">${escapeHtml(part)}</span>`
          return escapeHtml(part)
            .replace(SQL_KEYWORDS, '<span class="sql-keyword">$1</span>')
            .replace(SQL_TABLES,   '<span class="sql-proc">$1</span>')
        })
        .join(''),
    )
    .join('\n')
})

// ── Clipboard ─────────────────────────────────────────────────────────────────
async function copyQuery() {
  if (!plainText.value) return
  await navigator.clipboard.writeText(plainText.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function reset() {
  fileName.value = ''
  rows.value     = []
  error.value    = ''
  copied.value   = false
}

// ── Missing columns ────────────────────────────────────────────────────────────
const missingCols = computed(() => {
  if (!rows.value.length) return []
  const r = rows.value[0]
  return (['account','serial','workorder','model','revision','station','date'] as (keyof RowData)[])
    .filter((k) => r[k] === '')
})
</script>

<template>
  <div class="p-8 space-y-6 max-w-full">

    <!-- Title -->
    <div class="border-b border-border pb-5">
      <h2 class="text-lg font-semibold">Manual Registration</h2>
      <p class="text-sm text-muted-foreground mt-1">
        Upload an Excel file to generate
        <code class="text-[#569cd6] font-mono text-xs">INSERT INTO card</code>
        and
        <code class="text-[#569cd6] font-mono text-xs">INSERT INTO log_pass</code>
        statements for each row.
      </p>
    </div>

    <!-- Expected columns hint -->
    <div class="rounded-md border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground font-mono flex flex-wrap gap-2 items-center">
      <span class="text-muted-foreground/50 text-[11px] font-sans mr-1">Expected columns:</span>
      <span
        v-for="col in ['Account','Serial','Workorder','Model','Revision','Station','Date']"
        :key="col"
        class="px-2 py-0.5 rounded bg-muted/60 text-foreground/70"
      >{{ col }}</span>
    </div>

    <!-- Upload zone -->
    <div class="space-y-3">
      <label
        class="flex flex-col items-center justify-center w-full h-36 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
        :class="isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/20'"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <input type="file" accept=".xlsx,.xls,.csv" class="sr-only" @change="onFileInput" />
        <div class="flex flex-col items-center gap-2 text-center px-6">
          <Upload class="w-7 h-7 text-muted-foreground" />
          <p class="text-sm text-muted-foreground">
            Drag &amp; drop or
            <span class="text-foreground underline underline-offset-2">browse</span>
            — .xlsx / .xls / .csv
          </p>
        </div>
      </label>

      <!-- Error -->
      <div v-if="error" class="flex items-start gap-2 text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-md px-3 py-2">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
        {{ error }}
      </div>

      <!-- Missing columns -->
      <div v-if="missingCols.length" class="flex items-start gap-2 text-sm text-yellow-400 bg-yellow-950/20 border border-yellow-900/30 rounded-md px-3 py-2">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
        <span>Columns not found in file: <strong>{{ missingCols.join(', ') }}</strong>. Values will be empty.</span>
      </div>

      <!-- Duplicate serials -->
      <div v-if="hasDuplicates" class="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-3 space-y-2">
        <div class="flex items-center gap-2 text-sm font-semibold text-red-400">
          <AlertCircle class="w-4 h-4 shrink-0" />
          {{ duplicateSerials.length }} duplicate serial{{ duplicateSerials.length > 1 ? 's' : '' }} found — fix before generating queries
        </div>
        <div class="flex flex-wrap gap-1.5 pt-1">
          <span
            v-for="serial in duplicateSerials"
            :key="serial"
            class="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-mono bg-red-900/40 text-red-300 border border-red-800/40"
          >{{ serial }}</span>
        </div>
      </div>

      <!-- File info bar -->
      <div v-if="fileName" class="flex items-center gap-3 rounded border border-border bg-muted/30 px-4 py-2">
        <FileSpreadsheet class="w-4 h-4 text-muted-foreground shrink-0" />
        <span class="text-sm truncate flex-1">{{ fileName }}</span>
        <Badge variant="secondary">{{ rows.length }} rows</Badge>
        <button class="text-muted-foreground hover:text-foreground transition-colors" title="Remove" @click="reset">
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Generated INSERT output -->
    <div v-if="rows.length && !hasDuplicates" class="space-y-3">
      <div class="flex items-center justify-between">
        <!-- Card / Log Pass toggle -->
        <div class="flex items-center rounded-md border border-border overflow-hidden">
          <button
            class="px-4 py-1.5 text-sm font-medium transition-colors"
            :class="queryMode === 'card'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'"
            @click="queryMode = 'card'"
          >
            Card
          </button>
          <div class="w-px h-5 bg-border" />
          <button
            class="px-4 py-1.5 text-sm font-medium transition-colors"
            :class="queryMode === 'log_pass'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'"
            @click="queryMode = 'log_pass'"
          >
            Log Pass
          </button>
        </div>

        <Button variant="outline" size="sm" class="gap-2" @click="copyQuery">
          <Check v-if="copied" class="w-4 h-4 text-green-400" />
          <Copy v-else class="w-4 h-4" />
          {{ copied ? 'Copied!' : 'Copy All' }}
        </Button>
      </div>
      <div class="rounded border border-border bg-zinc-950 overflow-auto max-h-[520px]">
        <pre class="font-mono text-sm p-4 whitespace-pre leading-6" v-html="highlightedSql" />
      </div>
    </div>

    <!-- Preview table -->
    <div v-if="rows.length" class="space-y-2">
      <div class="flex items-center gap-2 mb-1">
        <Table2 class="w-4 h-4 text-muted-foreground" />
        <span class="text-sm font-medium">Data Preview</span>
        <Badge variant="secondary" class="text-xs">{{ rows.length }} rows</Badge>
      </div>
      <div class="overflow-auto rounded border border-border max-h-52">
        <table class="w-full text-xs font-mono border-collapse">
          <thead class="sticky top-0 bg-zinc-900 z-10">
            <tr>
              <th
                v-for="col in ['account','serial','workorder','model','revision','station','date']"
                :key="col"
                class="px-3 py-2 text-left text-muted-foreground uppercase tracking-wide font-semibold border-b border-border whitespace-nowrap text-[11px]"
              >{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in rows"
              :key="i"
              class="border-b border-border/40 transition-colors"
              :class="duplicateSerials.includes(row.serial) ? 'bg-red-950/20 hover:bg-red-950/30' : 'hover:bg-muted/20'"
            >
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.account }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap">{{ row.serial }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.workorder }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.model }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.revision }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.station }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.date }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!fileName" class="flex flex-col items-center py-10 text-muted-foreground gap-2">
      <FileSpreadsheet class="w-10 h-10 opacity-20" />
      <p class="text-sm opacity-60">Upload an Excel file to begin</p>
    </div>

  </div>
</template>
