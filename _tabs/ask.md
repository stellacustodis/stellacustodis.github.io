---
layout: page
title: 의미 검색
icon: fas fa-magnifying-glass
order: 5
permalink: /ask/
---

<p id="ai-status" class="text-muted">준비 중…</p>

<div class="input-group mb-3">
  <input id="ai-q" type="text" class="form-control"
         placeholder="예: 컨테이너가 지워지면 데이터는 왜 사라지나" disabled>
  <button id="ai-go" class="btn btn-primary" disabled>검색</button>
</div>

<p class="text-muted small">
  글자가 겹치지 않아도 <strong>뜻이 가까운 문단</strong>을 찾는다.
  검색은 전부 브라우저 안에서 일어나고 서버로 아무것도 보내지 않는다.
  처음 한 번은 모델을 내려받느라 시간이 걸리고, 그다음부터는 캐시에서 바로 뜬다.
</p>

<div id="ai-results"></div>

<script type="module" src="{{ '/assets/search/ask.js' | relative_url }}"></script>
