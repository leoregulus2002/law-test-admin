<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import AppShell from "../components/AppShell.vue";
import NoticeToast from "../components/NoticeToast.vue";
import api from "../lib/api";

interface AppRelease {
  id: number;
  versionCode: number;
  versionName: string;
  forceUpdate: boolean;
  releaseNotes: string;
  sizeBytes: number;
  sha256: string;
  published: boolean;
  createdAt: string;
  publishedAt?: string;
}

const releases = ref<AppRelease[]>([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const message = ref("");
const file = ref<File | null>(null);
const form = reactive({
  versionCode: 1,
  versionName: "",
  forceUpdate: false,
  releaseNotes: "",
});
const liveRelease = computed(
  () => releases.value.find((release) => release.published) ?? null,
);
const draftRelease = computed(
  () => releases.value.find((release) => !release.published) ?? null,
);

async function load() {
  loading.value = true;
  try {
    releases.value = (
      await api.get<AppRelease[]>("/api/v1/admin/app-releases")
    ).data;
    form.versionCode =
      Math.max(0, ...releases.value.map((release) => release.versionCode)) + 1;
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? "无法读取发布版本";
  } finally {
    loading.value = false;
  }
}

function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

async function upload() {
  if (!file.value) {
    error.value = "请选择已签名的 APK 文件";
    return;
  }
  submitting.value = true;
  error.value = "";
  message.value = "";
  try {
    const payload = new FormData();
    payload.append("file", file.value);
    payload.append("versionCode", String(form.versionCode));
    payload.append("versionName", form.versionName.trim());
    payload.append("forceUpdate", String(form.forceUpdate));
    payload.append("releaseNotes", form.releaseNotes.trim());
    await api.post("/api/v1/admin/app-releases", payload, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    message.value = "APK 已上传，发布后客户端才会检测到新版本。";
    file.value = null;
    form.versionName = "";
    form.releaseNotes = "";
    form.forceUpdate = false;
    await load();
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? "上传 APK 失败";
  } finally {
    submitting.value = false;
  }
}

async function changePublication(release: AppRelease) {
  submitting.value = true;
  error.value = "";
  try {
    await api.post(
      `/api/v1/admin/app-releases/${release.id}/${release.published ? "withdraw" : "publish"}`,
    );
    message.value = release.published ? "版本已撤销发布。" : "版本已发布。";
    await load();
  } catch (reason: any) {
    error.value = reason.response?.data?.detail ?? "更新发布状态失败";
  } finally {
    submitting.value = false;
  }
}

function size(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function date(value?: string) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "尚未发布";
}
onMounted(load);
</script>

<template>
  <AppShell>
    <NoticeToast :message="error" @dismiss="error = ''" />
    <NoticeToast :message="message" type="success" @dismiss="message = ''" />
    <header class="release-heading">
      <div>
        <span class="eyebrow">Android / Release desk</span>
        <h1>应用更新</h1>
        <p>从上传到发布，始终明确哪些用户会收到这个版本。</p>
      </div>
      <button
        class="release-refresh"
        :disabled="loading"
        aria-label="刷新发布状态"
        title="刷新发布状态"
        @click="load"
      >
        ↻
      </button>
    </header>
    <section class="release-overview">
      <article class="release-stat primary">
        <span>线上版本</span
        ><b>{{ liveRelease ? `v${liveRelease.versionName}` : "未发布" }}</b
        ><small>{{
          liveRelease
            ? `code ${liveRelease.versionCode} · ${date(liveRelease.publishedAt)}`
            : "发布首个版本后，客户端将开始检查更新。"
        }}</small>
      </article>
      <article class="release-stat">
        <span>最新草稿</span
        ><b>{{ draftRelease ? `v${draftRelease.versionName}` : "暂无草稿" }}</b
        ><small>{{
          draftRelease
            ? `${draftRelease.forceUpdate ? "强制更新" : "普通更新"} · ${size(draftRelease.sizeBytes)}`
            : "上传 APK 后将在这里显示。"
        }}</small>
      </article>
      <article class="release-stat compact">
        <span>发布包</span><b>{{ String(releases.length).padStart(2, "0") }}</b
        ><small>历史版本总数</small>
      </article>
    </section>
    <section class="release-workbench">
      <form class="release-composer" @submit.prevent="upload">
        <header>
          <div>
            <span class="section-kicker">新建发布</span>
            <h2>准备 Android 安装包</h2>
          </div>
          <span class="composer-step">01</span>
        </header>
        <label :class="['apk-dropzone', { selected: file }]"
          ><input
            accept=".apk,application/vnd.android.package-archive"
            type="file"
            required
            @change="selectFile"
          /><span class="apk-file-mark">APK</span
          ><b>{{ file ? file.name : "选择已签名的 APK" }}</b
          ><small>{{
            file ? size(file.size) : "拖放文件至此，或点击浏览。仅支持 .apk。"
          }}</small
          ><i>{{ file ? "更换文件" : "选择文件" }}</i></label
        >
        <div class="release-fields">
          <label
            >versionCode<input
              v-model.number="form.versionCode"
              min="1"
              type="number"
              required /></label
          ><label
            >版本名称<input
              v-model="form.versionName"
              maxlength="64"
              placeholder="例如 1.1.0"
              required
          /></label>
        </div>
        <fieldset class="update-kind">
          <legend>更新策略</legend>
          <label :class="{ active: !form.forceUpdate }"
            ><input
              v-model="form.forceUpdate"
              :value="false"
              type="radio"
            /><span
              ><b>普通更新</b><small>用户可以稍后安装。</small></span
            ></label
          ><label :class="{ active: form.forceUpdate }"
            ><input
              v-model="form.forceUpdate"
              :value="true"
              type="radio"
            /><span
              ><b>强制更新</b><small>用户需更新后才能继续使用。</small></span
            ></label
          >
        </fieldset>
        <label class="notes-field"
          >更新说明<textarea
            v-model="form.releaseNotes"
            rows="4"
            placeholder="简要说明本次修复、优化或新增内容"
          />
        </label>
        <footer>
          <span>上传后先保存为草稿，确认无误后再发布。</span
          ><button class="button primary" :disabled="submitting">
            {{ submitting ? "正在上传…" : "上传安装包" }}
          </button>
        </footer>
      </form>
      <aside class="release-guide">
        <span class="section-kicker">发布原则</span>
        <h2>一次发布，两个选择</h2>
        <p>普通更新让用户自行安排；强制更新只应用于无法继续使用的版本修复。</p>
        <ol>
          <li>
            <i>01</i
            ><span
              ><b>递增 versionCode</b
              ><small>同一个 code 不能重复上传。</small></span
            >
          </li>
          <li>
            <i>02</i
            ><span
              ><b>保持签名一致</b
              ><small>系统只接受同一应用签名的更新包。</small></span
            >
          </li>
          <li>
            <i>03</i
            ><span
              ><b>确认后再发布</b
              ><small>已发布版本会被客户端自动发现。</small></span
            >
          </li>
        </ol>
      </aside>
    </section>
    <section class="release-history">
      <header>
        <div>
          <span class="section-kicker">发布记录</span>
          <h2>版本历史</h2>
        </div>
        <small>{{
          loading ? "正在同步…" : `${releases.length} 个安装包`
        }}</small>
      </header>
      <div v-if="loading" class="release-empty">正在读取发布记录…</div>
      <div v-else-if="releases.length === 0" class="release-empty">
        <b>还没有安装包</b
        ><span>从上方上传第一个已签名 APK，创建首个发布版本。</span>
      </div>
      <div v-else class="release-list">
        <article
          v-for="release in releases"
          :key="release.id"
          :class="['release-row', { live: release.published }]"
        >
          <div class="release-version">
            <span>{{ release.published ? "LIVE" : "DRAFT" }}</span
            ><b>v{{ release.versionName }}</b
            ><small>versionCode {{ release.versionCode }}</small>
          </div>
          <p>{{ release.releaseNotes || "未填写更新说明。" }}</p>
          <div class="release-meta">
            <span>{{ release.forceUpdate ? "强制更新" : "普通更新" }}</span
            ><small
              >{{ size(release.sizeBytes) }} ·
              {{
                date(
                  release.published ? release.publishedAt : release.createdAt,
                )
              }}</small
            >
          </div>
          <div class="release-action">
            <code title="SHA-256">{{ release.sha256.slice(0, 12) }}…</code
            ><button
              :class="release.published ? 'withdraw' : 'publish'"
              :disabled="submitting"
              @click="changePublication(release)"
            >
              {{ release.published ? "撤销发布" : "发布版本" }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </AppShell>
</template>
