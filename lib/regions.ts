export const REGIONS = [
  { id: 'hokkaido', label: '北海道' },
  { id: 'tohoku', label: '東北' },
  { id: 'kanto', label: '関東' },
  { id: 'tokai', label: '東海' },
  { id: 'kansai', label: '関西' },
  { id: 'kyushu', label: '九州' },
] as const

export type RegionId = (typeof REGIONS)[number]['id']

export const ALL_REGION_IDS: RegionId[] = REGIONS.map((r) => r.id)

export const REGION_LABEL: Record<RegionId, string> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r.label])
) as Record<RegionId, string>

export function isValidRegionId(value: string): value is RegionId {
  return (ALL_REGION_IDS as string[]).includes(value)
}

// 「設定なし」はDBに保存される実タグではなく、region_idsが空のイベントを指す
// 派生カテゴリ。TOPページの絞り込み・件数表示にのみ使う（登録・編集フォームには出さない）。
export const NONE_REGION_ID = 'none'
export const NONE_REGION_LABEL = '設定なし'

export const REGION_FILTER_OPTIONS = [
  ...REGIONS,
  { id: NONE_REGION_ID, label: NONE_REGION_LABEL },
] as const

export const ALL_REGION_FILTER_IDS: string[] = REGION_FILTER_OPTIONS.map((r) => r.id)

export function isValidRegionFilterId(value: string): boolean {
  return ALL_REGION_FILTER_IDS.includes(value)
}
