export const EXAMPLE_QUESTIONS = [
  "컨테이너 종료 신호와 PID 1",
  "컨테이너 삭제 후 볼륨 데이터",
  "DDIM 결정론적 샘플링과 ODE",
  "Linear Attention과 Fast Weight",
];

const MODEL = "Xenova/multilingual-e5-small";
const WORD = /[\p{L}\p{M}\p{N}]+(?:\+\+|#)?/gu;
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

let indexRequest;
let modelRequest;

function decodeInt16(encoded, length, scale) {
  if (typeof encoded !== "string") throw new Error("검색 벡터가 없습니다.");
  const binary = atob(encoded);
  if (binary.length !== length * 2) throw new Error("검색 벡터 크기가 올바르지 않습니다.");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const vectors = new Float32Array(length);
  if (LITTLE_ENDIAN) {
    const integers = new Int16Array(bytes.buffer);
    for (let i = 0; i < length; i += 1) vectors[i] = integers[i] / scale;
  } else {
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < length; i += 1) vectors[i] = view.getInt16(i * 2, true) / scale;
  }
  return vectors;
}

export function decodeIndex(raw) {
  const {
    version, dim, scale, chunks, vectors_b64: encoded,
    posts, title_vectors_b64: titleEncoded, ...metadata
  } = raw;
  if (!Array.isArray(chunks) || !chunks.length ||
      !Number.isInteger(dim) || dim < 1 || !Number.isInteger(scale) || scale < 1) {
    throw new Error("검색 색인의 구조가 올바르지 않습니다.");
  }

  const length = chunks.length * dim;
  let vectors;
  let passages = chunks;
  let titleVectors = null;
  if (version === 2 || version === 3) {
    vectors = decodeInt16(encoded, length, scale);
    if (version === 3) {
      if (!Array.isArray(posts) || !posts.length) throw new Error("글 목록이 없습니다.");
      const decoded = decodeInt16(titleEncoded, posts.length * dim, scale);
      titleVectors = new Map(posts.map((url, row) => [url, decoded.subarray(row * dim, (row + 1) * dim)]));
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
    ...metadata, version, dim, scale, chunks: passages, vectors, titleVectors,
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

// ── 키워드 점수 ────────────────────────────────────────────
// 한국어는 조사가 붙어 단어가 그대로 맞지 않는다("컨테이너가" ↔ "컨테이너").
// 글자 두 개씩 끊은 조각(bigram)으로 BM25를 매기면 형태소 분석 없이도 맞춘다.
const LEXICAL_FIELDS = [["t", 2], ["h", 1.5], ["k", 1], ["s", 1]];
const BM25_K1 = 1.2;
const BM25_B = 0.75;
// 순위를 섞는 상수(RRF). 60은 흔히 쓰는 값으로, 상위권 몇 개에 지나치게 쏠리지 않게 한다.
const RRF_K = 60;
// 질문이 글 제목과 아주 가까울 때만 더하는 보너스. 0.75 아래의 유사도는 주제가 다르다고 본다.
const TITLE_WEIGHT = 0.35;
const TITLE_FLOOR = 0.75;

function bigrams(text) {
  const words = String(text ?? "").normalize("NFKC").toLowerCase().match(WORD) ?? [];
  const out = [];
  for (const word of words) {
    if (word.length === 1) out.push(word);
    for (let i = 0; i < word.length - 1; i += 1) out.push(word.slice(i, i + 2));
  }
  return out;
}

const lexicalIndexes = new WeakMap();
function lexicalIndex(index) {
  let built = lexicalIndexes.get(index);
  if (built) return built;
  const docs = index.chunks.map((chunk) => {
    const tf = new Map();
    let length = 0;
    for (const [field, weight] of LEXICAL_FIELDS) {
      for (const gram of bigrams(chunk[field])) {
        tf.set(gram, (tf.get(gram) ?? 0) + weight);
        length += weight;
      }
    }
    return { tf, length };
  });
  const df = new Map();
  for (const { tf } of docs) for (const gram of tf.keys()) df.set(gram, (df.get(gram) ?? 0) + 1);
  const averageLength = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(docs.length, 1);
  built = { docs, df, averageLength };
  lexicalIndexes.set(index, built);
  return built;
}

function lexicalScores(index, query) {
  const { docs, df, averageLength } = lexicalIndex(index);
  const grams = [...new Set(bigrams(query))];
  const total = docs.length;
  const idf = grams.map((gram) => {
    const count = df.get(gram) ?? 0;
    return count ? Math.log(1 + (total - count + 0.5) / (count + 0.5)) : 0;
  });
  return docs.map(({ tf, length }) => {
    let score = 0;
    grams.forEach((gram, i) => {
      const frequency = tf.get(gram);
      if (!frequency) return;
      score += idf[i] * (frequency * (BM25_K1 + 1))
        / (frequency + BM25_K1 * (1 - BM25_B + BM25_B * length / averageLength));
    });
    return score;
  });
}

function denseScores(index, queryVector) {
  const { chunks, dim, vectors, titleVectors } = index;
  if (queryVector.length !== dim) throw new Error("질의 벡터의 차원이 색인과 일치하지 않습니다.");
  const queryNorm = Math.hypot(...queryVector);
  if (!Number.isFinite(queryNorm) || queryNorm === 0) throw new Error("질의 벡터를 정규화할 수 없습니다.");

  const titleBonus = new Map();
  if (titleVectors) {
    for (const [url, vector] of titleVectors) {
      let dot = 0;
      for (let i = 0; i < dim; i += 1) dot += vector[i] * queryVector[i];
      titleBonus.set(url, TITLE_WEIGHT * Math.max(0, dot / queryNorm - TITLE_FLOOR));
    }
  }
  return chunks.map((chunk, row) => {
    const offset = row * dim;
    let dot = 0;
    let passageSquared = 0;
    for (let i = 0; i < dim; i += 1) {
      const value = vectors[offset + i];
      dot += value * queryVector[i];
      passageSquared += value * value;
    }
    const cosine = passageSquared ? dot / (Math.sqrt(passageSquared) * queryNorm) : 0;
    return cosine + (titleBonus.get(chunk.u) ?? 0);
  });
}

function rankOf(scores) {
  const order = scores.map((score, row) => [score, row]).sort((a, b) => b[0] - a[0]);
  const ranks = new Array(scores.length);
  order.forEach(([score, row], i) => { ranks[row] = score > 0 ? i + 1 : Infinity; });
  return ranks;
}

function groupByPost(index, scores, limit) {
  const order = scores.map((score, row) => [score, row])
    .filter(([score]) => score > 0)
    .sort((a, b) => b[0] - a[0]);
  const groups = new Map();
  for (const [score, row] of order) {
    const hit = { ...index.chunks[row], score };
    const group = groups.get(hit.u);
    if (group) {
      if (group.subHits.length < 2) group.subHits.push(hit);
    } else if (groups.size < limit) {
      groups.set(hit.u, { ...hit, subHits: [] });
    }
  }
  return [...groups.values()];
}

/**
 * 문단 순위를 매겨 글 단위로 묶는다.
 * queryVector가 없으면 키워드 점수만 쓴다(모델을 불러오기 전 즉시 보여 줄 결과).
 * 있으면 의미 점수(+제목 보너스)와 키워드 점수의 순위를 RRF로 섞는다.
 */
export function rankResults(index, queryVector, query, { limit = 8 } = {}) {
  const lexical = lexicalScores(index, query);
  if (!queryVector) {
    const top = lexical.reduce((max, value) => Math.max(max, value), 0);
    return groupByPost(index, lexical.map((value) => (top ? value / top : 0)), limit);
  }

  const denseRank = rankOf(denseScores(index, queryVector));
  const lexicalRank = rankOf(lexical);
  // 두 신호 모두 1위일 때 1이 되도록 맞춘다. 화면의 "관련도"는 이 값이다.
  const best = 2 / (RRF_K + 1);
  const fused = denseRank.map((rank, row) => (
    1 / (RRF_K + rank) + 1 / (RRF_K + lexicalRank[row])) / best);
  return groupByPost(index, fused, limit);
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

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6";

// 모델은 Web Worker에서 돌린다. 113MB 모델을 준비하는 몇 초 동안 화면이 멈추지 않는다.
// Worker를 만들 수 없는 환경에서는 예전처럼 메인 스레드에서 돌린다.
function workerEmbedder() {
  const worker = new Worker(new URL("embed-worker.mjs", import.meta.url), { type: "module" });
  const pending = new Map();
  let nextId = 0;
  let ready;
  const settle = (id, method, value) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry[method](value);
  };
  worker.addEventListener("message", ({ data }) => {
    if (data.type === "vector") settle(data.id, "resolve", Float32Array.from(data.vector));
    else if (data.type === "error") settle(data.id, "reject", new Error(data.message));
  });
  worker.addEventListener("error", (event) => {
    for (const id of [...pending.keys()]) settle(id, "reject", new Error(event.message || "검색 모델 작업자 오류"));
  });
  const call = (message) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...message, id, model: MODEL, url: TRANSFORMERS_URL });
  });
  ready = call({ type: "warmup" });
  return { ready, embed: (text) => call({ type: "embed", text }) };
}

