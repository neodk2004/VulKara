// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The job queue as the pages see it: snapshots of the queue in the main process.

import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { QueuedJob } from '@shared/api'
import type { Job } from '@shared/types'

export const useQueueStore = defineStore('queue', () => {
  const jobs = ref<QueuedJob[]>([])
  const engineReady = ref(false)

  const running = computed(() => jobs.value.find((j) => j.state === 'running'))
  const waiting = computed(() => jobs.value.filter((j) => j.state === 'waiting'))
  const finished = computed(() => jobs.value.filter((j) => j.state !== 'running' && j.state !== 'waiting'))
  const open = computed(() => jobs.value.filter((j) => j.state === 'running' || j.state === 'waiting'))

  let started = false
  async function start(): Promise<void> {
    if (started) return
    started = true
    // a change that arrives while the first snapshot is on its way is newer than that snapshot
    let changed = false
    window.vk.queue.onChange((s) => {
      changed = true
      jobs.value = s.jobs
      engineReady.value = s.engineReady
    })
    const s = await window.vk.queue.snapshot()
    if (changed) return
    jobs.value = s.jobs
    engineReady.value = s.engineReady
  }

  const add = (job: Omit<Job, 'id'>, count = 1): Promise<string[]> => window.vk.queue.add(job, count)
  const cancel = (id: string): Promise<void> => window.vk.queue.cancel(id)
  const clearFinished = (): Promise<void> => window.vk.queue.clearFinished()
  // results taken out of the lists of recent results; the files and their history entries stay
  const dismissed = reactive(new Set<string>())
  const shown = (q: QueuedJob): string[] => q.results.filter((f) => !dismissed.has(f))
  /** Takes one result out of the recent results; a job without any left leaves the list. */
  function dismiss(q: QueuedJob, file: string): Promise<void> | undefined {
    dismissed.add(file)
    // a job that is still running keeps going (and keeps its tile with Cancel)
    return shown(q).length || q.state === 'running' || q.state === 'waiting' ? undefined : cancel(q.job.id)
  }
  /** the jobs of one page, newest first */
  const ofPage = (page: string): QueuedJob[] => jobs.value.filter((j) => j.job.page === page).reverse()

  return { jobs, engineReady, running, waiting, finished, open, start, add, cancel, clearFinished, ofPage, shown, dismiss }
})
