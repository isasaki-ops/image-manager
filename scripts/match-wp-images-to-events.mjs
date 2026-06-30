/**
 * WordPressメディアライブラリから「アイキャッチ_」で始まる画像を取得し、
 * 画像未設定イベント110件とマッチングしてCSVに出力するスクリプト
 */

import fs from 'fs';
import path from 'path';

const WP_API = 'https://hisshobon-hall.info/wp-json/wp/v2/media';
const EVENTS_CSV = path.join(process.cwd(), '画像未設定イベント一覧.csv');
const OUTPUT_CSV = path.join(process.cwd(), 'wp-image-match-result.csv');

// 正規化: カタカナ→ひらがな、全角→半角、記号除去
function normalizeKana(str) {
  return str
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .replace(/[（）()【】\[\]「」『』〔〕]/g, ' ')  // 括弧をスペースに
    .replace(/[＆&]/g, ' ')
    .replace(/[＋+]/g, ' ')
    .replace(/[・・]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// HTMLエンティティをデコード
function decodeHtml(str) {
  return str
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// イベント名からキーワード抽出
function extractKeywords(eventName) {
  // 「SS・」「取材」「来店」などの共通語句を除いた実質的なキーワード
  const cleaned = eventName
    .replace(/SS・|SS[・]?|取材|来店|パチ&スロ必勝本|必勝本/g, '')
    .replace(/[（）()【】\[\]]/g, '')
    .trim();

  // 人名・キャラ名を分割（&・＆・＋で区切り）
  const parts = cleaned.split(/[&＆・+＋、,，]/).map(s => s.trim()).filter(s => s.length > 0);
  return parts;
}

// マッチングスコアを計算
function calcMatchScore(eventName, wpTitle) {
  const normEvent = normalizeKana(eventName);
  const normWp = normalizeKana(decodeHtml(wpTitle));

  // 完全包含一致（正規化後）
  if (normWp.includes(normEvent) || normEvent.includes(normWp)) return 100;

  // イベント名をトークンに分解（スペース区切り）
  const eventTokens = normEvent.split(' ').filter(s => s.length >= 2);
  const wpTokens = normWp.split(/[ _\-]/).filter(s => s.length >= 1);

  if (eventTokens.length === 0) return 0;

  // 各イベントトークンがWPタイトルに含まれるか
  let matchedCount = 0;
  for (const token of eventTokens) {
    if (normWp.includes(token)) matchedCount++;
  }

  const score = Math.round((matchedCount / eventTokens.length) * 80);

  // キャラクター名抽出でのボーナスマッチ
  const charKeywords = extractKeywords(eventName);
  if (charKeywords.length > 0) {
    let charMatched = 0;
    for (const kw of charKeywords) {
      if (kw.length >= 2 && normWp.includes(normalizeKana(kw))) charMatched++;
    }
    const charScore = Math.round((charMatched / charKeywords.length) * 70);
    return Math.max(score, charScore);
  }

  return score;
}

// CSVの行をパース（簡易版）
function parseCSVLine(line) {
  return line.split(',').map(s => s.trim());
}

async function main() {
  console.log('=== WPメディア × イベント マッチングスクリプト ===\n');

  // 1. イベント一覧CSV読み込み
  const csvContent = fs.readFileSync(EVENTS_CSV, 'utf8');
  const lines = csvContent.split('\n').filter(l => l.trim());
  const events = lines.slice(1).map(line => {
    const [code, category, name] = parseCSVLine(line);
    return { code, category, name };
  }).filter(e => e.code);

  console.log(`対象イベント: ${events.length}件`);

  // 2. WPメディア全件取得（まず総ページ数を確認）
  console.log('\nWordPressメディア取得中...');
  const firstUrl = `${WP_API}?search=${encodeURIComponent('アイキャッチ_')}&per_page=100&page=1`;
  const firstRes = await fetch(firstUrl);
  const totalPages = parseInt(firstRes.headers.get('X-WP-TotalPages') || '1', 10);
  const totalCount = parseInt(firstRes.headers.get('X-WP-Total') || '0', 10);
  console.log(`  総件数: ${totalCount}件 / 総ページ数: ${totalPages}ページ`);

  const allMedia = [];
  const firstData = await firstRes.json();
  allMedia.push(...firstData);
  process.stdout.write(`  page 1: ${firstData.length}件 (累計${allMedia.length}件)\r`);

  for (let page = 2; page <= totalPages; page++) {
    const url = `${WP_API}?search=${encodeURIComponent('アイキャッチ_')}&per_page=100&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json();
    if (data.length === 0) break;
    allMedia.push(...data);
    process.stdout.write(`  page ${page}: ${data.length}件 (累計${allMedia.length}件)\r`);
  }
  console.log(`\nWPメディア合計: ${allMedia.length}件`);

  // アイキャッチ_で始まるものだけフィルタ
  const aiMedia = allMedia.filter(m => {
    const title = decodeHtml(m.title.rendered);
    return title.startsWith('アイキャッチ_');
  });
  console.log(`アイキャッチ_ で始まる: ${aiMedia.length}件\n`);

  // 3. マッチング
  const results = [];
  for (const event of events) {
    const candidates = [];

    for (const media of aiMedia) {
      const title = decodeHtml(media.title.rendered);
      const score = calcMatchScore(event.name, title);
      if (score >= 30) {
        candidates.push({ score, title, url: media.source_url, id: media.id });
      }
    }

    // スコア降順でソート
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0] || null;
    results.push({
      event_code: event.code,
      category: event.category,
      event_name: event.name,
      match_score: best ? best.score : 0,
      wp_title: best ? best.title : '',
      wp_url: best ? best.url : '',
      wp_id: best ? best.id : '',
      status: best ? (best.score >= 60 ? '✓自動' : best.score >= 40 ? '△要確認' : '✗低スコア') : '×なし',
      alt2: candidates[1] ? candidates[1].title : '',
      alt2_url: candidates[1] ? candidates[1].url : '',
      alt2_score: candidates[1] ? candidates[1].score : '',
    });
  }

  // 4. CSV出力
  const header = 'イベントコード,カテゴリ,イベント名,スコア,WPタイトル,WPURL,状態,第2候補タイトル,第2候補URL,第2候補スコア';
  const rows = results.map(r =>
    [r.event_code, r.category, r.event_name, r.match_score, r.wp_title, r.wp_url, r.status, r.alt2, r.alt2_url, r.alt2_score]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );

  fs.writeFileSync(OUTPUT_CSV, '﻿' + header + '\n' + rows.join('\n'), 'utf8');
  console.log(`\nマッチング結果を保存: ${OUTPUT_CSV}`);

  // 5. サマリー表示
  const auto = results.filter(r => r.match_score >= 60);
  const review = results.filter(r => r.match_score >= 40 && r.match_score < 60);
  const low = results.filter(r => r.match_score > 0 && r.match_score < 40);
  const none = results.filter(r => r.match_score === 0);

  console.log('\n=== マッチング結果サマリー ===');
  console.log(`✓ 自動マッチ可能 (スコア60+): ${auto.length}件`);
  console.log(`△ 要確認 (スコア40-59):      ${review.length}件`);
  console.log(`✗ 低スコア (スコア1-39):      ${low.length}件`);
  console.log(`× マッチなし:                 ${none.length}件`);

  console.log('\n=== ✓ 自動マッチ候補 ===');
  for (const r of auto) {
    console.log(`  [${r.event_code}] ${r.event_name}`);
    console.log(`    → ${r.wp_title} (スコア:${r.match_score})`);
  }

  console.log('\n=== △ 要確認 ===');
  for (const r of review) {
    console.log(`  [${r.event_code}] ${r.event_name}`);
    console.log(`    → ${r.wp_title} (スコア:${r.match_score})`);
  }

  console.log('\n=== × マッチなし ===');
  for (const r of none) {
    console.log(`  [${r.event_code}] ${r.event_name}`);
  }
}

main().catch(console.error);
