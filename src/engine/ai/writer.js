/**
 * Copywriting helpers — titles, descriptions, hashtags, chapters.
 * Runs locally with template + statistics heuristics (no cloud calls).
 */

const STOP_AR = new Set([
  'في','من','على','إلى','عن','هذا','هذه','ذلك','التي','الذي','مع','أن','إن','ما','لا','هو','هي','كان','كانت','قد','كل','بعد','قبل','بين','حتى','أو','ثم','لكن','عند','لأن','هناك','كذلك','نحن','أنا','انت','أنت','هم','كما','هنا','الآن','جدا','جدًا','شي','حاجة','يعني',
])

const STOP_EN = new Set([
  'the','and','for','with','that','this','from','have','has','are','was','were','you','your','not','but','all','can','will','just','into','out','about','they','them','then','than','when','what','which','who','how','why','its','it\'s','our','their','there','here','also','very','much','more','most','some','any','only','over','under',
])

function words(text) {
  return String(text || '')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[^\p{L}\p{N}\s#]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

function keywords(text, n = 10) {
  const counts = new Map()
  const isArabic = /[\u0600-\u06FF]/.test(text || '')
  const stop = isArabic ? STOP_AR : STOP_EN
  for (const w of words(text)) {
    const lw = w.toLowerCase()
    if (stop.has(lw)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w, c]) => ({ word: w, count: c }))
}

const TEMPLATES = {
  youtube: {
    ar: (kw, topic) => [
      `${topic} — الشرح الكامل خطوة بخطوة (${new Date().getFullYear()})`,
      `إزاي تعمل ${topic}؟ كل حاجة محتاج تعرفها`,
      `${topic} من الصفر للاحتراف | دليل عملي`,
      `كل أسرار ${topic} في فيديو واحد`,
      `لا تفوّت: ${topic} بأسهل طريقة مممكنة`,
    ],
    en: (kw, topic) => [
      `${topic} — complete step-by-step guide (${new Date().getFullYear()})`,
      `How to master ${topic} (full tutorial)`,
      `${topic} explained from scratch`,
      `Everything you need to know about ${topic}`,
    ],
  },
  tiktok: {
    ar: (kw, topic) => [
      `محدش قالك عن ${topic} 😲`,
      `٣ حاجات هتغير شكل ${topic}`,
      `${topic} في دقيقة واحدة ⏱️`,
      `جرّب ده قبل ما تكمل في ${topic}`,
    ],
    en: (kw, topic) => [
      `Nobody told you this about ${topic} 😲`,
      `3 things that change ${topic}`,
      `${topic} in 60 seconds ⏱️`,
      `Try this before you continue with ${topic}`,
    ],
  },
  edu: {
    ar: (kw, topic) => [
      `درس ${topic}: الشرح المبسط + أمثلة`,
      `${topic} — مراجعة سريعة وأهم النقاط`,
      `فهم ${topic} في ١٠ دقائق (شرح مبسط)`,
      `${topic}: من الأساسيات للتطبيق العملي`,
    ],
    en: (kw, topic) => [
      `${topic}: the simple explanation + examples`,
      `${topic} — quick review of the key points`,
      `Understand ${topic} in 10 minutes`,
    ],
  },
  sales: {
    ar: (kw, topic) => [
      `عرض خاص على ${topic} — لفترة محدودة`,
      `ليه ${topic} هو الاختيار الأفضل؟`,
      `${topic}: نتيجة حقيقية في وقت قصير`,
    ],
    en: (kw, topic) => [`Special offer on ${topic}`, `Why ${topic} is the best choice`, `${topic}: real results, fast`],
  },
  vlog: {
    ar: (kw, topic) => [`يوم في حياتي مع ${topic}`, `جرّبت ${topic} لأول مرة!`, `${topic}: تجربتي الصادقة`],
    en: (kw, topic) => [`A day in my life with ${topic}`, `I tried ${topic} for the first time!`, `${topic}: my honest review`],
  },
}

export function generateCopy({ tone = 'youtube', transcript = '', projectName = '', clips = [], lang = 'ar', duration = 0 } = {}) {
  const kw = keywords(transcript || projectName, 12)
  const topic = (kw[0]?.word || projectName || (lang === 'ar' ? 'الموضوع ده' : 'this topic')).trim()
  const tpl = TEMPLATES[tone]?.[lang] || TEMPLATES.youtube[lang]
  const titles = tpl(kw, topic).slice(0, 6)

  const hashtagBase = kw.slice(0, 7).map((k) => `#${k.word.replace(/\s+/g, '_')}`)
  const extras =
    lang === 'ar'
      ? ['#محتوى_عربي', '#تعليم', '#شرح', '#فيديو_جديد', '#مونتاج']
      : ['#content', '#tutorial', '#howto', '#editing', '#newvideo']
  const hashtags = [...new Set([...hashtagBase, ...extras])].slice(0, 12)

  const summary =
    lang === 'ar'
      ? `في الفيديو ده نتكلم عن ${topic} بشكل عملي ومبسط، من أول الأساسيات لحد التطبيق.`
      : `In this video we cover ${topic} in a practical, simple way — from the basics to real application.`

  const chapters = []
  if (clips.length) {
    let acc = 0
    clips.slice(0, 12).forEach((c, i) => {
      const label = i === 0 ? (lang === 'ar' ? 'المقدمة' : 'Intro') : c.name || `${lang === 'ar' ? 'جزء' : 'Part'} ${i + 1}`
      chapters.push({ at: acc, label: String(label).slice(0, 60) })
      acc += c.duration || 0
    })
  }

  const description =
    lang === 'ar'
      ? [
          `${summary}`,
          '',
          chapters.length ? '⏱️ الفواصل:' : null,
          ...chapters.map((c) => `${fmt(ch)} ${c.label}`),
          '',
          duration ? `🕒 مدة الفيديو: ${Math.round(duration / 60)} دقيقة` : null,
          '',
          hashtags.join(' '),
        ]
          .filter((x) => x !== null)
          .join('\n')
      : [
          summary,
          '',
          chapters.length ? '⏱️ Chapters:' : null,
          ...chapters.map((c) => `${fmt(c)} ${c.label}`),
          '',
          duration ? `🕒 Length: ${Math.round(duration / 60)} min` : null,
          '',
          hashtags.join(' '),
        ]
          .filter((x) => x !== null)
          .join('\n')

  return { titles, hashtags, description, keywords: kw, chapters, topic }
}

function fmt(c) {
  const s = Math.floor(c.at % 60)
  const m = Math.floor(c.at / 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Short social captions for a clip list (used by the highlight tool). */
export function punchyCaptions(segments, lang = 'ar') {
  return segments.map((s, i) =>
    lang === 'ar'
      ? `الجزء ${i + 1}: ${s.label || 'أهم لحظة'} 🔥`
      : `Part ${i + 1}: ${s.label || 'best moment'} 🔥`,
  )
}
