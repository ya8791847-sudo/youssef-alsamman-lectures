/**
 * Laqta Copilot — natural-language → actions (Arabic + English), fully local.
 * Understands montage requests such as "احذف الصمت وسرّع 1.2x" or
 * "make a 30s highlight with captions".
 */

import { runTool } from './tools.js'
import * as A from '../../store/editorActions.js'
import { updateClip } from '../../store/editorActions.js'
import { getState, toast, aiLog, patchUi, undo, redo } from '../../store/store.js'
import { engine } from '../player.js'
import { FILTERS, MUSIC_STYLES, VOICE_PRESETS } from '../presets.js'
import { totalDuration } from '../../store/model.js'

const RULES = [
  {
    id: 'silence',
    tool: 'silence',
    words: ['صمت', 'السكتات', 'سكتات', 'الوقفات', 'امسح الفراغ', 'silence', 'silences', 'pauses', 'dead air'],
  },
  { id: 'scenes', tool: 'scenes', words: ['مشاهد', 'مشهد', 'قسّم', 'تقسيم', 'scenes', 'scene', 'split into scenes'] },
  { id: 'beats', tool: 'beats', words: ['إيقاع', 'ايقاع', 'النبض', 'نبضات', 'beat', 'beats', 'on the music'] },
  {
    id: 'reframe',
    tool: 'reframe',
    words: ['ريلز', 'ريل', 'عمودي', 'رأسية', 'تيك توك', 'تيكتوك', 'شورت', 'شورتس', 'reels', 'vertical', 'tiktok', 'shorts', '9:16', '9x16'],
  },
  {
    id: 'enhance',
    tool: 'enhance',
    words: ['لون', 'ألوان', 'الوان', 'فلتر', 'تحسين الصورة', 'color', 'colour', 'grade', 'enhance', 'filter'],
  },
  { id: 'captions', tool: 'captions', words: ['كابشن', 'ترجمة', 'سبتايتل', 'subtitles', 'caption', 'captions', 'srt'] },
  { id: 'highlight', tool: 'highlight', words: ['هايلايت', 'ملخص', 'أفضل اللحظات', 'افضل اللحظات', 'highlight', 'summary', 'best moments'] },
  { id: 'thumbnail', tool: 'thumbnail', words: ['غلاف', 'صورة مصغرة', 'ثامب', 'thumbnail', 'poster', 'cover'] },
  { id: 'voice', tool: 'voice', words: ['تنقية الصوت', 'نشاز', 'ضوضاء', 'وضوح الصوت', 'clean audio', 'noise', 'denoise', 'voice'] },
  { id: 'autofx', tool: 'autofx', words: ['مؤثرات', 'حركة', 'اهتزاز', 'زوم', 'zoom punch', 'effects', 'motion'] },
  { id: 'chroma', tool: 'chroma', words: ['خلفية خضراء', 'جرين سكرين', 'شيل الخلفية', 'ازالة الخلفية', 'green screen', 'chroma', 'remove background'] },
  { id: 'writer', tool: 'writer', words: ['عنوان', 'عناوين', 'وصف', 'هاشتاج', 'هاشتاجات', 'title', 'description', 'hashtags', 'seo'] },
  { id: 'music', tool: 'music', words: ['موسيقى', 'خلفية موسيقية', 'music', 'soundtrack', 'bgm'] },
  { id: 'titlecard', tool: 'titlecard', words: ['كارت', 'تتر', 'مقدمة', 'title card', 'intro card', 'opening'] },
]

const SPLIT_RE = /\s*(?:\+|،|,| ثم | وبعدين | و بعدين | then |;|\band\b)\s*/i

const NUM_WORDS = {
  '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '١٠': '10',
  واحد: '1', تنين: '2', اثنين: '2', اتنين: '2', تلاتة: '3', تلاته: '3', ثلاثة: '3', أربعة: '4', اربعة: '4',
  خمسة: '5', ستة: '6', سبعة: '7', تمانية: '8', تمانيه: '8', تسعة: '9', عشرة: '10',
  one: '1', two: '2', three: '3', five: '5', ten: '10', fifteen: '15', thirty: '30', sixty: '60',
}

function normalize(text) {
  let s = String(text || '').toLowerCase()
  for (const [k, v] of Object.entries(NUM_WORDS)) s = s.split(k).join(v)
  return s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ـ+/g, '')
    .replace(/\s+/g, ' ')
}

