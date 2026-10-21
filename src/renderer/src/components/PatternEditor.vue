<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// The hidden pattern of an illusion: a spiral, rings, a checkerboard, stripes, a word or an own picture, drawn
// in black and white in the size of the result. Light parts of the pattern become bright in the picture, dark
// parts dark.
import { onMounted, reactive, ref, watch } from 'vue'
import { pickImage } from '../util/pick_image'
import { t, type PlainKey } from '../i18n'

type Kind = 'spiral' | 'rings' | 'checker' | 'stripes' | 'text' | 'image'
const KINDS: { id: Kind; title: PlainKey }[] = [
  { id: 'spiral', title: 'edit.pattern.spiral' }, { id: 'rings', title: 'edit.pattern.rings' }, { id: 'checker', title: 'edit.pattern.checker' },
  { id: 'stripes', title: 'edit.pattern.stripes' }, { id: 'text', title: 'edit.pattern.text' }, { id: 'image', title: 'edit.pattern.image' },
]
const STORE_KEY = 'vk.pattern'

const props = defineProps<{ width: number; height: number }>()
const canvas = ref<HTMLCanvasElement>()
const state = reactive({ kind: 'spiral' as Kind, text: 'HELLO', density: 8, invert: false, blur: 3, image: '' })
try {
  Object.assign(state, JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}'))
} catch {
  // unreadable: the standard pattern
}
let picture: HTMLImageElement | undefined

function loadPicture(): Promise<void> {
  return new Promise((resolve) => {
    const wanted = state.image
    if (!wanted) {
      picture = undefined
      return resolve()
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'  // keeps the canvas readable
    img.onload = () => {
      // a picture chosen meanwhile wins over this one
      if (state.image === wanted) picture = img
      resolve()
    }
    img.onerror = () => {
      if (state.image === wanted) picture = undefined
      resolve()
    }
    img.src = window.vk.files.url(wanted)
  })
}

function draw(): void {
  const c = canvas.value
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return
  const [w, h] = [props.width, props.height]
  ;[c.width, c.height] = [w, h]
  ctx.filter = 'none'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  const reach = Math.hypot(w, h) / 2
  const n = state.density
  if (state.kind === 'image') {
    if (picture) {
      // covers the canvas in its own proportions, in grey
      const s = Math.max(w / picture.width, h / picture.height)
      ctx.filter = 'grayscale(1) contrast(1.3)'
      ctx.drawImage(picture, (w - picture.width * s) / 2, (h - picture.height * s) / 2, picture.width * s, picture.height * s)
    }
  } else {
    ctx.filter = state.blur ? `blur(${(state.blur * Math.max(w, h)) / 1024}px)` : 'none'
    ctx.fillStyle = ctx.strokeStyle = '#000'
    if (state.kind === 'spiral') {
      // two arms of an Archimedean spiral, as wide as the gap between them
      const turns = n / 2
      ctx.lineWidth = reach / turns / 4
      for (let arm = 0; arm < 2; arm++) {
        ctx.beginPath()
        for (let u = 0; u <= 1.0001; u += 0.002) {
          const angle = u * turns * 2 * Math.PI + arm * Math.PI
          const [x, y] = [cx + u * reach * Math.cos(angle), cy + u * reach * Math.sin(angle)]
          if (u === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    } else if (state.kind === 'rings') {
      const step = reach / n
      ctx.lineWidth = step / 2
      for (let i = 1; i <= n; i++) {
        ctx.beginPath()
        ctx.arc(cx, cy, i * step - step / 4, 0, 2 * Math.PI)
        ctx.stroke()
      }
    } else if (state.kind === 'checker') {
      const s = Math.max(w, h) / n
      for (let y = 0; y * s < h; y++) for (let x = 0; x * s < w; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * s, y * s, s, s)
    } else if (state.kind === 'stripes') {
      const s = w / n
      for (let x = 0; x < n; x += 2) ctx.fillRect(x * s, 0, s, h)
    } else {
      const text = (state.text || ' ').toUpperCase()
      const size = Math.min(h * 0.55, ((w * 0.9) / Math.max(1, text.length)) * 1.45)
      ctx.font = `900 ${size}px Helvetica, Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, cx, cy)
    }
  }
  ctx.filter = 'none'
  if (state.invert) {
    ctx.globalCompositeOperation = 'difference'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
  }
}

async function chooseImage(): Promise<void> {
  const chosen = await pickImage()
  if (chosen) state.image = chosen
}

function setKind(kind: Kind): void {
  state.kind = kind
  if (kind === 'image' && !state.image) void chooseImage()
}

onMounted(async () => {
  await loadPicture()
  draw()
})
watch(() => state.image, async () => {
  await loadPicture()
  draw()
})
watch([() => props.width, () => props.height, () => state.kind, () => state.text, () => state.density, () => state.invert, () => state.blur], draw)
watch(state, () => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch {
    // not remembered then
  }
})

/** The pattern as PNG data URL in the size of the result. */
function exportPattern(): string | undefined {
  draw()
  return canvas.value?.toDataURL('image/png')
}
defineExpose({ exportPattern })
</script>

<template>
  <div class="pattern card">
    <canvas ref="canvas" :style="{ aspectRatio: `${width} / ${height}` }" />
    <div class="controls">
      <div>
        <h2>{{ t('edit.pattern.title') }}</h2>
        <p class="dim">{{ t('edit.pattern.intro') }}</p>
      </div>
      <div class="chips">
        <button v-for="k in KINDS" :key="k.id" class="chip" :class="{ on: state.kind === k.id }" @click="setKind(k.id)">{{ t(k.title) }}</button>
      </div>
      <input v-if="state.kind === 'text'" v-model="state.text" type="text" maxlength="24" :placeholder="t('edit.pattern.textPlaceholder')" spellcheck="false" />
      <div v-else-if="state.kind === 'image'" class="line">
        <button class="btn small" @click="chooseImage">{{ t('edit.pattern.choose') }}</button>
        <span class="dim name">{{ state.image.split('/').pop() || t('edit.pattern.imageHint') }}</span>
      </div>
      <label v-else class="line">{{ t('edit.pattern.density') }} <input v-model.number="state.density" type="range" min="2" max="24" /></label>
      <label v-if="state.kind !== 'image'" class="line">{{ t('edit.pattern.blur') }} <input v-model.number="state.blur" type="range" min="0" max="12" /></label>
      <label class="line check"><input v-model="state.invert" type="checkbox" /> {{ t('edit.pattern.invert') }}</label>
    </div>
  </div>
</template>

<style scoped>
.pattern {
  display: flex;
  gap: 16px;
  padding: 12px;
}

canvas {
  flex: none;
  height: 220px;
  max-width: 50%;
  border-radius: var(--radius-s);
  border: 1px solid var(--line);
  object-fit: contain;
}

.controls {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 10px;
  align-content: start;
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 360px;
}

.line input[type='range'] {
  flex: 1;
  accent-color: var(--accent);
}

.check input {
  accent-color: var(--accent);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

input[type='text'] {
  max-width: 360px;
}
</style>
