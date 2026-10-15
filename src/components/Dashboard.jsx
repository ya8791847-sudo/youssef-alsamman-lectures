import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/index.jsx'
import { ASPECTS, FPS_PRESETS, FILTERS } from '../engine/presets.js'
import { TOOLS } from '../engine/ai/tools.js'
import { createDemoProject } from '../store/demo.js'
import { loadAllProjects, removeProject, hydrateProjectMedia } from '../store/media.js'
import { openProject, getState, setProjects, setBusy, setProgress, toast, patchUi, createProject } from '../store/store.js'
import { hydrateProjectMedia as hydrate } from '../store/media.js'
import { Icon, Modal, Progress } from './ui.jsx'

function Brand({ size = 32, onClick = null }) {
  return (
    <div className="brand" onClick={onClick}>
      <div className="logo" style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#080c18" strokeWidth="2.1" strokeLinecap="round">
          <rect x="2.5" y="5" width="19" height="14" rx="3.5" />
          <circle cx="12" cy="12" r="3.4" fill="#080c18" stroke="none" />
          <path d="M7 2.6v3M17 2.6v3M7 18.4v3M17 18.4v3" />
        </svg>
      </div>
      <div className="col">
        <b>لقطة AI</b>
        <span className="tag">LAQTA STUDIO</span>
      </div>
    </div>
  )
}

function ToolCard({ icon, title, desc }) {
  return (
    <div className="feature">
      <div className="ico">
        <Icon name={icon} size={17} />
      </div>
      <b>{title}</b>
      <p>{desc}</p>
    </div>
  )
}

