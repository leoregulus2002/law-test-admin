<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import NoticeToast from '../components/NoticeToast.vue'
import api from '../lib/api'

interface QuestionBank { id: number; code: string; name: string; sourceFileName: string }
interface Page<T> { items: T[]; total: number }

const banks = ref<QuestionBank[]>([])
const error = ref('')
const importOpen = ref(false)
const importing = ref(false)
const importError = ref('')
const uploadInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const form = reactive({ name: '', questionType: 'SINGLE_CHOICE' })

const questionTypes = [
  { value: 'SINGLE_CHOICE', label: '单选题', detail: '每题仅有一个正确答案', marker: 'A' },
  { value: 'MULTIPLE_CHOICE', label: '多选题', detail: '每题有多个正确答案', marker: 'A / B' },
  { value: 'INDETERMINATE_CHOICE', label: '不定项', detail: '每题至少有一个正确答案', marker: 'A · B · C' },
  { value: 'SUBJECTIVE', label: '主观题', detail: 'Word 表格填写题号、题目和参考答案', marker: '答' },
]

async function load() {
  try {
    const { data } = await api.get<Page<QuestionBank>>('/api/v1/question-banks', { params: { page: 0, size: 100 } })
    banks.value = data.items
  } catch (reason: any) { error.value = reason.response?.data?.message ?? '无法读取题库' }
}
async function remove(bank: QuestionBank) {
  if (!window.confirm(`删除题库“${bank.name}”及其题目？`)) return
  await api.delete(`/api/v1/question-banks/${bank.id}`)
  await load()
}
function openImport() { importOpen.value = true; importError.value = '' }
function closeImport() {
  importOpen.value = false
  importError.value = ''
  selectedFile.value = null
  Object.assign(form, { name: '', questionType: 'SINGLE_CHOICE' })
  if (uploadInput.value) uploadInput.value.value = ''
}
function fileBaseName(fileName: string) { return fileName.replace(/\.[^.]+$/, '') }
function selectFile(file?: File) {
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.docx')) {
    importError.value = '请选择 .docx 格式的 Word 文件'
    return
  }
  selectedFile.value = file
  form.name = fileBaseName(file.name)
  importError.value = ''
}
function onFileChange(event: Event) { selectFile((event.target as HTMLInputElement).files?.[0]) }
function onDrop(event: DragEvent) { selectFile(event.dataTransfer?.files[0]) }
async function importQuestions() {
  if (!selectedFile.value) { importError.value = '请先选择要导入的 Word 文件'; return }
  if (!form.name.trim()) { importError.value = '请输入题库名称'; return }
  importing.value = true
  importError.value = ''
  try {
    const data = new FormData()
    data.append('file', selectedFile.value)
    data.append('questionType', form.questionType)
    data.append('questionBankName', form.name.trim())
    await api.post('/api/v1/questions/parse-word', data, { headers: { 'Content-Type': 'multipart/form-data' } })
    closeImport()
    await load()
  } catch (reason: any) {
    importError.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '导入失败，请检查文件内容后重试'
  } finally { importing.value = false }
}

onMounted(load)
</script>

<template>
  <AppShell>
    <NoticeToast :message="error" @dismiss="error = ''" />
    <NoticeToast :message="importError" @dismiss="importError = ''" />
    <div class="page-heading">
      <div><h1>题库管理</h1><p>查看现有题库，并清理不再使用的题库数据。</p></div>
      <button class="button primary" @click="openImport"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3"/><path d="m7 8 5-5 5 5"/><path d="M5 14v5h14v-5"/></svg>导入题库</button>
    </div>
    <section class="surface table-surface"><p v-if="error" class="form-error table-error">{{ error }}</p><div class="table-scroll"><table><thead><tr><th>题库名称</th><th>题库编码</th><th>来源文件</th><th class="actions">操作</th></tr></thead><tbody><tr v-if="banks.length === 0"><td class="empty-state" colspan="4">暂无题库。</td></tr><tr v-for="bank in banks" :key="bank.id"><td><b>{{ bank.name }}</b></td><td><code>{{ bank.code }}</code></td><td class="muted">{{ bank.sourceFileName }}</td><td class="actions"><button class="danger" @click="remove(bank)">删除题库</button></td></tr></tbody></table></div></section>
    <div v-if="importOpen" class="modal-backdrop" @click.self="closeImport">
      <section class="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header class="import-modal-header"><div><span class="eyebrow">WORD 题目导入</span><h2 id="import-title">导入题库</h2><p>上传文件并为本次题目选择对应题型。</p></div><button class="icon-button" aria-label="关闭导入弹窗" @click="closeImport">×</button></header>
        <form class="import-form" @submit.prevent="importQuestions">
          <label class="import-label">题库名称<input v-model.trim="form.name" placeholder="上传文件后自动填写" required /></label>
          <fieldset class="question-type-field"><legend>题目类型</legend><div class="question-type-grid"><label v-for="type in questionTypes" :key="type.value" :class="['question-type-card', { selected: form.questionType === type.value }]"><input v-model="form.questionType" type="radio" :value="type.value" /><span class="type-marker">{{ type.marker }}</span><span><b>{{ type.label }}</b><small>{{ type.detail }}</small></span><i aria-hidden="true">✓</i></label></div></fieldset>
          <div class="upload-section"><div class="upload-label"><b>上传题目文件</b><span>仅支持 .docx 格式</span></div><input ref="uploadInput" class="file-input" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="onFileChange" /><div class="upload-dropzone" :class="{ 'has-file': selectedFile }" @click="uploadInput?.click()" @dragover.prevent @drop.prevent="onDrop"><template v-if="selectedFile"><span class="file-icon">W</span><span class="file-summary"><b>{{ selectedFile.name }}</b><small>{{ Math.ceil(selectedFile.size / 1024) }} KB · 已准备导入</small></span><button type="button" class="replace-file" @click.stop="uploadInput?.click()">重新选择</button></template><template v-else><span class="upload-icon">↑</span><b>点击选择或拖拽 Word 文件到这里</b><small>文件需包含题号、题目、选项、答案、解析字段</small></template></div></div>
          <footer class="import-footer"><button class="button secondary" type="button" :disabled="importing" @click="closeImport">取消</button><button class="button primary" :disabled="importing">{{ importing ? '正在导入…' : '确认导入' }}</button></footer>
        </form>
      </section>
    </div>
  </AppShell>
</template>
