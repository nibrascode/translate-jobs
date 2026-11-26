// Nibras Arabic üçün gündəlik söz bazası: data/maqayis.json-dakı köklərdən ərəbcə söz + Azərbaycan dilində tərcümə.
// Hər kök üçün: I bab feli (keçmiş / indiki / əmr + tərcümələri), II–X bablardan işlənənlər (forma, təsrif, məna),
// məsdər / ism-fail / ism-məful, kökdən olan isimlər (tək + cəm) və sifətlər (kişi/qadın, cəm).
// Mərhələ 1: hər kökə işlənmə dərəcəsi (tier) verilir (data/nibras/root-tiers.json). Mərhələ 2: köklər tier-ə görə işlənir.
// Gündəlik limit (429/gün) bütün modellərdə bitəndə və ya vaxt həddində dayanır; gediş nibras-words-state.json-dadır.
import fs from "node:fs";
import { norm, rootFits, AR_LETTER, HAS_HARAKA, LAT, BABS } from "./nibras-lib.mjs";

const DRY = process.env.DRY_RUN === "1"; // Gemini-yə müraciət etmədən saxta cavabla sınaq
const KEY = process.env.WORDS_GEMINI_KEY || "";
if (!KEY && !DRY) throw new Error("WORDS_GEMINI_KEY yoxdur (workflow-da secrets.GEMINI_API_KEY_2)");
const MODELS = (process.env.MODELS || "gemini-4-hydrogen,gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash").split(",").filter(Boolean);
const TIME_CAP = +(process.env.TIME_CAP_MIN || 150) * 60e3;
const MAX_CALLS = +(process.env.MAX_CALLS || 1e9);
const ROOTS_PER_CALL = +(process.env.ROOTS_PER_CALL || 4);
const TIER_BATCH = +(process.env.TIER_BATCH || 250);
const MAX_TIER = +(process.env.MAX_TIER || 3); // 1 = çox işlənən … 3 = az işlənən; 0 = işlənməyən (atlanır)
const GAP_MS = DRY ? 0 : +(process.env.GAP_MS || 4000);
const THINK = process.env.THINK ?? "low";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null; // test üçün kök nömrələri
const DIR = "out/nibras/roots", TIERS = "data/nibras/root-tiers.json", statePath = "nibras-words-state.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const rows = JSON.parse(fs.readFileSync("data/maqayis.json", "utf8")); // [kök, cild, səh_a, səh_b, mətn]
const existing = JSON.parse(fs.readFileSync("data/nibras/existing.json", "utf8"));
fs.mkdirSync(DIR, { recursive: true });
const file = (i) => `${DIR}/${String(i).padStart(4, "0")}.json`;

// ---------- tətbiqdə artıq olanlar (təkrar olmasın) ----------
const known = new Map(); // norm(ərəbcə) -> mənbə
for (const [ar, hasBabs] of existing.verbs) known.set(norm(ar), { kind: "verb", ar, hasBabs });
for (const ar of existing.bab_forms) if (!known.has(norm(ar))) known.set(norm(ar), { kind: "bab", ar });
for (const k of ["nouns", "adjectives", "words"]) for (const ar of existing[k]) if (!known.has(norm(ar))) known.set(norm(ar), { kind: k, ar });
const appNorm = new Set(known.keys());
function appContext(root) {
  const verbs = existing.verbs.filter(([ar]) => !/\s/.test(ar) && rootFits(root, ar) && norm(ar).replace(/\s/g, "").length <= 6);
  const lex = [...existing.nouns, ...existing.adjectives, ...existing.words].filter((ar) => rootFits(root, ar)).slice(0, 25);
  return { verbs, lex };
}

// ---------- vəziyyət ----------
const tiers = fs.existsSync(TIERS) ? JSON.parse(fs.readFileSync(TIERS, "utf8")) : {};
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8"))
  : { job: "nibras-words", total_roots: rows.length, next_id: { verbs: 10001, nouns: 20001, adjectives: 30001 }, attempts: {}, runs: [] };
