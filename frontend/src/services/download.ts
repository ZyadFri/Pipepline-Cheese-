import api from './api'

/**
 * Strip this app's axios baseURL off a full URL (the pattern used throughout
 * this codebase for `<img src>` / `<a href>` style URL builders) so the
 * request goes through the shared axios instance — and its auth
 * interceptor — instead of a second, header-less request. Browsers never
 * attach custom headers to plain `<a href download>` navigations or bare
 * `fetch()` calls, so without this every such request to an authenticated
 * endpoint 401s silently.
 */
function stripBaseUrl(url: string): string {
  const base = api.defaults.baseURL ?? ''
  return url.startsWith(base) ? url.slice(base.length) : url
}

export async function fetchAuthenticatedBlob(url: string): Promise<Blob> {
  const res = await api.get(stripBaseUrl(url), { responseType: 'blob' })
  return res.data as Blob
}

export async function fetchAuthenticatedText(url: string): Promise<string> {
  const res = await api.get(stripBaseUrl(url), { responseType: 'text' })
  return res.data as string
}

/**
 * Download a file from an authenticated endpoint. Reads the filename from
 * the response's Content-Disposition header when present, falling back to
 * `filename`.
 *
 * The anchor is appended to the document before `.click()` (Firefox ignores
 * a click on a detached anchor) and `URL.revokeObjectURL` is deferred rather
 * than called synchronously right after the click — both are real bugs this
 * fixes in the two call sites that already did this dance before this file
 * existed.
 */
export async function downloadAuthenticated(url: string, filename?: string): Promise<void> {
  const res = await api.get(stripBaseUrl(url), { responseType: 'blob' })
  const objectUrl = URL.createObjectURL(res.data)

  const cd = (res.headers?.['content-disposition'] as string) || ''
  const match = cd.match(/filename="?([^"]+)"?/)
  const resolvedName = match?.[1] ?? filename ?? 'download'

  const a = document.createElement('a')
  a.href = objectUrl
  a.download = resolvedName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
