<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// About the app: what runs where, and which content rules the model licences set and how the app keeps them.
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageFrame from '../components/PageFrame.vue'
import ReportDialog from '../components/ReportDialog.vue'
import { useSettingsStore } from '../stores/settings'
import { openLink } from '../util/links'
import { t } from '../i18n'
import { DISCORD_URL, LICENCE_NAME, LICENCE_URL, REPO_URL, SUPPORT_URL } from '@shared/links'

const info = ref<{ name: string; version: string; electron: string; platform: string; ramGb: number; mac: string; os: string }>()
const settings = useSettingsStore()
const reporting = ref(false)
// the rows of the table of what the licences require (app.about.rules)
const RULES = ['krea', 'flux', 'ideogram', 'stability', 'euAct'] as const
onMounted(async () => {
  info.value = await window.vk.app.info()
  await settings.load()
})
</script>

<template>
  <PageFrame :title="t('app.about.title')" :subtitle="info ? t('app.about.subtitle', { version: info.version, mac: info.mac, os: info.os, electron: info.electron }) : ''">
    <article class="about selectable">
      <p>{{ t('app.about.intro') }}</p>

      <h2>{{ t('app.about.where.title') }}</h2>
      <ul>
        <li>{{ t('app.about.where.local') }}</li>
        <li>{{ t('app.about.where.network') }}</li>
        <li>
          {{ t('app.about.where.runtimesBefore') }} <RouterLink to="/settings">{{ t('app.about.where.settingsLink') }}</RouterLink>{{ t('app.about.where.runtimesAfter') }}
        </li>
      </ul>

      <h2>{{ t('app.about.rules.title') }}</h2>
      <p>{{ t('app.about.rules.intro') }}</p>

      <h3>{{ t('app.about.rules.required') }}</h3>
      <div class="table card">
        <div class="row head"><span>{{ t('app.about.rules.licence') }}</span><span>{{ t('app.about.rules.requirement') }}</span><span>{{ t('app.about.rules.measure') }}</span></div>
        <div v-for="r in RULES" :key="r" class="row">
          <span>{{ t(`app.about.rules.${r}.licence`) }}</span>
          <span>{{ t(`app.about.rules.${r}.requirement`) }}</span>
          <span>{{ t(`app.about.rules.${r}.measure`) }}</span>
        </div>
      </div>

      <h3>{{ t('app.about.promptFilter.title') }}</h3>
      <p>{{ t('app.about.promptFilter.text') }}</p>

      <h3>{{ t('app.about.resultFilter.title') }}</h3>
      <p>{{ t('app.about.resultFilter.intro') }}</p>
      <ul>
        <li><b>{{ t('app.about.resultFilter.nudity') }}</b>: {{ t('app.about.resultFilter.nudityText') }}</li>
        <li><b>{{ t('app.about.resultFilter.age') }}</b>: {{ t('app.about.resultFilter.ageText') }}</li>
        <li>
          <b>{{ t('app.about.resultFilter.blocked') }}</b>: {{ t('app.about.resultFilter.blockedBefore') }}
          <RouterLink to="/settings">{{ t('app.about.resultFilter.blockedLink') }}</RouterLink>
          {{ t('app.about.resultFilter.blockedAfter', { state: settings.values.allowExplicit ? t('app.about.resultFilter.allowed') : t('app.about.resultFilter.notAllowed') }) }}
        </li>
        <li><b>{{ t('app.about.resultFilter.videos') }}</b>: {{ t('app.about.resultFilter.videosText') }}</li>
        <li><b>{{ t('app.about.resultFilter.failClosed') }}</b>: {{ t('app.about.resultFilter.failClosedText') }}</li>
        <li>{{ t('app.about.resultFilter.download') }}</li>
      </ul>

      <h3>{{ t('app.about.consent.title') }}</h3>
      <p>{{ t('app.about.consent.text') }}</p>

      <h3>{{ t('app.about.marking.title') }}</h3>
      <ul>
        <!-- i18n-ok -->
        <li>{{ t('app.about.marking.picturesBefore') }} <code>trainedAlgorithmicMedia</code>{{ t('app.about.marking.picturesAfter') }}</li>
        <li>{{ t('app.about.marking.videos') }}</li>
        <li>{{ t('app.about.marking.keep') }}</li>
      </ul>

      <h3>{{ t('app.about.limits.title') }}</h3>
      <ul>
        <li>{{ t('app.about.limits.classifiers') }}</li>
        <li>{{ t('app.about.limits.context') }}</li>
        <li>{{ t('app.about.limits.commercialBefore') }} <RouterLink to="/licenses">{{ t('app.about.limits.licensesLink') }}</RouterLink>{{ t('app.about.limits.commercialAfter') }}</li>
      </ul>

      <h2>{{ t('app.about.licence.title') }}</h2>
      <p>
        {{ t('app.about.licence.freeBefore') }} <a href="#" @click.prevent="openLink(LICENCE_URL)">{{ LICENCE_NAME }}</a>{{ t('app.about.licence.freeAfter') }}
        <RouterLink to="/licenses">{{ t('app.about.licence.licensesLink') }}</RouterLink>{{ t('app.about.licence.freeEnd') }}
        <template v-if="REPO_URL"> {{ t('app.about.licence.sourceBefore') }} <a href="#" @click.prevent="openLink(REPO_URL)">GitHub</a>{{ t('app.about.licence.sourceAfter') }}</template>
      </p>
      <p>
        {{ t('app.about.licence.problemBefore') }} <a href="#" @click.prevent="reporting = true">{{ t('app.about.licence.problemLink') }}</a>{{ t('app.about.licence.problemAfter') }}
      </p>
      <p>
        {{ t('app.about.licence.communityBefore') }}
        <a href="#" @click.prevent="openLink(DISCORD_URL)">{{ t('app.about.licence.communityLink') }}</a>{{ t('app.about.licence.communityAfter') }}
      </p>
      <p v-if="SUPPORT_URL">
        {{ t('app.about.licence.supportBefore') }}
        <a href="#" @click.prevent="openLink(SUPPORT_URL)">{{ t('app.about.licence.supportLink') }}</a> {{ t('app.about.licence.supportAfter') }}
      </p>

      <h2>{{ t('app.about.credits.title') }}</h2>
      <p>{{ t('app.about.credits.text') }}</p>
      <p class="dim">{{ t('app.about.credits.copyright') }}</p>
    </article>
    <ReportDialog v-if="reporting" @close="reporting = false" />
  </PageFrame>
</template>

<style scoped>
.about {
  display: grid;
  gap: 12px;
  max-width: 900px;
  line-height: 1.55;
}

h2 {
  margin-top: 14px;
  font-size: 16px;
}

h3 {
  margin: 8px 0 0;
  font-size: 13px;
}

ul {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 4px;
}

a {
  color: var(--accent);
}

.table {
  overflow: hidden;
}

.row {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 12px;
  padding: 9px 14px;
}

.row + .row {
  border-top: 1px solid var(--line);
}

.row.head {
  font-weight: 600;
  background: var(--surface-2);
}

code {
  font: 12px var(--mono);
}
</style>
