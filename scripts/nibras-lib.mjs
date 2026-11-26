// Ümumi köməkçilər: Nibras Arabic-in normalizeArabic() funksiyası ilə eyni normallaşdırma və kök yoxlaması.
export const HARAKAT_RE = /[\u064B-\u0652\u0670\u0640]/g;
export const norm = (s) => String(s || "").replace(HARAKAT_RE, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
// zəif hərflər və həmzə daşıyıcıları çıxarılmış "skelet" (kökü sözlə tutuşdurmaq üçün)
const WEAK = /[اويءئؤأإآٱى]/g;
export const skeleton = (s) => norm(s).replace(/\s+/g, "").replace(WEAK, "");
// kökün güclü hərfləri sözdə ardıcıllıqla varmı (təşdidli/ikiqat kök üçün təkrar hərf bir dəfə sayıla bilər)
export function rootFits(root, word) {
  const r = [...skeleton(root)].filter((c, k, a) => c !== a[k - 1]);
  const w = [...skeleton(word)];
  let j = 0;
  for (const c of w) if (c === r[j]) j++;
  return j >= r.length;
}
export const AR_LETTER = /[\u0621-\u064A]/;
export const HAS_HARAKA = /[\u064B-\u0652]/;
export const LAT = /[a-zA-ZəƏıİöÖüÜçÇşŞğĞ]/;
export const BABS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
