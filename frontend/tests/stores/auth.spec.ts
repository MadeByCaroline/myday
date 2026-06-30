import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../src/stores/auth'

describe('useAuthStore – isPremium', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('isPremium is false when user is null', () => {
    const store = useAuthStore()
    expect(store.isPremium).toBe(false)
  })

  it('isPremium is false for a non-premium, non-admin user', () => {
    const store = useAuthStore()
    store.setUser({ id: '1', email: 'user@test.com', name: 'User', role: 'USER', isPremium: false })
    expect(store.isPremium).toBe(false)
  })

  it('isPremium is true for a premium user', () => {
    const store = useAuthStore()
    store.setUser({ id: '1', email: 'user@test.com', name: 'User', role: 'USER', isPremium: true })
    expect(store.isPremium).toBe(true)
  })

  it('isPremium is true for an admin regardless of isPremium field', () => {
    const store = useAuthStore()
    store.setUser({ id: '2', email: 'admin@test.com', name: 'Admin', role: 'ADMIN', isPremium: false })
    expect(store.isPremium).toBe(true)
  })
})
