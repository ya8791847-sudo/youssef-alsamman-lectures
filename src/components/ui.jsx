import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/index.jsx'

/* --------------------------------- icons ---------------------------------- */

const PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  stop: 'M6 6h12v12H6z',
  scissors: 'M6 3l12 12M18 3L6 15M7 20a3 3 0 100-6 3 3 0 000 6zM17 20a3 3 0 100-6 3 3 0 000 6z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 19h14',
  upload: 'M12 20V9m0 0L8 13m4-4l4 4M5 5h14',
  film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4',
  music: 'M9 18V6l10-2v12M9 18a3 3 0 11-3-3M19 16a3 3 0 11-3-3',
  image: 'M3 5h18v14H3zM8 11a2 2 0 100-4 2 2 0 000 4zM4 18l5-5 4 4 3-3 4 4',
  text: 'M5 6h14M12 6v12M9 18h6',
  magic: 'M5 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM17 13l1 2.5L20.5 17 18 18l-1 2.5L16 18l-2.5-1L16 15.5z',
  wand: 'M15 4V2m0 20v-2M4.9 4.9L3.5 3.5m17 17l-1.4-1.4M2 15h2M20 15h2M6.3 17.7l11.4-11.4a2 2 0 10-2.8-2.8L3.5 14.9a2 2 0 102.8 2.8z',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3M9 21h6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5m5 5H10a6 6 0 000 12h3',
  save: 'M5 4h11l3 3v13H5zM8 4v6h7V4M8 20v-6h8v6',
  close: 'M6 6l12 12M18 6L6 18',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 010-4 1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 4.2a2 2 0 014 0 1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11a2 2 0 010 4z',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  eyeOff: 'M3 3l18 18M10.6 5.3A10.9 10.9 0 0112 5c6 0 10 7 10 7a17 17 0 01-3 3.8M6.6 6.6C3.9 8.3 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1',
  volume: 'M11 5L6 9H3v6h3l5 4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
  volumeOff: 'M11 5L6 9H3v6h3l5 4zM17 9l4 6M21 9l-4 6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 017-2.6',
  zoomIn: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3M11 8v6M8 11h6',
  zoomOut: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3M8 11h6',
  check: 'M4 12l5 5L20 6',
  alert: 'M12 3l9 17H3zM12 9v5M12 17h.01',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8h.01M11 12h1v5h1',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  sliders: 'M4 8h10M18 8h2M4 16h4M12 16h8M14 5v6M8 13v6',
  refresh: 'M21 12a9 9 0 11-3-6.7M21 4v5h-5',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  split: 'M12 3v18M7 8L3 12l4 4M17 8l4 4-4 4',
  mic2: 'M12 3v10m0 0a4 4 0 004-4V5a4 4 0 10-8 0v4a4 4 0 004 4zM6 11a6 6 0 0012 0',
  lightning: 'M13 2L4 14h6l-1 8 9-12h-6l1-8z',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 13a1 1 0 100-2 1 1 0 000 2z',
  crop: 'M6 2v14a2 2 0 002 2h14M2 6h14a2 2 0 012 2v14',
  wave: 'M2 12h2l2-6 3 12 3-9 3 6 2-3h5',
  palette: 'M12 21a9 9 0 110-18c5 0 9 3.6 9 8 0 2.5-2 4-4 4h-1.5a2 2 0 00-1.4 3.4A1.8 1.8 0 0112 21zM7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01',
  folder: 'M3 6h6l2 3h10v10H3z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l4 2',
  sparkles: 'M12 3l1.8 4.6L18 9.5l-4.2 1.9L12 16l-1.8-4.6L6 9.5l4.2-1.9zM18.5 15l.9 2.3 2.1.9-2.1.9-.9 2.4-.9-2.4-2.1-.9 2.1-.9z',
  micOff: 'M3 3l18 18M9 5a3 3 0 015.6 1.4M15 10.5V12a3 3 0 01-.5 1.7M12 18v3M8 21h8M5 11a7 7 0 0011 5.7',
  record: 'M12 19a7 7 0 100-14 7 7 0 000 14z',
  key: 'M14 7a3 3 0 116 0 3 3 0 01-6 0zM13.2 9.1L4 18.3V21h3.5l1.2-1.2v-1.6h1.6l1.2-1.2v-1.6h1.5l1.4-1.4',
}

export function Icon({ name, size = 16, className = '', fill = false, style = null }) {
  const p = PATHS[name] || PATHS.info
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      fill={fill && (name === 'play' || name === 'pause' || name === 'stop' || name === 'record') ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={p} />
    </svg>
  )
}

/* --------------------------------- modal ---------------------------------- */

