import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, Loader2, Save, Trash2 } from 'lucide-react'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import Avatar from '../components/Avatar'

const MAX_AVATAR_MB = 5

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [jobTitle, setJobTitle] = useState(user?.job_title ?? '')
  const [organization, setOrganization] = useState(user?.organization ?? '')

  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const dirty =
    fullName !== (user?.full_name ?? '') ||
    bio !== (user?.bio ?? '') ||
    jobTitle !== (user?.job_title ?? '') ||
    organization !== (user?.organization ?? '')

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) {
      toast.error('Full name cannot be empty')
      return
    }
    setSaving(true)
    try {
      const updated = await authApi.updateProfile({
        full_name: fullName.trim(),
        bio: bio.trim(),
        job_title: jobTitle.trim(),
        organization: organization.trim(),
      })
      updateUser(updated)
      toast.success('Profile updated')
    } catch {
      toast.error('Could not save your profile')
    } finally {
      setSaving(false)
    }
  }

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file')
      return
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      toast.error(`Image must be smaller than ${MAX_AVATAR_MB} MB`)
      return
    }
    setUploadingAvatar(true)
    try {
      const updated = await authApi.uploadAvatar(file)
      updateUser(updated)
      toast.success('Profile photo updated')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Could not upload the image')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true)
    try {
      const updated = await authApi.deleteAvatar()
      updateUser(updated)
      toast.success('Profile photo removed')
    } catch {
      toast.error('Could not remove the photo')
    } finally {
      setUploadingAvatar(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-700">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="font-display text-[26px] font-semibold text-slate-900">Your profile</h1>
          <p className="text-[12.5px] text-slate-400">Manage how you appear across the platform.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_50px_-38px_rgba(30,20,25,.25)]">
        {/* Cover + avatar */}
        <div className="relative h-28 bg-[linear-gradient(120deg,#8B1730_0%,#4E0F1C_60%,#2c0a12_100%)]">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className="absolute -bottom-10 left-6"
          >
            <div className={`group relative rounded-full ring-4 ring-white ${dragOver ? 'ring-[#8B1730]' : ''}`}>
              <Avatar user={user} size={84} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/45 group-hover:opacity-100 disabled:cursor-wait"
                title="Change photo"
              >
                {uploadingAvatar ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden" />
          </div>
        </div>

        <div className="px-6 pb-6 pt-14">
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <Camera size={12} /> Change photo
            </button>
            {user?.has_avatar && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={uploadingAvatar}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={12} /> Remove
              </button>
            )}
            <span className="text-[10.5px] text-slate-400">PNG, JPEG or WebP · up to {MAX_AVATAR_MB} MB</span>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold text-slate-600">Full name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#8B1730]/40 focus:ring-2 focus:ring-[#8B1730]/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold text-slate-600">Email</label>
                <input
                  value={user?.email ?? ''}
                  disabled
                  className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-400"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold text-slate-600">Job title</label>
                <input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. PhD Candidate"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#8B1730]/40 focus:ring-2 focus:ring-[#8B1730]/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11.5px] font-semibold text-slate-600">Organization</label>
                <input
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="e.g. McGill University"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#8B1730]/40 focus:ring-2 focus:ring-[#8B1730]/10"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[11.5px] font-semibold text-slate-600">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="A short bio about your research interests…"
                className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#8B1730]/40 focus:ring-2 focus:ring-[#8B1730]/10"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-5">
              <button
                type="submit"
                disabled={saving || !dirty}
                className="inline-flex items-center gap-2 rounded-xl bg-[#8B1730] px-5 py-2.5 text-[12.5px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(139,23,48,.85)] transition-colors hover:bg-[#751329] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
