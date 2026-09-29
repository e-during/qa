// ============================================================
// GitHub Contents API를 "백엔드"처럼 사용하는 공용 동기화 라이브러리 (PC · 모바일 공용)
// - github-config.js(또는 github-config-admin.js)를 먼저 로드한 뒤 이 파일을 로드합니다.
// - 2026-09-29 암호화 적용
//   · PC에서 올릴 때(pushJSON): 팀 비밀번호로 암호화(AES-GCM 256 · PBKDF2-SHA256)한 뒤 업로드
//     → 공개 저장소를 열어봐도 알아볼 수 없는 문자열만 보입니다.
//   · 모바일에서 읽을 때(pullJSON/pullJSONSync): 비밀번호를 한 번 입력하면 그 기기에 기억하고 자동으로 풉니다.
//   · 비밀번호는 코드·저장소 어디에도 들어가지 않습니다 (각 기기의 브라우저에만 저장).
//   · 브라우저 기본 기능(Web Crypto, CompressionStream)만 사용 · 외부 라이브러리 없음
//   · 암호화 전 예전 파일(평문)도 그대로 읽을 수 있습니다 (전환 기간 호환).
// ============================================================
(function () {
  const cfg = window.GITHUB_CONFIG || {};
  const apiBase = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents`;

  const ENC_TAG = 'during-enc-v1';
  const PW_KEY = 'ghs_data_pw_v1';          // 이 기기에 기억된 팀 비밀번호
  const CACHE_PREFIX = 'ghs_plain_v1:';     // 풀어 둔 데이터 (sha 기준 캐시)
  const RELOAD_KEY = 'ghs_reload_v1';       // 새로고침 무한반복 방지
  const ITER = 150000;                      // PBKDF2 반복 횟수

  function filePath(name) { return `${cfg.dataDir || 'data'}/${name}`; }
  function authHeaders(extra) {
    // 토큰이 없으면(공개 저장소 읽기 전용) Authorization 헤더를 보내지 않는다 (빈 토큰은 401 유발).
    const base = { 'Accept': 'application/vnd.github+json' };
    if (cfg.token) base['Authorization'] = `token ${cfg.token}`;
    return Object.assign(base, extra || {});
  }
  function b64ToUtf8(b64) { return decodeURIComponent(escape(atob(String(b64 || '').replace(/\n/g, '')))); }
  function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function b64ToBytes(b64) {
    const s = atob(b64), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function isEnc(o) { return !!(o && typeof o === 'object' && o.enc === ENC_TAG); }
  function store() { try { return window.localStorage; } catch (e) { return null; } }
  function sess() { try { return window.sessionStorage; } catch (e) { return null; } }
  function getPw() { try { return store().getItem(PW_KEY) || ''; } catch (e) { return ''; } }
  function setPw(pw) { try { store().setItem(PW_KEY, pw); } catch (e) {} }

  // ---------------- 암호화 / 복호화 ----------------
  async function deriveKey(pw, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function streamBytes(bytes, Stream, mode) {
    const s = new Blob([bytes]).stream().pipeThrough(new Stream(mode));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function encryptData(obj, pw) {
    let plain = new TextEncoder().encode(JSON.stringify(obj));
    let z = 0;
    if (typeof CompressionStream === 'function') { plain = await streamBytes(plain, CompressionStream, 'gzip'); z = 1; } // 용량 약 1/10
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pw, salt);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
    return { enc: ENC_TAG, alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iter: ITER, z, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
  }
  async function decryptData(env, pw) {
    const key = await deriveKey(pw, b64ToBytes(env.salt));
    let plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(env.iv) }, key, b64ToBytes(env.ct))); // 비밀번호가 틀리면 여기서 오류
    if (env.z) {
      if (typeof DecompressionStream !== 'function') throw new Error('NO_DECOMPRESS');
      plain = await streamBytes(plain, DecompressionStream, 'gzip');
    }
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // ---------------- 비밀번호 입력 창 ----------------
  function whenBody() {
    return new Promise(r => document.body ? r() : document.addEventListener('DOMContentLoaded', () => r(), { once: true }));
  }
  let dialogBusy = null;
  async function askPassword(opts) {
    if (dialogBusy) return dialogBusy;           // 여러 파일이 동시에 물어봐도 창은 하나만
    dialogBusy = (async () => {
      await whenBody();
      return await new Promise(resolve => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(8,14,32,.72);display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;';
        const inp = 'width:100%;box-sizing:border-box;height:48px;margin-top:10px;padding:0 14px;border-radius:12px;border:1.5px solid #CBD5E1;font-size:16px;font-weight:700;font-family:inherit;background:#F8FAFC;color:#0F172A;';
        wrap.innerHTML = `
          <div style="width:100%;max-width:360px;background:#fff;border-radius:18px;padding:22px 20px 18px;box-shadow:0 20px 50px rgba(0,0,0,.35);color:#0F172A;">
            <div style="font-size:18px;font-weight:900;">🔒 ${opts.title}</div>
            <div style="margin-top:6px;font-size:13px;font-weight:600;color:#64748B;line-height:1.5;">${opts.desc}</div>
            <input type="password" data-p1 autocomplete="off" placeholder="비밀번호" style="${inp}">
            ${opts.confirm ? `<input type="password" data-p2 autocomplete="off" placeholder="비밀번호 확인 (한 번 더)" style="${inp}">` : ''}
            <div data-err style="min-height:18px;margin-top:8px;font-size:12.5px;font-weight:800;color:#DC2626;">${opts.error || ''}</div>
            <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:8px;margin-top:6px;">
              <button type="button" data-cancel style="height:48px;border-radius:12px;border:1px solid #E2E8F0;background:#fff;font-size:15px;font-weight:800;color:#64748B;font-family:inherit;">취소</button>
              <button type="button" data-ok style="height:48px;border-radius:12px;border:none;background:#0b1636;color:#e0b060;font-size:16px;font-weight:900;font-family:inherit;">확인</button>
            </div>
            <div style="margin-top:10px;font-size:11px;font-weight:600;color:#94A3B8;text-align:center;">이 기기에만 기억됩니다 · 파일·저장소에는 저장되지 않습니다</div>
          </div>`;
        document.body.appendChild(wrap);
        const p1 = wrap.querySelector('[data-p1]'), p2 = wrap.querySelector('[data-p2]'), err = wrap.querySelector('[data-err]');
        const done = v => { wrap.remove(); resolve(v); };
        const ok = () => {
          const a = p1.value;
          if (!a) { err.textContent = '비밀번호를 입력하세요'; p1.focus(); return; }
          if (opts.confirm && a.length < 8) { err.textContent = '8자 이상으로 정해주세요 (영문+숫자 권장)'; p1.focus(); return; }
          if (opts.confirm && a !== p2.value) { err.textContent = '두 칸의 비밀번호가 다릅니다'; p2.focus(); return; }
          done(a);
        };
        wrap.querySelector('[data-ok]').onclick = ok;
        wrap.querySelector('[data-cancel]').onclick = () => done(null);
        [p1, p2].forEach(el => el && el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
        setTimeout(() => p1.focus(), 50);
      });
    })();
    try { return await dialogBusy; } finally { dialogBusy = null; }
  }

  // 암호화된 파일 풀기: 기억된 비밀번호 → 틀리면 다시 물어봄 (취소하면 null)
  async function unlock(env) {
    let pw = getPw(), error = '';
    for (let tries = 0; tries < 10; tries++) {
      if (!pw) {
        pw = await askPassword({ title: '데이터 비밀번호', desc: '품질경영팀 데이터를 보려면 팀 비밀번호가 필요합니다. 처음 한 번만 입력하면 됩니다.', error });
        if (!pw) return null;
      }
      try {
        const data = await decryptData(env, pw);
        setPw(pw);
        return data;
      } catch (e) {
        if (e && e.message === 'NO_DECOMPRESS') { alert('이 브라우저가 너무 오래되어 데이터를 열 수 없습니다. 휴대폰·브라우저를 업데이트해주세요.'); return null; }
        try { store().removeItem(PW_KEY); } catch (x) {}
        error = '비밀번호가 맞지 않습니다 (바뀌었으면 새 비밀번호를 입력하세요)';
        pw = '';
      }
    }
    return null;
  }

  // ---------------- 풀어 둔 데이터 캐시 (sha가 같으면 재사용) ----------------
  function cacheGet(name, sha) {
    for (const st of [sess(), store()]) {
      try { const c = JSON.parse(st.getItem(CACHE_PREFIX + name) || 'null'); if (c && c.sha === sha) return c.data; } catch (e) {}
    }
    return undefined;
  }
  function cacheSet(name, sha, data) {
    const v = JSON.stringify({ sha, data });
    try { sess().setItem(CACHE_PREFIX + name, v); return true; } catch (e) {}
    try { store().setItem(CACHE_PREFIX + name, v); return true; } catch (e) {} // 용량 초과 시 대체
    return false;
  }

  // ---- 비동기 읽기 ----
  async function pullJSON(name, fallback) {
    try {
      const url = `${apiBase}/${filePath(name)}?ref=${encodeURIComponent(cfg.branch || 'main')}&_ts=${Date.now()}`;
      const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
      if (res.status === 404) return fallback;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const obj = JSON.parse(b64ToUtf8(json.content));
      if (!isEnc(obj)) return obj;
      const hit = cacheGet(name, json.sha);
      if (hit !== undefined) return hit;
      const data = await unlock(obj);
      if (data == null) return fallback;
      cacheSet(name, json.sha, data);
      return data;
    } catch (err) {
      console.warn('[GitHubSync] pull 실패:', name, err);
      return fallback;
    }
  }

  // ---- 동기 읽기 (m_dashboard.html · chatbot-core.js 초기 로딩용) ----
  // 암호화 파일은 동기로 풀 수 없으므로: 캐시가 있으면 바로 반환,
  // 없으면 일단 fallback을 돌려주고 → 뒤에서 풀어 캐시에 저장 → 화면을 한 번 새로고침합니다.
  const pending = new Map();
  let pendingTimer = null;
  function schedule(name, sha, env) {
    let last = []; try { last = JSON.parse(sess().getItem(RELOAD_KEY) || '[]'); } catch (e) {}
    if (last.includes(name + '@' + sha)) { console.warn('[GitHubSync] 새로고침 후에도 캐시가 없어 중단 (저장공간 확인):', name); return; }
    pending.set(name, { sha, env });
    if (pendingTimer) return;
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      const jobs = [...pending.entries()]; pending.clear();
      const note = await showBusy();
      let allOk = true;
      for (const [n, j] of jobs) {
        const data = await unlock(j.env);
        if (data == null || !cacheSet(n, j.sha, data)) { allOk = false; break; }
      }
      note.remove();
      if (!allOk) return;
      // 무한 새로고침 방지: 방금 새로고침한 것과 같은 파일·버전이면 다시 새로고침하지 않음
      try { sess().setItem(RELOAD_KEY, JSON.stringify(jobs.map(([n, j]) => n + '@' + j.sha))); } catch (e) {}
      location.reload();
    }, 0);
  }
  async function showBusy() {
    await whenBody();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147482000;background:rgba(11,22,54,.94);color:#fff;font-size:13px;font-weight:700;padding:10px 16px;border-radius:12px;font-family:inherit;';
    el.textContent = '🔒 최신 데이터를 여는 중…';
    document.body.appendChild(el);
    return el;
  }
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
        const obj = JSON.parse(b64ToUtf8(json.content));
        if (!isEnc(obj)) return obj;              // 예전(평문) 파일
        const hit = cacheGet(name, json.sha);
        if (hit !== undefined) return hit;
        schedule(name, json.sha, obj);
      }
      return fallback;
    } catch (err) {
      console.warn('[GitHubSync] 동기 pull 실패:', name, err);
      return fallback;
    }
  }

  // ---- 저장 (PC 전용: 암호화 → 있으면 sha 붙여서 덮어쓰기, 없으면 새로 생성) ----
  const queues = {};
  async function fetchLatestSha(path) {
    try {
      const url = `${apiBase}/${path}?ref=${encodeURIComponent(cfg.branch || 'main')}&_ts=${Date.now()}`;
      const cur = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
      if (cur.ok) { const j = await cur.json(); return j.sha; }
    } catch (e) { /* 파일이 없으면 무시하고 새로 생성 */ }
    return undefined;
  }
  async function pwForUpload() {
    let pw = getPw();
    if (pw) return pw;
    pw = await askPassword({ title: '모바일 데이터 비밀번호', desc: 'GitHub(모바일용)에 올리는 데이터를 이 비밀번호로 잠급니다. 팀원들은 폰에서 이 비밀번호를 한 번 입력해야 볼 수 있습니다.<br><b>잊어버리면 새로 정해서 다시 업로드하면 됩니다.</b>', confirm: true });
    if (pw) setPw(pw);
    return pw;
  }
  function pushJSON(name, data, message) {
    const run = async () => {
      const pw = await pwForUpload();
      if (!pw) throw new Error('비밀번호 입력 취소 - 모바일용 업로드를 건너뜁니다 (사내 저장은 정상)');
      const env = await encryptData(data, pw);
      const content = utf8ToB64(JSON.stringify(env));
      const path = filePath(name);
      const url = `${apiBase}/${path}`;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const sha = await fetchLatestSha(path);
        const body = JSON.stringify({
          message: `data update (${name})`,   // 파일명·건수 등이 공개 기록에 남지 않도록 고정 문구 사용 (원래 메시지: ${message || ''})
          content, branch: cfg.branch || 'main', sha
        });
        const res = await fetch(url, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body });
        if (res.ok) return true;
        const t = await res.text().catch(() => '');
        if (res.status === 409 && attempt < maxAttempts) {  // 저장 사이 파일이 바뀐 충돌 → 최신 sha로 재시도
          console.warn(`[GitHubSync] sha 충돌(409), 재시도 (${attempt}/${maxAttempts}):`, name);
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

  // 비밀번호 바꾸기 / 이 기기에서 지우기 (필요 시 콘솔이나 버튼에서 호출)
  async function changePassword() {
    const pw = await askPassword({ title: '새 비밀번호 정하기', desc: '다음 업로드부터 새 비밀번호로 잠급니다. 팀원들에게 새 비밀번호를 알려주세요.', confirm: true });
    if (pw) { setPw(pw); alert('새 비밀번호가 저장되었습니다. 엑셀을 한 번 다시 업로드하면 적용됩니다.'); }
    return !!pw;
  }
  function forgetPassword() { try { store().removeItem(PW_KEY); } catch (e) {} }

  window.GitHubSync = { pullJSON, pullJSONSync, pushJSON, changePassword, forgetPassword };
})();
