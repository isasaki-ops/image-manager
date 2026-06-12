# パチンコ取材画像管理アプリ 設計書 & Claude Code プロンプト集

---

## 概要

パチンコ・パチスロ取材で使うバナー・ポスター画像（500〜800枚規模）を管理するWebアプリ。  
AI自然言語検索・表記ゆれ対応・フィードバックによる検索精度向上が主な特徴。

---

## 技術スタック

| 技術 | バージョン目安 | 役割 |
|------|---------------|------|
| Next.js | 14系 (App Router) | フロントエンド・APIルート |
| TypeScript | 5系 | 型安全な開発 |
| Supabase | - | PostgreSQL DB・認証・pgvector |
| Prisma | 5系 | スキーマ管理・マイグレーション |
| Cloudflare R2 | - | 画像ストレージ・公開URL配信 |
| Vercel | - | ホスティング・デプロイ |
| Claude API (Vision) | claude-3-5-sonnet | 画像解析・説明文自動生成 |
| OpenAI Embeddings API | text-embedding-3-small | テキストのベクトル化 |
| pgvector | Supabase内蔵 | ベクトル類似検索 |

---

## DBスキーマ

```sql
-- 画像テーブル
CREATE TABLE images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  r2_key        TEXT NOT NULL UNIQUE,        -- R2内のオブジェクトキー（UUID）
  r2_url        TEXT NOT NULL,               -- 公開URL
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo          TEXT,                        -- ユーザーが入力したメモ（任意）
  ai_description TEXT,                       -- Claude Visionが生成した説明文
  search_text   TEXT,                        -- memo + ai_description を結合したもの
  embedding     VECTOR(1536),               -- search_textのベクトル（pgvector）
  is_active     BOOLEAN NOT NULL DEFAULT true -- falseにすると検索対象外
);

-- ベクトル検索用インデックス
CREATE INDEX ON images USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- フィードバックテーブル
CREATE TABLE image_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id        UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  query_text      TEXT NOT NULL,             -- 検索したクエリ文字列
  query_embedding VECTOR(1536),             -- クエリのベクトルも保存
  feedback        TEXT NOT NULL CHECK (feedback IN ('relevant', 'irrelevant')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON image_feedback (image_id);
CREATE INDEX ON image_feedback (feedback);
```

---

## ディレクトリ構成

```
/
├── app/
│   ├── page.tsx                  # 検索トップページ
│   ├── upload/
│   │   └── page.tsx              # アップロードページ
│   ├── images/
│   │   └── [id]/
│   │       └── page.tsx          # 画像詳細ページ（公開URL）
│   └── api/
│       ├── upload/
│       │   └── route.ts          # アップロードAPI
│       ├── search/
│       │   └── route.ts          # 検索API
│       ├── feedback/
│       │   └── route.ts          # フィードバックAPI
│       └── images/
│           └── [id]/
│               └── route.ts      # 画像詳細取得API
├── lib/
│   ├── supabase.ts               # Supabaseクライアント
│   ├── r2.ts                     # R2操作ユーティリティ
│   ├── ai.ts                     # Claude Vision・Embeddings呼び出し
│   └── search.ts                 # 検索スコア計算ロジック
├── components/
│   ├── SearchBox.tsx             # 検索ボックスコンポーネント
│   ├── ImageGrid.tsx             # 画像一覧グリッド
│   ├── ImageCard.tsx             # 画像カード（サムネ・DL・フィードバック）
│   └── UploadForm.tsx            # アップロードフォーム
├── prisma/
│   └── schema.prisma
└── .env.local
```

---

## 環境変数（.env.local）

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=          # 例: https://pub-xxxxxxxx.r2.dev

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=    # 例: https://your-app.vercel.app
```

---

## 検索スコア計算ロジック

```
最終スコア = ベクトル類似度（コサイン類似度）
           + フィードバックボーナス
           - フィードバックペナルティ

フィードバックボーナス  = （そのクエリで relevant がついた回数）× 0.1
フィードバックペナルティ = （そのクエリで irrelevant がついた回数）× 0.15

※ 「そのクエリ」= query_embedding との類似度が 0.85 以上のフィードバック履歴
```

---

---

# Phase 1 — 基本CRUD・アップロード・R2保存

## Claude Code プロンプト（Phase 1）

```
以下の仕様でNext.js + TypeScript + Supabase + Cloudflare R2を使った
画像管理Webアプリの基盤を実装してください。

