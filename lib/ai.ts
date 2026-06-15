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
    max_tokens: 1024,
    system:
      'この画像はパチンコ・パチスロの取材で使うバナーやポスターです。以下の優先順位で詳細に説明してください。\n\n【最優先】テキスト情報：画像内に書かれている文字をすべて正確に書き起こしてください。取材名・イベント名・キャンペーン名・日付・場所・出演者名・芸能人名・タレント名など、文字情報はすべて漏れなく記載してください。\n\n【次に重要】人物情報：写っている人物の名前（わかれば）、人数、特徴を記載してください。\n\n【補足程度】視覚情報：全体的なレイアウトや主要な色味を簡潔に。\n\n説明は日本語で400〜600文字程度でお願いします。',
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
