/* ============================================================
 * gitlab-storage.js
 * ------------------------------------------------------------
 * 별도 DB/백엔드 서버 없이, 사내 GitLab 프로젝트의 Repository File API를
 * "데이터 저장소"로 사용하기 위한 공용 모듈입니다.
 *
 * ⚠ 이 GitLab 인스턴스 앞단 nginx는 다음과 같이 제한되어 있는 것으로
 *   확인되었습니다 (2026-08 진단):
 *     - /repository/files/*  경로: GET, POST만 허용 (PUT/DELETE 405)
 *     - /repository/commits, /repository/tree 경로: 라우팅 자체가 없음 (404)
 *   즉, "이미 있는 파일을 수정"하는 것이 API로는 불가능하고, "새 파일을
 *   만드는 것(POST)"과 "정해진 경로의 파일을 읽는 것(GET)"만 가능합니다.
 *
 *   그래서 데이터를 고정된 파일 하나에 계속 덮어쓰는 대신, 저장할 때마다
 *   번호가 매겨진 새 파일을 만드는 방식(append-only)을 씁니다.
 *     data/inspection/000001.json, 000002.json, 000003.json ...
 *   읽을 때는 목록 조회(tree API) 없이, 존재하는 파일 중 가장 큰 번호를
 *   이분 탐색(binary search)으로 찾아서 그 파일을 최신 데이터로 읽습니다.
 *   (localStorage에 마지막으로 확인된 번호를 캐시해두어, 다음 조회 때는
 *    요청 몇 번 안에 최신 번호를 찾습니다.)
 *
 * 이 파일 하나를 admin_inspection.html / admin_measure.html /
 * dashboard.html 에서 <script src="gitlab-storage.js"></script> 로
 * 공통으로 불러와 사용합니다.
 *
 * ⚠ 보안 주의사항 (요청 시 이미 안내/확인된 내용)
 *   Project Access Token이 브라우저(클라이언트) 코드에 노출되는 구조입니다.
 *   해당 GitLab 서버(192.168.20.250)에 접근 가능한 사내망 사용자라면
 *   누구나 이 토큰 값을 볼 수 있고, write_repository 권한 범위 내에서
 *   레포지토리에 커밋을 남길 수 있습니다. 사내 폐쇄망 환경 전제로 진행하되,
 *   토큰은 "이 프로젝트 전용" Project Access Token(최소 권한: write_repository)
 *   으로 발급하고, 필요 시 주기적으로 재발급/회수하는 것을 권장합니다.
 *
 * ⚠ 운영 참고: 저장할 때마다 새 파일이 하나씩 쌓입니다(수정이 불가능한
 *   서버 제약 때문). 레포지토리 파일 수가 계속 늘어나므로, 필요 시
 *   GitLab 관리자가 GitLab UI(웹)나 git 명령으로 오래된 버전 파일들을
 *   주기적으로 정리해주는 것을 권장합니다. (이 브라우저 코드는 삭제
 *   기능을 쓰지 않으므로 지워도 서비스 동작에는 영향 없습니다 — 항상
 *   "가장 번호가 큰 파일"만 최신으로 취급합니다.)
 * ============================================================ */

const GITLAB_CONFIG = {
  baseUrl: 'http://192.168.20.250', // 포트 없음 (git push가 실제로 성공한 주소 기준)
  projectPath: 'lim104/measure', // 실제 저장소 경로 (git push 시 표시되는 주소 기준)
  branch: 'main',           // 1차 시도 브랜치
  fallbackBranch: 'master', // main이 없을 경우 자동으로 시도할 브랜치

  // ⚠️ 배포 시 이 프로젝트 전용 Project Access Token(write_repository 권한)으로 교체하세요.
  //    GitLab > 해당 프로젝트 > Settings > Access Tokens 에서 발급합니다.
  token: 'glpat-9NC83_lJmYDWf_6WqqE7KG86MQp1OjgH.01.0w0m22dyx'
};

const GITLAB_PROJECT_ID = encodeURIComponent(GITLAB_CONFIG.projectPath);
const GITLAB_INDEX_DIGITS = 6; // data/xxx/000001.json 형식의 자릿수

// UTF-8(한글 포함) 문자열 <-> Base64 안전 변환
function gitlabUtf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function gitlabBase64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

function gitlabFileApiUrl(filePath) {
  return `${GITLAB_CONFIG.baseUrl}/api/v4/projects/${GITLAB_PROJECT_ID}/repository/files/${encodeURIComponent(filePath)}`;
}

function gitlabPad(n) {
  return String(n).padStart(GITLAB_INDEX_DIGITS, '0');
}
function gitlabVersionPath(prefix, index) {
  return `${prefix}/${gitlabPad(index)}.json`;
}
function gitlabHintKey(prefix) {
  return `gitlab_ver_hint__${prefix}`;
}

