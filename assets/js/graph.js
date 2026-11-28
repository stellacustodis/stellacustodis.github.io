(() => {
  'use strict';

  const root = document.getElementById('knowledge-graph');
  const dataElement = document.getElementById('graph-data');
  if (!root || !dataElement) return;

  const allPosts = JSON.parse(dataElement.textContent).map((post) => {
    const slug = post.id.split('/').filter(Boolean).at(-1);
    return {
      ...post,
      slug,
      categories: Array.isArray(post.categories) ? post.categories : [],
      tags: [...new Set(Array.isArray(post.tags) ? post.tags : [])],
      related: new Set(Array.isArray(post.related) ? post.related.map(normalize) : []),
      links: new Set(Array.isArray(post.links) ? post.links : []),
      aliases: [post.id, post.url, post.title, slug].map(normalize),
    };
  });
  const postsById = new Map(allPosts.map((post) => [post.id, post]));
  const idsBySlug = new Map(allPosts.map((post) => [post.slug, post.id]));

  const svg = document.getElementById('graph-canvas');
  const viewport = document.getElementById('graph-viewport');
  const edgeLayer = document.getElementById('graph-edges');
  const nodeLayer = document.getElementById('graph-nodes');
  const detail = document.getElementById('graph-detail');
  const searchInput = document.getElementById('graph-search');
  const categorySelect = document.getElementById('graph-category');
  const tagSelect = document.getElementById('graph-tag');
  const edgeModeSelect = document.getElementById('graph-edge-mode');
  const emptyMessage = document.getElementById('graph-empty');
  const postCount = document.getElementById('graph-post-count');
  const edgeCount = document.getElementById('graph-edge-count');
  const legend = document.getElementById('graph-legend');
  const categoryChips = document.getElementById('graph-category-chips');
  const zoomControls = root.querySelector('.graph-zoom');
  const ns = 'http://www.w3.org/2000/svg';

  const palette = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2', '#b279a2', '#ff9da6'];
  const categories = [...new Set(allPosts.map((post) => post.categories[0] || 'Uncategorized'))].sort();
  const tags = [...new Set(allPosts.flatMap((post) => post.tags))].sort((a, b) => a.localeCompare(b));
  const categoryColors = new Map(categories.map((category, index) => [category, palette[index % palette.length]]));
  const tagFrequency = new Map();
  for (const post of allPosts) {
    for (const tag of post.tags) tagFrequency.set(tag, (tagFrequency.get(tag) ?? 0) + 1);
  }
  const tagWeights = new Map(tags.map((tag) => [tag, Math.log((allPosts.length + 1) / (tagFrequency.get(tag) + 1))]));
  const categoryCenters = new Map(categories.map((category, index) => {
    const angle = (Math.PI * 2 * index) / categories.length - Math.PI / 2;
    return [category, { x: Math.cos(angle) * 120, y: Math.sin(angle) * 90 }];
  }));

  let nodes = [];
  let edges = [];
  let animationFrame = null;
  let selectedId = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let panState = null;
  let draggedNode = null;
  let nodeDragStart = null;
  let dragMoved = false;
  let hoveredNode = null;
  let focusedNode = null;
  let graphSize = { width: 0, height: 0 };
  // 사용자가 직접 옮기거나 확대하면 시뮬레이션 중 자동 맞춤을 멈춘다.
  let userMovedView = false;

  categories.forEach((category) => categorySelect.add(new Option(category, category)));
  tags.forEach((tag) => tagSelect.add(new Option(`#${tag}`, tag)));
  renderLegend();

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase();
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(ns, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function buildEdges(visibleNodes, mode) {
    const result = [];

    for (let i = 0; i < visibleNodes.length; i += 1) {
      for (let j = i + 1; j < visibleNodes.length; j += 1) {
        const source = visibleNodes[i];
        const target = visibleNodes[j];
        const sourceLinks = mode !== 'tags' && source.links.has(target.id);
        const targetLinks = mode !== 'tags' && target.links.has(source.id);
        const related = mode !== 'tags' && (
          target.aliases.some((alias) => source.related.has(alias)) || source.aliases.some((alias) => target.related.has(alias))
        );
        const explicit = sourceLinks || targetLinks || related;
        const sharedTags = mode === 'explicit' ? [] : source.tags.filter((tag) => target.tags.includes(tag));
        if (!explicit && !sharedTags.length) continue;
        const tagWeight = sharedTags.reduce((sum, tag) => sum + tagWeights.get(tag), 0);
        result.push({ source, target, sourceLinks, targetLinks, related, explicit, sharedTags, weight: explicit ? 4 + tagWeight : tagWeight });
      }
    }

    return result;
  }

  function applyFilters() {
    userMovedView = false;
    const category = categorySelect.value;
    const tag = tagSelect.value;

    nodes = allPosts
      .filter((post) => !category || post.categories[0] === category)
      .filter((post) => !tag || post.tags.includes(tag))
      .map((post, index, visible) => {
        const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1);
        const radius = 90 + (index % 4) * 18;
        return {
          ...post,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          fixed: false,
          element: null,
        };
      });

    edges = buildEdges(nodes, edgeModeSelect.value);
    selectedId = nodes.some((node) => node.id === selectedId) ? selectedId : null;
    renderGraph();
    fitGraph();
  }

  function renderGraph() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    hoveredNode = null;
    focusedNode = null;
    edgeLayer.replaceChildren();
    nodeLayer.replaceChildren();

    const degrees = new Map();
    edges.forEach((edge) => {
      degrees.set(edge.source.id, (degrees.get(edge.source.id) ?? 0) + 1);
      degrees.set(edge.target.id, (degrees.get(edge.target.id) ?? 0) + 1);
      edge.element = createSvgElement('line', {
        class: `graph-edge${edge.explicit ? ' is-related' : ''}`,
        'stroke-width': edge.explicit ? 2 : Math.min(0.4 + edge.weight * 0.3, 1.6),
      });
      const description = createSvgElement('title');
      description.textContent = edge.explicit
        ? `직접 연결${edge.sharedTags.length ? ` · ${edge.sharedTags.join(', ')}` : ''}`
        : `공통 태그: ${edge.sharedTags.join(', ')}`;
      edge.element.appendChild(description);
      edgeLayer.appendChild(edge.element);
    });

    nodes.forEach((node) => {
      const group = createSvgElement('g', {
        class: 'graph-node',
        role: 'button',
        tabindex: '0',
        'aria-label': `${node.title} 글 선택`,
      });
      const degree = degrees.get(node.id) ?? 0;
      node.degree = degree;
      // 태그 연결이 많아 차수 편차가 크다. 제곱근으로 눌러야 큰 노드가 화면을 덮지 않는다.
      node.radius = Math.min(3.5 + Math.sqrt(degree) * 0.4, 8);
      const circle = createSvgElement('circle', {
        r: node.radius,
        fill: categoryColors.get(node.categories[0] || 'Uncategorized'),
      });
      const label = createSvgElement('text', { class: 'graph-node-label', y: node.radius + 12, 'aria-hidden': 'true' });
      label.textContent = truncate(node.title, 22);
      const title = createSvgElement('title');
      title.textContent = node.title;
      group.append(circle, label, title);
      group.addEventListener('pointerdown', (event) => startNodeDrag(event, node));
      group.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        hoveredNode = node;
        updateLabels();
      });
      group.addEventListener('pointerleave', () => {
        if (hoveredNode !== node) return;
        hoveredNode = null;
        updateLabels();
      });
      group.addEventListener('focus', () => {
        focusedNode = node;
        updateLabels();
      });
      group.addEventListener('blur', () => {
        if (focusedNode !== node) return;
        focusedNode = null;
        updateLabels();
      });
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectNode(node.id);
        }
      });
      node.element = group;
      node.label = label;
      nodeLayer.appendChild(group);
    });

    const coreNodes = new Set([...nodes].sort((a, b) => b.degree - a.degree).slice(0, 8));
    for (const node of nodes) {
      node.labelBounds = node.label.getBBox();
      node.isCore = coreNodes.has(node);
    }

    postCount.textContent = nodes.length;
    edgeCount.textContent = edges.length;
    emptyMessage.hidden = nodes.length !== 0;
    updatePositions();
    if (nodes.length > 1) startSimulation();
    renderSelection();
  }

  function startSimulation() {
    let iterations = 0;
    const tick = () => {
      for (let step = 0; step < 3; step += 1) {
        simulate(iterations);
        iterations += 1;
      }
      updatePositions();
      if (!userMovedView && iterations % 45 === 0) fitGraph();
      if (iterations < 420) {
        animationFrame = requestAnimationFrame(tick);
      } else {
        animationFrame = null;
        if (!userMovedView) fitGraph();
      }
    };
    animationFrame = requestAnimationFrame(tick);
  }

  function simulate(iteration) {
    const alpha = Math.max(0.025, 1 - iteration / 440);

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const distanceSquared = Math.max(dx * dx + dy * dy, 36);
        const distance = Math.sqrt(distanceSquared);
        const force = (1100 * alpha) / distanceSquared;
        dx /= distance;
        dy /= distance;
        if (!a.fixed) {
          a.vx -= dx * force;
          a.vy -= dy * force;
        }
        if (!b.fixed) {
          b.vx += dx * force;
          b.vy += dy * force;
        }
      }
    }

    edges.forEach((edge) => {
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const ideal = edge.explicit ? 76 : Math.max(82, 118 - edge.weight * 8);
      const strength = edge.explicit ? 1 : Math.min(0.15 + edge.weight * 0.15, 0.8);
      const force = (distance - ideal) * 0.006 * alpha * strength;
      if (!edge.source.fixed) {
        edge.source.vx += (dx / distance) * force;
        edge.source.vy += (dy / distance) * force;
      }
      if (!edge.target.fixed) {
        edge.target.vx -= (dx / distance) * force;
        edge.target.vy -= (dy / distance) * force;
      }
    });

    nodes.forEach((node) => {
      if (node.fixed) return;
      const center = categoryCenters.get(node.categories[0] || 'Uncategorized') || { x: 0, y: 0 };
      node.vx += (center.x - node.x) * 0.0008 * alpha;
      node.vy += (center.y - node.y) * 0.0008 * alpha;
      node.vx *= 0.86;
      node.vy *= 0.86;
      node.x += node.vx;
      node.y += node.vy;
    });
  }

  function updatePositions() {
    edges.forEach((edge) => {
      edge.element.setAttribute('x1', edge.source.x);
      edge.element.setAttribute('y1', edge.source.y);
      edge.element.setAttribute('x2', edge.target.x);
      edge.element.setAttribute('y2', edge.target.y);
    });
    nodes.forEach((node) => node.element.setAttribute('transform', `translate(${node.x} ${node.y})`));
    updateLabels();
  }

  function labelPriority(node, dense) {
    if (node === focusedNode) return 6;
    if (node === hoveredNode) return 5;
    if (node.id === selectedId) return 4;
    if (node.isMatch) return 3;
    if (node.isNeighbor) return 2;
    return !node.isDimmed && (!dense || node.isCore) ? 1 : 0;
  }

  function updateLabels() {
    const { width, height } = graphSize;
    if (!width || !height) return;

    const dense = nodes.length > 35 && transform.scale < 1.15;
    const candidates = [];
    for (const node of nodes) {
      const priority = labelPriority(node, dense);
      if (priority) candidates.push({ node, priority });
    }
    candidates.sort((a, b) => b.priority - a.priority || b.node.degree - a.node.degree);

    const { x, y, scale } = transform;
    const gap = 2 * scale + 2;
    const shown = new Set();
    const boxes = [];
    for (const { node, priority } of candidates) {
      const bounds = node.labelBounds;
      const left = x + (node.x + bounds.x) * scale - gap;
      const top = y + (node.y + bounds.y) * scale - gap;
      const right = left + bounds.width * scale + 2 * gap;
      const bottom = top + bounds.height * scale + 2 * gap;
      if (right < 0 || bottom < 0 || left > width || top > height) continue;
      if (priority < 4 && (left < 0 || top < 0 || right > width || bottom > height)) continue;
      if (boxes.some((box) => left < box.right && right > box.left && top < box.bottom && bottom > box.top)) continue;
      boxes.push({ left, top, right, bottom });
      shown.add(node);
    }

    for (const node of nodes) node.element.classList.toggle('has-label', shown.has(node));
  }

  function selectNode(id) {
    if (!nodes.some((node) => node.id === id)) return;
    selectedId = id;
    renderSelection();
    writeParams();
  }

  function selectedEdges() {
    return edges.filter((edge) => edge.source.id === selectedId || edge.target.id === selectedId);
  }

  function renderSelection() {
    const node = postsById.get(selectedId);
    const connectedEdges = selectedEdges();
    updateSearchHighlight(connectedEdges);
    if (node) renderDetail(node, connectedEdges);
    else showPlaceholder();
  }

  function renderDetail(node, connectedEdges) {
    const neighbors = connectedEdges.map((edge) => {
      const isSource = edge.source.id === node.id;
      const references = [];
      if (isSource ? edge.sourceLinks : edge.targetLinks) references.push('본문 참조');
      if (isSource ? edge.targetLinks : edge.sourceLinks) references.push('백링크');
      if (edge.related) references.push('관련 글 지정');
      const tags = edge.sharedTags.map((tag) => `#${tag}`);
      return {
        node: isSource ? edge.target : edge.source,
        explicit: edge.explicit,
        weight: edge.weight,
        subtitle: (edge.explicit ? references : tags).join(' · '),
      };
    }).sort((a, b) => b.weight - a.weight || a.node.title.localeCompare(b.node.title));

    const tagButtons = node.tags
      .map((tag) => `<button type="button" class="graph-tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
      .join('');
    const direct = neighbors.filter((neighbor) => neighbor.explicit);
    const byTags = neighbors.filter((neighbor) => !neighbor.explicit);

    detail.hidden = false;
    detail.innerHTML = `
      <button type="button" class="graph-detail__close" aria-label="상세 닫기"><i class="fas fa-xmark" aria-hidden="true"></i></button>
      <h2><a href="${escapeHtml(node.url)}">${escapeHtml(node.title)}</a></h2>
      <p class="graph-detail-meta">${escapeHtml(node.categories.join(' / '))} · ${escapeHtml(node.date)}</p>
      <p class="graph-detail-excerpt">${escapeHtml(node.excerpt)}</p>
      <h3>태그</h3>
      <div class="graph-tag-list">${tagButtons}</div>
      ${edgeModeSelect.value === 'tags' ? '' : renderNeighborList('직접 연결된 글', direct)}
      ${edgeModeSelect.value === 'explicit' ? '' : renderNeighborList('공통 태그로 연결된 글', byTags)}`;

    detail.querySelector('.graph-detail__close').addEventListener('click', clearSelection);
    detail.querySelectorAll('[data-tag]').forEach((button) => {
      button.addEventListener('click', () => {
        tagSelect.value = button.dataset.tag;
        onFilterChange();
        tagSelect.focus();
      });
    });
    detail.querySelectorAll('[data-node-id]').forEach((button) => {
      button.addEventListener('click', () => {
        selectNode(button.dataset.nodeId);
        detail.querySelector('h2 a').focus({ preventScroll: true });
      });
    });
  }

  function renderNeighborList(title, neighbors) {
    const items = neighbors.map((item) => `
      <li>
        <button type="button" data-node-id="${escapeHtml(item.node.id)}">${escapeHtml(item.node.title)}</button>
        <small>${escapeHtml(item.subtitle)}</small>
      </li>`).join('');
    return `<h3>${title} · ${neighbors.length}</h3>
      <ul class="graph-neighbor-list">${items || '<li><small>현재 조건에서 연결된 글이 없습니다.</small></li>'}</ul>`;
  }

  function showPlaceholder() {
    detail.hidden = true;
    detail.replaceChildren();
  }

  function clearSelection() {
    const node = postsById.get(selectedId);
    selectedId = null;
    renderSelection();
    writeParams();
    nodes.find((n) => n.id === node?.id)?.element.focus({ preventScroll: true });
  }

  function updateSearchHighlight(connectedEdges = selectedEdges()) {
    const query = normalize(searchInput.value);
    const highlightedEdges = new Set(connectedEdges);
    const connectedIds = new Set([selectedId]);
    connectedEdges.forEach((edge) => {
      connectedIds.add(edge.source.id);
      connectedIds.add(edge.target.id);
    });
    nodes.forEach((node) => {
      const haystack = normalize([node.title, ...node.tags, ...node.categories].join(' '));
      const match = Boolean(query) && haystack.includes(query);
      const selected = node.id === selectedId;
      node.isMatch = match;
      node.isNeighbor = !selected && connectedIds.has(node.id);
      node.isDimmed = Boolean(query || selectedId) && !match && !connectedIds.has(node.id);
      node.element.classList.toggle('is-selected', selected);
      node.element.setAttribute('aria-pressed', String(selected));
      node.element.classList.toggle('is-match', match);
      node.element.classList.toggle('is-dimmed', node.isDimmed);
    });
    edges.forEach((edge) => {
      edge.element.classList.toggle('is-dimmed', Boolean(query || selectedId) && !highlightedEdges.has(edge));
    });
    updateLabels();
  }

  function startNodeDrag(event, node) {
    event.stopPropagation();
    draggedNode = node;
    nodeDragStart = { x: event.clientX, y: event.clientY };
    dragMoved = false;
    node.fixed = true;
    svg.setPointerCapture(event.pointerId);
  }

  function eventToGraphPoint(event) {
    const rect = svg.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - transform.x) / transform.scale,
      y: (event.clientY - rect.top - transform.y) / transform.scale,
    };
  }

  function setTransform() {
    viewport.setAttribute('transform', `translate(${transform.x} ${transform.y}) scale(${transform.scale})`);
    updateLabels();
  }

  function fitGraph() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    graphSize = { width: rect.width, height: rect.height };
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    if (!nodes.length) {
      transform = { x: centerX, y: centerY, scale: 1 };
      setTransform();
      return;
    }

    const bounds = nodeLayer.getBBox();
    const pad = Math.min(36, rect.width / 8, rect.height / 8);
    // 왼쪽 위 확대 버튼과, 떠 있는 상세 패널을 피한 영역에 맞춘다.
    const leftEdge = zoomControls.getBoundingClientRect().right - rect.left;
    const overlay = !detail.hidden && getComputedStyle(detail).position === 'absolute'
      ? detail.offsetWidth + 24 : 0;
    const width = Math.max(1, rect.width - leftEdge - overlay - 2 * pad);
    const scale = Math.min(1.6, width / bounds.width, (rect.height - 2 * pad) / bounds.height);
    transform = {
      x: leftEdge + pad + width / 2 - (bounds.x + bounds.width / 2) * scale,
      y: centerY - (bounds.y + bounds.height / 2) * scale,
      scale,
    };
    setTransform();
  }

  function zoomAt(factor, clientX, clientY) {
    userMovedView = true;
    const rect = svg.getBoundingClientRect();
    const px = clientX == null ? rect.width / 2 : clientX - rect.left;
    const py = clientY == null ? rect.height / 2 : clientY - rect.top;
    const nextScale = Math.min(3, Math.max(0.08, transform.scale * factor));
    const ratio = nextScale / transform.scale;
    transform.x = px - (px - transform.x) * ratio;
    transform.y = py - (py - transform.y) * ratio;
    transform.scale = nextScale;
    setTransform();
  }

  function renderLegend() {
    legend.innerHTML = categories.map((category) => `
      <span><i style="background:${categoryColors.get(category)}"></i>${escapeHtml(category)}</span>`).join('');
  }

  function renderCategoryChips() {
    const counts = new Map();
    for (const post of allPosts) {
      const key = post.categories[0] || 'Uncategorized';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const entries = [{ id: '', label: '전체', count: allPosts.length }]
      .concat(categories.map((category) => ({ id: category, label: category, count: counts.get(category) ?? 0 }))
        .sort((a, b) => b.count - a.count));
    categoryChips.replaceChildren(...entries.map((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'graph-quick';
      button.dataset.value = entry.id;
      if (entry.id) {
        const dot = document.createElement('i');
        dot.className = 'graph-quick__dot';
        dot.style.background = categoryColors.get(entry.id);
        dot.setAttribute('aria-hidden', 'true');
        button.append(dot);
      }
      button.append(document.createTextNode(entry.label));
      const count = document.createElement('small');
      count.textContent = entry.count;
      button.append(count);
      button.addEventListener('click', () => {
        categorySelect.value = entry.id;
        onFilterChange();
      });
      return button;
    }));
    syncCategoryChips();
  }

  function syncCategoryChips() {
    for (const button of categoryChips.children) {
      button.setAttribute('aria-pressed', String(button.dataset.value === categorySelect.value));
    }
  }

  function truncate(text, maxLength) {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function readParams() {
    const params = new URLSearchParams(window.location.search);
    const restoreSelect = (select, key, fallback) => {
      const value = params.get(key);
      select.value = [...select.options].some((option) => option.value === value) ? value : fallback;
    };
    restoreSelect(categorySelect, 'category', '');
    restoreSelect(tagSelect, 'tag', '');
    restoreSelect(edgeModeSelect, 'mode', 'all');
    searchInput.value = params.get('q') ?? '';
    const node = params.get('node');
    selectedId = postsById.has(node) ? node : idsBySlug.get(node) ?? null;
  }

  function writeParams() {
    const url = new URL(window.location.href);
    const state = {
      category: categorySelect.value,
      tag: tagSelect.value,
      mode: edgeModeSelect.value === 'all' ? '' : edgeModeSelect.value,
      q: searchInput.value.trim(),
      node: postsById.get(selectedId)?.slug,
    };
    for (const [key, value] of Object.entries(state)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }

  function onFilterChange() {
    applyFilters();
    syncCategoryChips();
    writeParams();
  }

  // Esc로 상세 패널을 닫는다.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || detail.hidden) return;
    clearSelection();
  });

  searchInput.addEventListener('input', () => {
    updateSearchHighlight();
    writeParams();
  });
  [categorySelect, tagSelect, edgeModeSelect].forEach((select) => select.addEventListener('change', onFilterChange));
  document.getElementById('graph-reset').addEventListener('click', () => {
    searchInput.value = '';
    categorySelect.value = '';
    tagSelect.value = '';
    edgeModeSelect.value = 'all';
    selectedId = null;
    onFilterChange();
  });
  document.getElementById('graph-zoom-in').addEventListener('click', () => zoomAt(1.25));
  document.getElementById('graph-zoom-out').addEventListener('click', () => zoomAt(0.8));
  document.getElementById('graph-fit').addEventListener('click', fitGraph);

  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
  }, { passive: false });

  svg.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.graph-node')) return;
    panState = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
    svg.classList.add('is-panning');
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', (event) => {
    if (draggedNode) {
      const distance = Math.hypot(
        event.clientX - nodeDragStart.x,
        event.clientY - nodeDragStart.y,
      );
      if (distance < 4 && !dragMoved) return;
      dragMoved = true;
      const point = eventToGraphPoint(event);
      draggedNode.x = point.x;
      draggedNode.y = point.y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      updatePositions();
      return;
    }
    if (panState) {
      userMovedView = true;
      transform.x = panState.tx + event.clientX - panState.x;
      transform.y = panState.ty + event.clientY - panState.y;
      setTransform();
    }
  });

  function endPointer(cancelled) {
    const clickedNode = draggedNode;
    const wasDragged = dragMoved;
    if (draggedNode) draggedNode.fixed = false;
    draggedNode = null;
    nodeDragStart = null;
    panState = null;
    svg.classList.remove('is-panning');
    dragMoved = false;
    if (!cancelled && clickedNode && !wasDragged) selectNode(clickedNode.id);
  }

  svg.addEventListener('pointerup', () => endPointer(false));
  // 브라우저가 제스처를 가져가면(스크롤·핀치) pointerup 없이 끝난다.
  svg.addEventListener('pointercancel', () => endPointer(true));

  svg.addEventListener('dblclick', (event) => {
    const nodeElement = event.target.closest('.graph-node');
    if (!nodeElement) return;
    const index = [...nodeLayer.children].indexOf(nodeElement);
    if (nodes[index]) window.location.href = nodes[index].url;
  });

  window.addEventListener('popstate', () => {
    readParams();
    applyFilters();
    syncCategoryChips();
  });
  new ResizeObserver(fitGraph).observe(svg);
  readParams();
  applyFilters();
  renderCategoryChips();
})();
