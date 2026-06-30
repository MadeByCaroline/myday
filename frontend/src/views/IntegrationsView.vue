<template>
  <main class="flex-1 flex flex-col overflow-hidden">
    <header class="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between gap-4">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Integrations</h2>
        <p class="text-sm text-gray-500 mt-1">Manage your connected applications</p>
      </div>
      <button
        type="button"
        class="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        @click="showConnectPanel = !showConnectPanel"
      >
        Connect New Account
      </button>
    </header>

    <section v-if="noticeMessage" class="bg-indigo-50 border-b border-indigo-200 px-8 py-3 text-sm text-indigo-700">
      <i class="pi pi-info-circle mr-2"></i>
      {{ noticeMessage }}
    </section>

    <section v-if="errorMessage" class="bg-red-50 border-b border-red-200 px-8 py-3 text-sm text-red-700">
      <i class="pi pi-exclamation-circle mr-2"></i>
      {{ errorMessage }}
    </section>

    <div class="flex-1 overflow-auto p-8 flex flex-col gap-6">
      <section v-if="showConnectPanel" class="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
        <h3 class="text-base font-semibold text-gray-900">Connect a new account</h3>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50"
            @click="connectOAuth('GOOGLE')"
          >
            Connect Google
          </button>
          <button
            type="button"
            class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50"
            @click="connectOAuth('MICROSOFT')"
          >
            Connect Outlook
          </button>
          <button
            type="button"
            class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50"
            @click="showImapForm = !showImapForm"
          >
            Configure IMAP
          </button>
        </div>

        <form v-if="showImapForm" class="grid grid-cols-1 md:grid-cols-2 gap-3" @submit.prevent="connectImap">
          <input v-model="imapForm.emailAddress" type="email" placeholder="Email address" class="border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          <input v-model="imapForm.label" type="text" placeholder="Label (Pro, Perso...)" class="border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          <input v-model="imapForm.host" type="text" placeholder="IMAP host" class="border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          <input v-model.number="imapForm.port" type="number" placeholder="Port" class="border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          <input v-model="imapForm.password" type="password" placeholder="App password" class="border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="imapForm.secure" type="checkbox" />
            Use SSL
          </label>
          <div class="md:col-span-2">
            <button type="submit" class="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
              Save IMAP account
            </button>
          </div>
        </form>
      </section>

      <section class="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 class="text-base font-semibold text-gray-900 mb-4">Connected accounts</h3>
        <div v-if="loading" class="text-sm text-gray-500">Syncing accounts...</div>
        <div v-else-if="connections.length === 0" class="text-sm text-gray-500">No connected account yet.</div>
        <ul v-else class="divide-y divide-gray-200">
          <li v-for="account in connections" :key="account.id" class="py-3 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-gray-900">{{ providerLabel(account.provider) }} · {{ account.label }}</p>
              <p class="text-sm text-gray-500">{{ account.emailAddress }}</p>
            </div>
            <div class="flex items-center gap-3">
              <span
                class="text-xs font-medium px-2 py-0.5 rounded-full"
                :class="statusClass(displayStatus(account))"
              >
                {{ displayStatus(account) }}
              </span>
              <button
                type="button"
                class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                @click="disconnect(account.id)"
              >
                Disconnect
              </button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import axios from 'axios'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

type OAuthProvider = 'GOOGLE' | 'MICROSOFT'

interface Connection {
  id: string
  provider: string
  emailAddress: string
  label: string
  status: 'ACTIVE' | 'EXPIRED'
}

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const loading = ref(false)
const showConnectPanel = ref(false)
const showImapForm = ref(false)
const connections = ref<Connection[]>([])
const errorMessage = ref<string | null>(null)
const noticeMessage = ref<string | null>(null)
const imapForm = ref({
  emailAddress: '',
  label: '',
  host: '',
  port: 993,
  secure: true,
  password: '',
})

function providerLabel(provider: string) {
  if (provider === 'GOOGLE') return 'Google'
  if (provider === 'MICROSOFT') return 'Outlook'
  if (provider === 'IMAP') return 'IMAP'
  return provider
}

function displayStatus(account: Connection) {
  if (loading.value) return 'SYNCING'
  return account.status
}

function statusClass(status: string) {
  if (status === 'ACTIVE') return 'bg-green-100 text-green-700'
  if (status === 'EXPIRED') return 'bg-red-100 text-red-700'
  return 'bg-blue-100 text-blue-700'
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

async function connectOAuth(provider: OAuthProvider) {
  if (!authStore.token) return

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
    errorMessage.value = `Could not start ${providerLabel(provider)} connection.`
  }
}

async function connectImap() {
  if (!authStore.token) return

  errorMessage.value = null
  noticeMessage.value = null

  try {
    await axios.post(
      `${import.meta.env.VITE_API_URL}/auth/connections/imap`,
      imapForm.value,
      {
        headers: {
          Authorization: 'Bearer ' + authStore.token,
        },
      },
    )
    noticeMessage.value = 'IMAP account connected successfully.'
    showImapForm.value = false
    await fetchConnections()
  } catch {
    errorMessage.value = 'Could not connect this IMAP account.'
  }
}

async function disconnect(accountId: string) {
  if (!authStore.token) return

  errorMessage.value = null
  noticeMessage.value = null

  try {
    await axios.delete(`${import.meta.env.VITE_API_URL}/auth/connections/${accountId}`, {
      headers: {
        Authorization: 'Bearer ' + authStore.token,
      },
    })
    await fetchConnections()
  } catch {
    errorMessage.value = 'Could not disconnect this integration.'
  }
}

onMounted(async () => {
  const hasLinkError = route.query.linkError === '1'
  const refreshProfile = route.query.refreshProfile === '1'

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
      window.history.replaceState({}, '', '/app/integrations')
    } catch {
      authStore.logout()
      router.push('/login')
      return
    }
  }

  await fetchConnections()
})
</script>
