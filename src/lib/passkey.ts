import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import api from './api'
import type { TokenPair } from '../types/api'

export async function loginWithAdminPasskey(username: string) {
  const { data: options } = await api.post('/api/v1/auth/passkeys/authentication/admin/options', { username })
  const publicKey = await startAuthentication({ optionsJSON: options.publicKey })
  const { data } = await api.post<TokenPair>('/api/v1/auth/passkeys/authentication/admin/verify', {
    ceremonyId: options.ceremonyId,
    publicKey,
  })
  return data
}

export async function registerPasskey(label: string) {
  const { data: options } = await api.post('/api/v1/users/me/passkeys/registration/options')
  const publicKey = await startRegistration({ optionsJSON: options.publicKey })
  await api.post('/api/v1/users/me/passkeys/registration/verify', { ceremonyId: options.ceremonyId, label, publicKey })
}
