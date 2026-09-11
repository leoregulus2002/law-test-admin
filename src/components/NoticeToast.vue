<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    message: string
    type?: 'error' | 'success'
    duration?: number
  }>(),
  {
    type: 'error',
    duration: 3200,
  },
)

const emit = defineEmits<{ dismiss: [] }>()
let timer: number | undefined

function dismiss() {
  if (timer) window.clearTimeout(timer)
  timer = undefined
  emit('dismiss')
}

watch(() => props.message, message => {
  if (timer) window.clearTimeout(timer)
  timer = message ? window.setTimeout(dismiss, props.duration) : undefined
})

onBeforeUnmount(() => {
  if (timer) window.clearTimeout(timer)
})
</script>

<template>
  <Transition name="notice">
    <div v-if="message" :class="['notice-toast', type]" role="alert">
      <span class="notice-icon">{{ type === 'error' ? '!' : '✓' }}</span>
      <p>{{ message }}</p>
      <button type="button" aria-label="关闭提示" @click="dismiss">×</button>
    </div>
  </Transition>
</template>

<style scoped>
.notice-toast {
  position: fixed;
  z-index: 100;
  top: 24px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(420px, calc(100vw - 32px));
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid;
  border-radius: 13px;
  box-shadow: 0 14px 36px rgb(22 38 65 / .2);
  transform: translateX(-50%);
}

.notice-toast.error { border-color: #f3cbd0; background: #fffafa; color: #b73e4d; }
.notice-toast.success { border-color: #bfe6cf; background: #f7fdf9; color: #148256; }
.notice-icon { display: grid; flex: 0 0 auto; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: currentColor; color: #fff; font-size: 13px; font-weight: 800; }
.notice-toast p { flex: 1; margin: 0; font-size: 13px; font-weight: 600; line-height: 1.45; }
.notice-toast button { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: currentColor; font-size: 19px; line-height: 1; opacity: .72; }
.notice-toast button:hover { background: rgb(20 35 60 / .07); opacity: 1; }
.notice-enter-active, .notice-leave-active { transition: .2s ease; }
.notice-enter-from, .notice-leave-to { opacity: 0; transform: translate(-50%, -12px); }
</style>
