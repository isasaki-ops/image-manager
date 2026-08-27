export const CATEGORY_IDS = ['01', '02', '03'] as const
export type CategoryId = typeof CATEGORY_IDS[number]
export const CATEGORY_LABEL: Record<CategoryId, string> = { '01': '取材', '02': '来店', '03': '収録' }
export const CATEGORY_OPTIONS = CATEGORY_IDS.map((id) => ({ id, label: CATEGORY_LABEL[id] }))
