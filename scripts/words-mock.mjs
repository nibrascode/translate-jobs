// Yalnız DRY_RUN=1 sınağı üçün: Gemini cavabını təqlid edir (heç bir açar/şəbəkə işlətmir).
const F = "\u064E", K = "\u0650", D = "\u064F", S = "\u0652", N = "\u064C";
export function mock(kind, prompt) {
  if (kind === "tier") return [...prompt.matchAll(/^(\d+): /gm)].map((m) => ({ i: +m[1], t: +m[1] % 4 }));
  return [...prompt.matchAll(/^### i=(\d+)\s+kök: (\S+)/gm)].map(([, i, root], k) => {
    const [a, b, c] = [...root.replace(/[\u064B-\u0652]/g, "")];
    if (!c) return { i: +i, has_verb: false, babs: [], nouns: [], adjectives: [] };
    const past = a + F + b + F + c + F, pres = "ي" + F + a + S + b + D + c + D;
    const r = {
      i: +i, has_verb: true,
      verb: { arabic: past, meaning: "sınamaq", past_tr: "sınadı", present_ar: pres, present_tr: "sınayır", imperative_ar: "ا" + D + a + S + b + D + c + S, imperative_tr: "sına", in_app: false },
      babs: [
        { bab: "I", arabic: past, present_ar: pres, imperative_ar: "ا" + D + a + S + b + D + c + S, meaning: "sınadı", masdar: a + F + b + S + c + N, masdar_meaning: "sınama", fail: a + F + "ا" + b + K + c + N, fail_meaning: "sınayan", maful: "م" + F + a + S + b + D + "و" + c + N, maful_meaning: "sınanmış" },
        { bab: "II", arabic: a + F + b + "\u0651" + F + c + F, present_ar: "ي" + D + a + F + b + "\u0651" + K + c + D, imperative_ar: "", meaning: "yaratdı", masdar: "ت" + F + a + S + b + K + "ي" + c + N, masdar_meaning: "x", fail: "م" + D + a + F + b + "\u0651" + K + c + N, fail_meaning: "y" },
        { bab: "XI", arabic: past, present_ar: pres, meaning: "z", masdar: past, masdar_meaning: "z", fail: past, fail_meaning: "z" },
      ],
      nouns: [
        { arabic: "م" + F + a + S + b + F + c + N, meaning: "sınaq yeri", plural_ar: "م" + F + a + F + "ا" + b + K + c + D, plural_meaning: "sınaq yerləri", example_ar: "هٰذَا " + "م" + F + a + S + b + F + c + N + ".", example_az: "Bu, sınaq yeridir." },
        { arabic: "كِتَابٌ", meaning: "kitab", plural_ar: "كُتُبٌ", plural_meaning: "kitablar", example_ar: "هٰذَا كِتَابٌ.", example_az: "Bu, kitabdır." },
        { arabic: "Latin", meaning: "səhv", plural_ar: "", plural_meaning: "", example_ar: "", example_az: "" },
      ],
      adjectives: [{ arabic: a + F + b + K + "ي" + c + N, feminine: a + F + b + K + "ي" + c + F + "ةٌ", plural_ar: a + D + b + F + c + F + "ا" + "ءُ", plural_meaning: "sınaqlı olanlar", feminine_plural_ar: a + F + b + K + "ي" + c + F + "اتٌ", feminine_plural_meaning: "sınaqlı olan qadınlar", meaning: "sınaqlı", example_m_ar: "هُوَ " + a + F + b + K + "ي" + c + N + ".", example_m_az: "O (kişi) sınaqlıdır.", example_f_ar: "هِيَ " + a + F + b + K + "ي" + c + F + "ةٌ.", example_f_az: "O (qadın) sınaqlıdır." }],
    };
    if (k === 1) r.verb.present_ar = "yanlış"; // pis fel -> kök yenidən soruşulmalıdır
    return r;
  });
}
