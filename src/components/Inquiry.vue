<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import { Copy, Check, Search, Route, X, Upload, FileSpreadsheet, AlertCircle, Trash2 } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'

type MainTab   = 'inquiry' | 'model-route' | 'bulk-inquiry'
type BulkTab   = 'card' | 'log_pass'
type SerialType = 'card' | 'motherserial' | 'batch'

const activeTab  = ref<MainTab>('inquiry')

// ── Serial Inquiry ─────────────────────────────────────────────────────────────
const serialType = ref<SerialType>('card')
const serial     = ref('')
const copiedMap  = ref<Record<number, boolean>>({})
const trimmed    = computed(() => serial.value.trim())

watch([serialType, trimmed], () => { copiedMap.value = {} })

const queries = computed(() => {
  const s = trimmed.value
  if (!s) return []
  if (serialType.value === 'card') {
    return [
      { label: 'card',       sql: `SELECT * FROM card WHERE serialno = '${s}'` },
      { label: 'log_pass',   sql: `SELECT * FROM log_pass WHERE cardno = '${s}_1' ORDER BY lastupdate` },
      { label: 'log_repair', sql: `SELECT * FROM log_repair WHERE cardno = '${s}_1' ORDER BY lastupdate` },
      { label: 'log_link',   sql: `SELECT * FROM log_link WHERE serialno = '${s}' or serialnoLink = '${s}'` },
    ]
  } else if (serialType.value === 'motherserial') {
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
})

const allCopied = computed(() => queries.value.length > 0 && queries.value.every((_, i) => copiedMap.value[i]))

function highlight(sql: string): string {
  return sql
    .replace(/\b(SELECT|FROM|WHERE|ORDER\s+BY|or)\b/g, '<span class="sql-keyword">$1</span>')
    .replace(/'([^']*)'/g, "<span class=\"sql-string\">'$1'</span>")
}

async function copy(index: number) {
  const q = queries.value[index]
  if (!q) return
  await navigator.clipboard.writeText(q.sql)
  copiedMap.value = { ...copiedMap.value, [index]: true }
  setTimeout(() => { copiedMap.value = { ...copiedMap.value, [index]: false } }, 1500)
}

async function copyAll() {
  if (!trimmed.value) return
  await navigator.clipboard.writeText(queries.value.map(q => q.sql).join('\n\n'))
  const map: Record<number, boolean> = {}
  queries.value.forEach((_, i) => { map[i] = true })
  copiedMap.value = map
  setTimeout(() => { copiedMap.value = {} }, 1500)
}

// ── Bulk Inquiry ──────────────────────────────────────────────────────────────
const bulkFile       = ref<File | null>(null)
const bulkSerials    = ref<string[]>([])
const bulkError      = ref('')
const bulkActiveTab  = ref<BulkTab>('card')
const copiedBulkCard = ref(false)
const copiedBulkLog  = ref(false)
const isDragging     = ref(false)

function formatIn(values: string[]): string {
  return values.map(v => `  '${v}'`).join(',\n')
}

const bulkCardQuery = computed(() => {
  if (!bulkSerials.value.length) return ''
  return `SELECT * FROM card\nWHERE serialno IN (\n${formatIn(bulkSerials.value)}\n)\nORDER BY lastupdate;`
})

const bulkLogPassQuery = computed(() => {
  if (!bulkSerials.value.length) return ''
  const suffixed = bulkSerials.value.map(s => `${s}_1`)
  return `SELECT * FROM log_pass\nWHERE cardno IN (\n${formatIn(suffixed)}\n)\nORDER BY cardno, lastupdate;`
})

async function handleBulkFile(file: File) {
  bulkError.value = ''
  bulkSerials.value = []
  bulkFile.value = file
  try {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    const serials = rows
      .map(r => String(r['Serial'] ?? '').trim())
      .filter(s => s.length > 0)
    if (!serials.length) {
      bulkError.value = 'No serials found. Make sure the column header is "Serial".'
      return
    }
    bulkSerials.value = serials
  } catch {
    bulkError.value = 'Failed to read the file. Make sure it is a valid Excel file.'
  }
}

function onBulkFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleBulkFile(file)
}

function onBulkDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleBulkFile(file)
}

function clearBulk() {
  bulkFile.value = null
  bulkSerials.value = []
  bulkError.value = ''
}

function highlightBulk(sql: string): string {
  return sql
    .replace(/\b(SELECT|FROM|WHERE|IN|ORDER\s+BY)\b/g, '<span class="sql-keyword">$1</span>')
    .replace(/'([^']*)'/g, "<span class=\"sql-string\">'$1'</span>")
}

async function copyBulkCard() {
  await navigator.clipboard.writeText(bulkCardQuery.value)
  copiedBulkCard.value = true
  setTimeout(() => (copiedBulkCard.value = false), 1500)
}

