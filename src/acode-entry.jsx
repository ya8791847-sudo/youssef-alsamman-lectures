/**
 * Entry point for the standalone (single-file) build used by Acode / any
 * offline Android WebView. The CSS is injected at runtime because the whole
 * bundle lives inside one HTML file.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import css from './styles/global.css'

const style = document.createElement('style')
style.setAttribute('data-laqta-css', '1')
style.textContent = css
document.head.appendChild(style)

// environment flag — the UI can adapt when running as a standalone file
window.__LAQTA_STANDALONE__ = true

const root = document.getElementById('root')
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// hide the boot splash if the template has one
const splash = document.getElementById('laqta-splash')
if (splash) {
  splash.style.opacity = '0'
  setTimeout(() => splash.remove(), 320)
}
