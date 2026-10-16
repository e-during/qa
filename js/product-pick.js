/* [2026-10-16] 제품 목록에서 고르기 — 모바일(qa) 공용 · 선택 기능
 * - 기본은 직접 입력. 이건 홈페이지 제품 66종을 사진 보고 빠르게 고르는 보조 수단
 * - 사진·목록은 같은 js 폴더의 product-images.js (챗봇과 같은 파일)를 처음 열 때만 불러옴
 *
 * 사용법
 *   ProductPick.open({ onPick: p => {...} })   p = { name, short, cat, catName, type, desc, img }
 *   ProductPick.loadImage(name)                → Promise<HTMLImageElement | null>
 *   ProductPick.short(name)                    → 괄호 속 영문 풀이를 뺀 짧은 이름 (예: PCSV KEV3)
 *   ProductPick.setTrigger(btn, name|null)     → '제품' 버튼에 고른 제품 사진 표시 / 해제
 */
(function () {
  'use strict';
  if (window.ProductPick) return;

  const DIR = (function () {
    const cs = document.currentScript, src = cs && cs.src ? cs.src : '';
    return src ? src.slice(0, src.lastIndexOf('/') + 1) : 'js/';
  })();
  const CATS = [['all', '전체'], ['pt', '파워트레인'], ['ad', 'ADAS'], ['ev', 'EV'], ['mo', '모터·액추에이터']];
  const CAT_NAME = { pt: '파워트레인', ad: 'ADAS & Safety', ev: 'EV 모빌리티', mo: '모터 & 액추에이터' };
  const RECENT_KEY = 'pp_recent_v1';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
  function loadJ(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function saveJ(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // 괄호 속이 '영문 풀이·구성 설명'(소문자 포함 · 두 단어 이상 · 12자 이상)일 때만 뺌 → 5kW, KV100 같은 구분값은 남김
  function short(name) {
    const s = String(name || '').replace(/\s*\(([^)]*)\)\s*/g, (m, inner) =>
      (/[a-z]/.test(inner) && /\s/.test(inner.trim()) && inner.length >= 12) ? ' ' : m).replace(/\s+/g, ' ').trim();
    return s || String(name || '');
  }

  // ── 데이터 불러오기 (한 번만) ──
  let loadState = 'idle', waiters = [];
  function ensure() {
    return new Promise(res => {
      if (window.QCB_PRODUCT_LIST && window.QCB_PRODUCT_IMAGES) { res(true); return; }
      waiters.push(res);
      if (loadState === 'loading') return;
      loadState = 'loading';
      const sc = document.createElement('script');
      sc.src = DIR + 'product-images.js';
      sc.onload = () => { loadState = 'ready'; waiters.splice(0).forEach(f => f(true)); };
      sc.onerror = () => { loadState = 'idle'; waiters.splice(0).forEach(f => f(false)); };
      document.head.appendChild(sc);
    });
  }
  function list() {
    return (window.QCB_PRODUCT_LIST || []).map(([cat, type, name, desc]) => ({
      cat, catName: CAT_NAME[cat] || '', type, name, desc, short: short(name),
      img: (window.QCB_PRODUCT_IMAGES || {})[name] || '', key: norm([name, type, desc].join(' '))
    }));
  }
  function imgOf(name) { return (window.QCB_PRODUCT_IMAGES || {})[name] || ''; }
  function loadImage(name) {
    if (!name) return Promise.resolve(null);
    return ensure().then(ok => new Promise(res => {
      const src = ok && imgOf(name);
      if (!src) { res(null); return; }
      const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
    }));
  }

  // ── 스타일 (pp- 접두사 · 남색 + 금색) ──
  const css = `
  .pp-row{display:flex;gap:8px;align-items:stretch}
  .pp-row>input{flex:1;min-width:0}
  .pp-trig{flex:none;width:58px;min-height:48px;border-radius:12px;border:1.5px dashed #B8C2D3;background:#F7F9FC;color:#0b1636;font:inherit;font-size:10.5px;font-weight:800;letter-spacing:-.2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;position:relative;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .pp-trig svg{width:18px;height:18px}
  .pp-trig:active{transform:scale(.96)}
  .pp-trig.on{border-style:solid;border-color:#0b1636;background:#fff}
  .pp-trig.on svg,.pp-trig.on .pp-trig-t{display:none}
  .pp-trig img{position:absolute;inset:4px;width:calc(100% - 8px);height:calc(100% - 8px);object-fit:contain;display:none}
  .pp-trig.on img{display:block}
  .pp-trig.on::after{content:'';position:absolute;right:3px;bottom:3px;width:9px;height:9px;border-radius:50%;background:#e0b060;box-shadow:0 0 0 2px #fff}
  .pp-link{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 11px;margin-left:auto;border-radius:14px;border:1px solid #CBD5E1;background:#fff;color:#0b1636;font:inherit;font-size:12px;font-weight:800;cursor:pointer;vertical-align:middle}
  .pp-link svg{width:14px;height:14px}
  .pp-link:active{background:#F1F5F9}

  .pp-ov{position:fixed;inset:0;z-index:10050;background:rgba(11,22,54,.42);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s ease}
  .pp-ov.show{opacity:1}
  .pp-sheet{width:100%;max-width:560px;height:86vh;height:86dvh;background:#fff;border-radius:22px 22px 0 0;display:flex;flex-direction:column;transform:translateY(24px);transition:transform .24s cubic-bezier(.2,.8,.2,1);box-shadow:0 -12px 40px rgba(11,22,54,.25);font-family:inherit;color:#0F172A}
  .pp-ov.show .pp-sheet{transform:none}
  .pp-grab{width:38px;height:4px;border-radius:2px;background:#D5DBE5;margin:8px auto 2px}
  .pp-head{display:flex;align-items:flex-start;gap:10px;padding:8px 18px 10px}
  .pp-head div{flex:1;min-width:0}
  .pp-head b{display:block;font-size:17px;font-weight:900;letter-spacing:-.4px;color:#0b1636}
  .pp-head small{display:block;margin-top:2px;font-size:12px;font-weight:600;color:#64748B}
  .pp-x{flex:none;width:34px;height:34px;border-radius:50%;border:none;background:#F1F5F9;color:#334155;font-size:15px;font-weight:800;cursor:pointer}
  .pp-search{margin:0 16px;display:flex;align-items:center;gap:8px;height:44px;padding:0 14px;border-radius:12px;background:#F1F4F8;border:1.5px solid transparent}
  .pp-search:focus-within{border-color:#0b1636;background:#fff}
  .pp-search svg{flex:none;width:17px;height:17px;color:#94A3B8}
  .pp-search input{flex:1;min-width:0;border:none;background:none;outline:none;font:inherit;font-size:15px;font-weight:700;color:#0F172A}
  .pp-search input::placeholder{color:#94A3B8;font-weight:600}
  .pp-tabs{display:flex;gap:6px;overflow-x:auto;padding:10px 16px 10px;scrollbar-width:none;border-bottom:1px solid #EEF1F5}
  .pp-tabs::-webkit-scrollbar{display:none}
  .pp-tab{flex:none;height:32px;padding:0 13px;border-radius:16px;border:1px solid #E2E8F0;background:#fff;color:#475569;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}
  .pp-tab i{font-style:normal;font-weight:700;color:#94A3B8;margin-left:3px;font-size:11px}
  .pp-tab.on{background:#0b1636;border-color:#0b1636;color:#e0b060}
  .pp-tab.on i{color:#B8A275}
  .pp-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 16px calc(16px + env(safe-area-inset-bottom,0px))}
  .pp-sec{font-size:11.5px;font-weight:800;color:#64748B;letter-spacing:.2px;margin:2px 2px 8px}
  .pp-recent{display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;margin-bottom:6px;border-bottom:1px dashed #E2E8F0;scrollbar-width:none}
  .pp-recent::-webkit-scrollbar{display:none}
  .pp-rc{flex:none;display:flex;align-items:center;gap:7px;height:44px;padding:0 12px 0 4px;border-radius:22px;border:1px solid #E2E8F0;background:#fff;font:inherit;font-size:12.5px;font-weight:800;color:#0F172A;cursor:pointer;max-width:200px}
  .pp-rc img{width:36px;height:36px;border-radius:50%;object-fit:contain;background:#F4F6FA}
  .pp-rc span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  @media(min-width:420px){.pp-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  .pp-card{display:flex;flex-direction:column;text-align:left;padding:0;border-radius:14px;border:1px solid #E6EAF0;background:#fff;overflow:hidden;font:inherit;color:inherit;cursor:pointer;transition:transform .1s ease,border-color .1s ease;-webkit-tap-highlight-color:transparent}
  .pp-card:active{transform:scale(.97);border-color:#0b1636}
  .pp-ph{display:block;position:relative;height:0;padding-top:75%;background:#F4F6FA}
  .pp-ph img{position:absolute;left:8px;top:8px;width:calc(100% - 16px);height:calc(100% - 16px);object-fit:contain;display:block;mix-blend-mode:multiply}
  .pp-tx{display:block;padding:8px 10px 10px}
  .pp-nm{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;font-weight:800;line-height:1.3;letter-spacing:-.2px;color:#0F172A;word-break:break-all}
  .pp-ds{display:block;margin-top:3px;font-size:11px;font-weight:600;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pp-empty{text-align:center;padding:40px 10px;color:#64748B;font-size:13.5px;font-weight:700;line-height:1.6}
  .pp-empty button{margin-top:12px;height:42px;padding:0 18px;border-radius:12px;border:none;background:#0b1636;color:#e0b060;font:inherit;font-weight:800;cursor:pointer}
  .pp-load{text-align:center;padding:50px 0;color:#94A3B8;font-size:13px;font-weight:700}
  .pp-foot{font-size:11.5px;color:#94A3B8;font-weight:600;text-align:center;margin-top:14px}
  `;
  const st = document.createElement('style');
  st.id = 'productPickStyle'; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  const ICON_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>';
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';

  // ── 시트 ──
  let ov = null, cur = { cat: 'all', q: '', onPick: null }, prevOverflow = '', openSeq = 0, isOpen = false;
  function build() {
    ov = document.createElement('div');
    ov.className = 'pp-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', '제품 목록에서 고르기');
    ov.innerHTML = `<div class="pp-sheet">
      <div class="pp-grab"></div>
      <div class="pp-head"><div><b>제품 목록에서 고르기</b><small>홈페이지 제품 66종 · 목록에 없으면 닫고 직접 입력</small></div><button type="button" class="pp-x" aria-label="닫기">✕</button></div>
      <label class="pp-search">${ICON_SEARCH}<input type="search" placeholder="이름으로 찾기 (예: KEV, CKP, 시트)" autocomplete="off"></label>
      <div class="pp-tabs"></div>
      <div class="pp-body"></div>
    </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.querySelector('.pp-x').addEventListener('click', close);
    const inp = ov.querySelector('.pp-search input');
    inp.addEventListener('input', () => { cur.q = inp.value; renderBody(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) close(); });
    ov.addEventListener('click', e => {
      const t = e.target.closest('[data-pp-cat]');
      if (t) { cur.cat = t.dataset.ppCat; renderTabs(); renderBody(); ov.querySelector('.pp-body').scrollTop = 0; return; }
      const c = e.target.closest('[data-pp-name]');
      if (c) pick(c.dataset.ppName);
      if (e.target.closest('[data-pp-close]')) close();
    });
    document.body.appendChild(ov);
  }
  function renderTabs() {
    const all = list();
    ov.querySelector('.pp-tabs').innerHTML = CATS.map(([k, t]) => {
      const n = k === 'all' ? all.length : all.filter(p => p.cat === k).length;
      return `<button type="button" class="pp-tab${cur.cat === k ? ' on' : ''}" data-pp-cat="${k}">${t}<i>${n}</i></button>`;
    }).join('');
  }
  function renderBody() {
    const body = ov.querySelector('.pp-body');
    const all = list();
    if (!all.length) { body.innerHTML = `<div class="pp-empty">제품 목록을 불러오지 못했습니다.<br>닫고 직접 입력해 주세요.<br><button type="button" data-pp-close>닫기</button></div>`; return; }
    const q = norm(cur.q);
    const shown = all.filter(p => (cur.cat === 'all' || p.cat === cur.cat) && (!q || p.key.includes(q)));
    let h = '';
    const rec = loadJ(RECENT_KEY, []).map(n => all.find(p => p.name === n)).filter(Boolean);
    if (rec.length && !q && cur.cat === 'all') {
      h += `<div class="pp-sec">최근 고른 제품</div><div class="pp-recent">` + rec.map(p =>
        `<button type="button" class="pp-rc" data-pp-name="${esc(p.name)}">${p.img ? `<img src="${p.img}" alt="">` : ''}<span>${esc(p.short)}</span></button>`).join('') + `</div>`;
    }
    if (!shown.length) {
      h += `<div class="pp-empty">“${esc(cur.q)}” 에 맞는 제품이 없습니다.<br>목록에 없는 제품은 닫고 직접 입력하세요.<br><button type="button" data-pp-close>직접 입력하기</button></div>`;
    } else {
      h += `<div class="pp-grid">` + shown.map(p => `<button type="button" class="pp-card" data-pp-name="${esc(p.name)}" title="${esc(p.name)}">
          <span class="pp-ph">${p.img ? `<img src="${p.img}" alt="" loading="lazy">` : ''}</span>
          <span class="pp-tx"><span class="pp-nm">${esc(p.short)}</span><span class="pp-ds">${esc(p.desc)}</span></span>
        </button>`).join('') + `</div><div class="pp-foot">사진 출처: 회사 홈페이지 제품소개</div>`;
    }
    body.innerHTML = h;
  }
  function pick(name) {
    const p = list().find(x => x.name === name);
    if (!p) return;
    saveJ(RECENT_KEY, [name, ...loadJ(RECENT_KEY, []).filter(n => n !== name)].slice(0, 6));
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    const fn = cur.onPick;
    close();
    if (typeof fn === 'function') fn({ name: p.name, short: p.short, cat: p.cat, catName: p.catName, type: p.type, desc: p.desc, img: p.img });
  }
  function open(opts) {
    opts = opts || {};
    if (!ov) build();
    cur = { cat: 'all', q: '', onPick: opts.onPick || null };
    ov.querySelector('.pp-search input').value = '';
    ov.querySelector('.pp-tabs').innerHTML = '';
    ov.querySelector('.pp-body').innerHTML = '<div class="pp-load">제품 목록을 불러오는 중…</div>';
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ov.style.display = 'flex';
    requestAnimationFrame(() => ov.classList.add('show'));
    isOpen = true;
    const seq = ++openSeq;
    ensure().then(() => { if (!isOpen || seq !== openSeq) return; renderTabs(); renderBody(); });
  }
  function close() {
    if (!ov) return;
    isOpen = false;
    ov.classList.remove('show');
    document.body.style.overflow = prevOverflow;
    setTimeout(() => { if (!isOpen) ov.style.display = 'none'; }, 220);
  }

  // '제품' 버튼: 고른 제품이 있으면 그 사진으로 바뀜
  function triggerHTML(onclick, extraAttr) {
    return `<button type="button" class="pp-trig" onclick="${onclick}" aria-label="제품 목록에서 고르기" ${extraAttr || ''}>${ICON_GRID}<span class="pp-trig-t">제품</span><img alt=""></button>`;
  }
  function setTrigger(btn, name) {
    if (!btn) return;
    if (!name) { btn.classList.remove('on'); btn.dataset.pname = ''; btn.dataset.short = ''; const im = btn.querySelector('img'); if (im) im.removeAttribute('src'); return; }
    btn.dataset.pname = name; btn.dataset.short = short(name);
    ensure().then(() => {
      if (btn.dataset.pname !== name) return;
      const src = imgOf(name), im = btn.querySelector('img');
      if (src && im) { im.src = src; btn.classList.add('on'); }
    });
  }

  window.ProductPick = { open, close, short, loadImage, setTrigger, triggerHTML, ensure, ICON_GRID };
})();
