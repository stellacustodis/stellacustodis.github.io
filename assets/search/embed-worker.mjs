// 의미 검색용 질의 임베딩을 메인 스레드 밖에서 계산한다.
// search-core.mjs가 모델 이름과 transformers.js 주소를 메시지로 넘긴다.
let extractor;

async function load(url, model) {
  extractor ??= (async () => {
    const { pipeline, env } = await import(url);
    env.allowLocalModels = false;
    return pipeline("feature-extraction", model, { dtype: "q8" });
  })().catch((error) => {
    extractor = undefined;
    throw error;
  });
  return extractor;
}

self.addEventListener("message", async ({ data }) => {
  const { id, type, url, model, text } = data;
  try {
    const run = await load(url, model);
    if (type === "warmup") {
      // 첫 추론에서 WASM 준비가 끝나므로 짧은 문장을 한 번 미리 돌려 둔다.
      await run(["query: 준비"], { pooling: "mean", normalize: true });
      self.postMessage({ id, type: "vector", vector: [] });
      return;
    }
    const output = await run([text], { pooling: "mean", normalize: true });
    self.postMessage({ id, type: "vector", vector: Array.from(output.data) });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || String(error) });
  }
});
