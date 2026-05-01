<script setup lang="ts">
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, Copy, Check, Trash2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Badge from '@/components/ui/Badge.vue'

// ── Helpers ────────────────────────────────────────────────────────────────────
function q(v: string) { return `'${v.replace(/'/g, "''")}'` }

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightSql(text: string, kwPattern: string, procPattern = ''): string {
  return text.split('\n').map(line =>
    line.split(/('+[^']*'+)/g).map(part => {
      if (part.startsWith("'") && part.endsWith("'"))
        return `<span class="sql-string">${escapeHtml(part)}</span>`
      let out = escapeHtml(part)
        .replace(new RegExp(`\\b(${kwPattern})\\b`, 'gi'), '<span class="sql-keyword">$1</span>')
      if (procPattern)
        out = out.replace(new RegExp(`(${procPattern})`, 'g'), '<span class="sql-proc">$1</span>')
      return out
    }).join('')
  ).join('\n')
}

function cellStr(val: unknown): string {
  if (val instanceof Date) {
    const p = (n: number, l = 2) => String(n).padStart(l, '0')
    return `${val.getFullYear()}-${p(val.getMonth() + 1)}-${p(val.getDate())} ${p(val.getHours())}:${p(val.getMinutes())}:${p(val.getSeconds())}.000`
  }
  return String(val ?? '').trim()
}

// ── Types ──────────────────────────────────────────────────────────────────────
type SupportType = 'bulk-rejection' | 'manual-registration' | 'reroute' | 'conversion' | 'transfer-history'
interface SheetSection { label: string; plain: string; highlighted: string }
interface SheetResult {
  sheetName: string
  type: SupportType
  label: string
  rowCount: number
  duplicates: string[]
  sections: SheetSection[]
  expanded: boolean
}

// ── Sheet name detection ───────────────────────────────────────────────────────
const TYPE_LABELS: Record<SupportType, string> = {
  'bulk-rejection':      'Bulk Rejection',
  'manual-registration': 'Manual Registration',
  'reroute':             'Reroute',
  'conversion':          'Conversion',
  'transfer-history':    'Transfer History',
}

const SHEET_HINTS: { label: string; hint: string }[] = [
  { label: 'Bulk Rejection',      hint: 'bulk · rejection' },
  { label: 'Manual Registration', hint: 'manual · registration' },
  { label: 'Reroute',             hint: 'reroute' },
  { label: 'Conversion',          hint: 'conversion · convert' },
  { label: 'Transfer History',    hint: 'transfer' },
]

function detectType(name: string): SupportType | null {
  const n = name.toLowerCase().replace(/[\s_-]/g, '')
  if (n.includes('bulk') || n.includes('rejection'))           return 'bulk-rejection'
  if (n.includes('manual') || n.includes('registration'))      return 'manual-registration'
  if (n.includes('reroute'))                                    return 'reroute'
  if (n.includes('transfer'))                                   return 'transfer-history'
  if (n.includes('conversion') || n.includes('convert'))       return 'conversion'
  return null
}

// ── Column alias maps ──────────────────────────────────────────────────────────
type AliasMap = Record<string, string>

const ALIASES: Record<SupportType, AliasMap> = {
  'bulk-rejection': {
    account:'account', acct:'account',
    serial:'serial', serialno:'serial', 'serial no':'serial',
    category:'category', cat:'category', defectcat:'category',
    defect:'defect', defectcode:'defect',
    location:'location', loc:'location',
    station:'station', stat:'station', curtstation:'station',
    date:'date', datetime:'date',
    isremovelot:'isRemoveLot', removelot:'isRemoveLot', remove:'isRemoveLot',
  },
  'manual-registration': {
    account:'account', acct:'account',
    serial:'serial', serialno:'serial', 'serial no':'serial',
    workorder:'workorder', 'work order':'workorder', wo:'workorder',
    model:'model', partno:'model', 'part no':'model',
    revision:'revision', rev:'revision',
    station:'station', stat:'station',
    date:'date', datetime:'date',
  },
  'reroute': {
    account:'account', acct:'account',
    serial:'serial', serialno:'serial', 'serial no':'serial',
    station:'station', stat:'station', curstation:'station', destination:'station', dest:'station',
  },
  'conversion': {
    account:'account', acct:'account',
    serial:'serial', serialno:'serial', 'serial no':'serial',
    model:'partno', partno:'partno', 'part no':'partno',
    workorder:'workorder', 'work order':'workorder', wo:'workorder',
    revision:'revision', rev:'revision',
  },
  'transfer-history': {
    account:'account', acct:'account',
    'old serial':'oldSerial', oldserial:'oldSerial', oldserialno:'oldSerial', old:'oldSerial',
    'new serial':'newSerial', newserial:'newSerial', newserialno:'newSerial', new:'newSerial',
    model:'model', partno:'model',
    revision:'revision', rev:'revision',
  },
}

