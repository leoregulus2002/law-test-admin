<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import api from '../lib/api'
import type { PageResponse, SystemUser } from '../types/api'

const totals = ref({ users: '—', admins: '—', banks: '—' })
const recentUsers = ref<SystemUser[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [users, admins, banks] = await Promise.all([
      api.get<PageResponse<SystemUser>>('/api/v1/admin/users', { params: { size: 5 } }),
      api.get<PageResponse<SystemUser>>('/api/v1/admin/users', { params: { size: 1, role: 'ADMIN' } }),
      api.get<PageResponse<unknown>>('/api/v1/question-banks', { params: { size: 1 } }),
    ])
    totals.value = { users: String(users.data.total), admins: String(admins.data.total), banks: String(banks.data.total) }
    recentUsers.value = users.data.items
  } finally { loading.value = false }
})
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><h1>控制台</h1><p>系统运行概览与最近新增用户。</p></div><RouterLink class="button primary" to="/users">管理系统用户</RouterLink></div>
    <div class="metric-grid">
      <article class="metric"><span>系统用户</span><strong>{{ totals.users }}</strong><small>已注册账户总数</small><i class="metric-icon blue"><svg viewBox="0 0 24 24"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20"/><circle cx="9.5" cy="7" r="3.5"/><path d="M17 9a3 3 0 0 1 0 5.8"/></svg></i></article>
      <article class="metric"><span>管理员</span><strong>{{ totals.admins }}</strong><small>可访问管理端的账户</small><i class="metric-icon indigo"><svg viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 4.25-2.9 7.55-7 9-4.1-1.45-7-4.75-7-9V7z"/><path d="m9 12 2 2 4-4"/></svg></i></article>
      <article class="metric"><span>题库</span><strong>{{ totals.banks }}</strong><small>当前可管理的题库</small><i class="metric-icon teal"><svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/></svg></i></article>
    </div>
    <section class="surface recent-section"><div class="surface-title"><div><h2>最近新增用户</h2><p>最近创建的系统账号</p></div><RouterLink to="/users">查看全部</RouterLink></div>
      <div class="simple-list" v-if="!loading"><div v-for="user in recentUsers" :key="user.id" class="simple-row"><span class="avatar large">{{ user.displayName.slice(0, 1) }}</span><div><b>{{ user.displayName }}</b><span>@{{ user.username }}</span></div><span :class="['role-pill', user.role.toLowerCase()]">{{ user.role === 'ADMIN' ? '管理员' : '普通用户' }}</span><time>{{ new Date(user.createdAt).toLocaleDateString('zh-CN') }}</time></div><p v-if="recentUsers.length === 0" class="empty-state">尚无系统用户。</p></div>
    </section>
  </AppShell>
</template>
