#!/usr/bin/env node
/**
 * 의미 검색 품질 평가.
 *
 *   node tools/search-eval/eval.mjs --transformers <@huggingface/transformers가 설치된 폴더>
 *                                   [--index <index.json>] [--min-hit1 0.78] [--verbose]
 *
 * queries.json의 [질문, [정답 글 slug...]] 쌍으로, 브라우저와 같은 q8 모델과
 * assets/search/search-core.mjs의 순위 함수를 그대로 돌려 글 단위 정확도를 잰다.
 *  - hybrid  : 실제 검색(의미 + 키워드 순위 결합)
 *  - keyword : 모델을 불러오기 전 즉시 보여 주는 키워드 결과
 * --min-hit1보다 hybrid의 1위 정답률이 낮으면 종료 코드 1로 끝난다.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const transformersDir = option("--transformers", process.env.TRANSFORMERS_DIR);
if (!transformersDir) {
  console.error("--transformers <폴더> 또는 TRANSFORMERS_DIR이 필요합니다 (예: vault/_tools).");
  process.exit(2);
}
const indexPath = option("--index", path.join(repo, "assets/search/index.json"));
const minHit1 = Number(option("--min-hit1", "0"));
const verbose = args.includes("--verbose");

const require = createRequire(path.join(path.resolve(transformersDir), "package.json"));
const { pipeline } = await import(pathToFileURL(require.resolve("@huggingface/transformers")));
const core = await import(pathToFileURL(path.join(repo, "assets/search/search-core.mjs")));

const raw = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const index = core.decodeIndex(raw);
const queries = JSON.parse(fs.readFileSync(path.join(here, "queries.json"), "utf8"));
const embed = await pipeline("feature-extraction", raw.model, { dtype: "q8" });

const modes = {
  hybrid: (query, vector) => core.rankResults(index, vector, query, { limit: 8 }),
  keyword: (query) => core.rankResults(index, null, query, { limit: 8 }),
};
const stats = Object.fromEntries(Object.keys(modes).map((m) => [m, { h1: 0, h3: 0, h5: 0, mrr: 0, misses: [] }]));

try {
  for (const [query, expected] of queries) {
    const want = new Set(expected.map((slug) => `/posts/${slug}/`));
    const { data } = await embed(`query: ${query}`, { pooling: "mean", normalize: true });
    for (const [mode, run] of Object.entries(modes)) {
      const urls = run(query, data).map((hit) => hit.u);
      const position = urls.findIndex((url) => want.has(url));
      const s = stats[mode];
      if (position === 0) s.h1 += 1;
      if (position >= 0 && position < 3) s.h3 += 1;
      if (position >= 0 && position < 5) s.h5 += 1;
      if (position >= 0) s.mrr += 1 / (position + 1);
      if (position !== 0) s.misses.push(`${query} → ${urls[0] ?? "-"} (정답 ${position < 0 ? "8위 밖" : `${position + 1}위`})`);
    }
  }
} finally {
  await embed.dispose();
}

const n = queries.length;
const pct = (v) => `${((v / n) * 100).toFixed(0).padStart(3)}%`;
console.log(`색인 v${raw.version} · ${raw.model} · 질문 ${n}개`);
for (const [mode, s] of Object.entries(stats)) {
  console.log(`${mode.padEnd(8)} hit@1 ${pct(s.h1)}  hit@3 ${pct(s.h3)}  hit@5 ${pct(s.h5)}  MRR ${(s.mrr / n).toFixed(3)}`);
}
if (verbose) {
  console.log("\nhybrid에서 1위가 정답이 아닌 질문:");
  for (const miss of stats.hybrid.misses) console.log("  " + miss);
}
const hit1 = stats.hybrid.h1 / n;
if (hit1 < minHit1) {
  console.error(`\nhybrid hit@1 ${(hit1 * 100).toFixed(0)}%가 기준 ${(minHit1 * 100).toFixed(0)}%보다 낮습니다.`);
  process.exitCode = 1;
}
