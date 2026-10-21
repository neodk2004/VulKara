<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// One slider of a side panel: its name and value on a line, the slider below at full width. format turns the value into
// what is shown (fallback stands in while it is unset); hint adds a badge after the name.
import HintBadge from './HintBadge.vue'

const value = defineModel<number>()
defineProps<{ label: string; min: number; max: number; step: number; format: (v: number) => string; fallback?: number; hint?: string }>()
</script>

<template>
  <label class="slider">
    <span>{{ label }} <HintBadge v-if="hint" :text="hint" /></span>
    <b>{{ format(value ?? fallback ?? min) }}</b>
    <input v-model.number="value" type="range" :min="min" :max="max" :step="step" />
  </label>
</template>

<style scoped>
.slider {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px;
}

.slider b {
  font-weight: 500;
  color: var(--text-dim);
}

.slider input {
  grid-column: 1 / -1;
}
</style>
