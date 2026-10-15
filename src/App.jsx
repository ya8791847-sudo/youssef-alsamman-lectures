import { useEffect } from 'react'
import { I18nProvider, useI18n } from './i18n/index.jsx'
import { useStore, getState, setState, toast, dismissToast, patchUi, markSaved, openProject } from './store/store.js'
import { hydrateProjectMedia, saveProject } from './store/media.js'
import { requestPersistent, idb } from './store/idb.js'
import { Toaster } from './components/ui.jsx'
import Dashboard from './components/Dashboard.jsx'
import Editor from './components/editor/Editor.jsx'

function Shell() {
  const { t } = useI18n()
  const view = useStore((s) => s.view)
  const toasts = useStore((s) => s.toasts)
  const ready = useStore((s) => s.ready)

  // boot: restore the last session (project + media blobs) from IndexedDB
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      requestPersistent()
      const saved = Number(localStorage.getItem('laqta.lastProject') || 0)
      setState({ ready: true })
      if (saved) {
        try {
          const project = await idb.get('projects', localStorage.getItem('laqta.lastProjectId'))
          if (project && !cancelled) {
            await hydrateProjectMedia(project)
            openProject(project)
            toast('toast.importedProject', 'ok', t('nav.projects'))
          }
        } catch {
          /* start on the dashboard */
        }
      }
      window.addEventListener('beforeunload', () => {
        const p = getState().project
        if (p) {
          localStorage.setItem('laqta.lastProjectId', p.id)
          saveProject(p).catch(() => {})
        }
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (getState().dirty) {
        saveProject(getState().project).then(() => markSaved()).catch(() => {})
      }
      void e
    }
    window.addEventListener('pagehide', handler)
    return () => window.removeEventListener('pagehide', handler)
  }, [])

  return (
    <>
      {view === 'editor' ? <Editor /> : <Dashboard />}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
      {!ready ? null : null}
      <FooterHint />
    </>
  )
}

function FooterHint() {
  const { t, toggle, lang } = useI18n()
  const view = useStore((s) => s.view)
  if (view === 'editor') return null
  return (
    <button
      className="btn sm ghost"
      style={{ position: 'fixed', bottom: 14, insetInlineEnd: 14, zIndex: 40 }}
      onClick={() => {
        toggle()
        void lang
      }}
      title={t('nav.lang')}
    >
      {t('nav.lang')}
    </button>
  )
}

export default function App() {
  useEffect(() => {
    const onError = (e) => {
      if (String(e.message || '').includes('ResizeObserver')) return
      console.error(e)
    }
    window.addEventListener('error', onError)
    return () => window.removeEventListener('error', onError)
  }, [])

  return (
    <I18nProvider>
      <Shell />
      <GlobalKeys />
    </I18nProvider>
  )
}

function GlobalKeys() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') patchUi({ showNewDialog: false, showShortcuts: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}
