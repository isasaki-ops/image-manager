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

// 地方ごとの識別色（TOPページのイベントカードのタグ表示などで使用）
export const REGION_COLOR: Record<RegionId, string> = {
  hokkaido: 'text-slate-100 border-slate-300/60',
  tohoku: 'text-green-300 border-green-400/60',
  kanto: 'text-purple-200 border-purple-400/70',
  tokai: 'text-blue-300 border-blue-400/60',
  kansai: 'text-orange-300 border-orange-400/60',
  kyushu: 'text-rose-300 border-rose-400/60',
}

// TOPページの地方フィルターで地方チェックを一つも入れなかった状態を表すURLパラメータ値。
// DBに保存される実タグではなく、region_idsが空のイベントを指す派生条件。
export const NONE_REGION_PARAM = 'none'

// `region`クエリパラメータを解析する。
// - 未指定 or 全地方指定 → 絞り込みなし（regionIds: undefined）
// - "none" → 地方が一つも設定されていないイベントのみ
// - カンマ区切りの地方ID → 該当地方のイベントのみ（OR）
export function parseRegionParam(
  regionParam: string | null
): { regionIds?: string[]; includeNoneRegion: boolean } {
  if (!regionParam) return { regionIds: undefined, includeNoneRegion: false }
  if (regionParam === NONE_REGION_PARAM) return { regionIds: [], includeNoneRegion: true }
  const ids = regionParam.split(',').filter(isValidRegionId)
  if (ids.length === 0 || ids.length >= ALL_REGION_IDS.length) {
    return { regionIds: undefined, includeNoneRegion: false }
  }
  return { regionIds: ids, includeNoneRegion: false }
}
