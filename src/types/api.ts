export type UserRole = 'USER' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'DISABLED'

export interface TokenPair {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
}

export interface CurrentUser {
  id: number
  username: string
  displayName: string
  role: UserRole
  status: UserStatus
  createdAt: string
}

export interface SystemUser {
  id: number
  username: string
  displayName: string
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
}

export interface PageResponse<T> {
  items: T[]
  page: number
  size: number
  total: number
}

export interface Passkey {
  credentialId: string
  label: string
  transports: string[]
  backupEligible: boolean
  backupState: boolean
  createdAt: string
  lastUsedAt: string | null
}
