export const EXAMPLE_QUESTIONS = [
  "종료 신호를 받고 요청을 마무리하는 방법",
  "컨테이너가 지워지면 데이터는 왜 사라지나",
  "DDIM 비확률적 샘플링",
  "Linear Attention Fast Weight",
];

const MODEL = "Xenova/multilingual-e5-small";
const WORD = /[\p{L}\p{M}\p{N}]+(?:\+\+|#)?/gu;
const LEXICAL_WEIGHTS = [["t", 1], ["h", 0.85], ["k", 0.75], ["s", 0.45]];
const MAX_LEXICAL_BOOST = 0.12;
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

let indexRequest;
let modelRequest;

export function decodeIndex(raw) {
  const { version, dim, scale, chunks, vectors_b64: encoded, ...metadata } = raw;
  if (!Array.isArray(chunks) || !chunks.length ||
      !Number.isInteger(dim) || dim < 1 || !Number.isInteger(scale) || scale < 1) {
    throw new Error("검색 색인의 구조가 올바르지 않습니다.");
  }

  const length = chunks.length * dim;
  let vectors;
  let passages = chunks;
  if (version === 2) {
    if (typeof encoded !== "string") throw new Error("검색 벡터가 없습니다.");
    const binary = atob(encoded);
    if (binary.length !== length * 2) throw new Error("검색 벡터 크기가 올바르지 않습니다.");

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = binary.charCodeAt(i);

    vectors = new Float32Array(length);
    if (LITTLE_ENDIAN) {
      const integers = new Int16Array(bytes.buffer);
      for (let i = 0; i < length; i += 1) vectors[i] = integers[i] / scale;
    } else {
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < length; i += 1) vectors[i] = view.getInt16(i * 2, true) / scale;
    }
  } else if (version === 1 || version === undefined) {
    vectors = new Float32Array(length);
    passages = chunks.map(({ v, ...passage }, row) => {
      if (!Array.isArray(v) || v.length !== dim) throw new Error("이전 검색 벡터 크기가 올바르지 않습니다.");
      for (let i = 0; i < dim; i += 1) vectors[row * dim + i] = v[i] / scale;
      return passage;
    });
  } else {
    throw new Error("지원하지 않는 검색 색인 버전입니다.");
  }

  return {
    ...metadata, version, dim, scale, chunks: passages, vectors,
    postCount: new Set(passages.map(({ u }) => u)).size,
  };
}

function normalizeWord(word) {
  return word.normalize("NFKC").toLowerCase();
}

function queryTerms(query) {
  return new Set((query.normalize("NFKC").toLowerCase().match(WORD) ?? [])
    .filter((word) => word.length > 1));
}

function lexicalScore(chunk, terms) {
  if (!terms.size) return 0;
  const matches = new Map();
  for (const [field, weight] of LEXICAL_WEIGHTS) {
    const words = chunk[field]?.normalize("NFKC").toLowerCase().match(WORD) ?? [];
    for (const word of words) {
      if (terms.has(word) && !matches.has(word)) matches.set(word, weight);
    }
    if (matches.size === terms.size) break;
  }
  const weightedMatches = [...matches.values()].reduce((sum, weight) => sum + weight, 0);
  return MAX_LEXICAL_BOOST * weightedMatches / terms.size;
}

export function rankResults(index, queryVector, query, { limit = 8 } = {}) {
  const { chunks, dim, vectors } = index;
  if (queryVector.length !== dim) throw new Error("질의 벡터의 차원이 색인과 일치하지 않습니다.");
  const queryNorm = Math.hypot(...queryVector);
  if (!Number.isFinite(queryNorm) || queryNorm === 0) throw new Error("질의 벡터를 정규화할 수 없습니다.");

  const terms = queryTerms(query);
  const hits = chunks.map((chunk, row) => {
    const offset = row * dim;
    let dot = 0;
    let passageSquared = 0;
    for (let i = 0; i < dim; i += 1) {
      const value = vectors[offset + i];
      dot += value * queryVector[i];
      passageSquared += value * value;
    }
    const cosineScore = passageSquared ? dot / (Math.sqrt(passageSquared) * queryNorm) : 0;
    const lexicalBoost = lexicalScore(chunk, terms);
    return { ...chunk, cosineScore, lexicalBoost, score: cosineScore + lexicalBoost };
  });
  hits.sort((a, b) => b.score - a.score);

  const groups = new Map();
  for (const hit of hits) {
    const group = groups.get(hit.u);
    if (group) {
      if (group.subHits.length < 2) group.subHits.push(hit);
    } else if (groups.size < limit) {
      groups.set(hit.u, { ...hit, subHits: [] });
    }
  }
  return [...groups.values()];
}

