<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import NoticeToast from '../components/NoticeToast.vue'
import api from '../lib/api'
type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'INDETERMINATE_CHOICE' | 'SUBJECTIVE'
interface Bank { id: number; name: string }
interface Rule { questionType: QuestionType; selectionMode: 'RANDOM' | 'ALL'; questionCount: number; score: number }
interface EditableRule extends Rule {
  enabled: boolean
}
interface Configuration { id: number; title: string; durationMinutes: number; passingScore: number; totalScore: number; status: 'DRAFT' | 'PUBLISHED'; questionBankIds: number[]; rules: Rule[] }
const banks = ref<Bank[]>([])
const configurations = ref<Configuration[]>([])
const editorOpen = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const error = ref('')
const message = ref('')
const labels: Record<QuestionType, string> = { SINGLE_CHOICE: '单选题', MULTIPLE_CHOICE: '多选题', INDETERMINATE_CHOICE: '不定项', SUBJECTIVE: '主观题' }
const defaultRules = (): EditableRule[] => [
  {
    questionType: 'SINGLE_CHOICE',
    selectionMode: 'RANDOM',
    questionCount: 50,
    score: 1,
    enabled: true,
  },
  {
    questionType: 'MULTIPLE_CHOICE',
    selectionMode: 'RANDOM',
    questionCount: 20,
    score: 2,
    enabled: true,
  },
  {
    questionType: 'INDETERMINATE_CHOICE',
    selectionMode: 'RANDOM',
    questionCount: 10,
    score: 2,
    enabled: true,
  },
  {
    questionType: 'SUBJECTIVE',
    selectionMode: 'RANDOM',
    questionCount: 5,
    score: 10,
    enabled: true,
  },
]
const form = reactive({ title: '', durationMinutes: 120, passingScore: 60, questionBankIds: [] as number[], rules: defaultRules() })
async function load() {
  try {
    const [{ data: bankData }, { data: configData }] = await Promise.all([
      api.get<{ items: Bank[] }>('/api/v1/question-banks', { params: { page: 0, size: 100 } }),
      api.get<Configuration[]>('/api/v1/admin/mock-exam-configurations'),
    ])
    banks.value = bankData.items; configurations.value = configData
  } catch { error.value = '无法读取模拟考试配置' }
}
function openCreate() { editingId.value = null; Object.assign(form, { title: '', durationMinutes: 120, passingScore: 60, questionBankIds: [], rules: defaultRules() }); error.value = ''; editorOpen.value = true }
function openEdit(config: Configuration) {
  editingId.value = config.id
  const rules = defaultRules().map(rule => {
    const saved = config.rules.find(item => item.questionType === rule.questionType)
    return saved ? { ...saved, enabled: true } : { ...rule, enabled: false }
  })
  Object.assign(form, {
    title: config.title,
    durationMinutes: config.durationMinutes,
    passingScore: config.passingScore,
    questionBankIds: [...config.questionBankIds],
    rules,
  })
  error.value = ''
  editorOpen.value = true
}
function toggleAll(rule: Rule) {
  rule.selectionMode = rule.selectionMode === 'ALL' ? 'RANDOM' : 'ALL'
}

function toggleRule(rule: EditableRule) {
  rule.enabled = !rule.enabled
}

async function save() {
  saving.value = true
  error.value = ''
  message.value = ''
  const rules = form.rules
    .filter(rule => rule.enabled)
    .map(rule => ({
      questionType: rule.questionType,
      selectionMode: rule.selectionMode,
      questionCount: rule.questionCount,
      score: rule.score,
    }))
  if (rules.length === 0) {
    saving.value = false
    error.value = '请至少启用一种题型'
    return
  }
  const payload = { ...form, rules }
  try {
    if (editingId.value === null) await api.put('/api/v1/admin/mock-exam-configuration', payload)
    else await api.put(`/api/v1/admin/mock-exam-configurations/${editingId.value}`, payload)
    editorOpen.value = false
    message.value = '模拟考试参数已保存。'
    await load()
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '保存失败，请检查参数与题库题量'
  } finally {
    saving.value = false
  }
}
async function operate(config: Configuration, action: 'activate' | 'deactivate', success: string) {
  saving.value = true; error.value = ''; message.value = ''
  try { await api.post(`/api/v1/admin/mock-exam-configurations/${config.id}/${action}`); message.value = success; await load() }
  catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '操作失败' }
  finally { saving.value = false }
}
async function remove(config: Configuration) {
  if (!window.confirm(`确定删除“${config.title}”吗？`)) return
  saving.value = true; error.value = ''; message.value = ''
  try { await api.delete(`/api/v1/admin/mock-exam-configurations/${config.id}`); message.value = '模拟考试参数已删除。'; await load() }
  catch (reason: any) { error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '删除失败' }
  finally { saving.value = false }
}
onMounted(load)
</script>

