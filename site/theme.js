// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The landing page's only script: the appearance chosen in the header (like the system, light, dark), kept in this
// browser's local storage, and the copy button of the Homebrew command. Loaded in <head> so the page never flashes in
// the other appearance. Nothing leaves the browser.
(function () {
  var KEY = 'vk-theme'
  var root = document.documentElement
  function apply(t) {
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t)
    else root.removeAttribute('data-theme')
  }
  var saved = null
  try { saved = localStorage.getItem(KEY) } catch (e) {}
  apply(saved)

  document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('[data-set-theme]')
    function mark(t) {
      for (var i = 0; i < buttons.length; i++) {
        var v = buttons[i].getAttribute('data-set-theme')
        buttons[i].setAttribute('aria-pressed', String(v === (t || 'system')))
      }
    }
    mark(saved)
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        var t = this.getAttribute('data-set-theme')
        apply(t)
        mark(t)
        try {
          if (t === 'system') localStorage.removeItem(KEY)
          else localStorage.setItem(KEY, t)
        } catch (e) {}
      })
    }

    var copies = document.querySelectorAll('[data-copy]')
    for (var j = 0; j < copies.length; j++) {
      copies[j].addEventListener('click', function () {
        var b = this
        var label = b.getAttribute('aria-label')
        function done() {
          b.classList.add('done')
          b.setAttribute('aria-label', b.getAttribute('data-done'))
          setTimeout(function () { b.classList.remove('done'); b.setAttribute('aria-label', label) }, 1800)
        }
        // where the clipboard API is not allowed: the command is selected and copied the older way
        function fallback() {
          var code = b.parentNode.querySelector('code')
          var range = document.createRange()
          range.selectNodeContents(code)
          var sel = window.getSelection()
          sel.removeAllRanges()
          sel.addRange(range)
          try { if (document.execCommand('copy')) done() } catch (e) {}
        }
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(b.getAttribute('data-copy')).then(done, fallback)
        else fallback()
      })
    }
  })
})()
