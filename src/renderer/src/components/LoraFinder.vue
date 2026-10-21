<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// LoRAs that fit a model, from Civitai or Hugging Face, installed through the import queue.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Check, Download, ExternalLink, Search, Square, X } from 'lucide-vue-next'
import { useAssetsStore } from '../stores/assets'
import { useImportsStore } from '../stores/imports'
import { cleanError } from '../stores/runtimes'
import { useSettingsStore } from '../stores/settings'
import { openLink } from '../util/links'
import { LORA_BASES, isInstalled, loraBase, type LoraHit } from '@shared/lora_bases'
import type { ImportJob, ImportRequest } from '@shared/api'
import { num, t } from '../i18n'

const props = defineProps<{ base: string; model?: string }>()
const emit = defineEmits<{ close: [] }>()

const assets = useAssetsStore()
const imports = useImportsStore()
const settings = useSettingsStore()

const dialog = ref<HTMLDialogElement>()
const base = ref(props.base)
const source = ref<'civitai' | 'hf'>('civitai')
const query = ref('')
const hits = ref<LoraHit[]>([])
const cursor = ref<string>()
const loading = ref(false)
const error = ref('')
const installError = ref('')
const tokens = reactive({ hf: false, civitai: false })
/** the file chosen for a Hugging Face repository with several */
const chosen = reactive<Record<string, string>>({})
/** preview pictures: data URL, '' when there is none */
const thumbs = reactive<Record<string, string>>({})
/** adult previews the user chose to see */
const revealed = reactive(new Set<string>())

const title = computed(() => props.model ? t('lora.finder.titleFor', { model: props.model }) : t('lora.finder.title'))
const baseLabel = computed(() => loraBase(base.value)?.label ?? base.value)
let run = 0

onMounted(async () => {
  dialog.value?.showModal()
  const [hf, civitai] = await Promise.all([window.vk.tokens.has('huggingface'), window.vk.tokens.has('civitai'), settings.load(), imports.start()])
  Object.assign(tokens, { hf, civitai })
  void search()
})

watch([base, source], () => void search())

async function search(more = false): Promise<void> {
  const id = ++run
  loading.value = true
  error.value = ''
  if (!more) {
    hits.value = []
    cursor.value = undefined
  }
  try {
    const page = await window.vk.loras.search({ base: base.value, source: source.value, query: query.value, cursor: more ? cursor.value : undefined })
    if (id !== run) return
    const known = new Set(hits.value.map(key))
    hits.value = [...hits.value, ...page.hits.filter((h) => !known.has(key(h)))]
    cursor.value = page.cursor
    for (const h of page.hits) if (h.file && !(h.ref in chosen)) chosen[h.ref] = h.file
    void loadThumbs(page.hits, id)
  } catch (err) {
    if (id === run) error.value = cleanError(err)
  } finally {
    if (id === run) loading.value = false
  }
}

const key = (h: LoraHit): string => `${h.source}:${h.ref}`

