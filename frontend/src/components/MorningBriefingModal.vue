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
          <p class="text-xs font-semibold uppercase tracking-wider text-indigo-500">Briefing matinal</p>
          <h2 class="text-xl font-bold text-gray-900">Votre point quotidien</h2>
        </div>
      </div>

      <div v-if="isFallback" class="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <i class="pi pi-exclamation-triangle mt-0.5 flex-shrink-0"></i>
        <span>Les serveurs IA sont très sollicités. Voici une vue simplifiée de vos données.</span>
      </div>

      <div class="space-y-4 text-sm text-gray-700">
        <p class="rounded-2xl bg-indigo-50/80 px-4 py-3 font-medium text-indigo-900">{{ briefing.greeting }}</p>
        <section>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">Résumé des e-mails récents</h3>
          <p>{{ briefing.emailSummary }}</p>
        </section>
        <section>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">Planning du jour</h3>
          <p>{{ briefing.scheduleOverview }}</p>
        </section>
        <section>
          <h3 class="mb-1 text-sm font-semibold text-gray-900">Priorité recommandée</h3>
          <p>{{ briefing.recommendedFocus }}</p>
        </section>
      </div>

      <div class="mt-7 flex justify-end">
        <button
          type="button"
          class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          @click="$emit('close')"
        >
          C'est parti !
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
  isFallback?: boolean
}>()

defineEmits<{
  close: []
}>()
</script>
