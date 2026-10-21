<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// How many times larger a picture becomes: preset tiles (×1.5 … up to the model's own scale) and a slider in steps of
// 0.1 for anything between. Used by Enhance (enlarging photo tools) and Upscale.
import { computed } from 'vue'
import { num, t } from '../i18n'

const factor = defineModel<number>({ required: true })
const props = withDefaults(defineProps<{ max?: number }>(), { max: 4 })
const PRESETS = [1.5, 2, 2.2, 2.5, 3, 3.5, 4, 6, 8]
const presets = computed(() => PRESETS.filter((f) => f <= props.max))
</script>

<template>
  <div class="factor">
    <div class="tiles">
      <button v-for="f in presets" :key="f" class="tile" :class="{ on: Math.abs(factor - f) < 0.001 }" @click="factor = f">×{{ num(f, Number.isInteger(f) ? 0 : 1) }}</button>
    </div>
    <input v-model.number="factor" type="range" min="1.1" :max="max" step="0.1" :aria-label="t('generate.factor.enlargement')" />
  </div>
</template>

<style scoped>
.factor {
  display: grid;
  gap: 8px;
}

/* the presets as small tiles */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 6px;
}

.tile {
  padding: 7px 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  background: var(--surface);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.tile:hover {
  border-color: var(--text-dim);
}

.tile.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--surface) 88%, var(--accent));
  color: var(--accent);
}

input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
}
</style>