const writeState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
const writeTiers = () => fs.writeFileSync(TIERS, JSON.stringify(tiers).replace(/,"/g, ',\n"'));
const generated = new Set(); // bu işin artıq yazdığı sözlər
for (const f of fs.readdirSync(DIR)) {
  const e = JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8"));
  if (e.verb && !e.verb.in_app) generated.add(norm(e.verb.arabic));
  for (const n of [...(e.nouns || []), ...(e.adjectives || [])]) generated.add(norm(n.arabic));
}

// ---------- promptlar ----------
const STYLE = `Dil qaydaları:
- Azərbaycan dili, latın əlifbası; səlis, ədəbi. Türkiyə türkcəsi sözləri (değil, için, bölüm, dün və s.) yox; kiril yox.
- «yaratmaq» kökünü (yarat-, yaradıl-, yaran-) heç vaxt işlətmə; «xəlq etmək, əmələ gətirmək, düzəltmək» işlət.
- Əqidə (Əhli-sünnə, sələf mənhəci): Allahın sifətlərini bildirən sözləri təvilsiz ver (يد = əl, استوى = istiva etdi/ucaldı).
- Bütün ərəbcə sözlər TAM hərəkəli olsun (fəthə, kəsrə, zəmmə, sükun, şəddə, tənvin). İsim/sifət tənvinli tək halda: كِتَابٌ.`;

const SYS_TIER = `Sən ərəb dilçisisən. Kök siyahısı verilir (İbn Farisin «Məqayis əl-luğə» lüğətinin maddə başlıqları). Hər kök üçün bu kökdən olan sözlərin müasir ədəbi ərəb dilində (MSA) və Quran/hədis dilində nə qədər işləndiyini qiymətləndir:
1 = çox işlənən, gündəlik və ya Quranda tez-tez (məs. كتب، علم، قول، ذهب)
2 = orta işlənən, savadlı oxucunun bildiyi
3 = az işlənən, amma sözlüklərdə canlı söz var
0 = köhnəlmiş/nadir, ərəb dili öyrənən üçün faydalı söz yoxdur
Çıxış: yalnız JSON massiv [{"i":nömrə,"t":0..3}], hər kök üçün bir element.`;

const SYS_WORDS = `Sən ərəb dili müəllimi və leksikoqrafsan; «Nibras Arabic» adlı ərəbcə öyrənmə tətbiqi (Azərbaycan dilli istifadəçilər) üçün söz bazası hazırlayırsan.
Hər kök üçün ver:
1) verb: kökün əsas I bab feli (mücərrəd sülasi), müasir/Quran dilində həqiqətən işlənirsə. Yoxdursa has_verb:false.
   - arabic: keçmiş zaman, 3-cü şəxs kişi təki (كَتَبَ); present_ar: indiki zaman (يَكْتُبُ); imperative_ar: əmr (اُكْتُبْ; zəif köklərdə düzgün forma: قُلْ، قِفْ، اِرْمِ، كُلْ).
   - meaning: məsdər formasında (yazmaq); past_tr: «yazdı»; present_tr: «yazır»; imperative_tr: «yaz!».
   - in_app:true yalnız bu fel aşağıda «tətbiqdə var» siyahısındadırsa (onda yazılışı oradakı kimi eyni olsun).
2) babs: bu kökdən həqiqətən işlənən bablar (I daxil, I həmişə olsun əgər fel varsa). Mexaniki qəlibdən məna uydurma: lüğətdə olmayan bab yazma.
   Hər bab: bab ("I".."X"), arabic (keçmiş 3-cü şəxs kişi təki), present_ar, imperative_ar (əmri işlənmirsə ""), meaning (keçmiş zamanda, məs. «yazışdı», «öyrətdi»),
   masdar + masdar_meaning, fail (ism-fail) + fail_meaning, maful (ism-məful; təsirsiz feldə "") + maful_meaning.
   Fel tətbiqdə var və «bab məlumatı var» deyilibsə babs:[] qaytar.
3) nouns: kökdən çox işlənən isimlər (ən çox 6; məsdər və ism-fail/məful da isim kimi işlənirsə ola bilər). Hər biri: arabic (tək), meaning, plural_ar (cəm; bir neçə cəm varsa ən işləkini, digərlərini « / » ilə), plural_meaning, example_ar (qısa, hərəkəli cümlə), example_az.
   Cəmi olmayan isim (mücərrəd məsdər) üçün plural_ar:"" yaz.
4) adjectives: kökdən çox işlənən sifətlər (ən çox 4): arabic (kişi), feminine, plural_ar, plural_meaning, feminine_plural_ar, feminine_plural_meaning, meaning, example_m_ar, example_m_az (hüvə ilə: «O (kişi) ...»), example_f_ar, example_f_az (hiyə ilə: «O (qadın) ...»).
Tətbiqdə artıq olan sözləri (siyahıda verilir) nouns/adjectives-ə təkrar yazma. Sözlər sadə və doğru olsun, şübhəli sözü yazma. Kökdən faydalı söz yoxdursa boş massivlər qaytar.
${STYLE}
Çıxış: yalnız JSON massiv, hər kök üçün bir element (sxemə uyğun).`;

const S = { type: "STRING" };
const BAB_SCHEMA = { type: "OBJECT", properties: Object.fromEntries(["bab", "arabic", "present_ar", "imperative_ar", "meaning", "masdar", "masdar_meaning", "fail", "fail_meaning", "maful", "maful_meaning"].map((k) => [k, S])), required: ["bab", "arabic", "present_ar", "meaning", "masdar", "masdar_meaning", "fail", "fail_meaning"] };
const NOUN_KEYS = ["arabic", "meaning", "plural_ar", "plural_meaning", "example_ar", "example_az"];
const ADJ_KEYS = ["arabic", "feminine", "plural_ar", "plural_meaning", "feminine_plural_ar", "feminine_plural_meaning", "meaning", "example_m_ar", "example_m_az", "example_f_ar", "example_f_az"];
const VERB_KEYS = ["arabic", "meaning", "past_tr", "present_ar", "present_tr", "imperative_ar", "imperative_tr"];
const obj = (keys, req = keys) => ({ type: "OBJECT", properties: Object.fromEntries(keys.map((k) => [k, S])), required: req });
const WORDS_SCHEMA = { type: "ARRAY", items: { type: "OBJECT", properties: {
  i: { type: "INTEGER" }, has_verb: { type: "BOOLEAN" },
  verb: { type: "OBJECT", properties: { ...obj(VERB_KEYS).properties, in_app: { type: "BOOLEAN" } } },
  babs: { type: "ARRAY", items: BAB_SCHEMA },
  nouns: { type: "ARRAY", items: obj(NOUN_KEYS) },
  adjectives: { type: "ARRAY", items: obj(ADJ_KEYS) },
}, required: ["i", "has_verb", "babs", "nouns", "adjectives"] } };
const TIER_SCHEMA = { type: "ARRAY", items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, t: { type: "INTEGER" } }, required: ["i", "t"] } };

