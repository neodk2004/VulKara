<!-- SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// The large view, alone in its window: the picture, what it was made from and what can be done with it.
// ← and → go through the list the view was opened from.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, Clapperboard, Download, Eraser, FolderSearch, Images, Maximize2, Repeat, X } from 'lucide-vue-next'
import { EDITION } from '@shared/edition'
import type { ViewerItem } from '@shared/api'
import { t } from '../i18n'
import { styleLabel } from '../util/labels'

const items = ref<ViewerItem[]>([])
const index = ref(0)
const item = computed(() => items.value[index.value])
const url = (path: string): string => window.vk.files.url(path)
const isVideo = computed(() => /\.(mp4|webm)$/i.test(item.value?.file ?? ''))

function step(by: number): void {
  const next = index.value + by
  if (next >= 0 && next < items.value.length) index.value = next
}

const close = (): void => window.close()

function key(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
}

onMounted(async () => {
  const payload = await window.vk.viewer.payload()
  if (payload) {
    items.value = payload.items
    index.value = payload.index
  }
  window.addEventListener('keydown', key)
})
onBeforeUnmount(() => window.removeEventListener('keydown', key))
watch(item, (i) => {
  document.title = i ? (i.job.prompt || i.file.split('/').pop() || 'VulKara').slice(0, 80) : 'VulKara'
})

const saveAs = (): Promise<boolean> => window.vk.files.saveAs(item.value.file, item.value.file.split('/').pop() ?? 'picture.png')
const reveal = (): Promise<void> => window.vk.files.reveal(item.value.file)
/** Back to the main window: the settings into the form, or the picture into another page. */
const act = (type: 'reuse' | 'continue', page: string): Promise<void> =>
  window.vk.viewer.act({ type, page, job: JSON.parse(JSON.stringify(item.value.job)), file: item.value.file })
</script>

<template>
  <div class="viewer">
    <div class="stage">
      <div class="drag" />
      <template v-if="item">
        <video v-if="isVideo" :key="item.file" :src="url(item.file)" controls loop autoplay />
        <img v-else :src="url(item.file)" draggable="false" />
      </template>
      <button v-if="index > 0" class="nav left" :title="t('viewer.previous')" @click="step(-1)"><ChevronLeft :size="22" /></button>
      <button v-if="index < items.length - 1" class="nav right" :title="t('viewer.next')" @click="step(1)"><ChevronRight :size="22" /></button>
      <button class="close" :title="t('viewer.close')" @click="close"><X :size="16" /></button>
    </div>
    <aside v-if="item" class="side">
      <p class="dim count">{{ t('viewer.count', { n: index + 1, total: items.length }) }}</p>
      <p class="prompt selectable">{{ item.job.prompt || t('viewer.noPrompt') }}</p>
      <p v-if="item.job.negativePrompt" class="dim selectable">{{ t('viewer.negative', { prompt: item.job.negativePrompt }) }}</p>
      <p class="dim selectable">
        {{ item.model || item.job.modelDir.split('/').pop() }} · {{ item.job.width }}×{{ item.job.height }}<template v-if="item.job.steps"> · {{ t('viewer.steps', { n: item.job.steps }) }}</template> · {{ t('viewer.seed', { seed: item.job.seed }) }}<template v-if="item.job.style"> · {{ styleLabel(item.job.style) }}</template>
      </p>
      <p v-if="item.job.note" class="dim selectable">{{ item.job.note }}</p>
      <div class="actions">
        <button class="btn" @click="saveAs"><Download :size="14" /> {{ t('viewer.saveAs') }}</button>
        <button class="btn" @click="reveal"><FolderSearch :size="14" /> {{ t('viewer.showInFinder') }}</button>
        <button class="btn" :title="t('viewer.reuseHint')" @click="act('reuse', item.job.page)"><Repeat :size="14" /> {{ t('viewer.reuse') }}</button>
        <template v-if="!isVideo">
          <button class="btn" @click="act('continue', 'image')"><Images :size="14" /> {{ t('viewer.imageToImage') }}</button>
          <button class="btn" @click="act('continue', 'inpaint')"><Eraser :size="14" /> {{ t('viewer.inpaint') }}</button>
          <!-- video and upscaling are pages of the editions with ComfyUI only -->
          <template v-if="EDITION.comfyui">
            <button class="btn" @click="act('continue', 'video')"><Clapperboard :size="14" /> {{ t('viewer.imageToVideo') }}</button>
            <button class="btn" @click="act('continue', 'upscale')"><Maximize2 :size="14" /> {{ t('viewer.upscale') }}</button>
          </template>
        </template>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.viewer {
  display: flex;
  height: 100%;
}

.stage {
  position: relative;
  flex: 1;
  min-width: 0;
  display: grid;
  place-items: center;
  padding: 36px 16px 16px;
  background: #0e0f12;
}

@media (prefers-color-scheme: light) {
  .stage {
    background: #e9e7e2;
  }
}

/* the window is moved at its upper edge */
.drag {
  position: absolute;
  inset: 0 0 auto 0;
  height: 36px;
  -webkit-app-region: drag;
}

.stage img,
.stage video {
  max-width: 100%;
  max-height: 100%;
  min-height: 0;
  object-fit: contain;
  border-radius: var(--radius-s);
}

/* a cut-out (transparent background) shows on a checkerboard; opaque pictures cover it */
.stage img {
  background: repeating-conic-gradient(rgba(128, 128, 128, 0.25) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
}

.nav {
  position: absolute;
  top: 50%;
  width: 38px;
  height: 38px;
  margin-top: -19px;
  border: 0;
  border-radius: 50%;
  background: rgba(127, 127, 127, 0.35);
  color: #fff;
  display: grid;
  place-items: center;
}

.nav:hover,
.close:hover {
  background: rgba(127, 127, 127, 0.6);
}

/* its own close button: a viewer over an app in full screen has no title bar */
.close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: rgba(127, 127, 127, 0.35);
  color: #fff;
  display: grid;
  place-items: center;
  -webkit-app-region: no-drag;
  z-index: 2;
}

.left {
  left: 14px;
}

.right {
  right: 14px;
}

.side {
  flex: none;
  width: 280px;
  overflow: auto;
  padding: 40px 16px 16px;
  display: grid;
  gap: 10px;
  align-content: start;
  background: var(--surface);
  border-left: 1px solid var(--line);
}

.count {
  font-variant-numeric: tabular-nums;
}

.prompt {
  white-space: pre-wrap;
  word-break: break-word;
}

.actions {
  display: grid;
  gap: 6px;
  margin-top: 6px;
}

.actions .btn {
  justify-content: flex-start;
}
</style>
