import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('../store/auth', () => ({
  useAuthStore: { getState: () => ({ token: 'fake-token' }) },
}))

vi.mock('../services/api', () => ({
  workspaceApi: { streamUrl: vi.fn(() => 'http://api/projects/1/papers/2/workspace/stream') },
}))

import { useExtractionStream } from './useExtractionStream'

function sseFrame(seq: number, eventType: string, payload: Record<string, unknown> = {}, message: string | null = null) {
  const data = JSON.stringify({ message, payload, created_at: new Date().toISOString() })
  return `id: ${seq}\nevent: ${eventType}\ndata: ${data}\n\n`
}

function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(encoder.encode(frames[i]))
        i += 1
      } else {
        controller.close()
      }
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

describe('useExtractionStream', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('appends events in seq order, dedupes a replayed seq, and stops on a terminal event', async () => {
    const frames = [
      sseFrame(1, 'chunk_done', { page_end: 6, total_pages: 12, tables_found: 1, figures_found: 0 }),
      sseFrame(2, 'chunk_done', { page_end: 12, total_pages: 12, tables_found: 2, figures_found: 1 }),
      sseFrame(1, 'chunk_done', { page_end: 6, total_pages: 12, tables_found: 1, figures_found: 0 }), // replay dup
      sseFrame(3, 'job_completed', {}, 'Extraction complete'),
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(streamResponse(frames))

    const { result } = renderHook(() => useExtractionStream(1, 2))

    await waitFor(() => expect(result.current.isTerminal).toBe(true))

    expect(result.current.events.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(result.current.pagesDone).toBe(12)
    expect(result.current.totalPages).toBe(12)
    expect(result.current.tablesFound).toBe(2)
    expect(result.current.figuresFound).toBe(1)
    // The stream closed naturally right after the terminal event — no reconnect.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to polling after repeated connection failures', async () => {
    vi.useFakeTimers()
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useExtractionStream(1, 2))

    // Initial connectOnce() fetch rejection, then each retry's backoff timer
    // (2000ms, 4000ms, 6000ms for attempts 1-3) fires and rejects again until
    // MAX_RECONNECT_ATTEMPTS is exceeded and the hook gives up on SSE.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })

    expect(result.current.connection).toBe('polling')
  })

  it('calls onAssetEvent when an asset_added event arrives', async () => {
    const frames = [
      sseFrame(1, 'asset_added', { asset_type: 'native_table', page: 3 }),
      sseFrame(2, 'job_completed', {}, 'Done'),
    ]
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(streamResponse(frames))
    const onAssetEvent = vi.fn()

    renderHook(() => useExtractionStream(1, 2, { onAssetEvent }))

    await waitFor(() => expect(onAssetEvent).toHaveBeenCalled())
  })
})
