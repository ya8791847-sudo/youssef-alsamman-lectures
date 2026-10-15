/**
 * Presets for filters, transitions, text looks, voice FX, ratios and music.
 * Pure data — reused by the renderer, the inspector and the exporter.
 */

export const ASPECTS = [
  { id: '16:9', label: '16:9 — YouTube', w: 1920, h: 1080 },
  { id: '9:16', label: '9:16 — Reels / TikTok', w: 1080, h: 1920 },
  { id: '1:1', label: '1:1 — مربع / Square', w: 1080, h: 1080 },
  { id: '4:5', label: '4:5 — Instagram', w: 1080, h: 1350 },
  { id: '4:3', label: '4:3 — كلاسيك / Classic', w: 1440, h: 1080 },
  { id: '21:9', label: '21:9 — سينما / Cinema', w: 2520, h: 1080 },
]

export const RES_PRESETS = [
  { id: '480p', label: '480p', short: 854, long: 480 },
  { id: '720p', label: '720p HD', short: 1280, long: 720 },
  { id: '1080p', label: '1080p Full HD', short: 1920, long: 1080 },
  { id: '1440p', label: '1440p QHD', short: 2560, long: 1440 },
]

export const FPS_PRESETS = [24, 25, 30, 50, 60]

export const FILTERS = [
  { id: 'none', name: { ar: 'بدون فلتر', en: 'No filter' }, adj: {} },
  {
    id: 'auto',
    name: { ar: 'تحسين تلقائي', en: 'Auto enhance' },
    adj: { brightness: 4, contrast: 10, saturation: 12, sharpen: 18 },
  },
  { id: 'cinema', name: { ar: 'سينمائي', en: 'Cinematic' }, adj: { contrast: 16, saturation: -8, temperature: -8, vignette: 28, grain: 6 } },
  { id: 'teal', name: { ar: 'تيل وأورنج', en: 'Teal & Orange' }, adj: { contrast: 12, saturation: 18, temperature: 14, hue: -6, vignette: 18 } },
  { id: 'warm', name: { ar: 'دافئ', en: 'Warm' }, adj: { temperature: 26, saturation: 12, brightness: 4 } },
  { id: 'cold', name: { ar: 'بارد', en: 'Cold' }, adj: { temperature: -28, saturation: 6, contrast: 8 } },
  { id: 'bw', name: { ar: 'أبيض وأسود', en: 'Black & White' }, adj: { saturation: -100, contrast: 18 } },
  { id: 'noir', name: { ar: 'نوار', en: 'Noir' }, adj: { saturation: -100, contrast: 34, brightness: -8, vignette: 40, grain: 12 } },
  { id: 'sepia', name: { ar: 'سيبيا', en: 'Sepia' }, adj: { sepia: 60, temperature: 16, contrast: 8 } },
  { id: 'vintage', name: { ar: 'قديم', en: 'Vintage' }, adj: { sepia: 28, saturation: -14, contrast: 10, grain: 18, vignette: 26 } },
  { id: 'vivid', name: { ar: 'حيوي', en: 'Vivid' }, adj: { saturation: 34, contrast: 14, brightness: 3 } },
  { id: 'fade', name: { ar: 'باهت', en: 'Faded' }, adj: { contrast: -18, saturation: -12, brightness: 8, brightnessMilk: 0 } },
  { id: 'matrix', name: { ar: 'أخضر', en: 'Green tint' }, adj: { hue: 90, saturation: 24, contrast: 12 } },
  { id: 'neon', name: { ar: 'نيون', en: 'Neon' }, adj: { saturation: 46, contrast: 20, hue: -18, glow: 18 } },
  { id: 'dream', name: { ar: 'حالم', en: 'Dreamy' }, adj: { blur: 1.4, brightness: 10, saturation: 16, glow: 26 } },
  { id: 'punch', name: { ar: 'قوي', en: 'Punch' }, adj: { contrast: 26, saturation: 20, sharpen: 30 } },
]

