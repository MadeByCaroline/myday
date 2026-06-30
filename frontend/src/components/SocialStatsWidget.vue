<template>
  <section class="bg-white rounded-2xl border border-gray-200 p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-base font-semibold text-gray-900">Social performance</h3>
      <span class="text-xs text-gray-500">Last sync metrics</span>
    </div>

    <p v-if="stats.length === 0" class="text-sm text-gray-500">No social analytics available yet.</p>

    <ul v-else class="space-y-3">
      <li
        v-for="stat in stats"
        :key="stat.provider"
        class="rounded-xl border border-gray-100 p-3"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-gray-900">{{ providerLabel(stat.provider) }}</p>
          <span
            v-if="stat.changeVsLastWeek !== null"
            class="text-xs font-medium"
            :class="trendClass(stat.changeVsLastWeek)"
          >
            {{ trendLabel(stat.changeVsLastWeek) }} vs last week
          </span>
        </div>
        <div class="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p class="text-gray-500">Views</p>
            <p class="font-semibold text-gray-900">{{ formatNumber(stat.totalViews) }}</p>
          </div>
          <div>
            <p class="text-gray-500">Followers</p>
            <p class="font-semibold text-gray-900">{{ formatNumber(stat.followerCount) }}</p>
          </div>
          <div>
            <p class="text-gray-500">Engagement</p>
            <p class="font-semibold text-gray-900">{{ (stat.engagementRate * 100).toFixed(2) }}%</p>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
export interface SocialWidgetItem {
  provider: string
  totalViews: number
  followerCount: number
  engagementRate: number
  changeVsLastWeek: number | null
}

const props = defineProps<{
  stats: SocialWidgetItem[]
}>()

function providerLabel(provider: string) {
  if (provider === 'INSTAGRAM') return 'Instagram'
  if (provider === 'FACEBOOK') return 'Facebook'
  if (provider === 'TIKTOK') return 'TikTok'
  return provider
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function trendLabel(value: number) {
  if (value > 0) return `▲ ${value.toFixed(2)}%`
  if (value < 0) return `▼ ${Math.abs(value).toFixed(2)}%`
  return '→ 0.00%'
}

function trendClass(value: number) {
  if (value > 0) return 'text-emerald-700'
  if (value < 0) return 'text-red-700'
  return 'text-gray-600'
}

void props
</script>
