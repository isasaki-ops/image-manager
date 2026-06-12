import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// Lazy singletons — avoid throwing during module evaluation when env vars are absent
let _anthropic: Anthropic | null = null
let _openai: OpenAI | null = null

function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _anthropic
}

function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export async function analyzeImageWithClaude(imageUrl: string): Promise<string> {
  const response = await getAnthropic().messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system:
      'この画像を詳細に説明してください。パチンコ・パチスロの取材で使うバナーやポスター画像の検索システムに使います。人物名がわかれば記載し、色・人物・キャラクター・テキスト・レイアウトを具体的に説明してください。説明は日本語で、300〜500文字程度でお願いします。',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: imageUrl },
          },
          {
            type: 'text',
            text: 'この画像を詳細に説明してください。',
          },
        ],
      },
    ],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')
  return content.text
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const attempt = async () => {
    const response = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    return response.data[0].embedding
  }

  try {
    return await attempt()
  } catch {
    // Retry once on failure
    await new Promise((r) => setTimeout(r, 1000))
    return await attempt()
  }
}
