import { useState, FormEvent, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/auth'

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let animId: number
    const W = canvas.width = canvas.offsetWidth
    const H = canvas.height = canvas.offsetHeight
    type P = { x: number; y: number; vx: number; vy: number; r: number }
    const pts: P[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 1,
    }))
    const tick = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill()
      }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 120) { ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.strokeStyle = `rgba(232,190,200,${(1 - d / 120) * 0.22})`; ctx.lineWidth = 0.7; ctx.stroke() }
      }
      animId = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(animId)
  }, [])
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
}

export default function Register() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const data = await authApi.register(email, fullName, password)
      setAuth(data.access_token, { id: data.user_id, email: data.email, full_name: data.full_name })
      navigate('/')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      toast.error(
        Array.isArray(detail)
          ? detail.map((d) => (typeof d === 'string' ? d : d?.msg)).filter(Boolean).join('; ') || 'Registration failed'
          : (typeof detail === 'string' ? detail : 'Registration failed')
      )
    } finally {
      setLoading(false)
    }
  }

  const field = (
    label: string,
    type: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    Icon: React.ElementType,
  ) => (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type={type}
          className="input pl-10"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[54%] relative overflow-hidden flex-col">
        <div className="absolute inset-0 bg-gradient-to-br from-[#4E0F1C] via-[#7A1B2E] to-[#661523]" />
        <div className="absolute inset-0 opacity-70" style={{
          background: 'radial-gradient(60% 50% at 85% 10%, rgba(110,91,255,0.25), transparent 70%), radial-gradient(55% 45% at 10% 90%, rgba(194,85,122,0.28), transparent 70%)',
        }} />
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-white/[0.06] animate-blob1 animate-morph-a" />
        <div className="absolute bottom-[-10%] left-[-15%] w-[400px] h-[400px] bg-white/[0.06] animate-blob2 animate-morph-b" />
        <ParticleCanvas />
        <div className="relative z-10 flex flex-col h-full p-12">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-lg p-1.5 shadow-lg">
              <img src="/mcgill.png" alt="McGill" className="h-9 w-auto" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">McGill University</p>
              <p className="text-white/70 text-xs leading-tight">Faculty of Agricultural & Environmental Sciences</p>
            </div>
          </div>
          <div className="mt-auto mb-auto pt-20">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 rounded-full border border-white/25 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="type-eyebrow text-white/90">Join the Research Team</span>
            </div>
            <h1 className="font-display text-white leading-[1.04] tracking-tight mb-4" style={{ fontSize: 'clamp(2.75rem, 4.2vw, 3.75rem)', fontWeight: 540 }}>
              Create Your<br /><span className="text-white/75">Account</span>
            </h1>
            <p className="text-white/75 text-lg leading-relaxed max-w-md">
              Start collaborating on food preservation research. Upload papers, extract data with AI, and share findings with your team.
            </p>
          </div>
          <p className="text-white/40 text-xs">© 2025 McGill University · Food Science Research Program</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 relative" style={{ background: 'linear-gradient(180deg, #FCFCFC 0%, #F7F5F5 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#7A1B2E]/[0.06] to-transparent rounded-bl-full pointer-events-none" />
        <div className="w-full max-w-[400px] surface p-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="bg-[#7A1B2E] rounded-lg p-1.5">
              <img src="/mcgill.png" alt="McGill" className="h-7 w-auto brightness-0 invert" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">Cheese Shelf-Life Database</p>
              <p className="text-slate-500 text-xs">McGill University</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="type-h1" style={{ color: 'var(--foreground)' }}>Create account</h2>
            <p className="text-slate-500 text-sm mt-1.5">Join the research platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {field('Full name', 'text', fullName, setFullName, 'Dr. Jane Smith', User)}
            {field('Email address', 'email', email, setEmail, 'you@university.edu', Mail)}
            {field('Password', 'password', password, setPassword, 'Min. 8 characters', Lock)}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 text-sm disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : (
                <>Create Account <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="text-[#7A1B2E] hover:text-[#661523] font-semibold transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-slate-400">
          <div className="h-px bg-slate-200 w-16" />
          <div className="flex items-center gap-1.5 px-3">
            <img src="/mcgill.png" alt="" className="h-4 w-auto opacity-30" />
            <span className="text-[10px] font-medium">McGill University</span>
          </div>
          <div className="h-px bg-slate-200 w-16" />
        </div>
      </div>
    </div>
  )
}