const POSITIONAL: Record<SupportType, string[]> = {
  'bulk-rejection':      ['account','serial','category','defect','location','station','date','isRemoveLot'],
  'manual-registration': ['account','serial','workorder','model','revision','station','date'],
  'reroute':             ['account','serial','station'],
  'conversion':          ['account','serial','partno','workorder','revision'],
  'transfer-history':    ['account','oldSerial','newSerial','model','revision'],
}

// ── Grid parsing ───────────────────────────────────────────────────────────────
function parseGrid(grid: unknown[][], type: SupportType): Record<string, string>[] {
  if (!grid.length) return []
  const aliases   = ALIASES[type]
  const positional = POSITIONAL[type]
  const firstRow  = (grid[0] as unknown[]).map(c => cellStr(c))
  const hasHeaders = firstRow.some(h => aliases[h.toLowerCase().trim()] !== undefined)
  const colMap: (string | null)[] = hasHeaders
    ? firstRow.map(h => aliases[h.toLowerCase().trim()] ?? null)
    : positional.map(k => k)
  const dataRows = hasHeaders ? grid.slice(1) : grid
  return dataRows
    .map(r => {
      const row: Record<string, string> = {}
      colMap.forEach((key, i) => {
        if (!key) return
        const val = (r as unknown[])[i]
        if (val != null && cellStr(val) !== '') row[key] = cellStr(val)
      })
      return row
    })
    .filter(r => Object.keys(r).length > 0)
}

function getDuplicates(rows: Record<string, string>[], key: string): string[] {
  const seen = new Map<string, number>()
  for (const r of rows) { const v = r[key] ?? ''; seen.set(v, (seen.get(v) ?? 0) + 1) }
  return [...seen.entries()].filter(([, c]) => c > 1).map(([s]) => s)
}

// ── Per-type processors ────────────────────────────────────────────────────────
function bulkProcess(rows: Record<string, string>[]): { duplicates: string[]; sections: SheetSection[] } {
  const dupes = getDuplicates(rows, 'serial')
  if (dupes.length) return { duplicates: dupes, sections: [] }
  const plain = rows.map(r => {
    const rl = (r.isRemoveLot ?? '1') === '0' ? '0' : '1'
    return `EXEC DYSON_BULK_REJECTION ${q(r.account??'')}, ${q(r.serial??'')}, ${q(r.category??'')}, ${q(r.defect??'')}, ${q(r.location??'')}, ${q(r.station??'')}, ${q(r.date??'')}, ${rl};`
  }).join('\n')
  return { duplicates: [], sections: [{ label: 'Bulk Rejection', plain, highlighted: highlightSql(plain, 'EXEC', 'DYSON_BULK_REJECTION') }] }
}

