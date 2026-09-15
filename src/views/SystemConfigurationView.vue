<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AppShell from '../components/AppShell.vue'
import NoticeToast from '../components/NoticeToast.vue'
import api from '../lib/api'

interface SystemConfiguration {
  key: string
  name: string
  description: string
  enabled?: boolean
  baseUrl?: string
  apiKeyConfigured?: boolean
  model?: string
  timeoutSeconds?: number
  passwordFailureLimit?: number
  passwordFailureWindow?: string
  passwordLockDuration?: string
  accountLimit?: number
  ipLimit?: number
  rateWindow?: string
}

const configurations = ref<SystemConfiguration[]>([])
const loading = ref(false)
const saving = ref(false)
const editorOpen = ref(false)
const error = ref('')
const message = ref('')
const keyword = ref('')
const selectedKey = ref('openapi')
const editingParameterKey = ref<string | null>(null)
const form = reactive({
  key: '',
  enabled: false,
  baseUrl: '',
  apiKey: '',
  apiKeyConfigured: false,
  model: '',
  timeoutSeconds: 45,
  passwordFailureLimit: 5,
  passwordFailureWindow: 'PT15M',
  passwordLockDuration: 'PT15M',
  accountLimit: 20,
  ipLimit: 100,
  rateWindow: 'PT1M',
})

const filteredConfigurations = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return configurations.value
  return configurations.value.filter((configuration) =>
    [configuration.key, configuration.name, configuration.description]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
})

const selectedConfiguration = computed(
  () => configurations.value.find((configuration) => configuration.key === selectedKey.value) ?? null,
)

const parameters = computed(() => {
  const configuration = selectedConfiguration.value
  if (!configuration) return []
  if (configuration.key === 'login-protection') {
    return [
      { label: '密码失败上限', key: 'passwordFailureLimit', value: `${configuration.passwordFailureLimit} 次`, state: 'configured' },
      { label: '密码失败窗口', key: 'passwordFailureWindow', value: formatDuration(configuration.passwordFailureWindow), state: 'configured' },
      { label: '账户登录上限', key: 'accountLimit', value: `${configuration.accountLimit} 次`, state: 'configured' },
      { label: 'IP 登录上限', key: 'ipLimit', value: `${configuration.ipLimit} 次`, state: 'configured' },
      { label: '登录限流窗口', key: 'rateWindow', value: formatDuration(configuration.rateWindow), state: 'configured' },
      { label: '密码锁定时长', key: 'passwordLockDuration', value: formatDuration(configuration.passwordLockDuration), state: 'configured' },
    ]
  }
  return [
    {
      label: '模型评分状态',
      key: 'enabled',
      value: configuration.enabled ? '已启用' : '未启用',
      state: configuration.enabled ? 'enabled' : 'empty',
    },
    {
      label: '接口地址',
      key: 'baseUrl',
      value: configuration.baseUrl || '未配置',
      state: configuration.baseUrl ? 'configured' : 'empty',
    },
    {
      label: 'API 密钥',
      key: 'apiKey',
      value: configuration.apiKeyConfigured ? '已安全保存' : '未配置',
      state: configuration.apiKeyConfigured ? 'configured' : 'empty',
    },
    {
      label: '模型名称',
      key: 'model',
      value: configuration.model || '未配置',
      state: configuration.model ? 'configured' : 'empty',
    },
    {
      label: '评分超时',
      key: 'timeoutSeconds',
      value: `${configuration.timeoutSeconds} 秒`,
      state: 'configured',
    },
  ]
})

function formatDuration(value?: string) {
  if (!value) return '未配置'
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return value
  const [, hours, minutes, seconds] = match
  return [hours && `${hours} 小时`, minutes && `${minutes} 分钟`, seconds && `${seconds} 秒`]
    .filter(Boolean)
    .join(' ') || '0 秒'
}

const editingParameter = computed(
  () => parameters.value.find((parameter) => parameter.key === editingParameterKey.value) ?? null,
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    configurations.value = (await api.get<SystemConfiguration[]>('/api/v1/admin/system-configurations')).data
    if (!selectedConfiguration.value && configurations.value.length) selectedKey.value = configurations.value[0].key
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '无法读取系统配置'
  } finally {
    loading.value = false
  }
}

