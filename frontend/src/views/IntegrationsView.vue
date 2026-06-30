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
          <button
            type="button"
            class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50"
            @click="connectSocialOAuth('INSTAGRAM')"
          >
            Connect Instagram
          </button>
          <button
            type="button"
            class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50"
            @click="connectSocialOAuth('FACEBOOK')"
          >
            Connect Facebook
          </button>
          <button
            type="button"
            class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50"
            @click="connectSocialOAuth('TIKTOK')"
          >
            Connect TikTok
          </button>
          <button
            type="button"
            class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50"
            @click="connectNotion"
          >
            Connect Notion
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

      <section class="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 class="text-base font-semibold text-gray-900 mb-4">Connected social accounts</h3>
        <div v-if="socialLoading" class="text-sm text-gray-500">Syncing social accounts...</div>
        <div v-else-if="socialConnections.length === 0" class="text-sm text-gray-500">No connected social account yet.</div>
        <ul v-else class="divide-y divide-gray-200">
          <li v-for="account in socialConnections" :key="account.id" class="py-3 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-gray-900">{{ providerLabel(account.provider) }} · {{ account.externalAccountId }}</p>
              <p class="text-sm text-gray-500" v-if="account.expiresInDays !== null">Token expires in {{ account.expiresInDays }} day(s)</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs font-medium px-2 py-0.5 rounded-full" :class="statusClass(account.status)">
                {{ account.status }}
              </span>
              <button
                v-if="account.status !== 'ACTIVE'"
                type="button"
                class="text-sm bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 transition-colors"
                @click="connectSocialOAuth(account.provider)"
              >
                Re-link
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- GitHub Integration -->
      <section class="bg-white border border-gray-200 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-base font-semibold text-gray-900">GitHub Repositories</h3>
            <p class="text-xs text-gray-500 mt-0.5">Issues assigned to you will be auto-created as tasks.</p>
          </div>
          <button
            type="button"
            class="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            @click="showGithubForm = !showGithubForm"
          >
            Add Repository
          </button>
        </div>

        <form v-if="showGithubForm" class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 p-4 bg-gray-50 rounded-xl" @submit.prevent="addGithubLink">
          <div class="md:col-span-2">
            <label class="block text-xs font-medium text-gray-700 mb-1">Repository (owner/name)</label>
            <input v-model="githubForm.repoFullName" type="text" placeholder="e.g. acme/my-project" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Webhook Secret</label>
            <input v-model="githubForm.webhookSecret" type="password" placeholder="Set this in GitHub webhook settings" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Filter by Label (optional)</label>
            <input v-model="githubForm.filterLabel" type="text" placeholder="e.g. myday" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 mb-1">Target Workspace</label>
            <select v-model="githubForm.workspaceId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Default workspace</option>
              <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">{{ ws.name }}</option>
            </select>
          </div>
          <div class="md:col-span-2 flex items-center gap-2">
            <button type="submit" class="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors">
              Save Repository
            </button>
            <p class="text-xs text-gray-500">
              Webhook URL: <code class="bg-gray-100 px-1 rounded">{{ apiUrl }}/integrations/github/webhook</code>
            </p>
          </div>
        </form>

        <div v-if="githubLinksLoading" class="text-sm text-gray-500">Loading...</div>
        <div v-else-if="githubLinks.length === 0" class="text-sm text-gray-500">No GitHub repositories linked yet.</div>
        <ul v-else class="divide-y divide-gray-200">
          <li v-for="link in githubLinks" :key="link.id" class="py-3 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-gray-900">{{ link.sourceName }}</p>
              <p class="text-xs text-gray-500">
                Workspace: {{ link.workspace?.name ?? 'Default' }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs font-medium px-2 py-0.5 rounded-full" :class="link.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">
                {{ link.active ? 'ACTIVE' : 'INACTIVE' }}
              </span>
              <button
                type="button"
                class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                @click="deleteIntegrationLink(link.id)"
              >
                Remove
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Notion Integration -->
      <section class="bg-white border border-gray-200 rounded-2xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-base font-semibold text-gray-900">Notion Databases</h3>
            <p class="text-xs text-gray-500 mt-0.5">Pages in linked databases are synced as tasks hourly.</p>
          </div>
          <button
            type="button"
            class="text-sm bg-black text-white px-3 py-1.5 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            @click="connectNotion"
          >
            Connect Notion
          </button>
        </div>

        <div v-if="notionDatabases.length > 0" class="mb-4">
          <form class="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl" @submit.prevent="addNotionLink">
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Database</label>
              <select v-model="notionForm.databaseId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required>
                <option value="">Select a database</option>
                <option v-for="db in notionDatabases" :key="db.id" :value="db.id">{{ db.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 mb-1">Target Workspace</label>
              <select v-model="notionForm.workspaceId" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Default workspace</option>
                <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">{{ ws.name }}</option>
              </select>
            </div>
            <div class="flex items-end">
              <button type="submit" class="w-full text-sm bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 transition-colors">
                Link Database
              </button>
            </div>
          </form>
        </div>

        <div v-if="notionLinksLoading" class="text-sm text-gray-500">Loading...</div>
        <div v-else-if="notionLinks.length === 0" class="text-sm text-gray-500">No Notion databases linked yet. Connect Notion to get started.</div>
        <ul v-else class="divide-y divide-gray-200">
          <li v-for="link in notionLinks" :key="link.id" class="py-3 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-medium text-gray-900">{{ link.sourceName }}</p>
              <p class="text-xs text-gray-500">Workspace: {{ link.workspace?.name ?? 'Default' }}</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs font-medium px-2 py-0.5 rounded-full" :class="link.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">
                {{ link.active ? 'ACTIVE' : 'INACTIVE' }}
              </span>
              <button
                type="button"
                class="text-sm bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                @click="deleteIntegrationLink(link.id)"
              >
                Remove
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
type SocialOAuthProvider = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK'

interface Connection {
  id: string
  provider: string
  emailAddress: string
  label: string
  status: 'ACTIVE' | 'EXPIRED'
}

interface SocialConnection {
  id: string
  provider: SocialOAuthProvider
  externalAccountId: string
  status: 'ACTIVE' | 'EXPIRED' | 'EXPIRING_SOON'
  expiresInDays: number | null
}

interface Workspace {
  id: string
  name: string
  color: string
}

interface IntegrationLink {
  id: string
  type: string
  sourceId: string
  sourceName: string
  active: boolean
  workspace: { id: string; name: string; color: string } | null
}

interface NotionDatabase {
  id: string
  name: string
}

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const apiUrl = import.meta.env.VITE_API_URL as string

const loading = ref(false)
const showConnectPanel = ref(false)
const showImapForm = ref(false)
const connections = ref<Connection[]>([])
const socialConnections = ref<SocialConnection[]>([])
const socialLoading = ref(false)
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

// Workspaces
const workspaces = ref<Workspace[]>([])

// GitHub
const showGithubForm = ref(false)
const githubLinksLoading = ref(false)
const githubLinks = ref<IntegrationLink[]>([])
const githubForm = ref({ repoFullName: '', webhookSecret: '', filterLabel: '', workspaceId: '' })

// Notion
const notionLinksLoading = ref(false)
const notionLinks = ref<IntegrationLink[]>([])
const notionDatabases = ref<NotionDatabase[]>([])
const notionForm = ref({ databaseId: '', workspaceId: '' })

function providerLabel(provider: string) {
  if (provider === 'GOOGLE') return 'Google'
  if (provider === 'MICROSOFT') return 'Outlook'
  if (provider === 'IMAP') return 'IMAP'
  if (provider === 'INSTAGRAM') return 'Instagram'
  if (provider === 'FACEBOOK') return 'Facebook'
  if (provider === 'TIKTOK') return 'TikTok'
  return provider
}

function displayStatus(account: Connection) {
  if (loading.value) return 'SYNCING'
  return account.status
}

function statusClass(status: string) {
  if (status === 'ACTIVE') return 'bg-green-100 text-green-700'
  if (status === 'EXPIRED') return 'bg-red-100 text-red-700'
  if (status === 'EXPIRING_SOON') return 'bg-amber-100 text-amber-700'
  return 'bg-blue-100 text-blue-700'
}

function authHeaders() {
  return { Authorization: 'Bearer ' + authStore.token }
}

async function fetchConnections() {
  if (!authStore.token) return
  loading.value = true
  errorMessage.value = null

  try {
    const { data } = await axios.get(`${apiUrl}/auth/connections`, {
      headers: authHeaders(),
    })
    connections.value = Array.isArray(data) ? data : []
  } catch {
    errorMessage.value = 'Failed to load integrations.'
  } finally {
    loading.value = false
  }
}

async function fetchSocialConnections() {
  if (!authStore.token) return
  socialLoading.value = true
  try {
    const { data } = await axios.get(`${apiUrl}/social/accounts`, {
      headers: authHeaders(),
    })
    socialConnections.value = Array.isArray(data) ? data : []
  } catch {
    socialConnections.value = []
  } finally {
    socialLoading.value = false
  }
}

async function fetchWorkspaces() {
  if (!authStore.token) return
  try {
    const { data } = await axios.get(`${apiUrl}/workspaces`, { headers: authHeaders() })
    workspaces.value = Array.isArray(data) ? data : []
  } catch {
    workspaces.value = []
  }
}

async function fetchGithubLinks() {
  if (!authStore.token) return
  githubLinksLoading.value = true
  try {
    const { data } = await axios.get(`${apiUrl}/integration-links?type=github`, { headers: authHeaders() })
    githubLinks.value = Array.isArray(data) ? data : []
  } catch {
    githubLinks.value = []
  } finally {
    githubLinksLoading.value = false
  }
}

async function fetchNotionLinks() {
  if (!authStore.token) return
  notionLinksLoading.value = true
  try {
    const { data } = await axios.get(`${apiUrl}/integration-links?type=notion`, { headers: authHeaders() })
    notionLinks.value = Array.isArray(data) ? data : []
  } catch {
    notionLinks.value = []
  } finally {
    notionLinksLoading.value = false
  }
}

async function fetchNotionDatabases() {
  if (!authStore.token) return
  try {
    const { data } = await axios.get(`${apiUrl}/integrations/notion/databases`, { headers: authHeaders() })
    if (data.connected && Array.isArray(data.databases)) {
      notionDatabases.value = data.databases
    }
  } catch {
    notionDatabases.value = []
  }
}

async function addGithubLink() {
  if (!authStore.token) return
  errorMessage.value = null
  try {
    const config: Record<string, string> = { webhookSecret: githubForm.value.webhookSecret }
    if (githubForm.value.filterLabel.trim()) {
      config.filterLabel = githubForm.value.filterLabel.trim()
    }
    await axios.post(
      `${apiUrl}/integration-links`,
      {
        type: 'github',
        sourceId: githubForm.value.repoFullName.trim(),
        sourceName: githubForm.value.repoFullName.trim(),
        workspaceId: githubForm.value.workspaceId || null,
        config,
      },
      { headers: authHeaders() },
    )
    githubForm.value = { repoFullName: '', webhookSecret: '', filterLabel: '', workspaceId: '' }
    showGithubForm.value = false
    noticeMessage.value = 'GitHub repository linked. Configure a webhook in your repo settings pointing to the URL shown.'
    await fetchGithubLinks()
  } catch {
    errorMessage.value = 'Could not save GitHub repository link.'
  }
}

async function addNotionLink() {
  if (!authStore.token || !notionForm.value.databaseId) return
  errorMessage.value = null
  const selectedDb = notionDatabases.value.find((d) => d.id === notionForm.value.databaseId)
  try {
    await axios.post(
      `${apiUrl}/integration-links`,
      {
        type: 'notion',
        sourceId: notionForm.value.databaseId,
        sourceName: selectedDb?.name ?? notionForm.value.databaseId,
        workspaceId: notionForm.value.workspaceId || null,
      },
      { headers: authHeaders() },
    )
    notionForm.value = { databaseId: '', workspaceId: '' }
    noticeMessage.value = 'Notion database linked. Tasks will sync within the hour.'
    await fetchNotionLinks()
  } catch {
    errorMessage.value = 'Could not link Notion database.'
  }
}

async function deleteIntegrationLink(linkId: string) {
  if (!authStore.token) return
  errorMessage.value = null
  try {
    await axios.delete(`${apiUrl}/integration-links/${linkId}`, { headers: authHeaders() })
    noticeMessage.value = 'Integration link removed.'
    await fetchGithubLinks()
    await fetchNotionLinks()
  } catch {
    errorMessage.value = 'Could not remove integration link.'
  }
}

async function connectSocialOAuth(provider: SocialOAuthProvider) {
  if (!authStore.token) return

  errorMessage.value = null
  noticeMessage.value = null

  try {
    const { data } = await axios.get(
      `${apiUrl}/social/oauth/${provider.toLowerCase()}/link`,
      { headers: authHeaders() },
    )
    window.location.href = data.url
  } catch {
    errorMessage.value = `Could not start ${providerLabel(provider)} connection.`
  }
}

async function connectOAuth(provider: OAuthProvider) {
  if (!authStore.token) return

  errorMessage.value = null
  noticeMessage.value = null

  const authPath = provider === 'GOOGLE' ? 'google' : 'microsoft'

  try {
    const { data } = await axios.get(`${apiUrl}/auth/${authPath}/link`, {
      headers: authHeaders(),
    })
    window.location.href = data.url
  } catch {
    errorMessage.value = `Could not start ${providerLabel(provider)} connection.`
  }
}

async function connectNotion() {
  if (!authStore.token) return
  errorMessage.value = null
  noticeMessage.value = null
  try {
    const { data } = await axios.get(`${apiUrl}/integrations/notion/oauth/link`, {
      headers: authHeaders(),
    })
    window.location.href = data.url
  } catch {
    errorMessage.value = 'Could not start Notion connection.'
  }
}

async function connectImap() {
  if (!authStore.token) return

  errorMessage.value = null
  noticeMessage.value = null

  try {
    await axios.post(
      `${apiUrl}/auth/connections/imap`,
      imapForm.value,
      { headers: authHeaders() },
    )
    noticeMessage.value = 'IMAP account connected successfully.'
    showImapForm.value = false
    await fetchConnections()
    await fetchSocialConnections()
  } catch {
    errorMessage.value = 'Could not connect this IMAP account.'
  }
}

async function disconnect(accountId: string) {
  if (!authStore.token) return

  errorMessage.value = null
  noticeMessage.value = null

  try {
    await axios.delete(`${apiUrl}/auth/connections/${accountId}`, {
      headers: authHeaders(),
    })
    await fetchConnections()
    await fetchSocialConnections()
  } catch {
    errorMessage.value = 'Could not disconnect this integration.'
  }
}

onMounted(async () => {
  const hasLinkError = route.query.linkError === '1'
  const notionError = route.query.notionError === '1'
  const notionConnected = route.query.notionConnected === '1'
  const refreshProfile = route.query.refreshProfile === '1'

  if (hasLinkError || notionError) {
    errorMessage.value = 'Account linking failed. Please verify account permissions and try again.'
  }

  if (notionConnected) {
    noticeMessage.value = 'Notion connected successfully. You can now link your databases.'
    window.history.replaceState({}, '', '/app/integrations')
  }

  if (refreshProfile && authStore.token) {
    try {
      const { data } = await axios.get(`${apiUrl}/auth/profile`, {
        headers: authHeaders(),
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

  await Promise.all([
    fetchConnections(),
    fetchSocialConnections(),
    fetchWorkspaces(),
    fetchGithubLinks(),
    fetchNotionLinks(),
    fetchNotionDatabases(),
  ])
})
</script>

