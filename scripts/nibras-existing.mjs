// Nibras Arabic tətbiqində (nibrascode/arabic, gizli repo) artıq olan sözlərin snapshot-u.
// İşlətmək: ARABIC_DIR=../arabic node scripts/nibras-existing.mjs  ->  data/nibras/existing.json
// (CI gizli repoya baxa bilmir, ona görə snapshot repoya commit olunur; tətbiq yenilənəndə yenidən işlət.)
import fs from "node:fs";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { norm } from "./nibras-lib.mjs";
const DIR = (process.env.ARABIC_DIR || "../arabic") + "/www/";
const FILES = ["verbs", "bab-meanings", "words", "nouns", "adjectives", "numbers", "dialogues", "tests", "expansion"]; // index.html sırası
const ctx = { console, window: {}, localStorage: { getItem: () => null, setItem() {} }, document: {} };
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(fs.readFileSync(DIR + f + ".js", "utf8").replace(/^(const|let) /gm, "var "), ctx, { filename: f });
let commit = "";
try { commit = execSync("git rev-parse --short HEAD", { cwd: DIR }).toString().trim(); } catch {}
const promoted = [...(ctx.nibrasPromotedDerivedBabEntries || []), ...(ctx.nibrasSecondHundredDerivedBabEntries || [])];
const maxId = (a) => Math.max(0, ...a.map((x) => +x.id || 0));
const out = {
  source: `nibrascode/arabic@${commit}`, generated: new Date().toISOString(),
  max_id: { verbs: maxId(ctx.verbsData), nouns: maxId(ctx.nounsData), adjectives: maxId(ctx.adjectivesData), words: maxId(ctx.wordsData) },
  // Bu repo açıqdır, tətbiq isə gizli: yalnız ərəbcə sözlər saxlanılır (tətbiqin Azərbaycan dilindəki tərcümələri yox).
  // [ərəbcə (hərəkəli, BAB_MEANING_OVERRIDES açarı kimi dəqiq), bab məlumatı varmı]
  verbs: ctx.verbsData.map((v) => [v.arabic, Boolean(ctx.BAB_MEANING_OVERRIDES[v.arabic])]),
  bab_forms: [...promoted.map((e) => e.arabic), ...Object.values(ctx.BAB_MEANING_OVERRIDES).flatMap((o) => Object.values(o).map((b) => b && b.arabic).filter(Boolean))],
  nouns: ctx.nounsData.map((n) => n.arabic),
  adjectives: ctx.adjectivesData.map((a) => a.arabic),
  words: ctx.wordsData.map((w) => w.arabic),
};
out.count = Object.fromEntries(["verbs", "bab_forms", "nouns", "adjectives", "words"].map((k) => [k, out[k].length]));
out.normalized = [...new Set([...out.verbs.map((x) => x[0]), ...out.nouns, ...out.adjectives, ...out.words, ...out.bab_forms].map(norm))].length;
fs.mkdirSync("data/nibras", { recursive: true });
fs.writeFileSync("data/nibras/existing.json", JSON.stringify(out, null, 0).replace(/(\]|"),(\[|")/g, "$1,\n$2"));
console.log(out.source, out.count, out.max_id);
