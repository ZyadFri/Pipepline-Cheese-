import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const fetchAuthenticatedBlobMock = vi.fn()

vi.mock('../services/download', () => ({
  fetchAuthenticatedBlob: (...args: unknown[]) => fetchAuthenticatedBlobMock(...args),
}))

import AuthImage from './AuthImage'

describe('AuthImage', () => {
  beforeEach(() => {
    fetchAuthenticatedBlobMock.mockReset()
    ;(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi.fn(() => 'blob:mock')
    ;(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn()
  })

  it('renders nothing until the blob resolves, then shows the image', async () => {
    fetchAuthenticatedBlobMock.mockResolvedValue(new Blob(['x']))
    const { container } = render(<AuthImage src="http://api/x/image" alt="a figure" />)
    expect(container.querySelector('img')).toBeNull()

    await waitFor(() => {
      expect(screen.getByAltText('a figure')).toBeInTheDocument()
    })
    expect(screen.getByAltText('a figure')).toHaveAttribute('src', 'blob:mock')
  })

  it('renders nothing and calls onError when the fetch fails', async () => {
    fetchAuthenticatedBlobMock.mockRejectedValue(new Error('401'))
    const onError = vi.fn()
    const { container } = render(<AuthImage src="http://api/x/image" alt="a figure" onError={onError} />)

    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders nothing when src is null', () => {
    const { container } = render(<AuthImage src={null} alt="a figure" />)
    expect(container.querySelector('img')).toBeNull()
    expect(fetchAuthenticatedBlobMock).not.toHaveBeenCalled()
  })
})
