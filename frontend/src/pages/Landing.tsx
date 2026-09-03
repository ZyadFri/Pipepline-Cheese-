import { Link } from 'react-router-dom'
import {
  ArrowRight, Upload, Cpu, Brain, ClipboardList, Database,
  FlaskConical, BarChart3, ShieldCheck, FileSearch, Menu, X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../store/auth'

const MODEL_ASSETS = 'https://raw.githubusercontent.com/ZyadFri/cheese-shelf-Life-v7/main/frontend/public/marketing'

const IMAGES = {
  hero: `${MODEL_ASSETS}/cheeses.jpg`,
  aging: `${MODEL_ASSETS}/cheese-aging.jpg`,
  lab: `${MODEL_ASSETS}/lab.jpg`,
  campus: `${MODEL_ASSETS}/campus.jpg`,
  paperDesk: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=82',
  paperRead: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1200&q=82',
  laptop: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=82',
  dashboard: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=82',
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

const WORKFLOW = [
  {
    step: '01',
    Icon: Upload,
    title: 'Upload paper',
    body: 'Drop in one or more scientific PDFs and keep every paper organized inside its project.',
    image: IMAGES.paperDesk,
  },
  {
    step: '02',
    Icon: Cpu,
    title: 'Paper is read',
    body: 'Text, tables, figures, captions, and context are identified as scientific evidence.',
    image: IMAGES.paperRead,
  },
  {
    step: '03',
    Icon: Brain,
    title: 'Data is extracted',
    body: 'Cheese products, treatments, ingredients, conditions, and measurements become structured records.',
    image: IMAGES.laptop,
  },
  {
    step: '04',
    Icon: ClipboardList,
    title: 'You review it',
    body: 'Approve, edit, or reject extracted values while keeping their original evidence one click away.',
    image: IMAGES.lab,
  },
  {
    step: '05',
    Icon: Database,
    title: 'It joins the database',
    body: 'Reviewed measurements become part of one searchable, exportable scientific dataset.',
    image: IMAGES.dashboard,
  },
]

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

function MiniPaper() {
  return (
    <div className="absolute left-[8%] top-[8%] hidden w-[250px] rotate-[-1.4deg] rounded-[18px] border border-white/70 bg-white/95 p-5 shadow-[0_28px_70px_-28px_rgba(40,16,24,.55)] backdrop-blur-md lg:block xl:w-[270px]">
      <p className="text-[8px] uppercase tracking-[0.18em] text-slate-400">Journal of Dairy Science · Research article</p>
      <h3 className="mt-2 font-display text-[17px] leading-[1.08] text-[#241c1f]">
        Effect of ripening temperature on the texture and flavor of semi-hard cheeses
      </h3>
      <p className="mt-1.5 text-[8px] text-slate-400">A. M. Landry · J. B. Thibault · et al.</p>
      <div className="my-3 h-px bg-slate-100" />
      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-500">Abstract</p>
      <p className="mt-1 text-[7.5px] leading-[1.55] text-slate-500">
        This study evaluated the effect of temperature and ripening time on physicochemical and sensory properties of cheese during maturation.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative h-[52px] overflow-hidden rounded-md bg-[#fbf4f6] p-1.5">
            <div className="absolute inset-x-2 bottom-2 h-px bg-[#d8c7cd]" />
            <div className="absolute bottom-2 left-2 h-[18px] w-px bg-[#d8c7cd]" />
            <svg viewBox="0 0 70 35" className="h-full w-full" aria-hidden="true">
              <polyline points="5,28 20,23 36,18 52,12 65,8" fill="none" stroke={i === 0 ? '#7A1B2E' : i === 1 ? '#b17182' : '#64748b'} strokeWidth="2" />
              {[5, 20, 36, 52, 65].map((x, idx) => <circle key={x} cx={x} cy={[28, 23, 18, 12, 8][idx]} r="1.6" fill="#7A1B2E" />)}
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExtractionPreview() {
  return (
    <div className="absolute bottom-[9%] right-[8%] w-[62%] max-w-[520px] rounded-[20px] border border-white/70 bg-white/95 p-4 shadow-[0_30px_80px_-30px_rgba(40,16,24,.58)] backdrop-blur-xl sm:p-5 lg:right-[5%] lg:w-[58%]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold text-[#7A1B2E]">Extracted rows</p>
          <p className="mt-0.5 text-[9px] text-slate-400">Structured measurements with source evidence</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-semibold text-emerald-700">Evidence linked</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-[#eee4e7] bg-white">
        <div className="grid grid-cols-[1.35fr_.75fr_.65fr_.8fr] bg-[#fbf7f8] px-3 py-2 text-[8px] font-semibold text-slate-500">
          <span>Cheese / treatment</span><span>Day</span><span>pH</span><span>Status</span>
        </div>
        {[
          ['Gouda · control', '0', '5.32', 'Reviewed'],
          ['Gouda · LPO system', '15', '5.21', 'Reviewed'],
          ['Gouda · essential oil', '30', '5.19', 'Review'],
          ['Semi-hard · coating', '60', '5.08', 'Reviewed'],
        ].map((row, idx) => (
          <div key={idx} className="grid grid-cols-[1.35fr_.75fr_.65fr_.8fr] border-t border-[#f1e9eb] px-3 py-2 text-[8px] text-slate-600">
            <span className="truncate pr-2 font-medium text-slate-700">{row[0]}</span>
            <span>{row[1]}</span>
            <span>{row[2]}</span>
            <span className={row[3] === 'Reviewed' ? 'text-emerald-700' : 'text-amber-700'}>{row[3]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[8px] text-slate-400">
        <span>Paper → evidence → reviewed data</span>
        <span className="font-semibold text-[#7A1B2E]">View extracted data →</span>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#fffdfd] text-[#201b1d]">
      <LandingHeader />

      <main>
        <section className="relative overflow-hidden border-b border-[#eadde1]">
          <div className="absolute inset-0 bg-[linear-gradient(100deg,#fffdfd_0%,#fff8fa_42%,rgba(255,248,250,.55)_58%,rgba(255,255,255,.03)_100%)]" />
          <div className="absolute inset-y-0 right-0 w-[56%] bg-cover bg-center opacity-95" style={{ backgroundImage: `url(${IMAGES.hero})` }} />
          <div className="absolute inset-y-0 right-[46%] w-[22%] bg-gradient-to-r from-[#fffdfd] via-[#fff8fa]/90 to-transparent" />
          <div className="absolute -left-28 top-10 h-96 w-96 rounded-full bg-[#f4dbe2]/35 blur-3xl" />
          <div className="absolute right-[34%] top-16 h-72 w-72 rounded-full bg-white/45 blur-3xl" />

          <div className="relative z-10 mx-auto grid min-h-[650px] max-w-[1440px] grid-cols-1 lg:grid-cols-[.92fr_1.08fr]">
            <div className="flex items-center px-6 py-20 sm:px-10 lg:px-12 xl:px-14">
              <div className="max-w-[570px]">
                <div className="inline-flex items-center rounded-full border border-[#e8c6d0] bg-white/80 px-3.5 py-1.5 shadow-[0_12px_30px_-22px_rgba(155,28,60,.65)] backdrop-blur-sm">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9b1c3c]">AI-powered research extraction</span>
                </div>

                <h1 className="mt-7 font-display text-[clamp(3.2rem,6vw,6.7rem)] leading-[.91] tracking-[-0.045em] text-[#211b1e]">
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

            <div className="relative min-h-[540px] lg:min-h-full">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,252,253,.10),rgba(74,28,39,.08))]" />
              <MiniPaper />
              <div className="absolute right-[8%] top-[7%] hidden w-[230px] rounded-[18px] border border-white/70 bg-white/95 p-4 shadow-[0_26px_65px_-28px_rgba(40,16,24,.55)] backdrop-blur-xl sm:block lg:right-[5%] xl:w-[250px]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-semibold text-[#30252a]">Texture over ripening time</p>
                    <p className="text-[7px] text-slate-400">Figure values digitized</p>
                  </div>
                  <span className="rounded-full bg-[#fbf0f3] px-2 py-1 text-[7px] font-semibold text-[#8e1734]">Chart</span>
                </div>
                <svg viewBox="0 0 220 95" className="mt-2 w-full" aria-hidden="true">
                  {[18, 38, 58, 78].map((y) => <line key={y} x1="18" y1={y} x2="210" y2={y} stroke="#efe7e9" strokeWidth="1" />)}
                  <polyline points="18,72 55,61 95,48 140,34 205,20" fill="none" stroke="#8e1734" strokeWidth="2.3" />
                  <polyline points="18,79 55,70 95,61 140,52 205,40" fill="none" stroke="#a87684" strokeWidth="2" />
                  <polyline points="18,84 55,78 95,71 140,64 205,55" fill="none" stroke="#64748b" strokeWidth="2" />
                </svg>
              </div>
              <ExtractionPreview />
            </div>
          </div>
        </section>

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
              {WORKFLOW.map(({ step, Icon, title, body, image }) => (
                <article key={step} className="group overflow-hidden rounded-[18px] border border-[#eadde1] bg-white shadow-[0_18px_44px_-38px_rgba(64,25,38,.45)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_-34px_rgba(64,25,38,.42)]">
                  <div className="relative h-[145px] overflow-hidden bg-[#f4ecef]">
                    <img src={image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#2f1620]/35 via-transparent to-white/5" />
                    <div className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-[#7A1B2E] text-[10px] font-bold text-white shadow-lg">{step}</div>
                    <div className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/70 bg-white/90 text-[#7A1B2E] backdrop-blur-md">
                      <Icon size={15} />
                    </div>
                  </div>
                  <div className="p-4.5 p-5">
                    <h3 className="text-[14px] font-semibold text-[#241c1f]">{title}</h3>
                    <p className="mt-2 text-[12px] leading-[1.58] text-[#766970]">{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-y border-[#eadde1] bg-[#fffafa] px-5 py-20 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1380px]">
            <div className="grid items-stretch gap-4 lg:grid-cols-[220px_repeat(5,1fr)_220px]">
              <div className="relative hidden overflow-hidden rounded-[18px] lg:block">
                <img src={IMAGES.aging} alt="Cheese aging shelves" className="h-full min-h-[220px] w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#30141f]/45 to-transparent" />
              </div>

              {CAPABILITIES.map(({ Icon, title, body }) => (
                <div key={title} className="rounded-[18px] border border-[#eadde1] bg-white p-5 shadow-[0_18px_44px_-40px_rgba(64,25,38,.38)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f9ecef] text-[#8e1734]">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-[13px] font-semibold text-[#241c1f]">{title}</h3>
                  <p className="mt-2 text-[11px] leading-[1.6] text-[#7a6c72]">{body}</p>
                </div>
              ))}

              <div className="relative hidden overflow-hidden rounded-[18px] lg:block">
                <img src={IMAGES.hero} alt="Cheese collection" className="h-full min-h-[220px] w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#30141f]/45 to-transparent" />
              </div>
            </div>
          </div>
        </section>

        <section id="research" className="px-5 py-20 sm:px-8 lg:px-10">
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

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [IMAGES.aging, 'Cheese maturation'],
                  [IMAGES.lab, 'Controlled studies'],
                  [IMAGES.campus, 'Macdonald Campus'],
                  [IMAGES.hero, 'Cheese matrices'],
                ].map(([src, label]) => (
                  <figure key={label} className="group relative h-[185px] overflow-hidden rounded-[18px] border border-[#eadde1] bg-[#f5edef]">
                    <img src={src} alt={label} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#2f1520]/65 via-transparent to-transparent" />
                    <figcaption className="absolute bottom-3 left-4 text-[12px] font-semibold text-white">{label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="database" className="px-5 pb-20 pt-4 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[980px] overflow-hidden rounded-[28px] border border-[#7A1B2E]/15 bg-[linear-gradient(110deg,#4d0e1b,#7A1B2E_55%,#8e2940)] px-7 py-10 shadow-[0_28px_70px_-48px_rgba(76,16,30,.65)] sm:px-12 lg:px-16">
            <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">Your research dataset</p>
                <h2 className="mt-2 font-display text-[clamp(2.1rem,4vw,3.5rem)] leading-none tracking-[-0.035em] text-white">Start building your dataset</h2>
                <p className="mt-4 max-w-[610px] text-sm leading-6 text-white/72">
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