function manualProcess(rows: Record<string, string>[]): { duplicates: string[]; sections: SheetSection[] } {
  const dupes = getDuplicates(rows, 'serial')
  if (dupes.length) return { duplicates: dupes, sections: [] }
  const cardLines = rows.map(r => {
    const cn = `${r.serial ?? ''}_1`, dt = r.date ?? ''
    return `INSERT INTO card VALUES(${q(r.account??'')}, ${q(cn)}, ${q(r.serial??'')}, '', ${q(r.model??'')}, ${q(r.revision??'')}, '', '', 0,0,0,0,0, 'GOOD', '', '', ${q(r.station??'')}, ${q(dt)}, ${q(dt)}, 'CATS')`
  }).join('\n')
  const logLines = rows.map(r => {
    const cn = `${r.serial ?? ''}_1`, dt = r.date ?? ''
    return `INSERT INTO log_pass VALUES(${q(r.account??'')}, ${q(cn)}, '', 0, ${q(r.station??'')}, '', 'GOOD', ${q(dt)}, 'CATS')`
  }).join('\n')
  return {
    duplicates: [],
    sections: [
      { label: 'Card',     plain: cardLines, highlighted: highlightSql(cardLines, 'INSERT|INTO|VALUES', 'card') },
      { label: 'Log Pass', plain: logLines,  highlighted: highlightSql(logLines,  'INSERT|INTO|VALUES', 'log_pass') },
    ],
  }
}

function rerouteProcess(rows: Record<string, string>[]): { duplicates: string[]; sections: SheetSection[] } {
  const dupes = getDuplicates(rows, 'serial')
  if (dupes.length) return { duplicates: dupes, sections: [] }
  const gmap = new Map<string, { account: string; station: string; serials: string[] }>()
  const order: string[] = []
  for (const r of rows) {
    const k = `${r.account ?? ''}||${r.station ?? ''}`
    if (!gmap.has(k)) { gmap.set(k, { account: r.account ?? '', station: r.station ?? '', serials: [] }); order.push(k) }
    gmap.get(k)!.serials.push(r.serial ?? '')
  }
  const plain = order.map(k => {
    const g = gmap.get(k)!
    const list = g.serials.map(s => `  ${q(s)}`).join(',\n')
    return `UPDATE card SET curtstation = ${q(g.station)}\nWHERE account = ${q(g.account)} AND serialno IN (\n${list}\n)`
  }).join('\n\n')
  return { duplicates: [], sections: [{ label: 'Reroute', plain, highlighted: highlightSql(plain, 'UPDATE|SET|WHERE|AND|IN', 'card') }] }
}

function conversionProcess(rows: Record<string, string>[]): { duplicates: string[]; sections: SheetSection[] } {
  const dupes = getDuplicates(rows, 'serial')
  if (dupes.length) return { duplicates: dupes, sections: [] }
  const gmap = new Map<string, { account: string; partno: string; workorder: string; revision: string; serials: string[] }>()
  const order: string[] = []
  for (const r of rows) {
    const k = `${r.account}||${r.partno ?? ''}||${r.workorder ?? ''}||${r.revision ?? ''}`
    if (!gmap.has(k)) { gmap.set(k, { account: r.account ?? '', partno: r.partno ?? '', workorder: r.workorder ?? '', revision: r.revision ?? '', serials: [] }); order.push(k) }
    gmap.get(k)!.serials.push(r.serial ?? '')
  }
  const plain = order.map(k => {
    const g = gmap.get(k)!
    const fields: string[] = []
    if (g.partno)    fields.push(`partno = ${q(g.partno)}`)
    if (g.workorder) fields.push(`workorder = ${q(g.workorder)}`)
    if (g.revision)  fields.push(`revision = ${q(g.revision)}`)
    if (!fields.length) return ''
    const set   = fields.join(', ')
    const where = `account = ${q(g.account)}`
    if (g.serials.length === 1) return `UPDATE card SET ${set} WHERE ${where} and serialno = ${q(g.serials[0])}`
    const list = g.serials.map(s => q(s)).join(',\n')
    return `UPDATE card SET ${set} WHERE ${where} and serialno in (\n${list}\n)`
  }).filter(Boolean).join('\n\n')
  return { duplicates: [], sections: [{ label: 'Conversion', plain, highlighted: highlightSql(plain, 'UPDATE|SET|WHERE|and|in', 'card') }] }
}

