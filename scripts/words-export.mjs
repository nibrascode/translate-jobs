// out/nibras/roots/*.json -> Nibras Arabic-in birbaşa qəbul etdiyi format:
//   out/nibras/nibras-words.js   (index.html-də expansion.js-dən SONRA, app.js-dən ƏVVƏL qoşulur)
//   out/nibras/nibras-words.json (eyni məlumat, JSON)
// Sxem tətbiqdəki kimidir: verbsData (nibrasBuildVerb tuple), BAB_MEANING_OVERRIDES, nounsData, adjectivesData.
import fs from "node:fs";
const DIR = "out/nibras/roots";
fs.mkdirSync(DIR, { recursive: true });
const entries = fs.readdirSync(DIR).sort().map((f) => JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8"))).filter((e) => !e.failed);

const verbs = [], babs = {}, nouns = [], adjectives = [];
const detail = (b) => [
  `Təsrif: ${b.arabic} — ${b.present_ar}${b.imperative_ar ? " — " + b.imperative_ar : ""}.`,
  `Məsdər: ${b.masdar} (${b.masdar_meaning}).`,
  `İsmi-fail: ${b.fail} (${b.fail_meaning}).`,
  b.maful ? `İsmi-məful: ${b.maful} (${b.maful_meaning}).` : "",
].filter(Boolean).join(" ");
for (const e of entries) {
  const v = e.verb;
  if (v && !v.in_app) verbs.push([v.id, v.arabic, v.meaning, v.past_tr, v.present_ar, v.present_tr, v.imperative_ar, v.imperative_tr]);
  if (e.bab_key && e.babs.length) {
    const o = { _note: `Bab məlumatı: translate-jobs/words (${e.model}), Məqayis kökü ${e.root}.` };
    for (const b of e.babs) o[b.bab] = { meaning: b.meaning, arabic: b.arabic, detail: detail(b) };
    babs[e.bab_key] = o;
  }
  for (const n of e.nouns) nouns.push({ id: n.id, arabic: n.arabic, meaning: n.meaning, pluralArabic: n.plural_ar, pluralMeaning: n.plural_meaning, category: "isim",
    root: e.root, examples: [{ arabic: n.example_ar, translation: n.example_az }] });
  for (const a of e.adjectives) adjectives.push({ id: a.id, arabic: a.arabic, feminine: a.feminine, pluralArabic: a.plural_ar, pluralMeaning: a.plural_meaning,
    femininePluralArabic: a.feminine_plural_ar, femininePluralMeaning: a.feminine_plural_meaning, meaning: a.meaning, category: "sifət", root: e.root,
    examples: [{ arabic: a.example_m_ar, translation: a.example_m_az }, { arabic: a.example_f_ar, translation: a.example_f_az }] });
}
const data = { generated: new Date().toISOString(), roots: entries.length, count: { verbs: verbs.length, bab_roots: Object.keys(babs).length, nouns: nouns.length, adjectives: adjectives.length }, verbs, babs, nouns, adjectives };
fs.writeFileSync("out/nibras/nibras-words.json", JSON.stringify(data, null, 1));
const J = (x) => JSON.stringify(x, null, 1);
fs.writeFileSync("out/nibras/nibras-words.js", `// Nibras Arabic — avtomatik söz bazası (translate-jobs/scripts/words-export.mjs). Əl ilə dəyişmə.
// ${data.generated} · ${entries.length} kök · ${verbs.length} fel · ${data.count.bab_roots} bab cədvəli · ${nouns.length} isim · ${adjectives.length} sifət
// index.html: <script src="nibras-words.js"></script> — expansion.js-dən sonra, app.js-dən əvvəl.
(function () {
  const n = (s) => String(s || "").replace(/[\\u064B-\\u0652\\u0670\\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
  const have = (arr) => new Set(arr.map((x) => n(x.arabic)));
  const vHave = have(verbsData), nHave = have(nounsData), aHave = have(adjectivesData);
  verbsData.push(...${J(verbs)}.filter((t) => !vHave.has(n(t[1]))).map(nibrasBuildVerb));
  const babs = ${J(babs)};
  for (const [k, v] of Object.entries(babs)) if (!BAB_MEANING_OVERRIDES[k]) BAB_MEANING_OVERRIDES[k] = v;
  nounsData.push(...${J(nouns)}.filter((x) => !nHave.has(n(x.arabic))));
  adjectivesData.push(...${J(adjectives)}.filter((x) => !aHave.has(n(x.arabic))));
})();
`);
console.log("export:", data.count);
