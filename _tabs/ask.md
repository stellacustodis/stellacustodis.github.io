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

<p class="text-muted small">키워드와 문맥으로 블로그 문단을 검색합니다. 첫 검색 시 브라우저에서 모델을 불러옵니다.</p>

<p id="ai-status" role="status"></p>
<div id="ai-results"></div>

<script type="module" src="{{ '/assets/search/ask.js' | relative_url }}"></script>
