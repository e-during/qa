// ============================================================
// GitHub Contents API를 "백엔드"처럼 사용하는 공용 동기화 라이브러리
// - GitLab(사내)과 달리 PUT으로 기존 파일을 그대로 덮어쓸 수 있어(update),
//   gitlab-storage.js처럼 버전 파일을 계속 쌓을 필요 없이 파일 하나에 저장합니다.
// - github-config.js 를 먼저 로드한 뒤 이 파일을 로드해야 합니다.
// - GitHub REST API는 CORS를 허용하므로 브라우저에서 바로 fetch/XHR 가능합니다.
// - [중요] token이 비어있으면(공개 저장소를 읽기만 하는 경우) Authorization
//   헤더 자체를 보내지 않습니다. 빈 토큰을 보내면 GitHub가 401로 거부합니다.
// ============================================================
(function () {
  const cfg = window.GITHUB_CONFIG || {};
  const apiBase = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents`;

  function filePath(name) {
    return `${cfg.dataDir || 'data'}/${name}`;
  }
  function authHeaders(extra) {
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
  function pushJSON(name, data, message) {
    const run = async () => {
      const path = filePath(name);
      const url = `${apiBase}/${path}`;
      let sha;
      try {
        const cur = await fetch(`${url}?ref=${encodeURIComponent(cfg.branch || 'main')}`, { headers: authHeaders() });
        if (cur.ok) { const j = await cur.json(); sha = j.sha; }
      } catch (e) { /* 파일이 없으면 무시하고 새로 생성 */ }

      const body = JSON.stringify({
        message: message || `update ${name}`,
        content: utf8ToB64(JSON.stringify(data, null, 2)),
        branch: cfg.branch || 'main',
        sha
      });
      const res = await fetch(url, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${t}`);
      }
      return true;
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
