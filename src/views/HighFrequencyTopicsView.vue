<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import api from '../lib/api'

interface Topic { id: number; title: string; summary: string; category: string }

const topics = ref<Topic[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const editorOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({ title: '', summary: '', category: '' })

async function load() {
  loading.value = true; error.value = ''
  try { topics.value = (await api.get<Topic[]>('/api/v1/admin/high-frequency-topics')).data }
  catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '无法读取高频考点' }
  finally { loading.value = false }
}
function openCreate() {
  editingId.value = null
  Object.assign(form, { title: '', summary: '', category: '' })
  editorOpen.value = true
}
function openEdit(topic: Topic) {
  editingId.value = topic.id
  Object.assign(form, topic)
  editorOpen.value = true
}
function closeEditor() { if (!saving.value) editorOpen.value = false }
async function save() {
  saving.value = true; error.value = ''
  try {
    const payload = { title: form.title.trim(), summary: form.summary.trim(), category: form.category.trim() }
    if (editingId.value === null) await api.post('/api/v1/admin/high-frequency-topics', payload)
    else await api.put(`/api/v1/admin/high-frequency-topics/${editingId.value}`, payload)
    editorOpen.value = false
    await load()
  } catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '保存失败，请检查录入内容' }
  finally { saving.value = false }
}
async function remove(topic: Topic) {
  if (!window.confirm(`确定删除“${topic.title}”吗？该操作不可恢复。`)) return
  error.value = ''
  try { await api.delete(`/api/v1/admin/high-frequency-topics/${topic.id}`); await load() }
  catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '删除失败' }
}

onMounted(load)
</script>

<template>
  <AppShell>
    <div class="page-heading topic-heading"><div><h1>今日高频考点</h1><p>手动录入考点内容；客户端每次进入页面会随机展示其中一条。</p></div><button class="button primary" @click="openCreate"><span>+</span>录入考点</button></div>
    <section class="surface topic-list-surface"><p v-if="error" class="form-error table-error">{{ error }}</p><div class="topic-list-caption"><b>考点列表</b><small>共 {{ topics.length }} 条</small></div><div v-if="loading" class="empty-state padded">正在加载…</div><div v-else-if="topics.length === 0" class="empty-state padded">暂无高频考点，请先录入一条。</div><article v-for="topic in topics" v-else :key="topic.id" class="topic-row"><div class="topic-icon">✦</div><div class="topic-copy"><div><h2>{{ topic.title }}</h2><span class="topic-category">{{ topic.category }} · 高频</span></div><p>{{ topic.summary }}</p></div><div class="topic-actions"><button @click="openEdit(topic)">修改</button><button class="danger" @click="remove(topic)">删除</button></div></article></section>
    <div v-if="editorOpen" class="modal-backdrop" @click.self="closeEditor"><section class="topic-editor" role="dialog" aria-modal="true" aria-labelledby="topic-editor-title"><header class="import-modal-header"><div><span class="eyebrow">今日高频考点</span><h2 id="topic-editor-title">{{ editingId === null ? '录入考点' : '修改考点' }}</h2><p>内容会在客户端随机展示。</p></div><button class="icon-button" aria-label="关闭" :disabled="saving" @click="closeEditor">×</button></header><form @submit.prevent="save"><label>考点标题<input v-model="form.title" maxlength="128" required placeholder="例如：正当防卫的成立条件" /></label><label>考点说明<textarea v-model="form.summary" maxlength="10000" rows="5" required placeholder="用一两句话说明需要记住的关键规则。" /></label><label>所属分类<input v-model="form.category" maxlength="64" required placeholder="例如：刑法" /></label><footer><button class="button secondary" type="button" :disabled="saving" @click="closeEditor">取消</button><button class="button primary" :disabled="saving">{{ saving ? '保存中…' : '保存' }}</button></footer></form></section></div>
  </AppShell>
</template>