## やること

1. プロジェクトのセットアップ
   - `npx create-next-app@latest` でNext.js 14 (App Router, TypeScript) を作成
   - 必要なパッケージをインストール:
     @supabase/supabase-js, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner,
     prisma, @prisma/client, uuid, @types/uuid

2. 環境変数の設定
   .env.local に以下を用意（値はプレースホルダーでOK）:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
   - R2_BUCKET_NAME, R2_PUBLIC_URL
   - ANTHROPIC_API_KEY, OPENAI_API_KEY
   - NEXT_PUBLIC_APP_URL

3. Supabaseのテーブル作成（マイグレーションSQL）
   以下のテーブルを作成するSQLを supabase/migrations/001_init.sql に作成:

   images テーブル:
   - id: UUID PK
   - r2_key: TEXT NOT NULL UNIQUE（R2内のオブジェクトキー）
   - r2_url: TEXT NOT NULL（公開URL）
   - uploaded_at: TIMESTAMPTZ DEFAULT now()
   - memo: TEXT（任意）
   - ai_description: TEXT（AI生成説明文）
   - search_text: TEXT（memo + ai_description を結合）
   - embedding: VECTOR(1536)（pgvector）
   - is_active: BOOLEAN DEFAULT true

   image_feedback テーブル:
   - id: UUID PK
   - image_id: UUID FK → images.id
   - query_text: TEXT
   - query_embedding: VECTOR(1536)
   - feedback: TEXT CHECK IN ('relevant', 'irrelevant')
   - created_at: TIMESTAMPTZ DEFAULT now()

   pgvector拡張を有効化: CREATE EXTENSION IF NOT EXISTS vector;
   ベクトルインデックス: CREATE INDEX ON images USING ivfflat (embedding vector_cosine_ops);

4. lib/r2.ts の実装
   - S3クライアントの初期化（Cloudflare R2はS3互換API）
   - uploadToR2(file: Buffer, key: string, contentType: string): Promise<string>
     → R2にアップロードしてpublic URLを返す
   - deleteFromR2(key: string): Promise<void>

5. app/api/upload/route.ts の実装
   POST /api/upload
   - multipart/form-dataで画像ファイルとmemo（任意）を受け取る
   - バリデーション: jpeg/png/webp/gif のみ許可、最大10MB
   - ファイル名はUUIDでリネーム（元のファイル名は使わない）
   - R2にアップロード
   - Supabaseのimagesテーブルにレコード作成（AI解析はPhase 2で追加）
   - 作成したレコードのIDとr2_urlを返す

6. app/upload/page.tsx の実装
   - ドラッグ&ドロップ対応のアップロードフォーム
   - メモ入力欄（textarea、任意）
   - アップロード中のプログレス表示
   - 成功時に画像の公開URLを表示
   - シンプルなUI（Tailwind CSS使用）

7. app/page.tsx の仮実装
   - まだ検索は実装しない
   - アップロードされた画像を uploaded_at 降順で一覧表示するだけ
   - サムネイル画像 + アップロード日 + メモの冒頭を表示

## 注意事項
- Cloudflare R2のエンドポイントは `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- R2のリージョンは `auto` を指定
- サーバーサイドのみでAPIキーを使用（クライアントに漏れない設計）
- TypeScriptの型を丁寧に定義すること
- エラーハンドリングを入れること
```

---

---

# Phase 2 — AI解析・Embedding・ベクトル検索

## Claude Code プロンプト（Phase 2）

