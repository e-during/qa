// ============================================================
// GitHub Contents API를 "백엔드"처럼 사용하는 공용 동기화 라이브러리
// - GitLab(사내)과 달리 PUT으로 기존 파일을 그대로 덮어쓸 수 있어(update),
//   gitlab-storage.js처럼 버전 파일을 계속 쌓을 필요 없이 파일 하나에 저장합니다.
// - github-config.js 를 먼저 로드한 뒤 이 파일을 로드해야 합니다.
// - GitHub REST API는 CORS를 허용하므로 브라우저에서 바로 fetch/XHR 가능합니다.
// ============================================================
(function () {
  const cfg = window.GITHUB_CONFIG || {};
  const apiBase = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents`;

  function filePath(name) {
    return `${cfg.dataDir || 'data'}/${name}`;
  }
  function authHeaders(extra) {
    // 토큰이 없으면(공개 저장소 읽기 전용) Authorization 헤더를 아예 보내지 않는다.
    // 빈 문자열이라도 헤더를 보내면 GitHub API가 "잘못된 인증정보"로 401 처리할 수 있어
    // 무인증 익명 읽기가 오히려 막힐 수 있기 때문.
    const base = { 'Accept': 'application/vnd.github+json' };
    if (cfg.token) base['Authorization'] = `token ${cfg.token}`;
    return Object.assign(base, extra || {});
  }
  function b64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(String(b64 || '').replace(/\n/g, ''))));
  }
  function utf8ToB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // ---- 비동기 읽기 ----
  async function pullJSON(name, fallback) {
    try {
      const url = `${apiBase}/${filePath(name)}?ref=${encodeURIComponent(cfg.branch || 'main')}&_ts=${Date.now()}`;
      const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
      if (res.status === 404) return fallback;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return JSON.parse(b64ToUtf8(json.content));
    } catch (err) {
      console.warn('[GitHubSync] pull 실패:', name, err);
      return fallback;
    }
  }

  // ---- 동기 읽기 (m_dashboard.html 초기 로딩용, gitlab-storage.js의 Sync 함수와 동일 패턴) ----
  function pullJSONSync(name, fallback) {
    try {
      const url = `${apiBase}/${filePath(name)}?ref=${encodeURIComponent(cfg.branch || 'main')}&_ts=${Date.now()}`;
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false); // 동기 요청
      if (cfg.token) xhr.setRequestHeader('Authorization', `token ${cfg.token}`);
      xhr.setRequestHeader('Accept', 'application/vnd.github+json');
      xhr.send(null);
      if (xhr.status === 200 && xhr.responseText) {
        const json = JSON.parse(xhr.responseText);
        return JSON.parse(b64ToUtf8(json.content));
      }
      return fallback;
    } catch (err) {
      console.warn('[GitHubSync] 동기 pull 실패:', name, err);
      return fallback;
    }
  }

  // ---- 저장 (있으면 sha 붙여서 덮어쓰기, 없으면 새로 생성) ----
  const queues = {};

  // 현재 파일의 최신 sha를 캐시 없이 조회 (없으면 undefined = 신규 생성)
  async function fetchLatestSha(path) {
    try {
      const url = `${apiBase}/${path}?ref=${encodeURIComponent(cfg.branch || 'main')}&_ts=${Date.now()}`;
      const cur = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
      if (cur.ok) { const j = await cur.json(); return j.sha; }
    } catch (e) { /* 파일이 없으면 무시하고 새로 생성 */ }
    return undefined;
  }

  function pushJSON(name, data, message) {
    const run = async () => {
      const path = filePath(name);
      const url = `${apiBase}/${path}`;
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const sha = await fetchLatestSha(path);
        const body = JSON.stringify({
          message: message || `update ${name}`,
          content: utf8ToB64(JSON.stringify(data, null, 2)),
          branch: cfg.branch || 'main',
          sha
        });
        const res = await fetch(url, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body });
        if (res.ok) return true;

        const t = await res.text().catch(() => '');
        // 409 = 저장하는 사이 파일이 바뀌어 sha가 어긋난 충돌. 최신 sha를 다시 받아 재시도.
        if (res.status === 409 && attempt < maxAttempts) {
          console.warn(`[GitHubSync] sha 충돌(409), 최신 버전으로 재시도 (${attempt}/${maxAttempts}):`, name);
          continue;
        }
        throw new Error(`HTTP ${res.status} ${t}`);
      }
      return false;
    };
    const prev = queues[name] || Promise.resolve();
    const next = prev.then(run).catch(err => {
      console.warn('[GitHubSync] push 실패:', name, err);
      return false;
    });
    queues[name] = next;
    return next;
  }

  window.GitHubSync = { pullJSON, pullJSONSync, pushJSON };
})();
