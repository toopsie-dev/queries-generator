<script setup lang="ts">
import { ref, computed } from 'vue'
import { Database, Search, XCircle, ClipboardList, GitBranch, Repeat2, ArrowLeftRight } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import BulkRejection from '@/components/BulkRejection.vue'
import ManualRegistration from '@/components/ManualRegistration.vue'
import Reroute from '@/components/Reroute.vue'
import Conversion from '@/components/Conversion.vue'
import TransferHistory from '@/components/TransferHistory.vue'
import ComingSoon from '@/components/ComingSoon.vue'
import Inquiry from '@/components/Inquiry.vue'

const navItems = [
  { id: 'inquiry',             label: 'Inquiry',              icon: Search,          ready: true  },
  { id: 'bulk-rejection',      label: 'Bulk Rejection',       icon: XCircle,         ready: true  },
  { id: 'manual-registration', label: 'Manual Registration',  icon: ClipboardList,   ready: true  },
  { id: 'reroute',             label: 'Reroute',              icon: GitBranch,       ready: true  },
  { id: 'conversion',          label: 'Conversion',           icon: Repeat2,         ready: true  },
  { id: 'transfer-history',    label: 'Transfer History',     icon: ArrowLeftRight,  ready: true  },
]

const activeId = ref('inquiry')
const activeItem = computed(() => navItems.find(n => n.id === activeId.value))
</script>

<template>
  <div class="bg-background text-foreground">
    <!-- Top bar -->
    <header class="fixed top-0 left-0 right-0 z-20 border-b border-border bg-background">
      <div class="flex items-center gap-3 px-6 py-3">
        <Database class="w-5 h-5 text-muted-foreground" />
        <span class="font-semibold text-sm tracking-tight">Query Generator</span>
      </div>
    </header>

    <!-- Sidebar -->
    <aside class="fixed top-[49px] left-0 w-56 h-[calc(100vh-49px)] border-r border-border bg-background z-10 flex flex-col overflow-y-auto">
      <div class="px-3 py-4 flex-1">
        <p class="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3 px-2">
          Support Type
        </p>
        <nav class="space-y-0.5">
          <button
            v-for="item in navItems"
            :key="item.id"
            class="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left"
            :class="
              activeId === item.id
                ? 'bg-secondary text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            "
            @click="activeId = item.id"
          >
            <component :is="item.icon" class="w-4 h-4 shrink-0" />
            <span class="flex-1 truncate">{{ item.label }}</span>
            <Badge
              v-if="!item.ready"
              variant="outline"
              class="text-[10px] px-1.5 py-0 leading-4 text-muted-foreground/60 border-muted-foreground/20"
            >
              Soon
            </Badge>
          </button>
        </nav>
      </div>
    </aside>

    <!-- Content -->
    <main class="ml-56 mt-[49px] min-h-[calc(100vh-49px)] overflow-auto">
      <Inquiry v-if="activeId === 'inquiry'" />
      <BulkRejection v-else-if="activeId === 'bulk-rejection'" />
      <ManualRegistration v-else-if="activeId === 'manual-registration'" />
      <Reroute v-else-if="activeId === 'reroute'" />
      <Conversion v-else-if="activeId === 'conversion'" />
      <TransferHistory v-else-if="activeId === 'transfer-history'" />
      <ComingSoon v-else :label="activeItem?.label ?? ''" />
    </main>
  </div>
</template>