```
Phase 1で作った画像管理アプリに、AI解析とベクトル検索を追加してください。

## やること

1. lib/ai.ts の実装

   a) analyzeImageWithClaude(imageUrl: string): Promise<string>
      - Claude API (claude-3-5-sonnet-20241022) のVision機能を使う
      - 画像URLを渡して以下を含む日本語の説明文を生成させる:
        ・全体の雰囲気・テイスト
        ・人物の有無（有りの場合: 性別・人数・特徴）
        ・主要な色・配色
        ・テキスト要素（画像内に文字があれば読み取る）
        ・キャラクター・生き物・動物の有無と種類
        ・縦長・横長・正方形の判別
        ・その他特徴的な要素
      - システムプロンプト例:
        「この画像を詳細に説明してください。パチンコ・パチスロの取材で使う
        バナーやポスター画像の検索システムに使います。人物名がわかれば記載し、
        色・人物・キャラクター・テキスト・レイアウトを具体的に説明してください。
        説明は日本語で、300〜500文字程度でお願いします。」

   b) generateEmbedding(text: string): Promise<number[]>
      - OpenAI text-embedding-3-small を使う
      - テキストをベクトル（1536次元）に変換して返す

2. app/api/upload/route.ts の更新
   アップロード完了後、非同期でAI解析を実行:
   - analyzeImageWithClaude(r2_url) で説明文を生成
   - search_text = memo + "\n" + ai_description を作成
   - generateEmbedding(search_text) でベクトルを生成
   - imagesテーブルの該当レコードを更新（ai_description, search_text, embedding）
   ※ AI解析はアップロードレスポンスを返した後にバックグラウンドで実行
     （waitUntil または setImmediate で非同期化）

3. lib/search.ts の実装

   searchImages(query: string, limit: number = 20): Promise<SearchResult[]>
   - queryをgenerateEmbedding()でベクトル化
   - Supabaseのrpcでpgvectorのコサイン類似度検索を実行:

     SELECT
       i.*,
       1 - (i.embedding <=> query_vector) AS vector_score,
       COALESCE(SUM(CASE WHEN f.feedback = 'relevant' THEN 0.1 ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN f.feedback = 'irrelevant' THEN 0.15 ELSE 0 END), 0)
       AS feedback_score
     FROM images i
     LEFT JOIN image_feedback f
       ON f.image_id = i.id
       AND 1 - (f.query_embedding <=> query_vector) > 0.85
     WHERE i.is_active = true
       AND i.embedding IS NOT NULL
     GROUP BY i.id
     ORDER BY (vector_score + feedback_score) DESC
     LIMIT limit;

   - この関数をSupabaseのSQL関数として登録する
   - 結果にfinal_score（vector_score + feedback_score）を含めて返す

4. app/api/search/route.ts の実装
   GET /api/search?q=検索クエリ&limit=20
   - qパラメータを受け取り searchImages() を呼び出す
   - 結果を返す（id, r2_url, uploaded_at, memo, ai_description, final_score）

5. app/page.tsx の更新（検索UI）
   - 検索ボックス（テキスト入力 + 検索ボタン）
   - 検索結果を画像グリッドで表示
   - 初期表示は最新アップロード順
   - 検索中はローディングスピナー表示
   - 検索結果が0件の場合はメッセージ表示

6. components/ImageCard.tsx の実装
   各画像カードに以下を表示:
   - サムネイル画像
   - アップロード日（YYYY/MM/DD形式）
   - メモの冒頭50文字
   - URLコピーボタン（クリックでクリップボードにr2_urlをコピー）
   - ダウンロードボタン（r2_urlから直接ダウンロード）
   - 「✓ 正解」「✗ 違う」フィードバックボタン（検索結果表示時のみ）

## 注意事項
- embedding IS NOT NULL のチェックを忘れずに（AI解析が完了していない画像を除外）
- Supabaseのrpc関数はマイグレーションファイルに追加すること
- OpenAI APIのエラー時はリトライを1回行うこと
- Claude APIに画像を渡す際はURLではなくbase64も選択肢だが、
  R2のpublicURLが使える場合はURLで渡す方がシンプル
```

---

---

# Phase 3 — フィードバック・画像詳細ページ・仕上げ

## Claude Code プロンプト（Phase 3）

