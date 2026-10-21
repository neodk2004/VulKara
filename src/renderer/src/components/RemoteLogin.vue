<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 -->
<!-- Copyright (C) 2026 Oliver Schmidt -->
<!-- The remote web UI without a token (or with one the Mac no longer takes): asks for it. -->
<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../i18n'

const props = defineProps<{ refused: boolean }>()
const emit = defineEmits<{ token: [string] }>()
const token = ref('')

function send(): void {
  const v = token.value.trim()
  if (v) emit('token', v)
}
</script>

<template>
  <main class="login">
    <form @submit.prevent="send">
      <h1>{{ t('settings.remote.title') }}</h1>
      <p class="dim">{{ t('settings.remote.loginIntro') }}</p>
      <label>
        <span>{{ t('settings.remote.token') }}</span>
        <input v-model="token" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" />
      </label>
      <p v-if="props.refused" class="error">{{ t('settings.remote.wrongToken') }}</p>
      <button class="btn primary" type="submit" :disabled="!token.trim()">{{ t('settings.remote.connect') }}</button>
    </form>
  </main>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--bg);
}
form {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
input {
  font-size: 16px; /* no zoom on a phone when the field gets the focus */
}
</style>
