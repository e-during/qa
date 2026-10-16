/* ============================================================
 *  chatbot-core.js
 *  품질경영팀 업무 챗봇 - 공용 로직
 *
 *  dashboard.html(위젯)과 chatbot.html(독립 페이지)이 이 파일
 *  하나를 함께 불러다 씁니다. 시나리오/데이터 로직을 바꿀 때는
 *  이 파일만 수정하면 두 화면에 동시에 반영됩니다.
 *
 *  각 HTML은 아래처럼 이 파일을 불러오기만 하면 됩니다:
 *    <script src="chatbot-core.js"></script>
 *
 *  화면(패널형 위젯 / 전체 페이지)마다 CSS 클래스 이름이 다를 수
 *  있어서, 필요하면 core.js를 불러오기 "전에" window.QC_CHATBOT_UI
 *  로 클래스 이름을 덮어쓸 수 있게 해뒀습니다. (지정 안 하면 기본값 사용)
 *
 *  [2026 개편]
 *  - "🏆 팀 전체 순위" 메뉴/로직 삭제 (단순 건수 비교는 측정 난이도,
 *    시간, 업무 특성 차이를 반영 못 하므로).
 *  - "⏱️ 납기 현황" 메뉴 신규 추가 (측정의뢰일/완료요청일/측정완료일/
 *    결재상태 기반 납기 준수율 관리).
 *  - "📊 인원별 실적 조회"에 측정 수량 / 평균 처리기간 / 완료율 항목 추가.
 *  - 버튼식/고정형 시나리오 구조는 그대로 유지 (자유질문형 AI로 바꾸지 않음).
 *
 *  [2026-09-30 업그레이드]
 *  - 담당자 이름을 코드에서 삭제 → 암호화 데이터에서 자동 추출 (공개 저장소에 실명 노출 방지,
 *    인원 변동 시 코드 수정 불필요)
 *  - 🔍 품번 조회 (품번·품명 일부 → 정밀측정 이력 + 수입검사 결과) · 최근 조회 버튼
 *  - 📑 월간 요약 — 팀별(정밀측정 / 수입검사 각 부서 메뉴 안) · 지난달 마감 / 이번 달 누계 · 전월 대비 ▲▼ · 보고용 복사
 *  - 🏢 측정 의뢰 비중 (의뢰부서별 / 고객사별)
 *  - 결과 말풍선 📋 복사 · 화면마다 🏠 처음으로 · 인사 반복 정리
 *
 *  [2026-10-10 디자인 개편 (DURING CI: 흰 바탕 · 검정 · 레드)]
 *  - 시작 화면: 인사 말풍선 + 오늘 수치 3칸(오늘 완료 / 납기 지연 / 검사 적체, 누르면 해당 화면)
 *    · 납기 지연 = 미완료 + 완료요청일 지남(납기 현황의 '미완료초과'와 같은 수) · 검사 적체 = 입고 후 5일 이상 미검사
 *  - 시작 메뉴: 알약 버튼 → 아이콘 + 한 줄 설명 타일 (시작 화면만, 옵션에 desc가 있을 때)
 *  - 버튼 영역 맨 아래: 데이터 기준시각 한 줄 (정밀 · 수입 각각 마지막 동기화 시각)
 *  - 일반 말풍선: 회색 → 흰 바탕 + 옅은 테두리 · 결과 카드/팀 색 띠/그래프는 그대로
 *  - 헤더(로고 · 레드 띠)는 각 HTML에서 처리 · 로고 이미지는 이 파일의 DURING_LOGO가
 *    <img data-qcb-logo> 에 자동으로 채움
 *
 *  [2026-10-16] 📘 제품 사전
 *  - 회사 홈페이지 제품소개 66종(PRODUCT_DICT) → 분류별 목록 · 품번 조회에 제품 정보 카드
 *  - 공개 정보만 담음 (제품명·분류·기능 설명) · 수정은 PRODUCT_DICT 배열만 고치면 됨
 * ============================================================ */

