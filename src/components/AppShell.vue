<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authState, clearSession } from '../lib/auth'
import api from '../lib/api'

const route = useRoute()
const router = useRouter()
const title = computed(() => ({
  '/': '控制台',
  '/question-banks': '题库管理',
  '/users': '系统用户',
  '/security': '账号安全',
})[route.path] ?? '管理端')

const nav = [
  { to: '/', label: '控制台', icon: 'grid' },
  { to: '/question-banks', label: '题库管理', icon: 'book' },
  { to: '/users', label: '系统用户', icon: 'users' },
]

async function logout() {
  try {
    await api.post('/api/v1/auth/logout', { refreshToken: authState.session?.refreshToken })
  } finally {
    clearSession()
    router.push('/login')
  }
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"><span class="brand-mark">法</span><span>法考题库管理</span></RouterLink>
      <nav class="main-nav" aria-label="管理菜单">
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to" class="nav-item">
          <svg v-if="item.icon === 'grid'" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg>
          <svg v-else-if="item.icon === 'book'" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20"/><circle cx="9.5" cy="7" r="3.5"/><path d="M17 9a3 3 0 0 1 0 5.8M21 20v-1.5a4.5 4.5 0 0 0-2.8-4.15"/></svg>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-bottom">
        <RouterLink to="/security" class="profile-link">
          <span class="avatar">{{ authState.session?.user.displayName.slice(0, 1) }}</span>
          <span><b>{{ authState.session?.user.displayName }}</b><small>管理员</small></span>
        </RouterLink>
        <button class="signout" type="button" title="退出登录" @click="logout">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></svg>
        </button>
      </div>
    </aside>
    <main class="main-content">
      <header class="topbar"><div class="crumb"><span>管理端</span><i>/</i><strong>{{ title }}</strong></div><RouterLink to="/security" class="top-avatar">{{ authState.session?.user.displayName.slice(0, 1) }}</RouterLink></header>
      <section class="page"><slot /></section>
    </main>
  </div>
</template>