export const TRANSITIONS = [
  { id: 'none', name: { ar: 'بدون', en: 'None' } },
  { id: 'fade', name: { ar: 'تلاشي', en: 'Fade' } },
  { id: 'blur', name: { ar: 'ضبابي', en: 'Blur dissolve' } },
  { id: 'slideL', name: { ar: 'انزلاق يسار', en: 'Slide left' } },
  { id: 'slideR', name: { ar: 'انزلاق يمين', en: 'Slide right' } },
  { id: 'slideU', name: { ar: 'انزلاق أعلى', en: 'Slide up' } },
  { id: 'slideD', name: { ar: 'انزلاق أسفل', en: 'Slide down' } },
  { id: 'zoomIn', name: { ar: 'تكبير للداخل', en: 'Zoom in' } },
  { id: 'zoomOut', name: { ar: 'تصغير للخارج', en: 'Zoom out' } },
  { id: 'wipeL', name: { ar: 'مسح يسار', en: 'Wipe left' } },
  { id: 'wipeR', name: { ar: 'مسح يمين', en: 'Wipe right' } },
  { id: 'circle', name: { ar: 'دائرة', en: 'Circle' } },
  { id: 'flash', name: { ar: 'وميض', en: 'Flash' } },
  { id: 'spin', name: { ar: 'دوران', en: 'Spin' } },
  { id: 'glitch', name: { ar: 'خلل رقمي', en: 'Glitch' } },
]

export const TEXT_ANIMS = [
  { id: 'none', name: { ar: 'بدون', en: 'None' } },
  { id: 'fade', name: { ar: 'تلاشي', en: 'Fade' } },
  { id: 'fadeUp', name: { ar: 'صعود + تلاشي', en: 'Fade up' } },
  { id: 'pop', name: { ar: 'ظهور مفاجئ', en: 'Pop' } },
  { id: 'typewriter', name: { ar: 'آلة كاتبة', en: 'Typewriter' } },
  { id: 'word', name: { ar: 'كلمة كلمة', en: 'Word by word' } },
  { id: 'bounce', name: { ar: 'نطة', en: 'Bounce' } },
  { id: 'slideIn', name: { ar: 'دخول جانبي', en: 'Slide in' } },
  { id: 'neon', name: { ar: 'نبض نيون', en: 'Neon pulse' } },
  { id: 'karaoke', name: { ar: 'كاريوكي', en: 'Karaoke' } },
]

export const TEXT_PRESETS = [
  {
    id: 'title-bold',
    name: { ar: 'عنوان كبير', en: 'Big title' },
    style: { fontSize: 9, weight: 800, color: '#ffffff', stroke: '#000000', strokeW: 0, shadow: 22, align: 'center', anim: 'pop', y: 50, bg: false, uppercase: false, spacing: 0 },
  },
  {
    id: 'caption-yt',
    name: { ar: 'كابشن يوتيوب', en: 'YouTube caption' },
    style: { fontSize: 4.4, weight: 700, color: '#ffffff', stroke: '#000000', strokeW: 4, shadow: 12, align: 'center', anim: 'fade', y: 84, bg: false, uppercase: false },
  },
  {
    id: 'caption-pill',
    name: { ar: 'كابشن بخلفية', en: 'Pill caption' },
    style: { fontSize: 4.2, weight: 700, color: '#ffffff', stroke: '#000000', strokeW: 0, shadow: 6, align: 'center', anim: 'pop', y: 82, bg: true, bgColor: '#0b1220', bgAlpha: 0.72, radius: 14, uppercase: false },
  },
  {
    id: 'caption-karaoke',
    name: { ar: 'كاريوكي', en: 'Karaoke' },
    style: { fontSize: 5.2, weight: 800, color: '#ffffff', highlight: '#5ee7ff', stroke: '#000000', strokeW: 5, shadow: 10, align: 'center', anim: 'karaoke', y: 80, uppercase: true, bg: false },
  },
  {
    id: 'lower-third',
    name: { ar: 'شريط معلومات', en: 'Lower third' },
    style: { fontSize: 4, weight: 700, color: '#ffffff', stroke: '#000000', strokeW: 0, shadow: 10, align: 'left', anim: 'slideIn', x: 6, y: 78, bg: true, bgColor: '#0a0f1c', bgAlpha: 0.8, radius: 10, uppercase: false, accented: true },
  },
  {
    id: 'neon',
    name: { ar: 'نيون', en: 'Neon' },
    style: { fontSize: 8, weight: 800, color: '#7ef9ff', stroke: '#0b1020', strokeW: 2, shadow: 40, glow: '#5ee7ff', align: 'center', anim: 'neon', y: 50, bg: false, uppercase: true, spacing: 2 },
  },
  {
    id: 'minimal',
    name: { ar: 'بسيط', en: 'Minimal' },
    style: { fontSize: 4.6, weight: 600, color: '#f5f7ff', stroke: '#000', strokeW: 0, shadow: 8, align: 'center', anim: 'fadeUp', y: 88, bg: false, uppercase: false, spacing: 1 },
  },
  {
    id: 'retro',
    name: { ar: 'ريترو', en: 'Retro' },
    style: { fontSize: 7, weight: 800, color: '#ffd166', stroke: '#3b1a00', strokeW: 6, shadow: 16, align: 'center', anim: 'bounce', y: 44, bg: false, uppercase: true, spacing: 3 },
  },
]

