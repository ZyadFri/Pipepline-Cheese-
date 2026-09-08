import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Database,
  ExternalLink,
  FileSearch,
  FileText,
  FlaskConical,
  Link2,
  Menu,
  Microscope,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../store/auth'

const BRAND = '#7A1B2E'

// Reuse the same real-world visual sources that were selected for the
// cheese-shelf-Life-v7 landing page. They are public Wikimedia / McGill assets,
// so this landing page does not depend on the other private repository at runtime.
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

// Real, externally verifiable publications. Keep these metadata literal and do
// not replace them with demo/example paper names.
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
    <header className="sticky top-0 z-50 border-b border-[#eee2e5] bg-[#fffdfd]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[70px] w-full max-w-[1500px] items-center px-5 sm:px-8 lg:px-10">
        <Link to="/" className="flex shrink-0 items-center gap-3">
          <img src="/mcgill.png" alt="McGill University" className="h-8 w-auto" />
          <span className="hidden h-6 w-px bg-[#decbd0] sm:block" />
          <span className="font-display text-[19px] font-semibold text-[#6e172a]">Cheese Database</span>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 lg:flex">
          {NAV.map((item, index) => (
            <a
              key={item.href}
              href={item.href}
              className={index === 0
                ? 'relative rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[#7A1B2E] after:absolute after:bottom-0 after:left-3.5 after:right-3.5 after:h-[2px] after:rounded-full after:bg-[#7A1B2E]'
                : 'rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-[#675d62] transition hover:bg-[#fbf4f6] hover:text-[#7A1B2E]'}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-[#7A1B2E] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#651426]">
              Open dashboard <ArrowRight size={13} />
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden rounded-lg px-3.5 py-2.5 text-[12.5px] font-medium text-[#61575c] hover:text-[#7A1B2E] sm:inline-flex">Log in</Link>
              <Link to="/register" className="inline-flex items-center gap-2 rounded-xl bg-[#7A1B2E] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#651426]">
                Get started <ArrowRight size={13} />
              </Link>
            </>
          )}
          <button onClick={() => setOpen((value) => !value)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Toggle navigation">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-[#eee2e5] bg-white px-5 py-3 lg:hidden">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-[#fbf4f6] hover:text-[#7A1B2E]">
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
    <div className="relative mx-auto h-[215px] w-[154px] shrink-0 overflow-hidden rounded-[6px] border border-[#ded8d9] bg-white p-3 shadow-[0_16px_30px_-22px_rgba(50,25,33,.5)]">
      <div className="flex items-center justify-between border-b border-[#eee8e9] pb-2 text-[5.8px] font-bold uppercase tracking-[.08em] text-[#7A1B2E]">
        <span>{paper.journal}</span>
        <span>{paper.year}</span>
      </div>
      <p className="mt-3 font-display text-[9.5px] font-semibold leading-[1.15] text-[#252024]">{paper.title}</p>
      <p className="mt-2 line-clamp-3 text-[5.8px] leading-[1.35] text-[#766c70]">{paper.authors}</p>
      <div className="mt-3 space-y-1.5">
        <div className="h-1 rounded-full bg-[#e8e3e4]" />
        <div className="h-1 w-[92%] rounded-full bg-[#e8e3e4]" />
        <div className="h-1 w-[96%] rounded-full bg-[#e8e3e4]" />
        <div className="h-1 w-[82%] rounded-full bg-[#e8e3e4]" />
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
    <a
      href={paper.doi}
      target="_blank"
      rel="noreferrer"
      className="group grid min-h-[292px] grid-cols-[130px_1fr] gap-4 rounded-[20px] border border-[#eadfe2] bg-white p-4 shadow-[0_18px_45px_-36px_rgba(80,20,41,.5)] transition duration-300 hover:-translate-y-1 hover:border-[#d9b9c2] hover:shadow-[0_28px_55px_-38px_rgba(86,22,44,.65)] sm:grid-cols-[154px_1fr]"
    >
      <PaperPreview paper={paper} />
      <div className="min-w-0 py-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#7A1B2E]" style={{ background: paper.accent }}>{paper.tag}</span>
          <span className="text-[10px] font-medium text-[#a08d93]">{paper.year}</span>
        </div>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[#aa5367]">Recent publication</p>
        <h3 className="mt-1.5 font-display text-[18px] font-semibold leading-[1.12] text-[#282023]">{paper.title}</h3>
        <p className="mt-3 text-[11px] font-semibold text-[#7A1B2E]">{paper.featuredAuthor}</p>
        <p className="mt-1 text-[10px] text-[#8f8186]">{paper.journal}</p>
        <p className="mt-3 line-clamp-3 text-[10.5px] leading-relaxed text-[#6f6469]">{paper.summary}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#7A1B2E]">Open publication <ExternalLink size={10} /></span>
      </div>
    </a>
  )
}

function Hero() {
  return (
    <section id="platform" className="relative overflow-hidden border-b border-[#efe4e7] bg-[#fffafa]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_20%,rgba(139,23,48,.08),transparent_28%),radial-gradient(circle_at_84%_18%,rgba(139,23,48,.07),transparent_24%)]" />
      <div className="relative mx-auto grid min-h-[610px] max-w-[1500px] grid-cols-1 items-center gap-10 px-6 py-12 sm:px-8 lg:grid-cols-[.82fr_1.18fr] lg:px-10 lg:py-16">
        <div className="relative z-10 max-w-[600px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e7c7cf] bg-white/80 px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-[.15em] text-[#9b2642]">
            <Sparkles size={11} /> Research intelligence for food science
          </span>
          <h1 className="mt-6 font-display text-[48px] font-medium leading-[.98] tracking-[-.035em] text-[#241c1f] sm:text-[60px] lg:text-[66px]">
            From research papers to <span className="italic text-[#9b1d3d]">real discoveries.</span>
          </h1>
          <p className="mt-6 max-w-[540px] text-[15px] leading-[1.75] text-[#685c62]">
            Upload scientific PDFs, capture tables, figures and experimental conditions, review every extracted value, and build a traceable research database without manual transcription.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/register" className="inline-flex items-center gap-2 rounded-xl bg-[#7A1B2E] px-5 py-3 text-[12px] font-semibold text-white shadow-[0_14px_30px_-18px_rgba(122,27,46,.8)] transition hover:-translate-y-0.5 hover:bg-[#651426]">
              Get started for free <ArrowRight size={13} />
            </Link>
            <a href="#demo" className="inline-flex items-center gap-2 rounded-xl border border-[#d9c2c8] bg-white px-5 py-3 text-[12px] font-semibold text-[#6f2236] transition hover:border-[#bd8b98] hover:bg-[#fff8fa]">
              <Play size={12} fill="currentColor" /> Watch the demo
            </a>
          </div>
          <div className="mt-7 grid max-w-[560px] grid-cols-1 gap-3 text-[10.5px] text-[#70656a] sm:grid-cols-3">
            {[
              ['Traceable evidence', Link2],
              ['Researcher review', ShieldCheck],
              ['Structured export', Database],
            ].map(([label, Icon]) => {
              const IconComponent = Icon as typeof Link2
              return (
                <div key={label as string} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f8e9ed] text-[#9b2642]"><IconComponent size={12} /></span>
                  <span className="font-medium">{label as string}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div id="demo" className="relative min-h-[480px] lg:min-h-[540px]">
          <div className="absolute inset-0 overflow-hidden rounded-[30px] border border-white/70 bg-[#d9cec9] shadow-[0_38px_90px_-48px_rgba(55,26,35,.7)]">
            <img src={MEDIA.cheeses} alt="Cheese research" className="h-full w-full object-cover opacity-55" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,250,250,.70),rgba(34,25,29,.14)_55%,rgba(28,20,24,.30))]" />
          </div>
          <div className="absolute inset-x-[5%] top-[8%] overflow-hidden rounded-[22px] border border-white/90 bg-[#231f20] p-2 shadow-[0_30px_80px_-30px_rgba(38,20,26,.75)] lg:inset-x-[8%] lg:top-[9%]">
            <div className="overflow-hidden rounded-[16px] bg-black">
              <video controls preload="metadata" poster={MEDIA.aging} className="aspect-video w-full bg-black object-cover">
                <source src={DEMO_VIDEO} type="video/mp4" />
                Your browser does not support the demo video.
              </video>
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-white/80">
              <span className="text-[9.5px] font-medium">A real walkthrough of the Cheese Database</span>
              <span className="rounded-full bg-white/10 px-2 py-1 text-[8.5px]">App demo</span>
            </div>
          </div>
          <div className="absolute bottom-[3%] left-[2%] hidden max-w-[220px] rounded-[18px] border border-[#eadde0] bg-white/95 p-4 shadow-[0_24px_55px_-34px_rgba(56,24,34,.7)] md:block">
            <p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#a23851]">What you will see</p>
            <p className="mt-2 font-display text-[16px] leading-tight text-[#2d2226]">Paper → evidence → reviewed database</p>
            <p className="mt-2 text-[9.5px] leading-relaxed text-[#807278]">The video uses real application screens rather than a fabricated product mockup.</p>
          </div>
          <div className="absolute bottom-[5%] right-[2%] hidden max-w-[190px] rotate-[-2deg] rounded-[18px] bg-[#fff7f3]/95 p-4 text-center shadow-[0_22px_50px_-36px_rgba(55,24,33,.6)] lg:block">
            <p className="font-display text-[18px] italic leading-tight text-[#7c5962]">Research today.<br />Better evidence tomorrow.</p>
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
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f8e9ed] text-[#92223d]"><IconComponent size={14} /></span>
                    <span className="text-[9px] font-bold text-[#a1465c]">{number as string}</span>
                  </div>
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
            <p className="mt-4 max-w-[650px] text-[12px] leading-relaxed text-[#74676d]">These are real publications verified from publisher, university or scholarly sources. Each card opens the publication DOI — no placeholder titles or fabricated papers.</p>
          </div>
          <div className="rounded-[16px] border border-[#e8d7dc] bg-white px-4 py-3 text-[10px] leading-relaxed text-[#776a70]">
            <span className="font-semibold text-[#7A1B2E]">Verified metadata</span><br />DOI · journal · year · authors
          </div>
        </div>
        <div className="mt-10 grid gap-4 xl:grid-cols-3">
          {RESEARCH_PAPERS.map((paper) => <ResearchCard key={paper.doi} paper={paper} />)}
        </div>
      </div>
    </section>
  )
}

function ResearchWorld() {
  const cards = [
    [MEDIA.campus, 'Macdonald Campus', 'A research environment connecting food science, agriculture and applied innovation.'],
    [MEDIA.lab, 'Controlled studies', 'Scientific evidence begins in carefully designed experiments and laboratory measurements.'],
    [MEDIA.cave, 'Real food systems', 'The platform keeps the connection between published measurements and the products they describe.'],
  ]

  return (
    <section className="border-b border-[#efe4e7] bg-white py-16 lg:py-20">
      <div className="mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[.34fr_1fr]">
          <div className="max-w-[390px]">
            <p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">Research environment</p>
            <h2 className="mt-3 font-display text-[39px] font-medium leading-[1.04] text-[#281f22]">Built around the way scientific work actually happens.</h2>
            <p className="mt-4 text-[12px] leading-relaxed text-[#786b71]">The interface is not a generic document parser. It is organized around papers, experiments, treatments, observations, provenance and researcher review.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map(([image, title, body]) => (
              <div key={title} className="group overflow-hidden rounded-[22px] border border-[#e9dfe1] bg-[#fffdfd] shadow-[0_22px_50px_-42px_rgba(70,20,38,.6)]">
                <div className="relative h-[210px] overflow-hidden">
                  <img src={image} alt={title} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
                  <span className="absolute bottom-4 left-4 text-[11px] font-semibold text-white">{title}</span>
                </div>
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
        <div className="mx-auto max-w-[760px] text-center">
          <p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">Scientific rigor</p>
          <h2 className="mt-3 font-display text-[44px] font-medium leading-[1.02] text-[#281f22]">More than extraction — a complete research data workflow.</h2>
          <p className="mt-4 text-[12px] leading-relaxed text-[#776a70]">Designed to make scientific data easier to inspect, compare, approve and reuse.</p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(([title, body, Icon]) => {
            const IconComponent = Icon as typeof FileSearch
            return (
              <div key={title as string} className="rounded-[20px] border border-[#e9dfe2] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#d7b7c0]">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f8e9ed] text-[#992944]"><IconComponent size={16} /></span>
                <h3 className="mt-4 text-[12px] font-semibold text-[#2d2528]">{title as string}</h3>
                <p className="mt-2 text-[10.5px] leading-relaxed text-[#81747a]">{body as string}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function TeamSection() {
  const members = [
    {
      name: 'Salwa Karboune, PhD',
      role: 'Dean · Professor · Scientific Director',
      affiliation: 'McGill University · Food Science & Agricultural Chemistry',
      body: 'Food-science leadership and research direction, connecting functional ingredients, biocatalysis and applied agri-food innovation.',
      image: MEDIA.salwa,
      initials: 'SK',
      href: 'https://www.mcgill.ca/macdonald/salwa-karboune',
    },
    {
      name: 'Zahra Allahdad, PhD',
      role: 'Research Associate',
      affiliation: 'Karboune Lab · McGill University',
      body: 'Food-protein interactions, functional ingredients, high-protein beverages and research guidance for scientifically realistic extraction.',
      image: null,
      initials: 'ZA',
      href: 'https://www.karboune-group.lab.mcgill.ca/our-team1-1',
    },
    {
      name: 'Loubna Benabbou, PhD',
      role: 'Professor · AI & decision science',
      affiliation: 'Université du Québec à Rimouski',
      body: 'Machine learning, decision science and operations-research expertise supporting intelligent, structured research workflows.',
      image: null,
      initials: 'LB',
      href: 'https://www.uqar.ca/professeurs/benabbou-loubna/',
    },
  ]

  return (
    <section id="team" className="border-b border-[#efe4e7] bg-white py-16 lg:py-20">
      <div className="mx-auto max-w-[1500px] px-6 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[.34fr_1fr]">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">Research collaborators</p>
            <h2 className="mt-3 font-display text-[40px] font-medium leading-[1.03] text-[#281f22]">Guided by researchers. Built for better evidence.</h2>
            <p className="mt-4 max-w-[390px] text-[12px] leading-relaxed text-[#776a70]">A multidisciplinary collaboration spanning food science, functional ingredients, artificial intelligence and decision systems.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {members.map((member) => (
              <a key={member.name} href={member.href} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-[22px] border border-[#e4cdd3] bg-[#fffdfd] shadow-[0_22px_50px_-42px_rgba(70,20,38,.6)] transition hover:-translate-y-1 hover:border-[#c994a1]">
                <div className="relative flex h-[220px] items-center justify-center overflow-hidden bg-[linear-gradient(145deg,#fff5f3,#f8eaf0)]">
                  {member.image ? (
                    <img src={member.image} alt={member.name} className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]" />
                  ) : (
                    <>
                      <div className="absolute inset-0 opacity-45 [background-image:radial-gradient(#c994a1_0.6px,transparent_0.6px)] [background-size:12px_12px]" />
                      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-[#e2bdc6] bg-white/80 font-display text-[31px] text-[#8b2740] shadow-[0_15px_35px_-24px_rgba(90,25,45,.65)]">{member.initials}</div>
                    </>
                  )}
                </div>
                <div className="p-5">
                  <span className="inline-flex rounded-full border border-[#ead0d6] bg-[#fff5f7] px-2.5 py-1 text-[8.5px] font-bold uppercase tracking-[.08em] text-[#9e2945]">{member.role}</span>
                  <h3 className="mt-4 font-display text-[22px] font-semibold leading-tight text-[#282023]">{member.name}</h3>
                  <p className="mt-1.5 text-[10px] font-semibold text-[#9d2642]">{member.affiliation}</p>
                  <p className="mt-3 text-[10.5px] leading-relaxed text-[#786c71]">{member.body}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[9.5px] font-semibold text-[#7A1B2E]">View profile <ExternalLink size={9} /></span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  const items = [
    ['What kind of papers can I upload?', 'The workspace is designed for scientific PDF papers. It can work with single-paper analysis or batch uploads, while keeping each paper attached to its project.'],
    ['Does the platform only use an LLM?', 'No. The project supports multiple extraction approaches, including deterministic rules, local ML options and LLM-based extraction. Docling remains the document-understanding layer.'],
    ['Can I verify where a value came from?', 'Yes. The workflow keeps provenance so researchers can inspect the originating paper, page, table, figure or nearby source text before approving data.'],
    ['What happens when a paper does not contain a field?', 'Optional scientific fields are omitted when they are absent. The database view adapts to the information actually available instead of filling the interface with missing-value placeholders.'],
  ]

  return (
    <section id="faq" className="bg-[#fffafa] py-16 lg:py-20">
      <div className="mx-auto grid max-w-[1250px] gap-8 px-6 sm:px-8 lg:grid-cols-[.38fr_1fr] lg:px-10">
        <div>
          <p className="text-[9.5px] font-bold uppercase tracking-[.16em] text-[#a12241]">FAQ</p>
          <h2 className="mt-3 font-display text-[40px] font-medium text-[#281f22]">Common questions.</h2>
          <p className="mt-4 text-[12px] leading-relaxed text-[#776a70]">A few practical answers about the research workflow.</p>
        </div>
        <div className="space-y-3">
          {items.map(([question, answer], index) => (
            <button key={question} onClick={() => setOpen(open === index ? null : index)} className="w-full rounded-[18px] border border-[#e8dce0] bg-white px-5 py-4 text-left transition hover:border-[#d7b7c0]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[11.5px] font-semibold text-[#30272a]">{question}</span>
                <ChevronDown size={15} className={`shrink-0 text-[#8f2942] transition ${open === index ? 'rotate-180' : ''}`} />
              </div>
              {open === index && <p className="mt-3 max-w-[850px] text-[10.5px] leading-relaxed text-[#7d7076]">{answer}</p>}
            </button>
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
            <div className="max-w-[720px]">
              <p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/65">Your research dataset</p>
              <h2 className="mt-3 font-display text-[38px] font-medium leading-tight">Turn scientific literature into something you can actually use.</h2>
              <p className="mt-3 max-w-[650px] text-[11px] leading-relaxed text-white/70">Create a project, upload a paper, inspect the extracted evidence and build a structured, reviewable scientific database.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link to="/register" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[11px] font-semibold text-[#7A1B2E]">Create an account <ArrowRight size={12} /></Link>
              <Link to="/login" className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-[11px] font-semibold text-white">Log in</Link>
            </div>
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
        <div className="flex items-center gap-3">
          <img src="/mcgill.png" alt="McGill" className="h-7 w-auto" />
          <div>
            <p className="text-[10px] font-semibold text-[#6f1c31]">Cheese Database</p>
            <p className="mt-0.5 text-[8.5px] text-[#a09398]">Research paper intelligence platform · 2026</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[9px] font-medium text-[#81747a]">
          <a href="#demo" className="hover:text-[#7A1B2E]">Demo</a>
          <a href="#research" className="hover:text-[#7A1B2E]">Research</a>
          <a href="#team" className="hover:text-[#7A1B2E]">Team</a>
          <a href="#faq" className="hover:text-[#7A1B2E]">FAQ</a>
        </div>
        <p className="max-w-[420px] text-[8px] leading-relaxed text-[#aaa0a4]">Campus, laboratory and cheese imagery uses the same public sources selected for the cheese-shelf-Life-v7 landing page. Publication cards link to their verified external records.</p>
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