```
画像管理アプリの残り機能を実装してください。

## やること

1. app/api/feedback/route.ts の実装
   POST /api/feedback
   Body: { image_id: string, query_text: string, feedback: 'relevant' | 'irrelevant' }
   - query_textをgenerateEmbedding()でベクトル化
   - image_feedbackテーブルに保存
   - 同じimage_idと同じクエリ（類似度0.95以上）のフィードバックが既にある場合は上書き
   - 成功レスポンスを返す

2. app/images/[id]/page.tsx の実装
   画像詳細ページ（このURLが「公開URL」として機能する）
   - 画像を大きく表示
   - アップロード日
   - メモ（あれば）
   - AI生成説明文（あれば）
   - ダウンロードボタン（大きめに）
   - URLコピーボタン
   - ブラウザで直接開いたとき: 右クリック → 名前をつけて保存 が使えること
   - OGP metaタグを設定して、XにURLを貼ったときにプレビュー表示されるようにする:
     og:image に r2_url を設定
     og:title に「パチンコ取材画像」などを設定

3. app/api/images/[id]/route.ts の実装
   GET /api/images/:id
   - 画像詳細を返す
   DELETE /api/images/:id
   - is_active を false にする（論理削除）
   - R2からは削除しない（URLが無効にならないよう）

4. 管理機能の追加（app/admin/page.tsx）
   シンプルな管理画面:
   - 全画像一覧（is_active含む）
   - 各画像に「無効化」ボタン（is_active = falseにする）
   - 「AI再解析」ボタン（ai_descriptionを再生成し直す）
   - フィードバック数の表示（relevant数 / irrelevant数）

5. UIの仕上げ
   - レスポンシブ対応（スマホでも使えること）
   - 画像グリッド: PCは4列、タブレットは2〜3列、スマホは2列
   - 検索ボックスは画面上部に固定
   - 画像カードにホバーエフェクト
   - フィードバックボタンを押した後、ボタンの状態を変える
     （✓ を押したら緑にハイライト、✗ を押したらグレーアウト）

6. エラーハンドリングの整備
   - API全体でtry-catchを入れる
   - 画像の読み込みエラー時はプレースホルダー表示
   - AI解析失敗時はエラーログを出してスキップ（アップロード自体は成功させる）

7. README.md の作成
   - セットアップ手順
   - 環境変数の説明
   - Supabaseのpgvector有効化手順
   - R2バケットのpublic access設定手順
   - デプロイ手順（Vercel）

## 注意事項
- 管理画面は認証なしでOK（社内ツールのため）
- ただし将来的にSupabase Authを追加しやすい設計にしておく
- 画像の公開URLはR2の直リンク（app/images/[id]経由でなくてもDLできる）
- XへのURLシェアは app/images/[id] のURLを使う（OGPで画像プレビューが出るため）
```

---

---

# 補足：Supabase pgvector セットアップ手順

```sql
-- 1. pgvector拡張を有効化（Supabase Dashboardの SQL Editor で実行）
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. テーブル作成（001_init.sql の内容を実行）

-- 3. 検索用RPC関数の登録
CREATE OR REPLACE FUNCTION search_images(
  query_vector VECTOR(1536),
  match_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  r2_url TEXT,
  uploaded_at TIMESTAMPTZ,
  memo TEXT,
  ai_description TEXT,
  vector_score FLOAT,
  feedback_score FLOAT,
  final_score FLOAT
)
LANGUAGE SQL
AS $$
  SELECT
    i.id,
    i.r2_url,
    i.uploaded_at,
    i.memo,
    i.ai_description,
    1 - (i.embedding <=> query_vector) AS vector_score,
    COALESCE(
      SUM(CASE WHEN f.feedback = 'relevant' THEN 0.1 ELSE 0 END) -
      SUM(CASE WHEN f.feedback = 'irrelevant' THEN 0.15 ELSE 0 END),
      0
    ) AS feedback_score,
    (1 - (i.embedding <=> query_vector)) +
    COALESCE(
      SUM(CASE WHEN f.feedback = 'relevant' THEN 0.1 ELSE 0 END) -
      SUM(CASE WHEN f.feedback = 'irrelevant' THEN 0.15 ELSE 0 END),
      0
    ) AS final_score
  FROM images i
  LEFT JOIN image_feedback f
    ON f.image_id = i.id
    AND 1 - (f.query_embedding <=> query_vector) > 0.85
  WHERE
    i.is_active = true
    AND i.embedding IS NOT NULL
  GROUP BY i.id
  ORDER BY final_score DESC
  LIMIT match_limit;
$$;
```

---

# 補足：Cloudflare R2 設定

1. Cloudflare Dashboardで R2 バケットを作成
2. バケットの「Settings」→「Public access」を有効化
3. 「Custom domains」または `r2.dev` のサブドメインを確認してR2_PUBLIC_URLに設定
4. API Token を作成（Object Read & Write 権限）
5. Account IDをR2_ACCOUNT_IDに設定

---

# 開発の進め方

```
Phase 1 → ローカルで動作確認（アップロード・一覧表示）
         ↓
Phase 2 → AI解析・検索の動作確認
         ↓
Phase 3 → フィードバック・詳細ページ・仕上げ
         ↓
Vercel にデプロイ
```

各フェーズのプロンプトをClaude Codeに貼り付けて実装を進めてください。  
実装中に詳細の確認が必要になったら、その都度このドキュメントを参照してください。