export const MOTION_PRESETS = [
  {
    id: 'kenburns',
    name: { ar: 'كين برنز (تقريب بطيء)', en: 'Ken Burns (slow zoom)' },
    kf: { scale: [[0, 1], [1, 1.16]], x: [[0, 0], [1, 2]], y: [[0, 0], [1, -2]] },
  },
  {
    id: 'zoomout',
    name: { ar: 'بعيد تدريجي', en: 'Slow zoom out' },
    kf: { scale: [[0, 1.18], [1, 1]] },
  },
  {
    id: 'punch',
    name: { ar: 'بانش سريع', en: 'Punch in' },
    kf: { scale: [[0, 1], [0.06, 1.09], [0.16, 1.02], [1, 1.03]] },
  },
  {
    id: 'shake',
    name: { ar: 'اهتزاز', en: 'Camera shake' },
    kf: { x: [[0, 0], [0.25, -1.4], [0.5, 1.2], [0.75, -1], [1, 0]], y: [[0, 0], [0.3, 1.2], [0.6, -1.1], [1, 0.4]] },
  },
  {
    id: 'float',
    name: { ar: 'طفو', en: 'Float' },
    kf: { y: [[0, 0], [0.5, -1.6], [1, 0]], rotation: [[0, -0.6], [0.5, 0.6], [1, -0.6]] },
  },
  {
    id: 'spin',
    name: { ar: 'دوران بطيء', en: 'Slow spin' },
    kf: { rotation: [[0, 0], [1, 360]], scale: [[0, 1.06], [1, 1.06]] },
  },
  {
    id: 'pulse',
    name: { ar: 'نبض', en: 'Pulse' },
    kf: { scale: [[0, 1], [0.2, 1.05], [0.4, 1], [0.6, 1.05], [0.8, 1], [1, 1]] },
  },
]

export const VOICE_PRESETS = [
  { id: 'none', name: { ar: 'بدون معالجة', en: 'No processing' }, fx: {} },
  {
    id: 'clean',
    name: { ar: 'تنقية سريعة', en: 'Quick cleanup' },
    fx: { highpass: 90, lowpass: 12000, presence: 3, compThreshold: -22, compRatio: 3, gain: 3, gate: true },
  },
  {
    id: 'studio',
    name: { ar: 'ستوديو', en: 'Studio' },
    fx: { highpass: 80, lowpass: 14000, presence: 5, warmth: 2, compThreshold: -20, compRatio: 4, gain: 4, gate: true, deEss: true },
  },
  {
    id: 'podcast',
    name: { ar: 'بودكاست', en: 'Podcast' },
    fx: { highpass: 70, lowpass: 13000, presence: 4, warmth: 4, compThreshold: -24, compRatio: 5, gain: 5, gate: true },
  },
  {
    id: 'radio',
    name: { ar: 'راديو', en: 'Radio' },
    fx: { highpass: 220, lowpass: 7200, presence: 6, compThreshold: -28, compRatio: 8, gain: 8 },
  },
  {
    id: 'deep',
    name: { ar: 'صوت عميق', en: 'Deep voice' },
    fx: { highpass: 60, lowpass: 6000, warmth: 10, presence: -3, compThreshold: -22, compRatio: 3, gain: 4 },
  },
  {
    id: 'bright',
    name: { ar: 'صوت واضح', en: 'Bright voice' },
    fx: { highpass: 140, lowpass: 15000, presence: 10, warmth: -4, compThreshold: -22, compRatio: 3, gain: 3 },
  },
  {
    id: 'phone',
    name: { ar: 'مكالمة تليفون', en: 'Phone call' },
    fx: { highpass: 400, lowpass: 3400, drive: 22, compThreshold: -30, compRatio: 10, gain: 10 },
  },
  {
    id: 'hall',
    name: { ar: 'قاعة كبيرة', en: 'Big hall' },
    fx: { highpass: 90, lowpass: 9000, reverb: 0.45, reverbSize: 2.4, compThreshold: -22, compRatio: 3, gain: 3 },
  },
  {
    id: 'robot',
    name: { ar: 'روبوت', en: 'Robot' },
    fx: { highpass: 200, lowpass: 5000, ringMod: 42, drive: 30, compThreshold: -30, compRatio: 8, gain: 6 },
  },
  {
    id: 'whisper',
    name: { ar: 'همس + هواء', en: 'Whisper + air' },
    fx: { highpass: 300, lowpass: 9000, presence: 8, reverb: 0.2, compThreshold: -34, compRatio: 6, gain: 12 },
  },
]

