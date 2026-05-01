<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Copy, Check, Search, Route, X } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'

type MainTab   = 'inquiry' | 'model-route'
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
    <div v-else>
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

  </div>
</template>

