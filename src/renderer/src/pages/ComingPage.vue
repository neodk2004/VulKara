<!-- SPDX-License-Identifier: AGPL-3.0-or-later · Copyright (C) 2026 Oliver Schmidt -->
<script setup lang="ts">
import { useRoute } from 'vue-router'
import PageFrame from '../components/PageFrame.vue'
import { t, type PlainKey } from '../i18n'

const route = useRoute()
</script>

<template>
  <PageFrame :title="route.meta.title ? t(route.meta.title as PlainKey) : ''">
    <p class="dim">{{ t('nav.coming') }}</p>
  </PageFrame>
</template>
