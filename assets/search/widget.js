import { renderQuestionChips, renderSearchResults, searchPosts } from "./search-core.mjs";

const baseUrl = document.querySelector('meta[name="code-lab-baseurl"]')?.content ?? "";
const css = `
:root {
  --sq-edge: max(1.25rem, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px));
  --sq-fab-size: 3.25rem;
  /* Chirpy's back-to-top reaches 7.375rem above the bottom on narrow screens. */
  --sq-fab-bottom: calc(8.25rem + env(safe-area-inset-bottom, 0px));
  --sq-panel-bottom: calc(var(--sq-fab-bottom) + var(--sq-fab-size) + 0.75rem);
}

#sq-fab,
#sq-panel {
  position: fixed;
  right: var(--sq-edge);
  z-index: 1050;
}

#sq-fab {
  bottom: var(--sq-fab-bottom);
  width: var(--sq-fab-size);
  height: var(--sq-fab-size);
  border: 0;
  border-radius: 50%;
  font-size: 1.375rem;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .28);
}

#sq-panel {
  bottom: var(--sq-panel-bottom);
  width: min(25rem, calc(100% - 2 * var(--sq-edge)));
  max-height: min(35rem, calc(100dvh - var(--sq-panel-bottom) - var(--sq-edge)));
  flex-direction: column;
  background: var(--card-bg, #fff);
  color: var(--text-color, #34343c);
  border: 1px solid var(--tag-border, #dee2e6);
  border-radius: 0.75rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, .25);
  overflow: hidden;
}

@media (max-height: 28rem) {
  #sq-panel {
    right: auto;
    left: var(--sq-edge);
    bottom: max(var(--sq-edge), env(safe-area-inset-bottom, 0px));
    width: min(25rem, calc(100% - 2 * var(--sq-edge) - var(--sq-fab-size) - 0.75rem));
    max-height: calc(100dvh - 2 * var(--sq-edge));
  }
}

#sq-panel:not([hidden]){display:flex}
#sq-panel a{color:var(--link-color,#0056b2)}
#sq-head{padding:10px 14px;border-bottom:1px solid var(--tag-border,#dee2e6);
  font-weight:600;display:flex;justify-content:space-between;align-items:center}
#sq-close{background:none;border:0;font-size:20px;cursor:pointer;color:inherit;line-height:1}
#sq-body{padding:10px 14px;overflow-y:auto;flex:1}
#sq-form{padding:10px 14px;border-top:1px solid var(--tag-border,#dee2e6)}
#sq-head,#sq-form{flex:none}
.sq-hit{padding:8px 0;border-bottom:1px solid var(--tag-border,#dee2e6)}
.sq-title{display:block;font-size:.9rem;font-weight:600;line-height:1.35}
.sq-meta{font-size:.75rem;color:var(--text-muted-color,#595959)}
.sq-snip{font-size:.8rem;margin:3px 0 0;line-height:1.45}
.sq-note,.sq-full{font-size:.82rem;line-height:1.55}
#sq-status{margin-bottom:0}
.sq-full:not([hidden]){display:inline-block;margin-top:.65rem}
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
        <p class="sq-note">키워드와 문맥으로 블로그 문단을 검색합니다. 첫 검색 시 모델을 불러옵니다.</p>
        <div id="sq-examples" role="group" aria-label="예시 검색어"></div>
      </div>
      <p id="sq-status" class="sq-note" role="status" hidden></p>
      <div id="sq-results"></div>
      <a id="sq-full" class="sq-full" hidden>전체 결과 보기</a>
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
  status.classList.toggle("search-status--error", error);
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
renderQuestionChips(get("sq-examples"), search);