export function Modal({ title, children, onClose, footer, size = '', className = '' }) {
  const t = useT()
  const boxRef = useRef(null)

  useEffect(() => {
    const opener = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      // keep the keyboard inside the dialog
      const root = boxRef.current
      if (!root) return
      const items = [...root.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    const body = document.body
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    // land on the first real field so nothing needs a mouse
    const target =
      boxRef.current?.querySelector('input, select, textarea') || boxRef.current?.querySelector('.modal-foot button') || boxRef.current
    try {
      target?.focus?.()
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener('keydown', onKey)
      body.style.overflow = prevOverflow
      if (opener && typeof opener.focus === 'function') opener.focus()
    }
  }, [onClose])

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className={`modal ${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={boxRef}
      >
        <div className="modal-head">
          <h3 style={{ fontSize: 15 }}>{title}</h3>
          <button className="btn icon ghost" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

/* -------------------------------- toaster --------------------------------- */

export function Toaster({ toasts, onDismiss }) {
  const t = useT()
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`} onClick={() => onDismiss(x.id)} role="status" title={t('common.close')}>
          {x.title ? <b>{t(x.title)}</b> : null}
          {t(x.message)}
        </div>
      ))}
    </div>
  )
}

/* -------------------------------- fields ---------------------------------- */

export function Section({ title, children, right = null, defaultOpen = true, icon = null }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="section">
      <h4
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((o) => !o))}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        style={{ cursor: 'pointer', justifyContent: 'space-between' }}
      >
        <span className="row gap-6">
          {icon ? <Icon name={icon} size={13} /> : null}
          {title}
        </span>
        <span className="row gap-6">
          {right}
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
        </span>
      </h4>
      {open ? <div>{children}</div> : null}
    </div>
  )
}

export function RangeField({ label, value, min, max, step = 1, onChange, suffix = '', format = null }) {
  const v = Number.isFinite(value) ? value : 0
  return (
    <label className="field">
      <span className="row between">
        <span>{label}</span>
        <span className="mono tiny dim">{format ? format(v) : `${Math.round(v * 100) / 100}${suffix}`}</span>
      </span>
      <div className="range-pair">
        <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(parseFloat(e.target.value))} />
        <output>{Math.round(v * 100) / 100}</output>
      </div>
    </label>
  )
}

export function NumberField({ label, value, min, max, step = 1, onChange, suffix = '' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          onChange(Number.isFinite(v) ? v : 0)
        }}
      />
      {suffix ? <span className="tiny muted">{suffix}</span> : null}
    </label>
  )
}

export function TextField({ label, value, onChange, placeholder = '', rows = 0, dir = null, mono = false }) {
  if (rows) {
    return (
      <label className="field">
        <span>{label}</span>
        <textarea className="input" rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir={dir} />
      </label>
    )
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        style={mono ? { fontFamily: 'var(--mono)' } : undefined}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
      />
    </label>
  )
}

export function SelectField({ label, value, onChange, options, translate = null }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value ?? o.id
          const lbl = typeof o === 'string' ? o : o.label ?? o.name
          return (
            <option key={val} value={val}>
              {translate ? translate(lbl) : lbl}
            </option>
          )
        })}
      </select>
    </label>
  )
}

export function SwitchField({ label, value, onChange, hint = null }) {
  return (
    <div className="row between gap-8" style={{ padding: '4px 0' }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
        {hint ? <div className="tiny muted">{hint}</div> : null}
      </div>
      <button className={`switch ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-label={label} />
    </div>
  )
}

export function ColorField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="row gap-8">
        <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} />
        <input className="input" style={{ fontFamily: 'var(--mono)' }} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    </label>
  )
}

export function Progress({ value }) {
  return (
    <div className="progress">
      <i style={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%` }} />
    </div>
  )
}

/** Drag-to-adjust numeric input used by the inspector. */
export function Scrubber({ value, onChange, step = 1, min = -Infinity, max = Infinity, label }) {
  const ref = useRef(null)
  const start = useRef(null)
  const onDown = (e) => {
    start.current = { x: e.clientX, v: value }
    const move = (ev) => {
      const dx = ev.clientX - start.current.x
      const delta = dx * step
      const next = Math.max(min, Math.min(max, start.current.v + (document.documentElement.dir === 'rtl' ? -delta : delta)))
      onChange(next)
    }
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      try {
        if (ev?.pointerId != null && e.currentTarget?.releasePointerCapture) e.currentTarget.releasePointerCapture(ev.pointerId)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  return (
    <div ref={ref} className="row between gap-8" style={{ cursor: 'ew-resize', userSelect: 'none', padding: '3px 0' }} onPointerDown={onDown}>
      <span className="tiny muted">{label}</span>
      <span className="mono tiny">{Math.round(value * 100) / 100}</span>
    </div>
  )
}

export function EmptyNote({ children }) {
  return <div className="empty-note">{children}</div>
}

export function Kbd({ children }) {
  return <kbd>{children}</kbd>
}
