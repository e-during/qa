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
 * ============================================================ */

(function () {
  'use strict';

  // ------------------------------------------------------------
  //  화면별 CSS 클래스 이름 (기본값 = chatbot.html 기준)
  //  dashboard.html처럼 클래스 이름이 다르면, core.js를 불러오기
  //  전에 window.QC_CHATBOT_UI = {...} 로 덮어써서 사용합니다.
  // ------------------------------------------------------------
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
  //  ★ 담당자(assignee) 필드는 "임동혁㈱(LIM DONGHYUK)" 처럼 이름
  //  뒤에 회사명(㈱)이나 영문 이름이 그대로 붙어서 저장되는 경우가
  //  있습니다. PEOPLE 배열의 순수 이름("임동혁")과 정확히 일치하지
  //  않으면 실적이 0건으로 보이므로, 문자열 맨 앞의 "한글 연속
  //  구간"만 추출해서 순수 이름만 남깁니다.
  //  예) "임동혁㈱(LIM DONGHYUK)" -> "임동혁"
  //      "이정훈(Lee Jeonghoon)"  -> "이정훈"
  //      "정충용"                -> "정충용" (그대로)
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

  // ============================================================
  //  시나리오에서 쓸 담당자 목록 (담당자 추가/변경 시 여기만 수정)
  //  ※ 실제 데이터에 담당자 이름이 다르게 들어와 있으면(오타 등)
  //     아래 배열도 함께 맞춰줘야 합니다.
  // ============================================================
  const PEOPLE = ['정충용', '임동혁', '이정훈']; // 정밀측정부
  // ⚠ 수입검사부 담당자 목록은 실제 데이터 샘플(임설희/김지영/박창희)을
  //   참고해 넣어둔 것입니다 - 실제 팀 구성원과 다르면 여기를 고쳐주세요.
  const PEOPLE_INSPECT = ['임설희', '김지영', '박창희', '김노을']; // 수입검사부

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
      const color = isSelected ? '#e62e2d' : '#d8d8d8';
      const textColor = isSelected ? '#e62e2d' : '#666';
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${color}"></rect>`;
      bars += `<text x="${(x+barW/2).toFixed(1)}" y="${(y-8).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800" fill="${isSelected?'#e62e2d':'#111'}">${c.count}</text>`;
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
      dots += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="#e62e2d"></circle>`;
      dots += `<text x="${c.x.toFixed(1)}" y="${(c.y-12).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="800" fill="#111">${c.count}</text>`;
      dots += `<text x="${c.x.toFixed(1)}" y="${(padTop+plotH+20).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#666">${escapeHtml(c.label)}</text>`;
    });
    const line = `<line x1="${padSide}" y1="${padTop+plotH}" x2="${w-padSide}" y2="${padTop+plotH}" stroke="#e5e5e5" stroke-width="1"></line>`;

    return `<div class="${UI.chartBox}"><svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${line}
      <path d="${linePath}" fill="none" stroke="#e62e2d" stroke-width="2.5"></path>
      ${dots}
    </svg></div>`;
  }

  // 담당자 여러 명(최대 3명)의 최근 3개월 추이를 하나의 그래프에 겹쳐
  // 그립니다. (요구사항: 담당자 순위 기능이 아니므로 정렬/순위 표시는
  // 하지 않고, 선택한 순서 그대로 색상만 구분해서 보여줍니다.)
  // series: [{name, points:[{label, count}]}] — points는 모두 같은
  // 라벨(oldest -> newest) 구성이어야 합니다.
  const TREND_COLORS = ['#e62e2d', '#1a73e8', '#1a9e5c'];

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
      .qc-multiselect-item:hover { border-color: #e62e2d; }
      .qc-multiselect-item.qc-checked { border-color: #e62e2d; background: #fff3f3; color: #e62e2d; }
      .qc-multiselect-item input[type=checkbox] { accent-color: #e62e2d; width: 15px; height: 15px; cursor: pointer; }
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
    html += `<ul class="${UI.statList}">`;
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

    let html = `<b>⏱️ 처리 현황</b> (전체 수입검사 데이터 기준)`;
    html += `<ul class="${UI.statList}">`;
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
    const vendorRanking = Object.entries(vendorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const recentDefects = [...recentNg].sort((a, b) => (b.completeDate || '').localeCompare(a.completeDate || '')).slice(0, 8);

    return { total, ngCount, ngRate, trend, vendorRanking, recentDefects };
  }

  function buildQualityStatusHtml(){
    const stats = computeQualityOverview();
    if (stats.total === 0){
      return `현재 판정 데이터가 있는 검사 완료 건이 없습니다.<div class="${UI.emptyNote}">📭 조회 데이터 없음</div>`;
    }

    let html = `<b>🔴 불량/품질 현황</b> (판정 완료 기준)`;
    html += `<ul class="${UI.statList}">`;
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
  const ACTIONS = {
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

      const allCounts = PEOPLE.map(p => ({ name: p, count: countFor(p, period) }));
      const chartHtml = buildBarChart(allCounts, name);

      let html = `<b>${escapeHtml(name)}</b>님의 <b>${escapeHtml(period.label)}</b> 실적입니다.`;
      html += `<ul class="${UI.statList}">`;
      html += `<li>측정 완료 건수<span class="${UI.statSub}">${count}건</span></li>`;
      html += `<li>측정 수량<span class="${UI.statSub}">${hasAnyQty ? qtySum + '개 (수량 확인된 ' + qtyCountedRows + '건 기준)' : '데이터 없음'}</span></li>`;
      html += `<li>평균 처리기간<span class="${UI.statSub}">${avgProc === null ? '산출 불가' : avgProc + '일'}</span></li>`;
      html += `<li>완료율<span class="${UI.statSub}">${completionRate === null ? '해당 기간 마감 건 없음' : completionRate + '%'}</span></li>`;
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
      let html = `<b>${names.map(n => escapeHtml(n)).join(' / ')}</b>님의 최근 3개월 완료 추이 비교입니다.`;

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

      const allCounts = PEOPLE_INSPECT.map(p => ({ name: p, count: countForIn(qiAll, p, period) }));
      const chartHtml = buildBarChart(allCounts, name);

      let html = `<b>${escapeHtml(name)}</b>님의 <b>${escapeHtml(period.label)}</b> 검사 실적입니다.`;
      html += `<ul class="${UI.statList}">`;
      html += `<li>검사 완료 건수<span class="${UI.statSub}">${count}건</span></li>`;
      html += `<li>평균 처리기간<span class="${UI.statSub}">${avgProc === null ? '산출 불가' : avgProc + '일'}</span></li>`;
      html += `<li>불량(NG) 비율<span class="${UI.statSub}">${ngRate === null ? '산출 불가' : ngRate + '% (' + ngCount + '건)'}</span></li>`;
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
        points: monthInfos.map(info => ({ label: info.label.replace(/^\d{4}년\s*/, ''), count: countForIn(qiAll, name, info) }))
      }));

      const anyData = series.some(s => s.points.some(p => p.count > 0));
      let html = `<b>${names.map(n => escapeHtml(n)).join(' / ')}</b>님의 최근 3개월 검사완료 추이 비교입니다.`;

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
  const SCENARIO_TREE = {
    // ---- 최상위: 부서 선택 ----
    start: {
      bot: '안녕하세요! 품질경영팀 업무 챗봇입니다. 무엇을 도와드릴까요?',
      options: [
        { label: '🏠 오늘 한눈에 보기', next: 'today_overview', wide: true },
        { label: '🔧 정밀측정부', next: 'measure_start', half: true },
        { label: '📋 수입검사부', next: 'inspect_start', half: true }
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
      html += `<ul class="${UI.statList}">`;
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
      bot: '안녕하세요! 정밀측정부 업무 챗봇입니다. 무엇을 도와드릴까요?',
      options: [
        { label: '📊 인원별 실적 조회', next: 'stat_period' },
        { label: '📈 담당자 3개월 추이', next: 'trend_person' },
        { label: '⏱️ 납기 현황', next: 'due_status' }
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
        options: PEOPLE.map(name => ({ label: name, action: 'personStat', params: { name, period: p }, backNode: 'stat_person_select' }))
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
      bot: '안녕하세요! 수입검사부 업무 챗봇입니다. 무엇을 도와드릴까요?',
      options: [
        { label: '📊 인원별 실적 조회', next: 'i_stat_period' },
        { label: '📈 담당자 3개월 추이', next: 'i_trend_person' },
        { label: '⏱️ 처리 현황', next: 'i_process_status' },
        { label: '🔴 불량/품질 현황', next: 'i_quality_status' }
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
        bot: '몇 월 실적을 확인하시겠어요? (최근 3개월)',
        options: [0,1,2].map(off => {
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
        options: PEOPLE_INSPECT.map(name => ({ label: name, action: 'personStatInspect', params: { name, period: p }, backNode: 'i_stat_person_select' }))
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
    return (typeof backNode === 'string' && backNode.indexOf('i_') === 0) ? 'inspect_start' : 'measure_start';
  }

  function defaultResultOptions(backNode){
    return [
      { label: '🔁 다시 보기', next: backNode },
      { label: '🏠 처음으로', next: homeNodeFor(backNode), primary: true }
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
    row.appendChild(bubble);
    chatBody.appendChild(row);
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
        + (opt.half ? ' opt-half' : '');
      btn.innerHTML = opt.label;
      btn.addEventListener('click', () => selectOption(opt));
      optionsWrap.appendChild(btn);
    });
  }

  function botSay(html, options){
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

  function goTo(nodeId){
    const node = resolveNode(nodeId);
    if (!node) return;
    getOptionsWrap().innerHTML = '';
    if (node.multiSelect){
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
