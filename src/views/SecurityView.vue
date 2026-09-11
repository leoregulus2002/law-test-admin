<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import NoticeToast from '../components/NoticeToast.vue'
import api from '../lib/api'
import { registerPasskey } from '../lib/passkey'
import type { Passkey } from '../types/api'

const passkeys = ref<Passkey[]>([])
const busy = ref(false)
const error = ref('')
const success = ref('')

async function load() { const { data } = await api.get<Passkey[]>('/api/v1/users/me/passkeys'); passkeys.value = data }
async function addPasskey() {
  const label = window.prompt('为这个 Passkey 命名，例如“我的 MacBook”')
  if (!label?.trim()) return
  busy.value = true; error.value = ''; success.value = ''
  try { await registerPasskey(label.trim()); await load(); success.value = 'Passkey 已添加，可用于管理员登录。' }
  catch (reason: any) { error.value = reason.response?.data?.message ?? reason.message ?? 'Passkey 添加未完成' }
  finally { busy.value = false }
}
async function remove(key: Passkey) {
  if (!window.confirm(`移除 Passkey“${key.label}”？`)) return
  await api.delete(`/api/v1/users/me/passkeys/${encodeURIComponent(key.credentialId)}`); await load()
}
onMounted(load)
</script>

<template>
  <AppShell>
    <NoticeToast :message="error" @dismiss="error = ''" />
    <NoticeToast :message="success" type="success" @dismiss="success = ''" />
    <div class="page-heading"><div><h1>账号安全</h1><p>为当前管理员账户设置第二种安全登录方式。</p></div><button class="button primary" :disabled="busy" @click="addPasskey"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>{{ busy ? '等待确认…' : '添加 Passkey' }}</button></div>
    <section class="surface security-surface"><div class="security-header"><div><h2>Passkey</h2><p>使用设备生物识别或安全密钥登录管理端，无需输入密码。</p></div><span class="count-badge">{{ passkeys.length }} 个</span></div><p v-if="error" class="form-error">{{ error }}</p><p v-if="success" class="success-message">{{ success }}</p><div v-if="passkeys.length" class="passkey-list"><article v-for="key in passkeys" :key="key.credentialId" class="passkey-row"><span class="passkey-icon"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></svg></span><div><b>{{ key.label }}</b><small>创建于 {{ new Date(key.createdAt).toLocaleDateString('zh-CN') }} · {{ key.lastUsedAt ? `上次使用 ${new Date(key.lastUsedAt).toLocaleDateString('zh-CN')}` : '尚未使用' }}</small></div><button class="text-danger" @click="remove(key)">移除</button></article></div><div v-else class="empty-state padded">尚未添加 Passkey。建议至少注册一个设备，以便使用更安全、便捷的管理员登录方式。</div></section>
  </AppShell>
</template>
