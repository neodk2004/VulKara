<!-- SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// The strip at the bottom: what is running, how long it takes, and the queue behind it.
import { jobLabel } from '../util/labels'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronUp, Cpu, Gpu, HardDrive, MemoryStick, Square, Trash2, X } from 'lucide-vue-next'
import { useAssetsStore } from '../stores/assets'
import { useQueueStore } from '../stores/queue'
import LevelMeter from './LevelMeter.vue'
import { gb, useSystemStore } from '../stores/system'
import { jobFacts, jobProgress, pageName } from '../util/format'
import { t } from '../i18n'

const queue = useQueueStore()
// what the Mac is doing, like a resource monitor: memory of VulKara and its engines, CPU, the streaming caches
const system = useSystemStore()
const router = useRouter()
onMounted(() => void system.start())
const open = ref(false)
// Esc closes the list of jobs
const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') open.value = false }
onMounted(() => window.addEventListener('keydown', key))
onBeforeUnmount(() => window.removeEventListener('keydown', key))
const listed = computed(() => [...queue.open, ...[...queue.finished].reverse().slice(0, 30)])
const assets = useAssetsStore()
const modelName = (dir: string): string => assets.titleOf(dir)
</script>

<template>
  <footer class="jobbar">
    <template v-if="queue.running">
      <div class="now">
        <strong>{{ queue.running.job.label ? jobLabel(queue.running.job.label) : pageName(queue.running.job.page) }}</strong>
        <span class="dim">{{ modelName(queue.running.job.modelDir) }}</span>
      </div>
      <div class="bar" :class="{ unknown: queue.running.progress <= 0 }">
        <i :style="queue.running.progress > 0 ? { width: queue.running.progress + '%' } : {}" />
      </div>
      <span class="progress">{{ jobProgress(queue.running) }}</span>
      <button class="btn small danger" :title="t('jobs.bar.stop')" @click="queue.cancel(queue.running.job.id)">
        <Square :size="11" /> {{ t('common.cancel') }}
      </button>
    </template>
    <span v-else class="dim idle">{{ queue.engineReady ? t('jobs.bar.ready') : t('jobs.bar.noRuntime') }}</span>

    <div v-if="system.stats" class="stats" role="button" tabindex="0" @click="router.push('/hardware')" @keydown.enter="router.push('/hardware')">
      <span class="chip"><MemoryStick :size="13" /> {{ gb(system.stats.appGb) }}</span>
      <span class="chip">
        <Cpu :size="13" />
        <LevelMeter :value="system.stats.cpuPercent" :segments="24" :width="2" :height="10" :gap="1" />
        {{ Math.round(system.stats.cpuPercent) }} %
      </span>
      <span v-if="system.stats.gpuPercent >= 0" class="chip">
        <Gpu :size="13" />
        <LevelMeter :value="system.stats.gpuPercent" :segments="24" :width="2" :height="10" :gap="1" />
        {{ Math.round(system.stats.gpuPercent) }} %
      </span>
      <span class="chip" :class="{ warn: system.stats.streamFreeGb > 0 && system.stats.streamFreeGb < 20 }">
        <HardDrive :size="13" /> {{ gb(system.stats.streamCacheGb) }} · {{ t('jobs.bar.free', { size: gb(system.stats.streamFreeGb) }) }}
      </span>
    </div>
    <button class="btn small ghost toggle" :class="{ active: open }" @click="open = !open">
      {{ t('jobs.bar.queue') }}
      <span v-if="queue.waiting.length" class="count">{{ queue.waiting.length }}</span>
      <ChevronUp :size="13" :class="{ turned: open }" />
    </button>

    <div v-if="open" class="panel card">
      <header>
        <h2>{{ t('jobs.bar.title') }}</h2>
        <button class="btn small ghost" :disabled="!queue.finished.length" @click="queue.clearFinished()">
          <Trash2 :size="12" /> {{ t('jobs.bar.clearFinished') }}
        </button>
      </header>
      <p v-if="!listed.length" class="dim empty">{{ t('jobs.bar.none') }}</p>
      <ul>
        <li v-for="q in listed" :key="q.job.id" :class="q.state">
          <div class="info">
            <div class="line">
              <strong>{{ q.job.label ? jobLabel(q.job.label) : pageName(q.job.page) }}</strong>
              <span class="dim">{{ modelName(q.job.modelDir) }}</span>
            </div>
            <div class="prompt">{{ q.job.prompt || t('jobs.bar.noPrompt') }}</div>
            <div class="dim">{{ jobFacts(q) }}</div>
            <div class="state">{{ jobProgress(q) }}</div>
          </div>
          <button
            class="btn small" :class="{ danger: q.state === 'running' }"
            :title="q.state === 'running' ? t('jobs.bar.stop') : t('jobs.bar.removeFromList')" @click="queue.cancel(q.job.id)"
          >
            <component :is="q.state === 'running' ? Square : X" :size="12" />
            {{ q.state === 'running' ? t('common.cancel') : t('common.remove') }}
          </button>
        </li>
      </ul>
    </div>
  </footer>
</template>

<style scoped>
.jobbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px 0 20px;
  background: var(--surface);
  border-top: 1px solid var(--line);
  min-width: 0;
}

.now {
  display: flex;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
}

.now span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar {
  flex: 1;
  min-width: 80px;
  max-width: 360px;
}

.progress {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.idle {
  flex: 1;
}

/* the resource chips: a click opens the Hardware page */
.stats {
  display: flex;
  gap: 6px;
  margin-left: auto;
  cursor: pointer;
  outline: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stats:hover .chip,
.stats:focus-visible .chip {
  color: var(--text);
}

.chip.warn {
  border-color: var(--accent);
  color: var(--accent);
}

.toggle {
  margin-left: 0;
}

.toggle.active {
  background: var(--surface-2);
}

.count {
  min-width: 17px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}

.turned {
  transform: rotate(180deg);
}

.panel {
  position: absolute;
  right: 12px;
  bottom: calc(var(--jobbar) + 6px);
  width: 440px;
  max-height: min(560px, 70vh);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
  z-index: 20;
}

.panel header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--line);
}

.empty {
  padding: 18px 16px;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
}

li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  border-left: 3px solid transparent;
}

li + li {
  border-top: 1px solid var(--line);
}

li.running {
  border-left-color: var(--accent);
}

li.failed .state {
  color: var(--danger);
}

li.done .state {
  color: var(--ok);
}

.info {
  flex: 1;
  min-width: 0;
}

.line {
  display: flex;
  gap: 8px;
  white-space: nowrap;
}

.line span,
.prompt {
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt {
  white-space: nowrap;
}

.state {
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
</style>
