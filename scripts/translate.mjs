// Gündəlik tərcümə: İbn Faris, «Məqayis əl-luğə» -> Azərbaycan dili (Gemini pulsuz mətn limiti).
// Növbəti tərcümə olunmamış maddələri götürür, limit (429) və ya vaxt həddində dayanır, state.json-da harada qaldığını saxlayır.
import fs from "node:fs";
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("GEMINI_API_KEY yoxdur");
const MODELS = (process.env.MODELS || "gemini-3.5-flash,gemini-flash-latest,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest").split(",");
const TIME_CAP = +(process.env.TIME_CAP_MIN || 45) * 60e3;
const MAX_BATCHES = +(process.env.MAX_BATCHES || 1e9);
const BATCH_CHARS = 6000, SPLIT_CHARS = 7000, GAP_MS = 6500;
const BOOK = "maqayis";
const rows = JSON.parse(fs.readFileSync("data/maqayis.json", "utf8")); // [kök, cild, səh_a, səh_b, mətn]
fs.mkdirSync(`out/${BOOK}`, { recursive: true });
const statePath = "state.json";
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { book: BOOK, total: rows.length, next: 0, done: 0, runs: [] };
const t0 = Date.now();
const dead = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYS = `Sən klassik ərəb dilçiliyi üzrə mütəxəssis tərcüməçisən. İbn Farisin «Məqayis əl-luğə» lüğətindən verilən maddələri ərəbcədən Azərbaycan dilinə tərcümə et.
Qaydalar:
- Sadiq, elmi, səlis Azərbaycan dili (latın əlifbası). Heç nə əlavə etmə, ixtisar etmə, uydurma; şərh yazma.
- Kökləri, baş sözləri, izah olunan ərəbcə sözləri və şeir beytlərini ərəb qrafikası ilə saxla, yanında mötərizədə və ya ardınca tərcüməsini ver. Məs.: «أطر» — ...; إطار (əhatə, çərçivə).
- Quran ayələri: ərəb mətnini saxla, ardınca «mənaca tərcümə: ...» ver.
- Hədis və şeir: ərəb mətnini saxla, ardınca mənasını ver.
- İnsanlar haqqında «yaratmaq» felini işlətmə (Allahın yaratması istisnadır).
- Ərəb hərflərinin adları: həmzə, kaf, lam və s. düzgün yazılsın.
- Haşiyə rəqəmlərini (٣) olduğu kimi saxla. Abzasları (\\n) qoru.
- Çıxış: yalnız JSON massiv [{"i": nömrə, "az": "tərcümə"}], hər giriş üçün bir element.`;

class Quota extends Error {}
async function call(model, items) {
  const prompt = items.map((x) => `### i=${x.i}\n${x.text}`).join("\n\n");
  const body = {
    systemInstruction: { parts: [{ text: SYS }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json",
      responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { i: { type: "INTEGER" }, az: { type: "STRING" } }, required: ["i", "az"] } } },
  };
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 240e3);
  let r;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body) });
  } finally { clearTimeout(to); }
  const txt = await r.text();
  if (r.status === 429) throw new Quota(`${model} 429`);
  if (r.status === 404 || r.status === 403) throw new Quota(`${model} ${r.status}`);
  if (!r.ok) throw new Error(`${model} ${r.status} ${txt.slice(0, 200)}`);
  const j = JSON.parse(txt);
  const out = j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text).join("") || "";
  const arr = JSON.parse(out);
  const m = new Map(arr.map((x) => [x.i, String(x.az || "").trim()]));
  for (const x of items) if (!m.get(x.i)) throw new Error(`${model}: i=${x.i} cavabsız`);
  return m;
}
async function translate(items) {
  for (const model of MODELS) {
    if (dead.has(model)) continue;
    for (let a = 0; a < 2; a++) {
      try { const m = await call(model, items); await sleep(GAP_MS); return { m, model }; }
      catch (e) {
        if (e instanceof Quota) { console.log("limit:", e.message); dead.add(model); break; }
        console.log("xəta:", String(e.message).slice(0, 200)); await sleep(15e3 * (a + 1));
      }
    }
  }
  return null;
}
function splitText(t) {
  const parts = []; let cur = "";
  for (const p of t.split("\n")) { if (cur && cur.length + p.length > SPLIT_CHARS) { parts.push(cur); cur = ""; } cur += (cur ? "\n" : "") + p; }
  if (cur) parts.push(cur);
  return parts;
}
const save = (i, az, model) => {
  const [root, vol, pa, pb, ar] = rows[i];
  fs.writeFileSync(`out/${BOOK}/${String(i).padStart(4, "0")}.json`, JSON.stringify({ i, book: "معجم مقاييس اللغة", author: "ابن فارس", root, source: { edition: "ت عبد السلام هارون", shamela: "https://shamela.ws/book/21710", vol, page_from: pa, page_to: pb }, ar, az, model, ts: new Date().toISOString() }, null, 1));
};
const writeState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 1));

let run = { date: new Date().toISOString(), from: state.next, entries: 0, calls: 0, models: {} , stop: "" };
let batches = 0;
while (state.next < rows.length) {
  if (Date.now() - t0 > TIME_CAP) { run.stop = "time"; break; }
  if (batches >= MAX_BATCHES) { run.stop = "max_batches"; break; }
  const i0 = state.next;
  let res, n;
  if (rows[i0][4].length > SPLIT_CHARS) { // uzun maddə hissə-hissə
    const parts = splitText(rows[i0][4]); const az = []; let model;
    for (let k = 0; k < parts.length; k++) { const r = await translate([{ i: k, text: parts[k] }]); if (!r) { res = null; break; } az.push(r.m.get(k)); model = r.model; res = r; }
    if (!res) { run.stop = "quota"; break; }
    save(i0, az.join("\n"), model); n = 1; run.calls += parts.length; run.models[model] = (run.models[model] || 0) + parts.length;
  } else {
    const items = []; let sz = 0; let i = i0;
    while (i < rows.length && rows[i][4].length <= SPLIT_CHARS && (items.length === 0 || sz + rows[i][4].length <= BATCH_CHARS)) { items.push({ i, text: `[${rows[i][0]}]\n${rows[i][4]}` }); sz += rows[i][4].length; i++; }
    res = await translate(items);
    if (!res) { run.stop = "quota"; break; }
    for (const x of items) save(x.i, res.m.get(x.i), res.model);
    n = items.length; run.calls++; run.models[res.model] = (run.models[res.model] || 0) + 1;
  }
  state.next += n; state.done = state.next; run.entries += n; batches++;
  writeState();
  console.log(`${state.next}/${rows.length} (${res?.model})`);
}
if (state.next >= rows.length) run.stop = "finished";
run.to = state.next; state.runs.push(run); writeState();
console.log(JSON.stringify(run));
