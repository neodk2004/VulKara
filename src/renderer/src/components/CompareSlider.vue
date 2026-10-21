<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// Before and after over each other: left of the line the changed picture, right of it the original. The line is
// dragged (or moved with the arrow keys when focused); the pictures can be zoomed together (ZoomPan).
import { ref } from 'vue'
import ZoomPan from './ZoomPan.vue'
import { t } from '../i18n'

defineProps<{ before: string; after: string; beforeLabel?: string; afterLabel?: string }>()

const pos = ref(50)  // the line, in % of the width
const box = ref<HTMLElement>()
let moving = false

function at(event: PointerEvent): void {
  const r = box.value?.getBoundingClientRect()
  if (!r || !r.width) return
  pos.value = Math.min(100, Math.max(0, ((event.clientX - r.left) / r.width) * 100))
}

function down(event: PointerEvent): void {
  if (event.button !== 0) return
  moving = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  at(event)
}

function move(event: PointerEvent): void {
  if (moving) at(event)
}

function key(event: KeyboardEvent): void {
  const step = event.shiftKey ? 10 : 2
  if (event.key === 'ArrowLeft') pos.value = Math.max(0, pos.value - step)
  else if (event.key === 'ArrowRight') pos.value = Math.min(100, pos.value + step)
  else return
  event.preventDefault()
}
</script>

<template>
  <ZoomPan>
    <div
      ref="box" class="compare" @pointerdown="down" @pointermove="move"
      @pointerup="moving = false" @pointercancel="moving = false"
    >
      <img :src="after" class="pic" draggable="false" alt="" />
      <img :src="before" class="pic over" :style="{ clipPath: `inset(0 0 0 ${pos}%)` }" draggable="false" alt="" />
      <div
        class="line" :style="{ left: `${pos}%` }" role="slider" tabindex="0" :aria-label="t('edit.compare.slider')"
        :aria-valuenow="Math.round(pos)" aria-valuemin="0" aria-valuemax="100" @keydown="key"
      >
        <span class="grip" />
      </div>
      <span class="tag left">{{ afterLabel ?? t('edit.compare.restored') }}</span>
      <span class="tag right">{{ beforeLabel ?? t('edit.compare.original') }}</span>
    </div>
  </ZoomPan>
</template>

<style scoped>
.compare {
  position: relative;
  cursor: ew-resize;
  user-select: none;
  touch-action: none;
}

.pic {
  display: block;
  width: 100%;
  height: auto;
}

.over {
  position: absolute;
  inset: 0;
  height: 100%;
  object-fit: fill;
}

.line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 35%);
  outline: none;
}

.line:focus-visible {
  background: var(--accent);
}

.grip {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: rgb(0 0 0 / 45%);
  box-shadow: 0 1px 4px rgb(0 0 0 / 40%);
}

.tag {
  position: absolute;
  top: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}

.tag.left {
  left: 8px;
}

.tag.right {
  right: 8px;
}
</style>
