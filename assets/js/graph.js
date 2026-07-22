(() => {
  'use strict';

  const root = document.getElementById('knowledge-graph');
  const dataElement = document.getElementById('graph-data');
  if (!root || !dataElement) return;

  const allPosts = JSON.parse(dataElement.textContent).map((post, index) => ({
    ...post,
    index,
    categories: Array.isArray(post.categories) ? post.categories : [],
    tags: Array.isArray(post.tags) ? post.tags : [],
    related: Array.isArray(post.related) ? post.related : [],
  }));

  const svg = document.getElementById('graph-canvas');
  const viewport = document.getElementById('graph-viewport');
  const edgeLayer = document.getElementById('graph-edges');
  const nodeLayer = document.getElementById('graph-nodes');
  const detail = document.getElementById('graph-detail');
  const searchInput = document.getElementById('graph-search');
  const categorySelect = document.getElementById('graph-category');
  const tagSelect = document.getElementById('graph-tag');
  const emptyMessage = document.getElementById('graph-empty');
  const postCount = document.getElementById('graph-post-count');
  const edgeCount = document.getElementById('graph-edge-count');
  const legend = document.getElementById('graph-legend');
  const ns = 'http://www.w3.org/2000/svg';

  const palette = ['#4c78a8', '#f58518', '#54a24b', '#e45756', '#72b7b2', '#b279a2', '#ff9da6'];
  const categories = [...new Set(allPosts.map((post) => post.categories[0] || 'Uncategorized'))].sort();
  const tags = [...new Set(allPosts.flatMap((post) => post.tags))].sort((a, b) => a.localeCompare(b));
  const categoryColors = new Map(categories.map((category, index) => [category, palette[index % palette.length]]));

  let nodes = [];
  let edges = [];
  let animationFrame = null;
  let selectedId = null;
  let transform = { x: 0, y: 0, scale: 1 };
  let panState = null;
  let draggedNode = null;
  let dragMoved = false;

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

  function buildEdges(visibleNodes) {
    const result = [];

    for (let i = 0; i < visibleNodes.length; i += 1) {
      for (let j = i + 1; j < visibleNodes.length; j += 1) {
        const source = visibleNodes[i];
        const target = visibleNodes[j];
        const targetAliases = new Set([target.id, target.url, target.title, target.id.split('/').filter(Boolean).pop()].map(normalize));
        const sourceAliases = new Set([source.id, source.url, source.title, source.id.split('/').filter(Boolean).pop()].map(normalize));
        const explicit = source.related.some((value) => targetAliases.has(normalize(value)))
          || target.related.some((value) => sourceAliases.has(normalize(value)));
        const sharedTags = source.tags.filter((tag) => target.tags.includes(tag));

        if (explicit || sharedTags.length) {
          result.push({
            source,
            target,
            explicit,
            sharedTags,
            weight: Math.max(1, sharedTags.length + (explicit ? 2 : 0)),
          });
        }
      }
    }

    return result;
  }

  function applyFilters() {
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

    edges = buildEdges(nodes);
    selectedId = nodes.some((node) => node.id === selectedId) ? selectedId : null;
    renderGraph();
    fitGraph();
  }

  function renderGraph() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    edgeLayer.replaceChildren();
    nodeLayer.replaceChildren();

    edges.forEach((edge) => {
      edge.element = createSvgElement('line', {
        class: `graph-edge${edge.explicit ? ' is-related' : ''}`,
        'stroke-width': Math.min(1 + edge.weight * 0.7, 4.5),
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
      const degree = edges.filter((edge) => edge.source === node || edge.target === node).length;
      node.radius = Math.min(10 + degree * 1.1, 18);
      const circle = createSvgElement('circle', {
        r: node.radius,
        fill: categoryColors.get(node.categories[0] || 'Uncategorized'),
      });
      const label = createSvgElement('text', { y: node.radius + 15 });
      label.textContent = truncate(node.title, 22);
      const title = createSvgElement('title');
      title.textContent = node.title;
      group.append(circle, label, title);
      group.addEventListener('pointerdown', (event) => startNodeDrag(event, node));
      group.addEventListener('click', () => {
        if (!dragMoved) selectNode(node.id);
      });
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectNode(node.id);
        }
      });
      node.element = group;
      nodeLayer.appendChild(group);
    });

    postCount.textContent = nodes.length;
    edgeCount.textContent = edges.length;
    emptyMessage.hidden = nodes.length !== 0;
    updatePositions();
    updateSearchHighlight();
    startSimulation();

    if (selectedId) selectNode(selectedId);
    else showPlaceholder();
  }

  function startSimulation() {
    let iterations = 0;
    const tick = () => {
      if (iterations > 420) return;
      simulate(iterations);
      updatePositions();
      iterations += 1;
      animationFrame = requestAnimationFrame(tick);
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
      const force = (distance - ideal) * 0.006 * alpha;
      if (!edge.source.fixed) {
        edge.source.vx += (dx / distance) * force;
        edge.source.vy += (dy / distance) * force;
      }
      if (!edge.target.fixed) {
        edge.target.vx -= (dx / distance) * force;
        edge.target.vy -= (dy / distance) * force;
      }
    });

    const categoryCenters = new Map(categories.map((category, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(categories.length, 1) - Math.PI / 2;
      return [category, { x: Math.cos(angle) * 120, y: Math.sin(angle) * 90 }];
    }));

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
  }

  function selectNode(id) {
    selectedId = id;
    const node = nodes.find((item) => item.id === id);
    if (!node) return;

    const connectedEdges = edges.filter((edge) => edge.source === node || edge.target === node);
    const connectedIds = new Set([id]);
    connectedEdges.forEach((edge) => {
      connectedIds.add(edge.source.id);
      connectedIds.add(edge.target.id);
    });

    nodes.forEach((item) => {
      item.element.classList.toggle('is-selected', item.id === id);
      item.element.classList.toggle('is-dimmed', !connectedIds.has(item.id));
    });
    edges.forEach((edge) => edge.element.classList.toggle('is-dimmed', !connectedEdges.includes(edge)));
    renderDetail(node, connectedEdges);
  }

  function renderDetail(node, connectedEdges) {
    const neighbors = connectedEdges
      .map((edge) => ({
        node: edge.source === node ? edge.target : edge.source,
        tags: edge.sharedTags,
        explicit: edge.explicit,
        weight: edge.weight,
      }))
      .sort((a, b) => b.weight - a.weight || a.node.title.localeCompare(b.node.title));

    const tagButtons = node.tags
      .map((tag) => `<button type="button" class="graph-tag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
      .join('');
    const neighborItems = neighbors.length
      ? neighbors.map((item) => `
          <li>
            <button type="button" data-node-id="${escapeHtml(item.node.id)}">${escapeHtml(item.node.title)}</button>
            <small>${item.explicit ? '직접 연결' : item.tags.map((tag) => `#${escapeHtml(tag)}`).join(' · ')}</small>
          </li>`).join('')
      : '<li><small>현재 필터에서 연결된 글이 없습니다.</small></li>';

    detail.innerHTML = `
      <h2><a href="${escapeHtml(node.url)}">${escapeHtml(node.title)}</a></h2>
      <p class="graph-detail-meta">${escapeHtml(node.categories.join(' / '))} · ${escapeHtml(node.date)}</p>
      <p class="graph-detail-excerpt">${escapeHtml(node.excerpt)}</p>
      <h3>Tags</h3>
      <div class="graph-tag-list">${tagButtons}</div>
      <h3>Connected posts · ${neighbors.length}</h3>
      <ul class="graph-neighbor-list">${neighborItems}</ul>`;

    detail.querySelectorAll('[data-tag]').forEach((button) => {
      button.addEventListener('click', () => {
        tagSelect.value = button.dataset.tag;
        applyFilters();
      });
    });
    detail.querySelectorAll('[data-node-id]').forEach((button) => {
      button.addEventListener('click', () => selectNode(button.dataset.nodeId));
    });
  }

  function showPlaceholder() {
    detail.innerHTML = `
      <div class="graph-detail-placeholder">
        <i class="fas fa-circle-nodes" aria-hidden="true"></i>
        <p>노드를 선택하면 글과 연결 정보를 볼 수 있습니다.</p>
      </div>`;
  }

  function updateSearchHighlight() {
    const query = normalize(searchInput.value);
    nodes.forEach((node) => {
      const haystack = normalize([node.title, ...node.tags, ...node.categories].join(' '));
      node.element.classList.toggle('is-match', Boolean(query) && haystack.includes(query));
      node.element.classList.toggle('is-dimmed', Boolean(query) && !haystack.includes(query));
    });
    edges.forEach((edge) => edge.element.classList.toggle('is-dimmed', Boolean(query)));
  }

  function startNodeDrag(event, node) {
    event.stopPropagation();
    draggedNode = node;
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
  }

  function fitGraph() {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    transform = { x: rect.width / 2, y: rect.height / 2, scale: 1 };
    setTransform();
  }

  function zoomAt(factor, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const px = clientX == null ? rect.width / 2 : clientX - rect.left;
    const py = clientY == null ? rect.height / 2 : clientY - rect.top;
    const nextScale = Math.min(3, Math.max(0.35, transform.scale * factor));
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

  searchInput.addEventListener('input', updateSearchHighlight);
  categorySelect.addEventListener('change', applyFilters);
  tagSelect.addEventListener('change', applyFilters);
  document.getElementById('graph-reset').addEventListener('click', () => {
    searchInput.value = '';
    categorySelect.value = '';
    tagSelect.value = '';
    selectedId = null;
    applyFilters();
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
      const point = eventToGraphPoint(event);
      draggedNode.x = point.x;
      draggedNode.y = point.y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      dragMoved = true;
      updatePositions();
      return;
    }
    if (panState) {
      transform.x = panState.tx + event.clientX - panState.x;
      transform.y = panState.ty + event.clientY - panState.y;
      setTransform();
    }
  });

  svg.addEventListener('pointerup', () => {
    if (draggedNode) draggedNode.fixed = false;
    draggedNode = null;
    panState = null;
    svg.classList.remove('is-panning');
    setTimeout(() => { dragMoved = false; }, 0);
  });

  svg.addEventListener('dblclick', (event) => {
    const nodeElement = event.target.closest('.graph-node');
    if (!nodeElement) return;
    const index = [...nodeLayer.children].indexOf(nodeElement);
    if (nodes[index]) window.location.href = nodes[index].url;
  });

  window.addEventListener('resize', fitGraph);
  applyFilters();
})();
