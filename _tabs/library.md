---
layout: page
title: Library
icon: fas fa-book
order: 2
permalink: /library/
---

{% assign lib = site.data.library %}

<link rel="stylesheet" href="{{ '/assets/css/graph.css' | relative_url }}">
<link rel="stylesheet" href="{{ '/assets/css/library.css' | relative_url }}">

<div class="knowledge-graph library-graph" id="library-graph">
  <header class="graph-intro">
    <p>
      Zotero 논문을 모델 계열·주제·성격별로 볼 수 있습니다.
      선은 제1저자가 같은 논문을 잇고, 테두리는 블로그에 리뷰가 있는 논문을 표시합니다.
    </p>
    <div class="graph-stats" aria-label="라이브러리 통계">
      <span><strong id="library-paper-count">{{ lib.papers | size }}</strong> papers</span>
      <span><strong id="library-edge-count">0</strong> connections</span>
      <span><strong>{{ lib.papers | where_exp: "p", "p.post != ''" | size }}</strong> reviewed</span>
    </div>
  </header>

  <div class="graph-toolbar" aria-label="라이브러리 필터">
    <label class="graph-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input id="library-search" type="search" aria-label="논문 검색" placeholder="제목이나 저자 검색" autocomplete="off">
    </label>

    <label class="library-cluster-pick">
      <span>군집</span>
      <select id="library-cluster" aria-label="군집 기준">
        <option value="family">계열</option>
        <option value="task">주제</option>
        <option value="kind">성격</option>
      </select>
    </label>

    <label>
      <select id="library-family" aria-label="계열 필터">
        <option value="">모든 계열</option>
      </select>
    </label>

    <label>
      <select id="library-task" aria-label="주제 필터">
        <option value="">모든 주제</option>
      </select>
    </label>

    <label>
      <select id="library-year" aria-label="연도 필터">
        <option value="">모든 연도</option>
      </select>
    </label>

    <label class="library-toggle">
      <input id="library-reviewed" type="checkbox">
      <span>리뷰 있는 것만</span>
    </label>

    <button id="library-reset" type="button" class="graph-button">
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      초기화
    </button>
  </div>

  <div class="graph-layout">
    <section class="graph-canvas-wrap" aria-label="논문 라이브러리 그래프">
      <svg id="library-canvas" role="img" aria-labelledby="library-title library-desc">
        <title id="library-title">논문 라이브러리 그래프</title>
        <desc id="library-desc">제1저자가 같은 논문을 연결한 그래프</desc>
        <g id="library-viewport">
          <g id="library-hulls"></g>
          <g id="library-edges"></g>
          <g id="library-nodes"></g>
        </g>
      </svg>

      <div class="graph-zoom" aria-label="확대 및 축소">
        <button id="library-zoom-in" type="button" aria-label="확대"><i class="fas fa-plus"></i></button>
        <button id="library-zoom-out" type="button" aria-label="축소"><i class="fas fa-minus"></i></button>
        <button id="library-fit" type="button" aria-label="화면에 맞추기"><i class="fas fa-expand"></i></button>
      </div>

      <p id="library-empty" class="graph-empty" hidden>조건에 맞는 논문이 없습니다.</p>
    </section>

    <aside class="graph-detail" id="library-detail" aria-live="polite">
      <div class="graph-detail-placeholder">
        <i class="fas fa-book" aria-hidden="true"></i>
        <p>논문을 선택하세요.</p>
      </div>
    </aside>
  </div>

  <div id="library-legend" class="graph-legend" aria-label="주제 색상 범례"></div>

  <section class="library-list" aria-labelledby="library-list-title" hidden>
    <div class="library-list__header">
      <div>
        <h2 id="library-list-title">논문 목록</h2>
        <p id="library-list-count" role="status"></p>
      </div>
      <label for="library-list-sort">
        정렬
        <select id="library-list-sort">
          <option value="year">최신 연도순</option>
          <option value="reviewed">리뷰 우선 · 최신 연도순</option>
        </select>
      </label>
    </div>
    <p id="library-list-empty" hidden>조건에 맞는 논문이 없습니다.</p>
    <ul id="library-paper-list" role="list"></ul>
  </section>

  {% if lib.generated %}
    <p class="library-note">마지막 갱신 {{ lib.generated }}</p>
  {% endif %}

  <noscript>
    <p class="prompt-warning">그래프와 목록을 보려면 브라우저에서 JavaScript를 활성화해야 합니다.</p>
  </noscript>
</div>

<script id="library-data" type="application/json">{{ lib | jsonify | replace: '<', '\u003c' }}</script>
<script src="{{ '/assets/js/library-graph.js' | relative_url }}"></script>
