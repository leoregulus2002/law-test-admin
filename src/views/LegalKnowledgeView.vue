<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import NoticeToast from '../components/NoticeToast.vue'
import api from '../lib/api'
import { authState } from '../lib/auth'
import type { LegalKnowledgeDocument, OfficialLawSummary } from '../types/api'

const documents = ref<LegalKnowledgeDocument[]>([])
const officialLaws = ref<OfficialLawSummary[]>([])
const loading = ref(false)
const uploading = ref(false)
const activeDocumentId = ref<number | null>(null)
const selectedFile = ref<File | null>(null)
const uploadTitle = ref('')
const error = ref('')
const message = ref('')
const retryingOfficialChunks = ref(false)
const progressStreams = new Map<number, AbortController>()

const readyDocuments = computed(() => documents.value.filter((document) => document.status === 'READY').length)
const processingDocuments = computed(() => documents.value.filter((document) => document.status === 'PROCESSING').length)
const failedDocuments = computed(() => documents.value.filter((document) => document.status === 'FAILED').length)
const officialChunkCounts = computed(() => officialLaws.value.reduce((totals, law) => ({
  pending: totals.pending + law.pendingChunkCount,
  processing: totals.processing + law.processingChunkCount,
  ready: totals.ready + law.readyChunkCount,
  failed: totals.failed + law.failedChunkCount,
}), { pending: 0, processing: 0, ready: 0, failed: 0 }))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [documentsResponse, officialLawsResponse] = await Promise.all([
      api.get<LegalKnowledgeDocument[]>('/api/v1/admin/legal-knowledge/documents'),
      api.get<OfficialLawSummary[]>('/api/v1/admin/legal-knowledge/laws'),
    ])
    documents.value = documentsResponse.data
    officialLaws.value = officialLawsResponse.data
    syncProgressStreams()
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '无法读取法规资料库'
  } finally {
    loading.value = false
  }
}

function syncProgressStreams() {
  const processingIds = new Set(documents.value.filter((document) => document.status === 'PROCESSING').map((document) => document.id))
  for (const [documentId, controller] of progressStreams) {
    if (!processingIds.has(documentId)) controller.abort()
  }
  for (const documentId of processingIds) openIndexProgressStream(documentId)
}

