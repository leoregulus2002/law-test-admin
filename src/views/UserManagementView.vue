<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppShell from '../components/AppShell.vue'
import api from '../lib/api'
import type { PageResponse, SystemUser, UserRole, UserStatus } from '../types/api'

const users = ref<SystemUser[]>([])
const total = ref(0)
const page = ref(0)
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const filters = reactive<{ role: '' | UserRole; status: '' | UserStatus }>({ role: '', status: '' })
const drawerOpen = ref(false)
const mode = ref<'create' | 'edit'>('create')
const saving = ref(false)
const selected = ref<SystemUser | null>(null)
const form = reactive({ username: '', displayName: '', password: '', role: 'USER' as UserRole, status: 'ACTIVE' as UserStatus })
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / 20)))

async function load() {
  loading.value = true; error.value = ''
  try {
    const { data } = await api.get<PageResponse<SystemUser>>('/api/v1/admin/users', { params: { page: page.value, size: 20, keyword: keyword.value || undefined, role: filters.role || undefined, status: filters.status || undefined } })
    users.value = data.items; total.value = data.total
  } catch (reason: any) { error.value = reason.response?.data?.message ?? '无法加载系统用户' }
  finally { loading.value = false }
}

function openCreate() {
  mode.value = 'create'; selected.value = null
  Object.assign(form, { username: '', displayName: '', password: '', role: 'USER', status: 'ACTIVE' })
  drawerOpen.value = true
}
function openEdit(user: SystemUser) {
  mode.value = 'edit'; selected.value = user
  Object.assign(form, { username: user.username, displayName: user.displayName, password: '', role: user.role, status: user.status })
  drawerOpen.value = true
}
async function save() {
  saving.value = true; error.value = ''
  try {
    if (mode.value === 'create') await api.post('/api/v1/admin/users', { username: form.username, displayName: form.displayName, password: form.password, role: form.role })
    else await api.patch(`/api/v1/admin/users/${selected.value?.id}`, { displayName: form.displayName, role: form.role, status: form.status })
    drawerOpen.value = false; await load()
  } catch (reason: any) { error.value = reason.response?.data?.message ?? '保存失败，请检查输入内容' }
  finally { saving.value = false }
}
async function resetPassword(user: SystemUser) {
  const password = window.prompt(`为 ${user.displayName} 设置新密码（8–72 位）`)
  if (!password) return
  try { await api.put(`/api/v1/admin/users/${user.id}/password`, { password }); await load() }
  catch (reason: any) { error.value = reason.response?.data?.message ?? '密码重置失败' }
}
async function remove(user: SystemUser) {
  if (!window.confirm(`确定删除用户“${user.displayName}”吗？该操作不可恢复。`)) return
  try { await api.delete(`/api/v1/admin/users/${user.id}`); await load() }
  catch (reason: any) { error.value = reason.response?.data?.message ?? '删除失败' }
}
function submitSearch() { page.value = 0; load() }
watch(() => [filters.role, filters.status], () => { page.value = 0; load() })
onMounted(load)
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><h1>系统用户</h1><p>创建、维护和保护普通用户与管理员账号。</p></div><button class="button primary" @click="openCreate"><span>+</span> 新增用户</button></div>
    <section class="surface table-surface"><div class="toolbar"><form class="search-box" @submit.prevent="submitSearch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input v-model.trim="keyword" placeholder="搜索用户名或显示名称" /><button type="submit">搜索</button></form><select v-model="filters.role" aria-label="账号类型"><option value="">全部账号类型</option><option value="USER">普通用户</option><option value="ADMIN">管理员</option></select><select v-model="filters.status" aria-label="账号状态"><option value="">全部状态</option><option value="ACTIVE">正常</option><option value="DISABLED">已禁用</option></select></div>
      <p v-if="error" class="form-error table-error">{{ error }}</p>
      <div class="table-scroll"><table><thead><tr><th>用户信息</th><th>账号类型</th><th>状态</th><th>创建时间</th><th class="actions">操作</th></tr></thead><tbody><tr v-if="loading"><td colspan="5" class="empty-state">正在加载…</td></tr><tr v-else-if="users.length === 0"><td colspan="5" class="empty-state">未找到符合条件的系统用户。</td></tr><tr v-for="user in users" :key="user.id"><td><div class="user-cell"><span class="avatar">{{ user.displayName.slice(0, 1) }}</span><span><b>{{ user.displayName }}</b><small>@{{ user.username }}</small></span></div></td><td><span :class="['role-pill', user.role.toLowerCase()]">{{ user.role === 'ADMIN' ? '管理员' : '普通用户' }}</span></td><td><span :class="['status-pill', user.status.toLowerCase()]"><i />{{ user.status === 'ACTIVE' ? '正常' : '已禁用' }}</span></td><td class="date-cell">{{ new Date(user.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</td><td class="actions"><button @click="openEdit(user)">编辑</button><button @click="resetPassword(user)">重置密码</button><button class="danger" @click="remove(user)">删除</button></td></tr></tbody></table></div>
      <footer class="pagination"><span>共 {{ total }} 条记录</span><div><button :disabled="page === 0" @click="page--; load()">上一页</button><b>{{ page + 1 }} / {{ pageCount }}</b><button :disabled="page + 1 >= pageCount" @click="page++; load()">下一页</button></div></footer>
    </section>
    <div v-if="drawerOpen" class="drawer-backdrop" @click.self="drawerOpen = false"><aside class="drawer"><header><div><span class="eyebrow">{{ mode === 'create' ? '创建账户' : '编辑账户' }}</span><h2>{{ mode === 'create' ? '新增系统用户' : form.displayName }}</h2></div><button class="icon-button" @click="drawerOpen = false">×</button></header><form @submit.prevent="save"><fieldset><legend>基本信息</legend><label>账号类型<div class="radio-group"><label><input v-model="form.role" type="radio" value="USER" /> 普通用户</label><label><input v-model="form.role" type="radio" value="ADMIN" /> 管理员</label></div></label><label>用户名<input v-model.trim="form.username" :disabled="mode === 'edit'" placeholder="4–64 位小写字母、数字或 ._-" required /></label><label>显示名称<input v-model.trim="form.displayName" placeholder="请输入显示名称" required /></label><label v-if="mode === 'create'">初始密码<input v-model="form.password" type="password" placeholder="8–72 位密码" required /></label><label v-if="mode === 'edit'">账号状态<select v-model="form.status"><option value="ACTIVE">正常</option><option value="DISABLED">已禁用</option></select></label></fieldset><p class="drawer-hint">{{ form.role === 'ADMIN' ? '管理员可从独立管理端以密码或该账号的 Passkey 登录。' : '普通用户仅能从用户端登录。' }}</p><footer><button class="button secondary" type="button" @click="drawerOpen = false">取消</button><button class="button primary" :disabled="saving">{{ saving ? '保存中…' : '保存用户' }}</button></footer></form></aside></div>
  </AppShell>
</template>
