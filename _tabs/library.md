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

<div class="knowledge-graph library-graph" id="library-graph" data-view="list">
  <header class="graph-intro library-intro">
    <p>
      Zotero에 등록한 논문과 블로그에서 리뷰한 논문을 모델 계열·주제·성격별로 볼 수 있습니다.
      목록에서 바로 찾아 읽거나, 그래프에서 제1저자가 같은 논문끼리 이어 볼 수 있습니다.
    </p>
    <div class="graph-stats" aria-label="라이브러리 통계">
      <span><strong id="library-paper-count">{{ lib.papers | size }}</strong> papers</span>
      <span><strong>{{ lib.papers | where_exp: "p", "p.post != ''" | size }}</strong> reviewed</span>
      <span class="library-graph-only"><strong id="library-edge-count">0</strong> connections</span>
    </div>
  </header>

  <div class="graph-toolbar library-toolbar" aria-label="라이브러리 필터">
    <label class="graph-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input id="library-search" type="search" aria-label="논문 검색" placeholder="제목이나 저자 검색" autocomplete="off">
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

    <button id="library-reset" type="button" class="graph-button library-reset" aria-label="필터 초기화" title="필터 초기화">
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
    </button>
  </div>

  <div id="library-family-chips" class="library-chips" role="group" aria-label="계열 빠른 선택"></div>

  <div class="library-viewbar">
    <div class="library-tabs" role="tablist" aria-label="보기 방식">
      <button type="button" role="tab" id="library-tab-list" aria-controls="library-panel-list" aria-selected="true" data-view="list">
        <i class="fas fa-list" aria-hidden="true"></i> 목록 <span id="library-list-count" class="library-tabs__count" role="status"></span>
      </button>
      <button type="button" role="tab" id="library-tab-graph" aria-controls="library-panel-graph" aria-selected="false" data-view="graph" tabindex="-1">
        <i class="fas fa-circle-nodes" aria-hidden="true"></i> 그래프
      </button>
    </div>

    <label class="library-viewbar__control library-list-only" for="library-list-sort">
      정렬
      <select id="library-list-sort">
        <option value="year">최신 연도순</option>
        <option value="reviewed">리뷰 우선 · 최신 연도순</option>
      </select>
    </label>

    <label class="library-viewbar__control library-graph-only" for="library-cluster">
      묶음
      <select id="library-cluster" aria-label="군집 기준">
        <option value="family">계열</option>
        <option value="task">주제</option>
        <option value="kind">성격</option>
      </select>
    </label>
  </div>

  <section id="library-panel-list" class="library-list" role="tabpanel" aria-labelledby="library-tab-list">
    <h2 id="library-list-title" class="visually-hidden">논문 목록</h2>
    <p id="library-list-empty" class="library-empty" hidden>조건에 맞는 논문이 없습니다.</p>
    <ul id="library-paper-list" role="list"></ul>
  </section>

  <section id="library-panel-graph" class="graph-stage library-stage" role="tabpanel" aria-labelledby="library-tab-graph" hidden>
    <div class="graph-canvas-wrap">
      <svg id="library-canvas" role="group" aria-labelledby="library-title library-desc" aria-describedby="library-help">
        <title id="library-title">논문 라이브러리 그래프</title>
        <desc id="library-desc">제1저자가 같은 논문을 연결한 그래프</desc>
        <g id="library-viewport">
          <g id="library-hulls"></g>
          <g id="library-edges"></g>
          <g id="library-nodes"></g>
        </g>
      </svg>

      <div class="graph-zoom" aria-label="확대 및 축소">
        <button id="library-zoom-in" type="button" aria-label="확대"><i class="fas fa-plus" aria-hidden="true"></i></button>
        <button id="library-zoom-out" type="button" aria-label="축소"><i class="fas fa-minus" aria-hidden="true"></i></button>
        <button id="library-fit" type="button" aria-label="화면에 맞추기"><i class="fas fa-expand" aria-hidden="true"></i></button>
      </div>

      <aside class="graph-detail library-detail" id="library-detail" aria-live="polite" hidden></aside>

      <p id="library-empty" class="graph-empty" hidden>조건에 맞는 논문이 없습니다.</p>
    </div>
    <p id="library-help" class="graph-help">드래그로 이동 · 휠로 확대·축소 · 노드를 누르면 상세 정보 · 리뷰 노드는 더블클릭 시 글로 이동</p>
    <div id="library-legend" class="graph-legend" aria-label="색상 범례"></div>
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
