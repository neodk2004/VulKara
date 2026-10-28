// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// The benchmarks page's tooltip: the figures of a chart row (data-tip) beside the pointer or the focused row. The
// page reads without it (every chart has its table). Nothing leaves the browser.
(function () {
  var tip
  function show(el, x, y) {
    if (!tip) {
      tip = document.createElement('div')
      tip.className = 'bx-tip'
      tip.setAttribute('role', 'tooltip')
      document.body.appendChild(tip)
    }
    tip.textContent = el.getAttribute('data-tip')
    tip.hidden = false
    var w = tip.offsetWidth, h = tip.offsetHeight
    tip.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 8)) + 'px'
    tip.style.top = Math.max(8, y - h - 12) + 'px'
  }
  function hide() { if (tip) tip.hidden = true }
  document.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]')
    if (el) show(el, e.clientX, e.clientY)
    else hide()
  })
  document.addEventListener('focusin', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]')
    if (!el) return hide()
    var r = el.getBoundingClientRect()
    show(el, r.left + r.width / 2, r.top)
  })
  document.addEventListener('focusout', hide)
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide() })
})()
