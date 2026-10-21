<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0 · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
// The frame of every page: a title row (the window is moved there), the work area, and optionally a panel on
// the right for the settings of the page.
import { MessagesSquare } from 'lucide-vue-next'
import { DISCORD_URL } from '@shared/links'
import { isRemote } from '../remote_vk'
import { openLink } from '../util/links'
import { t } from '../i18n'

defineProps<{ title: string; subtitle?: string }>()
// the community is one click away on every page (not in the remote web UI, which cannot open the Mac's browser)
const community = !isRemote()
</script>

<template>
  <section class="page">
    <header class="head">
      <div>
        <h1>{{ title }}</h1>
        <p v-if="subtitle" class="dim">{{ subtitle }}</p>
      </div>
      <div class="actions">
        <slot name="actions" />
        <button v-if="community" type="button" class="btn community" :aria-label="t('nav.discord')" @click="openLink(DISCORD_URL)">
          <!-- i18n-ok: the service's name -->
          <MessagesSquare :size="15" :stroke-width="1.8" />Discord
        </button>
      </div>
    </header>
    <div class="body">
      <div class="work"><slot /></div>
      <aside v-if="$slots.panel" class="panel"><slot name="panel" /></aside>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: var(--titlebar);
  padding: 8px 24px;
  border-bottom: 1px solid var(--line);
  -webkit-app-region: drag;
}

.actions {
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.work {
  flex: 1;
  min-width: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  padding: 24px;
}

.panel {
  flex: none;
  width: 320px;
  overflow: hidden auto;
  overflow-wrap: anywhere;
  padding: 20px;
  background: var(--surface);
  border-left: 1px solid var(--line);
}

/* grids and flex rows in the panel may shrink below the width of their longest word */
.panel :deep(*) {
  min-width: 0;
}

@media (max-width: 860px) {
  .head {
    padding: 8px 16px 8px 56px;
  }
  .body {
    flex-direction: column;
    overflow: auto;
  }
  .work {
    overflow: visible;
    padding: 16px;
  }
  .panel {
    width: auto;
    border-left: none;
    border-top: 1px solid var(--line);
  }
}
</style>