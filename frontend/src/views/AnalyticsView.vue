<template>
  <main class="flex-1 flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Analytics</h2>
        <p class="text-sm text-gray-500">Time audit for the last 7 days</p>
      </div>
      <button
        @click="loadStats"
        :disabled="isLoading"
        class="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <i class="pi pi-spin pi-spinner" v-if="isLoading"></i>
        <i class="pi pi-chart-bar" v-else></i>
        {{ isLoading ? 'Analyzing...' : 'Refresh Analysis' }}
      </button>
    </header>

    <!-- Content area -->
    <div class="flex-1 overflow-auto p-8">
      <!-- Empty state -->
      <div v-if="!generated && !isLoading" class="text-center py-16">
        <div class="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <i class="pi pi-chart-bar text-indigo-400 text-4xl"></i>
        </div>
        <h3 class="text-xl font-semibold text-gray-700 mb-2">Ready to audit your time?</h3>
        <p class="text-gray-500 max-w-md mx-auto mb-6">
          Get an AI-powered breakdown of how you've spent your time over the last 7 days and actionable recommendations.
        </p>
        <button
          @click="loadStats"
          class="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
        >
          <i class="pi pi-sparkles"></i>
          Generate Time Audit
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-16 gap-4">
        <i class="pi pi-spin pi-spinner text-indigo-400 text-4xl"></i>
        <p class="text-gray-500">Analyzing your time data…</p>
      </div>

      <!-- Error state -->
      <div v-if="error" class="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
        <i class="pi pi-exclamation-circle mr-2"></i>
        {{ error }}
      </div>

      <!-- Results -->
      <div v-if="generated && !isLoading" class="space-y-6">
        <!-- Period info -->
        <div class="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
          <i class="pi pi-calendar text-indigo-500"></i>
          <span class="text-sm text-gray-600">
            Period: <strong>{{ periodLabel }}</strong> · Total tracked:
            <strong>{{ formatDuration(totalDuration) }}</strong>
          </span>
        </div>

        <!-- No data state -->
        <div v-if="taskStats.length === 0" class="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <i class="pi pi-clock text-gray-300 text-5xl mb-4 block"></i>
          <p class="text-gray-500">No time entries found for the last 7 days. Start tracking tasks to see your analytics.</p>
        </div>

        <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <!-- Doughnut chart -->
          <div class="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <i class="pi pi-chart-pie text-indigo-500"></i>
              Time Distribution
            </h3>
            <div class="flex justify-center">
              <div class="w-64 h-64">
                <Doughnut :data="doughnutData" :options="doughnutOptions" />
              </div>
            </div>
          </div>

          <!-- Bar chart -->
          <div class="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <i class="pi pi-chart-bar text-indigo-500"></i>
              Time per Task (hours)
            </h3>
            <Bar :data="barData" :options="barOptions" />
          </div>
        </div>

        <!-- Task breakdown table -->
        <div v-if="taskStats.length > 0" class="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <i class="pi pi-list text-indigo-500"></i>
            Task Breakdown
          </h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100">
                  <th class="text-left py-2 pr-4 text-gray-500 font-medium">Task</th>
                  <th class="text-left py-2 pr-4 text-gray-500 font-medium">Status</th>
                  <th class="text-right py-2 pr-4 text-gray-500 font-medium">Duration</th>
                  <th class="text-right py-2 text-gray-500 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="stat in taskStats"
                  :key="stat.taskId"
                  class="border-b border-gray-50 last:border-0"
                >
                  <td class="py-3 pr-4 font-medium text-gray-900">{{ stat.taskTitle }}</td>
                  <td class="py-3 pr-4">
                    <span
                      class="text-xs font-medium px-2 py-0.5 rounded-full"
                      :class="statusBadgeClass(stat.taskStatus)"
                    >{{ stat.taskStatus }}</span>
                  </td>
                  <td class="py-3 pr-4 text-right text-gray-700 tabular-nums">{{ formatDuration(stat.totalDuration) }}</td>
                  <td class="py-3 text-right text-gray-700 tabular-nums">
                    {{ totalDuration > 0 ? Math.round((stat.totalDuration / totalDuration) * 100) : 0 }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- AI Coach section -->
        <div class="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <i class="pi pi-sparkles text-white text-sm"></i>
            </div>
            AI Coach
          </h3>

          <div class="bg-white rounded-xl border border-indigo-100 p-4 mb-4">
            <p class="text-gray-700 leading-relaxed whitespace-pre-line">{{ audit.analysis }}</p>
          </div>

          <div v-if="audit.recommendations.length > 0">
            <h4 class="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
              Recommendations for next week
            </h4>
            <ul class="space-y-2">
              <li
                v-for="(rec, index) in audit.recommendations"
                :key="index"
                class="flex items-start gap-3 bg-white rounded-xl border border-indigo-100 p-3"
              >
                <div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {{ index + 1 }}
                </div>
                <p class="text-gray-700 text-sm leading-relaxed">{{ rec }}</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import { Bar, Doughnut } from 'vue-chartjs'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type TooltipItem,
} from 'chart.js'
import { useAuthStore } from '../stores/auth'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