async function mainThreadEmbedder() {
  const { pipeline, env } = await import(TRANSFORMERS_URL);
  env.allowLocalModels = false;
  const extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
  return {
    ready: Promise.resolve(),
    embed: async (text) => (await extractor([text], { pooling: "mean", normalize: true })).data,
  };
}

function loadModel() {
  modelRequest ??= (async () => {
    if (typeof Worker === "function") {
      try {
        const embedder = workerEmbedder();
        await embedder.ready;
        return embedder;
      } catch (error) {
        console.warn("검색 모델 작업자를 쓸 수 없어 메인 스레드에서 불러옵니다.", error);
      }
    }
    return mainThreadEmbedder();
  })().catch((error) => {
    modelRequest = undefined;
    throw error;
  });
  return modelRequest;
}

/**
 * 검색창에 들어오거나 위젯을 열 때 미리 불러 둔다. 실패해도 검색할 때 다시 시도한다.
 * model: false면 가벼운 색인(약 3MB)만 받는다. 모델은 113MB라 검색 의사가 분명할 때만 받는다.
 */
export function warmup({ model = true } = {}) {
  loadIndex().catch(() => {});
  if (model) loadModel().catch(() => {});
}

/**
 * 키워드 결과를 먼저 onPartial로 돌려주고, 모델이 준비되면 섞은 순위를 반환한다.
 * 모델을 못 불러오면 키워드 결과를 그대로 돌려준다(fallback 표시).
 */
export async function searchPosts(query, { limit = 8, onStatus = () => {}, onPartial = () => {} } = {}) {
  onStatus("검색 색인을 불러오는 중…");
  const index = await loadIndex();
  const partial = rankResults(index, null, query, { limit });
  onPartial(partial);
  onStatus(`키워드로 찾은 결과입니다. 의미 검색 모델을 불러오는 중… (글 ${index.postCount}편 · 문단 ${index.chunks.length}개)`);
  let embedder;
  try {
    embedder = await loadModel();
  } catch (error) {
    const fallback = Object.assign(partial, { lexicalOnly: true, error });
    return fallback;
  }
  onStatus("문맥으로 다시 정렬하는 중…");
  const vector = await embedder.embed("query: " + query);
  return rankResults(index, vector, query, { limit });
}

export function renderQuestionChips(container, choose, className = "search-chip") {
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
    card.className = compact ? "sq-hit" : "card ai-result";
    const body = document.createElement("div");
    if (!compact) body.className = "card-body py-2";

    const href = baseUrl + result.u;
    const title = document.createElement("a");
    title.className = compact ? "sq-title" : "ai-result-title";
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
