import { useEffect, useState } from 'react'
import api from '../services/api'

/**
 * Drop-in replacement for <img> when `src` points at one of this app's own
 * authenticated endpoints (asset/page/evidence/provenance images). A plain
 * <img src="/api/..."> can't carry the Authorization header — browsers never
 * attach custom headers to image requests — so every such endpoint 401s
 * silently and the image just never appears. This fetches the image through
 * the same axios instance (which does attach the token) as a blob and hands
 * the browser an object URL instead.
 */
export default function AuthImage({
  src, alt, className, onError, onLoad,
}: {
  src: string | null | undefined
  alt: string
  className?: string
  onError?: () => void
  onLoad?: () => void
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let currentUrl: string | null = null
    setFailed(false)
    setObjectUrl(null)

    if (!src) return
    // `src` is built as `${api.defaults.baseURL}/...` — strip that prefix so
    // this request goes through the same axios instance (and its auth
    // interceptor) rather than a second, header-less fetch.
    const base = api.defaults.baseURL ?? ''
    const path = src.startsWith(base) ? src.slice(base.length) : src

    api.get(path, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return
        currentUrl = URL.createObjectURL(res.data)
        setObjectUrl(currentUrl)
        onLoad?.()
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        onError?.()
      })

    return () => {
      cancelled = true
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  if (!src || failed) return null
  if (!objectUrl) return null

  return <img src={objectUrl} alt={alt} className={className} />
}
