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

    <main class="flex-1 flex flex-col overflow-hidden">
      <header class="bg-white border-b border-gray-200 px-8 py-4">
        <h2 class="text-2xl font-bold text-gray-900">Integrations</h2>
        <p class="text-sm text-gray-500 mt-1">Manage your connected applications</p>
      </header>

      <section v-if="noticeMessage" class="bg-indigo-50 border-b border-indigo-200 px-8 py-3 text-sm text-indigo-700">
        <i class="pi pi-info-circle mr-2"></i>
        {{ noticeMessage }}
      </section>

      <section v-if="errorMessage" class="bg-red-50 border-b border-red-200 px-8 py-3 text-sm text-red-700">
        <i class="pi pi-exclamation-circle mr-2"></i>
        {{ errorMessage }}
      </section>

      <div class="flex-1 overflow-auto p-8">
        <div v-if="loading" class="bg-white border border-gray-200 rounded-2xl p-8 text-gray-500">
          Loading your integrations...
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <article
            v-for="app in apps"
            :key="app.provider"
            class="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i :class="app.icon"></i>
                <h3 class="text-base font-semibold text-gray-900">{{ app.label }}</h3>
              </div>
              <span v-if="isConnected(app.provider)" class="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Connected
              </span>
              <span v-else class="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                Not connected
              </span>
            </div>

            <p v-if="isConnected(app.provider)" class="text-sm text-gray-600">
              Connected as {{ connectedEmails(app.provider).join(', ') }}
            </p>
            <p v-else class="text-sm text-gray-500">
              {{ app.description }}
            </p>

            <div class="mt-auto">
              <button
                v-if="app.canConnect && !isConnected(app.provider)"
                type="button"
                class="w-full text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                @click="connect(app.provider)"
              >
                Connect
              </button>
              <button
                v-else-if="app.canConnect && isConnected(app.provider)"
                type="button"
                class="w-full text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                @click="disconnect(app.provider)"
              >
                Disconnect
              </button>
              <button
                v-else
                type="button"
                disabled
                class="w-full text-sm bg-gray-100 text-gray-500 px-4 py-2 rounded-lg font-medium cursor-not-allowed"
              >
                Coming soon
              </button>
            </div>
          </article>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

type AppProvider = 'GOOGLE' | 'MICROSOFT' | 'GITHUB' | 'NOTION'

interface Connection {
  provider: string
  email: string
}

const navLinkClass =
  'flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 mb-1 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-700 aria-[current=page]:font-medium'

const apps: Array<{ provider: AppProvider; label: string; icon: string; description: string; canConnect: boolean }> = [
  {
    provider: 'GOOGLE',
    label: 'Google',
    icon: 'pi pi-google text-red-500',
    description: 'Connect Gmail and Google Calendar.',
    canConnect: true,
  },
  {
    provider: 'MICROSOFT',
    label: 'Microsoft',
    icon: 'pi pi-microsoft text-blue-600',
    description: 'Connect Outlook and Microsoft Calendar.',
    canConnect: true,
  },
  {
    provider: 'GITHUB',
    label: 'GitHub',
    icon: 'pi pi-github text-gray-700',
    description: 'GitHub integration is coming soon.',
    canConnect: false,
  },
  {
    provider: 'NOTION',
    label: 'Notion',
    icon: 'pi pi-book text-gray-700',
    description: 'Notion integration is coming soon.',
    canConnect: false,
  },
]

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const connections = ref<Connection[]>([])
const errorMessage = ref<string | null>(null)
const noticeMessage = ref<string | null>(null)

const normalizedConnections = computed(() =>
  connections.value.map((connection) => ({
    provider: connection.provider.toUpperCase(),
    email: connection.email,
  })),
)

function connectedEmails(provider: AppProvider) {
  return normalizedConnections.value
    .filter((connection) => connection.provider === provider)
    .map((connection) => connection.email)
}

function isConnected(provider: AppProvider) {
  return connectedEmails(provider).length > 0
}

async function fetchConnections() {
  if (!authStore.token) return
  loading.value = true
  errorMessage.value = null

  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/auth/connections`, {
      headers: {
        Authorization: 'Bearer ' + authStore.token,
      },
    })
    connections.value = Array.isArray(data) ? data : []
  } catch {
    errorMessage.value = 'Failed to load integrations.'
  } finally {
    loading.value = false
  }
}

async function connect(provider: AppProvider) {
  if (!authStore.token || (provider !== 'GOOGLE' && provider !== 'MICROSOFT')) return

  errorMessage.value = null
  noticeMessage.value = null

  const authPath = provider === 'GOOGLE' ? 'google' : 'microsoft'

  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/auth/${authPath}/link`, {
      headers: {
        Authorization: 'Bearer ' + authStore.token,
      },
    })
    window.location.href = data.url
  } catch {
    errorMessage.value = `Could not start ${provider === 'GOOGLE' ? 'Google' : 'Microsoft'} connection.`
  }
}

async function disconnect(provider: AppProvider) {
  if (!authStore.token || (provider !== 'GOOGLE' && provider !== 'MICROSOFT')) return

  errorMessage.value = null
  noticeMessage.value = null

  try {
    await axios.delete(`${import.meta.env.VITE_API_URL}/auth/connections/${provider}`, {
      headers: {
        Authorization: 'Bearer ' + authStore.token,
      },
    })
    await fetchConnections()
  } catch {
    errorMessage.value = 'Could not disconnect this integration.'
  }
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const hasLinkError = params.get('linkError') === '1'
  const refreshProfile = params.get('refreshProfile') === '1'

  if (hasLinkError) {
    errorMessage.value = 'Account linking failed. Please verify account permissions and try again.'
  }

  if (refreshProfile && authStore.token) {
    try {
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/auth/profile`, {
        headers: {
          Authorization: 'Bearer ' + authStore.token,
        },
      })
      authStore.setUser(data)
      noticeMessage.value = 'Integration connected successfully.'
      window.history.replaceState({}, '', '/integrations')
    } catch {
      authStore.logout()
      router.push('/login')
      return
    }
  }

  await fetchConnections()
})
</script>
