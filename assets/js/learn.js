(() => {
  const roadmap = document.getElementById('learn-roadmap');
  if (!roadmap) return;

  const storageKey = 'stellacustodis-learn-progress:v1';
  const postPath = roadmap.dataset.postPath;
  const buttons = new Map();
  const tracks = [];
  let readPosts = loadProgress() ?? new Set();
  let localOnly = false;

  const summary = document.getElementById('learn-progress');
  const title = document.createElement('strong');
  title.className = 'learn-progress__title';
  title.textContent = '전체 학습 진행률';
  const total = createProgress(title.textContent);
  const note = document.createElement('p');
  note.className = 'learn-progress__note';
  note.setAttribute('role', 'status');
  note.textContent = '글을 읽은 뒤 읽음 체크를 누르세요. 진행률은 이 브라우저에 저장됩니다.';
  summary.append(title, total.element, note);

  for (const section of roadmap.querySelectorAll('.learn-track')) {
    const heading = section.querySelector('h2');
    const paths = new Set();
    for (const link of section.querySelectorAll('li > a[href]')) {
      const url = new URL(link.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith(postPath)) continue;
      const slug = url.pathname.slice(postPath.length).replace(/\/$/, '');
      if (!slug || slug.includes('/')) continue;
      const path = `/posts/${slug}/`;
      paths.add(path);

      const button = document.createElement('button');
      button.className = 'learn-track__toggle';
      button.type = 'button';
      button.setAttribute('aria-label', `${link.textContent.trim()} 읽음 체크`);
      button.addEventListener('click', () => toggleRead(path));
      link.after(' ', button);

      if (!buttons.has(path)) buttons.set(path, []);
      buttons.get(path).push(button);
    }

    if (paths.size === 0 || !heading) continue;
    const progress = createProgress(`${heading.textContent.trim()} 진행률`);
    heading.after(progress.element);
    tracks.push({ paths, progress });
  }

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return new Set(Array.isArray(saved) ? saved.filter((path) => typeof path === 'string') : []);
    } catch {
      return null;
    }
  }

  function toggleRead(path) {
    if (!localOnly) readPosts = loadProgress() ?? readPosts;
    if (readPosts.has(path)) readPosts.delete(path);
    else readPosts.add(path);

    if (!localOnly) {
      try {
        localStorage.setItem(storageKey, JSON.stringify([...readPosts]));
      } catch {
        localOnly = true;
        note.textContent = '브라우저 저장소를 사용할 수 없어 이 페이지가 열려 있는 동안 읽음 상태를 유지합니다.';
      }
    }
    render();
  }

  function createProgress(label) {
    const element = document.createElement('div');
    element.className = 'learn-progress';
    const caption = document.createElement('span');
    caption.className = 'learn-progress__caption';
    const bar = document.createElement('progress');
    bar.className = 'learn-progress__bar';
    bar.setAttribute('aria-label', label);
    element.append(caption, bar);
    return { element, caption, bar };
  }

  function renderProgress(progress, paths, totalCount) {
    let count = 0;
    for (const path of paths) if (readPosts.has(path)) count += 1;
    progress.caption.textContent = `${count}/${totalCount}개 읽음`;
    progress.bar.max = totalCount || 1;
    progress.bar.value = count;
    progress.bar.setAttribute('aria-valuetext', `${totalCount}개 중 ${count}개 읽음`);
  }

  function render() {
    for (const [path, controls] of buttons) {
      const isRead = readPosts.has(path);
      for (const button of controls) {
        button.setAttribute('aria-pressed', String(isRead));
        button.textContent = isRead ? '✓ 읽음' : '읽음 체크';
      }
    }
    renderProgress(total, buttons.keys(), buttons.size);
    for (const { paths, progress } of tracks) renderProgress(progress, paths, paths.size);
  }

  function refresh() {
    if (localOnly) return;
    readPosts = loadProgress() ?? readPosts;
    render();
  }

  window.addEventListener('pageshow', refresh);
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) refresh();
  });
  render();
})();