(function () {
  'use strict';

  // ------------------------------------------------------------
  //  화면별 CSS 클래스 이름 (기본값 = chatbot.html 기준)
  //  dashboard.html처럼 클래스 이름이 다르면, core.js를 불러오기
  //  전에 window.QC_CHATBOT_UI = {...} 로 덮어써서 사용합니다.
  // ------------------------------------------------------------
  // [2026-10-16] 이 파일이 있는 폴더 (product-images.js 를 같은 폴더에서 찾기 위함)
  const QCB_SCRIPT_DIR = (function(){
    const cs = document.currentScript;
    const src = cs && cs.src ? cs.src : '';
    return src ? src.slice(0, src.lastIndexOf('/') + 1) : 'js/';
  })();

  const UI = Object.assign({
    msgRow: 'msg-row',
    bubble: 'bubble',
    chartBox: 'chart-box',
    statList: 'stat-list',
    statSub: 'stat-sub',
    statMore: 'stat-more',
    rankList: 'rank-list',
    emptyNote: 'empty-note',
    typingDots: 'typing-dots',
    optBtn: 'opt-btn',
    bodyElId: 'chatBody',
    optionsElId: 'optionsWrap'
  }, window.QC_CHATBOT_UI || {});

  // ------------------------------------------------------------
  //  [2026-10-10] DURING 로고 — 챗봇 헤더의 <img data-qcb-logo> 에 자동으로 채움
  //  (chatbot.html · dashboard.html 위젯이 같은 이미지를 쓰도록 여기 한 곳에만 둠.
  //   공식 로고 파일로 바꾸려면 HTML의 img에 src를 직접 적으면 그게 우선입니다.)
  // ------------------------------------------------------------
  const DURING_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAH0AAAAaCAIAAAAVE8SQAAALZUlEQVR4nO1Ze1hUxxU/M3f37i4LLCwggoLmi41FDTUCUjHRGA2KRIlNXGtINIofmE/FJIpYH9QH4aHxj7YhJjVRrC8EFb+gsdX4VgIq8gj4KFQQq+G9C/vevXemf1xZ12VBIEn/aPn9AXfnPOfcmTPnzEWUUhjAT0FDE3VzRXKXPgnhX8iZ/wdwd6p1r8VogiZoR0/U/enLPsmigfXeP1CTuTlsqs/dey1AWEByQFx+tjQ6spfiol/Uuf9hcLf/Kbn7r0agFIADKgdkOnrCFnfyqIG/dRfMZuw7CI8aiVxkDuIDce8nsMLNAlQEYAWgACJA2NcbALjK24aN6XDyDAuIB2oBQIFD2AXzpGsSsVRiE0fFRUUWi8Veo4uLy2A/P39/f6f2dDpdWWkpIMSybEhICMMw9tSSkhKj0QiU/mbsWDc3N2HQarXeuHGD5zh7ToSQwsNj+PDhrq6uXa08FuF5jNC4kBCpVGoj3blzp7m5GQFghomIiLCX4nm+5MYNs8XCsmxoaKiDbwIsFkvJjRtVVVVarVYikfzqhRfCwsI8PDycTrZntK9cp9i51wKUBdTqq/T8/h+U503HvxUjbKp/YM76GvE8ByAFpACsCR+rKDiEPdwfTz9o5EiDweCQ5SUsGzR6tEqlin33XQdjpaWlc2JiAEDm4nLt+nVbcAX8Njy84ccfASA3L298eLgw2NTUFBYSgpCTs8THx2fW7NmrVq92iH5zU1NYaCgAEEKuXL0aOGyYjbR40aLz584RQjDGqWlpsbGxNpJOpwsLCTGZTCzLXi8pcXd3dzCXl5v7eVZWbW0tQkgYoZQqvbwSEhISli59VpydwJR9iJ6/gvx8RR8sEg0LIK1q7OUpkPRZX6OPNrYDEX76AaOJe8dj53bhJ5bJZJRSISKoE1artbysbMP69b9XqTQajb0ljLHAL5XJbN7bIJVKBar9WkMI2awgOysIoebm5uw9e96dP99kMtnrsYkwDONghRWLBVWEkG2ZmWq12l5KKpNRSmXOfPskNXVNUlLtvXsAwPO8RCLheR4AWltaMtLTN6xf35eAd873/fmyvVnSjBTRsAAAsAUdAOTxC7WDfSTw2A01EMvxAqo3CD9FNv+2pqYOHTqUUtra2nrh4sWTBQWU0uLi4qXx8QdzcjB2rDgdp9U5c6f+CeMsy27bvl3Y1BzHFRUXZ+/ezXFceUXFgf3745Ys6ZWqTk8opR0aTWZGRkZmpoNUV9n8Y8e+2rWL53mEkEqlWrBgwWA/P7VaffTIkS927iQ8v3/fvkmTJkVOn+7UaH8gFolGvSBpaDILjgEQhrE5/+RcnRYZ6e/nJzyr5s37Njp6+bJlHMcVFxWdKCiYHRPzM3giFs+MjrYl68jp03mO25udTSk9e/asQ9x7hpC1CKWHDh58JzY2ODi4B2az2ZyZkSGkpvnz56d3vicfH58/rFtntViys7MB4NNt216PjOzufTuAq7pD1O3sy49zKbFYrGcuSJ6uI7GEFXQhAA/A2oXzQfZ47k9WsU6rtZeZGR0dExODMaYAebm5vXHlmaCUap+28tK4cQJB29HRJ1UIoQULF2KMEUIbn5Uirl+71tDQAAAymWz1mjUO1I9WrcrIzEzPyPhg+XJCSC8doBzX/rsFxs93c7fuWi4WGmfOMx488hQHIZbbNWYAEYA34Pa50W6bkm3EnurI6VFR+fn5lNLq6mqr1SoWi3vpU3dACDlUDpcuXhQInp6eTkV6QExMDADs37evvLw8Lzd3rkrVXQ9YWloqWA8aNcrLy8uB6ubmppo3r6/Wsbsb1XSIPtzQAkQCyBOw5r237Bn0ew661T0wA8gAmzetVqz72J7aU9x9fHyEmXR0dGi1WqVS2VfnHGCxWPZmZwtlhtFo/L6w8NSpU8LhOWPmzL5qM5vNa5KTj+TlmUymtLS06OhoiUTilLOtrU148PX1tQ1+npVVVVVle1EYQCQWb96yRaFQ9Mo8IRyDNTyPASxATUDB7qWTRw2GdVs9ACwyCfP1n2Vvz3aQ/q/2TVarNXXrVgT2HgLDMJMnT1apVH3Vptfr3d3dl69YsWP7dk1b26c7dqSkpPRevOCbb6qrq4XEIiwvQkjy2rW9jXsneGeDbUtW+Kh1ah9PlyPZkglhXRl6intLS4twfLm5unbtbhBCXYucZ4IQIhxclFKEkFKpXJGY+P6iRf1QJehJWLo0Nyen/sGD7N27Z0ZFKRSKttZWB05bcmtsbLQNvjFrVmVlJSUEYXz71q26ujqpVNoPN+wcevy/Y/tn3mcL1d4K+d/z2BdHOeXtKe5nTp8GAITQiJEjWZYVBl1kMiFkBoOBe7oFtVgstmLfRS7vqlAqkRzIyVEqlRUVFR8mJgqDb86Z81NmKxaLUzZvXrJ4MSEkJSVF6JYdeF4MDgYASumtqqqWlhZvb28AWLZ8uY1haXz8/bq6fvsAwg42mwHAUlxCN6brEMiys7oLOtjXMw4r+szp08eOHSOEIIC5c+faxv39/T0UCgAwGgznz52zF7ly+bKw1uRy+ZAhQ5wYY5igoKDnn39+zpw5b739NkJIrVYviYvr31RtmDZt2quTJwNAVWXlo4cPu56t4eHhHp6eAGAymbbZFfsCysvLv/vuO/KT72WpWAwc175gmYKAYfxL0sgpPTA/ifulS5cKr169cvlyfn7+xytXLomL4zmOYZjx48fPnv3kWJC7uk6ZOlXoWlM2bMg9fLiuru7+/fv5x46tWrUKADDGr06Z0rVHF2A0GoWHTZs3e3l5UUpvlpT89cu+XV53xR+3bOlh08jl8sTERIwxISQ3J+fDxMSysrKW5ub6+voD+/e/FxvrsHH7AQTAKD21qTuUtfUdQLDJ3DO/yFZ7JSclPVaBEOr8Gxoa+sWuXQ5TWp2UdPHCBY1Go2lvX5OUJFAJIUL+kcvla5KTHcwIVuzrPHd399S0tA8SEiilGenpr02dOmLEiK4iXUGdldjPPfdcfELClzt38l0MCVgcF3fz5s2TJ04QQo4fP56fny+Xy4WkRAH8/P0fPXzoVHN3QBjb2zAC5S8XWatrjEAIgGtZpe6LPa5LF3Unjg0GA8ZYaEAEUEoxw4wZM2bT1q2H8/K6VtYBAQE5ubnjQkMBAAHYLl4A4KWQkMN5ecOHD7fnp5QaDQaMsclotI9IVFTUjBkzMMZAaXx8vF6vtxcx6PUYY8LzDr2MyWQSHHa44ExcuXLQoEEMw2CM9Tpd19B/lpW1IjFRuMjDGAs7TyKVpmzatHbtWoZhzGZz778CUZ7HhNi4TUC5Rw1ivZEDoAAmoNaV643fnOpOHF2+dMlsfrIpMMPI5XI/P7+AgIBn2i69ebOioqKxsZFSOmjQoODg4JDQ0K5sFoulsLCQs1pFYnFERITtiAYAnU5XXFQEACaT6eVXXrHVcDYRzDATJkyQyZ58N6j84Qeh+Rw7dqy3j4+9oZqamtraWowQy7IREyc6vQduamr6vrCwpqaG5/nAwMCJEycGBAa2t7dfv36dYZiIiIjumgAHGA4dRQtXaIBQAE/AhsnhzLBh7n/LbQAiFMoyQCAWyXK+ks5ycucz8J2vn2gd/zpbVqkFKgdERSLXa6ext7Lj5Vnu9f9uA2K1hR5A+sl6WdJyB/GB79r9gXbrp65lVXqgXoCRi1SSs0s0JggP9nW9etIY/x6WSb0BuwPigBIAZn1a++RZ1vNXnlJBB9BH6L7aR8V+vNivQzy4I0plLq90YOBr7xu3/UU96Y1GrxGt4sEGsR9l/Snrr5n0huloAa83UEoH8kxfQKnxQJ41eTMKHIonhrNvRos774Gdsze18Pcf8HX1XG09f/8Bqa5BHTrR6F8zc6IH4t4XUMrfq2OUSvDs2x3OUzp0eqo3/AdaonGOgnlWFwAAAABJRU5ErkJggg==';
  document.querySelectorAll('img[data-qcb-logo]').forEach(img => {
    if (!img.getAttribute('src')) img.src = DURING_LOGO;
  });

  // ============================================================
  //  날짜/공용 유틸
  // ============================================================
  function toYmd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function getMonday(d){
    const date = new Date(d); date.setHours(0,0,0,0);
    const day = date.getDay();
    date.setDate(date.getDate() + (day===0 ? -6 : 1-day));
    return date;
  }
  function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function addMonths(d,n){ const r=new Date(d); r.setMonth(r.getMonth()+n); return r; }
  function loadJson(key){ try{ return JSON.parse(localStorage.getItem(key))||[]; }catch(e){ return []; } }

  // ------------------------------------------------------------
  //  [중요] 데이터 최신본을 읽어옵니다.
  //  1순위: GitHub(during-mobile-data) - 외부망/모바일에서도 빠르게 응답.
  //  2순위: 사내 GitLab 직접 조회 - GitHub에 값이 없거나 GitHubSync가
  //         로드되지 않은 경우에만 폴백으로 시도합니다.
  //  3순위: 위 두 곳 모두 실패하면 null → 호출부가 localStorage 캐시로 대체.
  // ------------------------------------------------------------
  function loadGitlabPrefixSync(prefix){
    // 1순위: GitHub
    if (window.GitHubSync && typeof GitHubSync.pullJSONSync === 'function') {
      try {
        const fileName = prefix.replace(/^data\//, '') + '.json'; // 'data/measure' -> 'measure.json'
        const fromGithub = GitHubSync.pullJSONSync(fileName, null);
        if (fromGithub) return fromGithub;
      } catch (e) {
        console.warn('[챗봇] GitHub 데이터 로드 실패, 사내 GitLab로 재시도합니다:', e);
      }
    }
    // 2순위: 사내 GitLab (외부망에서는 응답이 없어 느릴 수 있으므로 GitHub 실패 시에만 시도)
    if (typeof gitlabLoadLatestVersionedSync !== 'function') {
      console.warn('[챗봇] gitlab-storage.js가 로드되지 않아 GitLab 조회를 건너뜁니다. localStorage 캐시를 사용합니다.');
      return null;
    }
    try {
      return gitlabLoadLatestVersionedSync(prefix);
    } catch (e) {
      console.warn('[챗봇] GitLab 데이터 로드 실패, localStorage 캐시로 대체합니다:', e);
      return null;
    }
  }
  const GITLAB_MEASURE = loadGitlabPrefixSync('data/measure');
  const GITLAB_INSPECTION = loadGitlabPrefixSync('data/inspection');
  if (GITLAB_MEASURE || GITLAB_INSPECTION) {
    console.log('[챗봇] GitLab에서 최신 데이터를 불러왔습니다.');
  }

  // [2026-10-10] 하단 '데이터 기준시각' 한 줄에 쓸 동기화 시각 (MM.DD HH:MM)
  function fmtSync(iso){
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p2 = n => String(n).padStart(2, '0');
    return `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  const SYNC_M = fmtSync(GITLAB_MEASURE && GITLAB_MEASURE.updatedAt);
  const SYNC_I = fmtSync(GITLAB_INSPECTION && GITLAB_INSPECTION.updatedAt);
  const SYNC_OK = !!(GITLAB_MEASURE || GITLAB_INSPECTION);

  function safeStr(v){ return (v===undefined||v===null) ? '' : String(v).trim(); }
  function escapeHtml(s){
    return safeStr(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // 날짜 계산 관련 오류(형식이 이상한 값, 빈 값 등)로 챗봇이 죽지 않도록
  // "YYYY-MM-DD..." 형식이 아니면 무조건 null을 돌려주는 안전한 파서.
  function parseYmdSafe(v){
    const s = safeStr(v);
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
    const d = new Date(s.slice(0, 10));
    return isNaN(d.getTime()) ? null : d;
  }
  // start~end 사이 일수 차이. 둘 중 하나라도 형식이 이상하면 null(판단 제외).
  function daysBetween(startYmd, endYmd){
    const s = parseYmdSafe(startYmd), e = parseYmdSafe(endYmd);
    if (!s || !e) return null;
    return Math.round((e - s) / 86400000);
  }

  const WEEKDAY_KR = ['일','월','화','수','목','금','토'];

  const now = new Date();
  const today = toYmd(now);
  const thisMonday = getMonday(now);

  // ------------------------------------------------------------
  //  데이터 로드 + 정규화
  //  assignee/customer/item/날짜 값의 앞뒤 공백을 전부 trim 합니다.
  //  (엑셀에서 담당자 이름에 공백이 섞여 들어오면 실적이 0건으로
  //   보이는 문제를 방지)
  //
  //  ★ 담당자(assignee) 필드는 "홍길동㈱(HONG GILDONG)" 처럼 이름
  //  뒤에 회사명(㈱)이나 영문 이름이 그대로 붙어서 저장되는 경우가
  //  있습니다. 순수 이름("홍길동")과 정확히 일치하지 않으면 실적이
  //  0건으로 보이므로, 문자열 맨 앞의 "한글 연속 구간"만 추출합니다.
  //  예) "홍길동㈱(HONG GILDONG)" -> "홍길동"
  //      "홍길동(Hong Gildong)"   -> "홍길동"
  // ------------------------------------------------------------
  function extractName(v){
    const s = safeStr(v);
    const m = s.match(/^[가-힣]+/);
    return m ? m[0] : s;
  }

  // 원본 row에 여러 이름으로 저장돼 있을 수 있는 필드를 순서대로 찾아
  // 처음 값이 있는 걸 반환합니다. (예: 품번 필드가 partNo / itemNo /
  // "품번" 등 실제 QMS 엑셀 업로드 로직에 따라 다르게 저장돼 있을 수 있음)
  // ⚠ 아래 후보 키 목록은 기존 코드에서 쓰던 이름(customer/item/dueDate/
  //   completeDate/assignee)의 네이밍 규칙을 참고해 추정한 것입니다.
  //   실제 qc_qms_data_v1 저장 로직의 필드명과 다르면 "납기 현황"
  //   화면의 품번/의뢰부서/측정의뢰일/결재상태 항목이 비어 보일 수 있으니,
  //   그 경우 아래 후보 배열에 실제 필드명을 추가해주세요.
  function pick(row, keys){
    for (let i = 0; i < keys.length; i++){
      const v = row[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }

  const qcQms = (GITLAB_MEASURE && GITLAB_MEASURE.qms) || loadJson('qc_qms_data_v1');
  const qcProv = (GITLAB_MEASURE && GITLAB_MEASURE.prov) || loadJson('qc_provisional_v1');

  function pcNormalize(){
    const fromQms = qcQms
      .filter(r => !safeStr(r.item).includes('삭제'))
      .map(r => ({
        customer: safeStr(r.customer),
        item: safeStr(r.item),
        partNo: safeStr(pick(r, ['partNo', 'itemNo', 'partNumber', '품번'])),
        dept: safeStr(pick(r, ['dept', 'department', 'reqDept', 'requestDept', '의뢰부서'])),
        requestDate: safeStr(pick(r, ['requestDate', 'reqDate', 'measureRequestDate', 'requestDt', '측정의뢰일'])),
        dueDate: safeStr(r.dueDate),
        completeDate: safeStr(r.completeDate),
        qty: safeStr(pick(r, ['qty', 'quantity', 'measureQty', '수량', '측정수량'])),
        approvalStatus: safeStr(pick(r, ['approvalStatus', 'apprStatus', 'status', '결재상태'])),
        assignee: extractName(r.assignee),
        source: 'qms'
      }));
    const fromProv = qcProv.map(p => ({
      customer: safeStr(p.customer),
      item: safeStr(p.item),
      partNo: safeStr(pick(p, ['partNo', 'itemNo', 'partNumber', '품번'])),
      dept: safeStr(pick(p, ['dept', 'department', 'reqDept', 'requestDept', '의뢰부서'])),
      requestDate: safeStr(pick(p, ['requestDate', 'reqDate', 'measureRequestDate', 'requestDt', '측정의뢰일'])),
      dueDate: safeStr(p.dueDate || p.planDate),
      completeDate: p.completed ? safeStr(p.completedAt) : '',
      qty: safeStr(pick(p, ['qty', 'quantity', 'measureQty', '수량', '측정수량'])),
      approvalStatus: safeStr(pick(p, ['approvalStatus', 'apprStatus', 'status', '결재상태'])),
      assignee: extractName(p.assignee),
      source: 'prov'
    }));
    return [...fromQms, ...fromProv];
  }
  const pcAll = pcNormalize();

  // ============================================================
  //  [수입검사부] 데이터 로드 + 정규화
  //  admin_inspection.html의 컬럼 매핑(HEADER_MAP)을 그대로 따릅니다:
  //    partNo/receiveDate/customer/vendor/item/lot/receiveQty/
  //    inspectQty/inspectDate(=완료일)/judgement/assignee/remark
  // ============================================================
  const qiQms = (GITLAB_INSPECTION && GITLAB_INSPECTION.qms) || loadJson('qi_qms_data_v1');
  function qiNormalize(){
    return qiQms.map(r => ({
      customer: safeStr(r.customer),
      vendor: safeStr(r.vendor),
      item: safeStr(r.item),
      partNo: safeStr(r.partNo),
      lot: safeStr(r.lot),
      receiveDate: safeStr(r.receiveDate),
      completeDate: safeStr(r.inspectDate),
      qty: safeStr(r.inspectQty || r.receiveQty),
      judgement: safeStr(r.judgement),
      assignee: extractName(r.assignee),
      remark: safeStr(r.remark)
    }));
  }
  const qiAll = qiNormalize();
  // [2026-10-01] 수입검사 콘솔은 이번 달·직전 달 시트만 보관 → 그 이전 달 '완료/불합격' 숫자는 접수대장 업로드 때 저장한 월별 요약(meta.yearSummary)으로 대체
  const QI_YS = (function(){
    const m = (GITLAB_INSPECTION && GITLAB_INSPECTION.meta) || (function(){ try { return JSON.parse(localStorage.getItem('qi_qms_meta_v1')); } catch (e) { return null; } })();
    return (m && m.yearSummary && m.yearSummary.months) ? m.yearSummary : null;
  })();
  // 직전 달보다 앞선 달이면 월별 요약을, 아니면 null (→ 실데이터 사용)
  function ysMonth(info){
    if (!QI_YS || info.start >= monthInfo(1).start) return null;
    return QI_YS.months[info.start.slice(0, 7)] || null;
  }
  // 직전 달보다 앞선 달의 담당자별 완료 건수는 월별 요약(p)에서, 그 외는 실데이터에서
  function countForInWithSummary(name, info){
    if (info.start < monthInfo(1).start && QI_YS) {
      const y = QI_YS.months[info.start.slice(0, 7)];
      if (y && y.p) { let n = 0; Object.keys(y.p).forEach(k => { if (extractName(k) === name) n += y.p[k]; }); return n; }
    }
    return countForIn(qiAll, name, info);
  }

  // ============================================================
  //  시나리오에서 쓸 담당자 목록 (담당자 추가/변경 시 여기만 수정)
  //  ※ 실제 데이터에 담당자 이름이 다르게 들어와 있으면(오타 등)
  //     아래 배열도 함께 맞춰줘야 합니다.
  // ============================================================
  //  [2026-09-30] 이름을 코드에 적지 않고 데이터에서 자동으로 뽑습니다.
  //   - 최근 6개월 완료 건이 있는 담당자만 (퇴사·이동 인원 자동 제외)
  //   - 6개월 내 기록이 없으면 전체 기간에서 추출
  //   - 가나다순 (건수순으로 정렬하면 순위처럼 보여서)
  function peopleFrom(dataset){
    const since = toYmd(addMonths(now, -6));
    const valid = n => /^[가-힣]{2,5}$/.test(n) && n !== '미지정';
    let names = dataset.filter(r => valid(r.assignee) && r.completeDate && r.completeDate >= since).map(r => r.assignee);
    if (!names.length) names = dataset.filter(r => valid(r.assignee)).map(r => r.assignee);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'ko'));
  }
  const PEOPLE = peopleFrom(pcAll);          // 정밀측정부
  const PEOPLE_INSPECT = peopleFrom(qiAll);  // 수입검사부

  // ============================================================
  //  기간 계산 헬퍼
  //  - day:   특정 하루 (start === end)
  //  - week:  월요일~일요일 (주말 완료 건도 포함)
  //  - month: 특정 월 전체 (최근 3개월 중 선택)
  // ============================================================
  function dayInfo(offset){ // 0=오늘, 1=어제, 2=그저께 ...
    const d = addDays(now, -offset);
    const ymd = toYmd(d);
    let label;
    if (offset === 0) label = `오늘 (${ymd})`;
    else if (offset === 1) label = `어제 (${ymd})`;
    else label = `${ymd} (${WEEKDAY_KR[d.getDay()]})`;
    return { type: 'day', label, start: ymd, end: ymd, star: offset === 0 };
  }
  function weekInfo(offset){ // 0=이번 주, 1=지난 주
    const monday = addDays(thisMonday, -7 * offset);
    const sunday = addDays(monday, 6);
    const label = (offset === 0 ? '이번 주' : `${offset}주 전`) + ` (${toYmd(monday)} ~ ${toYmd(sunday)})`;
    return { type: 'week', label, start: toYmd(monday), end: toYmd(sunday), star: offset === 0 };
  }
  function monthInfoByStart(start){ // 'YYYY-MM-01' → 그 달의 monthInfo (말일 계산용)
    const y = +start.slice(0, 4), m = +start.slice(5, 7);
    const last = new Date(y, m, 0).getDate();
    return { start, end: `${start.slice(0, 8)}${String(last).padStart(2, '0')}` };
  }
  function monthInfo(offset){ // 0=이번 달, 1=지난달, 2=지지난달
    const d = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -offset);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    const lastDay = new Date(y, m, 0).getDate();
    const prefix = `${y}-${String(m).padStart(2, '0')}`;
    return { type: 'month', label: `${y}년 ${m}월`, start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2,'0')}`, star: offset === 0 };
  }
  // 부서 무관 공용 버전 - dataset을 인자로 받습니다.
  function periodRowsIn(dataset, period){
    return dataset.filter(r => r.completeDate && r.completeDate >= period.start && r.completeDate <= period.end);
  }
  function countForIn(dataset, person, period){
    return periodRowsIn(dataset, period).filter(r => r.assignee === person).length;
  }
  // 기존 코드 호환용 - 정밀측정부(pcAll) 전용 래퍼. 기존 호출부는 그대로 둡니다.
  function periodRows(period){ return periodRowsIn(pcAll, period); }
  function countFor(person, period){ return countForIn(pcAll, person, period); }

  // ============================================================
  //  막대그래프 (인원별 비교, 선택 인원 강조)
  // ============================================================
  function buildBarChart(counts, selectedName){
    const w = 480, h = 150, padTop = 26, padBottom = 30, padSide = 18;
    const maxVal = Math.max(1, ...counts.map(c => c.count));
    const plotH = h - padTop - padBottom;
    const gap = 18;
    const barW = (w - padSide * 2 - gap * (counts.length - 1)) / counts.length;

    let bars = '';
    counts.forEach((c, i) => {
      const barH = c.count === 0 ? 0 : Math.max(4, Math.round((c.count / maxVal) * plotH));
      const x = padSide + i * (barW + gap);
      const y = padTop + (plotH - barH);
      const isSelected = c.name === selectedName;
      const color = isSelected ? '#1f2a44' : '#d8d8d8';
      const textColor = isSelected ? '#1f2a44' : '#666';
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${color}"></rect>`;
      bars += `<text x="${(x+barW/2).toFixed(1)}" y="${(y-8).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800" fill="${isSelected?'#1f2a44':'#111'}">${c.count}</text>`;
      bars += `<text x="${(x+barW/2).toFixed(1)}" y="${(padTop+plotH+18).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${textColor}">${escapeHtml(c.name)}</text>`;
    });
    bars += `<line x1="${padSide}" y1="${padTop+plotH}" x2="${w-padSide}" y2="${padTop+plotH}" stroke="#e5e5e5" stroke-width="1"></line>`;

    return `<div class="${UI.chartBox}"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">${bars}</svg></div>`;
  }

  // 최근 3개월 추이 (꺾은선 + 점) - 완료 건수 등 "개수" 계열에 사용
  function buildTrendChart(points){ // points: [{label, count}] oldest -> newest
    const w = 480, h = 160, padTop = 26, padBottom = 34, padSide = 30;
    const maxVal = Math.max(1, ...points.map(p => p.count));
    const plotH = h - padTop - padBottom;
    const stepX = (w - padSide * 2) / (points.length - 1 || 1);

    const coords = points.map((p, i) => {
      const x = padSide + stepX * i;
      const y = padTop + (plotH - (p.count / maxVal) * plotH);
      return { x, y, ...p };
    });

    const linePath = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
    let dots = '';
    coords.forEach(c => {
      dots += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="#1f2a44"></circle>`;
      dots += `<text x="${c.x.toFixed(1)}" y="${(c.y-12).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800" fill="#111">${c.count}</text>`;
      dots += `<text x="${c.x.toFixed(1)}" y="${(padTop+plotH+20).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#666">${escapeHtml(c.label)}</text>`;
    });
    const line = `<line x1="${padSide}" y1="${padTop+plotH}" x2="${w-padSide}" y2="${padTop+plotH}" stroke="#e5e5e5" stroke-width="1"></line>`;

    return `<div class="${UI.chartBox}"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${line}
      <path d="${linePath}" fill="none" stroke="#1f2a44" stroke-width="2.5"></path>
      ${dots}
    </svg></div>`;
  }

  // 담당자 여러 명(최대 3명)의 최근 3개월 추이를 하나의 그래프에 겹쳐
  // 그립니다. (요구사항: 담당자 순위 기능이 아니므로 정렬/순위 표시는
  // 하지 않고, 선택한 순서 그대로 색상만 구분해서 보여줍니다.)
  // series: [{name, points:[{label, count}]}] — points는 모두 같은
  // 라벨(oldest -> newest) 구성이어야 합니다.
  const TREND_COLORS = ['#1f2a44', '#0091a8', '#b08d57'];

  function buildMultiTrendChart(series){
    const w = 480, h = 200, padTop = 48, padBottom = 34, padSide = 30;
    const labels = series[0].points.map(p => p.label);
    const maxVal = Math.max(1, ...series.flatMap(s => s.points.map(p => p.count)));
    const plotH = h - padTop - padBottom;
    const stepX = (w - padSide * 2) / (labels.length - 1 || 1);

    let legend = '';
    let lines = '';
    series.forEach((s, si) => {
      const color = TREND_COLORS[si % TREND_COLORS.length];
      const coords = s.points.map((p, i) => {
        const x = padSide + stepX * i;
        const y = padTop + (plotH - (p.count / maxVal) * plotH);
        return { x, y, count: p.count };
      });
      const linePath = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
      lines += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5"></path>`;
      // 값 라벨이 선끼리 겹치지 않도록 시리즈마다 위/아래 오프셋을 다르게 줌
      const dy = -10 - si * 13;
      coords.forEach(c => {
        lines += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="${color}"></circle>`;
        lines += `<text x="${c.x.toFixed(1)}" y="${(c.y + dy).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="${color}">${c.count}</text>`;
      });

      const legendX = padSide + si * 145;
      legend += `<rect x="${legendX}" y="14" width="10" height="10" rx="2" fill="${color}"></rect>`;
      legend += `<text x="${legendX + 14}" y="23" font-size="12" font-weight="700" fill="#333">${escapeHtml(s.name)}</text>`;
    });

    let axisLabels = '';
    labels.forEach((label, i) => {
      const x = padSide + stepX * i;
      axisLabels += `<text x="${x.toFixed(1)}" y="${(padTop + plotH + 20).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#666">${escapeHtml(label)}</text>`;
    });
    const baseline = `<line x1="${padSide}" y1="${padTop + plotH}" x2="${w - padSide}" y2="${padTop + plotH}" stroke="#e5e5e5" stroke-width="1"></line>`;

    return `<div class="${UI.chartBox}"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${legend}
      ${baseline}
      ${lines}
      ${axisLabels}
    </svg></div>`;
  }

  // 최근 3개월 "납기 준수율(%)" 추이 - 0~100% 고정 스케일, 데이터 없는
  // 달은 선을 끊어서 표시. 3개월 전부 데이터가 없으면 빈 그래프 대신
  // "조회 데이터 없음" 문구를 보여준다. (요구사항 #8)
  function buildComplianceTrendChart(points){ // points: [{label, rate|null}]
    const hasAny = points.some(p => p.rate !== null);
    if (!hasAny){
      return `<div class="${UI.emptyNote}">📭 최근 3개월간 조회 데이터가 없습니다.</div>`;
    }

    const w = 480, h = 160, padTop = 26, padBottom = 34, padSide = 30;
    const plotH = h - padTop - padBottom;
    const stepX = (w - padSide * 2) / (points.length - 1 || 1);
    const maxVal = 100;

    const coords = points.map((p, i) => {
      const x = padSide + stepX * i;
      const y = padTop + (plotH - ((p.rate === null ? 0 : p.rate) / maxVal) * plotH);
      return { x, y, ...p };
    });

    let linePath = '';
    let dots = '';
    coords.forEach(c => {
      if (c.rate !== null){
        linePath += (linePath === '' ? 'M' : ' L') + c.x.toFixed(1) + ',' + c.y.toFixed(1);
        dots += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="#1a9e5c"></circle>`;
        dots += `<text x="${c.x.toFixed(1)}" y="${(c.y-12).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800" fill="#111">${c.rate}%</text>`;
      }
      dots += `<text x="${c.x.toFixed(1)}" y="${(padTop+plotH+20).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#666">${escapeHtml(c.label)}${c.rate===null ? ' (無)' : ''}</text>`;
    });
    const line = `<line x1="${padSide}" y1="${padTop+plotH}" x2="${w-padSide}" y2="${padTop+plotH}" stroke="#e5e5e5" stroke-width="1"></line>`;

    return `<div class="${UI.chartBox}"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${line}
      <path d="${linePath}" fill="none" stroke="#1a9e5c" stroke-width="2.5"></path>
      ${dots}
    </svg></div>`;
  }

  // ============================================================
  //  그래프 확대보기 (라이트박스)
  //  - 챗봇 답변 안의 그래프(.chart-box)를 클릭하면 화면 중앙에
  //    확대된 버전이 뜨고, 배경은 블러 처리된다.
  //  - 어느 화면(chatbot.html / dashboard.html 위젯)에서 불러써도
  //    동작하도록 필요한 CSS/DOM을 이 스크립트가 직접 주입한다.
  //  - 배경 클릭, ✕ 버튼, ESC 키 어느 쪽으로도 자유롭게 닫힌다.
  // ============================================================
  let lightboxEl = null;

  function injectLightboxStyles(){
    if (document.getElementById('qcLightboxStyle')) return;
    const style = document.createElement('style');
    style.id = 'qcLightboxStyle';
    style.textContent = `
      .${UI.chartBox} { cursor: zoom-in; position: relative; transition: filter .12s ease; }
      .${UI.chartBox}:hover { filter: brightness(0.97); }
      .${UI.chartBox}::after {
        content: '🔍 확대'; position: absolute; top: 8px; right: 10px;
        font-size: 10.5px; font-weight: 700; color: #999;
        background: #fff; border: 1px solid #eee; border-radius: 10px;
        padding: 2px 7px; opacity: 0; transition: opacity .12s ease;
        pointer-events: none;
      }
      .${UI.chartBox}:hover::after { opacity: 1; }

      .qc-lightbox-overlay {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(10,10,10,0.55);
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        opacity: 0; visibility: hidden;
        transition: opacity .22s ease, visibility .22s ease;
        padding: 28px;
      }
      .qc-lightbox-overlay.qc-open { opacity: 1; visibility: visible; }
      .qc-lightbox-panel {
        background: #ffffff; border-radius: 16px;
        padding: 28px 24px 20px; width: 640px; max-width: 100%;
        box-shadow: 0 24px 70px rgba(0,0,0,0.4);
        transform: scale(.92) translateY(10px);
        transition: transform .24s cubic-bezier(.22,.9,.32,1.2);
      }
      .qc-lightbox-overlay.qc-open .qc-lightbox-panel { transform: scale(1) translateY(0); }
      .qc-lightbox-panel svg { width: 100%; height: auto; display: block; }
      .qc-lightbox-caption {
        margin-bottom: 16px; padding-bottom: 14px;
        border-bottom: 1px solid #eee;
        font-size: 14px; line-height: 1.6; font-weight: 600; color: #111;
      }
      .qc-lightbox-caption ul { margin-top: 10px; }
      .qc-lightbox-caption li { font-size: 12.5px; }
      .qc-lightbox-close {
        position: absolute; top: 26px; right: 26px;
        width: 38px; height: 38px; border-radius: 50%;
        background: rgba(255,255,255,0.16); border: none; color: #fff;
        font-size: 18px; line-height: 1; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background .15s ease, transform .15s ease;
      }
      .qc-lightbox-close:hover { background: rgba(255,255,255,0.32); transform: scale(1.06); }
    `;
    document.head.appendChild(style);
  }

  function ensureLightbox(){
    if (lightboxEl) return lightboxEl;
    injectLightboxStyles();
    const overlay = document.createElement('div');
    overlay.className = 'qc-lightbox-overlay';
    overlay.innerHTML = `
      <button class="qc-lightbox-close" aria-label="닫기">✕</button>
      <div class="qc-lightbox-panel"></div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });
    overlay.querySelector('.qc-lightbox-close').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
    lightboxEl = overlay;
    return overlay;
  }

  function openLightbox(chartBoxEl){
    const svg = chartBoxEl.querySelector('svg');
    if (!svg) return;
    const overlay = ensureLightbox();
    const panel = overlay.querySelector('.qc-lightbox-panel');
    panel.innerHTML = '';

    // 그래프만 뚝 떼어 보여주면 숫자가 무슨 의미인지 알 수 없으므로,
    // 같은 말풍선 안에서 그래프 "앞"에 있던 설명/요약 통계(제목, 완료
    // 건수·완료율 같은 stat-list 등)를 그대로 캡션으로 함께 보여준다.
    // (그래프 뒤에 오는 개별 항목 목록 등은 그래프 자체 설명이 아니므로 제외)
    const bubble = chartBoxEl.closest('.' + UI.bubble);
    if (bubble){
      const caption = document.createElement('div');
      caption.className = 'qc-lightbox-caption';
      let node = bubble.firstChild;
      while (node && node !== chartBoxEl){
        caption.appendChild(node.cloneNode(true));
        node = node.nextSibling;
      }
      if (caption.childNodes.length) panel.appendChild(caption);
    }

    const clone = svg.cloneNode(true);
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    panel.appendChild(clone);

    overlay.classList.add('qc-open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox(){
    if (!lightboxEl) return;
    lightboxEl.classList.remove('qc-open');
    document.body.style.overflow = '';
  }

  // 챗봇 답변은 setTimeout으로 매번 새로 그려지므로, 각 그래프마다
  // 개별 리스너를 다는 대신 document 레벨에서 이벤트 위임으로 처리한다.
  document.addEventListener('click', (e) => {
    const box = e.target.closest && e.target.closest('.' + UI.chartBox);
    if (box) openLightbox(box);
  });

  // ============================================================
  //  다중 선택(체크박스) UI — "담당자 3개월 추이"에서 최대 3명을
  //  동시에 선택할 때 사용. 기존 버튼형 옵션(renderOptions)과는
  //  별도로, 체크박스 + "조회" 버튼 조합을 직접 그립니다.
  // ============================================================
  function injectMultiSelectStyles(){
    if (document.getElementById('qcMultiSelectStyle')) return;
    const style = document.createElement('style');
    style.id = 'qcMultiSelectStyle';
    style.textContent = `
      .qc-multiselect-wrap { display: flex; flex-direction: column; gap: 10px; width: 100%; }
      .qc-multiselect-checks { display: flex; flex-wrap: wrap; gap: 8px; }
      .qc-multiselect-item {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 8px 12px; border: 1px solid #ddd; border-radius: 20px;
        font-size: 13px; font-weight: 600; color: #333; cursor: pointer;
        user-select: none; background: #fff;
        transition: border-color .12s ease, background .12s ease, color .12s ease;
      }
      .qc-multiselect-item:hover { border-color: #1f2a44; }
      .qc-multiselect-item.qc-checked { border-color: #1f2a44; background: #f1f3f7; color: #1f2a44; }
      .qc-multiselect-item input[type=checkbox] { accent-color: #1f2a44; width: 15px; height: 15px; cursor: pointer; }
      .qc-multiselect-item input[type=checkbox]:disabled { cursor: not-allowed; }
      .qc-multiselect-hint { font-size: 11.5px; color: #999; }
      .${UI.optBtn}:disabled { opacity: .4; cursor: not-allowed; }

      .qc-trend-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12.5px; }
      .qc-trend-table th, .qc-trend-table td { border: 1px solid #eee; padding: 6px 8px; text-align: center; }
      .qc-trend-table th { background: #fafafa; font-weight: 700; color: #444; }
      .qc-trend-table td:first-child, .qc-trend-table th:first-child { text-align: left; font-weight: 700; }
    `;
    document.head.appendChild(style);
  }

  // node: { selectOptions:[{label,value}], max, action, backNode }
  function renderMultiSelect(node){
    injectMultiSelectStyles();
    const optionsWrap = getOptionsWrap();
    optionsWrap.innerHTML = '';

    const max = node.max || 3;
    const selected = [];

    const wrap = document.createElement('div');
    wrap.className = 'qc-multiselect-wrap';

    const chkWrap = document.createElement('div');
    chkWrap.className = 'qc-multiselect-checks';

    const goBtn = document.createElement('button');
    goBtn.className = UI.optBtn + ' primary';
    goBtn.textContent = '조회';
    goBtn.disabled = true;

    function syncDisabled(){
      const atMax = selected.length >= max;
      chkWrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
        if (!cb.checked) cb.disabled = atMax;
      });
      goBtn.disabled = selected.length === 0;
    }

    (node.selectOptions || []).forEach(opt => {
      const item = document.createElement('label');
      item.className = 'qc-multiselect-item';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt.value;
      cb.addEventListener('change', () => {
        if (cb.checked){
          selected.push(opt.value);
          item.classList.add('qc-checked');
        } else {
          const idx = selected.indexOf(opt.value);
          if (idx > -1) selected.splice(idx, 1);
          item.classList.remove('qc-checked');
        }
        syncDisabled();
      });

      const span = document.createElement('span');
      span.textContent = opt.label;

      item.appendChild(cb);
      item.appendChild(span);
      chkWrap.appendChild(item);
    });

    goBtn.addEventListener('click', () => {
      if (selected.length === 0) return;
      const namesForBubble = [...selected];
      appendBubble('user', namesForBubble.join(' / '));
      getOptionsWrap().innerHTML = '';
      qcbTeam = teamOf(node.backNode);
      const resultHtml = ACTIONS[node.action]({ names: namesForBubble });
      botSay(resultHtml, defaultResultOptions(node.backNode));
    });

    const hint = document.createElement('div');
    hint.className = 'qc-multiselect-hint';
    hint.textContent = `최대 ${max}명까지 선택할 수 있습니다.`;

    wrap.appendChild(chkWrap);
    wrap.appendChild(hint);
    wrap.appendChild(goBtn);
    optionsWrap.appendChild(wrap);
    appendFoot(optionsWrap);
  }

  // ============================================================
  //  납기 현황 집계
  //  - 판정 기준 (요구사항 5):
  //      측정완료일 있음 + 완료요청일 있음
  //        -> 측정완료일 ≤ 완료요청일 : 준수(onTime)
  //        -> 측정완료일 >  완료요청일 : 지연-완료(late)
  //      측정완료일 있음 + 완료요청일 없음 -> 납기 판단 제외(noDueJudge)
  //      측정완료일 없음 + 완료요청일 < 오늘 -> 지연-진행중(overdue)
  //      측정완료일 없음 + (완료요청일 없음 또는 오늘 이후) -> 진행중(inProgress)
  //  - "전체/완료/진행중"은 서로 겹치지 않는 구분이며, "지연"은 그 중
  //    문제가 되는 건(완료지연 + 미완료초과)만 별도로 강조해서 보여준다.
  //  - 대상 데이터는 정식 QMS 데이터(source==='qms')만 사용한다.
  //    (임시측정/qc_provisional_v1 데이터는 결재상태·품번 등 항목이
  //     없는 경우가 많아 납기 관리 대상에서 제외)
  // ============================================================
  function classifyDueRow(r){
    if (r.completeDate){
      if (!r.dueDate) return 'noDueJudge';
      return r.completeDate <= r.dueDate ? 'onTime' : 'late';
    }
    if (r.dueDate && r.dueDate < today) return 'overdue';
    return 'inProgress';
  }

  function computeDueOverview(){
    const rows = pcAll.filter(r => r.source === 'qms').map(r => ({ ...r, _status: classifyDueRow(r) }));

    const total = rows.length;
    const completed = rows.filter(r => r.completeDate).length;
    const inProgress = total - completed;
    const onTime = rows.filter(r => r._status === 'onTime').length;
    const late = rows.filter(r => r._status === 'late').length;
    const overdue = rows.filter(r => r._status === 'overdue').length;
    const delayed = late + overdue;
    const complianceBase = onTime + late; // 납기 판단이 가능한(완료요청일+측정완료일 모두 있는) 완료 건
    const complianceRate = complianceBase > 0 ? Math.round((onTime / complianceBase) * 100) : null;

    // 최근 3개월 납기 준수율 추이 (완료일이 속한 월 기준)
    const trend = [2, 1, 0].map(offset => {
      const info = monthInfo(offset);
      const monthRows = rows.filter(r => r.completeDate && r.completeDate >= info.start && r.completeDate <= info.end);
      const mOnTime = monthRows.filter(r => r._status === 'onTime').length;
      const mLate = monthRows.filter(r => r._status === 'late').length;
      const base = mOnTime + mLate;
      return { label: info.label.replace(/^\d{4}년\s*/, ''), rate: base > 0 ? Math.round((mOnTime / base) * 100) : null };
    });

    return { rows, total, completed, inProgress, onTime, late, overdue, delayed, complianceRate, trend };
  }

  function buildDueOverviewHtml(){
    const stats = computeDueOverview();

    if (stats.total === 0){
      return `현재 조회 가능한 QMS 데이터가 없습니다.<div class="${UI.emptyNote}">📭 조회 데이터 없음</div>`;
    }

    let html = `<b>⏱️ 납기 현황</b> (전체 QMS 데이터 기준)`;
    html += `<ul class="${UI.statList} kv">`;
    html += `<li>전체 의뢰 건수<span class="${UI.statSub}">${stats.total}건</span></li>`;
    html += `<li>완료 건수<span class="${UI.statSub}">${stats.completed}건</span></li>`;
    html += `<li>진행 중 건수<span class="${UI.statSub}">${stats.inProgress}건</span></li>`;
    html += `<li>지연 건수<span class="${UI.statSub}"><b class="accent">${stats.delayed}건</b> (완료지연 ${stats.late}건 + 미완료초과 ${stats.overdue}건)</span></li>`;
    html += `<li>납기 준수율<span class="${UI.statSub}">${stats.complianceRate === null ? '산출 불가 (판단 가능 건 없음)' : stats.complianceRate + '%'}</span></li>`;
    html += `</ul>`;

    html += `<div class="${UI.statMore}">최근 3개월 납기 준수율 추이</div>`;
    html += buildComplianceTrendChart(stats.trend);

    if (stats.delayed > 0){
      html += `<div class="${UI.statMore}">아래 버튼으로 지연 업무 상세 목록을 확인할 수 있습니다.</div>`;
    }
    return html;
  }

  function buildDelayListHtml(){
    const stats = computeDueOverview();
    const delayedRows = stats.rows.filter(r => r._status === 'late' || r._status === 'overdue');

    if (delayedRows.length === 0){
      return `<b>🔴 지연 업무 상세 목록</b><div class="${UI.emptyNote}">🎉 현재 지연 건이 없습니다.</div>`;
    }

    const withDelayDays = delayedRows.map(r => {
      const delayDays = r._status === 'late'
        ? daysBetween(r.dueDate, r.completeDate)  // 완료된 지연 건: 측정완료일 - 완료요청일
        : daysBetween(r.dueDate, today);           // 미완료 지연 건: 현재일 - 완료요청일
      return { ...r, delayDays: delayDays === null ? 0 : delayDays };
    });
    withDelayDays.sort((a, b) => b.delayDays - a.delayDays);

    const shown = withDelayDays.slice(0, 15);
    let html = `<b>🔴 지연 업무 상세 목록</b> (총 <b class="accent">${withDelayDays.length}건</b>)`;
    html += `<ul class="${UI.statList}">` + shown.map(r => `
      <li>${escapeHtml(r.item) || '(품명없음)'}${r.partNo ? ' · ' + escapeHtml(r.partNo) : ''}
        <span class="${UI.statSub}">의뢰부서 ${escapeHtml(r.dept) || '미지정'} · 측정담당자 ${escapeHtml(r.assignee) || '미지정'}</span>
        <span class="${UI.statSub}">의뢰일 ${r.requestDate || '-'} · 요청일 ${r.dueDate || '-'} · 완료일 ${r.completeDate || '진행중'}</span>
        <span class="${UI.statSub}">지연일수 <b class="accent">${r.delayDays}일</b> · 결재상태 ${escapeHtml(r.approvalStatus) || '미지정'}</span>
      </li>`).join('') + `</ul>`;

    if (withDelayDays.length > shown.length){
      html += `<div class="${UI.statMore}">외 ${withDelayDays.length - shown.length}건 더 있습니다.</div>`;
    }
    return html;
  }

  // ============================================================
  //  [수입검사부] 처리 현황 집계
  //  - 정밀측정부의 "납기(완료요청일)" 개념이 수입검사 데이터엔 없어서,
  //    대신 "입고일 -> 검사완료일" 소요일수를 기준으로 삼습니다.
  //  - 적체: 아직 검사 안 끝났는데 입고 후 AGING_THRESHOLD_DAYS일 이상
  //    지난 건.
  // ============================================================
  const INSPECT_AGING_THRESHOLD_DAYS = 5;

  function computeInspectProcessOverview(){
    const total = qiAll.length;
    const completed = qiAll.filter(r => r.completeDate).length;
    const pending = total - completed;

    const procDaysList = qiAll
      .filter(r => r.completeDate)
      .map(r => daysBetween(r.receiveDate, r.completeDate))
      .filter(v => v !== null && v >= 0);
    const avgProc = procDaysList.length
      ? Math.round((procDaysList.reduce((a,b)=>a+b,0) / procDaysList.length) * 10) / 10
      : null;

    const agingRows = qiAll.filter(r => {
      if (r.completeDate || !r.receiveDate) return false;
      const d = daysBetween(r.receiveDate, today);
      return d !== null && d >= INSPECT_AGING_THRESHOLD_DAYS;
    });

    const trend = [2, 1, 0].map(offset => {
      const info = monthInfo(offset);
      const y = ysMonth(info);
      if (y && y.pn) return { label: info.label.replace(/^\d{4}년\s*/, ''), count: Math.round(y.pd / y.pn * 10) / 10 };
      const monthRows = qiAll.filter(r => r.completeDate && r.completeDate >= info.start && r.completeDate <= info.end);
      const days = monthRows.map(r => daysBetween(r.receiveDate, r.completeDate)).filter(v => v !== null && v >= 0);
      const avg = days.length ? Math.round((days.reduce((a,b)=>a+b,0) / days.length) * 10) / 10 : 0;
      return { label: info.label.replace(/^\d{4}년\s*/, ''), count: avg };
    });

    return { total, completed, pending, avgProc, agingRows, trend };
  }

  function buildInspectProcessHtml(){
    const stats = computeInspectProcessOverview();
    if (stats.total === 0){
      return `현재 조회 가능한 수입검사 데이터가 없습니다.<div class="${UI.emptyNote}">📭 조회 데이터 없음</div>`;
    }

    let html = `<b>⏱️ 처리 현황</b> (최근 2개월 데이터 기준 · 이번 달+지난달)`;
    html += `<ul class="${UI.statList} kv">`;
    html += `<li>전체 입고 건수<span class="${UI.statSub}">${stats.total}건</span></li>`;
    html += `<li>검사완료 건수<span class="${UI.statSub}">${stats.completed}건</span></li>`;
    html += `<li>검사대기(진행중) 건수<span class="${UI.statSub}">${stats.pending}건</span></li>`;
    html += `<li>평균 검사소요일<span class="${UI.statSub}">${stats.avgProc === null ? '산출 불가' : stats.avgProc + '일'}</span></li>`;
    html += `<li>적체 건수 (입고 후 ${INSPECT_AGING_THRESHOLD_DAYS}일 이상 미검사)<span class="${UI.statSub}"><b class="accent">${stats.agingRows.length}건</b></span></li>`;
    html += `</ul>`;

    html += `<div class="${UI.statMore}">최근 3개월 평균 검사소요일 추이</div>`;
    html += buildTrendChart(stats.trend);

    if (stats.agingRows.length > 0){
      html += `<div class="${UI.statMore}">아래 버튼으로 적체 건 상세 목록을 확인할 수 있습니다.</div>`;
    }
    return html;
  }

  function buildInspectAgingListHtml(){
    const stats = computeInspectProcessOverview();
    if (stats.agingRows.length === 0){
      return `<b>🔴 적체 건 상세 목록</b><div class="${UI.emptyNote}">🎉 현재 적체 건이 없습니다.</div>`;
    }
    const withDays = stats.agingRows.map(r => ({ ...r, agingDays: daysBetween(r.receiveDate, today) || 0 }));
    withDays.sort((a, b) => b.agingDays - a.agingDays);

    const shown = withDays.slice(0, 15);
    let html = `<b>🔴 적체 건 상세 목록</b> (총 <b class="accent">${withDays.length}건</b>)`;
    html += `<ul class="${UI.statList}">` + shown.map(r => `
      <li>${escapeHtml(r.item) || '(품명없음)'}${r.partNo ? ' · ' + escapeHtml(r.partNo) : ''}
        <span class="${UI.statSub}">업체 ${escapeHtml(r.vendor) || '미지정'} · 담당 ${escapeHtml(r.assignee) || '미지정'}</span>
        <span class="${UI.statSub}">입고일 ${r.receiveDate || '-'} · 경과 <b class="accent">${r.agingDays}일</b></span>
      </li>`).join('') + `</ul>`;

    if (withDays.length > shown.length){
      html += `<div class="${UI.statMore}">외 ${withDays.length - shown.length}건 더 있습니다.</div>`;
    }
    return html;
  }

  // ============================================================
  //  [수입검사부] 불량/품질 현황 집계
  //  - 판정(judgement) 필드에서 'NG'/'불합격'/'부적합' 등이 보이면
  //    불량으로 간주합니다. (엑셀 표기가 다르면 아래 정규식을 맞춰주세요)
  // ============================================================
  const NG_PATTERN = /NG|불합격|부적합/i;

  function computeQualityOverview(){
    const judged = qiAll.filter(r => r.completeDate && r.judgement);
    const total = judged.length;
    const ngRows = judged.filter(r => NG_PATTERN.test(r.judgement));
    const ngCount = ngRows.length;
    const ngRate = total ? Math.round((ngCount / total) * 1000) / 10 : null;

    const trend = [2, 1, 0].map(offset => {
      const info = monthInfo(offset);
      const y = ysMonth(info);
      if (y) return { label: info.label.replace(/^\d{4}년\s*/, ''), rate: y.judged ? Math.round((y.ng || 0) / y.judged * 1000) / 10 : null };
      const monthRows = judged.filter(r => r.completeDate >= info.start && r.completeDate <= info.end);
      const monthNg = monthRows.filter(r => NG_PATTERN.test(r.judgement)).length;
      const rate = monthRows.length ? Math.round((monthNg / monthRows.length) * 1000) / 10 : null;
      return { label: info.label.replace(/^\d{4}년\s*/, ''), rate };
    });

    const recentStart = monthInfo(2).start;
    const recentNg = ngRows.filter(r => r.completeDate >= recentStart);
    const vendorCounts = {};
    recentNg.forEach(r => {
      const v = r.vendor || '미지정';
      vendorCounts[v] = (vendorCounts[v] || 0) + 1;
    });
    // 지지난달은 실데이터가 일부뿐 → 월별 요약의 협력사별 불합격 수로 대체 (실데이터 중 그 달 건은 빼고 더함)
    const y2 = ysMonth(monthInfo(2));
    if (y2) {
      recentNg.filter(r => r.completeDate < monthInfo(1).start).forEach(r => { const v = r.vendor || '미지정'; vendorCounts[v]--; if (vendorCounts[v] <= 0) delete vendorCounts[v]; });
      Object.entries(y2.v || {}).forEach(([v, x]) => { if (x[1] > 0) vendorCounts[v] = (vendorCounts[v] || 0) + x[1]; });
    }
    const vendorRanking = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const recentDefects = [...recentNg].sort((a, b) => (b.completeDate || '').localeCompare(a.completeDate || '')).slice(0, 8);

    return { total, ngCount, ngRate, trend, vendorRanking, recentDefects };
  }

  function buildQualityStatusHtml(){
    const stats = computeQualityOverview();
    if (stats.total === 0){
      return `현재 판정 데이터가 있는 검사 완료 건이 없습니다.<div class="${UI.emptyNote}">📭 조회 데이터 없음</div>`;
    }

    let html = `<b>🔴 불량/품질 현황</b> (판정 완료 기준 · 건수는 최근 2개월)`;
    html += `<ul class="${UI.statList} kv">`;
    html += `<li>판정 완료 건수<span class="${UI.statSub}">${stats.total}건</span></li>`;
    html += `<li>불량(NG) 건수<span class="${UI.statSub}"><b class="accent">${stats.ngCount}건</b></span></li>`;
    html += `<li>불량률<span class="${UI.statSub}">${stats.ngRate === null ? '산출 불가' : stats.ngRate + '%'}</span></li>`;
    html += `</ul>`;

    html += `<div class="${UI.statMore}">최근 3개월 불량률 추이</div>`;
    html += buildComplianceTrendChart(stats.trend);

    if (stats.vendorRanking.length){
      html += `<div class="${UI.statMore}">최근 3개월 불량 다발 업체</div>`;
      html += `<ul class="${UI.rankList}">` + stats.vendorRanking.map(([name, count], i) => `
        <li><span class="medal">${['🥇','🥈','🥉','4','5'][i] || ''}</span><span class="rname">${escapeHtml(name)}</span><span class="rcount">${count}건</span></li>`).join('') + `</ul>`;
    }

    if (stats.recentDefects.length){
      html += `<div class="${UI.statMore}">최근 불량 내용</div>`;
      html += `<ul class="${UI.statList}">` + stats.recentDefects.map(r => `
        <li>${escapeHtml(r.item) || '(품명없음)'}
          <span class="${UI.statSub}">${escapeHtml(r.vendor) || '-'} · ${r.completeDate} · ${escapeHtml(r.remark) || '비고 없음'}</span>
        </li>`).join('') + `</ul>`;
    }
    return html;
  }

  // ============================================================
  //  액션 함수 (동적 데이터 응답 생성) — 새 액션은 여기 추가
  // ============================================================
  // ============================================================
  //  [2026-09-30] 공용 헬퍼: 가로 막대 · 증감 표시 · 문자 정규화
  // ============================================================
  function buildHBarChart(items, total){ // items: [{name, count}] (정렬된 상태)
    const rowH = 30, w = 340, labelW = 88, padR = 88;
    const h = items.length * rowH + 8;
    const maxVal = Math.max(1, ...items.map(i => i.count));
    let g = '';
    items.forEach((it, i) => {
      const y = 4 + i * rowH;
      const bw = Math.max(3, Math.round((it.count / maxVal) * (w - labelW - padR)));
      const pct = total ? Math.round(it.count / total * 1000) / 10 : 0;
      const nm = it.name.length > 7 ? it.name.slice(0, 6) + '…' : it.name;
      g += `<text x="${labelW - 8}" y="${y + 18}" text-anchor="end" font-size="13" font-weight="700" fill="${it.muted ? '#999' : '#333'}">${escapeHtml(nm)}</text>`;
      g += `<rect x="${labelW}" y="${y + 6}" width="${bw}" height="16" rx="4" fill="${it.muted ? '#cfcfcf' : (i === 0 ? '#e62e2d' : '#1a73e8')}" opacity="${i === 0 || it.muted ? 1 : 0.75}"></rect>`;
      g += `<text x="${labelW + bw + 6}" y="${y + 18}" font-size="13" font-weight="800" fill="#111">${it.count}건 <tspan fill="#888" font-weight="700">${pct}%</tspan></text>`;
    });
    return `<div class="${UI.chartBox}"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">${g}</svg></div>`;
  }
  // 증감: goodUp=true면 증가가 좋은 지표(초록), false면 증가가 나쁜 지표(빨강), null이면 중립(회색)
  function deltaTag(cur, prev, unit, goodUp, digits){
    if (cur === null || prev === null || cur === undefined || prev === undefined) return { html: '', text: '' };
    const d = Math.round((cur - prev) * Math.pow(10, digits || 0)) / Math.pow(10, digits || 0);
    if (d === 0) return { html: ` <span style="color:#888;font-weight:800">(＝)</span>`, text: ' (전월 동일)' };
    const up = d > 0, arrow = up ? '▲' : '▼';
    const good = goodUp === null ? null : (up === goodUp);
    const color = good === null ? '#888' : (good ? '#1a9e5c' : '#e62e2d');
    const v = Math.abs(d) + (unit || '');
    return { html: ` <span style="color:${color};font-weight:900">${arrow}${v}</span>`, text: ` (${arrow}${v})` };
  }
  function avgOf(list){ return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length * 10) / 10 : null; }
  function normKey(v){ return safeStr(v).toLowerCase().replace(/[\s\-_./]/g, ''); }
  function rangeRows(dataset, start, end, field){
    return dataset.filter(r => r[field] && r[field] >= start && r[field] <= end);
  }

  // 월간 요약에 쓰는 기간 계산 (partial=true면 1일~오늘 날짜까지, 전월도 같은 날짜까지로 맞춰 비교)
  function summaryRange(offset, partial){
    const info = monthInfo(offset);
    if (!partial) return { start: info.start, end: info.end, label: info.label };
    const day = String(Math.min(now.getDate(), Number(info.end.slice(8)))).padStart(2, '0');
    return { start: info.start, end: info.start.slice(0, 8) + day, label: info.label };
  }
  function measureMetrics(rg){
    const done = rangeRows(pcAll, rg.start, rg.end, 'completeDate');
    const qms = done.filter(r => r.source === 'qms');
    const onTime = qms.filter(r => r.dueDate && r.completeDate <= r.dueDate).length;
    const late = qms.filter(r => r.dueDate && r.completeDate > r.dueDate).length;
    const proc = done.map(r => daysBetween(r.requestDate, r.completeDate)).filter(v => v !== null && v >= 0);
    let qty = 0, hasQty = false;
    done.forEach(r => { const n = Number(r.qty); if (r.qty !== '' && !isNaN(n)) { qty += n; hasQty = true; } });
    return { done: done.length, qty: hasQty ? qty : null, onTimeRate: (onTime + late) ? Math.round(onTime / (onTime + late) * 100) : null, late, avgProc: avgOf(proc) };
  }
  function inspectMetrics(rg){
    // 직전 달보다 앞선 기간: 실데이터가 일부만 있어 비교가 틀어지므로 월별 요약(한 달 전체일 때만) 또는 '비교 불가'
    const liveStart = monthInfo(1).start;
    if (rg.start < liveStart){
      const y = QI_YS && QI_YS.months[rg.start.slice(0, 7)];
      const fullMonth = rg.end === monthInfoByStart(rg.start).end;
      if (y && fullMonth){
        const vend = Object.entries(y.v || {}).filter(([, x]) => x[1] > 0).map(([v, x]) => [v, x[1]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
        return { done: y.done || 0, judged: y.judged || 0, ng: y.ng || 0, ngRate: y.judged ? Math.round((y.ng || 0) / y.judged * 1000) / 10 : null, avgProc: null, vendors: vend, fromSummary: true };
      }
      return { done: null, judged: 0, ng: 0, ngRate: null, avgProc: null, vendors: [], unavailable: true };
    }
    const done = rangeRows(qiAll, rg.start, rg.end, 'completeDate');
    const judged = done.filter(r => r.judgement);
    const ng = judged.filter(r => NG_PATTERN.test(r.judgement));
    const proc = done.map(r => daysBetween(r.receiveDate, r.completeDate)).filter(v => v !== null && v >= 0);
    const vend = {};
    ng.forEach(r => { const v = r.vendor || '미지정'; vend[v] = (vend[v] || 0) + 1; });
    return { done: done.length, judged: judged.length, ng: ng.length, ngRate: judged.length ? Math.round(ng.length / judged.length * 1000) / 10 : null, avgProc: avgOf(proc), vendors: Object.entries(vend).sort((a, b) => b[1] - a[1]).slice(0, 3) };
  }

  // 품번 조회 최근 기록 (이 기기에만)
  const PART_RECENT_KEY = 'qcb_part_recent_v1';
  function partRecent(){ try { const a = JSON.parse(localStorage.getItem(PART_RECENT_KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function pushPartRecent(q){
    const list = [q, ...partRecent().filter(x => x !== q)].slice(0, 6);
    try { localStorage.setItem(PART_RECENT_KEY, JSON.stringify(list)); } catch (e) {}
  }

  // ============================================================
  //  📘 제품 사전 (출처: 회사 홈페이지 제품소개 · 2026-10-16 수집)
  //  [분류코드, 유형, 제품명, 기능 설명]
  // ============================================================
  // [2026-10-16] 설명은 챗봇용으로 핵심만 한 줄 (원문: 회사 홈페이지 제품소개)
  const PRODUCT_DICT = [
    ["pt", "액추에이터", "PCSV(Purge Control Solenoid Valve) KEV3", "증발가스를 엔진 흡기로 보내거나 막는 밸브"],
    ["pt", "액추에이터", "PCSV(Purge Control Solenoid Valve) KEV2", "증발가스를 엔진 흡기로 보내거나 막는 밸브"],
    ["pt", "액추에이터", "PCSV(Purge Control Solenoid Valve) KEV1", "증발가스를 엔진 흡기로 보내거나 막는 밸브"],
    ["pt", "액추에이터", "고압펌프 Drive Unit", "저압 연료를 고압으로 압축해 연료레일 공급"],
    ["pt", "액추에이터", "VIS(통합형)", "엔진 회전수에 따라 흡기 통로를 바꿔 토크 향상"],
    ["pt", "액추에이터", "LP EGR Cover", "배기가스 재순환(EGR) · NOx 저감"],
    ["pt", "액추에이터", "ETC Cover Assy", "스로틀 밸브 · 흡입 공기량 조절"],
    ["pt", "액추에이터", "HDP5 EVO & HDP6 (HDP6 - 031,032,035)", "직분사용 고압 연료펌프"],
    ["pt", "액추에이터", "EWGA-L Housing Assy", "터보 웨이스트게이트 밸브 개도 제어"],
    ["pt", "Solenoid Valve", "GDI SOLENOID", "가솔린 직분사(GDI) 연료 공급 조절"],
    ["pt", "Solenoid Valve", "OCV (Oil Control Valve)", "엔진 오일의 방향·유량 제어"],
    ["pt", "인젝터", "HDEV5 Coil Assy", "GDI 인젝터 코일 · 밸브 개폐"],
    ["pt", "인젝터", "VFS HV-10, 16 Coil Assy", "자동변속기 클러치·브레이크 유압 직접 제어"],
    ["pt", "인젝터", "KIV LPI", "LPG 연료를 흡기포트로 정량 분사"],
    ["pt", "인젝터", "EV-6", "LPG 연료를 흡기포트로 정량 분사"],
    ["pt", "센서", "TMED(Transmission Mounted Electric Device) 스피드센서", "HEV 변속기 입력 RPM·차축 속도 감지"],
    ["pt", "센서", "8ATSS HOLDER", "자동변속기 입력 RPM·차축 속도 감지"],
    ["pt", "센서", "6ATSS HOLDER", "자동변속기 입력 RPM·차축 속도 감지"],
    ["pt", "센서", "7DCI , 7DCT", "자동변속기 입력 RPM·차축 속도 감지"],
    ["pt", "센서", "CMP (Tou Cup, Scup Gray, HOLDER, HOLDER Gamma)", "캠샤프트 위치 검출 · 점화 시기 기준"],
    ["pt", "센서", "CKP U2 Bobbin", "엔진 회전수·피스톤 위치 검출"],
    ["pt", "센서", "CKP Kappa Bobbin", "엔진 회전수·피스톤 위치 검출"],
    ["pt", "센서", "CKP Bobbin", "엔진 회전수·피스톤 위치 검출"],
    ["pt", "센서", "인히비터 스위치 전륜습식 DCT (Housing & Rotor)", "변속 레버 P·R·N·D 위치 감지"],
    ["pt", "센서", "인히비터 스위치 전동식 SBW (Housing & Rotor)", "변속 레버 P·R·N·D 위치 감지 (전동식)"],
    ["pt", "센서", "인히비터 스위치 (Housing & Rotor)", "변속 레버 P·R·N·D 위치 감지"],
    ["pt", "센서", "MAP Sensor (Housing & Cover)", "흡기관 압력으로 흡입 공기량 측정"],
    ["pt", "센서", "HFM (Cylinder Housing)", "흡입 공기량 측정"],
    ["pt", "이그니션", "600C 외부케이스", "스틱형 점화코일 · 고전압 생성"],
    ["pt", "이그니션", "MAGNETIC CORE COVER Assy(600H / 601D)", "플러그탑형 고에너지 점화코일"],
    ["pt", "이그니션", "감마2 MPI 4 PIN 커넥터 F, G", "플러그탑형 고에너지 점화코일"],
    ["ad", "제동장치", "MGH-60/80/100 ABS,ESC,MOCi Series", "ABS·ESC 제동장치"],
    ["ad", "제동장치", "MEB5 ESC,ESCi", "모비스 전자식 브레이크 (ABS·ESC)"],
    ["ad", "센서", "TAS Gen 2.0", "핸들 조향 힘·각도 감지"],
    ["ad", "센서", "Radar Sensor Housing", "후측방 경고 등 레이더 센서 하우징"],
    ["ev", "EV 이륜모터", "EV 2-wheelers motor (Rotor Assy, Stator mold sub assy)", "전기이륜차 구동 모터"],
    ["ev", "EV 이륜 모터제어기", "EV 2-wheelers MCU(Motor control unit) Housing", "전기이륜차 모터 제어기 하우징"],
    ["ev", "배터리 관리", "PRA (Power Relay Assembly) Main Cover, Main Body Assy", "고전압 배터리 전원 연결·차단"],
    ["ev", "액추에이터", "FCEV CAP", "수소차 모터 단자 통전 방지 캡"],
    ["ev", "액추에이터", "FCEV APC/ACV Flange", "수소차 밸브 모터를 하우징에 고정"],
    ["ev", "액추에이터", "FCEV APC COVER", "수소차 공기압 제어밸브 커버"],
    ["ev", "액추에이터", "FCEV ACV COVER", "수소차 공기 차단밸브 커버"],
    ["ev", "제동장치", "iMEB 1,2,3 Series", "전동식 통합 회생제동 브레이크"],
    ["ev", "제동장치", "IDB 1,2 Series", "모터 구동 통합 전자 브레이크 (ESC 포함)"],
    ["mo", "BLDC 모터", "Long Axis Motor - Inner Rotor / □13.0*14.5", "반도체장비 픽업 모듈 회전 모터"],
    ["mo", "BLDC 모터", "Lidar Motor - O.D Ø41.0 (Hollow)", "라이다 회전용 BLDC (중공축)"],
    ["mo", "BLDC 모터", "Lidar Motor - O.D Ø32.5", "라이다 회전용 BLDC"],
    ["mo", "BLDC 모터", "Drone Motor - Outer Rotor (KV100/KV135)", "소형 드론용 모터"],
    ["mo", "BLDC 모터", "BLDC Motor (5kW)", "전기삼륜차 구동 모터"],
    ["mo", "BLDC 모터", "BLDC Motor (3kW)", "전기오토바이·소형차용 모터"],
    ["mo", "BLDC 모터", "Blower Motor", "시트 통풍 블로워 모터"],
    ["mo", "BLDC 모터", "Power Seat BLDC Swivel Motor", "시트 180° 회전 모터"],
    ["mo", "BLDC 모터", "PAV & UAV Motor (15kW)", "PAV·UAV 전기추진 모터"],
    ["mo", "액추에이터", "Actuator Assy Walk In & Remote Fold – GEN2", "시트 폴딩·워크인 액추에이터"],
    ["mo", "액추에이터", "Actuator Assy Walk In & Remote Fold – GEN1", "시트 폴딩·워크인 액추에이터"],
    ["mo", "BLDC 모터", "Power Seat BLDC Leg Support Extension Motor", "시트 레그서포트 위치 조절"],
    ["mo", "BLDC 모터", "Power Seat BLDC Leg Support Lift Motor", "시트 레그서포트 위치 조절"],
    ["mo", "BLDC 모터", "Power Seat BLDC Relaxation Motor", "시트 위치 조절 (릴렉스)"],
    ["mo", "BLDC 모터", "Power Seat BLDC Recliner Motor", "시트 등받이 위치 조절"],
    ["mo", "BLDC 모터", "Power Seat BLDC Tilt Motor", "시트 위치 조절 (틸트)"],
    ["mo", "BLDC 모터", "Power Seat BLDC Height Motor", "시트 상하 위치 조절"],
    ["mo", "BLDC 모터", "Power Seat BLDC Slide Motor", "시트 전후 위치 조절"],
    ["mo", "액추에이터", "HVAC Actuator", "공조 공기 유로 자동 조절"],
    ["mo", "액추에이터", "Lift-up Power Folding Actuator", "사이드미러 폴딩·리프트업 구동"],
    ["mo", "제너레이터", "Axial Flux Alternator (30kW, 100kW)", "코어리스 경량 교류 발전기"],
    ["mo", "컨트롤러", "DC / BLDC Motor Controller", "DC·BLDC 모터 제어기"]
  ];
  const PRODUCT_CATS = { pt: '파워트레인', ad: 'ADAS & Safety', ev: 'EV 모빌리티', mo: '모터 & 액추에이터' };

  // [2026-10-16] 제품 사진: 같은 js 폴더의 product-images.js 를 제품 카드가 처음 나올 때만 불러옴
  //  (파일이 없으면 사진 칸만 숨기고 글자는 그대로)
  let prodImgState = window.QCB_PRODUCT_IMAGES ? 'ready' : 'idle';
  function prodImgTag(name){
    return `<img class="qcb-pimg" data-pname="${escapeHtml(name)}" alt="">`;
  }
  function fillProdImages(){
    const map = window.QCB_PRODUCT_IMAGES || {};
    document.querySelectorAll('img.qcb-pimg:not([src])').forEach(img => {
      const src = map[img.dataset.pname];
      if (src) img.src = src;
      else if (prodImgState !== 'loading') img.classList.add('none');
    });
  }
  function ensureProdImages(){
    if (prodImgState === 'ready' || prodImgState === 'failed') { fillProdImages(); return; }
    if (prodImgState === 'loading') return;
    prodImgState = 'loading';
    const sc = document.createElement('script');
    sc.src = QCB_SCRIPT_DIR + 'product-images.js';
    sc.onload = () => { prodImgState = 'ready'; fillProdImages(); };
    sc.onerror = () => { prodImgState = 'failed'; fillProdImages(); };
    document.head.appendChild(sc);
  }
  const PROD_STOP = new Set(['assy', 'cover', 'housing', 'series', 'motor', 'actuator', 'holder', 'bobbin', 'coil', 'main', 'body', 'unit', 'case', 'sensor', 'valve', 'control', 'system', 'power', 'seat', 'gen', 'type', 'and', 'the', 'for', 'rotor', 'inner', 'outer']);
  const PROD_INDEX = PRODUCT_DICT.map(([cat, type, name, desc]) => {
    const tokens = (name.match(/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/g) || [])
      .map(t => normKey(t)).filter(t => t.length >= 2 && !PROD_STOP.has(t));
    return { cat, type, name, desc, key: normKey(name), tokens };
  });
  function prodFind(q, limit){
    const k = normKey(q);
    if (k.length < 2) return [];
    const scored = [];
    PROD_INDEX.forEach(p => {
      let sc = 0;
      if (p.tokens.includes(k)) sc = 3;                                        // 약어 정확히 (예: PCSV, MEB5)
      else if (p.key.includes(k)) sc = 2;                                       // 제품명 일부
      else if (k.length >= 3 && p.tokens.some(t => t.length >= 3 && (k.includes(t) || t.indexOf(k) === 0))) sc = 1;  // 품명에 약어가 섞인 경우
      if (sc) scored.push([sc, p]);
    });
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, limit || 4).map(x => x[1]);
  }
  function prodCardHtml(list, title){
    if (!list.length) return '';
    return `<div class="${UI.statMore}">📘 ${title || '제품 정보'}</div><ul class="${UI.statList} qcb-prod">` + list.map(p =>
      `<li class="qcb-pi">${prodImgTag(p.name)}<div class="qcb-pi-tx"><b>${escapeHtml(p.name)}</b><span class="${UI.statSub} qcb-prod-desc">${escapeHtml(p.desc)} <em>· ${escapeHtml(p.type)}</em></span></div></li>`).join('') + `</ul>`;
  }

  const ACTIONS = {
    // ---- 📘 제품 사전: 분류별 목록 ----
    prodList(params){
      const cat = params.cat;
      const list = PROD_INDEX.filter(p => p.cat === cat);
      const cut = (t, n) => t.length > n ? t.slice(0, n) + '…' : t;
      let html = `<b>📘 ${PRODUCT_CATS[cat]} 제품 ${list.length}종</b>`;
      html += `<ul class="${UI.statList}">` + list.map(p =>
        `<li class="qcb-pi">${prodImgTag(p.name)}<div class="qcb-pi-tx">${escapeHtml(p.name)}<span class="${UI.statSub}">${escapeHtml(cut(p.desc, 46))} · ${escapeHtml(p.type)}</span></div></li>`).join('') + `</ul>`;
      html += `<div class="qcb-hint">사진을 누르면 크게 · 🔍 품번 조회에 약어(예: PCSV, MEB5)를 넣으면 측정·검사 이력과 함께 나옵니다. · 출처: 회사 홈페이지</div>`;
      return html;
    },

    // ---- 🔍 품번 조회 ----
    partLookup(params){
      // [2026-10-16] 시인성 개선: 1줄 = 품명 + 상태 표시 / 2줄 = 품번·업체·날짜(MM-DD) · 3건 넘으면 '더보기'
      const q = safeStr(params.q), k = normKey(q);
      const hit = r => normKey(r.partNo).includes(k) || normKey(r.item).includes(k);
      const mRows = pcAll.filter(hit).sort((a, b) => (b.completeDate || b.requestDate || b.dueDate || '').localeCompare(a.completeDate || a.requestDate || a.dueDate || ''));
      const iRows = qiAll.filter(hit).sort((a, b) => (b.receiveDate || b.completeDate || '').localeCompare(a.receiveDate || a.completeDate || ''));
      let html = `<b>🔍 ${escapeHtml(q)}</b>`;
      const pHits = prodFind(q, (mRows.length || iRows.length) ? 2 : 4);
      if (!mRows.length && !iRows.length){
        return html + prodCardHtml(pHits) + `<div class="${UI.emptyNote}">📭 ${pHits.length ? '이 이름으로 된 측정·검사 이력은 없습니다. 품번이나 품명 일부로도 찾아보세요.' : '일치하는 품번·품명이 없습니다. 일부만 입력해 보세요. (예: 품번 앞 4~5자리)'}</div>`;
      }
      const md = d => d ? String(d).slice(5) : '-';
      const mDone = mRows.filter(r => r.completeDate).length;
      const mOver = mRows.filter(r => !r.completeDate && r.dueDate && r.dueDate < today).length;
      const iNg = iRows.filter(r => NG_PATTERN.test(r.judgement)).length;
      const sum = [];
      sum.push(`정밀측정 <b>${mRows.length}</b>건${mOver ? ` · <b class="accent">지연 ${mOver}</b>` : ''}`);
      sum.push(`수입검사 <b>${iRows.length}</b>건${iNg ? ` · <b class="accent">NG ${iNg}</b>` : ''} <small>(최근 2개월)</small>`);
      html += `<div class="qcb-pl-sum">${sum.join('<i>|</i>')}</div>`;
      html += prodCardHtml(pHits);
      const tag = (cls, t) => `<span class="qcb-st ${cls}">${t}</span>`;
      const rowHtml = (name, st, sub) => `<li class="qcb-pl"><div class="qcb-pl-top"><span class="qcb-pl-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>${st}</div><span class="${UI.statSub}">${sub}</span></li>`;
      const listHtml = (rows, toLi) => {
        const SHOW = 3;
        let h = `<ul class="${UI.statList} qcb-pl-list">` + rows.slice(0, SHOW).map(toLi).join('') + `</ul>`;
        if (rows.length > SHOW) h += `<details class="qcb-pl-more"><summary>더보기 ${rows.length - SHOW}건</summary><ul class="${UI.statList} qcb-pl-list">` + rows.slice(SHOW, 20).map(toLi).join('') + `</ul>${rows.length > 20 ? `<div class="${UI.statMore}">최근 20건까지만 표시</div>` : ''}</details>`;
        return h;
      };
      if (mRows.length){
        html += `<div class="${UI.statMore} qcb-pl-h">🔧 정밀측정 <span>${mDone}건 완료 · ${mRows.length - mDone}건 진행</span></div>`;
        html += listHtml(mRows, r => {
          const over = !r.completeDate && r.dueDate && r.dueDate < today;
          const st = r.completeDate ? tag('ok', '완료') : (over ? tag('ng', '지연') : tag('wait', '진행'));
          const sub = [r.partNo, r.customer, `의뢰 ${md(r.requestDate)} → ${r.completeDate ? '완료 ' + md(r.completeDate) : '요청 ' + md(r.dueDate)}`, r.assignee].filter(Boolean).map(escapeHtml).join(' · ');
          return rowHtml(r.item || '(품명없음)', st, sub);
        });
      }
      if (iRows.length){
        html += `<div class="${UI.statMore} qcb-pl-h">📋 수입검사</div>`;
        html += listHtml(iRows, r => {
          const ng = NG_PATTERN.test(r.judgement);
          const st = ng ? tag('ng', escapeHtml(r.judgement) || 'NG') : (r.judgement ? tag('ok', escapeHtml(r.judgement)) : (r.completeDate ? tag('wait', '판정 없음') : tag('wait', '대기')));
          const sub = [r.partNo, r.vendor, `입고 ${md(r.receiveDate)}${r.completeDate ? ' → 검사 ' + md(r.completeDate) : ''}`, ng && r.remark ? r.remark : ''].filter(Boolean).map(escapeHtml).join(' · ');
          return rowHtml(r.item || '(품명없음)', st, sub);
        });
      }
      return html;
    },

    // ---- 📑 월간 요약 ----
    monthSummary(params){
      const { offset, partial } = params;
      const dept = params.dept === 'i' ? 'i' : 'm';
      const cur = summaryRange(offset, partial), prev = summaryRange(offset + 1, partial);
      const mc = measureMetrics(cur), mp = measureMetrics(prev);
      const ic = inspectMetrics(cur), ip = inspectMetrics(prev);
      const deptName = dept === 'm' ? '정밀측정' : '수입검사';
      const ttl = `${deptName} ${cur.label} ${partial ? `누계 (1~${Number(cur.end.slice(8))}일)` : '마감'}`;
      let prevTxt = partial ? `전월 같은 기간 (${prev.start.slice(5)}~${prev.end.slice(5)})` : `전월 (${prev.label})`;
      if (dept === 'i' && ip.unavailable) prevTxt += ' — 수입검사는 최근 2개월 상세만 보관해 비교 생략';
      else if (dept === 'i' && ip.fromSummary) prevTxt += ' — 전월은 접수대장 월별 요약 기준 (평균 소요일 비교 제외)';
      const lines = [], rows = [];
      function row(section, name, val, dt){ rows.push({ section, name, val, dt }); }
      const na = v => v === null ? '산출 불가' : v;
      let d;
      d = deltaTag(mc.done, mp.done, '건', null); row('m', '측정 완료', mc.done + '건', d);
      if (mc.qty !== null || mp.qty !== null){ d = deltaTag(mc.qty, mp.qty, '개', null); row('m', '측정 수량', mc.qty === null ? '데이터 없음' : mc.qty.toLocaleString() + '개', d); }
      d = deltaTag(mc.onTimeRate, mp.onTimeRate, '%p', true); row('m', '납기 준수율', mc.onTimeRate === null ? '산출 불가' : mc.onTimeRate + '%' + (mc.late ? ` (지연 완료 ${mc.late}건)` : ''), d);
      d = deltaTag(mc.avgProc, mp.avgProc, '일', false, 1); row('m', '평균 처리일', na(mc.avgProc === null ? null : mc.avgProc + '일'), d);
      d = deltaTag(ic.done, ip.done, '건', null); row('i', '검사 완료', ic.done + '건', d);
      d = deltaTag(ic.ngRate, ip.ngRate, '%p', false, 1); row('i', '불합격', ic.judged ? `${ic.ng}건 · ${ic.ngRate}%` : '판정 데이터 없음', d);
      d = deltaTag(ic.avgProc, ip.avgProc, '일', false, 1); row('i', '평균 검사소요일', na(ic.avgProc === null ? null : ic.avgProc + '일'), d);
      if (ic.vendors.length) row('i', '불합격 다발 협력사', ic.vendors.map(([v, c]) => `${v} ${c}건`).join(', '), { html: '', text: '' });
      if (partial){
        if (dept === 'm'){ const due = computeDueOverview(); row('n', '진행 중', `${due.inProgress}건 (지연 ${due.overdue}건)`, { html: '', text: '' }); }
        else { const ins = computeInspectProcessOverview(); row('n', '적체', `${ins.agingRows.length}건 (입고 후 ${INSPECT_AGING_THRESHOLD_DAYS}일 이상)`, { html: '', text: '' }); }
      }
      const secName = { m: '🔧 정밀측정', i: '📋 수입검사', n: '📌 현재 시점' };
      let html = `<b>📑 ${escapeHtml(ttl)}</b><div class="${UI.statMore}">비교: ${escapeHtml(prevTxt)} · 팀 단위</div>`;
      lines.push(`[${deptName} 월간 요약] ${cur.label} ${partial ? `누계 (1~${Number(cur.end.slice(8))}일)` : '마감'}`, `※ 괄호 안은 ${prevTxt} 대비`);
      [dept, 'n'].forEach(sec => {
        const rs = rows.filter(r => r.section === sec);
        if (!rs.length) return;
        html += `<div class="${UI.statMore}"><b>${secName[sec]}</b></div><ul class="${UI.statList} kv">`;
        html += rs.map(r => `<li>${escapeHtml(r.name)}<span class="${UI.statSub}"><b>${escapeHtml(String(r.val))}</b>${r.dt.html}</span></li>`).join('');
        html += `</ul>`;
        lines.push('', '■ ' + secName[sec].replace(/^\S+\s/, ''));
        rs.forEach(r => lines.push(`- ${r.name}: ${r.val}${r.dt.text}`));
      });
      html += `<div class="${UI.statMore}">▲▼ 초록 = 좋아짐 · 빨강 = 나빠짐 · 회색 = 증감만</div>`;
      html += `<textarea class="qcb-copytext" hidden>${escapeHtml(lines.join('\n'))}</textarea>`;
      return html;
    },

    // ---- 🏢 측정 의뢰 비중 ----
    requestShare(params){
      const key = params.key, keyName = key === 'dept' ? '의뢰부서' : '고객사';
      const start = monthInfo(2).start;
      const rows = pcAll.filter(r => { const d = r.requestDate || r.completeDate || r.dueDate; return d && d >= start && d <= today; });
      if (!rows.length) return `<b>🏢 ${keyName}별 측정 의뢰</b><div class="${UI.emptyNote}">📭 최근 3개월 의뢰 데이터가 없습니다.</div>`;
      const cnt = {};
      rows.forEach(r => { const v = safeStr(r[key]) || '미지정'; cnt[v] = (cnt[v] || 0) + 1; });
      const all = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
      const named = all.filter(([n]) => n !== '미지정');
      const top = named.slice(0, 8).map(([name, count]) => ({ name, count }));
      const etc = named.slice(8).reduce((a, [, c]) => a + c, 0);
      if (etc) top.push({ name: `기타 ${named.length - 8}곳`, count: etc, muted: true });
      const none = cnt['미지정'] || 0;
      if (none) top.push({ name: '미지정', count: none, muted: true });
      let html = `<b>🏢 ${keyName}별 측정 의뢰</b> (최근 3개월 · ${start.slice(0, 7)} ~ 오늘)`;
      html += `<ul class="${UI.statList} kv"><li>전체 의뢰<span class="${UI.statSub}">${rows.length}건 · ${keyName} ${named.length}곳</span></li>`;
      if (named.length) html += `<li>가장 많은 ${keyName}<span class="${UI.statSub}"><b>${escapeHtml(named[0][0])}</b> ${named[0][1]}건 (${Math.round(named[0][1] / rows.length * 100)}%)</span></li>`;
      html += `</ul>`;
      html += buildHBarChart(top, rows.length);
      if (none / rows.length > 0.3) html += `<div class="${UI.emptyNote}">⚠ ${keyName}가 비어 있는 건이 ${Math.round(none / rows.length * 100)}%입니다. QMS 엑셀의 ${keyName} 칸 입력 여부를 확인해주세요.</div>`;
      return html;
    },

    personStat(params){
      const { name, period } = params;
      let filtered = periodRows(period).filter(r => r.assignee === name);
      filtered = [...filtered].sort((a,b)=> (b.completeDate||'').localeCompare(a.completeDate||''));
      const count = filtered.length;

      // 측정 수량 합계 (수량 값이 숫자로 확인되는 건만 합산)
      let qtySum = 0, qtyCountedRows = 0;
      filtered.forEach(r => {
        const n = Number(r.qty);
        if (r.qty !== '' && !isNaN(n)) { qtySum += n; qtyCountedRows++; }
      });
      const hasAnyQty = filtered.some(r => r.qty !== '');

      // 평균 처리기간 (측정의뢰일 ~ 측정완료일, 둘 다 있는 건만)
      const procDaysList = filtered
        .map(r => daysBetween(r.requestDate, r.completeDate))
        .filter(v => v !== null && v >= 0);
      const avgProc = procDaysList.length
        ? Math.round((procDaysList.reduce((a,b)=>a+b,0) / procDaysList.length) * 10) / 10
        : null;

      // 완료율: 해당 기간에 완료요청일(마감)이 잡혀있던 건 대비 완료 처리된 비율
      const assignedDue = pcAll.filter(r => r.assignee === name && r.dueDate && r.dueDate >= period.start && r.dueDate <= period.end);
      const completedAmongAssigned = assignedDue.filter(r => r.completeDate).length;
      const completionRate = assignedDue.length ? Math.round((completedAmongAssigned / assignedDue.length) * 100) : null;

      // [2026-10-16] 전원 막대 비교(순위처럼 보임) 대신 팀 평균 한 칸만
      const teamAvg = PEOPLE.length ? Math.round(PEOPLE.reduce((a, p) => a + countFor(p, period), 0) / PEOPLE.length * 10) / 10 : null;
      const chartHtml = '';

      let html = `<b>📊 ${escapeHtml(period.label)} 측정 실적</b><div class="${UI.statMore}">담당 ${escapeHtml(name)}</div>`;
      html += `<ul class="${UI.statList} kv">`;
      html += `<li>측정 완료 건수<span class="${UI.statSub}">${count}건</span></li>`;
      html += `<li>측정 수량<span class="${UI.statSub}">${hasAnyQty ? qtySum + '개 (수량 확인된 ' + qtyCountedRows + '건 기준)' : '데이터 없음'}</span></li>`;
      html += `<li>평균 처리기간<span class="${UI.statSub}">${avgProc === null ? '산출 불가' : avgProc + '일'}</span></li>`;
      html += `<li>완료율<span class="${UI.statSub}">${completionRate === null ? '해당 기간 마감 건 없음' : completionRate + '%'}</span></li>`;
      if (teamAvg !== null) html += `<li class="full">참고 · 팀 평균 (${PEOPLE.length}명)<span class="${UI.statSub}">${teamAvg}건</span></li>`;
      html += `</ul>`;
      html += chartHtml;

      if (count > 0){
        const shown = filtered.slice(0, 8);
        html += `<ul class="${UI.statList}">` + shown.map(r => `
          <li>${escapeHtml(r.item) || '(품명없음)'}
            <span class="${UI.statSub}">${escapeHtml(r.customer) || '-'} · 완료일 ${r.completeDate}</span>
          </li>`).join('') + `</ul>`;
        if (count > shown.length){
          html += `<div class="${UI.statMore}">외 ${count - shown.length}건 더 있습니다.</div>`;
        }
      } else {
        html += `아직 완료 처리된 항목이 없습니다.`;
        if (pcAll.length > 0 && !pcAll.some(r => r.assignee === name)) {
          html += `<div class="${UI.emptyNote}">⚠ 저장된 데이터 안에 담당자명 <b>"${escapeHtml(name)}"</b>과(와) 정확히 일치하는 항목이 없습니다. 엑셀의 담당자 이름 표기(띄어쓰기 등)를 확인해주세요.</div>`;
        }
      }
      return html;
    },

    // 담당자 최대 3명의 최근 3개월 완료 추이를 하나의 그래프로 비교.
    // ⚠ 순위 기능이 아니므로 건수 기준 정렬/1·2·3위 표시는 하지 않고,
    //   선택한 순서 그대로 보여준다.
    trendPersonMulti(params){
      const { names } = params;
      const monthInfos = [2,1,0].map(offset => monthInfo(offset));
      const monthLabels = monthInfos.map(info => info.label.replace(/^\d{4}년\s*/, ''));

      const series = names.map(name => ({
        name,
        points: monthInfos.map(info => ({ label: info.label.replace(/^\d{4}년\s*/, ''), count: countFor(name, info) }))
      }));

      const anyData = series.some(s => s.points.some(p => p.count > 0));
      let html = `<b>📈 최근 3개월 측정 완료 추이</b><div class="${UI.statMore}">담당 ${names.map(n => escapeHtml(n)).join(' · ')}</div>`;

      if (!anyData){
        html += `<div class="${UI.emptyNote}">📭 최근 3개월간 조회 데이터가 없습니다.</div>`;
        return html;
      }

      html += buildMultiTrendChart(series);

      html += `<table class="qc-trend-table"><thead><tr><th>담당자</th>`;
      monthLabels.forEach(l => { html += `<th>${escapeHtml(l)}</th>`; });
      html += `<th>3개월 변화</th></tr></thead><tbody>`;
      series.forEach(s => {
        const first = s.points[0].count;
        const last = s.points[s.points.length - 1].count;
        let changeStr;
        if (first === 0){
          changeStr = last === 0 ? '-' : 'N/A';
        } else {
          const pct = ((last - first) / first) * 100;
          changeStr = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
        }
        html += `<tr><td>${escapeHtml(s.name)}</td>`;
        s.points.forEach(p => { html += `<td>${p.count}</td>`; });
        html += `<td>${changeStr}</td></tr>`;
      });
      html += `</tbody></table>`;

      return html;
    },

    // ---- [수입검사부] 인원별 실적 ----
    personStatInspect(params){
      const { name, period } = params;
      let filtered = periodRowsIn(qiAll, period).filter(r => r.assignee === name);
      filtered = [...filtered].sort((a,b)=> (b.completeDate||'').localeCompare(a.completeDate||''));
      const count = filtered.length;

      const procDaysList = filtered
        .map(r => daysBetween(r.receiveDate, r.completeDate))
        .filter(v => v !== null && v >= 0);
      const avgProc = procDaysList.length
        ? Math.round((procDaysList.reduce((a,b)=>a+b,0) / procDaysList.length) * 10) / 10
        : null;

      const ngCount = filtered.filter(r => NG_PATTERN.test(r.judgement)).length;
      const ngRate = count ? Math.round((ngCount / count) * 1000) / 10 : null;

      const teamAvg = PEOPLE_INSPECT.length ? Math.round(PEOPLE_INSPECT.reduce((a, p) => a + countForIn(qiAll, p, period), 0) / PEOPLE_INSPECT.length * 10) / 10 : null;
      const chartHtml = '';

      let html = `<b>📊 ${escapeHtml(period.label)} 검사 실적</b><div class="${UI.statMore}">담당 ${escapeHtml(name)}</div>`;
      html += `<ul class="${UI.statList} kv">`;
      html += `<li>검사 완료 건수<span class="${UI.statSub}">${count}건</span></li>`;
      html += `<li>평균 처리기간<span class="${UI.statSub}">${avgProc === null ? '산출 불가' : avgProc + '일'}</span></li>`;
      html += `<li>불량(NG) 비율<span class="${UI.statSub}">${ngRate === null ? '산출 불가' : ngRate + '% (' + ngCount + '건)'}</span></li>`;
      if (teamAvg !== null) html += `<li>참고 · 팀 평균 (${PEOPLE_INSPECT.length}명)<span class="${UI.statSub}">${teamAvg}건</span></li>`;
      html += `</ul>`;
      html += chartHtml;

      if (count > 0){
        const shown = filtered.slice(0, 8);
        html += `<ul class="${UI.statList}">` + shown.map(r => `
          <li>${escapeHtml(r.item) || '(품명없음)'}
            <span class="${UI.statSub}">${escapeHtml(r.vendor) || '-'} · 완료일 ${r.completeDate}${r.judgement ? ' · ' + escapeHtml(r.judgement) : ''}</span>
          </li>`).join('') + `</ul>`;
        if (count > shown.length){
          html += `<div class="${UI.statMore}">외 ${count - shown.length}건 더 있습니다.</div>`;
        }
      } else {
        html += `아직 완료 처리된 항목이 없습니다.`;
        if (qiAll.length > 0 && !qiAll.some(r => r.assignee === name)) {
          html += `<div class="${UI.emptyNote}">⚠ 저장된 데이터 안에 담당자명 <b>"${escapeHtml(name)}"</b>과(와) 정확히 일치하는 항목이 없습니다. 엑셀의 담당자 이름 표기(띄어쓰기 등)를 확인해주세요.</div>`;
        }
      }
      return html;
    },

    // ---- [수입검사부] 담당자 최대 3명 3개월 추이 ----
    trendPersonMultiInspect(params){
      const { names } = params;
      const monthInfos = [2,1,0].map(offset => monthInfo(offset));
      const monthLabels = monthInfos.map(info => info.label.replace(/^\d{4}년\s*/, ''));

      const series = names.map(name => ({
        name,
        points: monthInfos.map(info => ({ label: info.label.replace(/^\d{4}년\s*/, ''), count: countForInWithSummary(name, info) }))
      }));

      const anyData = series.some(s => s.points.some(p => p.count > 0));
      let html = `<b>📈 최근 3개월 검사 완료 추이</b><div class="${UI.statMore}">담당 ${names.map(n => escapeHtml(n)).join(' · ')}</div>`;

      if (!anyData){
        html += `<div class="${UI.emptyNote}">📭 최근 3개월간 조회 데이터가 없습니다.</div>`;
        return html;
      }

      html += buildMultiTrendChart(series);

      html += `<table class="qc-trend-table"><thead><tr><th>담당자</th>`;
      monthLabels.forEach(l => { html += `<th>${escapeHtml(l)}</th>`; });
      html += `<th>3개월 변화</th></tr></thead><tbody>`;
      series.forEach(s => {
        const first = s.points[0].count;
        const last = s.points[s.points.length - 1].count;
        let changeStr;
        if (first === 0){
          changeStr = last === 0 ? '-' : 'N/A';
        } else {
          const pct = ((last - first) / first) * 100;
          changeStr = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
        }
        html += `<tr><td>${escapeHtml(s.name)}</td>`;
        s.points.forEach(p => { html += `<td>${p.count}</td>`; });
        html += `<td>${changeStr}</td></tr>`;
      });
      html += `</tbody></table>`;

      return html;
    }
  };

  // ============================================================
  //  시나리오 트리 — 값이 함수면 호출 시점에 노드를 동적으로 생성합니다.
  //  (최근 3개월 / 최근 요일 / 납기 현황 등은 오늘 날짜 기준으로 매번
  //   달라지므로)
  //  ※ 새 시나리오를 추가하려면 start.options에 항목을 추가하고,
  //     아래에 해당 노드(들)를 정의하면 됩니다.
  // ============================================================
  function summaryNode(dept){
    const last = monthInfo(1), cur = monthInfo(0), d = now.getDate();
    const back = dept === 'm' ? 'summary_start' : 'i_summary_start';
    const name = dept === 'm' ? '🔧 정밀측정' : '📋 수입검사';
    return {
      bot: `<b>${name} 월간 요약</b> — 팀 단위 수치 · 전월 대비 ▲▼`,
      options: [
        { label: `📑 ${last.label.replace(/^\d{4}년\s*/, '')} 마감`, action: 'monthSummary', params: { dept, offset: 1, partial: false }, backNode: back, star: d <= 10 },
        { label: `📑 ${cur.label.replace(/^\d{4}년\s*/, '')} 누계 (1~${d}일)`, action: 'monthSummary', params: { dept, offset: 0, partial: true }, backNode: back, star: d > 10 },
        { label: '🏠 처음으로', next: dept === 'm' ? 'measure_start' : 'inspect_start', primary: true }
      ]
    };
  }

  const SCENARIO_TREE = {
    // ---- 최상위: 부서 선택 ----
    // [2026-10-10] 인사 + 오늘 수치 3칸 + 타일 메뉴
    start(){
      const doneToday = periodRowsIn(pcAll, dayInfo(0)).length + periodRowsIn(qiAll, dayInfo(0)).length;
      const overdue = computeDueOverview().overdue;                 // 미완료 + 완료요청일 지남 (정식 QMS 건)
      const aging = computeInspectProcessOverview().agingRows.length; // 입고 후 5일 이상 미검사
      const kpi = (label, n, next, alert) =>
        `<button type="button" class="qcb-kpi${alert ? ' alert' : ''}" data-next="${next}" data-label="${escapeHtml(label)}">`
        + `<small>${escapeHtml(label)}</small><strong>${n}<span>건</span></strong></button>`;
      let html = `<div class="qcb-greet">안녕하세요, <b>품질경영팀 업무 챗봇</b>입니다.<br>아래에서 확인할 항목을 선택하세요.</div>`;
      html += `<div class="qcb-kpis">`
        + kpi('오늘 완료', doneToday, 'today_overview', false)
        + kpi('납기 지연', overdue, 'due_status', overdue > 0)
        + kpi('검사 적체', aging, 'i_process_aging_list', aging > 0)
        + `</div>`;
      return {
        bot: html,
        options: [
          { label: '🏠 오늘 한눈에 보기', icon: '🏠', title: '오늘 한눈에 보기', desc: '오늘 · 이번 주 · 이번 달 완료', next: 'today_overview', wide: true },
          { label: '🔧 정밀측정부', icon: '🔧', title: '정밀측정부', desc: '실적 · 납기', next: 'measure_start', half: true, team: 'm' },
          { label: '📋 수입검사부', icon: '📋', title: '수입검사부', desc: '실적 · 불량', next: 'inspect_start', half: true, team: 'i' },
          { label: '🔍 품번 조회', icon: '🔍', title: '품번 조회', desc: '측정·검사 이력', next: 'part_search', half: true },
          { label: '📘 제품 사전', icon: '📘', title: '제품 사전', desc: '제품 66종', next: 'prod_dict', half: true }
        ]
      };
    },

    // ---- 📘 제품 사전 ----
    prod_dict: {
      bot: '<b>📘 제품 사전</b> — 어느 분류를 볼까요?<div class="qcb-hint">회사 홈페이지 제품소개 기준 66종</div>',
      options: [
        { label: '⚙️ 파워트레인', action: 'prodList', params: { cat: 'pt' }, backNode: 'prod_dict', half: true },
        { label: '🛡️ ADAS & Safety', action: 'prodList', params: { cat: 'ad' }, backNode: 'prod_dict', half: true },
        { label: '🔋 EV 모빌리티', action: 'prodList', params: { cat: 'ev' }, backNode: 'prod_dict', half: true },
        { label: '🌀 모터 & 액추에이터', action: 'prodList', params: { cat: 'mo' }, backNode: 'prod_dict', half: true },
        { label: '🔍 이름으로 찾기', next: 'part_search', wide: true },
        { label: '🏠 처음으로', next: 'start', primary: true }
      ]
    },

    // ---- 🔍 품번 조회 (입력칸 노드) ----
    part_search: {
      bot: '품번이나 품명 일부를 입력하세요. (2자 이상)<div class="qcb-hint">정밀측정 이력과 수입검사 결과를 함께 찾아봅니다. 제품명·약어(예: PCSV, MEB5)를 넣으면 제품 설명도 같이 나옵니다.</div>',
      search: true
    },

    // ---- 📑 월간 요약 (팀별 · 정밀측정 / 수입검사 따로) ----
    summary_start(){ return summaryNode('m'); },
    i_summary_start(){ return summaryNode('i'); },

    // ---- 🏢 측정 의뢰 비중 ----
    share_select: {
      bot: '<b>🏢 측정 의뢰 비중</b> — 어떤 기준으로 볼까요? (최근 3개월 의뢰 기준)',
      options: [
        { label: '🏢 의뢰부서별', action: 'requestShare', params: { key: 'dept' }, backNode: 'share_select', half: true },
        { label: '🚗 고객사별', action: 'requestShare', params: { key: 'customer' }, backNode: 'share_select', half: true },
        { label: '🏠 정밀측정부 처음', next: 'measure_start', primary: true, wide: true }
      ]
    },

    // ---- 오늘 한눈에 보기 (완료 건수만 - 경고/지연 표시 없음) ----
    today_overview(){
      const mToday = periodRowsIn(pcAll, dayInfo(0)).length;
      const iToday = periodRowsIn(qiAll, dayInfo(0)).length;
      const mWeek = periodRowsIn(pcAll, weekInfo(0)).length;
      const iWeek = periodRowsIn(qiAll, weekInfo(0)).length;
      const mMonth = periodRowsIn(pcAll, monthInfo(0)).length;
      const iMonth = periodRowsIn(qiAll, monthInfo(0)).length;

      let html = `<b>🏠 오늘 한눈에 보기</b> (${today} 기준)`;
      html += `<ul class="${UI.statList} kv">`;
      html += `<li>🔧 정밀측정부 오늘 완료<span class="${UI.statSub}">${mToday}건 · 이번 주 ${mWeek}건 · 이번 달 ${mMonth}건</span></li>`;
      html += `<li>📋 수입검사부 오늘 완료<span class="${UI.statSub}">${iToday}건 · 이번 주 ${iWeek}건 · 이번 달 ${iMonth}건</span></li>`;
      html += `</ul>`;

      return {
        bot: html,
        options: [
          { label: '🔧 정밀측정부 자세히', next: 'measure_start', half: true },
          { label: '📋 수입검사부 자세히', next: 'inspect_start', half: true },
          { label: '🏠 처음으로', next: 'start', primary: true, wide: true }
        ]
      };
    },

    // ============================================================
    //  정밀측정부
    // ============================================================
    measure_start: {
      bot: '<b>🔧 정밀측정부</b> — 무엇을 볼까요?',
      options: [
        { label: '📊 인원별 실적 조회', next: 'stat_period' },
        { label: '📈 담당자 3개월 추이', next: 'trend_person' },
        { label: '⏱️ 납기 현황', next: 'due_status' },
        { label: '📑 월간 요약', next: 'summary_start' },
        { label: '🏢 측정 의뢰 비중', next: 'share_select' },
        { label: '🏠 처음으로', next: 'start', primary: true }
      ]
    },

    // ---- 인원별 실적 조회 ----
    stat_period: {
      bot: '어떤 기준으로 확인하시겠어요?',
      options: [
        { label: '📅 월별', next: 'stat_month_select' },
        { label: '🗓 주별', next: 'stat_week_select' },
        { label: '☀️ 일별', next: 'stat_day_select' }
      ]
    },
    stat_month_select(){
      return {
        bot: '몇 월 실적을 확인하시겠어요? (최근 3개월)',
        options: [0,1,2].map(off => {
          const info = monthInfo(off);
          return { label: (info.star ? '⭐ ' : '') + info.label, setPeriod: info, next: 'stat_person_select', star: info.star };
        })
      };
    },
    stat_week_select(){
      return {
        bot: '어느 주 실적을 확인하시겠어요?',
        options: [0,1,2].map(off => {
          const info = weekInfo(off);
          return { label: (info.star ? '⭐ ' : '') + info.label, setPeriod: info, next: 'stat_person_select', star: info.star };
        })
      };
    },
    stat_day_select(){
      return {
        bot: '어느 날짜 실적을 확인하시겠어요? (최근 7일)',
        options: [0,1,2,3,4,5,6].map(off => {
          const info = dayInfo(off);
          return { label: (info.star ? '⭐ ' : '') + info.label, setPeriod: info, next: 'stat_person_select', star: info.star };
        })
      };
    },
    stat_person_select(){
      const p = currentPeriod;
      return {
        bot: `<b>${escapeHtml(p.label)}</b> 기준, 확인할 담당자를 선택해주세요.`,
        options: PEOPLE.length ? PEOPLE.map(name => ({ label: name, chip: true, action: 'personStat', params: { name, period: p }, backNode: 'stat_person_select' }))
                               : [{ label: '📭 데이터에 담당자 없음 · 처음으로', next: 'measure_start', primary: true }]
      };
    },

    // ---- 담당자 3개월 추이 (최대 3명 동시 비교) ----
    trend_person: {
      bot: '담당자를 선택하세요. (최대 3명)',
      multiSelect: true,
      max: 3,
      selectOptions: PEOPLE.map(name => ({ label: name, value: name })),
      action: 'trendPersonMulti',
      backNode: 'trend_person'
    },

    // ---- 납기 현황 ----
    due_status(){
      return {
        bot: buildDueOverviewHtml(),
        options: [
          { label: '🔴 지연 업무 상세보기', next: 'due_delay_list' },
          { label: '🏠 처음으로', next: 'measure_start', primary: true }
        ]
      };
    },
    due_delay_list(){
      return {
        bot: buildDelayListHtml(),
        options: [
          { label: '⏱️ 납기 현황으로', next: 'due_status' },
          { label: '🏠 처음으로', next: 'measure_start', primary: true }
        ]
      };
    },

    // ============================================================
    //  수입검사부
    // ============================================================
    inspect_start: {
      bot: '<b>📋 수입검사부</b> — 무엇을 볼까요?',
      options: [
        { label: '📊 인원별 실적 조회', next: 'i_stat_period' },
        { label: '📈 담당자 3개월 추이', next: 'i_trend_person' },
        { label: '⏱️ 처리 현황', next: 'i_process_status' },
        { label: '🔴 불량/품질 현황', next: 'i_quality_status' },
        { label: '📑 월간 요약', next: 'i_summary_start' },
        { label: '🏠 처음으로', next: 'start', primary: true }
      ]
    },

    // ---- 인원별 실적 조회 ----
    i_stat_period: {
      bot: '어떤 기준으로 확인하시겠어요?',
      options: [
        { label: '📅 월별', next: 'i_stat_month_select' },
        { label: '🗓 주별', next: 'i_stat_week_select' },
        { label: '☀️ 일별', next: 'i_stat_day_select' }
      ]
    },
    i_stat_month_select(){
      return {
        bot: '몇 월 실적을 확인하시겠어요? (수입검사는 최근 2개월)',
        options: [0,1].map(off => {
          const info = monthInfo(off);
          return { label: (info.star ? '⭐ ' : '') + info.label, setPeriod: info, next: 'i_stat_person_select', star: info.star };
        })
      };
    },
    i_stat_week_select(){
      return {
        bot: '어느 주 실적을 확인하시겠어요?',
        options: [0,1,2].map(off => {
          const info = weekInfo(off);
          return { label: (info.star ? '⭐ ' : '') + info.label, setPeriod: info, next: 'i_stat_person_select', star: info.star };
        })
      };
    },
    i_stat_day_select(){
      return {
        bot: '어느 날짜 실적을 확인하시겠어요? (최근 7일)',
        options: [0,1,2,3,4,5,6].map(off => {
          const info = dayInfo(off);
          return { label: (info.star ? '⭐ ' : '') + info.label, setPeriod: info, next: 'i_stat_person_select', star: info.star };
        })
      };
    },
    i_stat_person_select(){
      const p = currentPeriod;
      return {
        bot: `<b>${escapeHtml(p.label)}</b> 기준, 확인할 담당자를 선택해주세요.`,
        options: PEOPLE_INSPECT.length ? PEOPLE_INSPECT.map(name => ({ label: name, chip: true, action: 'personStatInspect', params: { name, period: p }, backNode: 'i_stat_person_select' }))
                                       : [{ label: '📭 데이터에 담당자 없음 · 처음으로', next: 'inspect_start', primary: true }]
      };
    },

    // ---- 담당자 3개월 추이 (최대 3명 동시 비교) ----
    i_trend_person: {
      bot: '담당자를 선택하세요. (최대 3명)',
      multiSelect: true,
      max: 3,
      selectOptions: PEOPLE_INSPECT.map(name => ({ label: name, value: name })),
      action: 'trendPersonMultiInspect',
      backNode: 'i_trend_person'
    },

    // ---- 처리 현황 ----
    i_process_status(){
      return {
        bot: buildInspectProcessHtml(),
        options: [
          { label: '🔴 적체 건 상세보기', next: 'i_process_aging_list' },
          { label: '🏠 처음으로', next: 'inspect_start', primary: true }
        ]
      };
    },
    i_process_aging_list(){
      return {
        bot: buildInspectAgingListHtml(),
        options: [
          { label: '⏱️ 처리 현황으로', next: 'i_process_status' },
          { label: '🏠 처음으로', next: 'inspect_start', primary: true }
        ]
      };
    },

    // ---- 불량/품질 현황 ----
    i_quality_status(){
      return {
        bot: buildQualityStatusHtml(),
        options: [
          { label: '🏠 처음으로', next: 'inspect_start', primary: true }
        ]
      };
    }
  };

  let currentPeriod = null; // stat_person_select 등에서 참조하는 선택된 기간

  function homeNodeFor(backNode){
    // "i_"로 시작하는 노드(수입검사부 시나리오)에서 왔으면 수입검사부 홈으로,
    // 그 외(정밀측정부 시나리오)는 정밀측정부 홈으로 돌아갑니다.
    if (backNode === 'summary_start' || backNode === 'share_select') return 'measure_start';
    if (backNode === 'i_summary_start') return 'inspect_start';
    if (typeof backNode === 'string' && backNode.indexOf('prod_') === 0) return 'start';
    return (typeof backNode === 'string' && backNode.indexOf('i_') === 0) ? 'inspect_start' : 'measure_start';
  }

  function defaultResultOptions(backNode){
    return [
      { label: '🔁 다시 보기', next: backNode, pair: true },
      { label: '🏠 처음으로', next: homeNodeFor(backNode), primary: true, pair: true }
    ];
  }

  // ============================================================
  //  챗봇 엔진 (화면 공통)
  // ============================================================
  function getChatBody(){ return document.getElementById(UI.bodyElId); }
  function getOptionsWrap(){ return document.getElementById(UI.optionsElId); }

  function scrollToBottom(){
    const chatBody = getChatBody();
    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
  }

  function appendBubble(sender, html){
    const chatBody = getChatBody();
    const row = document.createElement('div');
    row.className = UI.msgRow + ' ' + sender;
    const bubble = document.createElement('div');
    bubble.className = UI.bubble + ' ' + sender;
    bubble.innerHTML = html;
    // [2026-09-30] 목록·수치·그래프가 있는 답변은 폭 100% 카드로
    if (sender === 'bot' && /<ul|<table|<svg|qcb-copytext/.test(html)){
      row.classList.add('qcb-wide');
      bubble.classList.add('qcb-card', 'team-' + qcbTeam);
      bubble.querySelectorAll('ul.kv > li').forEach(li => {
        const sub = li.querySelector('.' + UI.statSub);
        if (sub && sub.textContent.trim().length > 22) li.classList.add('full');
      });
    }
    // [2026-10-10] 시작 인사 말풍선에만 봇 아이콘 (레드)
    if (sender === 'bot' && html.indexOf('qcb-greet') >= 0){
      row.classList.add('qcb-has-avatar');
      const av = document.createElement('div');
      av.className = 'qcb-avatar';
      av.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>';
      row.appendChild(av);
    }
    row.appendChild(bubble);
    chatBody.appendChild(row);
    if (html.indexOf('qcb-pimg') >= 0) ensureProdImages();
    scrollToBottom();
  }

  function appendTyping(){
    const chatBody = getChatBody();
    const row = document.createElement('div');
    row.className = UI.msgRow + ' bot';
    row.id = 'qcChatTypingRow';
    row.innerHTML = `<div class="${UI.bubble} bot"><div class="${UI.typingDots}"><span></span><span></span><span></span></div></div>`;
    chatBody.appendChild(row);
    scrollToBottom();
  }
  function removeTyping(){
    const el = document.getElementById('qcChatTypingRow');
    if (el) el.remove();
  }

  function renderOptions(options){
    const optionsWrap = getOptionsWrap();
    optionsWrap.innerHTML = '';
    (options || []).forEach(opt => {
      const btn = document.createElement('button');
      btn.className = UI.optBtn
        + (opt.primary ? ' primary' : '')
        + (opt.star ? ' star' : '')
        + (opt.wide ? ' opt-wide' : '')
        + (opt.half ? ' opt-half' : '')
        + (opt.pair ? ' opt-pair' : '')
        + (opt.chip ? ' opt-chip' : '');
      if (opt.desc){
        // [2026-10-10] 시작 메뉴 타일: 아이콘 + 제목 + 한 줄 설명
        btn.classList.add('qcb-tile');
        if (opt.team) btn.classList.add('team-' + opt.team);
        btn.innerHTML = `<span class="qcb-tile-ic">${opt.icon || ''}</span><span class="qcb-tile-tx"><b>${escapeHtml(opt.title || opt.label)}</b><small>${escapeHtml(opt.desc)}</small></span>`;
      } else {
        btn.innerHTML = opt.label;
      }
      btn.addEventListener('click', () => selectOption(opt));
      optionsWrap.appendChild(btn);
    });
    // 2열 배치에서 보조 버튼 수가 홀수면 마지막 버튼을 가로 전체로 (한쪽만 비는 것 방지)
    const normal = [...optionsWrap.querySelectorAll('button:not(.primary):not(.opt-wide):not(.opt-pair):not(.opt-chip)')];
    // 담당자 칩이 있으면 4열 배치
    optionsWrap.classList.toggle('qcb-chips', !!optionsWrap.querySelector('.opt-chip'));
    if (normal.length % 2 === 1) normal[normal.length - 1].classList.add('opt-wide');
    appendFoot(optionsWrap);
  }

  // [2026-10-10] 버튼 영역 맨 아래 '데이터 기준시각' 한 줄
  function appendFoot(wrap){
    if (!wrap) return;
    const old = wrap.querySelector('.qcb-foot');
    if (old) old.remove();
    const f = document.createElement('div');
    f.className = 'qcb-foot' + (SYNC_OK ? '' : ' warn');
    const parts = [];
    if (SYNC_M) parts.push('정밀 ' + SYNC_M);
    if (SYNC_I) parts.push('수입 ' + SYNC_I);
    f.innerHTML = '<span class="qcb-dot"></span>' + (SYNC_OK
      ? `데이터 기준 ${parts.length ? parts.join(' · ') : '동기화 시각 없음'} · 수치는 QMS 원본 기준`
      : '서버 연결 실패 · 이 기기에 저장된 마지막 데이터 표시 중');
    wrap.appendChild(f);
  }

  // [2026-09-30] 결과 말풍선에 📋 복사 버튼 (목록·표가 있는 말풍선만)
  function withCopy(html){
    if (!/<ul|<table|qcb-copytext/.test(html)) return html;
    return html + `<div class="qcb-copy-row"><button type="button" class="qcb-copy">📋 복사</button></div>`;
  }
  function copyPlain(text){
    if (navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text){
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove(); return ok;
  }
  function bubbleText(bubble){
    const pre = bubble.querySelector('.qcb-copytext');
    if (pre) return pre.value;
    bubble.classList.add('qcb-copying');
    const t = bubble.innerText.replace(/\n{3,}/g, '\n\n').trim();
    bubble.classList.remove('qcb-copying');
    return t;
  }
  let qcbStylesDone = false;
  function injectQcbStyles(){
    if (qcbStylesDone) return; qcbStylesDone = true;
    const st = document.createElement('style');
    const B = '#' + UI.bodyElId, O = '#' + UI.optionsElId, SL = '.' + UI.statList, SS = '.' + UI.statSub, SM = '.' + UI.statMore;
    st.textContent = `
      /* ---- [2026-09-30] 챗봇 디자인 개편: 카드 · 2열 수치 · 한 줄 목록 · 2열 버튼 ---- */
      ${B} .qcb-wide{justify-content:stretch}
      ${B} .qcb-card{position:relative;max-width:100%!important;width:100%;background:#fff!important;color:#111;border:1px solid #e4e4e4;border-left:4px solid #111;border-radius:12px!important;padding:12px 14px 12px 13px!important;box-shadow:0 3px 10px -6px rgba(0,0,0,.18)}
      ${B} .qcb-card.team-m{border-left-color:#6b4fd6}
      ${B} .qcb-card.team-i{border-left-color:#0091a8}
      ${B} .qcb-card > b:first-child{display:block;padding-right:62px;font-size:1.02em;line-height:1.4}
      ${B} .qcb-card ${SM}{margin-top:8px}
      ${B} .qcb-card ${SL}{gap:0!important;margin-top:8px}
      ${B} .qcb-card ${SL} > li{background:none!important;border:none!important;border-bottom:1px solid #efefef!important;border-radius:0!important;padding:6px 2px!important;font-size:.92em;line-height:1.35}
      ${B} .qcb-card ${SL} > li:last-child{border-bottom:none!important}
      ${B} .qcb-card ${SL} > li ${SS}{margin-top:1px}
      ${B} .qcb-card ${SL}.kv{display:grid!important;grid-template-columns:1fr 1fr;gap:6px!important}
      ${B} .qcb-card ${SL}.kv > li{background:#f6f6f7!important;border:none!important;border-radius:9px!important;padding:8px 10px!important;font-size:.82em;color:#666;font-weight:800}
      ${B} .qcb-card ${SL}.kv > li.full{grid-column:1/-1}
      ${B} .qcb-card ${SL}.kv > li ${SS}{display:block;margin-top:2px;font-size:1.3em;font-weight:900;color:#111;line-height:1.3}
      ${B} .qcb-card ${SL}.kv > li.full ${SS}{font-size:1.1em}
      ${B} .qcb-card.team-m ${SL}.kv > li{background:#f4f1fd!important}
      ${B} .qcb-card.team-i ${SL}.kv > li{background:#eef8fa!important}
      ${B} .qcb-card .${UI.rankList} li{background:none!important;border:none!important;border-bottom:1px solid #efefef!important;border-radius:0!important;padding:7px 2px!important}
      ${B} .qcb-card .${UI.chartBox}{border:none!important;background:#fafafa!important;border-radius:10px!important}
      ${B} .qcb-card .qc-trend-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:.9em}
      ${B} .qcb-card .qc-trend-table th,${B} .qcb-card .qc-trend-table td{padding:6px 4px;border-bottom:1px solid #eee;text-align:center}
      ${B} .qcb-card .qc-trend-table th{color:#777;font-weight:800}
      .qcb-copy-row{display:flex;justify-content:flex-end;margin-top:8px}
      ${B} .qcb-card .qcb-copy-row{position:absolute;top:9px;right:10px;margin:0}
      .qcb-copy{height:28px;padding:0 11px;border-radius:14px;border:1px solid #d6d6d6;background:#fff;color:#333;font-size:11.5px;font-weight:800;font-family:inherit;cursor:pointer;white-space:nowrap}
      .qcb-copy:active{background:#eee}
      .qcb-copying .qcb-copy-row,.qcb-copying .${UI.chartBox}{display:none!important}
      .qcb-hint{margin-top:4px;font-size:12px;color:#777;font-weight:600}
      ${B} .qcb-card ${SL}.qcb-prod > li{background:#faf7f0!important;border:1px solid #efe6d2!important;border-radius:9px!important;padding:8px 10px!important;margin-bottom:6px}
      ${B} .qcb-card ${SL}.qcb-prod > li b{font-size:1.02em}
      ${B} .qcb-prod .qcb-prod-desc{margin-top:3px!important;color:#444!important;line-height:1.45}
      ${B} .qcb-prod .qcb-prod-desc em{font-style:normal;color:#999}
      /* [2026-10-16] 제품 사진 */
      ${B} .qcb-pi{display:flex!important;align-items:center;gap:10px}
      ${B} .qcb-pi-tx{flex:1;min-width:0}
      .qcb-pimg{flex:none;width:46px;height:46px;object-fit:contain;background:#fff;border:1px solid #ececec;border-radius:8px;cursor:zoom-in;transition:width .15s,height .15s}
      .qcb-pimg:not([src]){background:#f4f4f4}
      .qcb-pimg.none{display:none}
      ${B} .qcb-pi.big{flex-direction:column;align-items:flex-start}
      ${B} .qcb-pi.big .qcb-pimg{width:100%;max-width:220px;height:auto;max-height:200px;cursor:zoom-out}
      /* [2026-10-16] 품번 조회 결과 */
      .qcb-pl-sum{margin-top:6px;font-size:.88em;color:#666;font-weight:700}
      .qcb-pl-sum b{color:#111;font-weight:900}
      .qcb-pl-sum b.accent{color:#e62e2d}
      .qcb-pl-sum i{font-style:normal;color:#ddd;margin:0 7px}
      .qcb-pl-sum small{color:#aaa;font-weight:600}
      ${B} .qcb-card .qcb-pl-h{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px!important;padding-bottom:2px;border-bottom:1.5px solid #111;color:#111!important;font-weight:900!important}
      ${B} .qcb-card .qcb-pl-h span{font-size:.92em;color:#888;font-weight:700}
      ${B} .qcb-card ${SL}.qcb-pl-list{margin-top:0!important}
      ${B} .qcb-card ${SL}.qcb-pl-list > li{padding:7px 2px!important}
      .qcb-pl-top{display:flex;align-items:center;gap:8px}
      .qcb-pl-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800;color:#111}
      .qcb-pl ${SS}{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .qcb-st{flex:none;font-size:10.5px;font-weight:800;padding:1px 7px;border-radius:4px;line-height:1.6}
      .qcb-st.ok{background:#e8f6ee;color:#167a46}
      .qcb-st.wait{background:#f1f1f1;color:#777}
      .qcb-st.ng{background:#fdeeee;color:#e62e2d}
      .qcb-pl-more summary{margin-top:6px;font-size:.86em;font-weight:800;color:#555;cursor:pointer;list-style:none}
      .qcb-pl-more summary::-webkit-details-marker{display:none}
      .qcb-pl-more summary::before{content:'▾ '}
      .qcb-pl-more[open] summary::before{content:'▴ '}
      /* 결과 아래 두 버튼 나란히 · 담당자 이름은 작은 칩 */
      ${O} > button.opt-pair{grid-column:auto!important;min-height:38px;font-size:12.5px!important}
      ${O}.qcb-chips{grid-template-columns:repeat(4,1fr)}
      ${O}.qcb-chips > button.primary,${O}.qcb-chips > .qcb-foot{grid-column:1/-1}
      ${O} > button.opt-chip{min-height:34px!important;padding:4px 6px!important;font-size:12.5px!important;border-radius:17px!important}
      /* 아래 버튼: 2열 같은 폭 · 처음으로는 끝에 작은 보조 버튼 */
      ${O}{display:grid!important;grid-template-columns:1fr 1fr;gap:7px!important;align-content:start}
      ${O} > button{width:100%;margin:0!important;min-height:40px;padding:6px 10px!important;text-align:center;line-height:1.25;word-break:keep-all}
      ${O} > button.opt-wide{grid-column:1/-1}
      ${O} > button.primary{grid-column:1/-1;min-height:34px;background:#fff!important;color:#333!important;border:1px solid #d4d4d4!important;font-size:.92em}
      ${O} > button.primary:hover{background:#f3f3f3!important}
      ${O} > .qcb-search,${O} > .qcb-recent,${O} > .qc-multiselect-wrap{grid-column:1/-1}
      .qcb-search{display:flex;gap:6px;width:100%}
      .qcb-search input{flex:1;min-width:0;height:42px;border:1.5px solid #cfcfcf;border-radius:21px;padding:0 16px;font-size:15px;font-weight:700;font-family:inherit;background:#fff;color:#111;outline:none}
      .qcb-search input:focus{border-color:#111}
      .qcb-search button{flex:none;width:auto!important;min-height:42px}
      .qcb-recent{display:flex;flex-wrap:wrap;gap:6px;align-items:center;width:100%}
      .qcb-recent small{font-size:11.5px;color:#888;font-weight:700;margin-right:2px}
      .qcb-recent .qcb-chip{height:30px;padding:0 12px;border-radius:15px;border:1px solid #d8d8d8;background:#f7f7f7;color:#333;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer}

      /* ---- [2026-10-10] 디자인 개편: DURING CI (흰 바탕 · 검정 · 레드) ---- */
      ${B} .${UI.bubble}.bot:not(.qcb-card){background:#fff!important;border:1px solid #e7e7e7}
      ${B} .qcb-has-avatar{gap:8px;align-items:flex-start}
      ${B} .qcb-has-avatar > .${UI.bubble}{max-width:calc(100% - 38px)!important}
      .qcb-avatar{flex:none;width:30px;height:30px;border-radius:9px;background:#e62e2d;display:flex;align-items:center;justify-content:center}
      .qcb-avatar svg{width:17px;height:17px}
      .qcb-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}
      .qcb-kpi{display:block;text-align:left;border:none;background:#f6f6f7;border-radius:10px;padding:9px 9px 8px;font-family:inherit;color:#111;cursor:pointer;transition:filter .12s}
      .qcb-kpi:hover{filter:brightness(.96)}
      .qcb-kpi small{display:block;font-size:10.5px;color:#777;font-weight:800;white-space:nowrap}
      .qcb-kpi strong{display:block;font-size:19px;font-weight:900;margin-top:2px;letter-spacing:-.3px}
      .qcb-kpi strong span{font-size:11px;font-weight:800;color:#888;margin-left:1px}
      .qcb-kpi.alert{background:#fdeeee}
      .qcb-kpi.alert strong{color:#e62e2d}
      ${O} > button.qcb-tile{display:flex!important;gap:9px;align-items:center;justify-content:center;text-align:center!important;background:#fff!important;border:1px solid #e3e3e3!important;border-radius:12px!important;padding:10px 11px!important;min-height:46px;color:#111;transition:border-color .12s,box-shadow .12s}
      ${O} > button.qcb-tile:hover{border-color:#111!important;box-shadow:0 4px 12px -8px rgba(0,0,0,.35)}
      .qcb-tile-ic{flex:none;width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;background:#f2f3f5}
      .qcb-tile-tx{min-width:0}
      .qcb-tile-tx b{display:block;font-size:13px;font-weight:900}
      .qcb-tile-tx small{display:block;font-size:10.8px;color:#888;font-weight:600;margin-top:1px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      ${O} > .qcb-foot{grid-column:1/-1}
      .qcb-foot{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:10.5px;color:#999;font-weight:700;line-height:1.4;width:100%}
      .qcb-foot .qcb-dot{width:6px;height:6px;border-radius:50%;background:#1a9e5c;flex:none}
      .qcb-foot.warn{color:#e62e2d}
      .qcb-foot.warn .qcb-dot{background:#e62e2d}
    `;
    document.head.appendChild(st);
  }
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('.qcb-copy') : null;
    if (!b) return;
    const bubble = b.closest('.' + UI.bubble) || b.parentNode.parentNode;
    copyPlain(bubbleText(bubble)).then(ok => {
      b.textContent = ok ? '✅ 복사됨' : '복사 실패';
      setTimeout(() => { b.textContent = '📋 복사'; }, 1600);
    });
  });

  // [2026-10-16] 제품 사진 누르면 크게 ↔ 작게
  document.addEventListener('click', e => {
    const im = e.target && e.target.closest ? e.target.closest('img.qcb-pimg') : null;
    if (!im || !im.getAttribute('src')) return;
    const li = im.closest('.qcb-pi');
    if (li) li.classList.toggle('big');
  });

  // [2026-10-10] 시작 화면 수치 칸을 누르면 해당 화면으로 이동
  document.addEventListener('click', e => {
    const k = e.target && e.target.closest ? e.target.closest('.qcb-kpi') : null;
    if (!k || !getChatBody() || !getChatBody().contains(k)) return;
    appendBubble('user', escapeHtml(k.dataset.label || ''));
    getOptionsWrap().innerHTML = '';
    goTo(k.dataset.next);
  });

  // 🔍 품번 조회 입력칸
  function renderSearch(){
    injectQcbStyles();
    const wrap = getOptionsWrap();
    wrap.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'qcb-search';
    const inp = document.createElement('input');
    inp.type = 'search'; inp.placeholder = '예: 품번 앞자리 또는 품명'; inp.autocomplete = 'off'; inp.enterKeyHint = 'search';
    const go = document.createElement('button');
    go.className = UI.optBtn + ' primary'; go.textContent = '조회';
    box.appendChild(inp); box.appendChild(go);
    wrap.appendChild(box);
    const recent = partRecent();
    if (recent.length){
      const rw = document.createElement('div');
      rw.className = 'qcb-recent';
      rw.innerHTML = '<small>최근</small>';
      recent.forEach(q => {
        const c = document.createElement('button');
        c.type = 'button'; c.className = 'qcb-chip'; c.textContent = q;
        c.addEventListener('click', () => runSearch(q));
        rw.appendChild(c);
      });
      wrap.appendChild(rw);
    }
    const home = document.createElement('button');
    home.className = UI.optBtn; home.textContent = '🏠 처음으로';
    home.addEventListener('click', () => { appendBubble('user', '🏠 처음으로'); wrap.innerHTML = ''; goTo('start'); });
    wrap.appendChild(home);
    appendFoot(wrap);
    function submit(){
      const q = inp.value.trim();
      if (q.replace(/\s/g, '').length < 2){ inp.focus(); inp.placeholder = '2자 이상 입력하세요'; return; }
      runSearch(q);
    }
    go.addEventListener('click', submit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing){ e.preventDefault(); submit(); } });
  }
  function runSearch(q){
    pushPartRecent(q);
    appendBubble('user', '🔍 ' + escapeHtml(q));
    getOptionsWrap().innerHTML = '';
    qcbTeam = 'n';
    botSay(ACTIONS.partLookup({ q }), [
      { label: '🔍 다른 품번 조회', next: 'part_search', pair: true },
      { label: '🏠 처음으로', next: 'start', primary: true, pair: true }
    ]);
  }

  function botSay(html, options){
    injectQcbStyles();
    html = withCopy(html);
    // 모든 화면에 '처음으로' 보장 (시작 화면 제외)
    if (options && options.length && !options.some(o => o.primary) && html.indexOf('qcb-greet') < 0){
      options = options.concat([{ label: '🏠 처음으로', next: 'start', primary: true }]);
    }
    appendTyping();
    setTimeout(() => {
      removeTyping();
      appendBubble('bot', html);
      renderOptions(options);
    }, 420);
  }

  function resolveNode(nodeId){
    const node = SCENARIO_TREE[nodeId];
    if (!node) return null;
    return (typeof node === 'function') ? node() : node;
  }

  // [2026-09-30] 답변 카드 왼쪽 색 띠: 정밀측정=보라, 수입검사=청록, 공통=검정
  let qcbTeam = 'n';
  function teamOf(id){
    if (typeof id !== 'string') return 'n';
    if (id.indexOf('i_') === 0 || id === 'inspect_start') return 'i';
    if (/^(measure_start|stat_|trend_person|due_|summary_start|share_select)/.test(id)) return 'm';
    return 'n';
  }
  function goTo(nodeId){
    qcbTeam = teamOf(nodeId);
    const node = resolveNode(nodeId);
    if (!node) return;
    getOptionsWrap().innerHTML = '';
    if (node.search){
      appendTyping();
      setTimeout(() => {
        removeTyping();
        appendBubble('bot', node.bot);
        renderSearch();
      }, 420);
    } else if (node.multiSelect){
      appendTyping();
      setTimeout(() => {
        removeTyping();
        appendBubble('bot', node.bot);
        renderMultiSelect(node);
      }, 420);
    } else {
      botSay(node.bot, node.options);
    }
  }

  function selectOption(opt){
    appendBubble('user', opt.label.replace(/^⭐\s*/, ''));
    getOptionsWrap().innerHTML = '';

    if (opt.setPeriod) {
      currentPeriod = opt.setPeriod;
    }

    if (opt.action){
      qcbTeam = (opt.params && opt.params.dept) ? (opt.params.dept === 'i' ? 'i' : 'm') : teamOf(opt.backNode);
      const resultHtml = ACTIONS[opt.action](opt.params);
      botSay(resultHtml, defaultResultOptions(opt.backNode));
    } else if (opt.next){
      goTo(opt.next);
    }
  }

  function restartChat(){
    currentPeriod = null;
    const chatBody = getChatBody();
    const optionsWrap = getOptionsWrap();
    if (!chatBody || !optionsWrap) return; // 아직 해당 화면에 챗봇 마크업이 없으면 무시
    chatBody.innerHTML = '';
    optionsWrap.innerHTML = '';
    goTo('start');
  }

  // 다른 스크립트(onclick="restartChat()" 등)에서 쓸 수 있도록 전역에 노출
  window.restartChat = restartChat;
})();