// four at a time, so the first ones show soon
async function loadThumbs(list: LoraHit[], id: number): Promise<void> {
  const todo = list.filter((h) => h.previewUrl && !(h.previewUrl in thumbs))
  const worker = async (): Promise<void> => {
    for (let h = todo.shift(); h && id === run; h = todo.shift()) {
      const url = h.previewUrl!
      thumbs[url] = (await window.vk.loras.thumb(url).catch(() => undefined)) ?? ''
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
}

const fileOf = (h: LoraHit): string | undefined => chosen[h.ref] ?? h.file
const requestOf = (h: LoraHit): ImportRequest => h.source === 'hf' ? { source: 'hf', ref: h.ref, file: fileOf(h) } : { source: 'civitai', ref: h.ref }
const installed = (h: LoraHit): boolean => isInstalled({ source: h.source, ref: h.ref, file: fileOf(h) }, assets.all)

function jobOf(h: LoraHit): ImportJob | undefined {
  const job = imports.of(requestOf(h))
  return job && job.state !== 'done' ? job : undefined
}

function tokenMissing(h: LoraHit): string {
  if (!h.needsToken) return ''
  if (h.source === 'civitai' && !tokens.civitai) return t('lora.finder.needsCivitaiToken')
  if (h.source === 'hf' && !tokens.hf) return t('lora.finder.needsHfToken')
  return ''
}

async function install(h: LoraHit): Promise<void> {
  installError.value = ''
  try {
    await imports.add(requestOf(h), h.title)
  } catch (err) {
    installError.value = cleanError(err)
  }
}

function count(n: number | undefined): string {
  if (n === undefined) return ''
  return n >= 1e6 ? `${num(n / 1e6, 1)}M` : n >= 1e3 ? `${num(n / 1e3, n >= 1e4 ? 0 : 1)}k` : String(n)
}

function close(): void {
  run++
  emit('close')
}
</script>

<template>
  <!-- @close: the browser may close a modal dialog on Escape without a cancel event; the page has to hear of it, or
       the finder stays mounted but invisible and the next "LoRAs" click shows nothing -->
  <dialog ref="dialog" class="finder" @cancel.prevent="close" @close="close" @click.self="close">
    <div class="inner">
      <header>
        <div class="grow">
          <h2>{{ title }}</h2>
          <p class="dim">{{ t('lora.finder.intro', { base: baseLabel }) }}</p>
        </div>
        <button class="btn small ghost" :title="t('lora.finder.close')" @click="close"><X :size="14" /></button>
      </header>

      <div class="controls">
        <div class="tabs">
          <button :class="{ on: source === 'civitai' }" @click="source = 'civitai'">Civitai</button>
          <button :class="{ on: source === 'hf' }" @click="source = 'hf'">Hugging Face</button>
        </div>
        <select v-model="base" :title="t('lora.finder.baseHint')">
          <option v-for="b in LORA_BASES" :key="b.id" :value="b.id">{{ b.label }}</option>
        </select>
        <label class="search">
          <Search :size="14" class="dim" />
          <input v-model="query" type="search" :placeholder="t('lora.finder.searchPlaceholder')" spellcheck="false" @keyup.enter="search()" @search="search()" />
        </label>
      </div>
      <p v-if="!settings.values.allowExplicit" class="dim small">
        {{ t('lora.finder.adultsLeftOut') }}
      </p>
      <p v-if="installError" class="error selectable">{{ installError }}</p>

      <div class="results">
        <p v-if="error" class="error selectable">{{ error }}</p>
        <p v-else-if="!loading && !hits.length" class="dim">{{ query ? t('lora.finder.nothingFoundSearch') : t('lora.finder.nothingFound') }}</p>
        <div class="grid">
          <article v-for="h in hits" :key="key(h)" class="card hit">
            <div class="picture">
              <template v-if="h.previewUrl && thumbs[h.previewUrl]">
                <img :src="thumbs[h.previewUrl]" :class="{ blurred: h.previewExplicit && !revealed.has(h.previewUrl) }" draggable="false" />
                <button v-if="h.previewExplicit && !revealed.has(h.previewUrl)" class="reveal" @click="revealed.add(h.previewUrl)">
                  {{ t('lora.finder.adultShow') }}
                </button>
              </template>
              <span v-else class="dim">{{ h.previewUrl && !(h.previewUrl in thumbs) ? '…' : 'LoRA' }}</span>
            </div>
            <div class="body">
              <strong class="selectable">{{ h.title }}</strong>
              <p class="dim">
                <template v-if="h.author">{{ t('lora.finder.by', { author: h.author }) }}</template><template v-if="h.version"> · {{ h.version }}</template>
              </p>
              <p class="tags">
                <span v-if="h.baseModel" class="tag">{{ h.baseModel }}</span>
                <span v-if="h.downloads !== undefined" class="tag" :title="t('lora.finder.downloadsHint')">{{ t('lora.finder.downloads', { count: count(h.downloads) }) }}</span>
                <span v-if="h.likes" class="tag" :title="t('lora.finder.likesHint')">{{ t('lora.finder.likes', { count: count(h.likes) }) }}</span>
                <span v-if="h.sizeMb" class="tag">{{ h.sizeMb }} MB</span>
                <span v-if="h.nsfw" class="tag warn">{{ t('lora.finder.adult') }}</span>
                <span v-if="h.gated" class="tag">{{ t('lora.finder.licenceToAccept') }}</span>
              </p>
              <p v-if="h.triggerWords.length" class="dim selectable small">{{ t('lora.finder.trigger', { words: h.triggerWords.join(', ') }) }}</p>
              <p v-if="h.licence" class="dim small">{{ h.licence }}</p>
              <select v-if="h.files && h.files.length > 1" v-model="chosen[h.ref]" class="file" :title="t('lora.finder.fileHint')">
                <option v-for="f in h.files" :key="f" :value="f">{{ f }}</option>
              </select>
              <p v-if="!installed(h) && tokenMissing(h)" class="warn-text small">{{ tokenMissing(h) }}</p>
              <p v-if="!installed(h) && h.gated" class="dim small">
                {{ t('lora.finder.gatedBefore') }} <a href="#" @click.prevent="openLink(h.page)">{{ t('lora.finder.gatedLink') }}</a> {{ t('lora.finder.gatedAfter') }}
              </p>
              <template v-if="jobOf(h)">
                <template v-if="jobOf(h)!.state === 'running'">
                  <div class="bar" :class="{ unknown: jobOf(h)!.percent < 0 }"><i :style="jobOf(h)!.percent >= 0 ? { width: jobOf(h)!.percent + '%' } : {}" /></div>
                  <p class="dim small">{{ jobOf(h)!.stage }}</p>
                </template>
                <p v-else-if="jobOf(h)!.state === 'failed'" class="error selectable small">{{ jobOf(h)!.error }}</p>
                <p v-else-if="jobOf(h)!.state === 'waiting'" class="dim small">{{ t('lora.finder.waiting') }}</p>
              </template>
              <div class="row">
                <span v-if="installed(h)" class="installed"><Check :size="14" /> {{ t('lora.finder.installed') }}</span>
                <button v-else-if="jobOf(h) && (jobOf(h)!.state === 'running' || jobOf(h)!.state === 'waiting')" class="btn small danger" @click="imports.cancel(jobOf(h)!.id)">
                  <Square :size="11" /> {{ t('lora.finder.cancel') }}
                </button>
                <button v-else class="btn small primary" :disabled="!!tokenMissing(h)" @click="install(h)">
                  <Download :size="12" /> {{ t('lora.finder.install') }}
                </button>
                <span class="spacer" />
                <button class="btn small ghost" :title="t('lora.finder.openPage')" @click="openLink(h.page)"><ExternalLink :size="12" /></button>
              </div>
            </div>
          </article>
        </div>
        <div class="more">
          <span v-if="loading" class="dim">{{ t('lora.finder.loading') }}</span>
          <button v-else-if="cursor" class="btn" @click="search(true)">{{ t('lora.finder.loadMore') }}</button>
        </div>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.finder {
  width: min(1100px, calc(100vw - 80px));
  height: min(820px, calc(100vh - 80px));
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-l);
  background: var(--bg);
  color: var(--text);
  box-shadow: var(--shadow);
}

.finder::backdrop {
  background: rgba(0, 0, 0, 0.45);
}

.inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 16px 18px;
  box-sizing: border-box;
}

header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.controls .search {
  flex: 1;
  min-width: 180px;
}

.controls .search input {
  flex: 1;
  min-width: 0;
}

.results {
  flex: 1;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.hit {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--surface) 88%, #3fbf8a);
}

.picture {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.picture img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.picture img.blurred {
  filter: blur(18px);
  transform: scale(1.1);
}

.reveal {
  position: absolute;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
}

/* the buttons always at the foot of the card */
.body {
  padding: 10px 8px 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.body strong {
  word-break: break-word;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  padding: 1px 7px;
  border-radius: 9px;
  background: var(--surface-2);
  font-size: 11px;
  white-space: nowrap;
}

.tag.warn,
.warn-text {
  color: var(--accent);
}

.small {
  font-size: 12px;
}

.file {
  height: 26px;
  font-size: 12px;
  max-width: 100%;
}

.bar {
  margin: 4px 0 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: auto;
  padding-top: 4px;
}

.spacer {
  flex: 1;
}

.installed {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ok);
  white-space: nowrap;
}

.more {
  display: flex;
  justify-content: center;
  padding: 6px 0 4px;
}

a {
  color: var(--accent);
}
</style>
