<template>
  <div class="min-h-screen bg-gray-50 flex">
    <aside class="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div class="p-6 border-b border-gray-200">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <i class="pi pi-calendar text-white"></i>
          </div>
          <span class="text-xl font-bold text-gray-900">MyDay</span>
        </div>
      </div>

      <nav class="p-4 flex-1">
        <RouterLink to="/dashboard" :class="navLinkClass">
          <i class="pi pi-home"></i>
          <span>Dashboard</span>
        </RouterLink>
        <RouterLink to="/tasks" :class="navLinkClass">
          <i class="pi pi-check-square"></i>
          <span>Tasks</span>
        </RouterLink>
        <RouterLink to="/calendar" :class="navLinkClass">
          <i class="pi pi-calendar"></i>
          <span>Calendar</span>
        </RouterLink>
        <RouterLink to="/integrations" :class="navLinkClass">
          <i class="pi pi-plug"></i>
          <span>Integrations</span>
        </RouterLink>
      </nav>

      <div class="p-4 border-t border-gray-200">
        <div class="flex items-center gap-3">
          <img
            v-if="authStore.user?.picture"
            :src="authStore.user.picture"
            :alt="authStore.user.name ?? ''"
            class="w-8 h-8 rounded-full"
          />
          <div v-else class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <i class="pi pi-user text-indigo-600 text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">{{ authStore.user?.name || authStore.user?.email }}</p>
            <p class="text-xs text-gray-500 truncate">{{ authStore.user?.email }}</p>
          </div>
          <button @click="handleLogout" class="text-gray-400 hover:text-gray-600">
            <i class="pi pi-sign-out text-sm"></i>
          </button>
        </div>
      </div>
    </aside>

    <main class="flex-1 min-w-0 overflow-hidden">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const navLinkClass =
  'flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 mb-1 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-700 aria-[current=page]:font-medium'

const authStore = useAuthStore()
const router = useRouter()

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>
