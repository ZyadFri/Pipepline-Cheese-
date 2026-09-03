import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import AuthShell from '../components/AuthShell'

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
    <AuthShell
      title="Create account"
      description="Join the research platform."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold" style={{ color: 'var(--primary)' }}>
            Log in
          </Link>
        </>
      }
    >
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
            <>Create account <ArrowRight size={15} /></>
          )}
        </button>
      </form>
    </AuthShell>
  )
}
