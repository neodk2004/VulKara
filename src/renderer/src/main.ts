// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './styles/app.css'
import { startI18n } from './i18n'

// the language first: the pages open in it
void startI18n().then(() => createApp(App).use(createPinia()).use(router).mount('#app'))
