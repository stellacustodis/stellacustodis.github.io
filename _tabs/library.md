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
      읽고 있는 논문들을 묶어 놓은 지도입니다. 논문 하나는 보통 여러 특성을 함께 가지므로
      <strong>계열</strong>(확산·자기회귀·Flow…), <strong>문제</strong>(생성·3D·복원…),
      <strong>성격</strong>(방법론·서베이·이론) 세 축으로 나눠 두었습니다.
      군집 기준을 바꾸면 같은 라이브러리가 다르게 묶입니다. 선은 제1저자가 같은 논문을 잇고,
      테두리가 있는 노드는 이 블로그에 리뷰가 있는 논문입니다.
    </p>
    <div class="graph-stats" aria-label="라이브러리 통계">
      <span><strong id="library-paper-count">{{ lib.papers | size }}</strong> papers</span>
      <span><strong id="library-edge-count">0</strong> connections</span>
      <span><strong>{{ lib.papers | where_exp: "p", "p.post != ''" | size }}</strong> reviewed</span>
    </div>
  </header>

  <div class="graph-toolbar" aria-label="라이브러리 필터">
    <label class="graph-search">
      <span class="visually-hidden">논문 검색</span>
      <i class="fas fa-search" aria-hidden="true"></i>
      <input id="library-search" type="search" placeholder="제목이나 저자 검색" autocomplete="off">
    </label>

    <label class="library-cluster-pick">
      <span>군집</span>
      <select id="library-cluster" aria-label="군집 기준">
        <option value="family">계열</option>
        <option value="task">문제</option>
        <option value="kind">성격</option>
      </select>
    </label>

    <label>
      <span class="visually-hidden">계열 필터</span>
      <select id="library-family" aria-label="계열 필터">
        <option value="">모든 계열</option>
      </select>
    </label>

    <label>
      <span class="visually-hidden">문제 필터</span>
      <select id="library-task" aria-label="문제 필터">
        <option value="">모든 문제</option>
      </select>
    </label>

    <label>
      <span class="visually-hidden">연도 필터</span>
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
        <desc id="library-desc">주제별로 묶고 제1저자가 같은 논문을 선으로 연결한 인터랙티브 그래프</desc>
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

      <p class="graph-help">
        노드를 드래그해 이동하고, 빈 공간을 드래그해 화면을 옮기세요. 스크롤로 확대·축소할 수 있습니다.
      </p>
      <p id="library-empty" class="graph-empty" hidden>조건에 맞는 논문이 없습니다.</p>
    </section>

    <aside class="graph-detail" id="library-detail" aria-live="polite">
      <div class="graph-detail-placeholder">
        <i class="fas fa-book" aria-hidden="true"></i>
        <p>노드를 선택하면 논문 정보를 볼 수 있습니다.</p>
      </div>
    </aside>
  </div>

  <div id="library-legend" class="graph-legend" aria-label="주제 색상 범례"></div>

  <p class="library-note">
    Zotero 라이브러리를 주제별로 자동 분류해 만든 데이터입니다.
    {% if lib.generated %}마지막 갱신 {{ lib.generated }}.{% endif %}
  </p>

  <noscript>
    <p class="prompt-warning">그래프를 보려면 브라우저에서 JavaScript를 활성화해야 합니다.</p>
  </noscript>
</div>

<script id="library-data" type="application/json">{{ lib | jsonify }}</script>
<script src="{{ '/assets/js/library-graph.js' | relative_url }}"></script>
