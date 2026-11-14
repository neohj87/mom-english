// 매일 새 수업 하나를 Gemini로 만들어 data/lessons.json 에 추가합니다.
// 사용법:  GEMINI_API_KEY=... node scripts/generate.mjs
// 옵션 환경변수:
//   GEMINI_MODEL   사용할 모델 (기본 gemini-2.5-flash)
//   FORCE=1        오늘 수업이 이미 있어도 하나 더 만듦
//   DRY_RUN=1      API 호출 없이 프롬프트만 출력
//   MOCK_FILE=x    API 대신 이 JSON 파일을 응답으로 사용 (테스트용)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CUR_PATH = path.join(ROOT, "data/curriculum.json");
const LES_PATH = path.join(ROOT, "data/lessons.json");
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SENTENCES = 6, WORDS = 5;

const cur = JSON.parse(fs.readFileSync(CUR_PATH, "utf8"));
const db = JSON.parse(fs.readFileSync(LES_PATH, "utf8"));

// 한국 날짜 (YYYY-MM-DD)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

if (!process.env.FORCE && db.lessons.some(l => l.date === today)) {
  console.log(`오늘(${today}) 수업이 이미 있어요. 건너뜁니다.`);
  process.exit(0);
}

// 다음 단계 고르기: 수업 수가 가장 적은 단계, 같으면 앞 단계부터
function pickStep() {
  const count = Object.fromEntries(cur.steps.map(s => [s.step, 0]));
  for (const l of db.lessons) if (l.step in count) count[l.step]++;
  return cur.steps.reduce((best, s) => (count[s.step] < count[best.step] ? s : best), cur.steps[0]);
}
const step = pickStep();
const level = cur.levels[String(step.level)];

const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const usedSentences = new Set(db.lessons.flatMap(l => l.sentences.map(s => norm(s.en))));
const usedWords = new Set(db.lessons.flatMap(l => l.words.map(w => norm(w.en))));
const sameStep = db.lessons.filter(l => l.step === step.step).flatMap(l => l.sentences.map(s => s.en));
const recent = db.lessons.slice(-8).flatMap(l => l.sentences.map(s => s.en));

const prompt = `You write English lessons for a Korean mother in her 50s-60s who is a beginner.
She studies on her phone, a few minutes a day. Content must be practical, warm and correct.

Today's lesson
- Topic (Korean): ${step.topic}
- Focus: ${step.focus}
- Level ${step.level} "${level.name}": ${level.guide}

Write exactly ${SENTENCES} useful sentences and ${WORDS} useful words for this topic.

Rules
- "en": natural American English she would really say or hear. No slang, no names of brands.
- "ko": natural Korean meaning (polite 해요체 unless talking to a child or family).
- "pr": how the English sounds, written in Hangul, the way Korean learners write it
  (e.g. "How are you?" -> "하우 아 유?", "I'd like a cup of coffee." -> "아이드 라이커 컵 오브 커피").
  Follow natural linking sounds. Keep punctuation (? .) like the English.
- Words: "ex" is a short example sentence using the word at the same level, "exKo" its Korean meaning.
- "title": a short Korean lesson title (max 14 characters) that names today's theme.
- Do NOT repeat any of these sentences:
${[...new Set([...sameStep, ...recent])].map(s => "  * " + s).join("\n") || "  (none)"}
- Do NOT reuse these words: ${[...usedWords].join(", ") || "(none)"}`;

const schema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    sentences: { type: "ARRAY", items: { type: "OBJECT", properties: {
      en: { type: "STRING" }, ko: { type: "STRING" }, pr: { type: "STRING" } }, required: ["en", "ko", "pr"] } },
    words: { type: "ARRAY", items: { type: "OBJECT", properties: {
      en: { type: "STRING" }, ko: { type: "STRING" }, pr: { type: "STRING" },
      ex: { type: "STRING" }, exKo: { type: "STRING" } }, required: ["en", "ko", "pr", "ex", "exKo"] } },
  },
  required: ["title", "sentences", "words"],
};

if (process.env.DRY_RUN) { console.log(prompt); process.exit(0); }

async function callGemini() {
  if (process.env.MOCK_FILE) return JSON.parse(fs.readFileSync(process.env.MOCK_FILE, "utf8"));
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 가 없어요. GitHub 저장소 Settings → Secrets 에 넣어 주세요.");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.9 },
    }),
  });
  const body = await res.text();
  if (!res.ok) { const e = new Error(`Gemini ${res.status}: ${body.slice(0, 400)}`); e.status = res.status; throw e; }
  const text = JSON.parse(body)?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
  return JSON.parse(text);
}

const hangul = /[가-힣]/;
const str = v => (typeof v === "string" ? v.trim() : "");
function clean(raw) {
  const seen = new Set();
  const sentences = (raw.sentences || []).map(s => ({ en: str(s.en), ko: str(s.ko), pr: str(s.pr) }))
    .filter(s => s.en && /^[A-Za-z0-9 ,.'?!\-’$%:]+$/.test(s.en) && hangul.test(s.ko) && hangul.test(s.pr))
    .filter(s => { const n = norm(s.en); if (usedSentences.has(n) || seen.has(n)) return false; seen.add(n); return true; })
    .slice(0, SENTENCES);
  const wseen = new Set();
  const words = (raw.words || []).map(w => ({ en: str(w.en), ko: str(w.ko), pr: str(w.pr), ex: str(w.ex), exKo: str(w.exKo) }))
    .filter(w => w.en && /^[A-Za-z' \-]+$/.test(w.en) && hangul.test(w.ko) && hangul.test(w.pr) && w.ex && hangul.test(w.exKo))
    .filter(w => { const n = norm(w.en); if (usedWords.has(n) || wseen.has(n)) return false; wseen.add(n); return true; })
    .slice(0, WORDS);
  const title = str(raw.title).slice(0, 20) || step.topic;
  if (sentences.length < SENTENCES - 1 || words.length < WORDS - 1)
    throw new Error(`쓸 수 있는 내용이 부족해요 (문장 ${sentences.length}개, 단어 ${words.length}개)`);
  return { title, sentences, words };
}

let lesson, lastErr;
for (let attempt = 1; attempt <= 4; attempt++) {
  try { lesson = clean(await callGemini()); break; }
  catch (e) {
    lastErr = e;
    console.warn(`시도 ${attempt} 실패: ${e.message}`);
    if (e.status && e.status < 500 && e.status !== 429) break; // 키 오류 등은 재시도해도 소용없음
    await new Promise(r => setTimeout(r, attempt * 15000));
  }
}
if (!lesson) { console.error(lastErr?.message); process.exit(1); }

const nextNum = db.lessons.reduce((m, l) => Math.max(m, parseInt(l.id.slice(1), 10) || 0), 0) + 1;
const entry = { id: "L" + String(nextNum).padStart(3, "0"), step: step.step, level: step.level, topic: step.topic, date: today, ...lesson };
db.lessons.push(entry);
db.updated = today;
fs.writeFileSync(LES_PATH, JSON.stringify(db, null, 1) + "\n");
console.log(`새 수업 추가: ${entry.id} · ${step.step}단계 ${step.topic} · "${entry.title}" (문장 ${entry.sentences.length}, 단어 ${entry.words.length})`);
