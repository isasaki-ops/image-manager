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
      'この画像はパチンコ・パチスロの取材で使うバナーやポスターです。\n画像内に書かれているテキスト・文字情報のみを書き起こしてください。\n\n取材名・イベント名・キャンペーン名・日付・場所名・出演者名・芸能人名・タレント名・機種名・店舗名など、画像内のすべての文字を正確に抽出してください。\n\nカタカナ・英語・漢字の固有名詞や機種名には、括弧でひらがなの読み方を付記してください。読み方が複数ある場合はスラッシュで区切ってください。\n例：NYANJA（にゃんじゃ）、昇くん（しょうくん/のぼるくん）、キューブ（きゅーぶ）、蓮くん（はすくん/れんくん）\n\n背景・色・キャラクターの外見・レイアウトなど視覚的な情報は一切含めないでください。\n文字が読み取れない、または文字がない画像の場合は「テキストなし」とだけ記載してください。',
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

export async function generateReadingsFromFileName(fileName: string): Promise<string> {
  const response = await getAnthropic().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `以下のファイル名に含まれる語句の「ひらがな読み」を出力してください。

ルール:
- 漢字・英語・カタカナのみ対象。すでにひらがなの部分は出力しない
- ひらがなのみのファイル名の場合は何も出力しない（説明文も不要、完全に空欄）
- 英語の単語はひらがな読みを1つだけ出力する（例: CUBE→きゅーぶ、SYNERGY→しなじー、PRIDE→ぷらいど）
- 漢字・カタカナの熟語・固有名詞は全体の読みを出力し、さらに各語の音読み・訓読みも出力する
- 人名は複数の読み方をすべて出力する（例: 昇くん→しょうくん のぼるくん）
- 2文字以上のまとまった語のみ出力する。1文字だけのひらがなは出力しない
- すべてスペース区切りで並べる
- 拡張子・記号・数字は無視する
- ひらがなのみ出力する（説明文・記号は不要）

例）
ファイル名: 狂鬼の宴.png → きょうきのえん くるう きょう おに うたげ えん
ファイル名: CUBEくん.png → きゅーぶくん きゅーぶ
ファイル名: POWERFUL SYNERGY.png → ぱわふるしなじー ぱわふる しなじー
ファイル名: 天パーくん.png → てんぱーくん てんぱー
ファイル名: 昇くん.png → しょうくん のぼるくん
ファイル名: まっちゃん.png → （空欄）

ファイル名: ${fileName}`,
    }],
  })

  const content = response.content[0]
  if (content.type !== 'text') return ''
  return content.text.trim()
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
