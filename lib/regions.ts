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
