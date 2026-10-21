// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { createApp, h, ref, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import RemoteLogin from './components/RemoteLogin.vue'
import { router } from './router'
import './styles/app.css'
import { startI18n } from './i18n'
import { forgetToken, installRemoteVk, isRemote, keepToken, remoteToken } from './remote_vk'

let mounted: VueApp | undefined

function mountApp(): void {
  // the language first: the pages open in it
  void startI18n(isRemote()).then(() => {
    mounted = createApp(App).use(createPinia()).use(router)
    mounted.mount('#app')
  })
}

/** In a browser without a token, or with one the Mac refused: ask for it, then start the app with it. */
function mountLogin(refused: boolean): void {
  mounted?.unmount()
  const wasRefused = ref(refused)
  mounted = createApp({
    render: () => h(RemoteLogin, {
      refused: wasRefused.value,
      onToken: (token: string) => {
        keepToken(token)
        location.reload()
      },
    }),
  })
  void startI18n(isRemote()).then(() => mounted!.mount('#app'))
}

// the Mac refused the kept token: the page starts over without it and says so in the login
const REFUSED = 'vk-refused'

if (!isRemote()) {
  mountApp()
} else {
  const token = remoteToken()
  if (!token) {
    let refused = false
    try {
      refused = sessionStorage.getItem(REFUSED) === '1'
      sessionStorage.removeItem(REFUSED)
    } catch { /* storage blocked: the login just does not say why */ }
    mountLogin(refused)
  } else {
    let gone = false
    installRemoteVk(token, () => {
      // once: every call still on its way gets a 401 too, and a page with the refused token must not keep asking
      if (gone) return
      gone = true
      forgetToken()
      try { sessionStorage.setItem(REFUSED, '1') } catch { /* see above */ }
      location.reload()
    })
    mountApp()
  }
}