/* ------------------------------------------------------------
 * 특정 파일 하나 읽기 (비동기). 파일이 없으면 null.
 * ------------------------------------------------------------ */
async function gitlabGetFile(filePath, branch) {
  branch = branch || GITLAB_CONFIG.branch;
  const url = `${gitlabFileApiUrl(filePath)}/raw?ref=${encodeURIComponent(branch)}`;
  let res;
  // 캐시 방지: fetch의 no-store 옵션 + 캐시버스팅 쿼리 파라미터를 함께 사용합니다.
  // (일부 프록시/서버는 Cache-Control을 무시하는 경우가 있어 쿼리 파라미터로 이중 방지)
  const bustUrl = `${url}&_ts=${Date.now()}`;
  try {
    res = await fetch(bustUrl, {
      headers: { 'PRIVATE-TOKEN': GITLAB_CONFIG.token },
      cache: 'no-store'
    });
  } catch (e) {
    throw new Error(`GitLab 서버에 접속할 수 없습니다 (${GITLAB_CONFIG.baseUrl}). 네트워크/VPN 상태를 확인하세요.`);
  }
  if (res.status === 404) {
    if (branch !== GITLAB_CONFIG.fallbackBranch) {
      return gitlabGetFile(filePath, GITLAB_CONFIG.fallbackBranch);
    }
    return null; // 아직 파일이 생성되지 않음
  }
  if (!res.ok) {
    throw new Error(`GitLab 파일 조회 실패 (HTTP ${res.status})`);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('GitLab 파일 JSON 파싱 실패:', filePath, e);
    return null;
  }
}

/* ------------------------------------------------------------
 * 특정 파일 하나 읽기 (동기 - dashboard.html 초기 로딩용).
 * 구형 방식인 동기 XHR을 사용합니다. 사내망 LAN 기준 응답이 빠르므로
 * 페이지 초기 로딩 시에만 사용하세요.
 * ------------------------------------------------------------ */
function gitlabGetFileSync(filePath, branch) {
  branch = branch || GITLAB_CONFIG.branch;
  const url = `${gitlabFileApiUrl(filePath)}/raw?ref=${encodeURIComponent(branch)}&_ts=${Date.now()}`;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // false = 동기 요청
    xhr.setRequestHeader('PRIVATE-TOKEN', GITLAB_CONFIG.token);
    xhr.setRequestHeader('Cache-Control', 'no-store');
    xhr.send(null);
    if (xhr.status === 200 && xhr.responseText) {
      try { return JSON.parse(xhr.responseText); } catch (e) { return null; }
    }
    if (xhr.status === 404 && branch !== GITLAB_CONFIG.fallbackBranch) {
      return gitlabGetFileSync(filePath, GITLAB_CONFIG.fallbackBranch);
    }
    return null;
  } catch (e) {
    console.error('GitLab 동기 조회 실패:', filePath, e);
    return null;
  }
}

/* ============================================================
 *  버전 파일(append-only) 방식 - 실제로 admin/dashboard가 사용하는 API
 * ============================================================ */

/* 비동기: prefix 아래 존재하는 가장 큰 번호와 그 파일 내용을 찾음.
 * localStorage의 힌트값부터 시작해 지수 확장 + 이분 탐색으로 찾으므로,
 * 매번 1번 파일부터 순차 탐색하지 않습니다. */
async function gitlabFindLatestVersion(prefix) {
  const hintKey = gitlabHintKey(prefix);
  const hint = parseInt(localStorage.getItem(hintKey) || '0', 10) || 0;

  async function existsAt(idx) {
    if (idx < 1) return false;
    const content = await gitlabGetFile(gitlabVersionPath(prefix, idx));
    return content !== null ? content : false;
  }

  let lastGoodIndex = 0;
  let lastGoodContent = null;

  if (hint >= 1) {
    const c = await existsAt(hint);
    if (c) { lastGoodIndex = hint; lastGoodContent = c; }
  }
  if (lastGoodIndex === 0) {
    const c = await existsAt(1);
    if (!c) return { index: 0, content: null }; // 아직 저장된 데이터 없음
    lastGoodIndex = 1; lastGoodContent = c;
  }

  // 지수 확장으로 상한을 찾는다
  let hi = lastGoodIndex, step = 1;
  while (true) {
    const c = await existsAt(hi + step);
    if (c) { hi += step; lastGoodContent = c; step *= 2; }
    else break;
  }
  // 이분 탐색으로 정확한 최대값을 좁힌다
  let lo = hi, upper = hi + step;
  while (upper - lo > 1) {
    const mid = Math.floor((lo + upper) / 2);
    const c = await existsAt(mid);
    if (c) { lo = mid; lastGoodContent = c; }
    else upper = mid;
  }

  localStorage.setItem(hintKey, String(lo));
  return { index: lo, content: lastGoodContent };
}

