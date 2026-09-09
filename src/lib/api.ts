import axios from 'axios'
import { authState, clearSession, saveSession } from './auth'
import type { CurrentUser, TokenPair } from '../types/api'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:9323',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = authState.session?.accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status !== 401 || !authState.session || error.config?._retry) return Promise.reject(error)
    error.config._retry = true
    try {
      const { data: tokens } = await axios.post<TokenPair>(`${api.defaults.baseURL}/api/v1/auth/token/refresh`, {
        refreshToken: authState.session.refreshToken,
      })
      const { data: user } = await axios.get<CurrentUser>(`${api.defaults.baseURL}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      if (user.role !== 'ADMIN') throw new Error('该账号不是管理员')
      saveSession(tokens, user)
      error.config.headers.Authorization = `Bearer ${tokens.accessToken}`
      return api(error.config)
    } catch {
      clearSession()
      return Promise.reject(error)
    }
  },
)

export default api
