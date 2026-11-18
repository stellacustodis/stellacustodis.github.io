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
      점선은 직접 연결, 실선은 공통 태그, 색상은 상위 카테고리입니다.
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

    <label class="graph-edge-filter">
      <span class="visually-hidden">연결 기준</span>
      <select id="graph-edge-mode">
        <option value="all">전체 연결</option>
        <option value="explicit">본문 참조·직접 연결만</option>
        <option value="tags">공통 태그만</option>
      </select>
    </label>

    <button id="graph-reset" type="button" class="graph-button">
      <i class="fas fa-rotate-left" aria-hidden="true"></i>
      초기화
    </button>
  </div>

  <div class="graph-layout">
    <section class="graph-stage" aria-label="게시글 관계 그래프">
      <div class="graph-canvas-wrap">
        <svg id="graph-canvas" role="group" aria-labelledby="graph-title graph-description">
          <title id="graph-title">게시글 관계 그래프</title>
          <desc id="graph-description">본문 참조, 관련 글 연결, 공통 태그로 게시글을 연결한 그래프</desc>
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

        <p id="graph-empty" class="graph-empty" hidden>조건에 맞는 글이 없습니다.</p>
      </div>
      <p class="graph-help">드래그로 이동 · 휠로 확대·축소</p>
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

{%- assign graph_post_urls = site.posts | map: 'url' -%}
{%- assign graph_decoded_urls = '' | split: ',' -%}
{%- for graph_post_url in graph_post_urls -%}
  {%- assign graph_decoded_url = graph_post_url | replace: '+', '%2B' | url_decode -%}
  {%- assign graph_decoded_urls = graph_decoded_urls | push: graph_decoded_url -%}
{%- endfor -%}
{%- assign graph_base_prefix = '/posts/' | relative_url -%}
{%- assign graph_base_size = graph_base_prefix | size -%}
{%- capture graph_payload -%}
[
  {% for post in site.posts %}
    {%- assign graph_links = '' | split: ',' -%}
    {%- assign graph_anchors = post.content | split: '<a ' -%}
    {%- for graph_anchor in graph_anchors offset: 1 -%}
      {%- assign graph_attributes = graph_anchor | split: '>' | first | prepend: ' ' | split: ' href=' -%}
      {%- if graph_attributes.size > 1 -%}
        {%- assign graph_href = graph_attributes[1] -%}
        {%- assign graph_quote = graph_href | slice: 0, 1 -%}
        {%- if graph_quote == '"' or graph_quote == "'" -%}
          {%- assign graph_href = graph_href | remove_first: graph_quote | split: graph_quote | first | split: '#' | first | split: '?' | first -%}
          {%- assign graph_base_test = graph_href | slice: 0, graph_base_size -%}
          {%- if graph_base_prefix != '/posts/' and graph_base_test == graph_base_prefix -%}
            {%- assign graph_href = graph_href | remove_first: graph_base_prefix | prepend: '/posts/' -%}
          {%- endif -%}
          {%- assign graph_prefix = graph_href | slice: 0, 7 -%}
          {%- if graph_prefix == '/posts/' -%}
            {%- unless graph_post_urls contains graph_href -%}
              {%- assign graph_decoded_href = graph_href | replace: '+', '%2B' | url_decode -%}
              {%- assign graph_href = '' -%}
              {%- for graph_decoded_url in graph_decoded_urls -%}
                {%- if graph_decoded_url == graph_decoded_href -%}
                  {%- assign graph_href = graph_post_urls[forloop.index0] -%}
                  {%- break -%}
                {%- endif -%}
              {%- endfor -%}
            {%- endunless -%}
            {%- if graph_href != '' and graph_href != post.url -%}
              {%- assign graph_links = graph_links | push: graph_href -%}
            {%- endif -%}
          {%- endif -%}
        {%- endif -%}
      {%- endif -%}
    {%- endfor -%}
    {
      "id": {{ post.url | jsonify }},
      "title": {{ post.title | jsonify }},
      "url": {{ post.url | relative_url | jsonify }},
      "date": {{ post.date | date: "%Y-%m-%d" | jsonify }},
      "categories": {{ post.categories | default: empty | jsonify }},
      "tags": {{ post.tags | default: empty | jsonify }},
      "related": {{ post.related | default: empty | jsonify }},
      "links": {{ graph_links | uniq | jsonify }},
      "excerpt": {{ post.excerpt | strip_html | strip_newlines | truncate: 180 | jsonify }}
    }{% unless forloop.last %},{% endunless %}
  {% endfor %}
]
{%- endcapture -%}
<script id="graph-data" type="application/json">{{ graph_payload | replace: '<', '\u003c' }}</script>
<script src="{{ '/assets/js/graph.js' | relative_url }}"></script>
