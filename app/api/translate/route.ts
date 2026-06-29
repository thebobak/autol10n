import { NextRequest, NextResponse } from 'next/server'

// Allow up to 60 s for a single segment translation before the platform
// kills the function. Most LLM calls finish in < 15 s; this headroom handles
// slow models and large segments with heavy XML markup.
export const maxDuration = 60

// Accept either a full endpoint URL or a bare base URL and resolve to the
// standard OpenAI-compatible chat completions path.
function resolveEndpoint(raw?: string): string {
  const base = 'https://llm.atko.ai/v1/chat/completions'
  if (!raw?.trim()) return base

  const url = raw.trim().replace(/\/$/, '')
  // Already looks like a full endpoint path
  if (url.endsWith('/completions') || url.endsWith('/chat')) return url

  try {
    const { pathname } = new URL(url)
    if (pathname === '/' || pathname === '') return url + '/v1/chat/completions'
    if (pathname === '/v1' || pathname === '/v1/') return url + '/chat/completions'
    if (pathname === '/v1/chat' || pathname === '/v1/chat/') return url + '/completions'
  } catch {
    // not a valid URL, fall through and try anyway
  }

  return url
}

export async function POST(req: NextRequest) {
  const { sourceXml, targetLanguage, apiUrl, apiKey, model } = await req.json()

  if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 400 })
  if (!sourceXml) return NextResponse.json({ error: 'sourceXml required' }, { status: 400 })
  if (!targetLanguage) return NextResponse.json({ error: 'targetLanguage required' }, { status: 400 })

  const endpoint = resolveEndpoint(apiUrl)

  const body = {
    model: model || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a professional localizer. Translate the following text into ${targetLanguage}. Preserve all XML/HTML tags exactly as they appear. Output ONLY the translated text with its original tags preserved — no commentary, no explanations, no wrapping.`,
      },
      {
        role: 'user',
        content: sourceXml,
      },
    ],
    temperature: 0.3,
  }

  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 55_000)

  let llmResponse: Response
  try {
    llmResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: abort.signal,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    return NextResponse.json(
      { error: isTimeout ? 'LLM API timed out after 55 s — try a faster model or shorter segment' : `Failed to reach LLM API: ${msg}` },
      { status: 504 }
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!llmResponse.ok) {
    const text = await llmResponse.text().catch(() => '')
    return NextResponse.json(
      { error: `LLM API error ${llmResponse.status}: ${text.slice(0, 300)}` },
      { status: llmResponse.status }
    )
  }

  const data = await llmResponse.json()
  const translation = data?.choices?.[0]?.message?.content ?? ''

  if (!translation) {
    return NextResponse.json({ error: 'Empty response from LLM' }, { status: 500 })
  }

  return NextResponse.json({ translation: translation.trim() })
}