async function copyBulkLog() {
  await navigator.clipboard.writeText(bulkLogPassQuery.value)
  copiedBulkLog.value = true
  setTimeout(() => (copiedBulkLog.value = false), 1500)
}

// ── Model Route Checker ────────────────────────────────────────────────────────
const partno        = ref('')
const copiedRoute   = ref(false)
const trimmedPartno = computed(() => partno.value.trim())
const routeQuery    = computed(() =>
  trimmedPartno.value ? `EXEC checkModelRoute '${trimmedPartno.value}'` : ''
)
function highlightRoute(sql: string): string {
  return sql
    .replace(/\b(EXEC)\b/g, '<span class="sql-keyword">$1</span>')
    .replace(/\bcheckModelRoute\b/g, '<span class="sql-proc">checkModelRoute</span>')
    .replace(/'([^']*)'/g, "<span class=\"sql-string\">'$1'</span>")
}
async function copyRoute() {
  if (!routeQuery.value) return
  await navigator.clipboard.writeText(routeQuery.value)
  copiedRoute.value = true
  setTimeout(() => (copiedRoute.value = false), 1500)
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">

    <!-- Top-level tabs -->
    <div class="flex border-b border-border mb-6">
      <button
        class="px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
        :class="activeTab === 'inquiry'
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="activeTab = 'inquiry'"
      >
        Serial Inquiry
      </button>
      <button
        class="px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
        :class="activeTab === 'model-route'
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="activeTab = 'model-route'"
      >
        Model Route Checker
      </button>
      <button
        class="px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px"
        :class="activeTab === 'bulk-inquiry'
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="activeTab = 'bulk-inquiry'"
      >
        Bulk Inquiry
      </button>
    </div>

    <!-- ── Serial Inquiry tab ── -->
    <div v-if="activeTab === 'inquiry'">
      <p class="text-sm text-muted-foreground mb-5">Select a serial type, enter the value, and get the lookup queries.</p>

      <!-- Serial type selector -->
      <div class="flex gap-1 mb-5 p-1 rounded-lg bg-muted/30 border border-border w-fit">
        <button
          v-for="type in (['card', 'motherserial', 'batch'] as SerialType[])"
          :key="type"
          class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize"
          :class="serialType === type
            ? 'bg-secondary text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'"
          @click="serialType = type"
        >
          {{ type }}
        </button>
      </div>

      <!-- Input -->
      <div class="flex gap-2 mb-6 max-w-xl">
        <div class="relative flex-1">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            v-model="serial"
            type="text"
            :placeholder="`Enter ${serialType === 'batch' ? 'batch no' : serialType === 'motherserial' ? 'mother serial' : 'serial number'}…`"
            class="w-full pl-9 pr-8 py-2 rounded-md border border-border bg-muted/20 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button v-if="serial" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" @click="serial = ''">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
        <Button v-if="trimmed" size="sm" variant="outline" class="shrink-0" @click="copyAll">
          <component :is="allCopied ? Check : Copy" class="w-3.5 h-3.5 mr-1.5" />
          Copy All
        </Button>
      </div>

      <!-- Queries -->
      <div v-if="trimmed" class="space-y-4">
        <div v-for="(q, i) in queries" :key="q.label" class="rounded-md border border-border overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
            <span class="text-xs font-medium text-muted-foreground">{{ q.label }}</span>
            <Button size="sm" variant="ghost" class="h-7 px-2 text-xs gap-1.5" @click="copy(i)">
              <component :is="copiedMap[i] ? Check : Copy" class="w-3.5 h-3.5" />
              {{ copiedMap[i] ? 'Copied' : 'Copy' }}
            </Button>
          </div>
          <pre class="px-4 py-3 text-sm font-mono leading-relaxed whitespace-pre-wrap break-all"><code v-html="highlight(q.sql)" /></pre>
        </div>
      </div>
      <div v-else class="flex flex-col items-center justify-center py-24 text-muted-foreground/40 gap-2">
        <Search class="w-10 h-10" />
        <p class="text-sm">Enter a value to see queries</p>
      </div>
    </div>

    <!-- ── Model Route Checker tab ── -->
    <div v-else-if="activeTab === 'model-route'">
      <p class="text-sm text-muted-foreground mb-5">Enter a part number / model number to generate a route check query.</p>

      <!-- Input -->
      <div class="flex gap-2 mb-6 max-w-xl">
        <div class="relative flex-1">
          <Route class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            v-model="partno"
            type="text"
            placeholder="Enter part no / model no…"
            class="w-full pl-9 pr-8 py-2 rounded-md border border-border bg-muted/20 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button v-if="partno" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" @click="partno = ''">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div v-if="trimmedPartno" class="rounded-md border border-border overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
          <span class="text-xs font-medium text-muted-foreground">checkModelRoute</span>
          <Button size="sm" variant="ghost" class="h-7 px-2 text-xs gap-1.5" @click="copyRoute">
            <component :is="copiedRoute ? Check : Copy" class="w-3.5 h-3.5" />
            {{ copiedRoute ? 'Copied' : 'Copy' }}
          </Button>
        </div>
        <pre class="px-4 py-3 text-sm font-mono leading-relaxed whitespace-pre-wrap break-all"><code v-html="highlightRoute(routeQuery)" /></pre>
      </div>
      <div v-else class="flex flex-col items-center justify-center py-24 text-muted-foreground/40 gap-2">
        <Route class="w-10 h-10" />
        <p class="text-sm">Enter a part no to see the query</p>
      </div>
    </div>

    <!-- ── Bulk Inquiry tab ── -->
    <div v-else-if="activeTab === 'bulk-inquiry'">
      <p class="text-sm text-muted-foreground mb-5">
        Upload an Excel file with a <code class="font-mono text-xs bg-muted/40 px-1 py-0.5 rounded">Serial</code> column to generate bulk lookup queries.
      </p>

      <!-- Drop zone -->
      <div
        v-if="!bulkFile"
        class="mb-6 max-w-xl border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors"
        :class="isDragging ? 'border-foreground bg-muted/20' : 'border-border hover:border-muted-foreground/50 hover:bg-muted/10'"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onBulkDrop"
        @click="($refs.bulkFileInput as HTMLInputElement).click()"
      >
        <Upload class="w-8 h-8 text-muted-foreground/50" />
        <div class="text-center">
          <p class="text-sm font-medium text-foreground">Drop your Excel file here</p>
          <p class="text-xs text-muted-foreground mt-1">or click to browse — .xlsx / .xls</p>
        </div>
        <input ref="bulkFileInput" type="file" accept=".xlsx,.xls" class="hidden" @change="onBulkFileInput" />
      </div>

      <!-- File loaded state -->
      <div v-else class="mb-6 max-w-xl flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-muted/10">
        <FileSpreadsheet class="w-5 h-5 text-muted-foreground shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ bulkFile.name }}</p>
          <p v-if="bulkSerials.length" class="text-xs text-muted-foreground mt-0.5">{{ bulkSerials.length }} serial{{ bulkSerials.length !== 1 ? 's' : '' }} loaded</p>
        </div>
        <Button size="sm" variant="ghost" class="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0" @click="clearBulk">
          <Trash2 class="w-3.5 h-3.5" />
        </Button>
      </div>

      <!-- Error -->
      <div v-if="bulkError" class="mb-5 max-w-xl flex items-start gap-2.5 px-4 py-3 rounded-lg border border-destructive/40 bg-destructive/5 text-destructive text-sm">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
        <span>{{ bulkError }}</span>
      </div>

      <!-- Query results -->
      <div v-if="bulkSerials.length">
        <!-- Sub-tabs: Card / Log Pass -->
        <div class="flex gap-1 mb-4 p-1 rounded-lg bg-muted/30 border border-border w-fit">
          <button
            v-for="tab in ([{ id: 'card', label: 'Card' }, { id: 'log_pass', label: 'Log Pass' }] as { id: BulkTab; label: string }[])"
            :key="tab.id"
            class="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
            :class="bulkActiveTab === tab.id
              ? 'bg-secondary text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'"
            @click="bulkActiveTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Card query -->
        <div v-if="bulkActiveTab === 'card'" class="rounded-md border border-border overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
            <span class="text-xs font-medium text-muted-foreground">card</span>
            <Button size="sm" variant="ghost" class="h-7 px-2 text-xs gap-1.5" @click="copyBulkCard">
              <component :is="copiedBulkCard ? Check : Copy" class="w-3.5 h-3.5" />
              {{ copiedBulkCard ? 'Copied' : 'Copy' }}
            </Button>
          </div>
          <pre class="px-4 py-3 text-sm font-mono leading-relaxed whitespace-pre-wrap break-all"><code v-html="highlightBulk(bulkCardQuery)" /></pre>
        </div>

        <!-- Log Pass query -->
        <div v-if="bulkActiveTab === 'log_pass'" class="rounded-md border border-border overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
            <span class="text-xs font-medium text-muted-foreground">log_pass</span>
            <Button size="sm" variant="ghost" class="h-7 px-2 text-xs gap-1.5" @click="copyBulkLog">
              <component :is="copiedBulkLog ? Check : Copy" class="w-3.5 h-3.5" />
              {{ copiedBulkLog ? 'Copied' : 'Copy' }}
            </Button>
          </div>
          <pre class="px-4 py-3 text-sm font-mono leading-relaxed whitespace-pre-wrap break-all"><code v-html="highlightBulk(bulkLogPassQuery)" /></pre>
        </div>
      </div>

      <div v-else-if="!bulkFile" class="flex flex-col items-center justify-center py-16 text-muted-foreground/40 gap-2">
        <FileSpreadsheet class="w-10 h-10" />
        <p class="text-sm">Upload an Excel file to generate queries</p>
      </div>
    </div>

  </div>
</template>