// ---------- Gemini (review.mjs üslubu: model siyahısı, gündəlik limitdə növbəti model) ----------
class Quota extends Error {}
class Busy extends Error {}
let mockCalls = 0;
async function call(model, sys, prompt, schema) {
  if (DRY) {
    mockCalls++;
    if (process.env.MOCK_QUOTA_AFTER && mockCalls > +process.env.MOCK_QUOTA_AFTER) throw new Quota(`${model} 429/gün (mock)`);
    return (await import("./words-mock.mjs")).mock(sys === SYS_TIER ? "tier" : "words", prompt);
  }
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 65536, ...(THINK ? { thinkingConfig: { thinkingLevel: THINK } } : {}), responseMimeType: "application/json", responseSchema: schema },
  };
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 300e3);
  let r, txt;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body) });
    txt = await r.text();
  } finally { clearTimeout(to); }
  if (r.status === 429) { if (/PerDay|per day|quota/i.test(txt) && !/PerMinute/i.test(txt)) throw new Quota(`${model} 429/gün`); throw new Busy(`${model} 429/dəq`); }
  if (r.status === 404 || r.status === 403) throw new Quota(`${model} ${r.status}`);
  if (r.status >= 500) throw new Busy(`${model} ${r.status}`);
  if (!r.ok) throw new Error(`${model} ${r.status} ${txt.slice(0, 200)}`);
  const j = JSON.parse(txt);
  const out = j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text).join("") || "";
  if (!out) throw new Error(`${model}: boş cavab (${j.candidates?.[0]?.finishReason})`);
  return JSON.parse(out);
}
const dead = new Set();
async function ask(sys, prompt, schema) {
  for (const model of MODELS) {
    if (dead.has(model)) continue;
    for (let a = 0; a < 3; a++) {
      try { const res = await call(model, sys, prompt, schema); if (!Array.isArray(res)) throw new Error("massiv deyil"); await sleep(GAP_MS); return { res, model }; }
      catch (e) {
        const msg = String(e.message).slice(0, 200);
        if (e instanceof Quota) { console.log("limit:", msg); dead.add(model); break; }
        console.log("xəta:", msg); await sleep(DRY ? 0 : (e instanceof Busy ? 30e3 : 10e3) * (a + 1));
        if (e.name === "AbortError" && a >= 1) break;
      }
    }
  }
  return null; // bütün modellərdə gündəlik limit bitib
}

