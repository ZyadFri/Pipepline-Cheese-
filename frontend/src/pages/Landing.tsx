import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  FileSearch,
  FlaskConical,
  Link2,
  Menu,
  Microscope,
  Pause,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuthStore } from '../store/auth'

const BRAND = '#7A1B2E'

// These are the same real-world image sources selected for the
// cheese-shelf-Life-v7 marketing experience. No generated stock mockups.
const MEDIA = {
  campus: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Campus_Macdonald_01.jpg?width=1800',
  lab: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Microbiology_cabinet.jpg?width=1800',
  aging: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Affinage_Gruyere.jpg?width=1800',
  cheeses: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Various_cheeses.jpg?width=1800',
  cave: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Cheese_Aging_Cave.jpg?width=1800',
  salwa: 'https://www.mcgill.ca/globalfoodsecurity/files/globalfoodsecurity/skarboune8_square.png',
}

const API_ORIGIN = import.meta.env.VITE_API_URL || ''
const DEMO_VIDEO = `${API_ORIGIN}/api/public/demo-video`

type ResearchPaper = {
  tag: string
  year: string
  journal: string
  title: string
  authors: string
  featuredAuthor: string
  summary: string
  doi: string
  accent: string
}

// Real publications only. Keep metadata literal and externally verifiable.
const RESEARCH_PAPERS: ResearchPaper[] = [
  {
    tag: 'Food quality & analytics',
    year: '2026',
    journal: 'Food Chemistry: X',
    title: 'Carbohydrate and enzymatic activity profiling for the quality assessment of Canadian honeys',
    authors: 'Mile Shao, Asma Mdimagh, Lan Liu, Shaghig Bilamjian, Lei Tian, Stephan Bayen & Salwa Karboune',
    featuredAuthor: 'Salwa Karboune',
    summary: 'Profiles enzymatic activity and carbohydrate composition across Canadian honeys and evaluates predictive models for botanical origin.',
    doi: 'https://doi.org/10.1016/j.fochx.2026.104189',
    accent: '#f7e7eb',
  },
  {
    tag: 'Functional foods',
    year: '2024',
    journal: 'Foods',
    title: 'Effect of a Probiotic Beverage Enriched with Cricket Proteins on the Gut Microbiota: Composition of Gut and Correlation with Nutritional Parameters',
    authors: 'Chaima Dridi, Mathieu Millette, Stephane Salmieri, Blanca R. Aguilar Uscanga, Sebastien Lacroix, Tommaso Venneri, Elham Sarmast, Zahra Allahdad et al.',
    featuredAuthor: 'Zahra Allahdad',
    summary: 'Examines a probiotic beverage enriched with cricket proteins and its relationship with gut microbiota composition and nutritional parameters.',
    doi: 'https://doi.org/10.3390/foods13020204',
    accent: '#fff1e8',
  },
  {
    tag: 'AI & decision systems',
    year: '2025',
    journal: 'Renewable Energy',
    title: 'Tailored performance evaluation framework for PV systems based on type and application',
    authors: 'Meryam Chafiq, Loubna Benabbou, Hanane Dagdougui, Ismail Belhaj, Hicham Bouzekri & Abdelaziz Berrado',
    featuredAuthor: 'Loubna Benabbou',
    summary: 'Presents a tailored framework for evaluating photovoltaic-system performance according to system type and application context.',
    doi: 'https://doi.org/10.1016/j.renene.2025.124047',
    accent: '#f1eaf7',
  },
]

const NAV = [
  { href: '#platform', label: 'Platform' },
  { href: '#demo', label: 'Demo' },
  { href: '#research', label: 'Research' },
  { href: '#team', label: 'Our team' },
  { href: '#faq', label: 'FAQ' },
]

