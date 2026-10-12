<!-- SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// The app's language: System (macOS's) or one of the four, each under its own name. Settings → Appearance and the
// Start page; icon: with the Languages icon in front (the Start page, where it stands alone).
import { Languages } from 'lucide-vue-next'
import { LANG_NAMES, LANGS, type LangSetting } from '@shared/i18n'
import { useSettingsStore } from '../stores/settings'
import { t } from '../i18n'

defineProps<{ icon?: boolean }>()
const settings = useSettingsStore()
const LANGUAGES: LangSetting[] = ['system', ...LANGS]
const langName = (l: LangSetting): string => (l === 'system' ? t('settings.appearance.system') : LANG_NAMES[l])
</script>

<template>
  <label class="language" :class="{ icon }">
    <Languages v-if="icon" :size="14" class="dim" />
    <select
      :value="settings.values.language" :aria-label="t('settings.appearance.language')"
      @change="settings.set('language', ($event.target as HTMLSelectElement).value as LangSetting)"
    >
      <option v-for="l in LANGUAGES" :key="l" :value="l">{{ langName(l) }}</option>
    </select>
  </label>
</template>

<style scoped>
.language {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* as the menus of Settings */
select {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--surface-2);
  color: inherit;
  font: inherit;
}
</style>
