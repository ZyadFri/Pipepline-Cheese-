import { Link } from 'react-router-dom'
import {
  ArrowRight, Upload, Cpu, Brain, ClipboardList, Database,
  FlaskConical, BarChart3, ShieldCheck, FileSearch, Menu, X,
  FileSpreadsheet, FileJson, FileText,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../store/auth'

// All photographs verified by direct screenshot before being wired in here —
// several earlier candidates (a lecture hall, a plate of food) looked plausible
// by filename/description alone but were visibly wrong on inspection.
const IMAGES = {
  hero: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=2200&q=86',
  paperA: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=1200&q=82',
  paperB: 'https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14?auto=format&fit=crop&w=1200&q=82',
  reviewing: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=82',
  dashboard: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=82',
  lab: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1600&q=84',
  campus: 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1600&q=84',
  cheeseWheels: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=1600&q=84',
}

const NAV = [
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#research', label: 'Research' },
  { href: '#database', label: 'Database' },
]

function LandingHeader() {
  const { user } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-[#eadde1] bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center px-5 sm:px-8 lg:px-10">
        <Link to="/" className="flex shrink-0 items-center gap-3">
          <div className="rounded-lg border border-[#efe4e7] bg-white p-1.5 shadow-[0_8px_24px_-18px_rgba(64,25,38,.45)]">
            <img src="/mcgill.png" alt="McGill" className="h-7 w-auto" />
          </div>
          <div className="hidden sm:block">
            <p className="text-[13px] font-bold leading-tight text-[#201b1d]">Cheese Paper Pipeline</p>
            <p className="text-[10px] leading-tight text-[#9a8790]">Research Platform</p>
          </div>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3.5 py-2 text-[13px] font-medium text-[#6d6267] transition-colors hover:text-[#7A1B2E]"
            >
              {item.label}
            </a>
          ))}
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
                className="hidden items-center justify-center rounded-lg px-3.5 py-2.5 text-[13px] font-medium text-[#6d6267] transition-colors hover:text-[#7A1B2E] sm:inline-flex"
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
        <div className="border-t border-[#efe4e7] bg-white px-5 py-3 md:hidden">
          <nav className="flex flex-col">
            {NAV.map((item) => (
              <a
                key={item.href}
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

// ─── Hero floating cards ─────────────────────────────────────────────────────

function MiniPaper() {
  return (
    <div className="absolute left-[6%] top-[7%] hidden w-[250px] rotate-[-1.4deg] rounded-[18px] border border-white bg-white p-5 shadow-[0_28px_70px_-28px_rgba(40,16,24,.55)] lg:block xl:w-[270px]">
      <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-500">Journal of Dairy Science · Research article</p>
      <h3 className="mt-2 font-display text-[17px] leading-[1.08] text-[#241c1f]">
        Effect of ripening temperature on the texture and flavor of semi-hard cheeses
      </h3>
      <p className="mt-1.5 text-[8px] text-slate-500">A. M. Landry · J. B. Thibault · et al.</p>
      <div className="my-3 h-px bg-slate-100" />
      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-600">Abstract</p>
      <p className="mt-1 text-[7.5px] leading-[1.55] text-slate-600">
        This study evaluated the effect of temperature and ripening time on physicochemical and sensory properties of cheese during maturation.
      </p>
    </div>
  )
}

function ExtractionPreview() {
  return (
    <div className="absolute bottom-[6%] right-[6%] max-h-[240px] w-[58%] max-w-[480px] overflow-hidden rounded-[20px] border border-white bg-white p-4 shadow-[0_30px_80px_-30px_rgba(40,16,24,.58)] sm:p-5 lg:right-[4%] lg:w-[54%]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold text-[#7A1B2E]">Extracted rows</p>
          <p className="mt-0.5 text-[9px] text-slate-500">Structured measurements with source evidence</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-700 shrink-0">Evidence linked</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-[#eee4e7] bg-white">
        <div className="grid grid-cols-[1.35fr_.75fr_.65fr_.8fr] bg-[#fbf7f8] px-3 py-2 text-[8px] font-semibold text-slate-500">
          <span>Cheese / treatment</span><span>Day</span><span>pH</span><span>Status</span>
        </div>
        {[
          ['Gouda · control', '0', '5.32', 'Reviewed'],
          ['Gouda · LPO system', '15', '5.21', 'Reviewed'],
          ['Gouda · essential oil', '30', '5.19', 'Review'],
        ].map((row, idx) => (
          <div key={idx} className="grid grid-cols-[1.35fr_.75fr_.65fr_.8fr] border-t border-[#f1e9eb] px-3 py-2 text-[8px] text-slate-600">
            <span className="truncate pr-2 font-medium text-slate-700">{row[0]}</span>
            <span>{row[1]}</span>
            <span>{row[2]}</span>
            <span className={row[3] === 'Reviewed' ? 'text-emerald-700' : 'text-amber-700'}>{row[3]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#fffdfd] text-[#201b1d]">
      <LandingHeader />

      <main>
        {/* ── Hero — explicit height on the section itself (not derived from
            sibling grid content) is what fixes the floating cards spilling
            past the section boundary at wide viewports. ──────────────────── */}
        <section className="relative overflow-hidden border-b border-[#eadde1]">
          <div className="absolute inset-0 bg-[linear-gradient(100deg,#fffdfd_0%,#fff8fa_42%,rgba(255,248,250,.55)_58%,rgba(255,255,255,.03)_100%)]" />
          <div className="absolute inset-y-0 right-0 w-[56%] bg-cover bg-center opacity-95" style={{ backgroundImage: `url(${IMAGES.hero})` }} />
          <div className="absolute inset-y-0 right-[46%] w-[22%] bg-gradient-to-r from-[#fffdfd] via-[#fff8fa]/90 to-transparent" />
          <div className="absolute -left-28 top-10 h-96 w-96 rounded-full bg-[#f4dbe2]/35 blur-3xl" />
          <div className="absolute right-[34%] top-16 h-72 w-72 rounded-full bg-white/45 blur-3xl" />

          <div className="relative z-10 mx-auto grid min-h-[720px] max-w-[1440px] grid-cols-1 lg:grid-cols-[.92fr_1.08fr]">
            <div className="flex items-center px-6 py-16 sm:px-10 lg:px-12 xl:px-14">
              <div className="max-w-[570px]">
                <div className="inline-flex items-center rounded-full border border-[#e8c6d0] bg-white/80 px-3.5 py-1.5 shadow-[0_12px_30px_-22px_rgba(155,28,60,.65)] backdrop-blur-sm">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9b1c3c]">AI-powered research extraction</span>
                </div>

                <h1 className="mt-7 font-display text-[clamp(2.75rem,5.2vw,5.75rem)] leading-[.95] tracking-[-0.04em] text-[#211b1e]">
                  From research papers<br />
                  to <span className="text-[#8e1734]">reliable data</span><br />
                  you can trust.
                </h1>

                <p className="mt-7 max-w-[510px] text-[15px] leading-7 text-[#6c6065] sm:text-[16px]">
                  Cheese Paper Pipeline reads scientific literature, extracts experimental data, and turns it into structured, reviewable records you can use with confidence.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link to="/register" className="btn-primary px-6 py-3 text-sm">
                    Create an account <ArrowRight size={15} />
                  </Link>
                  <a href="#pipeline" className="inline-flex items-center gap-2 rounded-lg border border-[#d9c4cb] bg-white/80 px-6 py-3 text-sm font-semibold text-[#32272b] transition hover:border-[#b88b98] hover:bg-white">
                    See how it works
                  </a>
                </div>

                <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[#8f7c83]">
                  <span>Evidence-backed extraction</span>
                  <span>Human review</span>
                  <span>Cheese-focused schema</span>
                </div>
              </div>
            </div>

            <div className="relative min-h-[420px] lg:min-h-[720px]">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,252,253,.10),rgba(74,28,39,.08))]" />
              <MiniPaper />
              <ExtractionPreview />
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section id="pipeline" className="px-5 py-24 sm:px-8 lg:px-10">
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

        {/* ── Research + team ──────────────────────────────────────────── */}
        <section id="research" className="px-5 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-7 lg:grid-cols-[260px_1fr] lg:items-center">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9b1c3c]">Research at McGill</p>
                <h2 className="mt-3 font-display text-[clamp(2rem,3.2vw,3.25rem)] leading-[1.02] tracking-[-0.03em] text-[#241c1f]">
                  Built around real food-science research.
                </h2>
                <p className="mt-4 text-sm leading-6 text-[#786a70]">
                  Scientific papers, cheese matrices, controlled studies, and reviewable evidence come together in one research workflow.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  [IMAGES.cheeseWheels, 'Cheese matrices'],
                  [IMAGES.lab, 'Controlled studies'],
                  [IMAGES.campus, 'Research environment'],
                ].map(([src, label]) => (
                  <figure key={label} className="group relative h-[185px] overflow-hidden rounded-[18px] border border-[#eadde1] bg-[#f5edef]">
                    <img src={src} alt={label} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#2f1520]/65 via-transparent to-transparent" />
                    <figcaption className="absolute bottom-3 left-4 text-[12px] font-semibold text-white">{label}</figcaption>
                  </figure>
                ))}
              </div>
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

        {/* ── Database / final CTA ─────────────────────────────────────── */}
        <section id="database" className="px-5 pb-20 pt-4 sm:px-8 lg:px-10">
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
