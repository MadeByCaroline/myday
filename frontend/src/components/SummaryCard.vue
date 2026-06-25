<template>
  <div class="bg-white rounded-2xl border border-gray-200 p-6">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
        <i class="pi pi-sparkles text-indigo-600"></i>
      </div>
      <h3 class="text-lg font-semibold text-gray-900">AI Summary</h3>
    </div>
    <div class="space-y-3">
      <p
        v-for="(paragraph, i) in paragraphs"
        :key="i"
        class="text-gray-600 leading-relaxed text-sm"
      >
        {{ paragraph }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ summary: string }>()

const paragraphs = computed(() =>
  props.summary
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0),
)
</script>
