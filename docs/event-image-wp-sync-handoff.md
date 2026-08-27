# イベント画像（WP登録済み）データ同期 実装手順書

image-manager（取材画像管理ツール）が保持するイベントのうち、WordPressメディアライブラリに登録済みの
600×400画像を取得するためのAPIです。
取得タイミング・同期頻度・ボタン設置箇所はすべてそちらで自由に決めてください。

---

## エンドポイント仕様

### 基本情報

| 項目 | 値 |
|---|---|
| メソッド | `GET` |
| URL | `https://image-manager-nine.vercel.app/api/export/event-images` |
| 認証 | クエリパラメータ `api_key`（pachinko-CRMの`/api/export/hall-data`等と同じキーです） |

### リクエスト例

```
GET https://image-manager-nine.vercel.app/api/export/event-images?api_key=vYQ_XpYmiwD04a8UPwmjyDzIDR9wBMudE7PC4K5lhqY
```

### レスポンス形式

1行 = 1画像（1イベントに600×400画像が複数登録されている場合、イベント情報を含めて複数行になります）。
**WP登録済みの600×400画像が1枚も無いイベントも、画像系フィールドを空文字にした1行として含まれます**（2026-07-23〜）。
※イベント自体には別サイズ・別種類の画像が存在する場合があります。「画像なし」ではなく「WP登録済み600×400画像なし」という意味です。

```json
{
  "data": [
    {
      "event_id": "43f76318-bb7c-4153-bd87-e95e62bbce58",
      "event_code": "01-0402",
      "event_name": "夢広場探検隊インパクトセブン",
      "region_ids": ["tohoku"],
      "region_names": ["東北"],
      "image_url": "https://pub-d672515405f2469b849bf142c5252dae.r2.dev/20260709_011726_z....jpg",
      "image_file_name": "image01_夢広場探検隊インパクトセブン_600x400.jpg",
      "event_updated_at": "2026-07-10T03:29:56.123Z",
      "image_updated_at": "2026-07-10T05:10:02.456Z"
    },
    {
      "event_id": "9b1e2c3d-....",
      "event_code": "01-0059",
      "event_name": "女神の加護",
      "region_ids": ["tohoku", "tokai"],
      "region_names": ["東北", "東海"],
      "image_url": "",
      "image_file_name": "",
      "event_updated_at": "2026-07-20T01:00:00.000Z",
      "image_updated_at": ""
    }
  ],
  "total": 374,
  "exported_at": "2026-07-10T06:00:00Z"
}
```

### フィールド定義

| フィールド | 型 | 説明 |
|---|---|---|
| `event_id` | string (UUID) | image-manager内部ID |
| `event_code` | string | イベントコード（例: `"01-0402"`）。`01`=取材、`02`=来店、`03`=収録（2026-08〜追加。詳細は`docs/category-recode-and-shuroku-handoff.md`参照） |
| `event_name` | string | イベント名 |
| `region_ids` | string[] | 地方コード配列（`hokkaido`/`tohoku`/`kanto`/`tokai`/`kansai`/`kyushu`）。複数地方に該当する場合あり |
| `region_names` | string[] | 地方の日本語名配列（`region_ids`と同じ並び） |
| `image_url` | string | 600×400画像のURL（image-manager側の画像本体）。**WP登録済み600×400画像が無いイベントの行では空文字`""`** |
| `image_file_name` | string | WordPressメディアライブラリに実際に登録されたファイル名。WP側のファイル名サニタイズ（`&`除去、スペース→`-`変換等）を経た**最終的な**ファイル名です。**WP登録済み600×400画像が無いイベントの行では空文字`""`** |
| `event_updated_at` | string (ISO 8601) | イベント本体（名称・地方等）の最終更新日時 |
| `image_updated_at` | string (ISO 8601) | この画像レコード（WP登録・ファイル名変更等）の最終更新日時。**WP登録済み600×400画像が無いイベントの行では空文字`""`** |

---

## 全件取得 / 差分取得

- パラメータなしで呼ぶと**全件**を返します。
- `updated_after`（ISO 8601）を付けると、`event_updated_at`または`image_updated_at`がそれ以降のイベント・画像のみを対象にした**差分**を返します（例: `&updated_after=2026-07-01T00:00:00Z`）。
- どちらを使うか、どのくらいの頻度で叩くかはそちら側の運用に合わせて自由に決めてください。
- **イベント名の変更だけ・画像の再登録だけ、といった細かい変更も検知したい場合**は `event_updated_at` と `image_updated_at` を別々に見て、どちらが更新されたか判定してください。

---

## 注意点

- **WP登録済みの600×400画像のみが対象です。** イベントに画像はあっても、600×400として未登録（600×400未作成、または600×400は作成済みだがWP未登録）のものは、そのイベントについては空の行（`image_url: ""`）として出てきます。**イベント自体に画像が無いとは限りません**（原寸画像のみ登録されているケースが大半です）。
- 1イベントに600×400画像が複数登録されている場合（同名イベントの重複登録等）、そのイベントの行が複数回出現します。
- **WP登録済み600×400画像が1枚もないイベントも、`image_url`等を空文字にした1行として必ず含まれます**（2026-07-23〜）。地域チェックの有無に関わらず全イベントが対象です。
- upsertのキーには `event_id` + `image_url`（またはimage_file_name）の組み合わせを推奨します。同一イベントに複数画像があり得るため、`event_id`単独では一意になりません。空の行は`image_url`が空文字になるため、同一イベントで空の行は最大1つしか出現しません。
- **削除の同期は非対応です。** image-manager側でイベントや画像登録が削除されても、差分取得ではそちらのDBに反映されません。定期的に全件取得（パラメータなし）を行い、image-manager側に存在しなくなった行をそちらで削除する運用を推奨します（pachinko-CRM連携と同じ理由です）。
- `region_ids` / `region_names` は0件（地方未設定）の場合があります。

---

## エラー時のレスポンス

| ステータス | 意味 |
|---|---|
| `401` | APIキーが不正 |
| `500` | サーバーエラー（`error`フィールドに詳細）|
