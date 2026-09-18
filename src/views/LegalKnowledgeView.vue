<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import NoticeToast from '../components/NoticeToast.vue'
import api from '../lib/api'
import type { LegalKnowledgeConfiguration, LegalKnowledgeDocument } from '../types/api'

const configuration = ref<LegalKnowledgeConfiguration | null>(null)
const documents = ref<LegalKnowledgeDocument[]>([])
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const activeDocumentId = ref<number | null>(null)
const selectedFile = ref<File | null>(null)
const uploadTitle = ref('')
const error = ref('')
const message = ref('')
const form = reactive({
  enabled: false,
  baseUrl: '',
  apiKey: '',
  apiKeyConfigured: false,
  chatModel: '',
  embeddingModel: '',
  embeddingDimension: 1536,
  timeoutSeconds: 45,
  topK: 8,
})

const readyDocuments = computed(() => documents.value.filter((document) => document.status === 'READY').length)
const processingDocuments = computed(() => documents.value.filter((document) => document.status === 'PROCESSING').length)
const failedDocuments = computed(() => documents.value.filter((document) => document.status === 'FAILED').length)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [configurationResponse, documentsResponse] = await Promise.all([
      api.get<LegalKnowledgeConfiguration>('/api/v1/admin/legal-knowledge/configuration'),
      api.get<LegalKnowledgeDocument[]>('/api/v1/admin/legal-knowledge/documents'),
    ])
    configuration.value = configurationResponse.data
    documents.value = documentsResponse.data
    Object.assign(form, { ...configurationResponse.data, apiKey: '' })
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '无法读取法律智库数据'
  } finally {
    loading.value = false
  }
}

async function saveConfiguration() {
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const response = await api.put<LegalKnowledgeConfiguration>('/api/v1/admin/legal-knowledge/configuration', {
      enabled: form.enabled,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey,
      chatModel: form.chatModel.trim(),
      embeddingModel: form.embeddingModel.trim(),
      embeddingDimension: form.embeddingDimension,
      timeoutSeconds: form.timeoutSeconds,
      topK: form.topK,
    })
    configuration.value = response.data
    Object.assign(form, { ...response.data, apiKey: '' })
    message.value = '法律智库配置已保存。'
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '保存法律智库配置失败'
  } finally {
    saving.value = false
  }
}

function selectFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function upload() {
  if (!selectedFile.value) {
    error.value = '请选择法规文件'
    return
  }
  uploading.value = true
  error.value = ''
  message.value = ''
  try {
    const payload = new FormData()
    payload.append('file', selectedFile.value)
    if (uploadTitle.value.trim()) payload.append('title', uploadTitle.value.trim())
    await api.post('/api/v1/admin/legal-knowledge/documents', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    selectedFile.value = null
    uploadTitle.value = ''
    message.value = '法规文件已提交，正在后台解析并建立索引。'
    await load()
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '上传法规文件失败'
  } finally {
    uploading.value = false
  }
}

async function reindex(document: LegalKnowledgeDocument) {
  activeDocumentId.value = document.id
  error.value = ''
  try {
    await api.post(`/api/v1/admin/legal-knowledge/documents/${document.id}/reindex`)
    message.value = `已重新提交《${document.title}》的索引任务。`
    await load()
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '重新建立索引失败'
  } finally {
    activeDocumentId.value = null
  }
}

async function remove(document: LegalKnowledgeDocument) {
  if (!window.confirm(`确认删除《${document.title}》及其全部索引吗？此操作不可恢复。`)) return
  activeDocumentId.value = document.id
  error.value = ''
  try {
    await api.delete(`/api/v1/admin/legal-knowledge/documents/${document.id}`)
    message.value = `已删除《${document.title}》。`
    await load()
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '删除法规文件失败'
  } finally {
    activeDocumentId.value = null
  }
}

function documentStatus(document: LegalKnowledgeDocument) {
  return document.status === 'READY' ? '已就绪' : document.status === 'PROCESSING' ? '索引中' : '失败'
}

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function date(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

onMounted(load)
</script>

<template>
  <AppShell>
    <NoticeToast :message="error" @dismiss="error = ''" />
    <NoticeToast :message="message" type="success" @dismiss="message = ''" />

    <header class="knowledge-heading">
      <div>
        <span class="eyebrow">Knowledge base / Legal AI</span>
        <h1>法律智库</h1>
        <p>配置模型能力，导入可溯源的法规原文，为客户端法律问答提供依据。</p>
      </div>
      <button class="refresh-button" :disabled="loading" @click="load">↻ 刷新数据</button>
    </header>

    <section class="knowledge-stats" aria-label="知识库概况">
      <article class="stat-card accent"><span>可问答法规</span><b>{{ String(readyDocuments).padStart(2, '0') }}</b><small>已完成解析与索引</small></article>
      <article class="stat-card"><span>正在处理</span><b>{{ String(processingDocuments).padStart(2, '0') }}</b><small>后台异步建立索引</small></article>
      <article class="stat-card"><span>需要处理</span><b>{{ String(failedDocuments).padStart(2, '0') }}</b><small>可查看失败原因后重试</small></article>
      <article :class="['stat-card', { online: configuration?.enabled }]">
        <span>问答服务</span><b>{{ configuration?.enabled ? '已启用' : '未启用' }}</b><small>{{ configuration?.apiKeyConfigured ? '模型密钥已安全保存' : '尚未配置模型密钥' }}</small>
      </article>
    </section>

    <section class="knowledge-grid">
      <form class="configuration-card" @submit.prevent="saveConfiguration">
        <header>
          <div><span class="section-kicker">01 / 模型连接</span><h2>问答模型配置</h2><p>使用 OpenAI 兼容接口完成嵌入检索与法规回答。</p></div>
          <label class="switch-field"><input v-model="form.enabled" type="checkbox" /><span /><b>{{ form.enabled ? '已启用' : '未启用' }}</b></label>
        </header>
        <div class="model-fields">
          <label>接口地址<input v-model="form.baseUrl" type="url" placeholder="https://服务地址/v1" :required="form.enabled" /></label>
          <label>聊天模型<input v-model="form.chatModel" placeholder="例如 gpt-4.1-mini" :required="form.enabled" /></label>
          <label>嵌入模型<input v-model="form.embeddingModel" placeholder="例如 text-embedding-3-small" :required="form.enabled" /></label>
          <label>API 密钥<input v-model="form.apiKey" type="password" :placeholder="form.apiKeyConfigured ? '已保存；留空则不修改' : '输入模型服务密钥'" :required="form.enabled && !form.apiKeyConfigured" autocomplete="new-password" /><small v-if="form.apiKeyConfigured">密钥已安全保存，留空即可保留。</small></label>
          <label>向量维度<input :value="form.embeddingDimension" type="number" disabled /><small>当前知识库固定使用 1536 维。</small></label>
          <label>请求超时（秒）<input v-model.number="form.timeoutSeconds" type="number" min="5" max="120" required /></label>
          <label>召回片段数<input v-model.number="form.topK" type="number" min="2" max="20" required /></label>
        </div>
        <footer><span>保存后立即影响后续文件索引和用户问答。</span><button class="button primary" :disabled="saving">{{ saving ? '正在保存…' : '保存配置' }}</button></footer>
      </form>

      <form class="upload-card" @submit.prevent="upload">
        <header><span class="section-kicker">02 / 导入法规</span><h2>添加法规原文</h2><p>索引会在后台执行。扫描版 PDF 请先完成 OCR。</p></header>
        <label :class="['legal-dropzone', { selected: selectedFile }]">
          <input accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" type="file" required @change="selectFile" />
          <span class="file-mark">法</span><b>{{ selectedFile ? selectedFile.name : '选择法规文件' }}</b><small>{{ selectedFile ? size(selectedFile.size) : '支持 PDF、DOCX、TXT、Markdown，单个文件不超过 300MB。' }}</small><i>{{ selectedFile ? '更换文件' : '选择文件' }}</i>
        </label>
        <label class="upload-title">法规标题（可选）<input v-model="uploadTitle" maxlength="255" placeholder="留空时使用文件名" /></label>
        <footer><span>上传相同内容的文件不会重复建立索引。</span><button class="button primary" :disabled="uploading">{{ uploading ? '正在上传…' : '上传并建立索引' }}</button></footer>
      </form>
    </section>

    <section class="document-library">
      <header>
        <div><span class="section-kicker">03 / 法规资料库</span><h2>已导入文件</h2></div>
        <small>{{ loading ? '正在同步…' : `共 ${documents.length} 份法规文件` }}</small>
      </header>
      <div v-if="loading" class="library-empty">正在读取法规资料库…</div>
      <div v-else-if="documents.length === 0" class="library-empty"><b>还没有法规文件</b><span>先配置模型连接，再从上方导入第一份法规原文。</span></div>
      <div v-else class="document-table-wrap">
        <table class="document-table">
          <thead><tr><th>法规文件</th><th>格式 / 大小</th><th>导入时间</th><th>索引状态</th><th>最近索引</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="document in documents" :key="document.id">
              <td><div class="document-name"><span class="document-icon">{{ document.sourceType === 'PDF' ? 'PDF' : document.sourceType === 'DOCX' ? 'DOCX' : 'TXT' }}</span><div><b>{{ document.title }}</b><small>{{ document.sourceFileName }}</small></div></div></td>
              <td><span class="format-tag">{{ document.sourceType }}</span><small class="file-size">{{ size(document.sizeBytes) }}</small></td>
              <td>{{ date(document.createdAt) }}</td>
              <td><span :class="['document-status', document.status.toLowerCase()]">{{ documentStatus(document) }}</span><small v-if="document.failureMessage" class="failure-reason" :title="document.failureMessage">{{ document.failureMessage }}</small></td>
              <td>{{ date(document.indexedAt) }}</td>
              <td class="document-actions"><button :disabled="activeDocumentId === document.id" @click="reindex(document)">{{ activeDocumentId === document.id ? '处理中…' : '重建索引' }}</button><button class="danger" :disabled="activeDocumentId === document.id" @click="remove(document)">删除</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </AppShell>
</template>

<style scoped>
.knowledge-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
.knowledge-heading h1 { margin: 3px 0 6px; color: #17334a; letter-spacing: -.7px; }
.knowledge-heading p { margin: 0; color: #74879a; }
.refresh-button { border: 1px solid #d9e4eb; border-radius: 8px; background: #fff; padding: 8px 12px; color: #477086; cursor: pointer; font-size: 12px; }
.refresh-button:hover { border-color: #93bdd0; background: #f2fbff; color: #08739c; }
.knowledge-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
.stat-card { display: grid; gap: 7px; min-height: 125px; border: 1px solid #dfe8ee; border-radius: 12px; background: #fff; padding: 18px; box-shadow: 0 9px 23px rgb(23 65 84 / .05); }
.stat-card span, .stat-card small { color: #8094a3; font-size: 12px; }.stat-card b { color: #1e4058; font-size: 24px; letter-spacing: -.5px; }.stat-card.accent { border-color: #b8dfea; background: linear-gradient(135deg, #ebfaff, #fff); }.stat-card.accent b { color: #08769d; }.stat-card.online b { color: #1c8b5c; }
.knowledge-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(310px, .8fr); gap: 20px; margin-bottom: 22px; }
.configuration-card, .upload-card, .document-library { border: 1px solid #dce7ec; border-radius: 13px; background: #fff; box-shadow: 0 14px 32px rgb(23 65 84 / .07); }.configuration-card > header, .upload-card > header, .document-library > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 22px 24px; border-bottom: 1px solid #e5edf1; }.configuration-card h2, .upload-card h2, .document-library h2 { margin: 4px 0 5px; color: #173a50; font-size: 19px; }.configuration-card header p, .upload-card header p { margin: 0; color: #8295a2; font-size: 12px; }.section-kicker { color: #3381a0; font-size: 11px; font-weight: 800; letter-spacing: .09em; }
.switch-field { display: flex; align-items: center; gap: 7px; color: #547184; font-size: 12px; white-space: nowrap; }.switch-field input { position: absolute; opacity: 0; }.switch-field span { position: relative; width: 36px; height: 20px; border-radius: 999px; background: #bdcbd3; transition: .18s ease; }.switch-field span::after { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; content: ''; transition: .18s ease; }.switch-field input:checked + span { background: #169568; }.switch-field input:checked + span::after { transform: translateX(16px); }
.model-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; padding: 22px 24px; }.model-fields label, .upload-title { display: grid; gap: 7px; color: #455f70; font-size: 12px; font-weight: 700; }.model-fields input, .upload-title input { width: 100%; border: 1px solid #d8e4e9; border-radius: 8px; padding: 10px 11px; color: #263f51; outline: 0; }.model-fields input:focus, .upload-title input:focus { border-color: #1682aa; box-shadow: 0 0 0 3px rgb(22 130 170 / .12); }.model-fields input:disabled { background: #f3f7f8; color: #8194a1; }.model-fields small { color: #91a1ab; font-size: 11px; font-weight: 400; }
.configuration-card footer, .upload-card footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid #e5edf1; padding: 15px 24px; color: #879aa6; font-size: 11px; }
.upload-card { display: flex; flex-direction: column; }.legal-dropzone { display: grid; place-items: center; gap: 8px; margin: 22px 24px 15px; min-height: 194px; border: 1px dashed #9dc8d8; border-radius: 10px; background: #f9fdff; color: #537487; text-align: center; cursor: pointer; }.legal-dropzone:hover, .legal-dropzone.selected { border-color: #1685aa; background: #eefaff; }.legal-dropzone input { position: absolute; width: 1px; height: 1px; opacity: 0; }.legal-dropzone b { color: #28506a; font-size: 13px; }.legal-dropzone small { max-width: 250px; color: #8a9da8; font-size: 11px; line-height: 1.55; }.legal-dropzone i { border-radius: 5px; background: #e0f1f6; padding: 5px 9px; color: #137394; font-size: 11px; font-style: normal; font-weight: 700; }.file-mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: #08759b; color: #fff; font-family: Georgia, serif; font-size: 20px; font-weight: 700; }.upload-title { margin: 0 24px 22px; }.upload-card footer { margin-top: auto; }
.document-library > header { align-items: center; }.document-library > header small { color: #8497a3; font-size: 12px; }.document-table-wrap { overflow-x: auto; }.document-table { min-width: 980px; width: 100%; border-collapse: collapse; }.document-table th { background: #f5fafc; color: #698191; font-size: 11px; letter-spacing: .04em; text-align: left; }.document-table th, .document-table td { border-bottom: 1px solid #e7eef2; padding: 14px 18px; }.document-table td { color: #506b7a; font-size: 12px; }.document-table tbody tr:hover { background: #fbfeff; }.document-name { display: flex; align-items: center; gap: 10px; min-width: 205px; }.document-name div { display: grid; gap: 4px; min-width: 0; }.document-name b { overflow: hidden; color: #294b61; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.document-name small, .file-size { color: #91a2ac; font-size: 11px; }.document-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 7px; background: #eaf5f8; color: #237997; font-size: 9px; font-weight: 800; }.format-tag { display: inline-block; border-radius: 4px; background: #f0f5f7; padding: 3px 6px; color: #587280; font-size: 10px; font-weight: 800; }.file-size { margin-left: 6px; }.document-status { display: inline-block; border-radius: 4px; padding: 4px 7px; font-size: 11px; }.document-status.ready { background: #e2f5eb; color: #168352; }.document-status.processing { background: #e3f3f9; color: #187195; }.document-status.failed { background: #fff0ef; color: #c9564e; }.failure-reason { display: block; max-width: 150px; margin-top: 5px; overflow: hidden; color: #c27569; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.document-actions { white-space: nowrap; }.document-actions button { border: 0; border-radius: 5px; background: #e8f4f8; padding: 6px 9px; color: #197092; font-size: 11px; }.document-actions button + button { margin-left: 6px; }.document-actions button.danger { background: #fff1f0; color: #c55a50; }.library-empty { display: grid; place-content: center; gap: 7px; min-height: 180px; color: #8a9ba7; font-size: 12px; text-align: center; }.library-empty b { color: #587484; font-size: 14px; }
@media (max-width: 1120px) { .knowledge-stats { grid-template-columns: repeat(2, 1fr); }.knowledge-grid { grid-template-columns: 1fr; } }
</style>
