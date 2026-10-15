import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { dict, detectLang } from './translations.js'

const I18nCtx = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(detectLang)

  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
    try {
      localStorage.setItem('laqta.lang', lang)
    } catch {
      /* storage might be blocked — ignore */
    }
  }, [lang, dir])

  const t = useCallback(
    (key, vars) => {
      let s = dict[lang]?.[key] ?? dict.ar[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
      }
      return s
    },
    [lang],
  )

  const value = useMemo(
    () => ({ lang, dir, t, toggle: () => setLang((l) => (l === 'ar' ? 'en' : 'ar')), setLang }),
    [lang, dir, t],
  )

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nCtx)
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider')
  return ctx
}

export function useT() {
  return useI18n().t
}

/** Arabic-aware number formatting (e.g. 12.4s → "12.4 ث") */
export function fmtTime(sec, { frames = 0, fps = 30 } = {}) {
  if (!isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const p = (n) => String(n).padStart(2, '0')
  let out = h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`
  if (frames) out += `.${p(Math.floor((sec % 1) * fps))}`
  return out
}

export function fmtDur(sec) {
  if (!isFinite(sec)) return '—'
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  return `${m}m ${Math.round(sec - m * 60)}s`
}

export function fmtSize(bytes) {
  if (!bytes) return '—'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}