function transferProcess(rows: Record<string, string>[]): { duplicates: string[]; sections: SheetSection[] } {
  const dupes = getDuplicates(rows, 'oldSerial')
  if (dupes.length) return { duplicates: dupes, sections: [] }
  const plain = rows.map(r =>
    `EXEC CHANGE_OLD_TO_NEW_serial ${q(r.oldSerial ?? '')},${q(r.newSerial ?? '')},${q(r.model ?? '')},${q(r.revision ?? '')}`
  ).join('\n')
  return { duplicates: [], sections: [{ label: 'Transfer', plain, highlighted: highlightSql(plain, 'EXEC', 'CHANGE_OLD_TO_NEW_serial') }] }
}

function processSheet(type: SupportType, grid: unknown[][]): { duplicates: string[]; sections: SheetSection[] } {
  const rows = parseGrid(grid, type)
  if (type === 'bulk-rejection')      return bulkProcess(rows)
  if (type === 'manual-registration') return manualProcess(rows)
  if (type === 'reroute')             return rerouteProcess(rows)
  if (type === 'conversion')          return conversionProcess(rows)
  return transferProcess(rows)
}

// ── State ──────────────────────────────────────────────────────────────────────
const isDragging = ref(false)
const fileName   = ref('')
const results    = ref<SheetResult[]>([])
const error      = ref('')
const copiedMap  = ref<Record<string, boolean>>({})

function processFile(file: File) {
  error.value   = ''
  results.value = []
  copiedMap.value = {}
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['xlsx', 'xls'].includes(ext)) {
    error.value = 'Please upload a valid Excel file (.xlsx or .xls). CSV is not supported in batch mode.'
    return
  }
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true })
      const processed: SheetResult[] = []
      for (const sheetName of wb.SheetNames) {
        const type = detectType(sheetName)
        if (!type) continue
        const sheet = wb.Sheets[sheetName]
        const grid = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][])
          .filter(r => (r as unknown[]).some(c => c != null && String(c).trim() !== ''))
        if (!grid.length) continue
        const { duplicates, sections } = processSheet(type, grid)
        processed.push({
          sheetName, type, label: TYPE_LABELS[type],
          rowCount: Math.max(0, grid.length - 1),
          duplicates, sections, expanded: true,
        })
      }
      if (!processed.length) {
        error.value = 'No recognizable sheets found. Name sheets with keywords like "Bulk Rejection", "Reroute", etc.'
      }
      results.value = processed
    } catch { error.value = 'Failed to parse the file.' }
  }
  reader.readAsBinaryString(file)
}

function onDrop(e: DragEvent)  { isDragging.value = false; const f = e.dataTransfer?.files[0]; if (f) processFile(f) }
function onFileInput(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) processFile(f) }
function reset()               { fileName.value = ''; results.value = []; error.value = ''; copiedMap.value = {} }
function toggleExpand(i: number) { results.value[i].expanded = !results.value[i].expanded }

async function copySection(key: string, text: string) {
  await navigator.clipboard.writeText(text)
  copiedMap.value[key] = true
  setTimeout(() => { copiedMap.value[key] = false }, 2000)
}

const errCount = computed(() => results.value.filter(r => r.duplicates.length > 0).length)
</script>

