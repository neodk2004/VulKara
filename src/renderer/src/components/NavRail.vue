<!-- SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SHOWN as PAGES, type PageEntry } from '../router'
import { useRuntimesStore } from '../stores/runtimes'
import { t } from '../i18n'

const runtimes = useRuntimesStore()

// what a page is for, top to bottom: start, make something new, change a picture, tools around it, the collection
const GROUPS: PageEntry['group'][] = ['start', 'create', 'edit', 'tools', 'library']
const groups = GROUPS.map((g) => ({ id: g, pages: PAGES.filter((p) => p.group === g) }))
const appPages = PAGES.filter((p) => p.group === 'app')

// a window too low for the groups in one column: two columns, and the rail gets wider for them (--rail of the app's
// grid); back to one column once the window is high enough again. Decided by the height of the whole rail (the
// window's), never by the groups' area: that area changes with the layout itself (the app icons at the bottom take
// two rows in the narrow rail, one in the wide one), which would switch back and forth at the limit.
const rail = ref<HTMLElement>()
const scroll = ref<HTMLElement>()
const twoColumns = ref(false)
/** the rail height one column needs (measured while in one column) */
let oneColumnNeeds = 0
const RAIL_ONE = '86px'
const RAIL_TWO = '150px'
// back to one column only with some room to spare
const HYSTERESIS = 16

function fit(): void {
  const nav = rail.value
  const el = scroll.value
  if (!nav || !el) return
  const before = twoColumns.value
  if (!twoColumns.value) {
    const overflow = el.scrollHeight - el.clientHeight
    if (overflow > 1) {
      oneColumnNeeds = nav.clientHeight + overflow
      twoColumns.value = true
    }
  } else if (nav.clientHeight >= oneColumnNeeds + HYSTERESIS) {
    twoColumns.value = false
  }
  // the app's grid changes only when the columns do: setting it on every resize lays the whole page out anew each time
  if (twoColumns.value !== before || !railSet) {
    document.documentElement.style.setProperty('--rail', twoColumns.value ? RAIL_TWO : RAIL_ONE)
    railSet = true
  }
}

let railSet = false
let frame = 0
let observer: ResizeObserver | undefined
onMounted(() => {
  // one check per frame while the window is being resized; the rail's own height is what counts
  observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(fit)
  })
  if (rail.value) observer.observe(rail.value)
  fit()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  observer?.disconnect()
})
</script>

<template>
  <nav ref="rail" class="rail">
    <div class="drag" />
    <div ref="scroll" class="scroll" :class="{ two: twoColumns }">
      <div v-for="group in groups" :key="group.id" class="group" :class="group.id">
        <RouterLink v-for="p in group.pages" :key="p.path" :to="p.path" class="item" :title="t(p.title)">
          <component :is="p.icon" :size="19" :stroke-width="1.7" />
          <span>{{ t(p.title) }}</span>
        </RouterLink>
      </div>
    </div>
    <div class="group bottom">
      <RouterLink
        v-for="p in appPages" :key="p.path" :to="p.path" class="item compact"
        :title="p.path === '/settings' && runtimes.anyUpdate ? t('nav.runtimeUpdate', { page: t(p.title) }) : t(p.title)"
      >
        <component :is="p.icon" :size="17" :stroke-width="1.7" />
        <i v-if="p.path === '/settings' && runtimes.anyUpdate" class="dot" />
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--line);
  min-height: 0;
}

/* room for the window buttons; the window is moved here */
.drag {
  height: var(--titlebar);
  flex: none;
  -webkit-app-region: drag;
}

/* in a low window the groups scroll; the scroll bar only shows then */
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-gutter: auto;
  padding: 0 5px 4px;
}

.group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 0;
  border-radius: var(--radius-m);
}

.group + .group {
  margin-top: 5px;
}

/* one tint per group, mixed into the theme's surface so it works light and dark */
/* two columns in a low window */
.scroll.two .group {
  display: grid;
  grid-template-columns: repeat(2, 64px);
  justify-content: center;
  column-gap: 2px;
}

.group.start {
  background: color-mix(in srgb, var(--surface) 90%, #e8a33d);
}

.group.create {
  background: color-mix(in srgb, var(--surface) 90%, #4f8cff);
}

.group.edit {
  background: color-mix(in srgb, var(--surface) 90%, #2bb5a8);
}

.group.tools {
  background: color-mix(in srgb, var(--surface) 90%, #a66bff);
}

.group.library {
  background: color-mix(in srgb, var(--surface) 90%, #3fbf8a);
}

.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 64px;
  padding: 7px 0 5px;
  border-radius: var(--radius-m);
  color: var(--text-dim);
  text-decoration: none;
  font-size: 10.5px;
  -webkit-user-drag: none;
}

.item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.item.router-link-exact-active {
  background: var(--accent-soft);
  color: var(--accent);
}

/* the app's own pages: small icons, three to a row */
.bottom {
  flex: none;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  padding: 6px 2px 8px;
  gap: 2px;
}

.item.compact {
  position: relative;
  width: 24px;
  padding: 5px 0;
}

/* a runtime update is available */
.dot {
  position: absolute;
  top: 3px;
  right: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 1.5px var(--surface);
}
</style>
