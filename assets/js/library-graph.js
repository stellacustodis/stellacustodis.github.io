(() => {
  'use strict';

  const root = document.getElementById('library-graph');
  const dataElement = document.getElementById('library-data');
  if (!root || !dataElement) return;

  const data = JSON.parse(dataElement.textContent);
  const facets = data.facets || {};
  const papers = (data.papers || []).map((p) => ({
    ...p,
    family: Array.isArray(p.family) ? p.family : [],
    task: Array.isArray(p.task) ? p.task : [],
  }));

  const label = new Map();
  Object.values(facets).forEach((list) => (list || []).forEach((f) => label.set(f.id, f.label)));

  const svg = document.getElementById('library-canvas');
  const viewport = document.getElementById('library-viewport');
  const edgeLayer = document.getElementById('library-edges');
  const nodeLayer = document.getElementById('library-nodes');
  const hullLayer = document.getElementById('library-hulls');
  const zoomControls = root.querySelector('.graph-zoom');
  const detail = document.getElementById('library-detail');
  const searchInput = document.getElementById('library-search');
  const clusterSelect = document.getElementById('library-cluster');
  const familySelect = document.getElementById('library-family');
  const taskSelect = document.getElementById('library-task');
  const yearSelect = document.getElementById('library-year');
  const reviewedOnly = document.getElementById('library-reviewed');
  const emptyMessage = document.getElementById('library-empty');
  const paperCount = document.getElementById('library-paper-count');
  const edgeCount = document.getElementById('library-edge-count');
  const legend = document.getElementById('library-legend');
  const paperList = document.getElementById('library-paper-list');
  const listCount = document.getElementById('library-list-count');
  const listEmpty = document.getElementById('library-list-empty');
  const listSort = document.getElementById('library-list-sort');
  const familyChips = document.getElementById('library-family-chips');
  const tabs = [...root.querySelectorAll('.library-tabs [role="tab"]')];
  const panels = {
    list: document.getElementById('library-panel-list'),
    graph: document.getElementById('library-panel-graph'),
  };
  const viewKey = 'stellacustodis-library-view:v1';
  let view = 'list';
  const ns = 'http://www.w3.org/2000/svg';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const palette = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2',
                   '#b279a2', '#ff9da6', '#9d755d', '#8c6bb1', '#3182bd', '#bab0ac'];
  const colors = new Map();
  let colorIndex = 0;
  function colorOf(key) {
    if (!colors.has(key)) {
      colors.set(key, key === 'none' ? '#b0b0b4' : palette[colorIndex++ % palette.length]);
    }
    return colors.get(key);
  }

  // 한 논문이 여러 라벨을 갖는다. 군집은 하나여야 하므로 첫 라벨로 자리를 정하고,
  // 나머지 라벨은 필터와 상세창에서 살아 있게 한다. 그래서 `문제: 효율` 로 거르면
  // 계열 군집 여기저기에 흩어져 걸린다 — 그게 이 논문들의 실제 모습이다.
  function labelsOf(paper, facet) {
    if (facet === 'kind') return [paper.kind || 'method'];
    const list = paper[facet] || [];
    return list.length ? list : ['none'];
  }

  function clusterKey(paper) {
    return labelsOf(paper, clusterSelect.value)[0];
  }

  function fill(select, list, allText) {
    select.replaceChildren(new Option(allText, ''));
    (list || []).forEach((f) => select.add(new Option(f.label, f.id)));
  }

  fill(familySelect, facets.family, '모든 계열');
  fill(taskSelect, facets.task, '모든 주제');
  [...new Set(papers.map((p) => p.year).filter(Boolean))].sort().reverse()
    .forEach((y) => yearSelect.add(new Option(y, y)));

  let nodes = [];
  let edges = [];
  let clusters = [];
  let matchedNodes = [];
  let selectedRow = null;
  let selectedId = null;
  let hoveredNode = null;
  let focusedNode = null;
  let visibleLabels = new Set();
  let labelFrame = null;
  let centerFrame = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let panState = null;
  let draggedNode = null;
  let dragMoved = false;
  let dragStart = null;

  function svgEl(name, attrs = {}) {
    const el = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function normalize(v) {
    return String(v || '').trim().toLocaleLowerCase();
  }

  // 군집의 겹침을 먼저 풀고, 각 군집 안의 논문은 해바라기 배열로 배치한다.
  function layout(visible) {
    const groups = new Map();
    visible.forEach((p) => {
      const k = clusterKey(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });

    const clusters = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([key, list], i, arr) => {
        const angle = (Math.PI * 2 * i) / Math.max(arr.length, 1) - Math.PI / 2;
        const spread = 240 + arr.length * 24;
        return {
          key,
          list,
          radius: 26 + Math.sqrt(list.length) * 26,
          x: Math.cos(angle) * spread,
          y: Math.sin(angle) * spread,
        };
      });

    for (let iter = 0; iter < 260; iter += 1) {
      for (let i = 0; i < clusters.length; i += 1) {
        for (let j = i + 1; j < clusters.length; j += 1) {
          const a = clusters[i];
          const b = clusters[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.max(Math.hypot(dx, dy), 1);
          const want = a.radius + b.radius + 112;
          if (d >= want) continue;
          const push = (want - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }

    const golden = Math.PI * (3 - Math.sqrt(5));
    const placed = [];
    clusters.forEach((c) => {
      c.list.forEach((p, i) => {
        const r = (c.radius - 14) * Math.sqrt((i + 0.5) / c.list.length);
        const a = i * golden;
        placed.push({ ...p, x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
      });
    });
    return { placed, clusters };
  }

  // 같은 제1저자를 잇는다. 라벨은 색과 위치가 이미 말해 주므로 간선까지 쓰면
  // 화면이 덮인다. 저자 연결은 드물고, 드물기 때문에 눈에 띈다.
  function buildEdges(visible) {
    const byAuthor = new Map();
    visible.forEach((p) => {
      const a = normalize(p.author);
      if (!a) return;
      if (!byAuthor.has(a)) byAuthor.set(a, []);
      byAuthor.get(a).push(p);
    });
    const out = [];
    byAuthor.forEach((list, author) => {
      if (list.length < 2 || list.length > 12) return;
      const sorted = [...list].sort((x, y) => (x.year || '').localeCompare(y.year || ''));
      for (let i = 0; i < sorted.length - 1; i += 1) {
        out.push({ source: sorted[i], target: sorted[i + 1], author });
      }
    });
    return out;
  }

  function applyFilters() {
    const fam = familySelect.value;
    const task = taskSelect.value;
    const year = yearSelect.value;

    const visible = papers
      .filter((p) => !fam || (fam === 'none' ? !p.family.length : p.family.includes(fam)))
      .filter((p) => !task || p.task.includes(task))
      .filter((p) => !year || p.year === year)
      .filter((p) => !reviewedOnly.checked || p.post);

    const placement = layout(visible);
    nodes = placement.placed;
    clusters = placement.clusters;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    edges = buildEdges(visible)
      .map((e) => ({ source: byId.get(e.source.id), target: byId.get(e.target.id), author: e.author }))
      .filter((e) => e.source && e.target);

    selectedId = nodes.some((n) => n.id === selectedId) ? selectedId : null;
    render();
    renderLegend(clusters);
    fitGraph();
  }

  function render() {
    hullLayer.replaceChildren();
    edgeLayer.replaceChildren();
    nodeLayer.replaceChildren();
    hoveredNode = null;
    focusedNode = null;
    visibleLabels.clear();

    clusters.forEach((c) => {
      const color = colorOf(c.key);
      hullLayer.appendChild(svgEl('circle', {
        class: 'library-hull', cx: c.x, cy: c.y, r: c.radius + 12,
        fill: color, 'fill-opacity': 0.07, stroke: color, 'stroke-opacity': 0.28,
      }));
      const text = svgEl('text', {
        class: 'library-hull-label', x: c.x, y: c.y - c.radius - 36,
      });
      text.textContent = `${label.get(c.key) || c.key} · ${c.list.length}`;
      hullLayer.appendChild(text);
      c.caption = text;
    });

    edges.forEach((edge) => {
      edge.element = svgEl('line', { class: 'graph-edge library-edge' });
      const t = svgEl('title');
      t.textContent = `같은 제1저자: ${edge.author}`;
      edge.element.appendChild(t);
      edgeLayer.appendChild(edge.element);
    });

    nodes.forEach((node) => {
      const multi = node.family.length + node.task.length > 2;
      const group = svgEl('g', {
        class: `graph-node library-node${node.post ? ' is-reviewed' : ''}`,
        role: 'button', tabindex: '0',
        'aria-label': `${node.title}${node.post ? ' (리뷰 있음)' : ''}`,
        'aria-pressed': 'false',
      });
      node.radius = node.post ? 8 : 5;
      const color = colorOf(clusterKey(node));
      group.appendChild(svgEl('circle', { r: node.radius, fill: color }));
      if (node.post) {
        group.appendChild(svgEl('circle', {
          class: 'library-ring', r: node.radius + 4, fill: 'none',
        }));
      }
      const t = svgEl('title');
      const tags = [...node.family, ...node.task].map((x) => label.get(x) || x).join(', ');
      t.textContent = `${node.title}${node.year ? ` (${node.year})` : ''}\n${tags}`;
      group.appendChild(t);
      const caption = svgEl('text', {
        class: 'library-node-label', y: node.radius + (node.post ? 7 : 3), 'aria-hidden': 'true',
      });
      caption.textContent = truncate(node.title, 28);
      group.appendChild(caption);
      if (multi) group.classList.add('is-multi');
      group.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        hoveredNode = node;
        scheduleLabelUpdate();
      });
      group.addEventListener('pointerleave', () => {
        if (hoveredNode === node) {
          hoveredNode = null;
          scheduleLabelUpdate();
        }
      });
      group.addEventListener('focus', () => {
        focusedNode = node;
        scheduleLabelUpdate();
      });
      group.addEventListener('blur', () => {
        focusedNode = null;
        scheduleLabelUpdate();
      });
      group.addEventListener('pointerdown', (e) => startNodeDrag(e, node));
      group.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        selectNode(node.id, { revealRow: true });
      });
      if (node.post) {
        group.addEventListener('dblclick', () => {
          if (!dragMoved) window.location.assign(node.post);
        });
      }
      node.element = group;
      node.caption = caption;
      nodeLayer.appendChild(group);
    });

    paperCount.textContent = nodes.length;
    edgeCount.textContent = edges.length;
    emptyMessage.hidden = nodes.length !== 0;
    updatePositions();
    updateSearchHighlight();
    if (selectedId) selectNode(selectedId);
    else showPlaceholder();
  }

  function updatePositions() {
    edges.forEach((e) => {
      e.element.setAttribute('x1', e.source.x);
      e.element.setAttribute('y1', e.source.y);
      e.element.setAttribute('x2', e.target.x);
      e.element.setAttribute('y2', e.target.y);
    });
    nodes.forEach((n) => n.element.setAttribute('transform', `translate(${n.x} ${n.y})`));
    scheduleLabelUpdate();
  }

  function selectNode(id, { center = false, revealRow = false } = {}) {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    selectedId = id;
    const linked = edges.filter((e) => e.source === node || e.target === node);
    const near = new Set([id]);
    linked.forEach((e) => { near.add(e.source.id); near.add(e.target.id); });

    nodes.forEach((n) => {
      n.element.classList.toggle('is-dimmed', !near.has(n.id));
      n.element.classList.toggle('is-selected', n.id === id);
      n.element.setAttribute('aria-pressed', String(n.id === id));
    });
    edges.forEach((e) => e.element.classList.toggle('is-active', linked.includes(e)));
    updateListSelection();
    renderDetail(node, linked);
    scheduleLabelUpdate();
    if (center) centerNode(node);
    if (revealRow) revealSelectedRow();
    writeParams();
  }

  function chip(id, facet) {
    return `<button type="button" class="graph-tag library-chip" data-facet="${facet}" data-value="${escapeHtml(id)}">${escapeHtml(label.get(id) || id)}</button>`;
  }

  function renderDetail(node, linked) {
    const others = linked.map((e) => (e.source === node ? e.target : e.source));
    const out = [
      '<button type="button" class="library-detail__close" aria-label="상세 닫기"><i class="fas fa-xmark" aria-hidden="true"></i></button>',
      `<h3 class="graph-detail-title">${escapeHtml(node.title)}</h3>`,
    ];
    out.push(`<p class="graph-detail-meta">${escapeHtml([node.year, node.author].filter(Boolean).join(' · '))}</p>`);

    const rows = [];
    if (node.family.length) rows.push(['계열', node.family.map((x) => chip(x, 'family')).join('')]);
    if (node.task.length) rows.push(['주제', node.task.map((x) => chip(x, 'task')).join('')]);
    if (node.kind) rows.push(['성격', `<span class="graph-tag">${escapeHtml(label.get(node.kind) || node.kind)}</span>`]);
    rows.forEach(([name, html]) => {
      out.push(`<p class="library-facet"><span class="library-facet-name">${name}</span>${html}</p>`);
    });

    const links = [];
    if (node.post) links.push(`<a class="library-action library-action--review" href="${escapeHtml(node.post)}">리뷰 읽기</a>`);
    if (node.url) links.push(`<a class="library-action" href="${escapeHtml(node.url)}" target="_blank" rel="noopener">원문 <span aria-hidden="true">↗</span></a>`);
    if (links.length) out.push(`<p class="library-detail__actions">${links.join('')}</p>`);

    if (others.length) {
      out.push('<p class="graph-detail-meta">같은 제1저자</p><ul class="graph-neighbor-list">');
      others.slice(0, 8).forEach((o) => {
        out.push(`<li><button type="button" data-node-id="${escapeHtml(o.id)}">${escapeHtml(truncate(o.title, 46))}</button></li>`);
      });
      out.push('</ul>');
    }
    detail.innerHTML = out.join('');
    detail.hidden = false;
    detail.querySelector('.library-detail__close').addEventListener('click', clearSelection);
    detail.querySelectorAll('button[data-node-id]').forEach((b) => {
      b.addEventListener('click', () => selectNode(b.dataset.nodeId, { center: true, revealRow: true }));
    });
    // 라벨을 누르면 그 라벨로 걸러진다 — 여러 특성을 타고 넘어가는 통로다.
    detail.querySelectorAll('button[data-facet]').forEach((b) => {
      b.addEventListener('click', () => applyFacet(b.dataset.facet, b.dataset.value));
    });
  }

  function applyFacet(facet, value) {
    (facet === 'family' ? familySelect : taskSelect).value = value;
    onFilterChange();
  }

  function clearSelection() {
    selectedId = null;
    showPlaceholder();
    updateListSelection();
    writeParams();
  }

  function showPlaceholder() {
    detail.hidden = true;
    detail.replaceChildren();
    nodes.forEach((n) => n.element.classList.remove('is-dimmed', 'is-selected'));
    edges.forEach((e) => e.element.classList.remove('is-active'));
  }

  function updateSearchHighlight() {
    const q = normalize(searchInput.value);
    matchedNodes = [];
    nodes.forEach((n) => {
      const hit = !q || normalize(n.title).includes(q) || normalize(n.author).includes(q);
      if (hit) matchedNodes.push(n);
      n.element.classList.toggle('is-match', Boolean(q) && hit);
      n.element.classList.toggle('is-faded', Boolean(q) && !hit);
    });
    renderPaperList();
    scheduleLabelUpdate();
  }

  function scheduleLabelUpdate() {
    if (labelFrame === null) labelFrame = requestAnimationFrame(updateNodeLabels);
  }

  function labelCandidates() {
    if (normalize(searchInput.value)) return matchedNodes.length <= 25 ? matchedNodes : [];
    if (transform.scale >= 3.2) return nodes;
    return transform.scale >= 2.2 ? nodes.filter((node) => node.post) : [];
  }

  function labelOverlaps(a, b) {
    const gap = 4;
    return a.left < b.right + gap && a.right + gap > b.left
      && a.top < b.bottom + gap && a.bottom + gap > b.top;
  }

  function updateNodeLabels() {
    labelFrame = null;
    const selected = nodes.find((node) => node.id === selectedId);
    const focused = focusedNode?.element.matches(':focus-visible') ? focusedNode : null;
    const active = new Set([focused, hoveredNode, selected].filter(Boolean));
    const candidates = new Set([...active, ...labelCandidates()]);
    const next = new Set();
    if (candidates.size) {
      const canvas = svg.getBoundingClientRect();
      const reserved = [zoomControls.getBoundingClientRect(),
        ...clusters.map((cluster) => cluster.caption.getBoundingClientRect())];
      const occupied = [];

      for (const node of candidates) {
        const isActive = active.has(node);
        const x = transform.x + node.x * transform.scale;
        const y = transform.y + node.y * transform.scale;
        if (!isActive && (x < 0 || x > canvas.width || y < 0 || y > canvas.height)) continue;
        const bounds = node.caption.getBoundingClientRect();
        if (!isActive && (bounds.left < canvas.left || bounds.right > canvas.right
            || bounds.top < canvas.top || bounds.bottom > canvas.bottom
            || reserved.some((used) => labelOverlaps(bounds, used)))) continue;
        if (occupied.some((used) => labelOverlaps(bounds, used))) continue;
        next.add(node);
        occupied.push(bounds);
      }
    }
    for (const node of visibleLabels) {
      if (!next.has(node)) node.element.classList.remove('is-label-visible');
    }
    for (const node of next) {
      if (!visibleLabels.has(node)) node.element.classList.add('is-label-visible');
    }
    visibleLabels = next;
  }

  function updateListSelection() {
    selectedRow?.removeAttribute('aria-current');
    selectedRow = selectedId ? document.getElementById(`library-row-${selectedId}`) : null;
    selectedRow?.setAttribute('aria-current', 'true');
  }

  function revealSelectedRow() {
    // 목록 화면일 때만 행으로 스크롤한다. 그래프 화면에서는 목록이 숨어 있다.
    if (!selectedRow || view !== 'list') return;
    selectedRow.scrollIntoView({ block: 'nearest' });
  }

  function renderPaperList() {
    const reviewsFirst = listSort.value === 'reviewed';
    const sorted = [...matchedNodes].sort((a, b) => {
      const reviewOrder = reviewsFirst ? Number(Boolean(b.post)) - Number(Boolean(a.post)) : 0;
      return reviewOrder || (Number(b.year) || 0) - (Number(a.year) || 0)
        || a.title.localeCompare(b.title);
    });

    const rows = document.createDocumentFragment();
    for (const paper of sorted) {
      const item = document.createElement('li');
      item.className = `library-paper${paper.post ? ' is-reviewed' : ''}`;
      item.id = `library-row-${paper.id}`;

      const year = document.createElement('span');
      year.className = 'library-paper__year';
      year.textContent = paper.year || '미상';

      const main = document.createElement('div');
      main.className = 'library-paper__main';
      const title = document.createElement(paper.post ? 'a' : 'span');
      title.className = 'library-paper__title';
      title.textContent = paper.title;
      if (paper.post) title.href = paper.post;
      const meta = document.createElement('div');
      meta.className = 'library-paper__meta';
      if (paper.author) {
        const author = document.createElement('span');
        author.className = 'library-paper__author';
        author.textContent = paper.author;
        meta.append(author);
      }
      for (const id of paper.family) meta.append(facetChip(id, 'family'));
      for (const id of paper.task) meta.append(facetChip(id, 'task'));
      if (paper.kind && paper.kind !== 'method') {
        const kind = document.createElement('span');
        kind.className = 'library-chip library-chip--static';
        kind.textContent = label.get(paper.kind) || paper.kind;
        meta.append(kind);
      }
      main.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'library-paper__actions';
      if (paper.post) {
        const review = document.createElement('a');
        review.className = 'library-action library-action--review';
        review.href = paper.post;
        review.textContent = '리뷰 읽기';
        actions.append(review);
      }
      if (paper.url) {
        const source = document.createElement('a');
        source.className = 'library-action';
        source.href = paper.url;
        source.target = '_blank';
        source.rel = 'noopener';
        source.innerHTML = '원문 <span aria-hidden="true">↗</span>';
        source.setAttribute('aria-label', `${paper.title} 원문 (새 탭)`);
        actions.append(source);
      }
      const locate = document.createElement('button');
      locate.type = 'button';
      locate.className = 'library-action library-action--icon';
      locate.dataset.action = 'graph';
      locate.dataset.paperId = paper.id;
      locate.setAttribute('aria-label', `${paper.title} 그래프에서 보기`);
      locate.title = '그래프에서 보기';
      locate.innerHTML = '<i class="fas fa-circle-nodes" aria-hidden="true"></i>';
      actions.append(locate);

      item.append(year, main, actions);
      rows.append(item);
    }
    paperList.replaceChildren(rows);
    listCount.textContent = String(sorted.length);
    listEmpty.hidden = sorted.length > 0;
    updateListSelection();
  }

  function facetChip(id, facet) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'library-chip';
    button.dataset.facet = facet;
    button.dataset.value = id;
    button.textContent = label.get(id) || id;
    return button;
  }

  // ── 계열 빠른 칩 ───────────────────────────────────────
  function renderFamilyChips() {
    const counts = new Map();
    for (const paper of papers) {
      const keys = paper.family.length ? paper.family : ['none'];
      for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
    }
    const entries = [{ id: '', label: '전체', count: papers.length }]
      .concat((facets.family || []).map((f) => ({ ...f, count: counts.get(f.id) || 0 }))
        .filter((f) => f.count > 0)
        .sort((a, b) => (a.id === 'none') - (b.id === 'none') || b.count - a.count));
    familyChips.replaceChildren(...entries.map((f) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'library-quick';
      button.dataset.value = f.id;
      if (f.id) {
        const dot = document.createElement('i');
        dot.className = 'library-quick__dot';
        dot.style.background = colorOf(f.id);
        dot.setAttribute('aria-hidden', 'true');
        button.append(dot);
      }
      button.append(document.createTextNode(f.label));
      const count = document.createElement('small');
      count.textContent = f.count;
      button.append(count);
      button.addEventListener('click', () => {
        familySelect.value = f.id;
        onFilterChange();
      });
      return button;
    }));
    syncFamilyChips();
  }

  function syncFamilyChips() {
    for (const button of familyChips.children) {
      button.setAttribute('aria-pressed', String(button.dataset.value === familySelect.value));
    }
  }

  // ── 목록 · 그래프 전환 ─────────────────────────────────
  function setView(next, { focus = false, persist = true } = {}) {
    view = next === 'graph' ? 'graph' : 'list';
    root.dataset.view = view;
    for (const tab of tabs) {
      const active = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    panels.list.hidden = view !== 'list';
    panels.graph.hidden = view !== 'graph';
    if (persist) {
      try { localStorage.setItem(viewKey, view); } catch { /* 편의 기능 */ }
    }
    writeParams();
    if (view === 'graph') {
      requestAnimationFrame(() => {
        fitGraph();
        const node = nodes.find((n) => n.id === selectedId);
        if (node) centerNode(node, false);
      });
    }
  }

  function storedView() {
    try { return localStorage.getItem(viewKey); } catch { return null; }
  }

  function renderLegend(clusters) {
    legend.replaceChildren();
    clusters.forEach((c) => {
      const item = document.createElement('span');
      item.innerHTML = `<i style="background:${colorOf(c.key)}"></i>${escapeHtml(label.get(c.key) || c.key)} <small>${c.list.length}</small>`;
      legend.appendChild(item);
    });
  }

  // ── 이동·확대 ───────────────────────────────────────────
  // SVG 에 viewBox 가 없어 사용자 좌표 원점은 좌상단이다. 배치는 원점을 중심으로
  // 계산하므로, 화면 중앙으로 옮기는 몫까지 transform 이 들고 있는다.
  function startNodeDrag(event, node) {
    event.stopPropagation();
    if (!event.isPrimary || event.button !== 0) return;
    cancelCenter();
    draggedNode = node;
    dragStart = { x: event.clientX, y: event.clientY };
    dragMoved = false;
    node.element.setPointerCapture(event.pointerId);
  }

  function toGraphPoint(event) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - transform.x) / transform.scale,
      y: (event.clientY - rect.top - transform.y) / transform.scale,
    };
  }

  function setTransform() {
    viewport.setAttribute('transform',
      `translate(${transform.x} ${transform.y}) scale(${transform.scale})`);
    viewport.style.setProperty('--library-label-size', `${Math.min(20, 11 / transform.scale)}px`);
    scheduleLabelUpdate();
  }

  function cancelCenter() {
    if (centerFrame === null) return;
    cancelAnimationFrame(centerFrame);
    centerFrame = null;
  }

  function centerNode(node, animate = true) {
    cancelCenter();
    const { width, height, left, top } = svg.getBoundingClientRect();
    if (!width || !height) return;

    const minScale = 1.2;
    const margin = 24;
    const x = transform.x + node.x * transform.scale;
    const y = transform.y + node.y * transform.scale;
    // 확대 버튼은 그래프 왼쪽 위에 있다.
    const controls = zoomControls.getBoundingClientRect();
    const overlapsControls = x < controls.right - left + margin && y < controls.bottom - top + margin;
    if (transform.scale >= minScale && !overlapsControls
        && x >= margin && x <= width - margin && y >= margin && y <= height - margin) return;

    const scale = Math.max(transform.scale, minScale);
    // 상세 패널이 그래프 오른쪽 위에 떠 있으면 그 폭을 빼고 가운데를 잡는다.
    const overlay = !detail.hidden && getComputedStyle(detail).position === 'absolute'
      ? detail.offsetWidth + 24 : 0;
    const target = { x: (width - overlay) / 2 - node.x * scale, y: height / 2 - node.y * scale, scale };
    if (!animate || reducedMotion.matches) {
      transform = target;
      setTransform();
      return;
    }

    const start = { ...transform };
    const startedAt = performance.now();
    const move = (now) => {
      const progress = Math.min(1, (now - startedAt) / 260);
      const eased = 1 - (1 - progress) ** 3;
      transform.x = start.x + (target.x - start.x) * eased;
      transform.y = start.y + (target.y - start.y) * eased;
      transform.scale = start.scale + (target.scale - start.scale) * eased;
      setTransform();
      centerFrame = progress < 1 ? requestAnimationFrame(move) : null;
    };
    centerFrame = requestAnimationFrame(move);
  }

  function fitGraph() {
    cancelCenter();
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (!nodes.length) {
      transform = { x: rect.width / 2, y: rect.height / 2, scale: 1 };
      setTransform();
      return;
    }
    const bounds = nodes.map((node) => {
      const radius = node.radius + 6;
      return [node.x - radius, node.y - radius, node.x + radius, node.y + radius];
    });
    for (const cluster of clusters) {
      const radius = cluster.radius + 24;
      const caption = cluster.caption.getBBox();
      bounds.push([
        Math.min(cluster.x - radius, caption.x),
        Math.min(cluster.y - cluster.radius - 40, caption.y),
        Math.max(cluster.x + radius, caption.x + caption.width),
        Math.max(cluster.y + radius, caption.y + caption.height),
      ]);
    }
    const minX = Math.min(...bounds.map((bound) => bound[0]));
    const minY = Math.min(...bounds.map((bound) => bound[1]));
    const maxX = Math.max(...bounds.map((bound) => bound[2]));
    const maxY = Math.max(...bounds.map((bound) => bound[3]));
    const pad = 12;
    // 왼쪽은 확대 버튼, 오른쪽은 떠 있는 상세 패널을 피해서 맞춘다.
    const leftEdge = zoomControls.getBoundingClientRect().right - rect.left;
    const overlay = !detail.hidden && getComputedStyle(detail).position === 'absolute'
      ? detail.offsetWidth + 24 : 0;
    const width = Math.max(1, rect.width - leftEdge - overlay - pad * 2);
    const height = Math.max(1, rect.height - pad * 2);
    transform.scale = Math.min(width / (maxX - minX), height / (maxY - minY), 1.6);
    transform.x = leftEdge + pad + width / 2 - ((minX + maxX) / 2) * transform.scale;
    transform.y = pad + height / 2 - ((minY + maxY) / 2) * transform.scale;
    setTransform();
  }

  function zoomAt(factor) {
    cancelCenter();
    const rect = svg.getBoundingClientRect();
    const px = rect.width / 2;
    const py = rect.height / 2;
    const next = Math.min(Math.max(transform.scale * factor, 0.15), 6);
    const ratio = next / transform.scale;
    transform.x = px - (px - transform.x) * ratio;
    transform.y = py - (py - transform.y) * ratio;
    transform.scale = next;
    setTransform();
  }

  // ── 주소에 상태 남기기 ──────────────────────────────────
  function readParams() {
    const params = new URLSearchParams(window.location.search);
    const restoreSelect = (select, name, fallback = '') => {
      const value = params.get(name);
      select.value = [...select.options].some((option) => option.value === value) ? value : fallback;
    };
    restoreSelect(clusterSelect, 'cluster', 'family');
    restoreSelect(familySelect, 'family');
    restoreSelect(taskSelect, 'task');
    restoreSelect(yearSelect, 'year');
    reviewedOnly.checked = params.get('reviewed') === '1';
    searchInput.value = params.get('q') ?? '';
    selectedId = params.get('paper');
    view = params.get('view') || storedView() || 'list';
  }

  function writeParams() {
    const url = new URL(window.location.href);
    const state = {
      cluster: clusterSelect.value === 'family' ? '' : clusterSelect.value,
      family: familySelect.value,
      task: taskSelect.value,
      year: yearSelect.value,
      reviewed: reviewedOnly.checked ? '1' : '',
      q: searchInput.value.trim(),
      paper: selectedId,
      view: view === 'graph' ? 'graph' : '',
    };
    for (const [name, value] of Object.entries(state)) {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }

  function restoreState() {
    readParams();
    applyFilters();
    syncFamilyChips();
    setView(view, { persist: false });
    revealSelectedRow();
  }

  function onFilterChange() {
    applyFilters();
    syncFamilyChips();
    writeParams();
  }

  searchInput.addEventListener('input', () => { writeParams(); updateSearchHighlight(); });
  listSort.addEventListener('change', renderPaperList);
  paperList.addEventListener('click', (event) => {
    const chipButton = event.target.closest('button[data-facet]');
    if (chipButton) {
      applyFacet(chipButton.dataset.facet, chipButton.dataset.value);
      return;
    }
    const locate = event.target.closest('button[data-action="graph"]');
    if (!locate) return;
    selectedId = locate.dataset.paperId;
    setView('graph');
    requestAnimationFrame(() => {
      selectNode(locate.dataset.paperId, { center: true });
      const heading = detail.querySelector('.graph-detail-title');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      panels.graph.scrollIntoView({ block: 'nearest' });
    });
  });

  // 그래프 화면에서 Esc로 상세 패널을 닫는다.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || view !== 'graph' || detail.hidden) return;
    const node = nodes.find((n) => n.id === selectedId);
    clearSelection();
    node?.element.focus({ preventScroll: true });
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      setView(next.dataset.view, { focus: true });
    });
  });
  [clusterSelect, familySelect, taskSelect, yearSelect, reviewedOnly]
    .forEach((el) => el.addEventListener('change', onFilterChange));
  document.getElementById('library-reset').addEventListener('click', () => {
    clusterSelect.value = 'family';
    familySelect.value = ''; taskSelect.value = ''; yearSelect.value = '';
    reviewedOnly.checked = false; searchInput.value = '';
    selectedId = null;
    onFilterChange();
  });
  document.getElementById('library-zoom-in').addEventListener('click', () => zoomAt(1.25));
  document.getElementById('library-zoom-out').addEventListener('click', () => zoomAt(0.8));
  document.getElementById('library-fit').addEventListener('click', fitGraph);

  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.1 : 0.9);
  }, { passive: false });

  svg.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || draggedNode) return;
    cancelCenter();
    panState = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', (event) => {
    if (!event.isPrimary) return;
    if (draggedNode) {
      // 터치에서는 탭에도 몇 px 흔들린다. 그만큼은 드래그로 보지 않는다.
      if (!dragMoved && dragStart
          && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) < 4) return;
      const p = toGraphPoint(event);
      draggedNode.x = p.x; draggedNode.y = p.y;
      dragMoved = true;
      updatePositions();
      return;
    }
    if (!panState) return;
    transform.x = panState.tx + (event.clientX - panState.x);
    transform.y = panState.ty + (event.clientY - panState.y);
    setTransform();
  });

  function endPointer(event, cancelled) {
    if (!event.isPrimary) return;
    if (draggedNode) {
      if (!cancelled && !dragMoved) selectNode(draggedNode.id, { revealRow: true });
      draggedNode = null;
    }
    dragStart = null;
    panState = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  }

  svg.addEventListener('pointerup', (event) => endPointer(event, false));
  svg.addEventListener('pointercancel', (event) => endPointer(event, true));

  // 모바일은 주소창이 접히고 펴질 때마다 resize가 온다. 폭이 바뀔 때만 다시 맞춘다.
  let fittedWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === fittedWidth) return;
    fittedWidth = window.innerWidth;
    fitGraph();
  });

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  window.addEventListener('popstate', restoreState);
  restoreState();
  renderFamilyChips();
})();
