// ============================================
// KT App Entry Point
// Simplified main.tsx for browser-only KT chat
// ============================================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import { KtApp } from './KtApp'
import { themeStore } from './store/themeStore'

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual'
}

window.addEventListener('error', event => {
  console.error('[KT App] Uncaught error:', event.error)
  event.preventDefault()
})

window.addEventListener('unhandledrejection', event => {
  console.error('[KT App] Unhandled rejection:', event.reason)
  event.preventDefault()
})

themeStore.init()
if (!localStorage.getItem('theme-mode')) {
  themeStore.setColorMode('dark')
}
if (!localStorage.getItem('theme-preset')) {
  themeStore.setPreset('claude')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KtApp />
  </StrictMode>,
)