<template>
  <AppShell>
    <NoticeToast :message="error" @dismiss="error = ''" />
    <NoticeToast :message="message" type="success" @dismiss="message = ''" />
    <div class="page-heading config-heading"><div><h1>模拟考试</h1><p>保存多套考试参数，并选择一套供用户端持续使用。</p></div><button class="button primary" @click="openCreate">添加新的模拟考试</button></div>
    <section class="surface config-list"><div class="table-scroll"><table><thead><tr><th>名称</th><th>时长</th><th>总分 / 及格分</th><th>题型规则</th><th>状态</th><th class="actions">操作</th></tr></thead><tbody><tr v-if="configurations.length === 0"><td class="empty-state" colspan="6">还没有模拟考试参数。</td></tr><tr v-for="config in configurations" :key="config.id"><td><b>{{ config.title }}</b></td><td>{{ config.durationMinutes }} 分钟</td><td>{{ config.totalScore }} / {{ config.passingScore }}</td><td class="rule-summary">{{ config.rules.map(rule => `${labels[rule.questionType]} ${rule.selectionMode === 'ALL' ? '全部' : `${rule.questionCount} 道`}`).join(' · ') }}</td><td><span :class="['status-pill', config.status === 'PUBLISHED' ? 'active' : 'disabled']"><i />{{ config.status === 'PUBLISHED' ? '已启用' : '未启用' }}</span></td><td class="actions"><button @click="openEdit(config)">编辑</button><button v-if="config.status === 'PUBLISHED'" :disabled="saving" @click="operate(config, 'deactivate', '已停用该模拟考试参数。')">停用</button><button v-else :disabled="saving" @click="operate(config, 'activate', '已启用该模拟考试参数。')">启用</button><button class="danger" :disabled="saving" @click="remove(config)">删除</button></td></tr></tbody></table></div></section>
    <div v-if="editorOpen" class="modal-backdrop config-modal-backdrop" @click.self="editorOpen = false">
      <section class="config-editor" role="dialog" aria-modal="true">
        <header class="config-editor-header">
          <div class="editor-heading">
            <span class="editor-icon">✦</span>
            <div>
              <span class="eyebrow">模拟考试参数</span>
              <h2>{{ editingId === null ? '添加新的模拟考试' : '编辑模拟考试' }}</h2>
              <p>设置完成后，可在列表中选择一套供用户持续练习。</p>
            </div>
          </div>
          <button class="icon-button close-editor" type="button" aria-label="关闭" @click="editorOpen = false">
            ×
          </button>
        </header>
        <form @submit.prevent="save">
          <section class="form-section basic-section">
            <div class="section-heading">
              <span>01</span>
              <div><h3>考试信息</h3><p>为这套模拟卷取一个便于识别的名称。</p></div>
            </div>
            <label class="exam-name-field">
              名称
              <input v-model.trim="form.title" placeholder="例如：冲刺模拟卷" required />
            </label>
            <div class="config-basics">
              <label><span>考试时长</span><div class="input-with-unit"><input v-model.number="form.durationMinutes" min="1" type="number" required /><em>分钟</em></div></label>
              <label><span>及格分</span><div class="input-with-unit"><input v-model.number="form.passingScore" min="0" step="0.5" type="number" required /><em>分</em></div></label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <span>02</span>
              <div><h3>适用题库</h3><p>选择用于随机组卷的题库，可多选。</p></div>
            </div>
            <div class="bank-options">
              <label
                v-for="bank in banks"
                :key="bank.id"
                class="bank-choice"
                :class="{ selected: form.questionBankIds.includes(bank.id) }"
              >
                <input v-model="form.questionBankIds" :value="bank.id" type="checkbox" />
                <i>✓</i><span>{{ bank.name }}</span>
              </label>
              <p v-if="banks.length === 0" class="empty-banks">暂无可用题库，请先创建并导入题目。</p>
            </div>
          </section>

          <section class="form-section question-section">
            <div class="section-heading">
              <span>03</span>
              <div><h3>题型与分值</h3><p>设置各题型抽取数量及每题分值。</p></div>
            </div>
            <div class="rule-list">
              <div v-for="rule in form.rules" :key="rule.questionType" :class="['rule-row', { disabled: !rule.enabled }]">
                <div class="rule-type">
                  <span>{{ labels[rule.questionType].slice(0, 2) }}</span><b>{{ labels[rule.questionType] }}</b>
                </div>
                <button class="rule-enable-toggle" type="button" :aria-pressed="rule.enabled" @click="toggleRule(rule)">
                  <i />{{ rule.enabled ? '已启用' : '未启用' }}
                </button>
                <template v-if="rule.enabled">
                  <label v-if="rule.questionType === 'SINGLE_CHOICE' || rule.questionType === 'MULTIPLE_CHOICE'" class="all-toggle">
                    <input :checked="rule.selectionMode === 'ALL'" type="checkbox" @change="toggleAll(rule)" /><i />纳入全部
                  </label>
                  <span v-else class="toggle-placeholder" />
                  <label class="number-field"><span>数量</span><input v-model.number="rule.questionCount" :disabled="rule.selectionMode === 'ALL'" min="1" type="number" required /></label>
                  <label class="number-field"><span>每题分数</span><input v-model.number="rule.score" min="0.5" step="0.5" type="number" required /></label>
                </template>
                <p v-else class="rule-disabled-hint">此题型不参与本次模拟考试</p>
              </div>
            </div>
          </section>

          <footer>
            <p>保存后默认为未启用，可随时在列表中切换。</p>
            <div>
              <button class="button secondary" type="button" :disabled="saving" @click="editorOpen = false">取消</button>
              <button class="button primary" :disabled="saving">{{ saving ? '保存中…' : '保存模拟考试' }}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.config-heading { align-items: center; }
