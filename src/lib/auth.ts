import { reactive } from 'vue'
import type { CurrentUser, TokenPair } from '../types/api'

const storageKey = 'law-test-admin-session'

type Session = TokenPair & { user: CurrentUser }

const saved = localStorage.getItem(storageKey)
const initial = saved ? JSON.parse(saved) as Session : null

export const authState = reactive<{ session: Session | null }>({ session: initial })

export function saveSession(tokens: TokenPair, user: CurrentUser) {
  authState.session = { ...tokens, user }
  localStorage.setItem(storageKey, JSON.stringify(authState.session))
}

export function clearSession() {
  authState.session = null
  localStorage.removeItem(storageKey)
}