// ---------- yoxlama ----------
const isAr = (s) => typeof s === "string" && AR_LETTER.test(s) && HAS_HARAKA.test(s) && !LAT.test(s);
const isAz = (s) => typeof s === "string" && LAT.test(s) && !AR_LETTER.test(s) && !/[\u0400-\u04ff]/.test(s) && !/yarat|yaradıl|yaran/i.test(s);
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
function checkVerb(root, v) {
  for (const k of VERB_KEYS) v[k] = clean(v[k]);
  for (const k of ["arabic", "present_ar", "imperative_ar"]) if (!isAr(v[k])) return `fel.${k} ərəbcə/hərəkəli deyil`;
  for (const k of ["meaning", "past_tr", "present_tr", "imperative_tr"]) if (!isAz(v[k])) return `fel.${k} pis (${v[k]})`;
  if (!/(maq|mək)\b/.test(v.meaning)) return `fel.meaning məsdər deyil (${v.meaning})`;
  if (!v.imperative_tr.endsWith("!")) v.imperative_tr += "!";
  if (!rootFits(root, v.arabic)) return `fel kökə uyğun deyil (${v.arabic} / ${root})`;
  return "";
}
function checkBab(root, b) {
  for (const k of BAB_SCHEMA.required.concat(["imperative_ar", "maful", "maful_meaning"])) b[k] = clean(b[k]);
  if (!BABS.includes(b.bab)) return `bab kodu (${b.bab})`;
  for (const k of ["arabic", "present_ar", "masdar", "fail"]) if (!isAr(b[k])) return `bab ${b.bab}.${k}`;
  for (const k of ["imperative_ar", "maful"]) if (b[k] && !isAr(b[k])) return `bab ${b.bab}.${k}`;
  for (const k of ["meaning", "masdar_meaning", "fail_meaning"]) if (!isAz(b[k])) return `bab ${b.bab}.${k} (${b[k]})`;
  if (b.maful && !isAz(b.maful_meaning)) return `bab ${b.bab}.maful_meaning`;
  if (!rootFits(root, b.arabic)) return `bab ${b.bab} kökə uyğun deyil (${b.arabic})`;
  return "";
}
function checkLex(root, x, keys, arKeys, optional = []) {
  for (const k of keys) x[k] = clean(x[k]);
  for (const k of keys) {
    if (optional.includes(k) && !x[k]) continue;
    if (arKeys.includes(k) ? !isAr(x[k]) : !isAz(x[k])) return `${k} (${x[k]})`;
  }
  if (!rootFits(root, x.arabic)) return `kökə uyğun deyil (${x.arabic})`;
  return "";
}