/* 동기 버전 (dashboard.html 초기 로딩용) */
function gitlabFindLatestVersionSync(prefix) {
  const hintKey = gitlabHintKey(prefix);
  const hint = parseInt(localStorage.getItem(hintKey) || '0', 10) || 0;

  function existsAt(idx) {
    if (idx < 1) return false;
    const content = gitlabGetFileSync(gitlabVersionPath(prefix, idx));
    return content !== null ? content : false;
  }

  let lastGoodIndex = 0;
  let lastGoodContent = null;

  if (hint >= 1) {
    const c = existsAt(hint);
    if (c) { lastGoodIndex = hint; lastGoodContent = c; }
  }
  if (lastGoodIndex === 0) {
    const c = existsAt(1);
    if (!c) return { index: 0, content: null };
    lastGoodIndex = 1; lastGoodContent = c;
  }

  let hi = lastGoodIndex, step = 1;
  while (true) {
    const c = existsAt(hi + step);
    if (c) { hi += step; lastGoodContent = c; step *= 2; }
    else break;
  }
  let lo = hi, upper = hi + step;
  while (upper - lo > 1) {
    const mid = Math.floor((lo + upper) / 2);
    const c = existsAt(mid);
    if (c) { lo = mid; lastGoodContent = c; }
    else upper = mid;
  }

  localStorage.setItem(hintKey, String(lo));
  return { index: lo, content: lastGoodContent };
}

/* 최신 데이터 읽기 (비동기) - admin 페이지 초기 로딩/새로고침용 */
async function gitlabLoadLatestVersioned(prefix) {
  try {
    const found = await gitlabFindLatestVersion(prefix);
    return found.content; // null이면 아직 저장된 데이터 없음
  } catch (e) {
    console.error('[GitLab] 최신 버전 조회 실패:', prefix, e);
    throw e;
  }
}

/* 최신 데이터 읽기 (동기) - dashboard.html 전용 */
function gitlabLoadLatestVersionedSync(prefix) {
  try {
    const found = gitlabFindLatestVersionSync(prefix);
    return found.content;
  } catch (e) {
    console.error('[GitLab] 동기 최신 버전 조회 실패:', prefix, e);
    return null;
  }
}

/* 새 버전 저장 (POST create만 사용). 동시 저장 충돌 시(같은 번호를 다른
 * 세션이 먼저 선점) 다음 번호로 자동 재시도합니다. */
/* 여러 저장 요청이 겹치면(같은 브라우저 탭 안에서 렌더링 등으로 인해)
 * 같은 prefix에 대해 동시에 "다음 번호"를 계산해 충돌(400)이 날 수 있으므로,
 * prefix별로 저장 요청을 하나씩 순서대로 처리하는 큐를 둡니다. */
const __gitlabSaveQueues = {};

function gitlabSaveVersioned(prefix, dataObj, commitMessage) {
  const prev = __gitlabSaveQueues[prefix] || Promise.resolve();
  const next = prev
    .catch(() => {}) // 이전 저장이 실패했어도 큐가 끊기지 않도록
    .then(() => gitlabSaveVersionedInner(prefix, dataObj, commitMessage));
  __gitlabSaveQueues[prefix] = next;
  return next;
}

async function gitlabSaveVersionedInner(prefix, dataObj, commitMessage) {
  const found = await gitlabFindLatestVersion(prefix);
  let nextIndex = found.index + 1;
  const content = gitlabUtf8ToBase64(JSON.stringify(dataObj, null, 2));
  const hintKey = gitlabHintKey(prefix);

  for (let attempt = 0; attempt < 5; attempt++) {
    const path = gitlabVersionPath(prefix, nextIndex);
    const body = JSON.stringify({
      branch: GITLAB_CONFIG.branch,
      content,
      encoding: 'base64',
      commit_message: commitMessage || `create ${path}`
    });
    let res;
    try {
      res = await fetch(gitlabFileApiUrl(path), {
        method: 'POST',
        headers: { 'PRIVATE-TOKEN': GITLAB_CONFIG.token, 'Content-Type': 'application/json' },
        body
      });
    } catch (e) {
      throw new Error(`GitLab 서버에 접속할 수 없습니다 (${GITLAB_CONFIG.baseUrl}). 네트워크/VPN 상태를 확인하세요.`);
    }
    if (res.ok) {
      localStorage.setItem(hintKey, String(nextIndex));
      return true;
    }
    if (res.status === 400) {
      // 이미 존재하는 파일(다른 PC/탭에서의 동시 저장 충돌) -> 다음 번호로 재시도
      nextIndex += 1;
      continue;
    }
    let detail = '';
    try { detail = await res.text(); } catch (e) {}
    throw new Error(`GitLab 저장 실패 (HTTP ${res.status}) ${detail}`);
  }
  throw new Error('GitLab 저장 실패: 동시 저장 충돌로 재시도 초과');
}
