<script setup lang="ts">
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, Copy, Check, Trash2, Table2, AlertCircle } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'

// ── Types ──────────────────────────────────────────────────────────────────────
interface RowData {
  account:      string
  serial:       string
  category:     string
  defect:       string
  location:     string
  station:      string
  date:         string
  isRemoveLot:  string   // '1' = remove, '0' = not remove
}

// ── State ──────────────────────────────────────────────────────────────────────
const isDragging = ref(false)
const fileName   = ref('')
const rows       = ref<RowData[]>([])
const copied     = ref(false)
const error      = ref('')

// ── Column header aliases ──────────────────────────────────────────────────────
const COL_ALIASES: Record<string, keyof RowData> = {
  account:          'account',
  acct:             'account',
  serial:           'serial',
  serialno:         'serial',
  'serial no':      'serial',
  'serial number':  'serial',
  category:         'category',
  cat:              'category',
  'defect category':'category',
  defect:           'defect',
  'defect code':    'defect',
  location:         'location',
  loc:              'location',
  station:          'station',
  stat:             'station',
  date:             'date',
  datetime:         'date',
  isremovelot:      'isRemoveLot',
  'is remove lot':  'isRemoveLot',
  'remove lot':     'isRemoveLot',
  removelot:        'isRemoveLot',
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
      const matchedName = wb.SheetNames.find(n => { const k = n.toLowerCase().replace(/[\s_\-]/g, ''); return k.includes('bulk') || k.includes('rejection') })
      const sheet = wb.Sheets[matchedName ?? wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

      if (raw.length === 0) {
        error.value = 'No data found in the file.'
        return
      }

      rows.value = raw
        .map((r) => {
          const row: RowData = { account: '', serial: '', category: '', defect: '', location: '', station: '', date: '', isRemoveLot: '1' }
          for (const [key, val] of Object.entries(r)) {
            const mapped = resolveHeader(key)
            if (!mapped) continue
            row[mapped] = mapped === 'date' ? formatDate(val) : String(val ?? '').trim()
          }
          return row
        })
        .filter((r) => r.serial !== '')   // skip blank rows
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

// ── EXEC generation ────────────────────────────────────────────────────────────
// Format: EXEC DYSON_BULK_REJECTION 'Acct','Serial','Cat','Defect','Loc','Station','Date',isRemoveLot;
function q(v: string) {
  return `'${v.replace(/'/g, "''")}'`
}
function execRow(r: RowData): string {
  const removeLot = r.isRemoveLot === '0' ? '0' : '1'
  return (
    `EXEC DYSON_BULK_REJECTION ` +
    [q(r.account), q(r.serial), q(r.category), q(r.defect), q(r.location), q(r.station), q(r.date), removeLot].join(', ') + ';'
  )
}

const plainText = computed(() =>
  hasDuplicates.value ? '' : rows.value.map(execRow).join('\n'),
)

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
          if (part.startsWith("'") && part.endsWith("'")) {
            return `<span class="sql-string">${escapeHtml(part)}</span>`
          }
          return escapeHtml(part)
            .replace(/\bEXEC\b/g, '<span class="sql-keyword">EXEC</span>')
            .replace(/\bDYSON_BULK_REJECTION\b/g, '<span class="sql-proc">DYSON_BULK_REJECTION</span>')
            .replace(/(?<=,\s)(\b[01]\b)(?=,|$)/g, '<span class="sql-number">$1</span>')
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
  rows.value = []
  error.value = ''
  copied.value = false
}

// ── Duplicate serial detection ───────────────────────────────────────────────
const duplicateSerials = computed(() => {
  const seen = new Map<string, number>()
  for (const r of rows.value) {
    seen.set(r.serial, (seen.get(r.serial) ?? 0) + 1)
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([serial]) => serial)
})

const hasDuplicates = computed(() => duplicateSerials.value.length > 0)

// ── Missing columns warning ────────────────────────────────────────────────────
const missingCols = computed(() => {
  if (!rows.value.length) return []
  const r = rows.value[0]
  return (['account','serial','category','defect','location','station','date','isRemoveLot'] as (keyof RowData)[])
    .filter((k) => r[k] === '')
})
</script>

<template>
  <div class="p-8 space-y-6 max-w-full">

    <!-- Title -->
    <div class="border-b border-border pb-5">
      <h2 class="text-lg font-semibold">Bulk Rejection</h2>
      <p class="text-sm text-muted-foreground mt-1">
        Upload an Excel file to generate
        <code class="text-[#dcdcaa] font-mono text-xs">EXEC DYSON_BULK_REJECTION</code>
        statements for each row.
      </p>
    </div>

    <!-- Expected format hint -->
    <div class="rounded-md border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground font-mono flex flex-wrap gap-2 items-center">
      <span class="text-muted-foreground/50 text-[11px] font-sans mr-1">Expected columns:</span>
      <span v-for="col in ['Account','Serial','Category','Defect','Location','Station','Date','isRemoveLot']" :key="col"
        class="px-2 py-0.5 rounded bg-muted/60 text-foreground/70">
        {{ col }}
      </span>
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

      <!-- Missing columns warning -->
      <div v-if="missingCols.length" class="flex items-start gap-2 text-sm text-yellow-400 bg-yellow-950/20 border border-yellow-900/30 rounded-md px-3 py-2">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
        <span>Columns not found in file: <strong>{{ missingCols.join(', ') }}</strong>. Values will be empty.</span>
      </div>

      <!-- Duplicate serials error -->
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
          >
            {{ serial }}
          </span>
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

    <!-- Generated EXEC output -->
    <div v-if="rows.length && !hasDuplicates" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Generated Queries</span>
        <Button variant="outline" size="sm" class="gap-2" @click="copyQuery">
          <Check v-if="copied" class="w-4 h-4 text-green-400" />
          <Copy v-else class="w-4 h-4" />
          {{ copied ? 'Copied!' : 'Copy All' }}
        </Button>
      </div>
      <div class="rounded border border-border bg-zinc-950 overflow-auto max-h-96">
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
                v-for="col in ['account','serial','category','defect','location','station','date','isRemoveLot']"
                :key="col"
                class="px-3 py-2 text-left text-muted-foreground uppercase tracking-wide font-semibold border-b border-border whitespace-nowrap text-[11px]"
              >
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
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.category }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.defect }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.location }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.station }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{{ row.date }}</td>
              <td class="px-3 py-1.5 whitespace-nowrap text-center">
                <span
                  class="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold"
                  :class="row.isRemoveLot === '0' ? 'bg-zinc-800 text-zinc-400' : 'bg-red-950/60 text-red-400'"
                >
                  {{ row.isRemoveLot === '0' ? '0 · keep' : '1 · remove' }}
                </span>
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