// ---------- işçi ----------
const run = { date: new Date().toISOString(), calls: 0, tiers: 0, roots: 0, verbs: 0, babs: 0, nouns: 0, adjectives: 0, rejected: 0, models: {}, stop: "" };
const timeUp = () => Date.now() - t0 > TIME_CAP;

async function tierPhase() {
  const todo = rows.map((r, i) => i).filter((i) => tiers[i] === undefined && (!ONLY || ONLY.includes(i)));
  for (let p = 0; p < todo.length; p += TIER_BATCH) {
    if (timeUp()) return (run.stop = "time");
    if (run.calls >= MAX_CALLS) return (run.stop = "max_calls");
    const batch = todo.slice(p, p + TIER_BATCH);
    run.calls++;
    const r = await ask(SYS_TIER, batch.map((i) => `${i}: ${rows[i][0]}`).join("\n"), TIER_SCHEMA);
    if (!r) return (run.stop = "quota");
    run.models[r.model] = (run.models[r.model] || 0) + 1;
    for (const x of r.res) if (batch.includes(x.i) && [0, 1, 2, 3].includes(x.t)) { tiers[x.i] = x.t; run.tiers++; }
    writeTiers();
    console.log(`tier: ${Object.keys(tiers).length}/${rows.length} (${r.model})`);
  }
}

function rootPrompt(i) {
  const root = rows[i][0];
  const { verbs, lex } = appContext(root);
  const lines = [`### i=${i}  kök: ${root}`];
  if (verbs.length) lines.push("Tətbiqdə var (fellər): " + verbs.map(([ar, hb]) => `${ar} (bab məlumatı ${hb ? "var" : "yoxdur"})`).join(", "));
  if (lex.length) lines.push("Tətbiqdə var (isim/sifət): " + lex.join("، "));
  // Məqayis mətnindən qısa parça — kökün əsas mənasını göstərmək üçün
  lines.push("Məqayis (əsas məna): " + String(rows[i][4]).replace(/\s+/g, " ").slice(0, 300));
  return lines.join("\n");
}

function saveRoot(i, res, model) {
  const root = rows[i][0];
  const out = { i, root, tier: tiers[i], model, ts: new Date().toISOString(), verb: null, babs: [], nouns: [], adjectives: [], rejected: [] };
  const rej = (what, why) => { out.rejected.push(`${what}: ${why}`); run.rejected++; };
  let verbKey = null; // BAB_MEANING_OVERRIDES açarı (tətbiqdəki dəqiq yazılış)
  if (res.has_verb && res.verb) {
    const v = res.verb;
    const bad = checkVerb(root, v);
    if (bad) return bad; // fel səhvdirsə bütün kök yenidən soruşulur
    const k = known.get(norm(v.arabic));
    if (k && k.kind === "verb") { v.in_app = true; v.app_arabic = k.ar; verbKey = k.ar; if (k.hasBabs) res.babs = []; }
    else if (k || generated.has(norm(v.arabic))) { v.in_app = true; v.app_arabic = k?.ar || v.arabic; verbKey = null; res.babs = []; } // başqa yerdə var: təkrar etmə
    else { v.in_app = false; v.id = state.next_id.verbs++; verbKey = v.arabic; generated.add(norm(v.arabic)); run.verbs++; }
    out.verb = v;
  }
  const seenBab = new Set();
  for (const b of verbKey ? res.babs || [] : []) {
    const bad = checkBab(root, b);
    if (bad) { rej("bab", bad); continue; }
    if (seenBab.has(b.bab)) continue;
    seenBab.add(b.bab); out.babs.push(b); run.babs++;
  }
  if (out.babs.length && !seenBab.has("I") && out.verb) rej("bab", "I bab yoxdur");
  out.bab_key = verbKey && out.babs.length ? verbKey : null;
  for (const n of res.nouns || []) {
    const bad = checkLex(root, n, NOUN_KEYS, ["arabic", "plural_ar", "example_ar"], ["plural_ar", "plural_meaning"]);
    if (bad) { rej(`isim ${n.arabic}`, bad); continue; }
    if (n.plural_ar && !n.plural_meaning) { rej(`isim ${n.arabic}`, "cəm mənası yoxdur"); continue; }
    if (appNorm.has(norm(n.arabic)) || generated.has(norm(n.arabic))) { rej(`isim ${n.arabic}`, "təkrar"); continue; }
    n.id = state.next_id.nouns++; generated.add(norm(n.arabic)); out.nouns.push(n); run.nouns++;
  }
  for (const a of res.adjectives || []) {
    const bad = checkLex(root, a, ADJ_KEYS, ["arabic", "feminine", "plural_ar", "feminine_plural_ar", "example_m_ar", "example_f_ar"]);
    if (bad) { rej(`sifət ${a.arabic}`, bad); continue; }
    if (appNorm.has(norm(a.arabic)) || generated.has(norm(a.arabic))) { rej(`sifət ${a.arabic}`, "təkrar"); continue; }
    a.id = state.next_id.adjectives++; generated.add(norm(a.arabic)); out.adjectives.push(a); run.adjectives++;
  }
  if (!out.rejected.length) delete out.rejected;
  fs.writeFileSync(file(i), JSON.stringify(out, null, 1));
  delete state.attempts[i];
  run.roots++;
  return "";
}
function fail(i, why) {
  state.attempts[i] = (state.attempts[i] || 0) + 1;
  console.log(`rədd i=${i} (${rows[i][0]}): ${why}`);
  if (state.attempts[i] >= 3) { fs.writeFileSync(file(i), JSON.stringify({ i, root: rows[i][0], tier: tiers[i], failed: true, error: why, ts: new Date().toISOString() }, null, 1)); delete state.attempts[i]; }
}

