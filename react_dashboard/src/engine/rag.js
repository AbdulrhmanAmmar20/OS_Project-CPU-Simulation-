/* ═══════════════════════════════════════════════════════════════════
 * rag.js  –  Client-side RAG engine
 * PDF parsing  →  chunking  →  OpenAI embeddings  →  GPT answer
 * ═══════════════════════════════════════════════════════════════════ */
import * as pdfjsLib from 'pdfjs-dist'

// ── pdfjs v5 worker setup ─────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

// ── Helpers ───────────────────────────────────────────────────────
function chunkText(text, size = 600, overlap = 100) {
  const chunks = []
  let i = 0
  const clean = text.replace(/\s+/g, ' ').trim()
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + size))
    i += size - overlap
  }
  return chunks.filter(c => c.trim().length > 40)
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2 }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9)
}

// ── Load & parse PDF from a URL ───────────────────────────────────
export async function loadAndChunkPDF(url, onProgress) {
  const loadingTask = pdfjsLib.getDocument({ url, verbosity: 0 })
  const doc = await loadingTask.promise
  const total = doc.numPages
  let fullText = ''
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    fullText += content.items.map(it => it.str).join(' ') + '\n'
    onProgress?.(`Parsing PDF... ${i}/${total} pages`)
  }
  return chunkText(fullText)
}

// ── Embed an array of texts via OpenAI ───────────────────────────
export async function embedTexts(texts, apiKey) {
  // Batch into groups of 96 to stay under token limits
  const BATCH = 96
  const allEmbs = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: batch }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err?.error?.message ?? `Embeddings API error ${res.status}`)
    }
    const data = await res.json()
    allEmbs.push(...data.data.map(d => d.embedding))
  }
  return allEmbs
}

// ── Find top-k most relevant chunks ──────────────────────────────
export function findRelevant(queryEmb, chunkEmbs, chunks, k = 5) {
  const scored = chunkEmbs.map((emb, i) => ({ i, score: cosineSim(queryEmb, emb) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k).map(s => chunks[s.i])
}

// ── Shared streaming helper ──────────────────────────────────────
async function streamCompletion(messages, apiKey, onToken, temperature = 0.5) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, temperature, messages }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err?.error?.message ?? `Chat API error ${res.status}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of dec.decode(value).split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') break
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content ?? ''
        if (delta) { full += delta; onToken(full) }
      } catch { /* skip */ }
    }
  }
  return full
}

// ── Stream a GPT answer with RAG context ─────────────────────────
export async function askGPT(question, contextChunks, apiKey, onToken) {
  const context = contextChunks.join('\n\n---\n\n')
  return streamCompletion([
    {
      role: 'system',
      content:
        'You are a friendly AI assistant embedded in the KFUPM CPU Simulation Project terminal. ' +
        'You have two modes:\n' +
        '1. If the user asks about CPU scheduling algorithms or OS topics, answer using the provided context. ' +
        'Be precise and technical.\n' +
        '2. If the user sends a greeting, casual message, or asks something unrelated to the context, ' +
        'respond naturally and helpfully as a friendly assistant — you do NOT need to stay on-topic.\n' +
        'Use plain text only — no markdown symbols, no *, no #, no bold/italic markers.',
    },
    {
      role: 'user',
      content: context
        ? `Context:\n${context}\n\nMessage: ${question}`
        : question,
    },
  ], apiKey, onToken, 0.5)
}

// ── General chat (no RAG context) — for greetings / off-topic ────
export async function generalChat(message, apiKey, onToken) {
  return streamCompletion([
    {
      role: 'system',
      content:
        'You are a friendly AI assistant embedded in the KFUPM CPU Simulation Project terminal. ' +
        'Respond naturally and helpfully. Keep replies concise. ' +
        'Use plain text only — no markdown, no *, no #, no bold/italic markers.',
    },
    { role: 'user', content: message },
  ], apiKey, onToken, 0.7)
}
