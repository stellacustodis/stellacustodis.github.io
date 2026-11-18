---
layout: page
title: 의미 검색
icon: fas fa-magnifying-glass
order: 5
permalink: /ask/
---

<form id="ai-form" class="input-group mb-3" role="search" data-base-url="{{ site.baseurl | escape }}">
  <label class="visually-hidden" for="ai-q">블로그 검색어</label>
  <input id="ai-q" type="search" class="form-control" placeholder="블로그 검색어" required>
  <button class="btn btn-primary" type="submit">검색</button>
</form>

<div id="ai-examples" class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="예시 검색어"></div>

<p class="text-muted small">키워드와 문맥으로 블로그 문단을 검색합니다. 첫 검색 시 브라우저에서 모델을 불러옵니다.</p>

<p id="ai-status" class="text-muted" role="status"></p>
<div id="ai-results"></div>

<script type="module" src="{{ '/assets/search/ask.js' | relative_url }}"></script>
