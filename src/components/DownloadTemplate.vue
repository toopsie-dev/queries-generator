<script setup lang="ts">
import { ref } from 'vue'
import { Download, FileSpreadsheet, Check } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import CardDescription from '@/components/ui/CardDescription.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Button from '@/components/ui/Button.vue'

const TEMPLATE_URL = '/Query Generator.xlsx'
const TEMPLATE_FILENAME = 'Query Generator.xlsx'

const sheets = [
  { name: 'Inquiry', description: 'Serial lookup queries' },
  { name: 'Bulk Rejection', description: 'Bulk rejection execution' },
  { name: 'Manual Registration', description: 'Card & log_pass insertion' },
  { name: 'Reroute', description: 'Station rerouting updates' },
  { name: 'Conversion', description: 'Part number / workorder updates' },
  { name: 'Transfer History', description: 'Serial transfer execution' },
]

const downloading = ref(false)
const downloaded = ref(false)

async function handleDownload() {
  downloading.value = true
  try {
    const response = await fetch(TEMPLATE_URL)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = TEMPLATE_FILENAME
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    downloaded.value = true
    setTimeout(() => { downloaded.value = false }, 2000)
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
    <Card>
      <CardHeader>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileSpreadsheet class="w-5 h-5 text-primary" />
          </div>
          <div class="space-y-1">
            <CardTitle class="text-lg">Excel Template</CardTitle>
            <CardDescription>Download the template file with all required sheets for each support type</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="rounded-md border border-border divide-y divide-border">
          <div
            v-for="sheet in sheets"
            :key="sheet.name"
            class="flex items-center gap-3 px-4 py-2.5"
          >
            <FileSpreadsheet class="w-4 h-4 text-muted-foreground shrink-0" />
            <span class="text-sm font-medium flex-1">{{ sheet.name }}</span>
            <span class="text-xs text-muted-foreground">{{ sheet.description }}</span>
          </div>
        </div>

        <Button class="w-full gap-2" :disabled="downloading" @click="handleDownload">
          <Check v-if="downloaded" class="w-4 h-4" />
          <Download v-else class="w-4 h-4" />
          {{ downloaded ? 'Downloaded!' : 'Download Template' }}
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
