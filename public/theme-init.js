// Set the theme before first paint to avoid a light/dark flash. Mirrors theme/themeStore.ts.
;(function () {
  var t = null
  try {
    t = localStorage.getItem('qc-theme')
  } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.dataset.theme = t
})()