function loadIndex() {
  indexRequest ??= (async () => {
    const response = await fetch(new URL("index.json", import.meta.url));
    if (!response.ok) throw new Error(`검색 색인을 불러오지 못했습니다 (HTTP ${response.status}).`);
    return decodeIndex(await response.json());
  })().catch((error) => {
    indexRequest = undefined;
    throw error;
  });
  return indexRequest;
}

function loadModel() {
  modelRequest ??= (async () => {
    const { pipeline, env } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6");
    env.allowLocalModels = false;
    return pipeline("feature-extraction", MODEL, { dtype: "q8" });
  })().catch((error) => {
    modelRequest = undefined;
    throw error;
  });
  return modelRequest;
}

export async function searchPosts(query, { limit = 8, onStatus = () => {} } = {}) {
  onStatus("검색 색인을 불러오는 중…");
  const index = await loadIndex();
  onStatus(`검색 모델을 불러오는 중… 글 ${index.postCount}편 · 문단 ${index.chunks.length}개`);
  const embed = await loadModel();
  onStatus("관련 문단을 찾는 중…");
  const result = await embed(["query: " + query], { pooling: "mean", normalize: true });
  return rankResults(index, result.data, query, { limit });
}

export function renderQuestionChips(container, choose, className) {
  for (const question of EXAMPLE_QUESTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = question;
    button.addEventListener("click", () => choose(question));
    container.append(button);
  }
}

function appendHighlighted(element, value, terms) {
  const text = String(value ?? "");
  let offset = 0;
  for (const match of text.matchAll(WORD)) {
    if (!terms.has(normalizeWord(match[0]))) continue;
    const mark = document.createElement("mark");
    mark.textContent = match[0];
    element.append(text.slice(offset, match.index), mark);
    offset = match.index + match[0].length;
  }
  element.append(text.slice(offset));
}

function appendPassage(element, passage, href, terms, compact) {
  if (passage.h) {
    const heading = document.createElement("div");
    heading.className = compact ? "sq-meta" : "small";
    const label = passage.a ? document.createElement("a") : document.createElement("span");
    if (passage.a) label.href = href + "#" + encodeURIComponent(passage.a);
    label.append("§ ");
    appendHighlighted(label, passage.h, terms);
    heading.append(label);
    element.append(heading);
  }
  if (passage.s) {
    const snippet = document.createElement("p");
    snippet.className = compact ? "sq-snip" : "mb-1 mt-1 small";
    const maxLength = compact ? 160 : 300;
    appendHighlighted(snippet, passage.s.slice(0, maxLength), terms);
    if (passage.s.length >= maxLength) snippet.append("…");
    element.append(snippet);
  }
}

export function renderSearchResults(container, results, query, { baseUrl = "", compact = false } = {}) {
  const terms = queryTerms(query);
  const fragment = document.createDocumentFragment();
  for (const result of results) {
    const card = document.createElement("article");
    card.className = compact ? "sq-hit" : "card mb-2";
    const body = document.createElement("div");
    if (!compact) body.className = "card-body py-2";

    const href = baseUrl + result.u;
    const title = document.createElement("a");
    title.className = compact ? "sq-title" : "fw-bold";
    title.href = href;
    appendHighlighted(title, result.t, terms);

    const metadata = document.createElement("div");
    metadata.className = compact ? "sq-meta" : "text-muted small";
    metadata.textContent = [result.d, `관련도 ${result.score.toFixed(3)}`].filter(Boolean).join(" · ");
    body.append(title, metadata);
    appendPassage(body, result, href, terms, compact);

    if (result.subHits.length) {
      const details = document.createElement("details");
      details.className = compact ? "sq-snip" : "small mt-2";
      const summary = document.createElement("summary");
      summary.textContent = `이 글의 관련 문단 ${result.subHits.length}개 더 보기`;
      details.append(summary);
      for (const passage of result.subHits) {
        const extra = document.createElement("div");
        extra.className = "mt-2";
        appendPassage(extra, passage, href, terms, compact);
        details.append(extra);
      }
      body.append(details);
    }

    card.append(body);
    fragment.append(card);
  }
  container.replaceChildren(fragment);
}
