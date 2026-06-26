<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
  >
    <div class="w-full max-w-xl rounded-3xl border border-indigo-100 bg-white p-6 shadow-2xl sm:p-8">
      <div class="mb-6 flex items-center gap-3">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600">
          <i class="pi pi-sparkles text-lg text-white"></i>
        </div>
        <div>
          <p class="text-xs font-semibold uppercase tracking-wider text-indigo-500">Morning Briefing</p>
          <h2 class="text-xl font-bold text-gray-900">Your daily stand-up</h2>
        </div>
      </div>

      <div class="space-y-4 text-sm text-gray-700">
        <p class="rounded-2xl bg-indigo-50/80 px-4 py-3 font-medium text-indigo-900">{{ briefing.greeting }}</p>
        <section>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">Overnight email summary</h3>
          <p>{{ briefing.emailSummary }}</p>
        </section>
        <section>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">Today's schedule</h3>
          <p>{{ briefing.scheduleOverview }}</p>
        </section>
        <section>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">Recommended focus</h3>
          <p>{{ briefing.recommendedFocus }}</p>
        </section>
      </div>

      <div class="mt-7 flex justify-end">
        <button
          type="button"
          class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          @click="$emit('close')"
        >
          Let's go!
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface MorningBriefing {
  greeting: string
  emailSummary: string
  scheduleOverview: string
  recommendedFocus: string
}

defineProps<{
  visible: boolean
  briefing: MorningBriefing
}>()

defineEmits<{
  close: []
}>()
</script>
