import { Link } from 'react-router-dom'
import {
  ArrowRight, Upload, Cpu, Brain, ClipboardList, Database,
  FlaskConical, BarChart3, ShieldCheck, FileSearch, Menu, X,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useAuthStore } from '../store/auth'
import ParticleNetwork from '../components/ParticleNetwork'

// ─── Nav ─────────────────────────────────────────────────────────────────────

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#database', label: 'Database' },
]

function LandingHeader() {
  const { user } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-[64px] w-full max-w-6xl items-center px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <div className="bg-white rounded-md p-1 shadow-xs border border-slate-100">
            <img src="/mcgill.png" alt="McGill" className="h-7 w-auto" />
          </div>
          <div className="hidden sm:block">
            <p className="text-[13px] font-bold text-slate-800 leading-tight">Cheese Shelf-Life DB</p>
            <p className="text-[10px] text-slate-400 leading-tight">Research Platform</p>
          </div>
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="px-3 py-2 text-[13px] font-medium text-slate-500 hover:text-[#7A1B2E] transition-colors rounded-md"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link to="/" className="btn-primary text-xs py-2">
              Open Dashboard <ArrowRight size={13} />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden sm:inline-flex items-center justify-center px-3.5 py-2 text-[13px] font-medium text-slate-500 hover:text-[#7A1B2E] transition-colors rounded-lg"
              >
                Log in
              </Link>
              <Link to="/register" className="btn-primary text-xs py-2">
                Get Started <ArrowRight size={13} />
              </Link>
            </>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3">
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

// ─── How it works ────────────────────────────────────────────────────────────

const WORKFLOW = [
  { step: '01', Icon: Upload, title: 'Upload a paper', body: 'Drop in a PDF research paper — single upload or up to 10 at once.' },
  { step: '02', Icon: Cpu, title: 'The paper is read', body: 'Docling parses text, tables, and figures, and identifies what looks like scientific evidence.' },
  { step: '03', Icon: Brain, title: 'Data is extracted', body: 'Experiments, treatments, ingredients, and measurements are pulled out with confidence and source evidence attached to every value.' },
  { step: '04', Icon: ClipboardList, title: 'You review it', body: 'Approve, edit, or reject each measurement — grouped by experiment, with the original evidence one click away.' },
  { step: '05', Icon: Database, title: 'It joins the database', body: 'Approved data becomes part of one structured, exportable scientific dataset.' },
]

// ─── Capabilities ─────────────────────────────────────────────────────────────

const CAPABILITIES = [
  {
    Icon: FileSearch,
    title: 'Structured extraction',
    body: 'Cheese product, treatment, ingredients, concentrations, storage conditions, and measurements — pulled into one consistent schema, not free text.',
  },
  {
    Icon: BarChart3,
    title: 'Chart digitization',
    body: 'Values reported only as a chart are read and digitized automatically, and clearly marked as estimated rather than directly reported.',
  },
  {
    Icon: ShieldCheck,
    title: 'Full provenance',
    body: 'Every extracted value links back to its page, source table or figure, and confidence — so you can always answer "where did this come from?"',
  },
  {
    Icon: FlaskConical,
    title: 'One scientific database',
    body: 'Approved measurements flow into a single canonical dataset across every paper in a project, ready to filter, analyze, or export.',
  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#4E0F1C] via-[#7A1B2E] to-[#661523]" />
        <div className="absolute inset-0 opacity-70" style={{
          background: 'radial-gradient(60% 50% at 15% 8%, rgba(110,91,255,0.25), transparent 70%), radial-gradient(55% 45% at 90% 95%, rgba(194,85,122,0.28), transparent 70%)',
        }} />
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-white/[0.06] animate-blob1 animate-morph-a" />
        <div className="absolute bottom-[-10%] left-[-15%] w-[400px] h-[400px] bg-white/[0.06] animate-blob2 animate-morph-b" />
        <div className="absolute top-[40%] left-[30%] w-[250px] h-[250px] rounded-full bg-[#E8A9B8]/[0.08] animate-blob3" />
        <ParticleNetwork />

        <div className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 rounded-full border border-white/25 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="type-eyebrow text-white/90">AI-Powered Research Platform</span>
          </div>
          <h1 className="font-display text-white leading-[1.03] tracking-tight mb-5" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.25rem)', fontWeight: 540 }}>
            Turn cheese research papers<br /><span className="text-white/75">into structured data.</span>
          </h1>
          <p className="text-white/75 text-lg leading-relaxed max-w-2xl mx-auto mb-9">
            Upload a PDF. Get back structured experiments, treatments, and measurements —
            each one backed by evidence, confidence, and a source you can check.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link to="/register" className="btn-primary py-3 px-6 text-sm">
              Create an account <ArrowRight size={15} />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 py-3 px-6 text-sm font-medium text-white bg-white/10 border border-white/25 rounded-lg hover:bg-white/20 transition-colors"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="type-eyebrow text-[#7A1B2E] mb-3">How it works</p>
            <h2 className="type-h1 mb-4" style={{ color: 'var(--foreground)' }}>
              From PDF to reviewed data, in five steps
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Every step keeps a human in the loop — nothing reaches the database without review.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {WORKFLOW.map(({ step, Icon, title, body }) => (
              <div key={step} className="surface p-5 relative">
                <span className="absolute top-4 right-4 text-[11px] font-bold text-slate-200">{step}</span>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: 'rgba(122,27,46,0.08)' }}>
                  <Icon size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Capabilities ──────────────────────────────────────────────────── */}
      <section id="capabilities" className="py-24 px-6" style={{ background: 'var(--canvas, #FAF9F9)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="type-eyebrow text-[#7A1B2E] mb-3">Capabilities</p>
            <h2 className="type-h1 mb-4" style={{ color: 'var(--foreground)' }}>
              Built for scientific rigor, not just speed
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Extraction is only useful if you can trust — and check — what came out of it.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {CAPABILITIES.map(({ Icon, title, body }) => (
              <div key={title} className="surface p-6 flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(122,27,46,0.08)' }}>
                  <Icon size={20} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{title}</h3>
                  <p className="text-[13px] text-slate-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Database / final CTA ─────────────────────────────────────────── */}
      <section id="database" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl p-12 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[#4E0F1C] via-[#7A1B2E] to-[#661523]" />
            <div className="absolute top-[-30%] right-[-10%] w-[350px] h-[350px] bg-white/[0.06] animate-blob1 animate-morph-a" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[300px] h-[300px] bg-white/[0.06] animate-blob2 animate-morph-b" />
            <div className="relative z-10">
              <h2 className="font-display text-white mb-4" style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 540, letterSpacing: '-0.02em' }}>
                Start building your dataset
              </h2>
              <p className="text-white/75 text-base leading-relaxed max-w-xl mx-auto mb-8">
                Create a project, upload your first paper, and see structured, reviewable
                data appear — no manual data entry.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link to="/register" className="inline-flex items-center gap-2 bg-white text-[#7A1B2E] font-semibold text-sm py-3 px-6 rounded-lg hover:bg-white/90 transition-colors">
                  Create an account <ArrowRight size={15} />
                </Link>
                <Link to="/login" className="inline-flex items-center gap-2 text-white/90 font-medium text-sm py-3 px-6 rounded-lg border border-white/25 hover:bg-white/10 transition-colors">
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src="/mcgill.png" alt="McGill" className="h-5 w-auto opacity-60" />
            <span className="text-xs text-slate-400">© 2026 McGill University · Food Science Research Program</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <Link to="/login" className="hover:text-[#7A1B2E] transition-colors">Log in</Link>
            <Link to="/register" className="hover:text-[#7A1B2E] transition-colors">Create account</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
