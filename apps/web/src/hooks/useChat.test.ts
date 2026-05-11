import { renderHook, act, waitFor } from '@testing-library/react'
import { useChat } from './useChat'

function mockStream(chunks: string[]): Promise<Response> {
  const encoder = new TextEncoder()
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return Promise.resolve(new Response(readable, { status: 200 }))
}

describe('useChat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('initial state has no messages and is not loading', () => {
    const { result } = renderHook(() => useChat())
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  test('sendMessage adds user message then streams assistant response', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['The ISS ', 'passes at 9pm']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('When does the ISS pass over Melbourne?')
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      content: 'When does the ISS pass over Melbourne?',
    })

    await waitFor(() => {
      expect(result.current.messages[1]).toMatchObject({
        role: 'assistant',
        content: 'The ISS passes at 9pm',
        streaming: false,
      })
    })
  })

  test('calls /api/chat with correct body', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['ok']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('test message')
    })

    expect(fetch).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test message' }),
    })
  })

  test('isLoading is false after response completes', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['done']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('test')
    })

    expect(result.current.isLoading).toBe(false)
  })
})

describe('useChat highlight parsing', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('strips __HIGHLIGHT__ directive and sets highlight state', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      mockStream([
        'The ISS is currently over the Pacific Ocean.',
        '\n__HIGHLIGHT__:{"norad_id":"25544","satellite_name":"ISS"}\n',
      ])
    )
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Where is the ISS?')
    })

    await waitFor(() => {
      expect(result.current.messages[1]).toMatchObject({
        role: 'assistant',
        content: 'The ISS is currently over the Pacific Ocean.',
        streaming: false,
      })
      expect(result.current.highlight).toEqual({
        norad_id: '25544',
        satellite_name: 'ISS',
      })
    })
  })

  test('does not set highlight when no directive in stream', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['Just a normal text response.']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Hello')
    })

    await waitFor(() => {
      expect(result.current.highlight).toBeNull()
    })
  })

  test('shows full content when directive JSON is malformed', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      mockStream(['Some text.', '\n__HIGHLIGHT__:{bad json}\n'])
    )
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Show me the ISS')
    })

    await waitFor(() => {
      expect(result.current.messages[1].content).toBe(
        'Some text.\n__HIGHLIGHT__:{bad json}\n'
      )
      expect(result.current.highlight).toBeNull()
    })
  })

  test('handles directive split across chunks', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      mockStream([
        'Some text.',
        '\n__HIGHLIGHT__:{"norad_id":"25544",',
        '"satellite_name":"ISS"}\n',
      ])
    )
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Show me the ISS')
    })

    await waitFor(() => {
      expect(result.current.messages[1].content).toBe('Some text.')
      expect(result.current.highlight).toEqual({
        norad_id: '25544',
        satellite_name: 'ISS',
      })
    })
  })
})
