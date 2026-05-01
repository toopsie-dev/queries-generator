<script setup lang="ts">
import { ref, computed } from 'vue'
import { Copy, Check, Route } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'

const partno = ref('')
const copied = ref(false)

const trimmed = computed(() => partno.value.trim())

const query = computed(() =>
  trimmed.value ? `EXEC checkModelRoute '${trimmed.value}'` : ''
)

function highlight(sql: string): string {
  return sql
    .replace(/\b(EXEC)\b/gi, '<span class="sql-keyword">$1</span>')
    .replace(/\bcheckModelRoute\b/g, '<span class="sql-proc">checkModelRoute</span>')
    .replace(/'([^']*)'/g, "<span class=\"sql-string\">'$1'</span>")
}

async function copy() {
  if (!query.value) return
  await navigator.clipboard.writeText(query.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <h2 class="text-base font-semibold mb-1">Model Route Checker</h2>
    <p class="text-sm text-muted-foreground mb-6">Enter a part number / model number to generate a route check query.</p>

    <!-- Input -->
    <div class="flex gap-2 mb-6">
      <div class="relative flex-1">
        <Route class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          v-model="partno"
          type="text"
          placeholder="Enter part no / model no…"
          class="w-full pl-9 pr-4 py-2 rounded-md border border-border bg-muted/20 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>

    <!-- Query -->
    <div v-if="trimmed" class="rounded-md border border-border overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
        <span class="text-xs font-medium text-muted-foreground">checkModelRoute</span>
        <Button size="sm" variant="ghost" class="h-7 px-2 text-xs gap-1.5" @click="copy">
          <component :is="copied ? Check : Copy" class="w-3.5 h-3.5" />
          {{ copied ? 'Copied' : 'Copy' }}
        </Button>
      </div>
      <pre class="px-4 py-3 text-sm font-mono leading-relaxed overflow-x-auto"><code v-html="highlight(query)" /></pre>
    </div>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center justify-center py-24 text-muted-foreground/40 gap-2">
      <Route class="w-10 h-10" />
      <p class="text-sm">Enter a part no to see the query</p>
    </div>
  </div>
</template>