function extractNumber(text, fallback = null) {
  const m = /\b(\d+(?:[.,]\d+)?)\b/.exec(text)
  if (!m) return fallback
  return parseFloat(m[1].replace(',', '.'))
}

function extractDuration(text) {
  const m = /(\d+(?:[.,]\d+)?)\s*(ث|ثانية|ثواني|s|sec|secs|second|seconds|دقيقة|دقايق|min|minute|minutes)/i.exec(text)
  if (!m) return null
  const v = parseFloat(m[1].replace(',', '.'))
  const unit = m[2].toLowerCase()
  if (/دقيق|min/.test(unit)) return v * 60
  return v
}

function extractQuoted(text) {
  const m = /["“«]([^"”»]+)["”»]/.exec(text)
  if (m) return m[1].trim()
  const colon = /[:：]\s*(.+)$/.exec(text)
  if (colon && colon[1].length > 2) return colon[1].trim()
  return null
}

const FILTER_STOPWORDS = new Set(['فلتر', 'بدون', 'تحسين', 'تلقائي', 'filter', 'no', 'auto', 'enhance', 'غير'])

function styleFor(text) {
  const t = normalize(text)
  for (const f of FILTERS) {
    if (f.id === 'none') continue
    const name = normalize(`${f.name.ar} ${f.name.en}`)
    const hit = name
      .split(/\s+/)
      .filter((w) => w.length > 3 && !FILTER_STOPWORDS.has(w))
      .some((w) => t.includes(w))
    if (hit) return f.id
  }
  if (/سينمايي|سينمائي|cinematic/.test(t)) return 'cinema'
  if (/دافي|دافئ|دافي|warm/.test(t)) return 'warm'
  if (/بارد|cold|blue/.test(t)) return 'cold'
  if (/ابيض واسود|black and white|bw|noir/.test(t)) return 'noir'
  if (/نيون|neon/.test(t)) return 'neon'
  if (/قوي|punch/.test(t)) return 'punch'
  if (/حالم|dream/.test(t)) return 'dream'
  return null
}

const COMMAND_HINTS = [
  ...RULES.flatMap((r) => r.words),
  'تراجع', 'اعادة', 'سرع', 'بطي', 'اقطع', 'احذف', 'كتم', 'علامة', 'تصدير', 'undo', 'redo', 'speed', 'split', 'mute', 'export',
]

function looksLikeCommand(piece) {
  const n = normalize(piece)
  return COMMAND_HINTS.some((w) => {
    const nw = normalize(w)
    return nw.length > 1 && n.includes(nw.trim())
  })
}

/** Split a request into independent sub-commands. */
export function splitRequest(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const parts = raw.split(SPLIT_RE).map((s) => s.trim()).filter((s) => s.length > 1)
  if (parts.length > 1) return parts
  // Arabic often glues the conjunction: "امسح الصمت وسرّع الكلام"
  const glued = raw.split(/\s+و(?=[\u0600-\u06FFa-zA-Z])/)
  if (glued.length > 1) {
    const pieces = glued.map((s) => s.trim()).filter((s) => s.length > 1)
    if (pieces.length > 1 && pieces.slice(1).every(looksLikeCommand)) return pieces
  }
  return parts.length ? parts : [raw]
}

