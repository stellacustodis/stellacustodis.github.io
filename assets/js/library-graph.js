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
  const ns = 'http://www.w3.org/2000/svg';

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
  fill(taskSelect, facets.task, '모든 문제');
  [...new Set(papers.map((p) => p.year).filter(Boolean))].sort().reverse()
    .forEach((y) => yearSelect.add(new Option(y, y)));

  let nodes = [];
  let edges = [];
  let selectedId = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let panState = null;
  let draggedNode = null;
  let dragMoved = false;

  function svgEl(name, attrs = {}) {
    const el = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function normalize(v) {
    return String(v || '').trim().toLocaleLowerCase();
  }

  // ── 배치 ────────────────────────────────────────────────
  // 473편에 힘 기반 시뮬레이션을 돌리면 매 틱 11만 쌍이라 브라우저가 버티지 못한다.
  // 라벨이 이미 군집을 정해 주므로 배치는 결정론적으로 계산한다.
  // 군집끼리는 겹침만 풀고(십여 개뿐이라 싸다), 군집 안은 해바라기 배열로 채운다.
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
          const want = a.radius + b.radius + 56;
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

    const { placed, clusters } = layout(visible);
    nodes = placed;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    edges = buildEdges(visible)
      .map((e) => ({ source: byId.get(e.source.id), target: byId.get(e.target.id), author: e.author }))
      .filter((e) => e.source && e.target);

    selectedId = nodes.some((n) => n.id === selectedId) ? selectedId : null;
    render(clusters);
    renderLegend(clusters);
    fitGraph();
  }

  function render(clusters) {
    hullLayer.replaceChildren();
    edgeLayer.replaceChildren();
    nodeLayer.replaceChildren();

    clusters.forEach((c) => {
      const color = colorOf(c.key);
      hullLayer.appendChild(svgEl('circle', {
        class: 'library-hull', cx: c.x, cy: c.y, r: c.radius + 12,
        fill: color, 'fill-opacity': 0.07, stroke: color, 'stroke-opacity': 0.28,
      }));
      const text = svgEl('text', {
        class: 'library-hull-label', x: c.x, y: c.y - c.radius - 20, fill: color,
      });
      text.textContent = `${label.get(c.key) || c.key} · ${c.list.length}`;
      hullLayer.appendChild(text);
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
      });
      node.radius = node.post ? 8 : 5;
      const color = colorOf(clusterKey(node));
      group.appendChild(svgEl('circle', { r: node.radius, fill: color }));
      if (node.post) {
        group.appendChild(svgEl('circle', {
          class: 'library-ring', r: node.radius + 4, fill: 'none', stroke: color,
        }));
      }
      const t = svgEl('title');
      const tags = [...node.family, ...node.task].map((x) => label.get(x) || x).join(', ');
      t.textContent = `${node.title}${node.year ? ` (${node.year})` : ''}\n${tags}`;
      group.appendChild(t);
      if (multi) group.classList.add('is-multi');
      group.addEventListener('pointerdown', (e) => startNodeDrag(e, node));
      group.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node.id); }
      });
      node.element = group;
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
  }

  function selectNode(id) {
    selectedId = id;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const linked = edges.filter((e) => e.source === node || e.target === node);
    const near = new Set([id]);
    linked.forEach((e) => { near.add(e.source.id); near.add(e.target.id); });

    nodes.forEach((n) => {
      n.element.classList.toggle('is-dimmed', !near.has(n.id));
      n.element.classList.toggle('is-selected', n.id === id);
    });
    edges.forEach((e) => e.element.classList.toggle('is-active', linked.includes(e)));
    renderDetail(node, linked);
  }

  function chip(id, facet) {
    return `<button type="button" class="graph-tag library-chip" data-facet="${facet}" data-value="${escapeHtml(id)}">${escapeHtml(label.get(id) || id)}</button>`;
  }

  function renderDetail(node, linked) {
    const others = linked.map((e) => (e.source === node ? e.target : e.source));
    const out = [`<h3 class="graph-detail-title">${escapeHtml(node.title)}</h3>`];
    out.push(`<p class="graph-detail-meta">${escapeHtml([node.year, node.author].filter(Boolean).join(' · '))}</p>`);

    const rows = [];
    if (node.family.length) rows.push(['계열', node.family.map((x) => chip(x, 'family')).join('')]);
    if (node.task.length) rows.push(['문제', node.task.map((x) => chip(x, 'task')).join('')]);
    if (node.kind) rows.push(['성격', `<span class="graph-tag">${escapeHtml(label.get(node.kind) || node.kind)}</span>`]);
    rows.forEach(([name, html]) => {
      out.push(`<p class="library-facet"><span class="library-facet-name">${name}</span>${html}</p>`);
    });

    if (node.post) out.push(`<p><a class="graph-button" href="${escapeHtml(node.post)}">이 논문 리뷰 읽기</a></p>`);
    if (node.url) out.push(`<p><a class="library-external" href="${escapeHtml(node.url)}" target="_blank" rel="noopener">원문 링크</a></p>`);

    if (others.length) {
      out.push('<p class="graph-detail-meta">같은 제1저자</p><ul class="graph-neighbor-list">');
      others.slice(0, 8).forEach((o) => {
        out.push(`<li><button type="button" data-node-id="${escapeHtml(o.id)}">${escapeHtml(truncate(o.title, 46))}</button></li>`);
      });
      out.push('</ul>');
    }
    detail.innerHTML = out.join('');
    detail.querySelectorAll('button[data-node-id]').forEach((b) => {
      b.addEventListener('click', () => selectNode(b.dataset.nodeId));
    });
    // 라벨을 누르면 그 라벨로 걸러진다 — 여러 특성을 타고 넘어가는 통로다.
    detail.querySelectorAll('button[data-facet]').forEach((b) => {
      b.addEventListener('click', () => {
        (b.dataset.facet === 'family' ? familySelect : taskSelect).value = b.dataset.value;
        onFilterChange();
      });
    });
  }

  function showPlaceholder() {
    const reviewed = papers.filter((p) => p.post).length;
    detail.innerHTML = `<div class="graph-detail-placeholder">
      <i class="fas fa-book" aria-hidden="true"></i>
      <p>노드를 선택하면 논문 정보를 볼 수 있습니다.<br>
      테두리가 있는 노드는 이 블로그에 리뷰가 있는 논문입니다 (${reviewed}편).</p></div>`;
    nodes.forEach((n) => n.element.classList.remove('is-dimmed', 'is-selected'));
    edges.forEach((e) => e.element.classList.remove('is-active'));
  }

  function updateSearchHighlight() {
    const q = normalize(searchInput.value);
    nodes.forEach((n) => {
      const hit = q && (normalize(n.title).includes(q) || normalize(n.author).includes(q));
      n.element.classList.toggle('is-match', Boolean(hit));
      n.element.classList.toggle('is-faded', Boolean(q) && !hit);
    });
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
    draggedNode = node;
    dragMoved = false;
    svg.setPointerCapture(event.pointerId);
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
  }

  function fitGraph() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (!nodes.length) {
      transform = { x: rect.width / 2, y: rect.height / 2, scale: 1 };
      setTransform();
      return;
    }
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 130;
    const scale = Math.min(rect.width / (maxX - minX + pad * 2),
                           rect.height / (maxY - minY + pad * 2), 1.6);
    transform.scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    transform.x = rect.width / 2 - ((minX + maxX) / 2) * transform.scale;
    transform.y = rect.height / 2 - ((minY + maxY) / 2) * transform.scale;
    setTransform();
  }

  function zoomAt(factor) {
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
    const q = new URLSearchParams(window.location.search);
    const set = (el, v) => {
      if (v && [...el.options].some((o) => o.value === v)) el.value = v;
    };
    set(clusterSelect, q.get('cluster'));
    set(familySelect, q.get('family'));
    set(taskSelect, q.get('task'));
    set(yearSelect, q.get('year'));
    reviewedOnly.checked = q.get('reviewed') === '1';
    if (q.get('q')) searchInput.value = q.get('q');
  }

  function writeParams() {
    const q = new URLSearchParams();
    if (clusterSelect.value !== 'family') q.set('cluster', clusterSelect.value);
    if (familySelect.value) q.set('family', familySelect.value);
    if (taskSelect.value) q.set('task', taskSelect.value);
    if (yearSelect.value) q.set('year', yearSelect.value);
    if (reviewedOnly.checked) q.set('reviewed', '1');
    if (searchInput.value.trim()) q.set('q', searchInput.value.trim());
    const s = q.toString();
    window.history.replaceState(null, '', s ? `?${s}` : window.location.pathname);
  }

  function onFilterChange() {
    writeParams();
    applyFilters();
  }

  searchInput.addEventListener('input', () => { writeParams(); updateSearchHighlight(); });
  [clusterSelect, familySelect, taskSelect, yearSelect, reviewedOnly]
    .forEach((el) => el.addEventListener('change', onFilterChange));
  document.getElementById('library-reset').addEventListener('click', () => {
    clusterSelect.value = 'family';
    familySelect.value = ''; taskSelect.value = ''; yearSelect.value = '';
    reviewedOnly.checked = false; searchInput.value = '';
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
    if (draggedNode) return;
    panState = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', (event) => {
    if (draggedNode) {
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

  svg.addEventListener('pointerup', (event) => {
    if (draggedNode) {
      if (!dragMoved) selectNode(draggedNode.id);
      draggedNode = null;
    }
    panState = null;
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  });

  window.addEventListener('resize', fitGraph);

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  readParams();
  applyFilters();
})();
