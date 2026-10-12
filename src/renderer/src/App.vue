<!-- SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavRail from './components/NavRail.vue'
import JobBar from './components/JobBar.vue'
import ImagePicker from './components/ImagePicker.vue'
import { useFavoritesStore } from './stores/favorites'
import { useHandoffStore } from './stores/handoff'
import { useQueueStore } from './stores/queue'
import { useRuntimesStore } from './stores/runtimes'
import { useSettingsStore } from './stores/settings'
import { formPage } from './util/job_form'
import { useAssetsStore } from './stores/assets'
import { locale } from './i18n'

const route = useRoute()
const router = useRouter()
// a viewer or splash window shows its page alone
const bare = computed(() => route.meta.bare === true || /^#\/(viewer|splash)/.test(location.hash))

onMounted(() => {
  if (bare.value) return
  void useQueueStore().start()
  useFavoritesStore().start()
  void useRuntimesStore().refresh()
  void useSettingsStore().load()
  // the main process writes the runtimes' descriptions and the models' notes in the language of the moment
  watch(locale, () => {
    void useRuntimesStore().refresh()
    void useAssetsStore().refresh()
  })
  // a viewer window hands a picture or the settings of a job back
  const handoff = useHandoffStore()
  window.vk.viewer.onAction((action) => {
    if (action.page === 'upscale') {
      // enlarging has no settings to take over: the picture itself goes there
      handoff.send('upscale', { inputImage: action.type === 'reuse' ? action.job.inputImage ?? action.file : action.file })
      void router.push({ path: '/upscale', query: { t: String(Date.now()) } })
      return
    }
    const page = formPage(action.page)
    if (action.type === 'reuse') handoff.send(page, { job: action.job, inputImage: page === 'text' ? undefined : action.job.inputImage })
    else handoff.send(page, { inputImage: action.file })
    void router.push({ path: '/' + page, query: { t: String(Date.now()) } })
  })
})
</script>

<template>
  <RouterView v-if="bare" />
  <div v-else class="shell">
    <NavRail />
    <main class="stage">
      <RouterView v-slot="{ Component, route: shown }">
        <KeepAlive>
          <component :is="Component" :key="shown.path" />
        </KeepAlive>
      </RouterView>
    </main>
    <JobBar />
    <ImagePicker />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--rail) 1fr;
  grid-template-rows: 1fr var(--jobbar);
  height: 100%;
}

.stage {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
