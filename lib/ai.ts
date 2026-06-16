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
    model: 'claude-haiku-4-5-20251001',
    system:
      'この画像はパチンコ・パチスロの取材で使うバナーやポスターです。\n画像内に書かれているテキスト・文字情報のみを書き起こしてください。\n\n取材名・イベント名・キャンペーン名・日付・場所名・出演者名・芸能人名・タレント名・機種名・店舗名など、画像内のすべての文字を正確に抽出してください。\n\n背景・色・キャラクターの外見・レイアウトなど視覚的な情報は一切含めないでください。\n文字が読み取れない、または文字がない画像の場合は「テキストなし」とだけ記載してください。',
    max_tokens: 512,
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
