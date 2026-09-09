<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import api from '../lib/api'

type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'INDETERMINATE_CHOICE'
type QuestionStatus = 'ACTIVE' | 'DISABLED'
interface Option { label: string; content: string }
interface QuestionRow { id: number; questionBankId: number; questionBankName: string; number: number; stem: string; questionType: QuestionType; status: QuestionStatus }
interface QuestionDetail extends QuestionRow { options: Option[]; answers: string[]; analysis: string }
interface Page<T> { items: T[]; total: number }

const questions = ref<QuestionRow[]>([])
const page = ref(0)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const detailOpen = ref(false)
const selected = ref<QuestionDetail | null>(null)
const detailLoading = ref(false)
const saving = ref(false)
const editing = ref(false)
const form = reactive({ number: 1, stem: '', questionType: 'SINGLE_CHOICE' as QuestionType, options: [] as Option[], answers: [] as string[], analysis: '' })
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / 20)))
const typeLabels: Record<QuestionType, string> = { SINGLE_CHOICE: '单选题', MULTIPLE_CHOICE: '多选题', INDETERMINATE_CHOICE: '不定项' }

async function load() {
  loading.value = true; error.value = ''
  try {
    const { data } = await api.get<Page<QuestionRow>>('/api/v1/questions', { params: { page: page.value, size: 20 } })
    questions.value = data.items; total.value = data.total
  } catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '无法读取题目列表' }
  finally { loading.value = false }
}
function fillForm(question: QuestionDetail) {
  Object.assign(form, { number: question.number, stem: question.stem, questionType: question.questionType, options: question.options.map(option => ({ ...option })), answers: [...question.answers], analysis: question.analysis })
}
async function openDetail(question: QuestionRow) {
  detailOpen.value = true; detailLoading.value = true; editing.value = false; selected.value = null
  try { const { data } = await api.get<QuestionDetail>(`/api/v1/questions/${question.id}`); selected.value = { ...data, questionBankName: question.questionBankName }; fillForm(selected.value) }
  catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '无法读取题目详情'; detailOpen.value = false }
  finally { detailLoading.value = false }
}
async function openEdit(question: QuestionRow) {
  await openDetail(question)
  if (selected.value) startEditing()
}
function closeDetail() { detailOpen.value = false; selected.value = null; editing.value = false }
function startEditing() { if (selected.value) { fillForm(selected.value); editing.value = true } }
function cancelEditing() { if (selected.value) fillForm(selected.value); editing.value = false }
async function save() {
  if (!selected.value) return
  saving.value = true
  try {
    const { data } = await api.put<QuestionDetail>(`/api/v1/questions/${selected.value.id}`, form)
    selected.value = { ...data, questionBankName: selected.value.questionBankName }
    editing.value = false; await load()
  } catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '修改失败，请检查题目内容' }
  finally { saving.value = false }
}
async function toggleStatus() {
  if (!selected.value) return
  const next: QuestionStatus = selected.value.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  saving.value = true
  try {
    const { data } = await api.patch<QuestionDetail>(`/api/v1/questions/${selected.value.id}/status`, { status: next })
    selected.value = { ...data, questionBankName: selected.value.questionBankName }
    await load()
  } catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '状态更新失败' }
  finally { saving.value = false }
}
async function remove() {
  if (!selected.value || !window.confirm(`确定删除第 ${selected.value.number} 题吗？该操作不可恢复。`)) return
  saving.value = true
  try { await api.delete(`/api/v1/questions/${selected.value.id}`); closeDetail(); if (questions.value.length === 1 && page.value > 0) page.value--; await load() }
  catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '删除题目失败' }
  finally { saving.value = false }
}
async function deleteFromList(question: QuestionRow) {
  if (!window.confirm(`确定删除“${question.stem}”吗？该操作不可恢复。`)) return
  try {
    await api.delete(`/api/v1/questions/${question.id}`)
    if (questions.value.length === 1 && page.value > 0) page.value--
    await load()
  } catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '删除题目失败' }
}

onMounted(load)
</script>

