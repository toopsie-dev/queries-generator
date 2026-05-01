<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center h-full py-36 text-muted-foreground gap-3">
    <div class="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center text-2xl opacity-40">
      🚧
    </div>
    <p class="font-medium text-foreground/60">{{ label }}</p>
    <p class="text-sm opacity-50">Coming soon</p>
  </div>
</template>
