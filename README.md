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
- Secret: yalnız `GEMINI_API_KEY` (`GEMINI_API_KEY_2` words-nibras işinə ayrılıb).

## Nibras Arabic söz bazası (words-nibras)
`scripts/words.mjs` + `.github/workflows/words-nibras.yml`: hər gün Gemini limiti bitənə qədər Nibras Arabic tətbiqi üçün ərəbcə söz + Azərbaycan dilində tərcümə hazırlayır. Açar: `GEMINI_API_KEY_2` (yalnız bu iş).
- Mənbə: `data/maqayis.json`-dakı 4703 kök. Mərhələ 1: hər kökə işlənmə dərəcəsi (1 çox işlənən … 3 az, 0 nadir/atlanır) → `data/nibras/root-tiers.json`. Mərhələ 2: köklər dərəcə, sonra lüğət sırası ilə.
- Hər kök üçün: I bab feli (keçmiş / indiki / əmr + tərcümə), işlənən II–X bablar (forma, indiki, əmr, məna, məsdər, ism-fail, ism-məful), kökdən isimlər (tək + cəm + nümunə), sifətlər (kişi/qadın, cəm + 2 nümunə).
- Təkrar olmasın: `data/nibras/existing.json` — tətbiqdə artıq olan fel/isim/sifət/sözlərin snapshot-u (`ARABIC_DIR=../arabic node scripts/nibras-existing.mjs`; tətbiq yenilənəndə təzələ). Tətbiqdə olan fel yenidən yazılmır; bab məlumatı olmayan mövcud fellərə yalnız bab cədvəli əlavə olunur.
- Yoxlama: ərəbcə sahələr hərəkəli olmalı, az sahələr latın, kiril/«yarat» yox, söz kökə uyğun olmalı; pis fel → kök 3 dəfəyə qədər yenidən, pis isim/bab → atılır (`rejected`).
- Nəticə: `out/nibras/roots/NNNN.json` (xam), `out/nibras/nibras-words.js` + `.json` (tətbiq formatı: `verbsData`/`nibrasBuildVerb`, `BAB_MEANING_OVERRIDES`, `nounsData`, `adjectivesData`; id-lər: fel 10001+, isim 20001+, sifət 30001+). Gediş: `nibras-words-state.json`.
- Tətbiqə qoşmaq: `nibras-words.js`-i `arabic/www/`-ə kopyala, `index.html`-də `expansion.js`-dən sonra, `app.js`-dən əvvəl `<script src="nibras-words.js"></script>`, `sw.js`-in siyahısına əlavə et.
- Cədvəl: 07:40 UTC (10:40 Riyad), ehtiyat 13:40 və 19:40 UTC; hər run ≤150 dəq. Əl ilə: Actions → words-nibras → Run workflow (`max_calls`, `only`).
- Lokal sınaq (açarsız): `DRY_RUN=1 ONLY=3469,2647 node scripts/words.mjs && node scripts/words-export.mjs` (saxta cavab, `scripts/words-mock.mjs`).