interface TaskStat {
  taskId: string
  taskTitle: string
  taskStatus: string
  totalDuration: number
}

interface TimeAudit {
  analysis: string
  recommendations: string[]
}

const authStore = useAuthStore()

const isLoading = ref(false)
const error = ref<string | null>(null)
const generated = ref(false)
const totalDuration = ref(0)
const taskStats = ref<TaskStat[]>([])
const periodStart = ref('')
const periodEnd = ref('')
const audit = ref<TimeAudit>({ analysis: '', recommendations: [] })

const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe',
  '#4f46e5', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95',
]

const periodLabel = computed(() => {
  if (!periodStart.value || !periodEnd.value) return ''
  const start = new Date(periodStart.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const end = new Date(periodEnd.value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${start} – ${end}`
})

const doughnutData = computed(() => ({
  labels: taskStats.value.map((s) => truncateLabel(s.taskTitle)),
  datasets: [
    {
      data: taskStats.value.map((s) => parseFloat((s.totalDuration / 3600).toFixed(2))),
      backgroundColor: CHART_COLORS.slice(0, taskStats.value.length),
      borderWidth: 2,
      borderColor: '#fff',
    },
  ],
}))

const doughnutOptions = {
  responsive: true,
  plugins: {
    legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 11 } } },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'doughnut'>) =>
          ` ${ctx.label}: ${(ctx.raw as number).toFixed(1)}h`,
      },
    },
  },
}

const barData = computed(() => ({
  labels: taskStats.value.map((s) => truncateLabel(s.taskTitle)),
  datasets: [
    {
      label: 'Hours',
      data: taskStats.value.map((s) => parseFloat((s.totalDuration / 3600).toFixed(2))),
      backgroundColor: CHART_COLORS.slice(0, taskStats.value.length),
      borderRadius: 6,
    },
  ],
}))

const barOptions = {
  responsive: true,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => ` ${(ctx.raw as number).toFixed(1)}h`,
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { callback: (v: number | string) => `${typeof v === 'number' ? v : Number(v)}h` },
      grid: { color: '#f3f4f6' },
    },
    x: {
      grid: { display: false },
    },
  },
}

function truncateLabel(label: string, max = 20): string {
  return label.length > max ? label.slice(0, max) + '…' : label
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'DONE':
      return 'bg-green-100 text-green-700'
    case 'IN_PROGRESS':
      return 'bg-blue-100 text-blue-700'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

async function loadStats() {
  isLoading.value = true
  error.value = null
  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/analytics/weekly-stats`, {
      headers: { Authorization: 'Bearer ' + authStore.token },
    })
    totalDuration.value = data.totalDuration ?? 0
    taskStats.value = data.taskStats ?? []
    periodStart.value = data.periodStart ?? ''
    periodEnd.value = data.periodEnd ?? ''
    audit.value = data.audit ?? { analysis: '', recommendations: [] }
    generated.value = true
  } catch (caughtError: unknown) {
    if (axios.isAxiosError(caughtError)) {
      error.value = caughtError.response?.data?.message || 'Failed to load analytics'
    } else {
      error.value = 'Failed to load analytics'
    }
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadStats()
})
</script>