export const MUSIC_STYLES = [
  {
    id: 'uplift',
    name: { ar: 'حماسي', en: 'Uplifting' },
    bpm: 118,
    scale: [0, 2, 4, 7, 9, 12, 14],
    root: 220,
    chords: [[0, 4, 7], [-3, 2, 5], [-5, 0, 4], [-7, -2, 2]],
    wave: 'saw',
    kick: true,
    hat: true,
    pad: 0.5,
  },
  {
    id: 'chill',
    name: { ar: 'هادي', en: 'Chill' },
    bpm: 92,
    scale: [0, 2, 3, 5, 7, 10, 12],
    root: 196,
    chords: [[0, 3, 7], [-4, 0, 3], [-5, -1, 2], [-7, -3, 0]],
    wave: 'sine',
    kick: false,
    hat: true,
    pad: 0.7,
  },
  {
    id: 'epic',
    name: { ar: 'ملحمي', en: 'Epic' },
    bpm: 104,
    scale: [0, 2, 3, 5, 7, 8, 10],
    root: 146.8,
    chords: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [3, 7, 10]],
    wave: 'saw',
    kick: true,
    hat: false,
    pad: 0.85,
    strings: true,
  },
  {
    id: 'lofi',
    name: { ar: 'لو-فاي', en: 'Lo-fi' },
    bpm: 78,
    scale: [0, 3, 5, 7, 10, 12],
    root: 174.6,
    chords: [[0, 3, 7], [-2, 3, 5], [-4, 0, 3], [-5, -2, 2]],
    wave: 'triangle',
    kick: true,
    hat: true,
    pad: 0.6,
    lofi: true,
  },
  {
    id: 'tech',
    name: { ar: 'تك', en: 'Tech' },
    bpm: 128,
    scale: [0, 2, 3, 7, 10, 12],
    root: 130.8,
    chords: [[0, 3, 7], [0, 5, 8], [0, 3, 7], [-3, 0, 4]],
    wave: 'square',
    kick: true,
    hat: true,
    pad: 0.35,
    arp: true,
  },
  {
    id: 'funk',
    name: { ar: 'فانك', en: 'Funk' },
    bpm: 110,
    scale: [0, 3, 5, 6, 7, 10],
    root: 164.8,
    chords: [[0, 3, 7], [0, 3, 6], [-2, 3, 6], [3, 6, 10]],
    wave: 'saw',
    kick: true,
    hat: true,
    pad: 0.3,
    arp: true,
  },
]

export const CAPTION_FONTS = [
  { id: 'Cairo', label: 'Cairo (عربي)' },
  { id: 'Tahoma', label: 'Tahoma' },
  { id: 'Segoe UI', label: 'Segoe UI' },
  { id: 'Inter', label: 'Inter' },
  { id: 'Georgia', label: 'Georgia' },
  { id: 'Impact', label: 'Impact' },
  { id: 'Courier New', label: 'Courier' },
  { id: 'Arial Black', label: 'Arial Black' },
]

export const WRITER_TONES = [
  { id: 'youtube', name: { ar: 'يوتيوب', en: 'YouTube' } },
  { id: 'tiktok', name: { ar: 'تيك توك', en: 'TikTok' } },
  { id: 'edu', name: { ar: 'تعليمي', en: 'Educational' } },
  { id: 'sales', name: { ar: 'تسويقي', en: 'Sales' } },
  { id: 'vlog', name: { ar: 'فلوق', en: 'Vlog' } },
]

export const DEFAULT_ADJ = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  hue: 0,
  sepia: 0,
  blur: 0,
  sharpen: 0,
  vignette: 0,
  grain: 0,
  glow: 0,
}

export const DEFAULT_CLIP_FX = {
  ...DEFAULT_ADJ,
  key: { enabled: false, color: '#00b140', similarity: 32, smooth: 10, spill: 40 },
}

export function filterById(id) {
  return FILTERS.find((f) => f.id === id) || FILTERS[0]
}

/** Apply a filter preset on top of default adjustments (keeps user's extra tweaks off) */
export function filterAdjustments(id) {
  const f = filterById(id)
  const adj = { ...DEFAULT_ADJ }
  for (const [k, v] of Object.entries(f.adj || {})) {
    if (k in adj) adj[k] = v
  }
  return adj
}
