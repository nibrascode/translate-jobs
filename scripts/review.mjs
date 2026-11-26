// Güclü model ilə yoxlama: hər maddənin az tərcüməsini ərəbcə mətnlə tutuşdurur, səhv varsa düzəldir.
// Davam edən iş: hər maddədə reviewed:true qeyd olunur; ümumi gediş review-state.json-dadır.
import fs from "node:fs";
// GEMINI_API_KEY_2 artıq words-nibras işinə ayrılıb; yoxlama yalnız GEMINI_API_KEY ilə işləyir.
const KEYS = [process.env.GEMINI_API_KEY].filter(Boolean);
if (!KEYS.length) throw new Error("GEMINI_API_KEY yoxdur");
const MODELS = (process.env.MODELS || "gemini-4-hydrogen,gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash").split(",");
const TIME_CAP = +(process.env.TIME_CAP_MIN || 100) * 60e3;
const MAX_CALLS = +(process.env.MAX_CALLS || 1e9);
const BATCH_AR = +(process.env.BATCH_AR || 3500), BATCH_MAX = 10, GAP_MS = 4000;
const THINK = process.env.THINK ?? "medium"; // low|medium|high, boş = model defoltu
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null; // test üçün
const DIR = "out/maqayis";
const RETRANSLATE = new Set([207, 329, 1056, 1445, 2184, 2684, 4291]); // məlum yarımçıq/qısa maddələr
const statePath = "review-state.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const file = (i) => `${DIR}/${String(i).padStart(4, "0")}.json`;
const load = (i) => JSON.parse(fs.readFileSync(file(i), "utf8"));
const total = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).length;

const RULES = `Üslub və məzmun qaydaları:
- Azərbaycan dili, latın əlifbası; sadiq, elmi, səlis. Türkiyə türkcəsi sözləri (bölüm, değil, için və s.) yox.
- Format: tərcümə «[kök]» ilə başlayır. Baş sözlər və izah olunan ərəbcə sözlər ərəb qrafikası ilə qalır, yanında mötərizədə Azərbaycan dilində mənası: məs. إطار (çərçivə, əhatə).
- Şeir beytləri, hədislər, atalar sözləri: ərəb mətni saxlanılır VƏ ardınca mötərizədə Azərbaycan dilində mənası verilir. Tərcüməsiz qalmış ərəbcə cümlə/beyt səhvdir.
- Quran ayələri: ərəb mətni + «mənaca tərcümə: ...».
- Ərəbcə sitatları (baş sözlər, beytlər, hədislər, ayələr) AR-dakı yazılışla eyni köçür: hərəkə əlavə etmə, silmə, dəyişmə.
- Heç nə ixtisar etmə, əlavə şərh yazma, uydurma. Haşiyə rəqəmlərini (٣) ərəb rəqəmi ilə olduğu kimi saxla. Abzas bölgüsü AR-dakı kimi olmalıdır (sətir sonu \\n); abzasların itməsi kiçik qüsurdur, yalnız bunun üçün ok:false vermə, amma düzəltdiyin tərcümədə abzasları AR-dakı kimi qoy.
- Ərəb hərflərinin adları düzgün: ء həmzə, ب ba, ت ta, ث sa, ج cim, ح ha, خ xa, د dal, ذ zal, ر ra, ز zey, س sin, ش şin, ص sad, ض dad, ط ta, ظ za, ع ayn, غ ğayn, ف fa, ق qaf, ك kaf, ل lam, م mim, ن nun, ه hə, و vav, ي ya. Mövcud tərcümədəki ənənəvi variantları (məs. «fə», «hə») səhv sayma.
- «yaratmaq» kökünü (yarat-, yaradıl-) işlətmə; «xəlq etmək, əmələ gətirmək» işlət. «İrab» yox, «Erab» yaz.
- Əqidə (Əhli-sünnə, sələf mənhəci): Allahın sifətlərini (əl, üz, göz, istiva, nüzul, gəlmək, razı olmaq, qəzəb və s.) olduğu kimi, təvilsiz, təşbihsiz, tətilsiz ver (məs. يد = əl, استوى على العرش = Ərşə istiva etdi/ucaldı; «hakim oldu, qüdrət» kimi təvil yox). «لن» inkarını «əbədi inkar» kimi vermə, sadəcə gələcək zaman inkarı kimi ver (əbədi/heç vaxt sözlərini əlavə etmə).
- ﵌ / صلى الله عليه وسلم = «sallallahu aleyhi və səlləm».`;

