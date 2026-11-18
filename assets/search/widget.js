import { renderQuestionChips, renderSearchResults, searchPosts } from "./search-core.mjs";

const baseUrl = document.querySelector('meta[name="code-lab-baseurl"]')?.content ?? "";
const css = `
#sq-fab{position:fixed;right:20px;bottom:20px;z-index:1050;width:52px;height:52px;
  border-radius:50%;border:0;cursor:pointer;background:var(--btn-share-color,#2a408e);
  color:#fff;font-size:22px;box-shadow:0 4px 14px rgba(0,0,0,.28)}
#sq-panel{position:fixed;right:20px;bottom:84px;z-index:1050;width:min(400px,calc(100vw - 40px));
  max-height:min(560px,calc(100dvh - 104px));flex-direction:column;
  background:var(--card-bg,#fff);color:var(--text-color,#1b1b1e);
  border:1px solid var(--card-border-color,#dee2e6);border-radius:12px;
  box-shadow:0 8px 30px rgba(0,0,0,.25);overflow:hidden}
#sq-panel:not([hidden]){display:flex}
#sq-head{padding:10px 14px;border-bottom:1px solid var(--card-border-color,#dee2e6);
  font-weight:600;display:flex;justify-content:space-between;align-items:center}
#sq-close{background:none;border:0;font-size:20px;cursor:pointer;color:inherit;line-height:1}
#sq-body{padding:10px 14px;overflow-y:auto;flex:1}
#sq-form{display:flex;gap:6px;padding:10px 14px;border-top:1px solid var(--card-border-color,#dee2e6)}
#sq-input{min-width:0;flex:1;padding:7px 10px;border-radius:8px;border:1px solid var(--card-border-color,#ccc);
  background:var(--main-bg,#fff);color:inherit;font-size:.9rem}
#sq-send{padding:7px 13px;border-radius:8px;border:0;cursor:pointer;
  background:var(--btn-share-color,#2a408e);color:#fff}
.sq-hit{padding:8px 0;border-bottom:1px solid var(--card-border-color,#eee)}
.sq-title{display:block;font-size:.9rem;font-weight:600;line-height:1.35}
.sq-meta{font-size:.75rem;color:var(--text-muted-color,#595959)}
.sq-snip{font-size:.8rem;margin:3px 0 0;line-height:1.45}
.sq-note,.sq-full{font-size:.82rem;line-height:1.55}
.sq-full:not([hidden]){display:inline-block;margin-top:.65rem}
#sq-examples{display:flex;gap:.35rem;flex-wrap:wrap}
`;

const style = document.createElement("style");
style.textContent = css;
document.head.append(style);

const template = document.createElement("template");
template.innerHTML = `
  <button id="sq-fab" type="button" title="글 안에서 찾기" aria-label="글 안에서 찾기" aria-controls="sq-panel" aria-expanded="false">💬</button>
  <div id="sq-panel" role="dialog" aria-labelledby="sq-title" hidden>
    <div id="sq-head">
      <span id="sq-title">글 안에서 찾기</span>
      <button id="sq-close" type="button" aria-label="의미 검색 닫기">×</button>
    </div>
    <div id="sq-body">
      <div id="sq-intro">
        <p class="sq-note">뜻이 가까운 문단을 찾습니다. 처음 검색할 때 모델을 내려받습니다.</p>
        <div id="sq-examples" role="group" aria-label="추천 질문"></div>
      </div>
      <p id="sq-status" class="sq-note mb-0" role="status" hidden></p>
      <div id="sq-results"></div>
      <a id="sq-full" class="sq-full" hidden>전체 화면(/ask/)에서 자세히 보기</a>
    </div>
    <form id="sq-form" role="search">
      <label class="visually-hidden" for="sq-input">블로그 검색어</label>
      <input id="sq-input" type="search" placeholder="질문이나 검색어" autocomplete="off" required>
      <button id="sq-send" type="submit">찾기</button>
    </form>
  </div>`;
document.body.append(template.content);

const get = (id) => document.getElementById(id);
const fab = get("sq-fab");
const panel = get("sq-panel");
const intro = get("sq-intro");
const body = get("sq-body");
const input = get("sq-input");
const status = get("sq-status");
const out = get("sq-results");
const full = get("sq-full");
let searchId = 0;

function toggle(open) {
  panel.hidden = !open;
  fab.setAttribute("aria-expanded", String(open));
  fab.textContent = open ? "×" : "💬";
  if (open) input.focus();
  else fab.focus();
}

function say(message, error = false) {
  status.hidden = !message;
  status.textContent = message;
  status.classList.toggle("text-danger", error);
}

async function search(value) {
  const query = value.trim();
  if (!query) return;
  const id = ++searchId;
  input.value = query;
  if (intro.contains(document.activeElement)) input.focus();
  body.scrollTop = 0;
  intro.hidden = true;
  full.hidden = true;
  out.replaceChildren();
  out.setAttribute("aria-busy", "true");

  try {
    const results = await searchPosts(query, {
      limit: 6,
      onStatus: (message) => { if (id === searchId) say(message); },
    });
    if (id !== searchId) return;
    renderSearchResults(out, results, query, { baseUrl, compact: true });
    say(results.length ? `상위 ${results.length}편` : "검색 결과가 없습니다.");
    full.href = `${baseUrl}/ask/?${new URLSearchParams({ q: query })}`;
    full.hidden = false;
  } catch (error) {
    if (id === searchId) {
      say("검색하지 못했습니다. " + error.message, true);
      intro.hidden = false;
    }
  } finally {
    if (id === searchId) out.setAttribute("aria-busy", "false");
  }
}

fab.addEventListener("click", () => toggle(panel.hidden));
get("sq-close").addEventListener("click", () => toggle(false));
panel.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !event.isComposing) toggle(false);
});
get("sq-form").addEventListener("submit", (event) => {
  event.preventDefault();
  search(input.value);
});
renderQuestionChips(get("sq-examples"), search, "btn btn-sm btn-outline-secondary");