<template>
  <div class="p-8 space-y-6 max-w-full">

    <!-- Title -->
    <div class="border-b border-border pb-5">
      <h2 class="text-lg font-semibold">Batch Upload</h2>
      <p class="text-sm text-muted-foreground mt-1">
        Upload a single Excel file with multiple named sheets. Each sheet is auto-detected by name and processed with the matching support type logic.
      </p>
    </div>

    <!-- Sheet naming guide -->
    <div class="rounded-md border border-border bg-muted/20 px-4 py-3 space-y-2">
      <p class="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Sheet name keywords</p>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="item in SHEET_HINTS"
          :key="item.label"
          class="rounded border border-border bg-muted/40 px-3 py-2 min-w-[150px] space-y-0.5"
        >
          <div class="text-foreground/80 font-medium text-[11px]">{{ item.label }}</div>
          <div class="text-muted-foreground text-[11px] font-mono">{{ item.hint }}</div>
        </div>
      </div>
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
        <input type="file" accept=".xlsx,.xls" class="sr-only" @change="onFileInput" />
        <div class="flex flex-col items-center gap-2 text-center px-6">
          <Upload class="w-7 h-7 text-muted-foreground" />
          <p class="text-sm text-muted-foreground">
            Drag &amp; drop or
            <span class="text-foreground underline underline-offset-2">browse</span>
            — .xlsx / .xls
          </p>
        </div>
      </label>

      <!-- Error -->
      <div v-if="error" class="flex items-start gap-2 text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-md px-3 py-2">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />{{ error }}
      </div>

      <!-- File info bar -->
      <div v-if="fileName" class="flex items-center gap-3 rounded border border-border bg-muted/30 px-4 py-2">
        <FileSpreadsheet class="w-4 h-4 text-muted-foreground shrink-0" />
        <span class="text-sm truncate flex-1">{{ fileName }}</span>
        <Badge variant="secondary">{{ results.length }} sheet{{ results.length !== 1 ? 's' : '' }}</Badge>
        <Badge v-if="errCount" variant="destructive" class="text-[11px]">{{ errCount }} error{{ errCount > 1 ? 's' : '' }}</Badge>
        <button class="text-muted-foreground hover:text-foreground transition-colors" title="Remove" @click="reset">
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Results -->
    <div v-if="results.length" class="space-y-4">
      <div
        v-for="(result, ri) in results"
        :key="result.sheetName"
        class="rounded-lg border border-border overflow-hidden"
      >
        <!-- Sheet header (clickable toggle) -->
        <button
          class="w-full flex items-center gap-3 px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
          @click="toggleExpand(ri)"
        >
          <component :is="result.expanded ? ChevronDown : ChevronRight" class="w-4 h-4 text-muted-foreground shrink-0" />
          <span class="font-medium text-sm flex-1">{{ result.label }}</span>
          <span class="text-[11px] text-muted-foreground font-mono opacity-60 mr-2">{{ result.sheetName }}</span>
          <Badge variant="secondary" class="text-[11px]">{{ result.rowCount }} rows</Badge>
          <Badge v-if="result.duplicates.length" variant="destructive" class="text-[11px] ml-1">duplicates</Badge>
          <Badge v-else variant="outline" class="text-[11px] ml-1 border-green-900/40 text-green-400">ready</Badge>
        </button>

        <!-- Expanded body -->
        <div v-if="result.expanded" class="border-t border-border">

          <!-- Duplicate error -->
          <div v-if="result.duplicates.length" class="px-4 py-3 space-y-2">
            <div class="flex items-center gap-2 text-sm font-semibold text-red-400">
              <AlertCircle class="w-4 h-4 shrink-0" />
              {{ result.duplicates.length }} duplicate serial{{ result.duplicates.length > 1 ? 's' : '' }} — fix before running
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="s in result.duplicates"
                :key="s"
                class="inline-flex rounded px-2 py-0.5 text-[11px] font-mono bg-red-900/40 text-red-300 border border-red-800/40"
              >{{ s }}</span>
            </div>
          </div>

          <!-- Query sections -->
          <div v-else class="divide-y divide-border/40">
            <div
              v-for="(section, si) in result.sections"
              :key="si"
              class="px-4 py-3 space-y-2"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{{ section.label }}</span>
                <Button
                  variant="outline"
                  size="sm"
                  class="gap-1.5 h-7 text-xs"
                  @click="copySection(`${ri}-${si}`, section.plain)"
                >
                  <Check v-if="copiedMap[`${ri}-${si}`]" class="w-3 h-3 text-green-400" />
                  <Copy v-else class="w-3 h-3" />
                  {{ copiedMap[`${ri}-${si}`] ? 'Copied!' : 'Copy' }}
                </Button>
              </div>
              <div class="rounded border border-border bg-zinc-950 overflow-auto max-h-72">
                <pre class="font-mono text-sm p-4 whitespace-pre leading-6" v-html="section.highlighted" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!fileName" class="flex flex-col items-center py-10 text-muted-foreground gap-2">
      <FileSpreadsheet class="w-10 h-10 opacity-20" />
      <p class="text-sm opacity-60">Upload a multi-sheet Excel file to begin</p>
    </div>

  </div>
</template>
