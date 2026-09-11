<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import NoticeToast from '../components/NoticeToast.vue'
import api from '../lib/api'
import { saveSession } from '../lib/auth'
import { loginWithAdminPasskey } from '../lib/passkey'
import type { CurrentUser, TokenPair } from '../types/api'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const passkeyLoading = ref(false)
const error = ref('')

async function establish(tokens: TokenPair) {
  const { data: user } = await api.get<CurrentUser>('/api/v1/users/me', { headers: { Authorization: `Bearer ${tokens.accessToken}` } })
  if (user.role !== 'ADMIN') throw new Error('该账号没有管理端访问权限')
  saveSession(tokens, user)
  router.replace('/')
}

async function passwordLogin() {
  error.value = ''
  loading.value = true
  try {
    const { data } = await api.post<TokenPair>('/api/v1/auth/admin/password/login', { username: username.value, password: password.value })
    await establish(data)
  } catch (reason: any) {
    error.value = reason.response?.data?.message ?? reason.message ?? '登录失败，请检查账号与密码'
  } finally { loading.value = false }
}

async function passkeyLogin() {
  error.value = ''
  if (!username.value.trim()) { error.value = '请先输入管理员账号'; return }
  passkeyLoading.value = true
  try { await establish(await loginWithAdminPasskey(username.value)) }
  catch (reason: any) { error.value = reason.response?.data?.message ?? reason.message ?? 'Passkey 验证未完成' }
  finally { passkeyLoading.value = false }
}
</script>

<template>
  <main class="login-page">
    <NoticeToast :message="error" @dismiss="error = ''" />
    <section class="login-aside">
      <div class="login-brand"><span class="brand-mark">法</span><span>法考题库管理</span></div>
      <div class="login-intro"><p>管理端</p><h1>让题库运营<br />井然有序。</h1><span>统一管理系统用户、题库与内容权限。</span></div>
      <div class="login-grid" aria-hidden="true"><i v-for="n in 12" :key="n" /></div>
      <footer>Law Test Administration · Secure Access</footer>
    </section>
    <section class="login-panel">
      <form class="login-form" @submit.prevent="passwordLogin">
        <div><span class="eyebrow">管理员登录</span><h2>欢迎回来</h2><p>使用管理员账号进入法考题库管理端。</p></div>
        <label>管理员账号<input v-model.trim="username" autocomplete="username" placeholder="请输入管理员账号" required /></label>
        <label>登录密码<input v-model="password" autocomplete="current-password" type="password" placeholder="请输入登录密码" required /></label>
        <button class="button primary full" type="submit" :disabled="loading">{{ loading ? '正在验证…' : '密码登录' }}</button>
        <div class="divider"><span>或</span></div>
        <button class="button secondary full" type="button" :disabled="passkeyLoading" @click="passkeyLogin"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/></svg>{{ passkeyLoading ? '等待安全设备确认…' : '使用账号 Passkey 登录' }}</button>
        <small class="login-note">仅管理员账号可从此入口登录。普通用户请使用客户端。</small>
      </form>
    </section>
  </main>
</template>