const SYS_REVIEW = `Sən klassik ərəb dilçiliyi üzrə mütəxəssis redaktorsan. İbn Farisin «Məqayis əl-luğə» lüğətindən maddələrin ərəbcə mətni (AR) və mövcud Azərbaycan dilinə tərcüməsi (AZ) verilir.
Hər maddəni cümlə-cümlə tutuşdur və real səhvləri tap: yanlış tərcümə/məna, buraxılmış (ixtisar edilmiş, yarımçıq kəsilmiş) hissə, tərcüməsiz qalmış ərəbcə hissə, şeir/hədis/ayənin səhv mənası, artıq uydurma əlavə, qarışıq/təkrarlanan/pozulmuş mətn, səhv hərf adı, aşağıdakı qaydaların pozulması.
${RULES}
Qərar:
- Tərcümə tam və düzgündürsə (yalnız kiçik üslub fərqləri varsa) — ok:true, issues:[], az:"".
- Real səhv varsa — ok:false, issues: qısa siyahı (Azərbaycan dilində, hər biri bir cümlə), az: BÜTÜN maddənin düzəldilmiş TAM tərcüməsi (yalnız düzəldilən hissə yox). Düzgün hissələri mümkün qədər saxla.
Çıxış: yalnız JSON massiv [{"i":nömrə,"ok":bool,"issues":[...],"az":"..."}], hər maddə üçün bir element.`;

const SYS_RETR = `Sən klassik ərəb dilçiliyi üzrə mütəxəssis tərcüməçisən. İbn Farisin «Məqayis əl-luğə» lüğətindən maddənin ərəbcə mətni (AR) və mövcud qüsurlu (yarımçıq/qısa) tərcüməsi (AZ) verilir. Mövcud tərcümə etibarsızdır: maddəni əvvəldən sona TAM yenidən tərcümə et, heç bir cümlə, beyt və ya hədisi buraxma.
${RULES}
Çıxış: yalnız JSON massiv [{"i":nömrə,"ok":false,"issues":["Mövcud tərcümə yarımçıq idi; tam yenidən tərcümə edildi", ...],"az":"tam tərcümə"}].`;

const letters = (s, re) => (s.match(re) || []).length;
const LAT = /[a-zA-ZəƏıİöÖüÜçÇşŞğĞ]/g, AR = /[\u0600-\u06ff]/g;
function fixStyle(az) {
  return az.replace(/İ['ʻ’`]?rab/g, "Erab").replace(/(^|[^a-zəıöüçşğ])i['ʻ’`]?rab/g, "$1erab").trim();
}
function invalid(entry, az, retr) {
  if (!az) return "boş az";
  if (letters(az, LAT) < 0.5 * letters(az, AR)) return "tərcümə olunmayıb";
  if (/yarat/i.test(az)) return "«yarat» sözü";
  if (/[\u0400-\u04ff]/.test(az)) return "kiril hərfi";
  const prev = entry.az.length, ar = entry.ar.length;
  // əvvəlkindən xeyli qısa ola bilməz (əvvəlki özü qısa/yarımçıq deyilsə)
  if (!retr && az.length < 0.85 * prev && az.length < 1.3 * ar) return `qısa (${az.length} < ${prev})`;
  if (retr && az.length < 1.0 * ar) return `yenidən tərcümə qısadır (${az.length}/${ar})`;
  if (!az.startsWith("[")) return "«[kök]» ilə başlamır";
  return "";
}
class Quota extends Error {}
class Busy extends Error {}
async function call(model, key, items, retr) {
  const prompt = items.map((x) => `### i=${x.i}\nAR:\n[${x.root}]\n${x.ar}\n\nAZ:\n${x.az}`).join("\n\n");
  const body = {
    systemInstruction: { parts: [{ text: retr ? SYS_RETR : SYS_REVIEW }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 65536, ...(THINK ? { thinkingConfig: { thinkingLevel: THINK } } : {}), responseMimeType: "application/json",
      responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, ok: { type: "BOOLEAN" }, issues: { type: "ARRAY", items: { type: "STRING" } }, az: { type: "STRING" } }, required: ["i", "ok", "issues", "az"] } } },
  };
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 420e3);
  let r, txt;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
    txt = await r.text();
  } finally { clearTimeout(to); }
  if (r.status === 429) { if (/PerDay|per day|quota/i.test(txt) && !/PerMinute/i.test(txt)) throw new Quota(`${model} 429/gün`); throw new Busy(`${model} 429/dəq`); }
  if (r.status === 404 || r.status === 403) throw new Quota(`${model} ${r.status}`);
  if (r.status >= 500) throw new Busy(`${model} ${r.status}`);
  if (!r.ok) throw new Error(`${model} ${r.status} ${txt.slice(0, 200)}`);
  const j = JSON.parse(txt);
  const out = j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text).join("") || "";
  if (!out) throw new Error(`${model}: boş cavab (${j.candidates?.[0]?.finishReason})`);
  return new Map(JSON.parse(out).map((x) => [x.i, x]));
}
const dead = new Set(); // "model|açar"
async function review(items, retr) {
  for (const model of MODELS) {
    for (let k = 0; k < KEYS.length; k++) {
      const id = `${model}|${k}`;
      if (dead.has(id)) continue;
      for (let a = 0; a < 3; a++) {
        try { const m = await call(model, KEYS[k], items, retr); await sleep(GAP_MS); return { m, model }; }
        catch (e) {
          const msg = String(e.message).slice(0, 200);
          if (e instanceof Quota) { console.log("limit:", msg, "açar", k); dead.add(id); break; }
          console.log("xəta:", msg); await sleep((e instanceof Busy ? 30e3 : 10e3) * (a + 1));
          if (e.name === "AbortError" && a >= 1) break;
        }
      }
    }
  }
  return null;
}

