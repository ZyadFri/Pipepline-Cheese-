import { Link } from 'react-router-dom'
import {
  ArrowRight, Upload, Cpu, Brain, ClipboardList, Database,
  FlaskConical, BarChart3, ShieldCheck, FileSearch, Menu, X,
  FileSpreadsheet, FileJson, FileText, Sparkles, PlayCircle,
  ChevronDown, Link2, UploadCloud, FileType2,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../store/auth'

// All photographs verified by direct screenshot before being wired in here —
// several earlier candidates (a lecture hall, a plate of food, a crypto-trading
// dashboard) looked plausible by filename/description alone but were visibly
// wrong on inspection.
const IMAGES = {
  hero: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=2200&q=86',
  paperA: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=82',
  paperB: 'https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14?auto=format&fit=crop&w=1200&q=82',
  reviewing: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=82',
  dashboard: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=82',
  cellarAisle: 'https://images.unsplash.com/photo-1761472651462-c2a019e76f4b?auto=format&fit=crop&w=1600&q=84',
  researcherMonitor: 'https://images.unsplash.com/photo-1691934286085-c88039d93dae?auto=format&fit=crop&w=1600&q=84',
  labHands: 'https://images.unsplash.com/photo-1758685848544-625ddba413e4?auto=format&fit=crop&w=1600&q=84',
}

const NAV = [
  { href: '#platform', label: 'Platform' },
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#research', label: 'Research' },
  { href: '#validation', label: 'Validation' },
]

const RESOURCES = [
  { href: '#pipeline', label: 'Documentation' },
  { href: '#faq', label: 'FAQ' },
]

function LandingHeader() {
  const { user } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-[#eee1e4] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center px-5 sm:px-8 lg:px-10">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <img src="/mcgill.png" alt="McGill" className="h-8 w-auto" />
          <span className="font-display text-[22px] font-bold tracking-[-0.01em] text-[#7A1B2E]">McGill</span>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {NAV.map((item, idx) => (
            <a
              key={item.href}
              href={item.href}
              className={
                idx === 0
                  ? 'relative rounded-md px-3.5 py-2 text-[13px] font-semibold text-[#7A1B2E] after:absolute after:bottom-0 after:left-3.5 after:right-3.5 after:h-[2px] after:rounded-full after:bg-[#7A1B2E] after:content-[""]'
                  : 'rounded-md px-3.5 py-2 text-[13px] font-medium text-[#5c5257] transition-colors hover:text-[#7A1B2E]'
              }
            >
              {item.label}
            </a>
          ))}
          <div className="relative" onMouseEnter={() => setResourcesOpen(true)} onMouseLeave={() => setResourcesOpen(false)}>
            <button className="flex items-center gap-1 rounded-md px-3.5 py-2 text-[13px] font-medium text-[#5c5257] transition-colors hover:text-[#7A1B2E]">
              Resources <ChevronDown size={13} />
            </button>
            {resourcesOpen && (
              <div className="absolute left-0 top-full w-44 overflow-hidden rounded-xl border border-[#eee1e4] bg-white py-1.5 shadow-[0_20px_44px_-20px_rgba(64,25,38,.35)]">
                {RESOURCES.map((item) => (
                  <a key={item.label} href={item.href} className="block px-3.5 py-2 text-[13px] font-medium text-[#5c5257] hover:bg-[#fbf3f5] hover:text-[#7A1B2E]">
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link to="/" className="btn-primary text-xs py-2.5 px-4">
              Open Dashboard <ArrowRight size={13} />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden items-center justify-center rounded-lg px-3.5 py-2.5 text-[13px] font-medium text-[#5c5257] transition-colors hover:text-[#7A1B2E] sm:inline-flex"
              >
                Log in
              </Link>
              <Link to="/register" className="btn-primary text-xs py-2.5 px-4">
                Get started <ArrowRight size={13} />
              </Link>
            </>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-[#eee1e4] bg-white px-5 py-3 md:hidden">
          <nav className="flex flex-col">
            {[...NAV, ...RESOURCES].map((item) => (
              <a
                key={item.href + item.label}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="px-2 py-2.5 text-sm font-medium text-slate-600 hover:text-[#7A1B2E]"
              >
                {item.label}
              </a>
            ))}
            {!user && (
              <Link to="/login" onClick={() => setMenuOpen(false)} className="px-2 py-2.5 text-sm font-medium text-slate-600 hover:text-[#7A1B2E]">
                Log in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

// ─── Hero floating cards ─────────────────────────────────────────────────────

function ValidationSummaryCard() {
  const pct = 92
  return (
    <div className="absolute left-[4%] top-[5%] hidden w-[280px] rounded-[18px] border border-white bg-white p-5 shadow-[0_28px_70px_-28px_rgba(40,16,24,.5)] lg:block">
      <p className="text-[12px] font-semibold text-[#241c1f]">Validation summary</p>
      <div className="mt-3 flex items-center gap-4">
        <div
          className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(#7A1B2E ${pct * 3.6}deg, #f3e6e9 0deg)` }}
        >
          <div className="flex h-[58px] w-[58px] flex-col items-center justify-center rounded-full bg-white">
            <span className="text-[15px] font-bold text-[#241c1f]">{pct}%</span>
          </div>
        </div>
        <div className="flex-1 space-y-1 text-[10px]">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500"><i className="h-1.5 w-1.5 rounded-full bg-[#7A1B2E]" />Extracted fields</span>
            <span className="font-semibold text-[#241c1f]">148</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Validated</span>
            <span className="font-semibold text-[#241c1f]">136</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500"><i className="h-1.5 w-1.5 rounded-full bg-amber-400" />Needs review</span>
            <span className="font-semibold text-[#241c1f]">12</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-500"><i className="h-1.5 w-1.5 rounded-full bg-rose-400" />Rejections</span>
            <span className="font-semibold text-[#241c1f]">0</span>
          </div>
        </div>
      </div>
      <a href="#validation" className="mt-3 inline-block text-[10px] font-semibold text-[#9b1c3c] hover:underline">View validation details →</a>
    </div>
  )
}

function ExtractedTablePreviewCard() {
  return (
    <div className="absolute left-[2%] top-[38%] hidden w-[290px] rounded-[18px] border border-white bg-white p-4 shadow-[0_28px_70px_-28px_rgba(40,16,24,.5)] lg:block">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-[#241c1f]">Extracted table preview</p>
        <span className="rounded-full bg-[#f9ecef] px-2 py-0.5 text-[8px] font-bold text-[#7A1B2E]">Table 2</span>
      </div>
      <p className="mt-1 text-[9px] text-slate-500">Composition of experimental cheeses</p>
      <div className="mt-2.5 overflow-hidden rounded-lg border border-[#eee4e7]">
        <div className="grid grid-cols-[1fr_.7fr_.6fr_.5fr] bg-[#fbf7f8] px-2 py-1.5 text-[7.5px] font-semibold text-slate-500">
          <span>Parameter</span><span>Moisture</span><span>Fat</span><span>pH</span>
        </div>
        {[['Control', '52.1', '31.4', '5.26'], ['Treatment A', '49.3', '30.8', '5.15']].map((row) => (
          <div key={row[0]} className="grid grid-cols-[1fr_.7fr_.6fr_.5fr] border-t border-[#f1e9eb] px-2 py-1.5 text-[7.5px] text-slate-600">
            <span className="font-medium text-slate-700">{row[0]}</span><span>{row[1]}</span><span>{row[2]}</span><span>{row[3]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StructuredDatabaseCard() {
  const rows = [
    ['Smith et al., 2023', 'Brie', 'Moisture', '52.1', '%'],
    ['Garcia et al., 2022', 'Camembert', 'pH', '5.28', '-'],
    ['Lee et al., 2021', 'Goat cheese', 'Salt', '1.6', '%'],
  ]
  return (
    <div className="absolute bottom-[5%] left-[6%] hidden w-[340px] rounded-[18px] border border-white bg-white p-4 shadow-[0_28px_70px_-28px_rgba(40,16,24,.5)] lg:block">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-[#241c1f]">Structured database</p>
        <span className="rounded-full bg-[#f9ecef] px-2 py-0.5 text-[8px] font-bold text-[#7A1B2E]">136 records</span>
      </div>
      <div className="mt-2.5 overflow-hidden rounded-lg border border-[#eee4e7]">
        <div className="grid grid-cols-[1.3fr_.9fr_.9fr_.5fr] bg-[#fbf7f8] px-2 py-1.5 text-[7.5px] font-semibold text-slate-500">
          <span>Source</span><span>Product</span><span>Parameter</span><span>Value</span>
        </div>
        {rows.map((row) => (
          <div key={row[0] + row[2]} className="grid grid-cols-[1.3fr_.9fr_.9fr_.5fr] border-t border-[#f1e9eb] px-2 py-1.5 text-[7.5px] text-slate-600">
            <span className="truncate pr-1 font-medium text-slate-700">{row[0]}</span><span>{row[1]}</span><span>{row[2]}</span><span>{row[3]}{row[4]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SourcePaperCard() {
  return (
    <div className="absolute right-[4%] top-[9%] hidden w-[210px] rounded-[16px] border border-white bg-white p-4 shadow-[0_28px_70px_-28px_rgba(40,16,24,.5)] md:block">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-semibold text-slate-500">Source paper</p>
        <span className="flex items-center gap-1 rounded bg-[#f9ecef] px-1.5 py-0.5 text-[8px] font-bold text-[#7A1B2E]"><FileType2 size={9} />PDF</span>
      </div>
      <p className="mt-2 text-[8px] text-slate-400">Smith et al., 2023</p>
      <h4 className="mt-1 font-display text-[13px] leading-[1.15] text-[#241c1f]">Physicochemical properties of ripened cheeses</h4>
      <p className="mt-2 text-[7px] leading-[1.5] text-slate-500">The moisture content of the cheeses is presented in Table 2. Ripened samples showed a significant decrease...</p>
      <div className="mt-2.5 flex h-8 items-end gap-1">
        {[40, 65, 30, 80, 55].map((h, i) => <span key={i} className="flex-1 rounded-t bg-[#e8c6d0]" style={{ height: `${h}%` }} />)}
      </div>
    </div>
  )
}

// ─── Feature strip ────────────────────────────────────────────────────────────

const FEATURES = [
  { Icon: Brain, title: 'AI-guided extraction', body: 'Extracts tables, figures, and key text with high accuracy.' },
  { Icon: ShieldCheck, title: 'Validated evidence', body: 'Every value is linked to its source and confidence score.' },
  { Icon: Link2, title: 'Structured & traceable', body: 'All measurements flow into a single, searchable database.' },
  { Icon: UploadCloud, title: 'Built for research', body: 'Export clean datasets for models, reviews, and reporting.' },
]

// ─── Workflow (pipeline) steps ──────────────────────────────────────────────
// Step 3 renders a format-badge composition instead of a photo — "a real image
// of Excel/CSV/database logos" reads more honestly as recognizable format
// icons than as a stock photo, which would have to fake that concept.

function DataFormatBadges() {
  const items = [
    { label: 'XLSX', Icon: FileSpreadsheet },
    { label: 'CSV', Icon: FileText },
    { label: 'JSON', Icon: FileJson },
    { label: 'DB', Icon: Database },
  ]
  return (
    <div className="grid h-full w-full grid-cols-2 place-items-center gap-1.5 bg-[#f9f1f3] p-3">
      {items.map(({ label, Icon }) => (
        <span
          key={label}
          className="flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-full border border-[#eadde1] bg-white px-2 py-1.5 text-[10px] font-semibold text-[#7A1B2E] shadow-[0_6px_16px_-10px_rgba(64,25,38,.4)]"
        >
          <Icon size={12} className="shrink-0" /> {label}
        </span>
      ))}
    </div>
  )
}

const WORKFLOW = [
  {
    step: '01',
    Icon: Upload,
    title: 'Upload paper',
    body: 'Drop in one or more scientific PDFs and keep every paper organized inside its project.',
    image: IMAGES.paperA,
  },
  {
    step: '02',
    Icon: Cpu,
    title: 'Paper is read',
    body: 'Text, tables, figures, captions, and context are identified as scientific evidence.',
    image: IMAGES.paperB,
  },
  {
    step: '03',
    Icon: Brain,
    title: 'Data is extracted',
    body: 'Cheese products, treatments, ingredients, conditions, and measurements become structured records.',
    special: 'formats' as const,
  },
  {
    step: '04',
    Icon: ClipboardList,
    title: 'You review it',
    body: 'Approve, edit, or reject extracted values while keeping their original evidence one click away.',
    image: IMAGES.reviewing,
  },
  {
    step: '05',
    Icon: Database,
    title: 'It joins the database',
    body: 'Reviewed measurements become part of one searchable, exportable scientific dataset.',
    image: IMAGES.dashboard,
  },
]

// ─── Capabilities ─────────────────────────────────────────────────────────────

const CAPABILITIES = [
  {
    Icon: FileSearch,
    title: 'Structured extraction',
    body: 'Cheese product, treatment, ingredients, concentrations, storage conditions, and measurements in one consistent schema.',
  },
  {
    Icon: ShieldCheck,
    title: 'Full provenance',
    body: 'Every value links back to its source paper, page, table, figure, and surrounding context.',
  },
  {
    Icon: BarChart3,
    title: 'Confidence scoring',
    body: 'Each extraction carries confidence and clearly distinguishes direct values from chart-derived estimates.',
  },
  {
    Icon: ClipboardList,
    title: 'Human in the loop',
    body: 'Researchers stay in control from evidence review to final approval of every scientific record.',
  },
  {
    Icon: FlaskConical,
    title: 'One scientific database',
    body: 'Validated data across papers flows into one project-level database ready for analysis and export.',
  },
]

// ─── Research team ────────────────────────────────────────────────────────────
// Only Dr. Karboune's portrait is published here, matching how the sibling
// shelf-life-modelling project's own landing page handles this — it
// deliberately does not publish portraits for the other two collaborators,
// using initials in place of a photo instead.

const TEAM = [
  {
    name: 'Salwa Karboune', credential: 'PhD', role: 'Faculty lead',
    affiliation: 'McGill University · Food Science',
    bio: 'Food-science supervision and research direction for the platform.',
    photo: '/marketing/karboune.jpg',
  },
  {
    name: 'Zahra Allahdad', credential: 'PhD', role: 'Research Associate',
    affiliation: 'Karboune Lab · McGill University',
    bio: 'Contributes food-science expertise and research guidance within the Karboune Lab.',
    initials: 'ZA', color: '#8e2940',
  },
  {
    name: 'Loubna Benabbou', credential: 'PhD', role: 'Research Chair Professor',
    affiliation: 'Université du Québec à Rimouski',
    bio: 'Collaborating researcher supporting the lab’s wider research initiatives.',
    initials: 'LB', color: '#5c2432',
  },
]

const FAQ = [
  { q: 'What file formats can I upload?', a: 'PDF research papers up to 50 MB each, single-file or in a batch of up to 10.' },
  { q: 'How is extracted data validated?', a: 'Every value carries a confidence score and links back to its exact source page, table, or figure for human review.' },
  { q: 'Can I export the results?', a: 'Yes — approved records can be exported as a clean, structured dataset at any time.' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#fffdfd] text-[#201b1d]">
      <LandingHeader />

      <main>
        {/* ── Hero — explicit height on the section itself (not derived from
            sibling grid content) is what fixes the floating cards spilling
            past the section boundary at wide viewports. ──────────────────── */}
        <section id="platform" className="relative overflow-hidden border-b border-[#eadde1] scroll-mt-[68px]">
          <div className="absolute inset-0 bg-[linear-gradient(100deg,#fffdfd_0%,#fff8fa_42%,rgba(255,248,250,.55)_58%,rgba(255,255,255,.03)_100%)]" />
          <div className="absolute inset-y-0 right-0 w-[58%] bg-cover bg-center opacity-95" style={{ backgroundImage: `url(${IMAGES.hero})` }} />
          <div className="absolute inset-y-0 right-[48%] w-[22%] bg-gradient-to-r from-[#fffdfd] via-[#fff8fa]/90 to-transparent" />
          <div className="absolute -left-28 top-10 h-96 w-96 rounded-full bg-[#f4dbe2]/35 blur-3xl" />
          <div className="absolute right-[34%] top-16 h-72 w-72 rounded-full bg-white/45 blur-3xl" />

          <div className="relative z-10 mx-auto grid min-h-[760px] max-w-[1480px] grid-cols-1 lg:grid-cols-[.82fr_1.18fr]">
            <div className="flex items-center px-6 py-16 sm:px-10 lg:px-12 xl:px-14">
              <div className="max-w-[520px]">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e8c6d0] bg-white/80 px-3.5 py-1.5 shadow-[0_12px_30px_-22px_rgba(155,28,60,.65)] backdrop-blur-sm">
                  <Sparkles size={11} className="text-[#9b1c3c]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9b1c3c]">AI-powered research platform</span>
                </div>

                <h1 className="mt-7 font-display text-[clamp(2.6rem,4.8vw,4.75rem)] leading-[.98] tracking-[-0.03em] text-[#211b1e]">
                  Turn cheese<br />
                  research papers<br />
                  into structured<br />
                  <span className="text-[#8e1734]">evidence.</span>
                </h1>

                <p className="mt-6 max-w-[460px] text-[15px] leading-7 text-[#6c6065]">
                  Upload a PDF. Our AI pipeline extracts, structures, and validates key data—so you can trust what goes into your models, reviews, and decisions.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link to="/register" className="btn-primary px-6 py-3 text-sm">
                    Get started for free <ArrowRight size={15} />
                  </Link>
                  <a href="#pipeline" className="inline-flex items-center gap-2 rounded-lg border border-[#d9c4cb] bg-white/80 px-6 py-3 text-sm font-semibold text-[#32272b] transition hover:border-[#b88b98] hover:bg-white">
                    See how it works <PlayCircle size={15} />
                  </a>
                </div>
              </div>
            </div>

            <div className="relative min-h-[460px] lg:min-h-[760px]">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,252,253,.10),rgba(74,28,39,.08))]" />
              <ValidationSummaryCard />
              <ExtractedTablePreviewCard />
              <StructuredDatabaseCard />
              <SourcePaperCard />
            </div>
          </div>

          {/* Feature strip — overlaps the hero's bottom edge */}
          <div id="validation" className="relative z-10 mx-auto -mt-8 max-w-[1320px] px-5 pb-8 scroll-mt-[90px] sm:px-8 lg:px-10">
            <div className="grid grid-cols-1 divide-y divide-[#f1e6e9] overflow-hidden rounded-[20px] border border-[#eee1e4] bg-white shadow-[0_30px_70px_-32px_rgba(64,25,38,.35)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              {FEATURES.map(({ Icon, title, body }) => (
                <div key={title} className="flex items-start gap-3 p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f9ecef] text-[#8e1734]">
                    <Icon size={17} />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#241c1f]">{title}</p>
                    <p className="mt-1 text-[11px] leading-[1.5] text-[#7a6c72]">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section id="pipeline" className="scroll-mt-[68px] px-5 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1320px]">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b1c3c]">How it works</p>
              <h2 className="mt-3 font-display text-[clamp(2.2rem,4vw,3.6rem)] leading-none tracking-[-0.035em] text-[#241c1f]">
                From PDF to reviewed data, in five steps
              </h2>
              <p className="mt-4 text-sm leading-6 text-[#7c6e74]">
                The interface stays simple while every extracted value keeps its evidence and review history.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {WORKFLOW.map(({ step, Icon, title, body, image, special }) => (
                <article key={step} className="group overflow-hidden rounded-[18px] border border-[#eadde1] bg-white shadow-[0_18px_44px_-38px_rgba(64,25,38,.45)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_-34px_rgba(64,25,38,.42)]">
                  <div className="relative h-[145px] overflow-hidden bg-[#f4ecef]">
                    {special === 'formats' ? (
                      <DataFormatBadges />
                    ) : (
                      <>
                        <img src={image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#2f1620]/35 via-transparent to-white/5" />
                      </>
                    )}
                    <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-[#7A1B2E] text-[10px] font-bold text-white shadow-lg">{step}</div>
                    {special !== 'formats' && (
                      <div className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/70 bg-white/90 text-[#7A1B2E] backdrop-blur-md">
                        <Icon size={15} />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-[14px] font-semibold text-[#241c1f]">{title}</h3>
                    <p className="mt-2 text-[12px] leading-[1.58] text-[#766970]">{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Capabilities — plain card grid, no flanking photos ──────────── */}
        <section id="capabilities" className="border-y border-[#eadde1] bg-[#fffafa] px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1320px]">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b1c3c]">Capabilities</p>
              <h2 className="mt-3 font-display text-[clamp(2.2rem,4vw,3.6rem)] leading-none tracking-[-0.035em] text-[#241c1f]">
                Built for scientific rigor, not just speed
              </h2>
              <p className="mt-4 text-sm leading-6 text-[#7c6e74]">
                Extraction is only useful if you can trust — and check — what came out of it.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {CAPABILITIES.map(({ Icon, title, body }) => (
                <div key={title} className="rounded-[18px] border border-[#eadde1] bg-white p-5 shadow-[0_18px_44px_-40px_rgba(64,25,38,.38)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f9ecef] text-[#8e1734]">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-[13px] font-semibold text-[#241c1f]">{title}</h3>
                  <p className="mt-2 text-[11px] leading-[1.6] text-[#7a6c72]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trusted by researchers ────────────────────────────────────── */}
        <section id="research" className="scroll-mt-[68px] px-5 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1320px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b1c3c]">Built for cheese science</p>
            <h2 className="mt-3 font-display text-[clamp(2.2rem,4vw,3.6rem)] leading-none tracking-[-0.035em] text-[#241c1f]">
              Trusted by researchers.<br /><span className="text-[#8e1734]">Built for discovery.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#7c6e74]">
              From artisanal dairies to academic labs, our platform helps cheese science teams save time, reduce manual work, and focus on what matters—discovery.
            </p>

            <div className="mt-9 grid gap-4 sm:grid-cols-3">
              {[
                [IMAGES.cellarAisle, 'Cheese aging cellar'],
                [IMAGES.researcherMonitor, 'Data analysis'],
                [IMAGES.labHands, 'Laboratory work'],
              ].map(([src, label]) => (
                <figure key={label} className="group relative h-[230px] overflow-hidden rounded-[18px] border border-[#eadde1] bg-[#f5edef]">
                  <img src={src} alt={label} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#2f1520]/60 via-transparent to-transparent" />
                  <figcaption className="absolute bottom-3 left-4 text-[12px] font-semibold text-white">{label}</figcaption>
                </figure>
              ))}
            </div>

            {/* Team */}
            <div className="mt-16">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b1c3c]">Research team</p>
              <h3 className="mt-2 font-display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-[1.02] tracking-[-0.03em] text-[#241c1f]">
                Project collaborators
              </h3>

              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                {TEAM.map((person) => (
                  <article key={person.name} className="overflow-hidden rounded-[20px] border border-[#eadde1] bg-white shadow-[0_18px_44px_-38px_rgba(64,25,38,.4)]">
                    <div className="h-[190px] w-full overflow-hidden bg-[#f4ecef]">
                      {person.photo ? (
                        <img src={person.photo} alt={person.name} className="h-full w-full object-cover object-top" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center" style={{ background: person.color }}>
                          <span className="font-display text-4xl text-white/90" style={{ fontWeight: 540 }}>{person.initials}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <span className="inline-flex rounded-full border border-[#e8c6d0] bg-[#fff8fa] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#9b1c3c]">
                        {person.role}
                      </span>
                      <h4 className="mt-3 font-display text-[19px] leading-tight text-[#241c1f]">
                        {person.name}, {person.credential}
                      </h4>
                      <p className="mt-1 text-[11px] font-semibold text-[#9b1c3c]">{person.affiliation}</p>
                      <p className="mt-2 text-[12px] leading-[1.6] text-[#786a70]">{person.bio}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-[68px] border-t border-[#eadde1] bg-[#fffafa] px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[820px]">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b1c3c]">FAQ</p>
            <h2 className="mt-3 text-center font-display text-[clamp(1.9rem,3vw,2.75rem)] leading-none tracking-[-0.03em] text-[#241c1f]">
              Common questions
            </h2>
            <div className="mt-10 space-y-4">
              {FAQ.map(({ q, a }) => (
                <div key={q} className="rounded-[16px] border border-[#eadde1] bg-white p-5">
                  <p className="text-[13px] font-semibold text-[#241c1f]">{q}</p>
                  <p className="mt-1.5 text-[12px] leading-[1.6] text-[#786a70]">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Database / final CTA ─────────────────────────────────────── */}
        <section id="database" className="px-5 pb-20 pt-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[980px] overflow-hidden rounded-[28px] border border-[#7A1B2E]/15 bg-[linear-gradient(110deg,#4d0e1b,#7A1B2E_55%,#8e2940)] px-7 py-10 shadow-[0_28px_70px_-48px_rgba(76,16,30,.65)] sm:px-12 lg:px-16">
            <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">Your research dataset</p>
                <h2 className="mt-2 font-display text-[clamp(2.1rem,4vw,3.5rem)] leading-none tracking-[-0.035em] text-white">Start building your dataset</h2>
                <p className="mt-4 max-w-[610px] text-sm leading-6 text-white/75">
                  Create a project, upload your first paper, and move from scientific literature to structured, reviewable data without manual transcription.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:flex-col">
                <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-[#7A1B2E] transition hover:bg-[#fff7f9]">
                  Create an account <ArrowRight size={14} />
                </Link>
                <Link to="/login" className="inline-flex items-center justify-center rounded-lg border border-white/30 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10">
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#eadde1] bg-white px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1320px] flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <img src="/mcgill.png" alt="McGill" className="h-6 w-auto opacity-75" />
            <div className="h-6 w-px bg-[#eadde1]" />
            <span className="text-[11px] text-[#8b7b82]">Food Science Research Program · 2026</span>
          </div>
          <div className="flex items-center gap-5 text-[11px] text-[#8b7b82]">
            <a href="#pipeline" className="hover:text-[#7A1B2E]">Pipeline</a>
            <a href="#capabilities" className="hover:text-[#7A1B2E]">Capabilities</a>
            <Link to="/login" className="hover:text-[#7A1B2E]">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
