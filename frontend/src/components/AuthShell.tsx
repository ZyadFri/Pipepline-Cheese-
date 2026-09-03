import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

// Shared frame for /login and /register — a single centered card over a soft,
// slowly-drifting burgundy ambient wash, rather than the old split-screen
// hero-panel layout. Mirrors the shape of the sibling shelf-life-modeling
// project's own AuthShell/LoginForm split: one shell, swappable content.
export default function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12" style={{ background: 'var(--background)' }}>
      {/* Ambient wash — reuses the same drifting/morphing blob keyframes as the
          landing hero, just diluted further and kept off to the sides so the
          centered card stays the clear focal point. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[15%] -left-[10%] w-[560px] h-[560px] rounded-full bg-[#7A1B2E]/[0.07] blur-[110px] animate-blob1 animate-morph-a" />
        <div className="absolute -bottom-[15%] -right-[10%] w-[520px] h-[520px] rounded-full bg-[#7A1B2E]/[0.06] blur-[110px] animate-blob2 animate-morph-b" />
        <div className="absolute top-[35%] right-[8%] w-[280px] h-[280px] rounded-full bg-[#E8A9B8]/[0.10] blur-[90px] animate-blob3" />
        <div
          className="absolute inset-0 opacity-[0.4] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_15%,black,transparent)]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(122,27,46,0.15) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />
      </div>

      <div className="relative w-full max-w-[400px]">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <img src="/mcgill.png" alt="McGill" className="h-8 w-auto" />
          <span className="font-display text-[19px] font-bold tracking-[-0.01em]" style={{ color: 'var(--primary)' }}>McGill</span>
        </Link>

        {/* Soft halo behind the card so it doesn't read as a flat rectangle
            dropped onto the wash. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-2xl"
          style={{ background: 'radial-gradient(closest-side, rgba(122,27,46,0.16), transparent)' }}
        />

        <div className="surface p-7 shadow-lg">
          <div className="mb-6">
            <h1 className="type-h3" style={{ color: 'var(--foreground)' }}>{title}</h1>
            <p className="text-sm text-slate-500 mt-1.5">{description}</p>
          </div>
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>
      </div>
    </div>
  )
}