async function openIndexProgressStream(documentId: number) {
  if (progressStreams.has(documentId)) return
  const controller = new AbortController()
  progressStreams.set(documentId, controller)
  try {
    const token = authState.session?.accessToken
    const response = await fetch(`${api.defaults.baseURL}/api/v1/admin/legal-knowledge/documents/${documentId}/index-progress/stream`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
    if (!response.ok || !response.body) return
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    while (!controller.signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      const events = pending.split(/\r?\n\r?\n/)
      pending = events.pop() ?? ''
      for (const event of events) applyIndexProgress(event, documentId)
    }
  } catch (reason: any) {
    if (reason?.name !== 'AbortError') return
  } finally {
    if (progressStreams.get(documentId) === controller) progressStreams.delete(documentId)
  }
}

function applyIndexProgress(event: string, documentId: number) {
  const raw = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
  if (!raw) return
  try {
    const progress = JSON.parse(raw) as Pick<LegalKnowledgeDocument, 'status' | 'totalChunkCount' | 'indexedChunkCount' | 'failureMessage'>
    const document = documents.value.find((item) => item.id === documentId)
    if (!document) return
    document.status = progress.status
    document.totalChunkCount = progress.totalChunkCount
    document.indexedChunkCount = progress.indexedChunkCount
    document.failureMessage = progress.failureMessage
    if (document.status !== 'PROCESSING') progressStreams.get(documentId)?.abort()
  } catch {
    // 忽略无法解析的 SSE 心跳或被代理改写的消息。
  }
}

async function retryOfficialChunks() {
  retryingOfficialChunks.value = true
  error.value = ''
  try {
    const response = await api.post<{ requeuedChunkCount: number }>('/api/v1/admin/legal-knowledge/laws/chunks/retry-failed')
    message.value = `已将 ${response.data.requeuedChunkCount} 个失败的官方法条 Chunk 重新排队。`
    await load()
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '重新排队官方法条失败'
  } finally {
    retryingOfficialChunks.value = false
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

function progressPercent(document: LegalKnowledgeDocument) {
  if (document.totalChunkCount <= 0) return 0
  return Math.min(100, Math.round(document.indexedChunkCount / document.totalChunkCount * 100))
}

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
}

onMounted(load)
onBeforeUnmount(() => progressStreams.forEach((controller) => controller.abort()))
</script>

<template>
  <AppShell>
    <NoticeToast :message="error" @dismiss="error = ''" />
    <NoticeToast :message="message" type="success" @dismiss="message = ''" />
    <header class="knowledge-heading">
      <div><span class="eyebrow">Knowledge base / Legal AI</span><h1>法律智库</h1><p>导入法规原文、追踪索引任务，并维护可供法律问答检索的资料库。</p></div>
      <button class="refresh-button" :disabled="loading" @click="load">↻ 刷新数据</button>
    </header>
    <section class="knowledge-stats" aria-label="知识库概况">
      <article class="stat-card accent"><span>可问答法规</span><b>{{ String(readyDocuments).padStart(2, '0') }}</b><small>已完成解析与索引</small></article>
      <article class="stat-card"><span>正在处理</span><b>{{ String(processingDocuments).padStart(2, '0') }}</b><small>后台异步建立索引</small></article>
      <article class="stat-card"><span>需要处理</span><b>{{ String(failedDocuments).padStart(2, '0') }}</b><small>可查看失败原因后重试</small></article>
    </section>
    <section class="official-law-library">
      <header><div><span class="section-kicker">Official law corpus</span><h2>官方法律库</h2><p>采集器写入的版本化正式法律条文；只有“已完成” Chunk 可参与向量检索。</p></div><button class="button primary" :disabled="retryingOfficialChunks || officialChunkCounts.failed === 0" @click="retryOfficialChunks">{{ retryingOfficialChunks ? '正在重新排队…' : '重试失败向量化' }}</button></header>
      <div class="official-law-stats"><article><span>法律版本</span><b>{{ officialLaws.reduce((total, law) => total + law.versionCount, 0) }}</b></article><article><span>待处理 / 处理中</span><b>{{ officialChunkCounts.pending }} / {{ officialChunkCounts.processing }}</b></article><article class="ready"><span>已完成向量化</span><b>{{ officialChunkCounts.ready }}</b></article><article class="failed"><span>向量化失败</span><b>{{ officialChunkCounts.failed }}</b></article></div>
      <div v-if="officialLaws.length === 0" class="official-law-empty">尚未采集官方法律。采集器完成正文与条文解析后，这里会显示向量化进度。</div>
      <div v-else class="document-table-wrap"><table class="document-table official-law-table"><thead><tr><th>正式法律</th><th>类型 / 效力状态</th><th>版本 / 条文</th><th>向量化状态</th><th>最近完成</th></tr></thead><tbody><tr v-for="law in officialLaws" :key="law.documentId"><td><div class="document-name"><span class="document-icon">法</span><div><b>{{ law.title }}</b><small>{{ law.authority || law.sourceName }}</small></div></div></td><td><span class="format-tag">{{ law.documentType }}</span><small class="file-size">{{ law.currentStatus }}</small></td><td>{{ law.versionCount }} 个版本 / {{ law.articleCount }} 条</td><td><span class="document-status ready">已完成 {{ law.readyChunkCount }}</span><small class="official-status-detail">待处理 {{ law.pendingChunkCount }} · 处理中 {{ law.processingChunkCount }} · 失败 {{ law.failedChunkCount }}</small></td><td>{{ date(law.lastEmbeddingCompletedAt) }}</td></tr></tbody></table></div>
    </section>
    <section class="library-workbench">
      <form class="upload-card" @submit.prevent="upload">
        <header><div><span class="section-kicker">导入法规</span><h2>添加法规原文</h2><p>模型连接请在“系统配置 / 法律智库”中维护。</p></div></header>
        <label :class="['legal-dropzone', { selected: selectedFile }]">
          <input accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" type="file" required @change="selectFile" />
          <span class="file-mark">法</span><b>{{ selectedFile ? selectedFile.name : '选择法规文件' }}</b><small>{{ selectedFile ? size(selectedFile.size) : '支持 PDF、DOCX、TXT、Markdown，单个文件不超过 300MB。' }}</small><i>{{ selectedFile ? '更换文件' : '选择文件' }}</i>
        </label>
        <label class="upload-title">法规标题（可选）<input v-model="uploadTitle" maxlength="255" placeholder="留空时使用文件名" /></label>
        <footer><span>上传相同内容的文件不会重复建立索引。</span><button class="button primary" :disabled="uploading">{{ uploading ? '正在上传…' : '上传并建立索引' }}</button></footer>
      </form>
      <aside class="library-guide"><span class="section-kicker">索引说明</span><h2>先配置，后导入</h2><p>文件索引会调用系统配置中的嵌入服务。若模型尚未配置，任务将标记失败，可在完成配置后重建索引。</p><ol><li><i>01</i><span><b>配置服务</b><small>在系统配置中填写问答与嵌入模型。</small></span></li><li><i>02</i><span><b>导入原文</b><small>使用可复制文本的法规文件。</small></span></li><li><i>03</i><span><b>观察状态</b><small>完成索引后即可用于客户端问答。</small></span></li></ol></aside>
    </section>
    <section class="document-library">
      <header><div><span class="section-kicker">法规资料库</span><h2>已导入文件</h2></div><small>{{ loading ? '正在同步…' : `共 ${documents.length} 份法规文件` }}</small></header>
      <div v-if="loading" class="library-empty">正在读取法规资料库…</div>
      <div v-else-if="documents.length === 0" class="library-empty"><b>还没有法规文件</b><span>先在系统配置中设置模型，再从上方导入第一份法规原文。</span></div>
      <div v-else class="document-table-wrap"><table class="document-table"><thead><tr><th>法规文件</th><th>格式 / 大小</th><th>导入时间</th><th>索引状态</th><th>最近索引</th><th>操作</th></tr></thead><tbody><tr v-for="document in documents" :key="document.id"><td><div class="document-name"><span class="document-icon">{{ document.sourceType === 'PDF' ? 'PDF' : document.sourceType === 'DOCX' ? 'DOCX' : 'TXT' }}</span><div><b>{{ document.title }}</b><small>{{ document.sourceFileName }}</small></div></div></td><td><span class="format-tag">{{ document.sourceType }}</span><small class="file-size">{{ size(document.sizeBytes) }}</small></td><td>{{ date(document.createdAt) }}</td><td><span :class="['document-status', document.status.toLowerCase()]">{{ documentStatus(document) }}</span><div v-if="document.status === 'PROCESSING'" class="index-progress"><small>{{ document.totalChunkCount > 0 ? `${document.indexedChunkCount} / ${document.totalChunkCount} 条` : '正在解析文件…' }}</small><span><i :style="{ width: `${progressPercent(document)}%` }"></i></span></div><details v-if="document.failureMessage" class="failure-reason"><summary>查看完整失败原因</summary><pre>{{ document.failureMessage }}</pre></details></td><td>{{ date(document.indexedAt) }}</td><td class="document-actions"><button :disabled="activeDocumentId === document.id" @click="reindex(document)">{{ activeDocumentId === document.id ? '处理中…' : '重建索引' }}</button><button class="danger" :disabled="activeDocumentId === document.id" @click="remove(document)">删除</button></td></tr></tbody></table></div>
    </section>
  </AppShell>
</template>

<style scoped>
.knowledge-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 28px; }.knowledge-heading h1 { margin: 3px 0 6px; color: #17334a; letter-spacing: -.7px; }.knowledge-heading p { margin: 0; color: #74879a; }.refresh-button { border: 1px solid #d9e4eb; border-radius: 8px; background: #fff; padding: 8px 12px; color: #477086; cursor: pointer; font-size: 12px; }.refresh-button:hover { border-color: #93bdd0; background: #f2fbff; color: #08739c; }
.knowledge-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; }.stat-card { display: grid; gap: 7px; min-height: 120px; border: 1px solid #dfe8ee; border-radius: 12px; background: #fff; padding: 18px; box-shadow: 0 9px 23px rgb(23 65 84 / .05); }.stat-card span, .stat-card small { color: #8094a3; font-size: 12px; }.stat-card b { color: #1e4058; font-size: 24px; }.stat-card.accent { border-color: #b8dfea; background: linear-gradient(135deg, #ebfaff, #fff); }.stat-card.accent b { color: #08769d; }
.library-workbench { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(290px, .8fr); gap: 20px; margin-bottom: 22px; }.upload-card, .library-guide, .document-library, .official-law-library { border: 1px solid #dce7ec; border-radius: 13px; background: #fff; box-shadow: 0 14px 32px rgb(23 65 84 / .07); }.upload-card > header, .document-library > header { padding: 22px 24px; border-bottom: 1px solid #e5edf1; }.upload-card h2, .library-guide h2, .document-library h2, .official-law-library h2 { margin: 4px 0 5px; color: #173a50; font-size: 19px; }.upload-card p, .library-guide p, .official-law-library p { margin: 0; color: #8295a2; font-size: 12px; }.section-kicker { color: #3381a0; font-size: 11px; font-weight: 800; letter-spacing: .09em; }
.legal-dropzone { display: grid; place-items: center; gap: 8px; margin: 22px 24px 15px; min-height: 178px; border: 1px dashed #9dc8d8; border-radius: 10px; background: #f9fdff; color: #537487; text-align: center; cursor: pointer; }.legal-dropzone:hover, .legal-dropzone.selected { border-color: #1685aa; background: #eefaff; }.legal-dropzone input { position: absolute; width: 1px; height: 1px; opacity: 0; }.legal-dropzone b { color: #28506a; font-size: 13px; }.legal-dropzone small { max-width: 250px; color: #8a9da8; font-size: 11px; line-height: 1.55; }.legal-dropzone i { border-radius: 5px; background: #e0f1f6; padding: 5px 9px; color: #137394; font-size: 11px; font-style: normal; font-weight: 700; }.file-mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: #08759b; color: #fff; font-family: Georgia, serif; font-size: 20px; font-weight: 700; }.upload-title { display: grid; gap: 7px; margin: 0 24px 22px; color: #455f70; font-size: 12px; font-weight: 700; }.upload-title input { width: 100%; border: 1px solid #d8e4e9; border-radius: 8px; padding: 10px 11px; color: #263f51; outline: 0; }.upload-card footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid #e5edf1; padding: 15px 24px; color: #879aa6; font-size: 11px; }.library-guide { padding: 24px; background: linear-gradient(145deg, #f0faff, #fff); }.library-guide ol { display: grid; gap: 17px; margin: 23px 0 0; padding: 0; list-style: none; }.library-guide li { display: flex; gap: 10px; }.library-guide i { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #d5eef6; color: #137292; font-size: 10px; font-style: normal; font-weight: 800; }.library-guide li span { display: grid; gap: 3px; }.library-guide li b { color: #3b5a6d; font-size: 12px; }.library-guide li small { color: #8599a5; font-size: 11px; }
.document-library > header { display: flex; align-items: center; justify-content: space-between; }.document-library > header small { color: #8497a3; font-size: 12px; }.document-table-wrap { overflow-x: auto; }.document-table { min-width: 980px; width: 100%; border-collapse: collapse; }.document-table th { background: #f5fafc; color: #698191; font-size: 11px; letter-spacing: .04em; text-align: left; }.document-table th, .document-table td { border-bottom: 1px solid #e7eef2; padding: 14px 18px; }.document-table td { color: #506b7a; font-size: 12px; }.document-table tbody tr:hover { background: #fbfeff; }.document-name { display: flex; align-items: center; gap: 10px; min-width: 205px; }.document-name div { display: grid; gap: 4px; min-width: 0; }.document-name b { overflow: hidden; color: #294b61; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.document-name small, .file-size { color: #91a2ac; font-size: 11px; }.document-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 7px; background: #eaf5f8; color: #237997; font-size: 9px; font-weight: 800; }.format-tag { display: inline-block; border-radius: 4px; background: #f0f5f7; padding: 3px 6px; color: #587280; font-size: 10px; font-weight: 800; }.file-size { margin-left: 6px; }.document-status { display: inline-block; border-radius: 4px; padding: 4px 7px; font-size: 11px; }.document-status.ready { background: #e2f5eb; color: #168352; }.document-status.processing { background: #e3f3f9; color: #187195; font-size: 11px; }.document-status.failed { background: #fff0ef; color: #c9564e; }.index-progress { display: grid; gap: 4px; margin-top: 6px; min-width: 142px; }.index-progress small { color: #4d859c; font-size: 10px; }.index-progress span { display: block; height: 4px; overflow: hidden; border-radius: 999px; background: #dcecf2; }.index-progress i { display: block; height: 100%; border-radius: inherit; background: #1685aa; transition: width .2s ease; }.failure-reason { display: block; margin-top: 6px; color: #b25850; font-size: 11px; }.failure-reason summary { width: fit-content; cursor: pointer; color: #b25850; text-decoration: underline; text-underline-offset: 2px; }.failure-reason pre { max-width: 560px; max-height: 260px; overflow: auto; margin: 8px 0 0; border: 1px solid #f0d6d3; border-radius: 6px; background: #fff7f6; padding: 9px; color: #814740; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 10px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }.document-actions { white-space: nowrap; }.document-actions button { border: 0; border-radius: 5px; background: #e8f4f8; padding: 6px 9px; color: #197092; font-size: 11px; }.document-actions button + button { margin-left: 6px; }.document-actions button.danger { background: #fff1f0; color: #c55a50; }.library-empty { display: grid; place-content: center; gap: 7px; min-height: 180px; color: #8a9ba7; font-size: 12px; text-align: center; }.library-empty b { color: #587484; font-size: 14px; }@media (max-width: 1120px) { .knowledge-stats { grid-template-columns: 1fr; }.library-workbench { grid-template-columns: 1fr; } }
.official-law-library { margin-bottom: 22px; overflow: hidden; }.official-law-library > header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 24px; border-bottom: 1px solid #e5edf1; }.official-law-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #e7eef2; }.official-law-stats article { display: grid; gap: 5px; padding: 16px 20px; background: #fbfdfe; }.official-law-stats span, .official-law-stats small { color: #8297a4; font-size: 11px; }.official-law-stats b { color: #35566a; font-size: 19px; }.official-law-stats .ready b { color: #168352; }.official-law-stats .failed b { color: #c9564e; }.official-law-empty { padding: 30px 24px; color: #8396a2; font-size: 12px; }.official-status-detail { display: block; margin-top: 5px; color: #8094a1; font-size: 10px; }.official-law-table { min-width: 850px; }@media (max-width: 1120px) { .official-law-stats { grid-template-columns: repeat(2, 1fr); } }
</style>
