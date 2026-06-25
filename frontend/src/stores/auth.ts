import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

interface User {
  id: string
  email: string
  name: string
  picture?: string
  connectedGoogleAccounts?: string[]
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('jwt_token'))
  const user = ref<User | null>(null)

  const isAuthenticated = computed(() => !!token.value)

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('jwt_token', newToken)
  }

  function setUser(newUser: User) {
    user.value = newUser
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('jwt_token')
  }

  return { token, user, isAuthenticated, setToken, setUser, logout }
})
