/**
 * Minimal observable store (no dependencies) + UI state, toasts, history.
 * Project data is mutated through `editorActions` which commits snapshots here.
 */

import { useSyncExternalStore } from 'react'
import { normalizeProject, newProject } from './model.js'

const listeners = new Set()

export const initialState = {
  view: 'dashboard', // dashboard | editor
  ready: false,
  project: null,
  projects: [],
  busy: null, // { label, progress }
  ui: {
    leftTab: 'media', // media | ai | effects
    rightTab: 'inspect', // inspect | captions | audio | export | global
    mobilePane: 'stage', // stage | media | tools
    selection: [], // clip ids
    selectedMedia: null,
    zoom: 68, // px per second
    snap: true,
    showLeft: true,
    showRight: true,
    timelineCollapsed: false,
    showShortcuts: false,
    showNewDialog: false,
    showHelp: false,
    autoScroll: true,
    dragging: null,
    analyzing: null,
    dictating: false,
    recording: false,
    playing: false,
    duration: 1,
    toastSeq: 0,
  },
  toasts: [],
  ai: { running: null, progress: 0, logs: [], lastResult: null },
  history: { past: [], future: [] },
  dirty: false,
}

let state = initialState

export function getState() {
  return state
}

export function subscribe(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch }
  if (next === state) return
  state = next
  listeners.forEach((l) => l())
}

export function patchUi(patch) {
  setState((s) => ({ ...s, ui: { ...s.ui, ...patch } }))
}

export function useStore(selector = (s) => s) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}

/* ------------------------------- toasts ----------------------------------- */

export function toast(message, kind = 'info', title = '') {
  const id = ++state.ui.toastSeq
  setState((s) => ({
    ...s,
    toasts: [...s.toasts, { id, message, kind, title }],
    ui: { ...s.ui, toastSeq: id },
  }))
  setTimeout(() => {
    setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }))
  }, kind === 'err' ? 6000 : 3600)
  return id
}

export function dismissToast(id) {
  setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }))
}

/* ------------------------------- busy ------------------------------------- */

export function setBusy(label, progress = 0) {
  setState((s) => ({ ...s, busy: label ? { label, progress } : null }))
}

export function setProgress(progress) {
  setState((s) => (s.busy ? { ...s, busy: { ...s.busy, progress } } : s))
}

/* ------------------------------ history ----------------------------------- */

const MAX_HISTORY = 40

function snapshot(project) {
  try {
    return JSON.stringify(project)
  } catch {
    return null
  }
}

/** Commit a project mutation. `mutator` receives a structured clone and may mutate it freely. */
export function commit(mutator, { history = true, label = '' } = {}) {
  const current = state.project
  if (!current) return
  const draft = JSON.parse(JSON.stringify(current))
  const result = mutator(draft) || draft
  const before = snapshot(current)
  const after = snapshot(result)
  if (before === after) return
  const past = history ? [...state.history.past, before].slice(-MAX_HISTORY) : state.history.past
  setState((s) => ({
    ...s,
    project: { ...result, updatedAt: Date.now() },
    history: { past, future: [] },
    dirty: true,
    lastLabel: label,
  }))
}

function pruneSelection(project, selection) {
  const ids = new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.id)))
  return selection.filter((id) => ids.has(id))
}

export function undo() {
  setState((s) => {
    if (!s.history.past.length || !s.project) return s
    const past = [...s.history.past]
    const prev = past.pop()
    const future = [snapshot(s.project), ...s.history.future].slice(0, MAX_HISTORY)
    const project = normalizeProject(JSON.parse(prev))
    return { ...s, project, history: { past, future }, dirty: true, ui: { ...s.ui, selection: pruneSelection(project, s.ui.selection) } }
  })
}

export function redo() {
  setState((s) => {
    if (!s.history.future.length || !s.project) return s
    const [next, ...future] = s.history.future
    const past = [...s.history.past, snapshot(s.project)].slice(-MAX_HISTORY)
    const project = normalizeProject(JSON.parse(next))
    return { ...s, project, history: { past, future }, dirty: true, ui: { ...s.ui, selection: pruneSelection(project, s.ui.selection) } }
  })
}

export function canUndo() {
  return state.history.past.length > 0
}
export function canRedo() {
  return state.history.future.length > 0
}

/* ------------------------------ project load ------------------------------ */

export function openProject(project) {
  const p = normalizeProject(project)
  setState((s) => ({
    ...s,
    view: 'editor',
    project: p,
    history: { past: [], future: [] },
    dirty: false,
    ui: { ...s.ui, selection: [], selectedMedia: p.media?.[0]?.id || null, playing: false },
  }))
}

export function closeProject() {
  setState((s) => ({ ...s, view: 'dashboard', project: null, dirty: false, ui: { ...s.ui, selection: [], playing: false } }))
}

export function markSaved() {
  setState((s) => ({ ...s, dirty: false }))
}

export function setProjects(list) {
  setState((s) => ({ ...s, projects: list }))
}

export function createProject(opts) {
  const p = newProject(opts)
  openProject(p)
  return p
}

/* --------------------------------- AI log --------------------------------- */

export function aiLog(entry) {
  setState((s) => ({
    ...s,
    ai: { ...s.ai, logs: [{ id: Math.random().toString(36).slice(2), at: Date.now(), ...entry }, ...s.ai.logs].slice(0, 60) },
  }))
}

export function aiRun(task) {
  setState((s) => ({ ...s, ai: { ...s.ai, running: task, progress: 0 } }))
}

export function aiProgress(progress) {
  setState((s) => ({ ...s, ai: { ...s.ai, progress } }))
}

export function aiFinish(result) {
  setState((s) => ({ ...s, ai: { ...s.ai, running: null, progress: 0, lastResult: result || null } }))
}