export default function Dashboard() {
  const { t, lang, toggle } = useI18n()
  const [projects, setLocalProjects] = useState([])
  const [showNew, setShowNew] = useState(getState().ui.showNewDialog)
  const [name, setName] = useState('')
  const [aspect, setAspect] = useState('16:9')
  const [fps, setFps] = useState(30)
  const [busy, setLocalBusy] = useState(null)
  const [confirm, setConfirm] = useState(null) // { mode: 'one' | 'all', id?, name? }
  const fileRef = useRef(null)

  useEffect(() => {
    loadAllProjects().then((list) => {
      setLocalProjects(list)
      setProjects(list)
    })
  }, [])

  useEffect(() => {
    if (getState().ui.showNewDialog) {
      setShowNew(true)
      patchUi({ showNewDialog: false })
    }
  }, [])

  const startBlank = () => {
    const a = ASPECTS.find((x) => x.id === aspect) || ASPECTS[0]
    createProject({
      name: name || (lang === 'ar' ? 'مشروع جديد' : 'New project'),
      width: a.w,
      height: a.h,
      aspect: a.id,
      fps,
    })
    setShowNew(false)
  }

  const startDemo = async () => {
    setShowNew(false)
    setLocalBusy(t('common.loading'))
    setBusy(t('common.loading'), 0)
    try {
      const project = await createDemoProject({
        onProgress: (p, label) => {
          setBusy(`${t('common.loading')} ${label || ''}`, p)
          setProgress(p)
        },
      })
      openProject(project)
      toast('toast.importedProject', 'ok')
    } catch (e) {
      toast('err.media', 'err')
      console.error(e)
    } finally {
      setBusy(null)
      setLocalBusy(null)
    }
  }

  const openSaved = async (p) => {
    setBusy(t('common.loading'), 0.2)
    try {
      const proj = JSON.parse(JSON.stringify(p))
      await hydrate(proj)
      openProject(proj)
      setBusy(null)
    } catch (e) {
      setBusy(null)
      toast('err.media', 'err')
    }
  }

  const deleteSaved = async (id) => {
    await removeProject(id)
    const list = await loadAllProjects()
    setLocalProjects(list)
    setProjects(list)
    toast('toast.deleted', 'ok')
  }

  const clearAll = async () => {
    for (const p of projects) await removeProject(p.id)
    setLocalProjects([])
    setProjects([])
    toast('toast.deleted', 'ok')
  }

  const runConfirm = async () => {
    const job = confirm
    setConfirm(null)
    if (!job) return
    if (job.mode === 'all') await clearAll()
    else await deleteSaved(job.id)
  }

  const importProjectFile = async (file) => {
    try {
      const text = await file.text()
      const proj = JSON.parse(text)
      await hydrateProjectMedia(proj)
      openProject(proj)
      toast('toast.importedProject', 'ok')
    } catch (e) {
      toast('err.media', 'err')
    }
  }

  const featureList = [
    ['scissors', 'ai.silenceTitle', 'ai.silenceDesc'],
    ['grid', 'ai.scenesTitle', 'ai.scenesDesc'],
    ['music', 'ai.beatTitle', 'ai.beatDesc'],
    ['crop', 'ai.reframeTitle', 'ai.reframeDesc'],
    ['palette', 'ai.enhanceTitle', 'ai.enhanceDesc'],
    ['text', 'ai.captionsTitle', 'ai.captionsDesc'],
    ['lightning', 'ai.highlightTitle', 'ai.highlightDesc'],
    ['image', 'ai.thumbTitle', 'ai.thumbDesc'],
    ['wave', 'ai.voiceTitle', 'ai.voiceDesc'],
    ['sparkles', 'ai.autoFxTitle', 'ai.autoFxDesc'],
    ['target', 'ai.chromaTitle', 'ai.chromaDesc'],
    ['magic', 'ai.writerTitle', 'ai.writerDesc'],
    ['sliders', 'fx.filters', 'fx.title'],
    ['layers', 'ai.assetsTitle', 'ai.assetsDesc'],
  ]

  const faq = [
    [
      lang === 'ar' ? 'هل بيتم رفع الفيديوهات على سيرفر؟' : 'Are my videos uploaded anywhere?',
      lang === 'ar'
        ? 'لا خالص. الموقع بالكامل يعمل داخل المتصفح، والملفات تتخزن في IndexedDB على جهازك. مفيش أي API خارجي أو سيرفر.'
        : 'No. The whole studio runs in your browser and files are stored in IndexedDB on your device. There is no backend or external API.',
    ],
    [
      lang === 'ar' ? 'إيه صيغ التصدير المتاحة؟' : 'What export formats are supported?',
      lang === 'ar'
        ? 'فيديو WebM (VP9/VP8 + Opus) بجودة تصل 1080p، صوت WAV، صورة PNG، ملف ترجمة SRT/VTT، وملف مشروع JSON قابل لإعادة الفتح.'
        : 'WebM video (VP9/VP8 + Opus) up to 1080p, WAV audio, PNG stills, SRT/VTT subtitles and a JSON project file you can reopen later.',
    ],
    [
      lang === 'ar' ? 'التصدير بياخد وقت طويل ليه؟' : 'Why does export take real time?',
      lang === 'ar'
        ? 'لأن التسجيل بيتم في الوقت الحقيقي (نفس أسلوب تسجيل الشاشة) وبدون رفع أو رندر على سيرفر — سعر الخصوصية الكاملة.'
        : 'Because recording happens in real time (like screen recording) with no upload and no server rendering — the price of full privacy.',
    ],
    [
      lang === 'ar' ? 'الكابشن التلقائي بيفهم الكلام من الفيديو؟' : 'Can captions transcribe my video audio?',
      lang === 'ar'
        ? 'التفريغ الفوري بيستخدم التعرف على الكلام المدمج في متصفح Chrome من المايكروفون مباشرة، أو تقدر تلصق نص السكربت ويتم توزيعه زمنيًا على الكلام تلقائيًا.'
        : 'Live transcription uses the speech recognition built into Chrome from your microphone, or you can paste your script and it will be timed to the speech automatically.',
    ],
    [
      lang === 'ar' ? 'بيشتغل على الموبايل؟' : 'Does it work on mobile?',
      lang === 'ar'
        ? 'الواجهة متوافقة مع الشاشات الصغيرة، لكن أفضل تجربة للمونتاج على كمبيوتر بمتصفح Chrome أو Edge.'
        : 'The layout adapts to small screens, but editing is best on a desktop with Chrome or Edge.',
    ],
  ]

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="grow" />
        <button className="btn ghost lang-btn" onClick={toggle}>
          {t('nav.lang')}
        </button>
        <button className="btn primary" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={15} /> {t('nav.newProject')}
        </button>
      </header>

      <div className="dash">
        <section className="dash-hero">
          <div className="inner">
            <h1>
              {t('dash.h1a')} <span className="grad-text">{t('dash.h1b')}</span>
            </h1>
            <p className="lead">{t('dash.lead')}</p>
            <div className="hero-actions">
              <button className="btn primary lg" onClick={() => setShowNew(true)}>
                <Icon name="plus" size={17} /> {t('dash.ctaNew')}
              </button>
              <button className="btn lg" onClick={startDemo} disabled={!!busy}>
                <Icon name="sparkles" size={16} /> {t('dash.ctaDemo')}
              </button>
              <button className="btn ghost lg" onClick={() => fileRef.current?.click()}>
                <Icon name="folder" size={16} /> {t('dash.ctaImport')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => e.target.files?.[0] && importProjectFile(e.target.files[0])}
              />
            </div>
            {busy ? (
              <div style={{ maxWidth: 360, marginTop: 18 }}>
                <div className="small dim" style={{ marginBottom: 6 }}>
                  {busy}
                </div>
                <Progress value={getState().busy?.progress || 0} />
              </div>
            ) : null}
            <div className="stat-row">
              <div className="stat">
                <b>١٠٠٪</b>
                <span>{t('dash.stat.privacy')} — {t('dash.stat.privacyV')}</span>
              </div>
              <div className="stat">
                <b>{Object.keys(TOOLS).length}</b>
                <span>{t('dash.stat.tools')}</span>
              </div>
              <div className="stat">
                <b>4K</b>
                <span>{lang === 'ar' ? 'دقة المشروع والتكوين' : 'Project & composite resolution'}</span>
              </div>
              <div className="stat">
                <b>{lang === 'ar' ? 'مجانًا' : 'Free'}</b>
                <span>{t('dash.stat.costV')}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="dash-body">
          <div className="section-title">
            <h2>{t('dash.recent')}</h2>
            {projects.length ? (
              <button className="btn ghost sm" onClick={() => setConfirm({ mode: 'all' })}>
                <Icon name="trash" size={13} /> {t('dash.clearAll')}
              </button>
            ) : null}
          </div>
          {projects.length ? (
            <div className="proj-grid">
              {projects.map((p, i) => (
                <div
                  key={p.id}
                  className="proj-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => openSaved(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openSaved(p)
                    }
                  }}
                >
                  <div className={`cover g${i % 3}`}>
                    <Icon name="film" size={26} />
                    <span className="chip" style={{ position: 'absolute', bottom: 8, insetInlineEnd: 8 }}>
                      {p.width}×{p.height}
                    </span>
                  </div>
                  <div className="pc-body row between gap-8">
                    <div className="col" style={{ minWidth: 0 }}>
                      <b className="ellipsis">{p.name}</b>
                      <span className="tiny muted">
                        {p.tracks?.reduce((a, tr) => a + tr.clips.length, 0) || 0} {t('dash.clips')} ·{' '}
                        {new Date(p.updatedAt || p.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB')}
                      </span>
                    </div>
                    <button
                      className="btn icon ghost sm"
                      aria-label={`${t('common.delete')} — ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirm({ mode: 'one', id: p.id, name: p.name })
                      }}
                      title={t('common.delete')}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-note">{t('dash.recentEmpty')}</div>
          )}

          <div className="section-title">
            <h2>{t('dash.tools')}</h2>
            <span className="chip on">
              <Icon name="lightning" size={12} /> {t('ai.engineLocal')}
            </span>
          </div>
          <div className="feature-grid">
            {featureList.map(([icon, title, desc]) => (
              <ToolCard key={title} icon={icon} title={t(title)} desc={t(desc)} />
            ))}
          </div>

          <div className="section-title">
            <h2>{t('dash.how')}</h2>
          </div>
          <div className="feature-grid">
            {[
              [lang === 'ar' ? '١ — استورد' : '1 — Import', lang === 'ar' ? 'اسحب الفيديوهات والصور والصوت لداخل المكتبة.' : 'Drag your videos, images and audio into the library.'],
              [lang === 'ar' ? '٢ — ذكاء' : '2 — AI', lang === 'ar' ? 'شغّل الأدوات الذكية: صمت · مشاهد · إيقاع · كابشن · ألوان.' : 'Run the AI tools: silence · scenes · beats · captions · color.'],
              [lang === 'ar' ? '٣ — صدّر' : '3 — Export', lang === 'ar' ? 'صدّر WebM عالي الجودة أو WAV أو SRT — كله محليًا.' : 'Export high quality WebM, WAV or SRT — all locally.'],
            ].map(([title, desc]) => (
              <div key={title} className="feature">
                <b>{title}</b>
                <p>{desc}</p>
              </div>
            ))}
          </div>

          <div className="section-title">
            <h2>{t('dash.faq')}</h2>
          </div>
          <div className="faq">
            {faq.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="dash-footer">
          <span>{t('dash.footer')}</span>
          <span className="row gap-8">
            <span className="chip">{lang === 'ar' ? 'فلترة الألوان' : 'Filters'}: {FILTERS.length - 1}</span>
            <span className="chip">{lang === 'ar' ? 'أدوات ذكية' : 'AI tools'}: {Object.keys(TOOLS).length}</span>
          </span>
        </div>
      </div>

      {confirm ? (
        <Modal
          title={confirm.mode === 'all' ? t('dash.confirmClear') : t('dash.confirmDelete')}
          onClose={() => setConfirm(null)}
          size="sm"
          footer={
            <>
              <button className="btn ghost" onClick={() => setConfirm(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn danger" onClick={runConfirm}>
                <Icon name="trash" size={14} /> {t('common.delete')}
              </button>
            </>
          }
        >
          <p className="small" style={{ margin: 0, lineHeight: 1.9 }}>
            {confirm.mode === 'all' ? t('dash.confirmClearDesc') : t('dash.confirmDeleteDesc')}
          </p>
          {confirm.mode === 'one' && confirm.name ? (
            <div className="chip on" style={{ marginTop: 10 }}>
              {confirm.name}
            </div>
          ) : null}
        </Modal>
      ) : null}

      {showNew ? (
        <Modal
          title={t('new.dialogTitle')}
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setShowNew(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" onClick={startBlank}>
                <Icon name="plus" size={14} /> {t('new.createBlank')}
              </button>
            </>
          }
        >
          <div className="row gap-12 wrap" style={{ alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 240 }}>
              <label className="field">
                <span>{t('new.name')}</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === 'ar' ? 'مثال: حلقة ١٢ — المونتاج' : 'e.g. Episode 12'} />
              </label>
              <label className="field">
                <span>{t('new.aspect')}</span>
                <select className="select" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  {ASPECTS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} — {a.w}×{a.h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('new.fps')}</span>
                <select className="select" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                  {FPS_PRESETS.map((f) => (
                    <option key={f} value={f}>
                      {f} fps
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="col gap-8" style={{ minWidth: 220, flex: 1 }}>
              <button className="export-option" style={{ textAlign: 'start' }} onClick={startBlank}>
                <span className="ico">
                  <Icon name="film" size={15} />
                </span>
                <span className="col">
                  <b>{t('new.createBlank')}</b>
                  <p>{t('new.blankDesc')}</p>
                </span>
              </button>
              <button className="export-option" style={{ textAlign: 'start' }} onClick={startDemo}>
                <span className="ico">
                  <Icon name="sparkles" size={15} />
                </span>
                <span className="col">
                  <b>{t('new.demoTitle')}</b>
                  <p>{t('new.demoDesc')}</p>
                </span>
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