function openEditor(configuration: SystemConfiguration, parameterKey: string | null = null) {
  selectedKey.value = configuration.key
  editingParameterKey.value = parameterKey
  Object.assign(form, {
    key: configuration.key,
    enabled: configuration.enabled ?? false,
    baseUrl: configuration.baseUrl ?? '',
    apiKey: '',
    apiKeyConfigured: configuration.apiKeyConfigured ?? false,
    model: configuration.model ?? '',
    timeoutSeconds: configuration.timeoutSeconds ?? 45,
    passwordFailureLimit: configuration.passwordFailureLimit ?? 5,
    passwordFailureWindow: configuration.passwordFailureWindow ?? 'PT15M',
    passwordLockDuration: configuration.passwordLockDuration ?? 'PT15M',
    accountLimit: configuration.accountLimit ?? 20,
    ipLimit: configuration.ipLimit ?? 100,
    rateWindow: configuration.rateWindow ?? 'PT1M',
  })
  error.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (!saving.value) {
    editorOpen.value = false
    editingParameterKey.value = null
  }
}

async function save() {
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    const payload = form.key === 'login-protection'
      ? {
          passwordFailureLimit: form.passwordFailureLimit,
          passwordFailureWindow: form.passwordFailureWindow.trim(),
          passwordLockDuration: form.passwordLockDuration.trim(),
          accountLimit: form.accountLimit,
          ipLimit: form.ipLimit,
          rateWindow: form.rateWindow.trim(),
        }
      : {
          enabled: form.enabled,
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey,
          model: form.model.trim(),
          timeoutSeconds: form.timeoutSeconds,
        }
    await api.put(`/api/v1/admin/system-configurations/${encodeURIComponent(form.key)}`, payload)
    editorOpen.value = false
    editingParameterKey.value = null
    message.value = '系统配置已保存。'
    await load()
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? reason.response?.data?.message ?? '保存系统配置失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppShell>
    <NoticeToast :message="error" @dismiss="error = ''" />
    <NoticeToast :message="message" type="success" @dismiss="message = ''" />

    <div class="page-heading system-heading">
      <div><span class="eyebrow">系统字典</span><h1>系统配置</h1><p>集中管理服务端能力和第三方连接参数。</p></div>
      <button class="refresh-button" :disabled="loading" @click="load">↻ 刷新</button>
    </div>

    <section class="configuration-workspace">
      <aside class="configuration-sidebar" aria-label="系统配置列表">
        <div class="sidebar-toolbar">
          <label class="search-field"><span>⌕</span><input v-model="keyword" placeholder="搜索配置项" /></label>
          <button class="refresh-icon" aria-label="刷新配置" :disabled="loading" @click="load">↻</button>
        </div>
        <div class="sidebar-caption"><span>配置项</span><small>{{ filteredConfigurations.length }}</small></div>
        <div v-if="loading" class="sidebar-feedback">正在读取…</div>
        <div v-else-if="filteredConfigurations.length === 0" class="sidebar-feedback">没有找到匹配的配置项</div>
        <nav v-else class="configuration-nav">
          <button
            v-for="configuration in filteredConfigurations"
            :key="configuration.key"
            :class="['configuration-item', { selected: configuration.key === selectedKey }]"
            @click="selectedKey = configuration.key"
          >
            <span class="configuration-mark">⌘</span>
            <span class="configuration-copy"><b>{{ configuration.name }}</b><small>{{ configuration.key }}</small></span>
            <span :class="['item-state', configuration.key === 'login-protection' || configuration.enabled ? 'online' : 'offline']" />
          </button>
        </nav>
        <p class="sidebar-note">密钥仅保存于服务端数据库，列表不会展示密钥内容。</p>
      </aside>

      <article v-if="selectedConfiguration" class="parameter-panel">
        <header class="parameter-header">
          <div class="parameter-title"><span class="title-mark">⌘</span><div><span class="eyebrow">Key / {{ selectedConfiguration.key }}</span><h2>{{ selectedConfiguration.name }}</h2><p>{{ selectedConfiguration.description }}</p></div></div>
          <button class="button primary compact" :disabled="saving" @click="openEditor(selectedConfiguration)">✎ 编辑配置</button>
        </header>
        <div class="table-scroll parameter-table-wrap">
          <table class="parameter-table">
            <thead><tr><th>序号</th><th>参数名称</th><th>参数键名</th><th>当前值</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="(parameter, index) in parameters" :key="parameter.key">
                <td class="sequence">{{ String(index + 1).padStart(2, '0') }}</td>
                <td><b>{{ parameter.label }}</b></td>
                <td><code>{{ parameter.key }}</code></td>
                <td class="parameter-value">{{ parameter.value }}</td>
                <td><span :class="['value-state', parameter.state]">{{ parameter.state === 'empty' ? '待配置' : parameter.state === 'enabled' ? '已启用' : '已配置' }}</span></td>
                <td><button class="row-action" :disabled="saving" @click="openEditor(selectedConfiguration, parameter.key)">编辑</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer class="panel-footer"><span>配置保存后立即生效，无需重启服务。</span><span>共 {{ parameters.length }} 个参数</span></footer>
      </article>

      <article v-else class="parameter-empty"><span>⌘</span><h2>请选择一个配置项</h2><p>从左侧列表选择需要查看或编辑的系统配置。</p></article>
    </section>

    <div v-if="editorOpen" class="modal-backdrop" @click.self="closeEditor">
      <section
        class="system-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-editor-title"
      >
        <header class="system-editor-header">
          <div>
            <span class="eyebrow">系统配置 / {{ form.key }}</span>
            <h2 id="system-editor-title">{{ editingParameter ? `编辑${editingParameter.label}` : `编辑${selectedConfiguration?.name ?? '系统配置'}` }}</h2>
            <p>{{ editingParameter ? `修改参数键名：${editingParameter.key}` : selectedConfiguration?.description }}</p>
          </div>
          <button class="icon-button" aria-label="关闭" :disabled="saving" @click="closeEditor">×</button>
        </header>
        <form @submit.prevent="save">
          <template v-if="form.key === 'openapi'">
          <label v-if="!editingParameterKey || editingParameterKey === 'enabled'" class="toggle-field">
            <span>
              <b>启用模型评分</b>
              <small>启用后，主观题交卷时优先调用配置的 OpenAI 兼容接口。</small>
            </span>
            <input v-model="form.enabled" type="checkbox" />
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'baseUrl'">
            接口地址
            <input v-model="form.baseUrl" type="url" placeholder="https://服务地址/v1" :required="form.enabled" />
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'apiKey'">
            API 密钥
            <input
              v-model="form.apiKey"
              type="password"
              :placeholder="form.apiKeyConfigured ? '已保存；留空则不修改' : '输入服务端 API 密钥'"
              :required="form.enabled && !form.apiKeyConfigured"
              autocomplete="new-password"
            />
            <small v-if="form.apiKeyConfigured" class="field-hint">密钥已保存。留空即可保留原密钥。</small>
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'model'">
            模型名称
            <input v-model="form.model" placeholder="填写服务商提供的模型名称" :required="form.enabled" />
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'timeoutSeconds'">
            评分超时（秒）
            <input v-model.number="form.timeoutSeconds" type="number" min="5" max="120" required />
          </label>
          </template>
          <template v-else-if="form.key === 'login-protection'">
          <label v-if="!editingParameterKey || editingParameterKey === 'passwordFailureLimit'">
            密码失败上限（次）
            <input v-model.number="form.passwordFailureLimit" type="number" min="1" required />
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'passwordFailureWindow'">
            密码失败窗口（ISO-8601 时长）
            <input v-model="form.passwordFailureWindow" placeholder="PT15M" required />
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'passwordLockDuration'">
            密码锁定时长（ISO-8601 时长）
            <input v-model="form.passwordLockDuration" placeholder="PT15M" required />
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'accountLimit'">
            账户登录上限（次）
            <input v-model.number="form.accountLimit" type="number" min="1" required />
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'ipLimit'">
            IP 登录上限（次）
            <input v-model.number="form.ipLimit" type="number" min="1" required />
          </label>
          <label v-if="!editingParameterKey || editingParameterKey === 'rateWindow'">
            登录限流窗口（ISO-8601 时长）
            <input v-model="form.rateWindow" placeholder="PT1M" required />
          </label>
          </template>
          <footer>
            <button class="button secondary" type="button" :disabled="saving" @click="closeEditor">取消</button>
            <button class="button primary" :disabled="saving">{{ saving ? '保存中…' : '保存配置' }}</button>
          </footer>
        </form>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.system-heading { align-items: end; }
.system-heading h1 { margin: 3px 0 5px; color: #17334a; letter-spacing: -.6px; }
.system-heading p { margin: 0; color: #74879a; }
.refresh-button, .refresh-icon { border: 1px solid #d9e4eb; border-radius: 8px; background: #fff; color: #477086; cursor: pointer; transition: .18s ease; }
.refresh-button { padding: 8px 12px; font-size: 12px; }
.refresh-icon { width: 32px; height: 32px; font-size: 18px; }
.refresh-button:hover, .refresh-icon:hover { border-color: #93bdd0; background: #f2fbff; color: #08739c; }
.configuration-workspace { display: grid; grid-template-columns: 310px minmax(0, 1fr); min-height: 560px; overflow: hidden; border: 1px solid #dce7ec; border-radius: 12px; background: #fff; box-shadow: 0 14px 32px rgb(23 65 84 / .08); }
.configuration-sidebar { display: flex; flex-direction: column; min-width: 0; border-right: 1px solid #dce7ec; background: #fbfdfe; }
.sidebar-toolbar { display: flex; gap: 8px; padding: 14px; border-bottom: 1px solid #e8eff3; }
.search-field { display: flex; flex: 1; align-items: center; gap: 7px; min-width: 0; border: 1px solid #d8e4e9; border-radius: 7px; background: #fff; padding: 0 9px; color: #698094; }
.search-field input { width: 100%; min-width: 0; border: 0; outline: 0; padding: 8px 0; color: #2d4658; font-size: 12px; }
.sidebar-caption { display: flex; justify-content: space-between; padding: 15px 16px 8px; color: #7890a0; font-size: 11px; font-weight: 800; letter-spacing: .08em; }
.sidebar-caption small { display: grid; place-items: center; min-width: 18px; height: 18px; border-radius: 5px; background: #e7f1f6; color: #477389; font-size: 10px; }
.configuration-nav { display: grid; gap: 4px; padding: 0 8px; }
.configuration-item { display: flex; align-items: center; gap: 10px; width: 100%; border: 1px solid transparent; border-radius: 8px; background: transparent; padding: 12px 10px; color: #345269; cursor: pointer; text-align: left; transition: .18s ease; }
.configuration-item:hover { background: #f1f9fc; }
.configuration-item.selected { border-color: #9ed9ec; background: #e9f8fd; box-shadow: inset 3px 0 #0792c4; }
.configuration-mark, .title-mark { display: grid; flex: 0 0 auto; place-items: center; border-radius: 7px; background: #dceff6; color: #08749b; font-weight: 800; }
.configuration-mark { width: 30px; height: 30px; font-size: 15px; }
.configuration-copy { display: grid; gap: 3px; min-width: 0; flex: 1; }
.configuration-copy b { overflow: hidden; color: #28465d; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.configuration-copy small { color: #8ca0ae; font-size: 11px; }
.item-state { width: 7px; height: 7px; border-radius: 50%; }
.item-state.online { background: #28a06a; box-shadow: 0 0 0 3px rgb(40 160 106 / .13); }
.item-state.offline { background: #afbdc7; }
.sidebar-feedback { padding: 28px 18px; color: #8b9ca8; font-size: 12px; text-align: center; }
.sidebar-note { margin: auto 16px 15px; border-top: 1px solid #e8eff3; padding-top: 13px; color: #93a3ae; font-size: 11px; line-height: 1.65; }
.parameter-panel { display: flex; min-width: 0; flex-direction: column; background: #fff; }
.parameter-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 22px 24px; border-bottom: 1px solid #dce7ec; background: linear-gradient(100deg, #f8fcfe, #fff 65%); }
.parameter-title { display: flex; align-items: center; gap: 12px; }
.title-mark { width: 38px; height: 38px; border-radius: 9px; background: #087498; color: #fff; box-shadow: 0 6px 14px rgb(8 116 152 / .18); font-size: 18px; }
.parameter-header h2 { margin: 2px 0 4px; color: #163b52; font-size: 19px; letter-spacing: -.35px; }
.parameter-header p { margin: 0; color: #8395a1; font-size: 12px; }
.compact { white-space: nowrap; font-size: 12px; }
.parameter-table-wrap { flex: 1; }
.parameter-table { min-width: 760px; border-collapse: collapse; }
.parameter-table th { background: #087399; color: #fff; font-size: 12px; font-weight: 700; text-align: left; }
.parameter-table th, .parameter-table td { border-right: 1px solid #dce7ec; border-bottom: 1px solid #dce7ec; padding: 13px 16px; }
.parameter-table th:first-child, .parameter-table td:first-child { width: 52px; text-align: center; }
.parameter-table th:last-child, .parameter-table td:last-child { border-right: 0; text-align: center; }
.parameter-table td { color: #40586a; font-size: 13px; }
.parameter-table tbody tr:hover { background: #f8fcfd; }
.parameter-table code { border-radius: 4px; background: #eff6f8; padding: 3px 6px; color: #26708c; font-size: 11px; }
.sequence { color: #93a3ae !important; font-variant-numeric: tabular-nums; }
.parameter-value { max-width: 270px; overflow: hidden; color: #597182 !important; text-overflow: ellipsis; white-space: nowrap; }
.value-state { display: inline-block; min-width: 48px; border-radius: 4px; padding: 3px 7px; font-size: 11px; text-align: center; }
.value-state.enabled { background: #e3f6ec; color: #168353; }
.value-state.configured { background: #eaf5fa; color: #207194; }
.value-state.empty { background: #f1f4f6; color: #84939e; }
.row-action { border: 0; border-radius: 5px; background: #087399; padding: 6px 12px; color: #fff; cursor: pointer; font-size: 12px; transition: .18s ease; }
.row-action:hover { background: #065e7c; transform: translateY(-1px); }
.panel-footer { display: flex; justify-content: space-between; padding: 12px 18px; color: #8799a5; font-size: 11px; }
.parameter-empty { display: grid; place-content: center; min-height: 360px; color: #8a9ba7; text-align: center; }
.parameter-empty span { color: #84b7ca; font-size: 32px; }
.parameter-empty h2 { margin: 12px 0 4px; color: #5c7788; font-size: 16px; }
.parameter-empty p { margin: 0; font-size: 12px; }
.system-editor { width: min(560px, calc(100vw - 36px)); overflow: hidden; border: 1px solid #e4ebf5; border-radius: 20px; background: #fff; box-shadow: 0 28px 90px rgb(11 25 51 / .32); }
.system-editor-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 27px 30px 23px; border-bottom: 1px solid #e9eef6; background: linear-gradient(125deg, #f4f8ff, #fff 68%); }
.system-editor-header h2 { margin: 6px 0; color: #1d3150; font-size: 22px; }
.system-editor-header p { margin: 0; color: #8190a4; font-size: 13px; }
.system-editor form { display: grid; gap: 17px; padding: 25px 30px 28px; }
.system-editor label { display: grid; gap: 7px; color: #455670; font-size: 13px; font-weight: 700; }
.system-editor input:not([type='checkbox']) { width: 100%; box-sizing: border-box; border: 1px solid #d9e2ef; border-radius: 10px; padding: 11px 12px; color: #263956; outline: none; }
.system-editor input:focus { border-color: #3675e6; box-shadow: 0 0 0 3px rgb(54 117 230 / .11); }
.toggle-field { display: flex !important; align-items: center; justify-content: space-between; gap: 24px; padding: 15px; border: 1px solid #e2eaf5; border-radius: 12px; background: #f8fbff; }
.toggle-field span { display: grid; gap: 4px; }
.toggle-field small, .field-hint { color: #8190a4; font-size: 12px; font-weight: 400; }
.toggle-field input { width: 40px; height: 22px; accent-color: #2867d8; }
.system-editor footer { display: flex; justify-content: flex-end; gap: 10px; padding-top: 6px; }
@media (max-width: 720px) {
  .configuration-workspace { grid-template-columns: 1fr; }
  .configuration-sidebar { border-right: 0; border-bottom: 1px solid #dce7ec; }
  .sidebar-note { display: none; }
  .configuration-nav { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); padding-bottom: 8px; }
  .parameter-header { align-items: flex-start; flex-direction: column; }
  .system-editor { width: calc(100vw - 24px); }
  .system-editor-header, .system-editor form { padding-left: 20px; padding-right: 20px; }
}
</style>
