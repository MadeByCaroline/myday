import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'

export function usePremium() {
  const authStore = useAuthStore()
  const isPremium = computed(() => authStore.isPremium)
  return { isPremium }
}
