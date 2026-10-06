// tokens.css defaults to dark: follow the system light / dark setting unless index.html sets data-theme
if (!document.documentElement.dataset.theme) {
  const mq = matchMedia('(prefers-color-scheme: light)')
  const set = () => (document.documentElement.dataset.theme = mq.matches ? 'light' : 'dark')
  set()
  mq.addEventListener('change', set)
}
