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
      body: JSON.stringify({ message: 'test message', history: [] }),
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

describe('useChat conversation history', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('sends empty history on first message', async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockStream(['hello']))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('first message')
    })

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.history).toEqual([])
  })

  test('sends prior messages as history on second request', async () => {
    vi.mocked(fetch)
      .mockReturnValueOnce(mockStream(['assistant reply']))
      .mockReturnValueOnce(mockStream(['second reply']))

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('first')
    })
    await act(async () => {
      await result.current.sendMessage('second')
    })

    const secondCallBody = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body
    )
    expect(secondCallBody.message).toBe('second')
    expect(secondCallBody.history).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'assistant reply' },
    ])
  })

  test('resets highlight to null at start of each sendMessage', async () => {
    vi.mocked(fetch)
      .mockReturnValueOnce(
        mockStream(['text\n__HIGHLIGHT__:{"norad_id":"25544","satellite_name":"ISS"}\n'])
      )
      .mockReturnValueOnce(mockStream(['new response']))

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('where is the ISS?')
    })

    await waitFor(() => {
      expect(result.current.highlight).not.toBeNull()
    })

    await act(async () => {
      await result.current.sendMessage('something else')
    })

    // Highlight should be null again immediately when sendMessage starts
    // (and stays null unless new directive arrives)
    await waitFor(() => {
      expect(result.current.highlight).toBeNull()
    })
  })
})

describe('useChat set_filter directive', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('parses __SET_FILTER__ directive and exposes setFilter', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      mockStream(['Showing Starlink satellites only.\n__SET_FILTER__:{"categories":["STARLINK"]}\n']),
    )
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('show me all Starlink satellites')
    })

    await waitFor(() => {
      expect(result.current.setFilter).toEqual({ categories: ['STARLINK'] })
    })
    expect(result.current.messages[1]?.content).toBe('Showing Starlink satellites only.')
  })

  test('supports multiple categories in a single directive', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      mockStream(['Showing Starlink and GPS.\n__SET_FILTER__:{"categories":["STARLINK","GPS"]}\n']),
    )
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('show Starlink and GPS')
    })

    await waitFor(() => {
      expect(result.current.setFilter).toEqual({ categories: ['STARLINK', 'GPS'] })
    })
  })

  test('strips SET_FILTER directive from displayed text', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      mockStream(['GPS satellites are now visible.\n__SET_FILTER__:{"categories":["GPS"]}\n']),
    )
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('show GPS satellites')
    })

    await waitFor(() => {
      const assistantMsg = result.current.messages.find(m => m.role === 'assistant')
      expect(assistantMsg?.content).not.toContain('__SET_FILTER__')
    })
  })

  test('resets setFilter to null at start of each new message', async () => {
    vi.mocked(fetch)
      .mockReturnValueOnce(
        mockStream(['Showing debris.\n__SET_FILTER__:{"categories":["DEBRIS"]}\n']),
      )
      .mockReturnValueOnce(mockStream(['Sure.']))

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('show debris')
    })

    await waitFor(() => {
      expect(result.current.setFilter).not.toBeNull()
    })

    await act(async () => {
      await result.current.sendMessage('what else?')
    })

    await waitFor(() => {
      expect(result.current.setFilter).toBeNull()
    })
  })

  test('initial setFilter is null', () => {
    const { result } = renderHook(() => useChat())
    expect(result.current.setFilter).toBeNull()
  })
})