function LandingHeader() {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-[#eadadd] bg-[#fffafb]/95 shadow-[0_10px_35px_-28px_rgba(86,22,44,.45)] backdrop-blur-2xl">
      <div className="relative mx-auto flex h-[82px] w-full max-w-[1580px] items-center px-5 sm:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[280px] overflow-hidden lg:block">
          <div className="absolute right-8 top-4 h-16 w-40 opacity-[.07] [background-image:linear-gradient(90deg,transparent_0_12%,#7A1B2E_12%_13%,transparent_13%_26%,#7A1B2E_26%_27%,transparent_27%_44%,#7A1B2E_44%_45%,transparent_45%)]" />
        </div>

        <Link to="/" className="group flex shrink-0 items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#eddde1] bg-white shadow-[0_10px_25px_-20px_rgba(122,27,46,.8)] transition group-hover:-translate-y-0.5">
            <img src="/mcgill.png" alt="McGill University" className="h-7 w-auto" />
          </span>
          <div className="hidden sm:block">
            <p className="font-display text-[22px] font-semibold leading-none text-[#76172b]">Cheese Database</p>
            <p className="mt-1 text-[7.5px] font-bold uppercase tracking-[.19em] text-[#aa7783]">Research today. Better evidence tomorrow.</p>
          </div>
          <span className="ml-2 hidden h-8 w-px bg-[#dec7cc] md:block" />
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex">
          {NAV.map((item, index) => (
            <a
              key={item.href}
              href={item.href}
              className={index === 0
                ? 'relative rounded-xl px-4 py-2.5 text-[12.5px] font-semibold text-[#7A1B2E] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:rounded-full after:bg-[#7A1B2E]'
                : 'rounded-xl px-4 py-2.5 text-[12.5px] font-medium text-[#62565b] transition-all hover:bg-white hover:text-[#7A1B2E] hover:shadow-sm'}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a href="#research" className="hidden h-10 w-10 items-center justify-center rounded-xl border border-transparent text-[#7A1B2E] transition hover:border-[#ead8dd] hover:bg-white md:flex" aria-label="Search research">
            <Search size={17} />
          </a>
          <span className="hidden h-7 w-px bg-[#e1cfd4] md:block" />
          {user ? (
            <Link to="/" className="inline-flex items-center gap-2 rounded-[14px] bg-[#7A1B2E] px-5 py-3 text-xs font-semibold text-white shadow-[0_14px_28px_-16px_rgba(122,27,46,.8)] transition hover:-translate-y-0.5 hover:bg-[#651426]">
              Open dashboard <ArrowRight size={13} />
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden rounded-xl px-4 py-2.5 text-[12.5px] font-medium text-[#5e5157] transition hover:bg-white hover:text-[#7A1B2E] sm:inline-flex">Log in</Link>
              <Link to="/register" className="inline-flex items-center gap-2 rounded-[14px] bg-[#7A1B2E] px-5 py-3 text-xs font-semibold text-white shadow-[0_14px_28px_-16px_rgba(122,27,46,.8)] transition hover:-translate-y-0.5 hover:bg-[#651426]">
                Get started <ArrowRight size={13} />
              </Link>
            </>
          )}
          <button onClick={() => setOpen((value) => !value)} className="rounded-xl p-2.5 text-slate-500 transition hover:bg-white lg:hidden" aria-label="Toggle navigation">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-[#eee2e5] bg-[#fffafb] px-5 py-3 lg:hidden">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-white hover:text-[#7A1B2E]">
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}

function PaperPreview({ paper }: { paper: ResearchPaper }) {
  return (
    <div className="relative mx-auto h-[215px] w-[154px] shrink-0 overflow-hidden rounded-[7px] border border-[#ded8d9] bg-white p-3 shadow-[0_18px_30px_-22px_rgba(50,25,33,.5)]">
      <div className="flex items-center justify-between border-b border-[#eee8e9] pb-2 text-[5.8px] font-bold uppercase tracking-[.08em] text-[#7A1B2E]">
        <span>{paper.journal}</span><span>{paper.year}</span>
      </div>
      <p className="mt-3 font-display text-[9.5px] font-semibold leading-[1.15] text-[#252024]">{paper.title}</p>
      <p className="mt-2 line-clamp-3 text-[5.8px] leading-[1.35] text-[#766c70]">{paper.authors}</p>
      <div className="mt-3 space-y-1.5">
        {[100, 92, 96, 82].map((width) => <div key={width} className="h-1 rounded-full bg-[#e8e3e4]" style={{ width: `${width}%` }} />)}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1">
        {[55, 76, 42, 68, 86, 60].map((height, index) => (
          <div key={index} className="flex h-8 items-end justify-center rounded-sm bg-[#faf7f8] px-1">
            <span className="w-full rounded-t-sm bg-[#d7a3b0]" style={{ height: `${height}%` }} />
          </div>
        ))}
      </div>
      <span className="absolute bottom-2 right-2 text-[5.5px] font-medium text-[#a19498]">DOI verified</span>
    </div>
  )
}

function ResearchCard({ paper }: { paper: ResearchPaper }) {
  return (
    <a href={paper.doi} target="_blank" rel="noreferrer" className="group grid min-h-[292px] grid-cols-[130px_1fr] gap-4 rounded-[20px] border border-[#eadfe2] bg-white p-4 shadow-[0_18px_45px_-36px_rgba(80,20,41,.5)] transition duration-300 hover:-translate-y-1 hover:border-[#d9b9c2] hover:shadow-[0_28px_55px_-38px_rgba(86,22,44,.65)] sm:grid-cols-[154px_1fr]">
      <PaperPreview paper={paper} />
      <div className="min-w-0 py-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#7A1B2E]" style={{ background: paper.accent }}>{paper.tag}</span>
          <span className="text-[10px] font-medium text-[#a08d93]">{paper.year}</span>
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[#aa5367]">Verified publication</p>
        <h3 className="mt-1.5 font-display text-[18px] font-semibold leading-[1.12] text-[#282023]">{paper.title}</h3>
        <p className="mt-3 text-[11px] font-semibold text-[#7A1B2E]">{paper.featuredAuthor}</p>
        <p className="mt-1 text-[10px] text-[#8f8186]">{paper.journal}</p>
        <p className="mt-3 line-clamp-3 text-[10.5px] leading-relaxed text-[#6f6469]">{paper.summary}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#7A1B2E]">Open DOI <ExternalLink size={10} /></span>
      </div>
    </a>
  )
}

function HeroFloatCard({
  className,
  icon,
  eyebrow,
  title,
  note,
  delay = '0s',
}: {
  className: string
  icon: React.ReactNode
  eyebrow: string
  title: string
  note: string
  delay?: string
}) {
  return (
    <div
      className={`pointer-events-none absolute z-30 hidden min-w-[190px] rounded-[20px] border border-white/90 bg-white/90 px-4 py-3.5 shadow-[0_28px_65px_-28px_rgba(68,23,37,.45)] backdrop-blur-xl xl:block ${className}`}
      style={{ animation: `landingFloat 6s ease-in-out ${delay} infinite` }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#f8e8ec] text-[#92213d]">{icon}</span>
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[.14em] text-[#b26b7c]">{eyebrow}</p>
          <p className="mt-0.5 font-display text-[18px] font-semibold leading-none text-[#34262b]">{title}</p>
          <p className="mt-1 text-[8.5px] text-[#8a7a80]">{note}</p>
        </div>
      </div>
    </div>
  )
}

function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(true)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const toggleVideo = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2
    setTilt({ x, y })
  }

  return (
    <section id="platform" className="relative overflow-hidden border-b border-[#eadde0] bg-[#fff8f8]">
      <style>{`
        @keyframes landingFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        @keyframes landingPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(122,27,46,.20) } 50% { box-shadow: 0 0 0 15px rgba(122,27,46,0) } }
        @keyframes landingDrift { 0%,100% { transform: translate3d(0,0,0) scale(1) } 50% { transform: translate3d(18px,-12px,0) scale(1.05) } }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-80px] h-[430px] w-[430px] rounded-full bg-[#f5dfe5]/70 blur-3xl" style={{ animation: 'landingDrift 12s ease-in-out infinite' }} />
        <div className="absolute right-[-120px] top-[80px] h-[420px] w-[420px] rounded-full bg-[#f1e4dc]/80 blur-3xl" style={{ animation: 'landingDrift 15s ease-in-out 1s infinite reverse' }} />
        <div className="absolute inset-0 opacity-[.16] [background-image:radial-gradient(#b96f80_0.7px,transparent_0.7px)] [background-size:23px_23px]" />
      </div>

      <div className="relative mx-auto grid min-h-[720px] max-w-[1580px] grid-cols-1 items-center gap-10 px-6 py-14 sm:px-8 lg:grid-cols-[.76fr_1.24fr] lg:px-10 lg:py-16">
        <div className="relative z-20 max-w-[610px] lg:pr-4">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-8 bg-[#ad3852]" />
            <span className="text-[9px] font-bold uppercase tracking-[.2em] text-[#9d2944]">Research intelligence for food science</span>
          </div>

          <h1 className="font-display text-[52px] font-medium leading-[.94] tracking-[-.04em] text-[#251c20] sm:text-[66px] lg:text-[76px] xl:text-[82px]">
            From research<br />papers to <span className="italic text-[#9d1f40]">real discoveries.</span>
          </h1>
          <p className="mt-7 max-w-[555px] text-[15px] leading-[1.78] text-[#66595f]">
            Upload scientific PDFs, capture tables, figures and experimental conditions, review every extracted value, and build a traceable research database — without manual transcription.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register" className="group inline-flex items-center gap-2.5 rounded-[16px] bg-[#8b1835] px-6 py-3.5 text-[12px] font-semibold text-white shadow-[0_18px_35px_-18px_rgba(122,27,46,.85)] transition duration-300 hover:-translate-y-1 hover:bg-[#701329] hover:shadow-[0_24px_42px_-18px_rgba(122,27,46,.9)]">
              Get started for free <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <button onClick={toggleVideo} className="group inline-flex items-center gap-2.5 rounded-[16px] border border-[#d9bfc6] bg-white/80 px-6 py-3.5 text-[12px] font-semibold text-[#7A1B2E] shadow-[0_14px_28px_-25px_rgba(80,20,40,.6)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-[#c68f9c] hover:bg-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f7e6ea]">{playing ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}</span>
              {playing ? 'Pause the demo' : 'Watch the demo'}
            </button>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
            {[
              ['Traceable evidence', Link2],
              ['Researcher review', Users],
              ['Structured export', Database],
            ].map(([label, Icon]) => {
              const ItemIcon = Icon as typeof Link2
              return (
                <div key={label as string} className="flex items-center gap-2.5 text-[10.5px] font-medium text-[#665a60]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#f0dce1] bg-white/70 text-[#9b2945] shadow-sm"><ItemIcon size={14} /></span>
                  {label as string}
                </div>
              )
            })}
          </div>
        </div>

        <div id="demo" className="relative min-h-[510px] lg:min-h-[610px]" onMouseMove={handleMove} onMouseLeave={() => setTilt({ x: 0, y: 0 })}>
          <div className="absolute inset-[-8%_-6%_-9%_-7%] overflow-hidden rounded-[45px]">
            <img src={MEDIA.cheeses} alt="Cheese research environment" className="h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,248,249,.87)_0%,rgba(255,248,249,.26)_34%,rgba(53,35,42,.08)_68%,rgba(44,31,36,.18)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_35%,transparent_0_30%,rgba(255,246,248,.18)_60%,rgba(255,246,248,.52)_100%)]" />
          </div>

          <div className="absolute left-[-7%] top-[35%] z-10 hidden w-[155px] -rotate-3 overflow-hidden rounded-[14px] border border-white/80 bg-white/70 shadow-[0_30px_60px_-35px_rgba(66,24,37,.6)] backdrop-blur md:block">
            <img src={MEDIA.aging} alt="Cheese aging" className="h-[110px] w-full object-cover" />
            <div className="space-y-1.5 px-3 py-3 font-display text-[11px] text-[#6d4d56]">
              <p>Food Science</p><p>Dairy Chemistry</p><p>Microbial Ecology</p><p>Cheese Technology</p>
            </div>
          </div>

          <div
            className="absolute inset-x-[4%] top-[13%] z-20 overflow-hidden rounded-[28px] border border-[#f2e5e8] bg-[#201b1d] p-2.5 shadow-[0_45px_90px_-35px_rgba(48,20,29,.62)] transition-transform duration-200 ease-out lg:inset-x-[8%]"
            style={{ transform: `perspective(1200px) rotateX(${tilt.y * -2.1}deg) rotateY(${tilt.x * 2.8}deg) translate3d(${tilt.x * 5}px,${tilt.y * 4}px,0)` }}
          >
            <div className="relative overflow-hidden rounded-[20px] bg-black">
              <video ref={videoRef} autoPlay muted loop playsInline controls preload="metadata" poster={MEDIA.aging} className="aspect-video w-full bg-black object-cover">
                <source src={DEMO_VIDEO} type="video/mp4" />
                Your browser does not support the demo video.
              </video>
              <button onClick={toggleVideo} className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-[#8d1735]/94 text-white shadow-[0_20px_50px_-15px_rgba(87,20,39,.75)] backdrop-blur transition duration-300 hover:scale-110 hover:bg-[#741229]" style={{ animation: 'landingPulse 3s ease-out infinite' }} aria-label={playing ? 'Pause demo video' : 'Play demo video'}>
                {playing ? <Pause size={24} fill="currentColor" /> : <Play size={27} fill="currentColor" className="translate-x-0.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-white/75">
              <span className="text-[9.5px] font-medium">Live application walkthrough</span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[.11em]">Real app demo</span>
            </div>
          </div>

          <div className="absolute left-[47%] top-[5%] z-40 hidden -translate-x-1/2 rotate-[-2deg] xl:block">
            <p className="font-display text-[19px] italic leading-tight text-[#9b3450]">Watch a<br />live demo</p>
            <span className="ml-7 text-[28px] text-[#a33d57]">↘</span>
          </div>

          <HeroFloatCard className="left-[19%] top-[1%]" icon={<BookOpen size={17} />} eyebrow="Research papers" title="Organized" note="Real PDFs, one workspace" delay="0s" />
          <HeroFloatCard className="right-[2%] top-[7%]" icon={<Sparkles size={17} />} eyebrow="Evidence" title="Extracted" note="Tables · figures · context" delay="-1.2s" />
          <HeroFloatCard className="right-[-2%] top-[41%]" icon={<CheckCircle2 size={18} />} eyebrow="Review" title="Traceable" note="Source preserved" delay="-2.3s" />

          <div className="absolute bottom-[11%] right-[2%] z-30 hidden rounded-[18px] border border-white/90 bg-white/92 px-4 py-3 shadow-[0_26px_55px_-28px_rgba(58,22,35,.55)] backdrop-blur xl:block" style={{ animation: 'landingFloat 6.5s ease-in-out -3.1s infinite' }}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#f8e8ec] text-[#92213d]"><Database size={17} /></span>
              <div><p className="font-display text-[16px] font-semibold text-[#34262b]">Export to CSV</p><p className="text-[8.5px] text-[#8a7a80]">Reviewed data, one click away</p></div>
              <ArrowRight size={13} className="ml-2 text-[#9b2945]" />
            </div>
          </div>

          <div className="absolute bottom-[1%] right-[10%] z-30 hidden rotate-[-4deg] xl:block">
            <p className="font-display text-[18px] italic leading-tight text-[#8e4054]">From papers<br />to progress.</p>
            <span className="block -translate-x-5 -translate-y-1 text-[26px] text-[#9e3650]">↖</span>
          </div>
        </div>
      </div>

      <div className="relative border-t border-[#eadadd] bg-white/78 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1580px] flex-col gap-5 px-6 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-[#ad3852]" />
            <p className="text-[8.5px] font-bold uppercase tracking-[.2em] text-[#a03550]">Built for researchers</p>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-start gap-x-8 gap-y-4 lg:justify-center">
            {[['Open research', BookOpen], ['Transparent methods', ShieldCheck], ['Built for the research community', Users]].map(([label, Icon]) => {
              const ItemIcon = Icon as typeof BookOpen
              return <div key={label as string} className="flex items-center gap-2.5 text-[10.5px] font-medium text-[#62565b]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f9e9ed] text-[#9d2945]"><ItemIcon size={13} /></span>{label as string}</div>
            })}
          </div>
          <div className="hidden items-center gap-4 border-l border-[#ead6db] pl-8 xl:flex">
            <p className="font-display text-[17px] italic leading-[1.1] text-[#9b6673]">Same questions.<br />Better evidence.</p>
            <span className="h-px w-14 bg-[#c98e9d]" />
          </div>
        </div>
      </div>
    </section>
  )
}

function Workflow() {
  const steps = [
    ['01', 'Upload paper', 'Add one or more scientific PDFs to a project.', Upload],
    ['02', 'Paper is read', 'Text, tables, figures and context become reviewable evidence.', FileSearch],
    ['03', 'Data is structured', 'Products, treatments, conditions and measurements become records.', Database],
    ['04', 'You review it', 'Approve, edit or reject values while keeping the source nearby.', ShieldCheck],
    ['05', 'Explore & export', 'Search, compare and export the reviewed scientific dataset.', Search],
  ]

  return (
    <section id="pipeline" className="border-b border-[#efe4e7] bg-white py-16 lg:py-20">
      <div className="mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[.34fr_1fr] lg:items-start">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">How it works</p>
            <h2 className="mt-3 font-display text-[38px] font-medium leading-[1.02] text-[#281f22]">From PDF to insight, in five clear steps.</h2>
            <p className="mt-4 text-[12px] leading-relaxed text-[#776a70]">A simple interface on top of a provenance-aware scientific workflow.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {steps.map(([number, title, description, Icon]) => {
              const IconComponent = Icon as typeof Upload
              return (
                <div key={number as string} className="group rounded-[18px] border border-[#eadfe2] bg-[#fffdfd] p-4 transition hover:-translate-y-1 hover:border-[#dcbec6] hover:shadow-[0_18px_40px_-32px_rgba(87,24,46,.7)]">
                  <div className="flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f8e9ed] text-[#92223d]"><IconComponent size={14} /></span><span className="text-[9px] font-bold text-[#a1465c]">{number as string}</span></div>
                  <h3 className="mt-5 text-[12px] font-semibold text-[#2d2528]">{title as string}</h3>
                  <p className="mt-2 text-[9.5px] leading-relaxed text-[#84767c]">{description as string}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function ResearchSection() {
  return (
    <section id="research" className="relative overflow-hidden border-b border-[#efe4e7] bg-[#fff8fa] py-16 lg:py-20">
      <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-[#f5e5e9] blur-3xl" />
      <div className="relative mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[720px]">
            <p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">Recent research</p>
            <h2 className="mt-3 font-display text-[42px] font-medium leading-[1.02] text-[#281f22]">Real publications from the researchers behind the project.</h2>
            <p className="mt-4 max-w-[650px] text-[12px] leading-relaxed text-[#74676d]">Every title below is a real publication and links to its DOI. No fabricated paper titles are used on this page.</p>
          </div>
          <div className="rounded-[16px] border border-[#e8d7dc] bg-white px-4 py-3 text-[10px] leading-relaxed text-[#776a70]"><span className="font-semibold text-[#7A1B2E]">Verified metadata</span><br />DOI · journal · year · authors</div>
        </div>
        <div className="mt-10 grid gap-4 xl:grid-cols-3">{RESEARCH_PAPERS.map((paper) => <ResearchCard key={paper.doi} paper={paper} />)}</div>
      </div>
    </section>
  )
}

function ResearchWorld() {
  const cards = [
    [MEDIA.campus, 'Macdonald Campus', 'A research environment connecting food science, agriculture and applied innovation.'],
    [MEDIA.lab, 'Controlled studies', 'Scientific evidence begins in carefully designed experiments and laboratory measurements.'],
    [MEDIA.cave, 'Real cheese systems', 'The platform keeps the connection between published measurements and the products they describe.'],
  ]

  return (
    <section className="border-b border-[#efe4e7] bg-white py-16 lg:py-20">
      <div className="mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[.34fr_1fr]">
          <div className="max-w-[390px]">
            <p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">Research environment</p>
            <h2 className="mt-3 font-display text-[39px] font-medium leading-[1.04] text-[#281f22]">Built around the way scientific work actually happens.</h2>
            <p className="mt-4 text-[12px] leading-relaxed text-[#786b71]">The interface is organized around papers, experiments, treatments, observations, provenance and researcher review — not generic document parsing.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map(([image, title, body]) => (
              <div key={title} className="group overflow-hidden rounded-[22px] border border-[#e9dfe1] bg-[#fffdfd] shadow-[0_22px_50px_-42px_rgba(70,20,38,.6)]">
                <div className="relative h-[210px] overflow-hidden"><img src={image} alt={title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" /><span className="absolute bottom-4 left-4 text-[11px] font-semibold text-white">{title}</span></div>
                <p className="p-4 text-[10.5px] leading-relaxed text-[#786c71]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Capabilities() {
  const items = [
    ['Evidence-first extraction', 'Tables, figures and nearby text remain inspectable before structured extraction begins.', FileSearch],
    ['Flexible extraction engines', 'Rules, local ML and LLM methods can coexist instead of forcing every paper through one method.', Sparkles],
    ['Full provenance', 'Values can keep their paper, page, table, figure and source context for later review.', Link2],
    ['Human in the loop', 'Researchers remain in control of approval, editing and rejection before data becomes trusted.', ShieldCheck],
    ['One scientific database', 'Reviewed observations flow into a searchable project-level dataset rather than isolated spreadsheets.', Database],
    ['Research-ready structure', 'Experiments, treatments, conditions, microorganisms and observations are represented explicitly.', FlaskConical],
  ]

  return (
    <section id="validation" className="border-b border-[#efe4e7] bg-[#fffafa] py-16 lg:py-20">
      <div className="mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[760px] text-center"><p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">Scientific rigor</p><h2 className="mt-3 font-display text-[44px] font-medium leading-[1.02] text-[#281f22]">More than extraction — a complete research data workflow.</h2><p className="mt-4 text-[12px] leading-relaxed text-[#776a70]">Designed to make scientific data easier to inspect, compare, approve and reuse.</p></div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(([title, body, Icon]) => {
            const IconComponent = Icon as typeof FileSearch
            return <div key={title as string} className="rounded-[20px] border border-[#e9dfe2] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#d7b7c0]"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8e9ed] text-[#992944]"><IconComponent size={16} /></span><h3 className="mt-4 text-[12px] font-semibold text-[#2d2528]">{title as string}</h3><p className="mt-2 text-[10.5px] leading-relaxed text-[#81747a]">{body as string}</p></div>
          })}
        </div>
      </div>
    </section>
  )
}

function TeamSection() {
  const members = [
    { name: 'Salwa Karboune, PhD', role: 'Dean · Professor · Scientific Director', affiliation: 'McGill University · Food Science & Agricultural Chemistry', body: 'Food-science leadership and research direction, connecting functional ingredients, biocatalysis and applied agri-food innovation.', image: MEDIA.salwa, initials: 'SK', href: 'https://www.mcgill.ca/macdonald/salwa-karboune' },
    { name: 'Zahra Allahdad, PhD', role: 'Research Associate', affiliation: 'Karboune Lab · McGill University', body: 'Food-protein interactions, functional ingredients, high-protein beverages and research guidance for scientifically realistic extraction.', image: null, initials: 'ZA', href: 'https://www.karboune-group.lab.mcgill.ca/our-team1-1' },
    { name: 'Loubna Benabbou, PhD', role: 'Professor · AI & decision science', affiliation: 'Université du Québec à Rimouski', body: 'Machine learning, decision science and operations-research expertise supporting intelligent, structured research workflows.', image: null, initials: 'LB', href: 'https://www.uqar.ca/professeurs/benabbou-loubna/' },
  ]

  return (
    <section id="team" className="border-b border-[#efe4e7] bg-white py-16 lg:py-20">
      <div className="mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-10">
        <div className="mb-8"><p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">Research collaborators</p><h2 className="mt-3 font-display text-[40px] font-medium leading-[1.03] text-[#281f22]">Guided by researchers. Built for better evidence.</h2></div>
        <div className="grid gap-4 md:grid-cols-3">
          {members.map((member) => (
            <a key={member.name} href={member.href} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-[24px] border border-[#e4cdd3] bg-[#fffdfd] shadow-[0_22px_50px_-42px_rgba(70,20,38,.6)] transition hover:-translate-y-1 hover:border-[#c994a1]">
              <div className="relative flex h-[260px] items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#fff5f3,#f8eaf0)]">
                {member.image ? <img src={member.image} alt={member.name} className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]" /> : <><div className="absolute inset-0 opacity-45 [background-image:radial-gradient(#c994a1_0.6px,transparent_0.6px)] [background-size:12px_12px]" /><div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-[#e2bdc6] bg-white/82 font-display text-[34px] text-[#8b2740] shadow-[0_15px_35px_-24px_rgba(90,25,45,.65)]">{member.initials}</div></>}
              </div>
              <div className="p-5"><span className="inline-flex rounded-full border border-[#ead0d6] bg-[#fff5f7] px-2.5 py-1 text-[8.5px] font-bold uppercase tracking-[.08em] text-[#9e2945]">{member.role}</span><h3 className="mt-4 font-display text-[22px] font-semibold leading-tight text-[#282023]">{member.name}</h3><p className="mt-1.5 text-[10px] font-semibold text-[#9d2642]">{member.affiliation}</p><p className="mt-3 text-[10.5px] leading-relaxed text-[#786c71]">{member.body}</p><span className="mt-4 inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#7A1B2E]">View profile <ExternalLink size={9} /></span></div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  const items = [
    ['What kind of papers can I upload?', 'The workspace is designed for scientific PDF papers. It supports single-paper analysis or batch uploads while keeping each paper attached to its project.'],
    ['Does the platform only use an LLM?', 'No. The project supports deterministic rules, local ML options and LLM-based extraction. Docling remains the document-understanding layer.'],
    ['Can I verify where a value came from?', 'Yes. The workflow keeps provenance so researchers can inspect the originating paper, page, table, figure or nearby source text before approving data.'],
    ['What happens when a paper does not contain a field?', 'Optional scientific fields are omitted when absent. The database adapts to what the paper actually contains instead of filling the interface with missing-value placeholders.'],
  ]

  return (
    <section id="faq" className="bg-[#fffafa] py-16 lg:py-20">
      <div className="mx-auto grid max-w-[1250px] gap-8 px-6 sm:px-8 lg:grid-cols-[.38fr_1fr] lg:px-10">
        <div><p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">FAQ</p><h2 className="mt-3 font-display text-[40px] font-medium text-[#281f22]">Common questions.</h2><p className="mt-4 text-[12px] leading-relaxed text-[#776a70]">A few practical answers about the research workflow.</p></div>
        <div className="space-y-3">
          {items.map(([question, answer], index) => (
            <button key={question} onClick={() => setOpen(open === index ? null : index)} className="w-full rounded-[18px] border border-[#e8dce0] bg-white px-5 py-4 text-left transition hover:border-[#d7b7c0]"><div className="flex items-center justify-between gap-4"><span className="text-[11.5px] font-semibold text-[#30272a]">{question}</span><ChevronDown size={15} className={`shrink-0 text-[#8f2942] transition ${open === index ? 'rotate-180' : ''}`} /></div>{open === index && <p className="mt-3 max-w-[850px] text-[10.5px] leading-relaxed text-[#7d7076]">{answer}</p>}</button>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTA() {
  return (
    <section className="bg-[#fffafa] pb-14">
      <div className="mx-auto max-w-[1320px] px-6 sm:px-8 lg:px-10">
        <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(115deg,#5f0f23,#8f1e39_60%,#a8455e)] px-7 py-9 text-white shadow-[0_30px_70px_-45px_rgba(92,19,40,.85)] md:px-10">
          <div className="absolute -right-16 -top-28 h-72 w-72 rounded-full border border-white/10" />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-[720px]"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/65">Your research dataset</p><h2 className="mt-3 font-display text-[38px] font-medium leading-tight">Turn scientific literature into something you can actually use.</h2><p className="mt-3 max-w-[650px] text-[11px] leading-relaxed text-white/70">Create a project, upload a paper, inspect the extracted evidence and build a structured, reviewable scientific database.</p></div>
            <div className="flex shrink-0 flex-wrap gap-3"><Link to="/register" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[11px] font-semibold text-[#7A1B2E]">Create an account <ArrowRight size={12} /></Link><Link to="/login" className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-[11px] font-semibold text-white">Log in</Link></div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[#eadfe2] bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-6 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex items-center gap-3"><img src="/mcgill.png" alt="McGill" className="h-7 w-auto" /><div><p className="text-[10px] font-semibold text-[#6f1c31]">Cheese Database</p><p className="mt-0.5 text-[8.5px] text-[#a09398]">Research paper intelligence platform · 2026</p></div></div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[9px] font-medium text-[#81747a]"><a href="#demo" className="hover:text-[#7A1B2E]">Demo</a><a href="#research" className="hover:text-[#7A1B2E]">Research</a><a href="#team" className="hover:text-[#7A1B2E]">Team</a><a href="#faq" className="hover:text-[#7A1B2E]">FAQ</a></div>
        <p className="max-w-[420px] text-[8px] leading-relaxed text-[#aaa0a4]">Campus, laboratory and cheese imagery uses the same public sources selected for the cheese-shelf-Life-v7 landing page. Publication cards link to verified external records.</p>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#fffafa] text-[#2a2225]" style={{ ['--landing-brand' as string]: BRAND }}>
      <LandingHeader />
      <main>
        <Hero />
        <Workflow />
        <ResearchSection />
        <ResearchWorld />
        <Capabilities />
        <TeamSection />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
