---
layout: page
title: Graph
icon: fas fa-circle-nodes
order: 1
permalink: /graph/
---

<link rel="stylesheet" href="{{ '/assets/css/graph.css' | relative_url }}">

<div class="knowledge-graph" id="knowledge-graph">
  <header class="graph-intro">
    <p>
      글 사이의 연결을 탐색하는 공간입니다. 같은 태그를 가진 글은 선으로 연결되고,
      같은 색의 노드는 같은 상위 카테고리에 속합니다.
    </p>
    <div class="graph-stats" aria-label="그래프 통계">
      <span><strong id="graph-post-count">{{ site.posts | size }}</strong> posts</span>
      <span><strong id="graph-edge-count">0</strong> connections</span>
    </div>
  </header>

  <div class="graph-toolbar" aria-label="그래프 필터">
    <label class="graph-search">
      <span class="visually-hidden">글 검색</span>
      <i class="fas fa-search" aria-hidden="true"></i>
      <input id="graph-search" type="search" placeholder="제목이나 태그 검색" autocomplete="off">
    </label>

    <label>
      <span class="visually-hidden">카테고리 필터</span>
      <select id="graph-category" aria-label="카테고리 필터">
        <option value="">모든 카테고리</option>
      </select>
    </label>

    <label>
      <span class="visually-hidden">태그 필터</span>
      <select id="graph-tag" aria-label="태그 필터">
        <option value="">모든 태그</option>
      </select>
    </label>

    <button id="graph-reset" type="button" class="graph-button">
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      초기화
    </button>
  </div>

  <div class="graph-layout">
    <section class="graph-canvas-wrap" aria-label="게시글 관계 그래프">
      <svg id="graph-canvas" role="img" aria-labelledby="graph-title graph-description">
        <title id="graph-title">게시글 관계 그래프</title>
        <desc id="graph-description">공통 태그가 있는 게시글을 선으로 연결한 인터랙티브 그래프</desc>
        <g id="graph-viewport">
          <g id="graph-edges"></g>
          <g id="graph-nodes"></g>
        </g>
      </svg>

      <div class="graph-zoom" aria-label="그래프 확대 및 축소">
        <button id="graph-zoom-in" type="button" aria-label="확대"><i class="fas fa-plus"></i></button>
        <button id="graph-zoom-out" type="button" aria-label="축소"><i class="fas fa-minus"></i></button>
        <button id="graph-fit" type="button" aria-label="화면에 맞추기"><i class="fas fa-expand"></i></button>
      </div>

      <p class="graph-help">
        노드를 드래그해 이동하고, 빈 공간을 드래그해 화면을 옮기세요. 스크롤로 확대·축소할 수 있습니다.
      </p>
      <p id="graph-empty" class="graph-empty" hidden>조건에 맞는 글이 없습니다.</p>
    </section>

    <aside class="graph-detail" id="graph-detail" aria-live="polite">
      <div class="graph-detail-placeholder">
        <i class="fas fa-circle-nodes" aria-hidden="true"></i>
        <p>노드를 선택하면 글과 연결 정보를 볼 수 있습니다.</p>
      </div>
    </aside>
  </div>

  <div id="graph-legend" class="graph-legend" aria-label="카테고리 색상 범례"></div>

  <noscript>
    <p class="prompt-warning">그래프를 보려면 브라우저에서 JavaScript를 활성화해야 합니다.</p>
  </noscript>
</div>

<script id="graph-data" type="application/json">
[
  {% for post in site.posts %}
    {
      "id": {{ post.url | jsonify }},
      "title": {{ post.title | jsonify }},
      "url": {{ post.url | relative_url | jsonify }},
      "date": {{ post.date | date: "%Y-%m-%d" | jsonify }},
      "categories": {{ post.categories | default: empty | jsonify }},
      "tags": {{ post.tags | default: empty | jsonify }},
      "related": {{ post.related | default: empty | jsonify }},
      "excerpt": {{ post.excerpt | strip_html | strip_newlines | truncate: 180 | jsonify }}
    }{% unless forloop.last %},{% endunless %}
  {% endfor %}
]
</script>
<script src="{{ '/assets/js/graph.js' | relative_url }}"></script>