/** Parse one sub-command into a plan item. */
export function parseOne(text) {
  const n = normalize(text)
  const scores = RULES.map((r) => {
    let score = 0
    for (const w of r.words) if (n.includes(normalize(w))) score += w.length > 4 ? 3 : 2
    return { rule: r, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  const params = {}
  const dur = extractDuration(n)
  const num = extractNumber(n)

  if (scores.length) {
    const rule = scores[0].rule
    if (rule.id === 'silence') {
      if (/حساس/.test(n) && num) params.sensitivity = Math.min(95, Math.max(10, num))
      if (dur) params.minSilence = Math.min(2, Math.max(0.15, dur))
    }
    if (rule.id === 'highlight') {
      if (dur) params.length = Math.min(300, Math.max(5, dur))
      else if (/دقيقة|min/.test(n) && num) params.length = num * 60
      else params.length = 30
    }
    if (rule.id === 'music') {
      if (dur) params.length = Math.min(300, Math.max(5, dur))
      for (const s of MUSIC_STYLES) {
        const nm = (s.name.ar + ' ' + s.name.en).toLowerCase()
        if (nm.split(' ').some((w) => w.length > 2 && n.includes(w))) params.style = s.id
      }
    }
    if (rule.id === 'voice') {
      for (const v of VOICE_PRESETS) {
        const nm = (v.name.ar + ' ' + v.name.en).toLowerCase()
        if (nm.split(' ').some((w) => w.length > 3 && n.includes(w))) params.profile = v.id
      }
      if (/ستوديو|studio/.test(n)) params.profile = 'studio'
      if (/بودكاست|podcast/.test(n)) params.profile = 'podcast'
      if (/راديو|radio/.test(n)) params.profile = 'radio'
      if (/تليفون|مكالمة|phone/.test(n)) params.profile = 'phone'
      if (!params.profile) params.profile = 'clean'
    }
    if (rule.id === 'enhance') {
      const f = styleFor(n)
      if (f) {
        // a named filter is an instant action rather than the auto analysis
        return { kind: 'filter', filter: f, text }
      }
      params.strength = /قوي|strong|max/.test(n) ? 130 : 100
    }
    if (rule.id === 'captions') {
      const q = extractQuoted(text)
      if (q) params.text = q.split(/\s*[|،]\s*/).join('\n')
      params.style = /كاريوكي|karaoke/.test(n) ? 'caption-karaoke' : /خلفية|pill/.test(n) ? 'caption-pill' : 'caption-pill'
    }
    if (rule.id === 'reframe') params.aspect = /1:1|مربع|square/.test(n) ? '1:1' : /4:5/.test(n) ? '4:5' : '9:16'
    if (rule.id === 'titlecard') {
      const q = extractQuoted(text)
      if (q) params.title = q
    }
    if (rule.id === 'thumbnail') {
      const q = extractQuoted(text)
      if (q) {
        params.title = q
        params.addClip = true
      }
    }
    if (rule.id === 'autofx') {
      if (/اهتزاز|shake/.test(n)) params.style = 'shake'
      else if (/كين|ken/.test(n)) params.style = 'kenburns'
      params.amount = /قوي|strong/.test(n) ? 120 : 70
    }
    if (rule.id === 'writer') {
      if (/تيك|tiktok/.test(n)) params.tone = 'tiktok'
      else if (/تعليم|edu/.test(n)) params.tone = 'edu'
      else if (/فلوق|vlog/.test(n)) params.tone = 'vlog'
      else if (/بيع|تسويق|sales/.test(n)) params.tone = 'sales'
    }
    return { kind: 'tool', tool: rule.tool, params, text }
  }

  // --- direct editing commands -------------------------------------------
  if (/تراجع|undo/.test(n)) return { kind: 'action', action: 'undo', text }
  if (/اعادة|redo/.test(n)) return { kind: 'action', action: 'redo', text }
  if (/مسح الكل|امسح المشروع|حذف الكل|clear timeline|delete all/.test(n)) return { kind: 'action', action: 'clear', text }
  if (/ضاعف السرعة|سرع|سرّع|زود السرعة|speed up|faster/.test(n)) {
    const k = num && num > 1.05 && num < 6 ? num : 1.25
    return { kind: 'action', action: 'speed', value: k, text }
  }
  if (/بطي|ابطا|ابطي|slow/.test(n)) {
    const k = num && num > 0.2 && num < 1 ? num : 0.8
    return { kind: 'action', action: 'speed', value: k, text }
  }
  if (/اقطع|قطع|قص|split|cut/.test(n)) {
    const t = getState().ui.playhead || engine.time || 0
    return { kind: 'action', action: 'split', value: t, text }
  }
  if (/احذف المقطع|امسح المقطع|delete clip/.test(n)) return { kind: 'action', action: 'delete', text }
  if (/صوت اعلي|ارفع الصوت|louder|volume up/.test(n))
    return { kind: 'action', action: 'gain', value: num && num <= 3 ? num : 1.25, text }
  if (/صوت اوطي|اخفض الصوت|quieter|volume down/.test(n))
    return { kind: 'action', action: 'gain', value: num && num <= 3 ? num : 0.75, text }
  if (/كتم|mute/.test(n)) return { kind: 'action', action: 'mute', text }
  if (/علامة|ماركر|marker/.test(n)) return { kind: 'action', action: 'marker', text }
  if (/نص|تكتب|عنوان كبير|text|title/.test(n)) {
    const q = extractQuoted(text) || 'نص جديد'
    return { kind: 'action', action: 'text', text: q }
  }
  if (/تصدير|صدّر|export/.test(n)) return { kind: 'action', action: 'export', text }
  if (/ريفر|reels|9:16/.test(n) === false && /افتح|open/.test(n)) return null
  return null
}

export function plan(request) {
  return splitRequest(request)
    .map(parseOne)
    .filter(Boolean)
}

/* -------------------------------- executor -------------------------------- */

export async function executePlan(items, { log = () => {} } = {}) {
  const results = []
  for (const item of items) {
    if (item.kind === 'tool') {
      const res = await runTool(item.tool, item.params, { log })
      results.push({ ...item, res })
    } else if (item.kind === 'filter') {
      const ids = getState().ui.selection.length
        ? getState().ui.selection
        : getState()
            .project.tracks.flatMap((t) => t.clips)
            .filter((c) => c.kind === 'video' || c.kind === 'image')
            .map((c) => c.id)
      A.applyFilter(ids, item.filter)
      log(`فلتر: ${item.filter}`)
      results.push({ ...item, res: { summary: `filter:${item.filter}` } })
    } else if (item.kind === 'action') {
      results.push({ ...item, res: runSimpleAction(item, log) })
    }
  }
  return results
}

function runSimpleAction(item, log) {
  const state = getState()
  const p = state.project
  const sel = state.ui.selection
  const targets = () =>
    sel.length
      ? sel
      : p.tracks
          .filter((t) => t.kind !== 'text')
          .flatMap((t) => t.clips)
          .map((c) => c.id)

  switch (item.action) {
    case 'undo':
      undo()
      return { summary: 'undo' }
    case 'redo':
      redo()
      return { summary: 'redo' }
    case 'clear':
      A.replaceTimeline((draft) => {
        draft.tracks.forEach((t) => (t.clips = []))
        return draft
      })
      return { summary: 'cleared' }
    case 'speed': {
      targets().forEach((id) => A.setClipSpeed(id, item.value))
      log(`سرعة ×${item.value}`)
      return { summary: `speed:${item.value}` }
    }
    case 'split': {
      const created = A.splitAt(item.value, { all: !sel.length })
      return { summary: `split:${created.length}` }
    }
    case 'delete':
      A.removeClips(sel, { ripple: false })
      return { summary: 'deleted' }
    case 'gain': {
      targets().forEach((id) =>
        updateClip(id, (c) => ({
          audio: { ...(c.audio || {}), volume: Math.max(0, Math.min(2, (c.audio?.volume ?? 1) * item.value)) },
        })),
      )
      log(`مستوى الصوت ×${item.value}`)
      return { summary: `gain:${item.value}` }
    }
    case 'mute': {
      targets().forEach((id) => updateClip(id, (c) => ({ audio: { ...(c.audio || {}), volume: 0 } })))
      return { summary: 'muted' }
    }
    case 'marker':
      A.addMarker(engine.time || 0, '★')
      return { summary: 'marker' }
    case 'text':
      A.addTextClip({ start: engine.time || 0, duration: 3, text: item.text })
      return { summary: 'text-added' }
    case 'export':
      patchUi({ rightTab: 'export' })
      toast('exp.title', 'info')
      return { summary: 'export-panel' }
    default:
      return { summary: 'noop' }
  }
}

/** One-shot: understand + execute, with logging for the UI. */
export async function ask(request, { onLog } = {}) {
  const items = plan(request)
  if (!items.length) {
    aiLog({ request, ok: false, error: 'not-understood' })
    return { ok: false, items: [], reason: 'not-understood' }
  }
  aiLog({ request, ok: true, plan: items.map((i) => i.tool || i.action) })
  const results = await executePlan(items, { log: (m) => onLog?.(m) })
  return { ok: true, items, results }
}

export function describeRequest(request) {
  const items = plan(request)
  return items.map((i) => (i.kind === 'tool' ? `tool:${i.tool}` : i.kind === 'filter' ? `filter:${i.filter}` : `action:${i.action}`))
}

export function projectSummary(project = getState().project) {
  if (!project) return ''
  const clips = project.tracks.reduce((a, t) => a + t.clips.length, 0)
  const d = totalDuration(project)
  return `${project.name} · ${clips} clips · ${d.toFixed(1)}s · ${project.width}×${project.height}`
}
