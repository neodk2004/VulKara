<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// Details behind a small badge; the text opens while the pointer is on it (or it has the focus). The system tooltip
// (title) does not show reliably in the app, so the text is a panel of its own.
//   (i), an orange ring: plain information (what a setting does, a prompt, where a file goes). The usual kind.
//   (!), a filled orange circle (notice): the app tells about something that differs from the standard or that it
//        changed on its own (values that differ from the model's, a sampler it replaced, a model it streams).
// above: the text opens above the badge (for badges near the bottom of the window); start: it opens to the right of the
// badge (for badges next to a title on the left), else to its left
// more: a second part below a line (licence, source), one entry per line ("\n")
// In a page's side panel (which cuts off what sticks out) the text opens centred over the whole panel instead, as
// wide as fits, above or below the badge as asked. In any other box that cuts off what sticks out (a card, a list that
// scrolls) it opens fixed in the window next to the badge.
import { ref } from 'vue'

const props = defineProps<{ text: string; more?: string; notice?: boolean; above?: boolean; start?: boolean }>()
const root = ref<HTMLElement>()
const placed = ref<Record<string, string>>()

/** The nearest box around el that cuts off what sticks out (a card, a list that scrolls). */
function clipping(el: HTMLElement): HTMLElement | undefined {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (/(hidden|auto|scroll|clip)/.test(s.overflow + s.overflowX + s.overflowY)) return p
  }
  return undefined
}

function place(): void {
  const el = root.value
  const side = el?.closest('aside.panel')
  if (el && !side && clipping(el)) {
    // inside a card or a scrolling list: the text opens fixed in the window next to the badge, so nothing cuts it off
    const badge = el.getBoundingClientRect()
    const width = Math.min(280, window.innerWidth - 16)
    const left = props.start ? badge.left - 8 : badge.right + 8 - width
    const room = window.innerHeight - badge.bottom
    const style: Record<string, string> = {
      position: 'fixed', right: 'auto', width: `${width}px`,
      left: `${Math.round(Math.max(8, Math.min(left, window.innerWidth - width - 8)))}px`,
    }
    if (props.above || room < 160) Object.assign(style, { top: 'auto', bottom: `${Math.round(window.innerHeight - badge.top + 6)}px` })
    else Object.assign(style, { top: `${Math.round(badge.bottom + 6)}px`, bottom: 'auto' })
    placed.value = style
    return
  }
  if (!el || !side) {
    placed.value = undefined
    return
  }
  const area = side.getBoundingClientRect()
  const badge = el.getBoundingClientRect()
  const width = Math.min(280, area.width - 16)
  const style: Record<string, string> = {
    position: 'fixed', left: `${Math.round(area.left + (area.width - width) / 2)}px`, right: 'auto', width: `${width}px`,
  }
  if (props.above) {
    Object.assign(style, { top: 'auto', bottom: `${Math.round(window.innerHeight - badge.top + 6)}px` })
  } else {
    Object.assign(style, { top: `${Math.round(badge.bottom + 6)}px`, bottom: 'auto' })
  }
  placed.value = style
}
</script>

<template>
  <!-- click.prevent: inside a <label> a click would switch the setting the label belongs to -->
  <span
    ref="root" class="hint" :class="{ above, start, notice }" tabindex="0" :aria-label="more ? `${text} ${more}` : text"
    @click.prevent @mouseenter="place" @focus="place"
  >
    <span class="mark" aria-hidden="true">{{ notice ? '!' : 'i' }}</span>
    <span class="panel" :style="placed" role="tooltip">{{ text }}<span v-if="more" class="more">{{ more }}</span></span>
  </span>
</template>

<style scoped>
.hint {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;
  vertical-align: middle;
  outline: none;
}

/* information: an orange ring with an "i" */
.mark {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 17px;
  height: 17px;
  border: 1.5px solid var(--accent);
  border-radius: 50%;
  background: none;
  color: var(--accent);
  font: 700 10.5px/1 Georgia, 'Times New Roman', serif;
  font-style: italic;
  cursor: default;
}

/* a notice: a filled orange circle with a "!" */
.notice .mark {
  border: 0;
  background: var(--accent);
  color: var(--accent-ink);
  font: 700 11px/1 var(--font);
  font-style: normal;
}

.hint:focus-visible .mark {
  box-shadow: 0 0 0 2px var(--accent-soft);
}

/* opens below, aligned to the right edge: the hints sit in the panel on the right of the window */
.panel {
  display: none;
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: -8px;
  width: 240px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
  background: var(--surface);
  box-shadow: var(--shadow);
  color: var(--text);
  font-size: 11.5px;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}

/* the second part, set apart by a line: smaller and dimmer, one entry per line */
.more {
  display: block;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  color: var(--text-dim);
  font-size: 11px;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

/* a bridge over the gap, so that the pointer can move into the panel */
.panel::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 0;
  right: 0;
  height: 8px;
}

.hint:hover .panel,
.hint:focus .panel {
  display: block;
}

.start .panel {
  right: auto;
  left: -8px;
}

.above .panel {
  top: auto;
  bottom: calc(100% + 6px);
}

.above .panel::before {
  top: auto;
  bottom: -8px;
}
</style>
