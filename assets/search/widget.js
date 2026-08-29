// 우측 하단 챗봇 형태의 의미 검색 위젯. 사이트 전역에 붙는다.
//
// 무거운 것(색인 4.6MB, 임베딩 모델)은 **사용자가 열고 처음 물어볼 때만** 불러온다.
// 그래서 위젯이 있어도 다른 페이지의 로딩에는 영향이 없다.
(() => {
  const MODEL = "Xenova/multilingual-e5-small";
  const BASE = document.querySelector('meta[name="code-lab-baseurl"]')?.content ?? "";
  const INDEX_URL = `${BASE}/assets/search/index.json`;

  let index = null, embed = null, loading = null;

  const css = `
  #sq-fab{position:fixed;right:20px;bottom:20px;z-index:1050;width:52px;height:52px;
    border-radius:50%;border:0;cursor:pointer;background:var(--btn-share-color,#2a408e);
    color:#fff;font-size:22px;box-shadow:0 4px 14px rgba(0,0,0,.28);transition:transform .15s}
  #sq-fab:hover{transform:scale(1.07)}
  #sq-panel{position:fixed;right:20px;bottom:84px;z-index:1050;width:min(400px,calc(100vw - 40px));
    max-height:min(560px,calc(100vh - 130px));display:none;flex-direction:column;
    background:var(--card-bg,#fff);color:var(--text-color,#1b1b1e);
    border:1px solid var(--card-border-color,#dee2e6);border-radius:12px;
    box-shadow:0 8px 30px rgba(0,0,0,.25);overflow:hidden}
  #sq-panel.on{display:flex}
  #sq-head{padding:10px 14px;border-bottom:1px solid var(--card-border-color,#dee2e6);
    font-weight:600;display:flex;justify-content:space-between;align-items:center}
  #sq-close{background:none;border:0;font-size:20px;cursor:pointer;color:inherit;line-height:1}
  #sq-body{padding:10px 14px;overflow-y:auto;flex:1}
  #sq-form{display:flex;gap:6px;padding:10px 14px;border-top:1px solid var(--card-border-color,#dee2e6)}
  #sq-input{flex:1;padding:7px 10px;border-radius:8px;border:1px solid var(--card-border-color,#ccc);
    background:var(--main-bg,#fff);color:inherit;font-size:.9rem}
  #sq-send{padding:7px 13px;border-radius:8px;border:0;cursor:pointer;
    background:var(--btn-share-color,#2a408e);color:#fff}
  #sq-send:disabled{opacity:.5;cursor:not-allowed}
  .sq-hit{display:block;padding:8px 0;border-bottom:1px solid var(--card-border-color,#eee);
    text-decoration:none;color:inherit}
  .sq-hit:last-child{border-bottom:0}
  .sq-hit b{display:block;font-size:.9rem;line-height:1.35}
  .sq-meta{font-size:.72rem;opacity:.62}
  .sq-snip{font-size:.8rem;opacity:.85;margin-top:3px;line-height:1.45}
  .sq-note{font-size:.82rem;opacity:.75;line-height:1.55}`;

  const el = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));

  const fab = el(`<button id="sq-fab" title="글 안에서 찾기" aria-label="글 안에서 찾기">💬</button>`);
  const panel = el(`
    <div id="sq-panel" role="dialog" aria-label="의미 검색">
      <div id="sq-head"><span>글 안에서 찾기</span><button id="sq-close" aria-label="닫기">×</button></div>
      <div id="sq-body"><p class="sq-note">글자가 겹치지 않아도 <b>뜻이 가까운 문단</b>을 찾는다.
        검색은 브라우저 안에서만 일어나고 밖으로 아무것도 보내지 않는다.<br><br>
        처음 물어볼 때 한 번 모델을 내려받느라 시간이 걸린다.</p></div>
      <form id="sq-form"><input id="sq-input" placeholder="예: 컨테이너를 지우면 데이터가 왜 사라지나"
        autocomplete="off"><button id="sq-send" type="submit">찾기</button></form>
    </div>`);
  document.body.append(fab, panel);

  const $ = (id) => document.getElementById(id);
  const body = $("sq-body"), input = $("sq-input"), send = $("sq-send");
  const note = (h) => { body.innerHTML = `<p class="sq-note">${h}</p>`; };

  const toggle = (on) => {
    panel.classList.toggle("on", on);
    fab.textContent = on ? "×" : "💬";
    if (on) input.focus();
  };
  fab.onclick = () => toggle(!panel.classList.contains("on"));
  $("sq-close").onclick = () => toggle(false);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("on")) toggle(false);
  });

  async function boot() {
    if (index && embed) return;
    if (loading) return loading;
    loading = (async () => {
      note("색인을 불러오는 중…");
      const r = await fetch(INDEX_URL);
      if (!r.ok) throw new Error(`색인을 불러오지 못했다 (HTTP ${r.status})`);
      index = await r.json();

      note(`모델을 내려받는 중… 처음 한 번만 걸린다<br><span class="sq-meta">문단 ${index.chunks.length}개</span>`);
      const { pipeline, env } = await import(
        "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6");
      env.allowLocalModels = false;
      embed = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });

      // 16비트로 저장한 벡터를 한 번만 펼쳐 둔다
      const s = index.scale, d = index.dim;
      index.M = new Float32Array(index.chunks.length * d);
      index.chunks.forEach((c, i) => {
        for (let j = 0; j < d; j++) index.M[i * d + j] = c.v[j] / s;
        c.v = null;
      });
    })();
    return loading;
  }

  async function search(q) {
    send.disabled = true;
    try {
      await boot();
      note("찾는 중…");
      // 색인은 "passage: " 를 붙여 만들었으므로 질문에는 "query: " 를 붙인다
      const r = await embed(["query: " + q], { pooling: "mean", normalize: true });
      const d = index.dim, n = index.chunks.length, sc = new Array(n);
      for (let i = 0; i < n; i++) {
        let dot = 0;
        for (let j = 0; j < d; j++) dot += index.M[i * d + j] * r.data[j];
        sc[i] = { i, dot };
      }
      sc.sort((a, b) => b.dot - a.dot);

      const seen = new Set(), top = [];
      for (const x of sc) {
        const c = index.chunks[x.i];
        if (seen.has(c.u)) continue;
        seen.add(c.u); top.push({ ...c, score: x.dot });
        if (top.length >= 6) break;
      }
      body.innerHTML = top.map(c => `
        <a class="sq-hit" href="${BASE}${c.u}">
          <b>${esc(c.t)}</b>
          <span class="sq-meta">${esc(c.d || "")}${c.h ? " · § " + esc(c.h) : ""} · ${c.score.toFixed(3)}</span>
          <span class="sq-snip">${esc(c.s.slice(0, 150))}…</span>
        </a>`).join("");
    } catch (e) {
      note(`찾지 못했다: ${esc(e.message)}`);
      loading = null;   // 다음 시도에서 다시 받도록
    } finally {
      send.disabled = false;
    }
  }

  $("sq-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) search(q);
  });
})();
