import { useState } from 'react'
import clsx from 'clsx'
import { authApi } from '../services/api'
import AuthImage from './AuthImage'

interface AvatarUser {
  id: number
  full_name?: string
  has_avatar?: boolean
}

interface Props {
  user: AvatarUser | null | undefined
  size?: number
  className?: string
}

/** A user's uploaded avatar image, falling back to gradient initials. */
export default function Avatar({ user, size = 32, className }: Props) {
  const [imgError, setImgError] = useState(false)
  const initials = user?.full_name?.trim()?.charAt(0)?.toUpperCase() || 'U'

  if (user?.has_avatar && user.id && !imgError) {
    return (
      <div
        style={{ width: size, height: size }}
        className={clsx('shrink-0 overflow-hidden rounded-full border border-white/60 shadow-sm', className)}
      >
        <AuthImage
          src={authApi.avatarUrl(user.id)}
          alt={user.full_name || 'User avatar'}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white shadow-sm',
        'bg-[linear-gradient(135deg,#8B1730,#4E0F1C)]',
        className,
      )}
    >
      {initials}
    </div>
  )
}
