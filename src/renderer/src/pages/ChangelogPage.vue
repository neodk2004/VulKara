<!-- SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// What changed from version to version: the changelog shipped with the app, newest first.
import { onMounted, ref } from 'vue'
import PageFrame from '../components/PageFrame.vue'
import { parseChangelog } from '../util/changelog'
import { t } from '../i18n'
import text from '../../../../CHANGELOG.md?raw'

const versions = parseChangelog(text)
const installed = ref('')
onMounted(async () => {
  installed.value = (await window.vk.app.info()).version
})
</script>

<template>
  <PageFrame :title="t('app.changelog.title')" :subtitle="installed ? t('app.changelog.subtitleVersion', { version: installed }) : t('app.changelog.subtitle')">
    <article class="changelog selectable">
      <section v-for="v in versions" :key="v.version">
        <h2>
          <!-- i18n-ok -->
          {{ v.version === 'Unreleased' ? t('app.changelog.unreleased') : t('app.changelog.version', { version: v.version }) }}
          <span v-if="v.version === installed" class="installed">{{ t('app.changelog.installed') }}</span>
        </h2>
        <!-- eslint-disable-next-line vue/no-v-html -- escaped by parseChangelog -->
        <p v-for="(p, i) in v.intro" :key="'p' + i" v-html="p" />
        <ul>
          <!-- eslint-disable-next-line vue/no-v-html -- escaped by parseChangelog -->
          <li v-for="(item, i) in v.items" :key="i" v-html="item" />
        </ul>
      </section>
    </article>
  </PageFrame>
</template>

<style scoped>
.changelog {
  display: grid;
  gap: 18px;
  max-width: 900px;
  line-height: 1.55;
}

h2 {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 6px;
  font-size: 16px;
}

.installed {
  padding: 1px 8px;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
}

p {
  margin: 0 0 6px;
}

ul {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 5px;
}

:deep(code) {
  font: 12px var(--mono);
}
</style>
