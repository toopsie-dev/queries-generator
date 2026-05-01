<script setup lang="ts">
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, Copy, Check, Trash2, Table2, AlertCircle, Layers } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'

// ── Types ──────────────────────────────────────────────────────────────────────
interface RowData {
  account: string
  serial:  string
  station: string
}

// ── State ──────────────────────────────────────────────────────────────────────
const isDragging = ref(false)
const fileName   = ref('')
const rows       = ref<RowData[]>([])
const copied     = ref(false)
const error      = ref('')
const queryMode  = ref<'fetch' | 'reroute'>('reroute')

// ── Column aliases ─────────────────────────────────────────────────────────────
const COL_ALIASES: Record<string, keyof RowData> = {
  account:     'account',
  acct:        'account',
  serial:      'serial',
  serialno:    'serial',
  'serial no': 'serial',
  station:     'station',
  stat:        'station',
  curstation:  'station',
  destination: 'station',
  dest:        'station',
}

function resolveHeader(h: string): keyof RowData | null {
  return COL_ALIASES[h.toLowerCase().trim()] ?? null
}

const POSITIONAL_COLS: (keyof RowData)[] = ['account', 'serial', 'station']

// ── File processing ────────────────────────────────────────────────────────────
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
      const wb = XLSX.read(e.target?.result, { type: 'binary' })
      const matchedName = wb.SheetNames.find(n => n.toLowerCase().replace(/[\s_\-]/g, '').includes('reroute'))
      const sheet = wb.Sheets[matchedName ?? wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
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
          const row: RowData = { account: '', serial: '', station: '' }
          colMap.forEach((key, i) => {
            if (!key) return
            const val = (r as unknown[])[i]
            if (val == null) return
            row[key] = String(val).trim()
          })
          return row
        })
        .filter((r) => r.serial !== '')
    } catch {
      error.value = 'Failed to parse the file.'
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

// ── Group by account + station (preserving first-seen station order) ───────────
interface StationGroup {
  account: string
  station: string
  serials: string[]
}

const groups = computed<StationGroup[]>(() => {
  if (hasDuplicates.value) return []
  const map = new Map<string, StationGroup>()
  const order: string[] = []
  for (const r of rows.value) {
    const key = `${r.account}||${r.station}`
    if (!map.has(key)) {
      map.set(key, { account: r.account, station: r.station, serials: [] })
      order.push(key)
    }
    map.get(key)!.serials.push(r.serial)
  }
  return order.map((k) => map.get(k)!)
})

// ── Fetch groups (by account only) ───────────────────────────────────────────
const fetchGroups = computed(() => {
  if (hasDuplicates.value) return []
  const map = new Map<string, string[]>()
  const order: string[] = []
  for (const r of rows.value) {
    if (!map.has(r.account)) {
      map.set(r.account, [])
      order.push(r.account)
    }
    map.get(r.account)!.push(r.serial)
  }
  return order.map((account) => ({ account, serials: map.get(account)! }))
})

// ── SQL generation ─────────────────────────────────────────────────────────────
function q(v: string) { return `'${v.replace(/'/g, "''")}'` }

function generateGroup(g: StationGroup): string {
  const serialList = g.serials.map((s) => `  ${q(s)}`).join(',\n')
  return (
    `UPDATE card SET curtstation = ${q(g.station)}\n` +
    `WHERE account = ${q(g.account)} AND serialno IN (\n` +
    `${serialList}\n)`
  )
}

const plainText = computed(() =>
  hasDuplicates.value ? '' : groups.value.map(generateGroup).join('\n\n'),
)

const fetchPlainText = computed(() => {
  if (hasDuplicates.value) return ''
  return fetchGroups.value
    .map((g) => {
      const serialList = g.serials.map((s) => q(s)).join(',\n')
      return `SELECT * FROM card WHERE account = ${q(g.account)} AND serialno IN (\n${serialList}\n)`
    })
    .join('\n\n')
})

// ── Syntax highlighting ────────────────────────────────────────────────────────
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

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
            .replace(/\b(update|set|where|and|in)\b/gi, '<span class="sql-keyword">$1</span>')
            .replace(/\b(card)\b/g, '<span class="sql-proc">$1</span>')
        })
        .join(''),
    )
    .join('\n')
})

