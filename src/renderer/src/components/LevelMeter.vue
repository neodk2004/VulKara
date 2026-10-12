<!-- SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// A level meter of separate segments, like a hardware monitor's: value in percent, lit from the left.
withDefaults(defineProps<{ value: number; segments?: number; height?: number; width?: number; gap?: number }>(), { segments: 20, height: 10, width: 2, gap: 1 })
</script>

<template>
  <span class="level" :style="{ gap: `${gap}px` }" :aria-label="`${Math.round(value)} %`" role="img">
    <b
      v-for="n in segments" :key="n" :class="{ on: value >= (n - 0.5) * (100 / segments) }"
      :style="{ width: `${width}px`, height: `${height}px` }"
    />
  </span>
</template>

<style scoped>
.level {
  display: inline-flex;
  vertical-align: middle;
}

.level b {
  border-radius: 1px;
  background: color-mix(in srgb, var(--text-dim) 25%, transparent);
}

.level b.on {
  background: var(--accent);
}
</style>
