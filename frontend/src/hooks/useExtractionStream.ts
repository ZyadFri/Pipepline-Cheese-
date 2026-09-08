import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { workspaceApi } from '../services/api'
import type { StreamEvent } from '../types/workspace'

export type StreamConnection = 'connecting' | 'live' | 'polling' | 'closed'

export interface ExtractionStreamState {
  connection: StreamConnection
  events: StreamEvent[]
  isTerminal: boolean
  pagesDone: number
  totalPages: number
  tablesFound: number
  figuresFound: number
  warnings: string[]
}

const TERMINAL_EVENT_TYPES = new Set(['job_completed', 'job_failed', 'job_cancelled'])
const MAX_RECONNECT_ATTEMPTS = 3

/**
 * Live extraction progress via the backend's SSE endpoint, read with an
 * authenticated fetch()+ReadableStream rather than the native EventSource
 * API — EventSource can't send an Authorization header, the same limitation
 * AuthImage.tsx works around for images.
 *
 * On any failure (network error, non-stream response, repeated drops) this
 * falls back to `connection: 'polling'` and stops trying — the caller's own
 * existing status/asset polling remains the correctness fallback in that
 * case; this hook's job is the real, incremental event timeline and a fast
 * "new asset appeared" signal on top of it, not a replacement for polling.
 */
export function useExtractionStream(
  projectId: number,
  paperId: number,
  options?: { enabled?: boolean; onAssetEvent?: () => void },
): ExtractionStreamState {
  const enabled = options?.enabled ?? true
  const onAssetEvent = options?.onAssetEvent

  const [connection, setConnection] = useState<StreamConnection>('connecting')
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [counters, setCounters] = useState({
    pagesDone: 0, totalPages: 0, tablesFound: 0, figuresFound: 0,
  })
  const [warnings, setWarnings] = useState<string[]>([])
  const [isTerminal, setIsTerminal] = useState(false)

  const sinceSeqRef = useRef(0)
  const seenSeqRef = useRef<Set<number>>(new Set())
  const attemptsRef = useRef(0)
  const onAssetEventRef = useRef(onAssetEvent)
  onAssetEventRef.current = onAssetEvent

  useEffect(() => {
    if (!enabled || !projectId || !paperId) return
    if (typeof ReadableStream === 'undefined') {
      setConnection('polling')
      return
    }

    const controller = new AbortController()
    let stopped = false

    async function connectOnce(): Promise<void> {
      setConnection((c) => (c === 'live' ? c : 'connecting'))
      const token = useAuthStore.getState().token
      const url = workspaceApi.streamUrl(projectId, paperId, sinceSeqRef.current)

      let res: Response
      try {
        res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })
      } catch {
        return retry()
      }

      const contentType = res.headers.get('content-type') ?? ''
      if (!res.ok || !res.body || !contentType.startsWith('text/event-stream')) {
        return retry()
      }

      setConnection('live')
      attemptsRef.current = 0

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''

          for (const frame of frames) {
            if (!frame.trim() || frame.startsWith(':')) continue
            handleFrame(frame)
          }
        }
      } catch {
        if (!stopped) return retry()
      }

      if (!stopped && !isTerminalRef.current) {
        return retry()
      }
    }

    const isTerminalRef = { current: false }

    function handleFrame(frame: string) {
      let eventType = ''
      let seq: number | null = null
      let dataRaw = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim()
        else if (line.startsWith('id:')) seq = Number(line.slice(3).trim())
        else if (line.startsWith('data:')) dataRaw += line.slice(5).trim()
      }
      if (!eventType) return
      if (eventType === 'no_job') return
      if (eventType === 'end') {
        isTerminalRef.current = true
        return
      }

      let parsed: any = {}
      try { parsed = dataRaw ? JSON.parse(dataRaw) : {} } catch { /* ignore */ }

      if (seq != null) {
        if (seenSeqRef.current.has(seq)) return
        seenSeqRef.current.add(seq)
        sinceSeqRef.current = Math.max(sinceSeqRef.current, seq)
      }

      const evt: StreamEvent = {
        seq: seq ?? -1,
        type: eventType as StreamEvent['type'],
        message: parsed.message ?? null,
        payload: parsed.payload ?? {},
        created_at: parsed.created_at ?? null,
      }
      setEvents((prev) => [...prev, evt])

      const payload = evt.payload as Record<string, any>
      if (eventType === 'chunk_done') {
        setCounters({
          pagesDone: Number(payload.page_end ?? 0),
          totalPages: Number(payload.total_pages ?? 0),
          tablesFound: Number(payload.tables_found ?? 0),
          figuresFound: Number(payload.figures_found ?? 0),
        })
      }
      if (eventType === 'asset_added') {
        onAssetEventRef.current?.()
      }
      if (eventType === 'chunk_failed') {
        const msg = evt.message ?? 'Some pages could not be processed and were skipped'
        setWarnings((prev) => (prev.includes(msg) ? prev : [...prev, msg]))
      }
      if (eventType === 'asset_failed') {
        const page = payload.page_number ? ` on page ${payload.page_number}` : ''
        const msg = `Chart data${page} could not be digitized automatically. The original figure is still available for review.`
        setWarnings((prev) => (prev.includes(msg) ? prev : [...prev, msg]))
      }
      if (TERMINAL_EVENT_TYPES.has(eventType)) {
        isTerminalRef.current = true
        setIsTerminal(true)
        onAssetEventRef.current?.()
      }
    }

    function retry() {
      if (stopped) return
      attemptsRef.current += 1
      if (attemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        setConnection('polling')
        return
      }
      setTimeout(() => { if (!stopped) connectOnce() }, 2000 * attemptsRef.current)
    }

    connectOnce()

    return () => {
      stopped = true
      controller.abort()
      setConnection('closed')
    }
  }, [projectId, paperId, enabled])

  return {
    connection,
    events,
    isTerminal,
    warnings,
    ...counters,
  }
}