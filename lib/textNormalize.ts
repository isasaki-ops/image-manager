// 全角英数字・記号（Unicode Fullwidth Forms: U+FF01〜U+FF5E）を対応する半角ASCIIに変換する。
// ひらがな・カタカナ・漢字・波ダッシュ（〜/～）など対象範囲外の文字は変更しない。
export function toHalfWidthAlnumSymbols(str: string): string {
  return str.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
}