.config-list { overflow: hidden; }
.rule-summary { max-width: 340px; overflow: hidden; color: #718099; font-size: 12px; text-overflow: ellipsis; }
.config-modal-backdrop { padding: 24px; background: rgb(12 23 43 / .48); backdrop-filter: blur(7px); }
.config-editor { width: min(820px, 100%); max-height: calc(100vh - 48px); overflow: auto; border: 1px solid rgb(221 229 242 / .9); border-radius: 20px; background: #fff; box-shadow: 0 28px 90px rgb(11 25 51 / .32); }
.config-editor-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 29px 34px 26px; border-bottom: 1px solid #eaf0f8; background: radial-gradient(circle at 18% 0, #eaf2ff 0, transparent 34%), linear-gradient(120deg, #f8fbff, #fff 68%); }
.editor-heading { display: flex; align-items: flex-start; gap: 14px; }
.editor-icon { display: grid; flex: 0 0 auto; place-items: center; width: 42px; height: 42px; border-radius: 13px; background: linear-gradient(145deg, #3474ec, #2355c5); box-shadow: 0 8px 18px rgb(42 101 218 / .25); color: #fff; font-size: 19px; }
.config-editor-header h2 { margin: 5px 0 6px; color: #172844; font-size: 23px; letter-spacing: -.65px; }
.config-editor-header p { margin: 0; color: #8290a5; font-size: 13px; }
.close-editor { display: grid; place-items: center; width: 32px; height: 32px; margin: -5px -8px 0 0; border-radius: 9px; color: #708099; transition: .16s ease; }
.close-editor:hover { background: #edf3fc; color: #355fba; }
.config-editor form { padding: 5px 34px 0; }
.form-section { padding: 24px 0; border-bottom: 1px solid #e9eef6; }
.section-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 17px; }
.section-heading > span { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 8px; background: #ebf2ff; color: #2864d8; font-size: 10px; font-weight: 800; }
.section-heading h3 { margin: 0; color: #2b3a55; font-size: 14px; }
.section-heading p { margin: 3px 0 0; color: #8996a9; font-size: 12px; }
.config-editor label { display: block; color: #495973; font-size: 12px; font-weight: 700; }
.config-editor input { color: #2d3b55; font: inherit; outline: none; }
.exam-name-field > input, .number-field input { box-sizing: border-box; width: 100%; height: 42px; margin-top: 8px; padding: 0 12px; border: 1px solid #dce5f1; border-radius: 8px; background: #fff; transition: .16s ease; }
.exam-name-field > input { font-size: 14px; }
.config-editor input:focus { border-color: #3672e5; box-shadow: 0 0 0 3px #e8f0ff; }
.config-basics { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 15px; }
.config-basics > label { padding: 13px 14px; border: 1px solid #e3eaf4; border-radius: 10px; background: #fbfcff; }
.input-with-unit { display: flex; align-items: center; margin-top: 8px; border-bottom: 1px solid #d7e1ef; }
.input-with-unit:focus-within { border-color: #3672e5; }
.input-with-unit input { min-width: 0; flex: 1; height: 28px; padding: 0; border: 0; background: transparent; font-size: 17px; font-weight: 700; }
.input-with-unit input:focus { box-shadow: none; }
.input-with-unit em { color: #8c99aa; font-size: 12px; font-style: normal; font-weight: 500; }
.bank-options { display: flex; flex-wrap: wrap; gap: 9px; }
.bank-choice { position: relative; display: inline-flex !important; align-items: center; gap: 7px; min-height: 36px; margin: 0 !important; padding: 0 12px; border: 1px solid #dfe7f2; border-radius: 9px; background: #fff; color: #65748b !important; cursor: pointer; font-weight: 600 !important; transition: .16s ease; }
.bank-choice:hover { border-color: #afc8f4; background: #f8fbff; }
.bank-choice.selected { border-color: #5082e4; background: #f1f6ff; color: #295ec7 !important; box-shadow: 0 0 0 2px rgb(62 116 225 / .08); }
.bank-choice input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.bank-choice i { display: grid; place-items: center; width: 15px; height: 15px; border: 1px solid #bdc9da; border-radius: 5px; color: transparent; font-size: 10px; font-style: normal; line-height: 1; transition: .16s ease; }
.bank-choice.selected i { border-color: #316be0; background: #316be0; color: #fff; }
.empty-banks { margin: 0; color: #99a5b5; font-size: 12px; }
.question-section { padding-bottom: 25px; border-bottom: 0; }
.rule-list { overflow: hidden; border: 1px solid #e1e8f2; border-radius: 12px; }
.rule-row { display: grid; grid-template-columns: 138px 76px 112px 1fr 1fr; align-items: center; gap: 14px; min-height: 71px; padding: 0 16px; border-bottom: 1px solid #e9eef5; }
.rule-row:last-child { border-bottom: 0; }
.rule-row:nth-child(odd) { background: #fcfdff; }
.rule-row.disabled { min-height: 58px; background: #fafbfd; }
.rule-type { display: flex; align-items: center; gap: 9px; }
.rule-type > span { display: grid; place-items: center; width: 29px; height: 29px; border-radius: 8px; background: #edf3fd; color: #5370aa; font-size: 10px; font-weight: 800; }
.rule-type b { color: #33445f; font-size: 13px; }
.rule-row.disabled .rule-type { opacity: .58; }
.rule-enable-toggle { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: transparent; color: #2f6cde; font-size: 12px; font-weight: 700; white-space: nowrap; }
.rule-enable-toggle i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.rule-row.disabled .rule-enable-toggle { color: #8b99ac; }
.rule-disabled-hint { grid-column: span 3; margin: 0; color: #96a2b3; font-size: 12px; }
.all-toggle { display: inline-flex !important; align-items: center; gap: 7px; color: #6d7d93 !important; cursor: pointer; font-weight: 600 !important; }
.all-toggle input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.all-toggle i { width: 28px; height: 17px; border-radius: 999px; background: #cbd5e3; transition: .16s ease; }
.all-toggle i::after { display: block; width: 13px; height: 13px; margin: 2px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgb(41 58 86 / .18); content: ''; transition: .16s ease; }
.all-toggle input:checked + i { background: #3572e5; }
.all-toggle input:checked + i::after { transform: translateX(11px); }
.number-field { display: flex !important; align-items: center; gap: 8px; color: #8390a3 !important; font-weight: 600 !important; }
.number-field input { width: 82px; height: 33px; margin: 0; padding: 0 8px; border-radius: 7px; text-align: center; font-weight: 700; }
.number-field input:disabled { border-color: #e8edf4; background: #f4f6f9; color: #a4afbd; }
.config-editor footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 -34px; padding: 18px 34px; border-top: 1px solid #e8eef6; background: #fbfcff; }
.config-editor footer p { margin: 0; color: #8c98aa; font-size: 12px; }
.config-editor footer > div { display: flex; gap: 9px; }
@media (max-width: 650px) { .config-modal-backdrop { padding: 12px; }.config-editor { max-height: calc(100vh - 24px); border-radius: 15px; }.config-editor-header, .config-editor form { padding-right: 20px; padding-left: 20px; }.config-editor-header { padding-top: 22px; padding-bottom: 20px; }.editor-icon { display: none; }.config-basics { grid-template-columns: 1fr; }.rule-row { grid-template-columns: 1fr 1fr; gap: 9px; padding: 13px; }.rule-type { grid-column: span 2; }.rule-enable-toggle { grid-column: span 2; }.toggle-placeholder { display: none; }.rule-disabled-hint { grid-column: span 2; }.config-editor footer { flex-direction: column; align-items: stretch; margin: 0 -20px; padding: 16px 20px; }.config-editor footer p { text-align: center; }.config-editor footer > div { justify-content: flex-end; } }
</style>
