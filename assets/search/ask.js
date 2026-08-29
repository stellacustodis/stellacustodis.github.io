// 브라우저 안에서만 도는 의미 검색.
// 문서 벡터는 빌드 때 미리 계산해 두고, 질문만 여기서 임베딩한다.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6";

env.allowLocalModels = false;

const MODEL = "Xenova/multilingual-e5-small";
const $ = (id) => document.getElementById(id);
const status = $("ai-status"), box = $("ai-q"), go = $("ai-go"), out = $("ai-results");

let index = null, embed = null;

function say(t, busy = false) {
  status.textContent = t;
  status.className = busy ? "text-muted" : "text-success";
}

async function boot() {
  try {
    say("색인을 불러오는 중…", true);
    const r = await fetch(new URL("index.json", import.meta.url));
    if (!r.ok) throw new Error(`색인을 불러오지 못했다 (HTTP ${r.status})`);
    index = await r.json();

    say(`모델을 내려받는 중… 처음 한 번만 걸린다 (문단 ${index.chunks.length}개)`, true);
    embed = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });

    // 16비트 정수로 저장한 벡터를 되돌려 한 번만 펼쳐 둔다
    const s = index.scale, d = index.dim;
    index.M = new Float32Array(index.chunks.length * d);
    index.chunks.forEach((c, i) => {
      for (let j = 0; j < d; j++) index.M[i * d + j] = c.v[j] / s;
      c.v = null;
    });

    box.disabled = go.disabled = false;
    say(`준비됐다 — 글 ${new Set(index.chunks.map(c => c.u)).size}편 · 문단 ${index.chunks.length}개`);
    box.focus();
  } catch (e) {
    status.className = "text-danger";
    status.textContent = "검색을 준비하지 못했다: " + e.message;
  }
}

async function search() {
  const q = box.value.trim();
  if (!q || !embed) return;
  go.disabled = true;
  say("찾는 중…", true);

  // 빌드 때 문단에 "passage: " 를 붙였으므로 질문에는 "query: " 를 붙인다.
  // 접두사를 빼면 학습 조건과 달라져 유사도가 무너진다.
  const r = await embed(["query: " + q], { pooling: "mean", normalize: true });
  const qv = r.data, d = index.dim, n = index.chunks.length;

  // 문서 벡터도 질문 벡터도 정규화돼 있으므로 내적이 곧 코사인 유사도다
  const scored = new Array(n);
  for (let i = 0; i < n; i++) {
    let dot = 0;
    for (let j = 0; j < d; j++) dot += index.M[i * d + j] * qv[j];
    scored[i] = { i, dot };
  }
  scored.sort((a, b) => b.dot - a.dot);

  // 같은 글이 상위를 독차지하지 않게 글당 하나만 남긴다
  const seen = new Set(), top = [];
  for (const s of scored) {
    const c = index.chunks[s.i];
    if (seen.has(c.u)) continue;
    seen.add(c.u);
    top.push({ ...c, score: s.dot });
    if (top.length >= 8) break;
  }

  out.innerHTML = top.map(c => `
    <div class="card mb-2">
      <div class="card-body py-2">
        <a href="${c.u}" class="fw-bold">${esc(c.t)}</a>
        <span class="text-muted small ms-2">${esc(c.d || "")} · 유사도 ${c.score.toFixed(3)}</span>
        ${c.h ? `<div class="small text-muted">§ ${esc(c.h)}</div>` : ""}
        <p class="mb-0 mt-1 small">${esc(c.s)}…</p>
      </div>
    </div>`).join("");

  go.disabled = false;
  say(`상위 ${top.length}편`);
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

go.addEventListener("click", search);
box.addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });
boot();
