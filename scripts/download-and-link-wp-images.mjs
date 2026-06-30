/**
 * WPアイキャッチ画像を取得 → マッチング → R2アップロード → Supabase登録 → イベント紐づけ
 * 使い方: node scripts/download-and-link-wp-images.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');

// .env.local を読み込む
const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const WP_API = 'https://hisshobon-hall.info/wp-json/wp/v2/media';

// ---- ユーティリティ ----

function decodeHtml(str) {
  return str.replace(/&#038;/g, '&').replace(/&amp;/g, '&').replace(/&#039;/g, "'");
}

function normalizeKana(str) {
  return str
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[（）()【】「」]/g, ' ')
    .replace(/[＆&]/g, ' ')
    .replace(/[＋+]/g, ' ')
    .replace(/[・　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// 「取材」「来店」などを除いたコアキーワードを抽出
function extractCore(eventName) {
  return eventName
    .replace(/SS[・]?|取材|来店|パチ&スロ必勝本|必勝本|パチスロ/g, '')
    .replace(/[（）()【】「」]/g, ' ')
    .replace(/[＆&＋+・　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcScore(eventName, wpTitle) {
  const normE = normalizeKana(eventName);
  const normW = normalizeKana(decodeHtml(wpTitle));

  // 完全包含（正規化後）
  if (normW.includes(normE) || normE.includes(normW)) {
    // 短いイベント名（4文字以下）は誤マッチ防止: WPタイトルが近い長さのものを優先
    if (normE.replace(/\s/g, '').length <= 4) {
      const wpCore = normW.replace(/あいきゃっち /g, '').replace(/[_ ]/g, '');
      const eCore = normE.replace(/\s/g, '');
      const lenRatio = eCore.length / Math.max(wpCore.length, 1);
      return lenRatio > 0.3 ? 100 : 60;  // タイトルが長すぎる場合はスコア下げる
    }
    return 100;
  }

  // コアキーワードで分割マッチ
  const core = extractCore(eventName);
  const normCore = normalizeKana(core);
  if (normCore && normW.includes(normCore)) return 90;

  // トークン一致
  const tokens = normCore.split(' ').filter(t => t.length >= 2);
  if (!tokens.length) return 0;
  const matched = tokens.filter(t => normW.includes(t)).length;
  return Math.round((matched / tokens.length) * 80);
}

function generateKey(fileName) {
  const now = new Date();
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  const t = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const r = Math.random().toString(36).slice(2, 6);
  const ext = fileName.split('.').pop() ?? 'jpg';
  return `${d}_${t}_${r}.${ext}`;
}

async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; image-manager-bot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

async function uploadToR2(buffer, key, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// ---- CSVのイベント一覧を読む ----
function loadTargetEvents() {
  const csvPath = path.join(process.cwd(), '画像未設定イベント一覧.csv');
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(l => l.trim());
  return lines.slice(1).map(line => {
    const [code, category, name] = line.split(',').map(s => s.trim());
    return { code, category, name };
  }).filter(e => e.code && e.name);
}

// ---- メイン ----
async function main() {
  console.log(`=== WP画像 一括処理${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  // 1. 対象イベント読み込み
  const targetEvents = loadTargetEvents();
  console.log(`対象イベント: ${targetEvents.length}件`);

  // 2. WPメディア全件取得（アイキャッチ_プレフィックス）
  console.log('\nWordPress メディア取得中...');
  const firstRes = await fetch(`${WP_API}?search=${encodeURIComponent('アイキャッチ_')}&per_page=100&page=1`);
  const totalPages = parseInt(firstRes.headers.get('X-WP-TotalPages') || '1', 10);
  const allMedia = [...(await firstRes.json())];
  process.stdout.write(`  page 1: ${allMedia.length}件\r`);

  for (let page = 2; page <= totalPages; page++) {
    const res = await fetch(`${WP_API}?search=${encodeURIComponent('アイキャッチ_')}&per_page=100&page=${page}`);
    const data = await res.json();
    allMedia.push(...data);
    process.stdout.write(`  page ${page}: ${data.length}件 (累計${allMedia.length}件)\r`);
    if (data.length === 0) break;
  }
  console.log(`\nWP画像合計: ${allMedia.length}件\n`);

  // アイキャッチ_で始まるものだけ
  const aiMedia = allMedia.filter(m => decodeHtml(m.title.rendered).startsWith('アイキャッチ_'));

  // 3. DBからイベントUUIDを引く
  const codes = targetEvents.map(e => e.code);
  const { data: dbEvents } = await supabase.from('events').select('id, event_code, name').in('event_code', codes);
  const eventMap = new Map((dbEvents ?? []).map(e => [e.event_code, e]));
  console.log(`DBイベント取得: ${eventMap.size}件`);

  // 4. 既存の未リンク画像を取得（重複アップロード回避）
  const { data: existingImages } = await supabase
    .from('images').select('id, file_name, event_id, r2_url').is('event_id', null);
  const existingByName = new Map((existingImages ?? []).map(img => [img.file_name, img]));
  console.log(`既存の未リンク画像: ${existingByName.size}件\n`);

  // 5. 各イベントにマッチングしてダウンロード・紐づけ
  const results = { linked: 0, uploaded: 0, skipped: 0, failed: 0, noMatch: 0 };
  const log = [];

  for (const ev of targetEvents) {
    const dbEvent = eventMap.get(ev.code);
    if (!dbEvent) {
      results.skipped++;
      continue;
    }

    // ベストマッチを探す
    let bestMedia = null;
    let bestScore = 0;
    for (const m of aiMedia) {
      const score = calcScore(ev.name, decodeHtml(m.title.rendered));
      if (score > bestScore) {
        bestScore = score;
        bestMedia = m;
      }
    }

    if (!bestMedia || bestScore < 40) {
      results.noMatch++;
      log.push({ status: '×', code: ev.code, name: ev.name, note: 'マッチなし' });
      continue;
    }

    const wpTitle = decodeHtml(bestMedia.title.rendered);
    const wpUrl = bestMedia.source_url;
    const rawFileName = decodeURIComponent(wpUrl.split('/').pop() ?? 'image.jpg');

    console.log(`[${ev.code}] ${ev.name}`);
    console.log(`  → ${wpTitle} (スコア:${bestScore})`);

    // 既存の未リンク画像にファイル名が一致するものがあれば紐づけるだけ
    const existing = existingByName.get(rawFileName);
    if (existing) {
      console.log(`  → 既存画像を紐づけ`);
      if (!DRY_RUN) {
        await supabase.from('images').update({ event_id: dbEvent.id }).eq('id', existing.id);
      }
      results.linked++;
      log.push({ status: '◎', code: ev.code, name: ev.name, note: `既存紐づけ: ${rawFileName}` });
      continue;
    }

    // ダウンロード → R2 → Supabase
    try {
      const { buffer, contentType } = await downloadImage(wpUrl);
      console.log(`  → ${(buffer.length / 1024).toFixed(0)} KB`);

      if (!DRY_RUN) {
        const key = generateKey(rawFileName);
        const r2Url = await uploadToR2(buffer, key, contentType);
        const { error } = await supabase.from('images').insert({
          r2_key: key,
          r2_url: r2Url,
          file_name: rawFileName,
          file_size: buffer.length,
          file_type: contentType,
          image_width: 600,
          image_height: 400,
          event_id: dbEvent.id,
          image_type: '600x400',
        });
        if (error) throw new Error(error.message);
        console.log(`  ✓ アップロード完了`);
      } else {
        console.log(`  [DRY] アップロードをスキップ`);
      }
      results.uploaded++;
      log.push({ status: '✓', code: ev.code, name: ev.name, note: rawFileName });
    } catch (err) {
      console.log(`  ✗ エラー: ${err.message}`);
      results.failed++;
      log.push({ status: '✗', code: ev.code, name: ev.name, note: err.message });
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // 6. 結果出力
  console.log('\n=== 完了サマリー ===');
  console.log(`◎ 既存画像を紐づけ: ${results.linked}件`);
  console.log(`✓ 新規アップロード: ${results.uploaded}件`);
  console.log(`× マッチなし:       ${results.noMatch}件`);
  console.log(`△ スキップ:         ${results.skipped}件`);
  console.log(`✗ 失敗:             ${results.failed}件`);

  // ログをCSV保存
  const logCsv = 'ステータス,イベントコード,イベント名,備考\n' +
    log.map(l => `${l.status},${l.code},"${l.name}","${l.note}"`).join('\n');
  fs.writeFileSync(path.join(process.cwd(), 'wp-link-log.csv'), logCsv, 'utf8');
  console.log('\nログ保存: wp-link-log.csv');
}

main().catch(console.error);
