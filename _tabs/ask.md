---
layout: page
title: 의미 검색
icon: fas fa-magnifying-glass
order: 5
permalink: /ask/
---

<form id="ai-form" class="input-group mb-3" role="search" data-base-url="{{ site.baseurl | escape }}">
  <label class="visually-hidden" for="ai-q">블로그 검색어</label>
  <input id="ai-q" type="search" class="form-control" placeholder="찾고 싶은 개념이나 질문을 입력하세요" required>
  <button class="btn btn-primary" type="submit">검색</button>
</form>

<div id="ai-examples" class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="예시 질문"></div>

<p class="text-muted small">
  뜻이 가까운 문단을 찾고 제목과 본문에 일치하는 검색어를 강조합니다.
  검색은 브라우저에서 처리하며, 처음 검색할 때 모델을 내려받습니다.
</p>

<p id="ai-status" class="text-muted" role="status">검색어를 입력하거나 예시 질문을 선택하세요.</p>
<div id="ai-results"></div>

<script type="module" src="{{ '/assets/search/ask.js' | relative_url }}"></script>