const fetchHighlightedSql = computed(() => {
  if (!fetchPlainText.value) return ''
  return fetchPlainText.value
    .split('\n')
    .map((line) =>
      line
        .split(/('+[^']*'+)/g)
        .map((part) => {
          if (part.startsWith("'") && part.endsWith("'"))
            return `<span class="sql-string">${escapeHtml(part)}</span>`
          return escapeHtml(part)
            .replace(/\b(SELECT|FROM|WHERE|and|in)\b/gi, '<span class="sql-keyword">$1</span>')
            .replace(/\b(card)\b/g, '<span class="sql-proc">$1</span>')
            .replace(/\*/g, '<span class="sql-keyword">*</span>')
        })
        .join(''),
    )
    .join('\n')
})

// ── Clipboard ─────────────────────────────────────────────────────────────────
async function copyQuery() {
  const text = queryMode.value === 'fetch' ? fetchPlainText.value : plainText.value
  if (!text) return
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function reset() {
  fileName.value = ''
  rows.value     = []
  error.value    = ''
  copied.value   = false
}

const missingCols = computed(() => {
  if (!rows.value.length) return []
  const r = rows.value[0]
  return (['account', 'serial', 'station'] as (keyof RowData)[]).filter((k) => r[k] === '')
})
</script>

<template>
  <div class="p-8 space-y-6 max-w-full">

    <!-- Title -->
    <div class="border-b border-border pb-5">
      <h2 class="text-lg font-semibold">Reroute</h2>
      <p class="text-sm text-muted-foreground mt-1">
        Upload an Excel file to generate
        <code class="text-[#569cd6] font-mono text-xs">UPDATE card SET curtstation</code>
        queries grouped by station.
      </p>
    </div>

    <!-- Expected columns -->
    <div class="rounded-md border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground font-mono flex flex-wrap gap-2 items-center">
      <span class="text-muted-foreground/50 text-[11px] font-sans mr-1">Expected columns:</span>
      <span
        v-for="col in ['Account', 'Serial', 'Station']"
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
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />{{ error }}
      </div>

      <!-- Missing columns -->
      <div v-if="missingCols.length" class="flex items-start gap-2 text-sm text-yellow-400 bg-yellow-950/20 border border-yellow-900/30 rounded-md px-3 py-2">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
        <span>Columns not found: <strong>{{ missingCols.join(', ') }}</strong>. Values will be empty.</span>
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

    <!-- Station groups summary -->
    <div v-if="groups.length" class="space-y-2">
      <div class="flex items-center gap-2">
        <Layers class="w-4 h-4 text-muted-foreground" />
        <span class="text-sm font-medium">Station Groups</span>
        <Badge variant="secondary" class="text-xs">{{ groups.length }} group{{ groups.length > 1 ? 's' : '' }}</Badge>
      </div>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="g in groups"
          :key="g.station + g.account"
          class="flex items-center gap-2 rounded border border-border bg-muted/20 px-3 py-1.5 text-xs font-mono"
        >
          <span class="text-muted-foreground">{{ g.account }}</span>
          <span class="text-foreground font-semibold">{{ g.station }}</span>
          <Badge variant="secondary">{{ g.serials.length }}</Badge>
        </div>
      </div>
    </div>

    <!-- Query output -->
    <div v-if="rows.length && !hasDuplicates" class="space-y-3">
      <!-- Mode toggle -->
      <div class="flex items-center gap-2">
        <Button
          :variant="queryMode === 'fetch' ? 'default' : 'outline'"
          size="sm"
          @click="queryMode = 'fetch'; copied = false"
        >Fetch</Button>
        <Button
          :variant="queryMode === 'reroute' ? 'default' : 'outline'"
          size="sm"
          @click="queryMode = 'reroute'; copied = false"
        >Reroute</Button>
      </div>

      <!-- Output header -->
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Generated Queries</span>
        <Button variant="outline" size="sm" class="gap-2" @click="copyQuery">
          <Check v-if="copied" class="w-4 h-4 text-green-400" />
          <Copy v-else class="w-4 h-4" />
          {{ copied ? 'Copied!' : 'Copy All' }}
        </Button>
      </div>

      <!-- Fetch SELECT output -->
      <div v-if="queryMode === 'fetch'" class="rounded border border-border bg-zinc-950 overflow-auto max-h-[520px]">
        <pre class="font-mono text-sm p-4 whitespace-pre leading-6" v-html="fetchHighlightedSql" />
      </div>

      <!-- Reroute UPDATE output -->
      <div v-else class="rounded border border-border bg-zinc-950 overflow-auto max-h-[520px]">
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
              <th v-for="col in ['account','serial','station']" :key="col"
                class="px-3 py-2 text-left text-muted-foreground uppercase tracking-wide font-semibold border-b border-border whitespace-nowrap text-[11px]">
                {{ col }}
              </th>
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
              <td class="px-3 py-1.5 whitespace-nowrap">
                <span class="px-2 py-0.5 rounded bg-muted/60 text-foreground/80">{{ row.station }}</span>
              </td>
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
