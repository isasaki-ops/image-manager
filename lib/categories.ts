export const CATEGORY_IDS = ['01', '02', '03'] as const
export type CategoryId = typeof CATEGORY_IDS[number]
export const CATEGORY_LABEL: Record<CategoryId, string> = { '01': '取材', '02': '来店', '03': '収録' }
export const CATEGORY_OPTIONS = CATEGORY_IDS.map((id) => ({ id, label: CATEGORY_LABEL[id] }))

export function isValidCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value)
}

// `category`クエリパラメータ（カンマ区切りのカテゴリID）を解析する。
// 未指定・全カテゴリ指定・無効値のみ ＝ 絞り込みなし（categoryIds: undefined）
export function parseCategoryParam(categoryParam: string | null): string[] | undefined {
  if (!categoryParam) return undefined
  const ids = categoryParam.split(',').filter(isValidCategoryId)
  if (ids.length === 0 || ids.length >= CATEGORY_IDS.length) return undefined
  return ids
}
