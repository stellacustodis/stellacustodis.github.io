(() => {
  const roadmap = document.getElementById('learn-roadmap');
  if (!roadmap) return;

  const storageKey = 'stellacustodis-learn-progress:v1';
  const openKey = 'stellacustodis-learn-open:v1';
  const postPath = roadmap.dataset.postPath;
  const groupLabels = { paper: '논문 읽기', practice: '실습과 회고' };

  const checks = new Map(); // path -> checkbox[]
  const items = []; // { path, li, link } in document order
  const tracks = [];
  let readPosts = loadProgress() ?? new Set();
  let localOnly = false;

  /* ---------------------------------------------------------------- */
  /* Overview                                                          */
  /* ---------------------------------------------------------------- */

  const summary = document.getElementById('learn-progress');
  summary.classList.add('learn-overview');
  const intro = roadmap.querySelector(':scope > p');
  if (intro) {
    intro.classList.add('learn-intro');
    summary.before(intro);
  }

  const overviewHead = el('div', 'learn-overview__head');
  const overviewLabel = el('span', 'learn-overview__label', '전체 진행률');
  const overviewCount = el('strong', 'learn-overview__count');
  const overviewPercent = el('span', 'learn-overview__percent');
  overviewHead.append(overviewLabel, overviewCount, overviewPercent);

  const total = createBar('전체 학습 진행률', 'learn-bar--lg');

  const resume = el('a', 'learn-overview__resume');
  const resumeLabel = el('span', 'learn-overview__resume-label');
  const resumeTitle = el('span', 'learn-overview__resume-title');
  resume.append(resumeLabel, resumeTitle);
  const done = el('p', 'learn-overview__done', '모든 글을 읽었어요.');

  const note = el('p', 'learn-overview__note');
  note.setAttribute('role', 'status');
  note.hidden = true;

  summary.append(overviewHead, total.element, resume, done, note);

  /* ---------------------------------------------------------------- */
  /* Tracks: accordion + step timeline                                 */
  /* ---------------------------------------------------------------- */

  const openState = loadOpenState();

  for (const section of roadmap.querySelectorAll('.learn-track')) {
    const heading = section.querySelector('h2');
    if (!heading) continue;

    const trackItems = [];
    for (const link of section.querySelectorAll('li > a[href]')) {
      const path = postPathOf(link);
      if (!path) continue;

      const li = link.parentElement;
      const check = document.createElement('input');
      check.className = 'learn-track__check';
      check.type = 'checkbox';
      check.setAttribute('aria-label', `${link.textContent.trim()} 읽음`);
      check.addEventListener('change', () => setRead(path, check.checked));
      li.classList.add('learn-track__post');
      link.classList.add('learn-track__link');
      link.before(check);

      const nextBadge = el('span', 'learn-track__next', '다음');
      nextBadge.hidden = true;
      link.after(nextBadge);

      if (!checks.has(path)) checks.set(path, []);
      checks.get(path).push(check);
      const item = { path, li, link, nextBadge };
      items.push(item);
      trackItems.push(item);
    }
    if (trackItems.length === 0) continue;

    // Number the steps (h3) and mark their lists as timeline segments.
    let step = 0;
    for (const h3 of section.querySelectorAll('h3')) {
      step += 1;
      h3.classList.add('learn-step');
      const badge = el('span', 'learn-step__num', String(step));
      badge.setAttribute('aria-hidden', 'true');
      h3.prepend(badge);
      const list = h3.nextElementSibling;
      if (list && list.tagName === 'UL') list.classList.add('learn-step__list');
    }

    // Wrap the section in <details>; the h2 lives in <summary>.
    const id = heading.id;
    const details = document.createElement('details');
    details.className = 'learn-track__details';
    const summaryEl = document.createElement('summary');
    summaryEl.className = 'learn-track__summary';
    const body = el('div', 'learn-track__body');

    const meta = el('div', 'learn-track__meta');
    const count = el('span', 'learn-track__count');
    const bar = createBar(`${heading.textContent.trim()} 진행률`, 'learn-bar--sm');
    const chevron = el('span', 'learn-track__chevron');
    chevron.setAttribute('aria-hidden', 'true');
    meta.append(count, bar.element);

    while (section.firstChild) body.append(section.firstChild);
    heading.classList.add('learn-track__title');
    summaryEl.append(heading, meta, chevron);
    details.append(summaryEl, body);
    section.append(details);

    details.open = openState.has(id);
    details.addEventListener('toggle', () => {
      if (details.open) openState.add(id);
      else openState.delete(id);
      saveOpenState();
    });

    tracks.push({
      id,
      section,
      details,
      title: heading.textContent.trim(),
      short: section.dataset.short || heading.textContent.trim(),
      group: section.dataset.group || 'paper',
      items: trackItems,
      paths: new Set(trackItems.map((item) => item.path)),
      count,
      bar,
      card: null,
    });
  }

  /* ---------------------------------------------------------------- */
  /* Track cards                                                       */
  /* ---------------------------------------------------------------- */

  const cardsWrap = el('nav', 'learn-cards');
  cardsWrap.setAttribute('aria-label', '트랙 목록');
  for (const [group, label] of Object.entries(groupLabels)) {
    const groupTracks = tracks.filter((track) => track.group === group);
    if (groupTracks.length === 0) continue;
    cardsWrap.append(el('h2', 'learn-cards__group', label));
    const grid = el('div', 'learn-cards__grid');
    for (const track of groupTracks) {
      const card = el('a', 'learn-card');
      card.href = `#${track.id}`;
      const name = el('span', 'learn-card__name', track.short);
      const full = el('span', 'learn-card__full', track.title);
      const foot = el('span', 'learn-card__foot');
      const stat = el('span', 'learn-card__stat');
      const cardBar = createBar(`${track.short} 진행률`, 'learn-bar--xs');
      cardBar.element.setAttribute('aria-hidden', 'true');
      foot.append(stat, cardBar.element);
      card.append(name, full, foot);
      card.addEventListener('click', (event) => {
        event.preventDefault();
        openTrack(track, true);
        history.replaceState(null, '', `#${track.id}`);
      });
      track.card = { element: card, stat, bar: cardBar };
      grid.append(card);
    }
    cardsWrap.append(grid);
  }
  summary.after(cardsWrap);

  const firstTrack = tracks[0]?.section;
  if (firstTrack) firstTrack.before(el('h2', 'learn-cards__group learn-tracks__heading', '전체 목록'));

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return new Set(Array.isArray(saved) ? saved.filter((path) => typeof path === 'string') : []);
    } catch {
      return null;
    }
  }

  function loadOpenState() {
    try {
      const saved = JSON.parse(localStorage.getItem(openKey) ?? '[]');
      return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function saveOpenState() {
    try {
      localStorage.setItem(openKey, JSON.stringify([...openState]));
    } catch {
      /* per-viewer convenience only */
    }
  }

  function setRead(path, checked) {
    if (!localOnly) readPosts = loadProgress() ?? readPosts;
    if (checked) readPosts.add(path);
    else readPosts.delete(path);

    if (!localOnly) {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...readPosts]));
      } catch {
        localOnly = true;
        note.textContent = '읽음 상태는 현재 페이지에만 적용됩니다.';
        note.hidden = false;
      }
    }
    render();
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  function render() {
    for (const [path, controls] of checks) {
      const isRead = readPosts.has(path);
      for (const check of controls) check.checked = isRead;
    }
    for (const item of items) item.li.classList.toggle('is-read', readPosts.has(item.path));

    const totalCount = checks.size;
    const totalRead = countRead(checks.keys());
    overviewCount.textContent = `${totalRead} / ${totalCount}`;
    overviewPercent.textContent = `${percent(totalRead, totalCount)}%`;
    setBar(total, totalRead, totalCount);

    const next = items.find((item) => !readPosts.has(item.path));
    resume.hidden = !next;
    done.hidden = Boolean(next);
    if (next) {
      resume.href = next.link.href;
      resumeLabel.textContent = totalRead === 0 ? '처음부터 읽기' : '이어 읽기';
      resumeTitle.textContent = next.link.textContent.trim();
    }

    for (const track of tracks) {
      const read = countRead(track.paths);
      const size = track.paths.size;
      track.count.textContent = `${read}/${size}`;
      setBar(track.bar, read, size);
      track.section.classList.toggle('is-complete', read === size);

      const trackNext = track.items.find((item) => !readPosts.has(item.path));
      for (const item of track.items) item.nextBadge.hidden = item !== trackNext || read === 0;

      if (track.card) {
        track.card.stat.textContent = `${read}/${size}편`;
        setBar(track.card.bar, read, size);
        track.card.element.classList.toggle('is-complete', read === size);
        track.card.element.classList.toggle('is-started', read > 0 && read < size);
      }
    }
  }

  function refresh() {
    if (localOnly) return;
    readPosts = loadProgress() ?? readPosts;
    render();
  }

  /* ---------------------------------------------------------------- */
  /* Navigation                                                        */
  /* ---------------------------------------------------------------- */

  function openTrack(track, scroll) {
    track.details.open = true;
    if (scroll) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function openFromHash() {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const track = tracks.find((t) => t.id === id);
    if (track) openTrack(track, true);
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  function postPathOf(link) {
    const url = new URL(link.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith(postPath)) return null;
    const slug = url.pathname.slice(postPath.length).replace(/\/$/, '');
    if (!slug || slug.includes('/')) return null;
    return `/posts/${slug}/`;
  }

  function countRead(paths) {
    let count = 0;
    for (const path of paths) if (readPosts.has(path)) count += 1;
    return count;
  }

  function percent(value, max) {
    return max ? Math.round((value / max) * 100) : 0;
  }

  function createBar(label, modifier) {
    const element = el('div', `learn-bar ${modifier}`);
    element.setAttribute('role', 'progressbar');
    element.setAttribute('aria-label', label);
    element.setAttribute('aria-valuemin', '0');
    const fill = el('span', 'learn-bar__fill');
    element.append(fill);
    return { element, fill };
  }

  function setBar(bar, value, max) {
    bar.element.setAttribute('aria-valuemax', String(max || 1));
    bar.element.setAttribute('aria-valuenow', String(value));
    bar.element.setAttribute('aria-valuetext', `${max}개 중 ${value}개 읽음`);
    bar.fill.style.width = `${percent(value, max)}%`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  window.addEventListener('pageshow', refresh);
  window.addEventListener('hashchange', openFromHash);
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) refresh();
  });
  render();
  roadmap.classList.add('is-ready');
  openFromHash();
})();