const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { book: "maqayis", total, reviewed: 0, changed: 0, failed: 0, runs: [] };
const writeState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1));
function recount() {
  let rv = 0, ch = 0, fl = 0;
  for (let i = 0; i < total; i++) { const e = load(i); if (e.reviewed) rv++; if (e.prev_az) ch++; if (!e.reviewed && (e.review_attempts || 0) >= 3) fl++; }
  Object.assign(state, { total, reviewed: rv, changed: ch, failed: fl });
}

// növbə: əvvəl məlum qüsurlular, sonra şübhəli (qısa) olanlar, sonra qalanı sırayla
const todo = [];
for (let i = 0; i < total; i++) {
  if (ONLY && !ONLY.includes(i)) continue;
  const e = load(i);
  if (e.reviewed || (e.review_attempts || 0) >= 3) continue;
  const pri = RETRANSLATE.has(i) ? 0 : e.az.length < 0.9 * e.ar.length ? 1 : 2;
  todo.push({ i, pri });
}
todo.sort((a, b) => a.pri - b.pri || a.i - b.i);
console.log(`növbədə: ${todo.length}`);

const run = { date: new Date().toISOString(), calls: 0, reviewed: 0, changed: 0, models: {}, stop: "" };
const saveResult = (i, res, model, retr) => {
  const e = load(i);
  const issues = (res.issues || []).map(String).filter(Boolean);
  if (res.ok === false && res.az) {
    const az = fixStyle(String(res.az));
    const bad = invalid(e, az, retr);
    if (bad) return bad;
    if (az !== e.az) { e.prev_az = e.az; e.prev_model = e.model; e.az = az; run.changed++; }
  }
  Object.assign(e, { reviewed: true, review_model: model, review_ok: res.ok !== false, review_issues: issues, review_ts: new Date().toISOString() });
  delete e.review_attempts;
  fs.writeFileSync(file(i), JSON.stringify(e, null, 1));
  run.reviewed++;
  return "";
};
const fail = (i, why) => { const e = load(i); e.review_attempts = (e.review_attempts || 0) + 1; e.review_last_error = why; fs.writeFileSync(file(i), JSON.stringify(e, null, 1)); console.log(`rədd i=${i}: ${why}`); };

let p = 0;
const CONC = +(process.env.CONCURRENCY || 2);
async function worker() {
  while (p < todo.length && !run.stop) {
    if (Date.now() - t0 > TIME_CAP) { run.stop = "time"; break; }
    if (run.calls >= MAX_CALLS) { run.stop = "max_calls"; break; }
    const first = load(todo[p].i), retr = todo[p].pri === 0;
    const batch = [{ i: todo[p].i, root: first.root, ar: first.ar, az: first.az }]; let sz = first.ar.length; p++;
    while (!retr && p < todo.length && todo[p].pri !== 0 && batch.length < BATCH_MAX) {
      const e = load(todo[p].i);
      if (sz + e.ar.length > BATCH_AR) break;
      batch.push({ i: todo[p].i, root: e.root, ar: e.ar, az: e.az }); sz += e.ar.length; p++;
    }
    run.calls++;
    const t1 = Date.now();
    const r = await review(batch, retr);
    if (!r) { run.stop = "quota"; break; }
    run.models[r.model] = (run.models[r.model] || 0) + 1;
    for (const x of batch) {
      const res = r.m.get(x.i);
      if (!res) { fail(x.i, "cavabda yoxdur"); continue; }
      const bad = saveResult(x.i, res, r.model, retr);
      if (bad) fail(x.i, bad);
      else if (res.ok === false) console.log(`  düzəldildi i=${x.i}: ${(res.issues || []).join(" | ").slice(0, 300)}`);
    }
    console.log(`[${batch.map((x) => x.i).join(",")}] ${r.model} ${((Date.now() - t1) / 1e3).toFixed(0)}s  (bu run: ${run.reviewed} yoxlandı, ${run.changed} düzəldi)`);
  }
}
await Promise.all(Array.from({ length: CONC }, (_, k) => sleep(k * 5000).then(worker)));
if (p >= todo.length && !run.stop) run.stop = "queue_empty";
recount();
if (state.reviewed >= total) run.stop = "finished";
state.runs.push(run); writeState();
console.log(JSON.stringify(run), `cəmi: ${state.reviewed}/${total}, düzəldilən: ${state.changed}`);
