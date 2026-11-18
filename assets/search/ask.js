import { renderQuestionChips, renderSearchResults, searchPosts } from "./search-core.mjs";

const form = document.getElementById("ai-form");
const status = document.getElementById("ai-status");
const box = document.getElementById("ai-q");
const out = document.getElementById("ai-results");
const chips = document.getElementById("ai-examples");
let searchId = 0;

function say(message, style = "text-muted") {
  status.className = style;
  status.textContent = message;
}

async function search(value) {
  const query = value.trim();
  const url = new URL(window.location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", url);
  box.value = query;

  const id = ++searchId;
  out.replaceChildren();
  out.setAttribute("aria-busy", String(Boolean(query)));
  if (!query) {
    say("검색어를 입력하거나 예시 질문을 선택하세요.");
    return;
  }

  try {
    const results = await searchPosts(query, {
      onStatus: (message) => { if (id === searchId) say(message); },
    });
    if (id !== searchId) return;
    renderSearchResults(out, results, query, { baseUrl: form.dataset.baseUrl });
    say(results.length ? `상위 ${results.length}편` : "검색 결과가 없습니다.");
  } catch (error) {
    if (id === searchId) say("검색하지 못했습니다. " + error.message, "text-danger");
  } finally {
    if (id === searchId) out.setAttribute("aria-busy", "false");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  search(box.value);
});
renderQuestionChips(chips, search, "btn btn-sm btn-outline-secondary");
const query = new URLSearchParams(window.location.search).get("q");
if (query?.trim()) search(query);
