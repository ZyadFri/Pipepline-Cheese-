import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const getMock = vi.fn()

vi.mock('./api', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    defaults: { baseURL: 'http://localhost:8000/api' },
  },
}))

import { fetchAuthenticatedBlob, fetchAuthenticatedText, downloadAuthenticated } from './download'

describe('download helpers', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('strips the api baseURL before delegating to axios', async () => {
    getMock.mockResolvedValue({ data: new Blob(['x']) })
    await fetchAuthenticatedBlob('http://localhost:8000/api/projects/1/papers/2/assets/3/csv')
    expect(getMock).toHaveBeenCalledWith(
      '/projects/1/papers/2/assets/3/csv',
      { responseType: 'blob' },
    )
  })

  it('leaves a URL without the baseURL prefix untouched', async () => {
    getMock.mockResolvedValue({ data: 'a,b\n1,2' })
    await fetchAuthenticatedText('/projects/1/papers/2/assets/3/csv')
    expect(getMock).toHaveBeenCalledWith(
      '/projects/1/papers/2/assets/3/csv',
      { responseType: 'text' },
    )
  })

  it('fetchAuthenticatedText returns the response body', async () => {
    getMock.mockResolvedValue({ data: 'Treatment,Day 0\nControl,2.1' })
    const text = await fetchAuthenticatedText('/some/csv')
    expect(text).toBe('Treatment,Day 0\nControl,2.1')
  })
})

describe('downloadAuthenticated', () => {
  // jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all, so
  // they can't be spied on with vi.spyOn — assign fresh stubs directly.
  let createObjectURLSpy: ReturnType<typeof vi.fn>
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getMock.mockReset()
    createObjectURLSpy = vi.fn().mockReturnValue('blob:mock-url')
    revokeObjectURLSpy = vi.fn()
    ;(URL as unknown as { createObjectURL: typeof createObjectURLSpy }).createObjectURL = createObjectURLSpy
    ;(URL as unknown as { revokeObjectURL: typeof revokeObjectURLSpy }).revokeObjectURL = revokeObjectURLSpy
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends the anchor to the document, clicks it, and removes it', async () => {
    getMock.mockResolvedValue({ data: new Blob(['content']), headers: {} })
    const appendSpy = vi.spyOn(document.body, 'appendChild')
    const removeSpy = vi.spyOn(document.body, 'removeChild')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadAuthenticated('/projects/1/export/excel', 'export.xlsx')

    expect(appendSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()
    // appended before clicked, matching call order
    const appendedNode = appendSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(appendedNode.download).toBe('export.xlsx')

    appendSpy.mockRestore()
    removeSpy.mockRestore()
    clickSpy.mockRestore()
  })

  it('defers revokeObjectURL rather than calling it synchronously after click', async () => {
    getMock.mockResolvedValue({ data: new Blob(['content']), headers: {} })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadAuthenticated('/projects/1/export/excel', 'export.xlsx')
    expect(revokeObjectURLSpy).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('prefers the content-disposition filename over the fallback', async () => {
    getMock.mockResolvedValue({
      data: new Blob(['content']),
      headers: { 'content-disposition': 'attachment; filename="real_name.xlsx"' },
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const appendSpy = vi.spyOn(document.body, 'appendChild')

    await downloadAuthenticated('/projects/1/export/excel', 'fallback.xlsx')

    const appendedNode = appendSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(appendedNode.download).toBe('real_name.xlsx')
    appendSpy.mockRestore()
  })
})
