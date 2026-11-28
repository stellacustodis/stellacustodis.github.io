---
layout: page
title: 의미 검색
icon: fas fa-magnifying-glass
order: 7
permalink: /ask/
---

<form id="ai-form" role="search" data-base-url="{{ site.baseurl | escape }}">
  <label class="visually-hidden" for="ai-q">블로그 검색어</label>
  <input id="ai-q" type="search" placeholder="블로그 검색어" required>
  <button type="submit">검색</button>
</form>

<div id="ai-examples" role="group" aria-label="예시 검색어"></div>

<p class="text-muted small">키워드 결과를 먼저 보여 주고, 브라우저에서 의미 검색 모델이 준비되면 문맥으로 다시 정렬합니다.</p>

<p id="ai-status" role="status"></p>
<div id="ai-results"></div>

<script type="module" src="{{ '/assets/search/ask.js' | relative_url }}"></script>
