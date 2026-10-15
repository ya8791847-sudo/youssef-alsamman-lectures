/**
 * Demo project builder — generates a complete, playable project locally:
 * generated title cards (slides with motion), generated music, titles,
 * captions and markers. No download, no sample media needed.
 */

import * as audio from '../engine/audio.js'
import { makeTitleCard, makeSolid, registerGenerated } from './media.js'
import { newProject, newMediaClip, newTextClip, uid, sortClips } from './model.js'
import { MUSIC_STYLES } from '../engine/presets.js'

const SLIDES = [
  { title: 'مونتاج بالذكاء الاصطناعي', subtitle: 'Laqta AI Studio — كله جوه المتصفح', theme: 0, dur: 6 },
  { title: '٣ خطوات للمونتاج السريع', subtitle: 'استورد · حسّن تلقائيًا · صدّر', theme: 1, dur: 6 },
  { title: 'تحسين الألوان تلقائيًا', subtitle: 'قياس السطوع والتباين والصبغة', theme: 2, dur: 6 },
  { title: 'كابشن وكاريوكي', subtitle: 'ترجمة بمحاذاة الكلام وتصدير SRT', theme: 3, dur: 6 },
  { title: 'صدّر بجودة عالية', subtitle: 'WebM · WAV · SRT · موسيقى مُولَّدة', theme: 4, dur: 6 },
]

const CAPTIONS = [
  { start: 0.6, end: 3.4, text: 'أهلاً بيك في استوديو لقطة AI للمونتاج الذكي' },
  { start: 3.6, end: 6.2, text: 'كل الأدوات الذكية بتشتغل على جهازك مباشرة' },
  { start: 6.6, end: 9.4, text: 'استورد الفيديو وسيب التحليل التلقائي يكشف المشاهد' },
  { start: 9.8, end: 13.0, text: 'حسّن الألوان، شيل الصمت، وزن الكلام على الإيقاع' },
  { start: 13.4, end: 17.0, text: 'بعدين صدّر الفيديو أو ملف الترجمة في ثواني' },
  { start: 17.4, end: 22.0, text: 'جرّب الأدوات بنفسك — مش محتاج أي تسجيل أو اشتراك' },
]

export async function createDemoProject({ onProgress } = {}) {
  const project = newProject({ name: 'مشروع تجريبي — لقطة AI', width: 1920, height: 1080, fps: 30, aspect: '16:9' })
  const steps = SLIDES.length + 2
  let done = 0
  const tick = (label) => onProgress?.(++done / steps, label)

  const media = []
  for (const s of SLIDES) {
    tick(s.title)
    const blob = await makeTitleCard({ title: s.title, subtitle: s.subtitle, theme: s.theme, width: 1920, height: 1080 })
    const meta = await registerGenerated(s.title, blob, 'image', { demo: true })
    media.push(meta)
  }

  // one plain dark slide used as an overlay/background sample
  const solidBlob = await makeSolid({ width: 1920, height: 1080, color: '#05070d' })
  const solid = await registerGenerated('خلفية داكنة', solidBlob, 'image', { demo: true })
  media.push(solid)

  tick('توليد الموسيقى')
  const musicBlob = await audio.generateMusic(MUSIC_STYLES[0], 32, { onProgress: () => {} })
  const music = await registerGenerated('موسيقى حماسية (مُولَّدة)', musicBlob, 'audio', { demo: true, style: 'uplift' })
  media.push(music)

  project.media = media

  const videoTrack = project.tracks.find((t) => t.kind === 'video')
  const textTrack = project.tracks.find((t) => t.kind === 'text')
  const audioTrack = project.tracks.find((t) => t.kind === 'audio')

  let cursor = 0
  const motions = [
    { scale: [[0, 1], [1, 1.14]], x: [[0, -1.5], [1, 1.5]] },
    { scale: [[0, 1.16], [1, 1]], x: [[0, 1.5], [1, -1]] },
    { scale: [[0, 1.04], [1, 1.12]], y: [[0, 1], [1, -1]] },
    { scale: [[0, 1.12], [1, 1.02]], x: [[0, 1], [1, -1.4]] },
    { scale: [[0, 1], [1, 1.1]], y: [[0, -1], [1, 1]] },
  ]
  SLIDES.forEach((s, i) => {
    const clip = newMediaClip({ media: media[i], trackId: videoTrack.id, start: cursor, duration: s.dur, srcStart: 0 })
    clip.kf = JSON.parse(JSON.stringify(motions[i % motions.length]))
    clip.transitions = {
      in: i === 0 ? { type: 'fade', dur: 0.6 } : { type: 'fade', dur: 0.5 },
      out: { type: 'fade', dur: 0.5 },
    }
    if (i === 0) clip.transform = { ...clip.transform, scale: 100 }
    videoTrack.clips.push(clip)

    const text = newTextClip({
      trackId: textTrack.id,
      start: cursor + 0.4,
      duration: Math.max(1, s.dur - 1.4),
      text: '',
      style: { bg: true, size: 3, align: 'left', x: 8, y: 88, anim: 'slideIn', bgColor: '#05070d', bgAlpha: 0.72, radius: 10, accent: true },
    })
    text.text.content = i === 0 ? '✦ Laqta AI' : `٠${i + 1} — مشهد تجريبي`
    textTrack.clips.push(text)
    cursor += s.dur
  })
  sortClips(videoTrack)
  sortClips(textTrack)

  const musicClip = newMediaClip({ media: music, trackId: audioTrack.id, start: 0, duration: 30, srcStart: 0 })
  musicClip.audio = { volume: 0.5, pan: 0, fadeIn: 1.6, fadeOut: 3.5, voiceFx: { preset: 'none', amount: 50, fx: {} } }
  audioTrack.clips.push(musicClip)

  project.captions = CAPTIONS.map((c) => ({ id: uid('cap'), ...c }))
  project.captionStyle = {
    ...project.captionStyle,
    size: 4.2,
    bg: true,
    bgColor: '#05070d',
    bgAlpha: 0.66,
    anim: 'fadeUp',
    uppercase: false,
    karaoke: false,
  }
  project.markers = [
    { id: uid('mk'), t: 0, label: 'بداية' },
    { id: uid('mk'), t: 6, label: 'مشهد ٢' },
    { id: uid('mk'), t: 18, label: 'الخاتمة' },
  ]
  project.settings = {
    ...project.settings,
    background: 'blur',
    ducking: true,
    vignette: 14,
    grain: 5,
    progressBar: true,
  }
  project.demo = true
  tick('جاهز')
  return project
}