async function wordsPhase() {
  // 3 keçid: rədd edilən köklər (attempts < 3) eyni run-da yenidən soruşulur
  for (let pass = 0; pass < 3 && !run.stop; pass++) if (!(await wordsPass())) break;
  run.stop ||= "queue_empty";
}
async function wordsPass() {
  const todo = rows.map((r, i) => i)
    .filter((i) => tiers[i] >= 1 && tiers[i] <= MAX_TIER && !fs.existsSync(file(i)) && (!ONLY || ONLY.includes(i)))
    .sort((a, b) => tiers[a] - tiers[b] || a - b);
  console.log(`növbədə kök: ${todo.length}`);
  if (!todo.length) return false;
  for (let p = 0; p < todo.length; p += ROOTS_PER_CALL) {
    if (timeUp()) return (run.stop = "time");
    if (run.calls >= MAX_CALLS) return (run.stop = "max_calls");
    const batch = todo.slice(p, p + ROOTS_PER_CALL);
    run.calls++;
    const t1 = Date.now();
    const r = await ask(SYS_WORDS, batch.map(rootPrompt).join("\n\n"), WORDS_SCHEMA);
    if (!r) return (run.stop = "quota");
    run.models[r.model] = (run.models[r.model] || 0) + 1;
    const m = new Map(r.res.map((x) => [x.i, x]));
    for (const i of batch) {
      const res = m.get(i);
      if (!res) { fail(i, "cavabda yoxdur"); continue; }
      let bad;
      try { bad = saveRoot(i, res, r.model); } catch (e) { bad = "xəta: " + e.message; }
      if (bad) fail(i, bad);
    }
    writeState();
    console.log(`[${batch.map((i) => rows[i][0]).join(" ")}] ${r.model} ${((Date.now() - t1) / 1e3).toFixed(0)}s (bu run: ${run.roots} kök, ${run.verbs} fel, ${run.nouns} isim, ${run.adjectives} sifət)`);
  }
  return true;
}

await tierPhase();
if (!run.stop) await wordsPhase();
const files = fs.readdirSync(DIR);
state.done_roots = files.length;
state.queue_roots = rows.filter((r, i) => tiers[i] >= 1 && tiers[i] <= MAX_TIER).length;
state.tiered = Object.keys(tiers).length;
state.runs.push(run); writeState();
console.log(JSON.stringify(run), `cəmi: ${state.done_roots}/${state.queue_roots} kök (tier: ${state.tiered}/${rows.length})`);