<template>
  <AppShell>
    <div class="page-heading"><div><h1>题目管理</h1><p>集中查看、维护和控制各题库中的题目。</p></div></div>
    <section class="surface table-surface question-list-surface"><p v-if="error" class="form-error table-error">{{ error }}</p><div class="question-list-caption"><span>题目列表</span><small>点击题干可查看完整选项与解析</small></div><div class="table-scroll"><table class="question-table"><thead><tr><th>序号</th><th>题目标题</th><th>选项类型</th><th>所属题库</th><th>状态</th><th class="actions">操作</th></tr></thead><tbody><tr v-if="loading"><td class="empty-state" colspan="6">正在加载…</td></tr><tr v-else-if="questions.length === 0"><td class="empty-state" colspan="6">暂无题目。</td></tr><tr v-for="(question, index) in questions" :key="question.id"><td><span class="question-number">{{ page * 20 + index + 1 }}</span></td><td><button class="question-stem" @click="openDetail(question)"><b>{{ question.stem }}</b><small>第 {{ question.number }} 题 · 点击查看详情</small></button></td><td><span class="type-pill">{{ typeLabels[question.questionType] }}</span></td><td><span class="bank-name">{{ question.questionBankName }}</span></td><td><span :class="['status-pill', question.status === 'ACTIVE' ? 'active' : 'disabled']"><i />{{ question.status === 'ACTIVE' ? '已启用' : '已停用' }}</span></td><td class="actions question-actions"><button @click="openDetail(question)">详情</button><button @click="openEdit(question)">修改</button><button class="danger" @click="deleteFromList(question)">删除</button></td></tr></tbody></table></div><footer class="pagination"><span>共 {{ total }} 道题目</span><div><button :disabled="page === 0 || loading" @click="page--; load()">上一页</button><b>{{ page + 1 }} / {{ pageCount }}</b><button :disabled="page + 1 >= pageCount || loading" @click="page++; load()">下一页</button></div></footer></section>
    <div v-if="detailOpen" class="modal-backdrop" @click.self="closeDetail"><section class="question-detail-modal" role="dialog" aria-modal="true" aria-labelledby="question-detail-title"><header class="import-modal-header"><div><span class="eyebrow">题目详情</span><h2 id="question-detail-title">{{ selected ? `第 ${selected.number} 题` : '正在加载' }}</h2><p v-if="selected">{{ selected.questionBankName }}</p></div><button class="icon-button" aria-label="关闭题目详情" @click="closeDetail">×</button></header><div v-if="detailLoading" class="detail-loading">正在加载题目内容…</div><form v-else-if="selected" class="question-detail-content" @submit.prevent="save"><template v-if="editing"><div class="edit-grid"><label>题号<input v-model.number="form.number" min="1" type="number" required /></label><label>题目类型<select v-model="form.questionType"><option value="SINGLE_CHOICE">单选题</option><option value="MULTIPLE_CHOICE">多选题</option><option value="INDETERMINATE_CHOICE">不定项</option></select></label></div><label class="detail-field">题目标题<textarea v-model.trim="form.stem" rows="3" required /></label><div class="detail-field"><b>选项与答案</b><div v-for="option in form.options" :key="option.label" class="edit-option"><label><input v-model="form.answers" :value="option.label" type="checkbox" /><span>{{ option.label }}</span></label><input v-model.trim="option.content" :aria-label="`${option.label} 选项内容`" required /></div></div><label class="detail-field">解析<textarea v-model.trim="form.analysis" rows="4" /></label></template><template v-else><div class="detail-meta"><span class="type-pill">{{ typeLabels[selected.questionType] }}</span><span :class="['status-pill', selected.status === 'ACTIVE' ? 'active' : 'disabled']"><i />{{ selected.status === 'ACTIVE' ? '已启用' : '已停用' }}</span></div><h3>{{ selected.stem }}</h3><div class="option-list"><div v-for="option in selected.options" :key="option.label" :class="{ answer: selected.answers.includes(option.label) }"><b>{{ option.label }}</b><span>{{ option.content }}</span><i v-if="selected.answers.includes(option.label)">正确答案</i></div></div><div v-if="selected.analysis" class="analysis-box"><b>题目解析</b><p>{{ selected.analysis }}</p></div></template><footer class="question-detail-footer"><template v-if="editing"><button class="button secondary" type="button" :disabled="saving" @click="cancelEditing">取消</button><button class="button primary" :disabled="saving">{{ saving ? '保存中…' : '保存修改' }}</button></template><template v-else><button class="text-danger" type="button" :disabled="saving" @click="remove">删除</button><span class="footer-spacer" /><button class="button secondary" type="button" :disabled="saving" @click="toggleStatus">{{ selected.status === 'ACTIVE' ? '停用题目' : '启用题目' }}</button><button class="button primary" type="button" @click="startEditing">修改题目</button></template></footer></form></section></div>
  </AppShell>
</template>
