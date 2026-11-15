# translate-jobs
Gündəlik avtomatik tərcümə: İbn Faris, «معجم مقاييس اللغة» (ت عبد السلام هارون, 4703 kök maddəsi) → Azərbaycan dili.
- Mənbə: `data/maqayis.json` (`[kök, cild, səh_a, səh_b, mətn]`), mektebe/api/_lugha/maqayis.js-dən.
- Nəticə: `out/maqayis/NNNN.json` (ərəbcə + az + mənbə istinadı). Gediş: `state.json`.
- Gündə 3 dəfə: 08:15, 15:15, 22:15 UTC (11:15, 18:15, 01:15 Riyad); limit bitənə və ya 120 dəq. dolana qədər.

## Yoxlama (review)
Tərcümə bitib (4703/4703); `translate.yml`-in cədvəli söndürülüb (yalnız əl ilə).
`scripts/review.mjs` + `.github/workflows/review.yml`: güclü model (defolt `gemini-4-hydrogen`, ehtiyat: `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`) hər maddəni ərəbcə mətnlə tutuşdurur, səhv varsa `az`-ı düzəldir.
- Hər maddəyə yazılır: `reviewed`, `review_model`, `review_ok`, `review_issues`, `review_ts`; dəyişibsə köhnəsi `prev_az`, `prev_model`.
- Məlum yarımçıq maddələr (207, 329, 1056, 1445, 2184, 2684, 4291) tam yenidən tərcümə olunur; sonra qısa/şübhəli olanlar, sonra qalanı.
- Gündə 6 dəfə (00:10, 04:10 … 20:10 UTC), hər dəfə ≤105 dəq; gediş `review-state.json`-da. Hamısı yoxlananda öz-özünə dayanır.
- Secret-lər: `GEMINI_API_KEY`, istəyə görə `GEMINI_API_KEY_2` (limit bitəndə növbəti açar).
