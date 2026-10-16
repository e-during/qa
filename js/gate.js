/* 품질경영팀 PORTAL · 입장 코드 (형식상 잠금)
 * - 각 페이지 <head>에서 불러옴: <script src="js/gate.js"></script>
 * - 한 번 맞히면 이 기기(브라우저)에서는 다시 묻지 않음
 * - 코드는 해시값으로만 보관 (원래 숫자는 코드에 적지 않음)
 * - 공개 사이트라 진짜 보안은 아님: 중요한 데이터는 github-sync.js 암호화로 보호
 * - 코드 변경: 아래 GATE_HASH 값을 새 해시로 교체 (브라우저 콘솔에서 DuringGate.hash('새코드') 실행)
 */
(function () {
  var KEY = 'during_gate_v1';
  var GATE_HASH = '821b64b732c05';
  var LEN = 3;

  function hash(str) { // cyrb53 (가벼운 해시 · 외부 라이브러리 없음)
    var s = 'during-qa-gate:' + str, h1 = 0xdeadbeef ^ 0x51, h2 = 0x41c6ce57 ^ 0x51;
    for (var i = 0, ch; i < s.length; i++) {
      ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  window.DuringGate = { hash: hash };

  function read() { try { return localStorage.getItem(KEY); } catch (e) { try { return sessionStorage.getItem(KEY); } catch (x) { return null; } } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) { try { sessionStorage.setItem(KEY, v); } catch (x) {} } }

  if (read() === GATE_HASH) return;

  // 잠금 중에는 페이지 내용 숨김(깜빡임 방지)
  var root = document.documentElement;
  root.classList.add('during-gate-lock');
  var st = document.createElement('style');
  st.textContent =
    'html.during-gate-lock body>*:not(#duringGate){display:none!important}' +
    'html.during-gate-lock,html.during-gate-lock body{overflow:hidden!important;background:#060b1c!important}' +
    '#duringGate{position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;' +
      'padding:calc(env(safe-area-inset-top) + 20px) 24px calc(env(safe-area-inset-bottom) + 20px);' +
      'background:radial-gradient(120% 70% at 50% 0%,#15254f 0%,#0b1636 45%,#060b1c 100%);color:#fff;' +
      'font-family:"Pretendard",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none;transition:opacity .25s ease}' +
    '#duringGate.out{opacity:0}' +
    '#duringGate .g-logo{width:64px;height:64px;border-radius:18px;box-shadow:0 0 0 1px rgba(224,176,96,.45),0 12px 30px -10px rgba(0,0,0,.8)}' +
    '#duringGate .g-t1{margin-top:16px;font-size:18px;font-weight:900;letter-spacing:.2px}' +
    '#duringGate .g-t2{margin-top:4px;font-size:10.5px;font-weight:800;letter-spacing:2px;color:#e0b060}' +
    '#duringGate .g-msg{margin-top:26px;font-size:13px;font-weight:700;color:rgba(255,255,255,.6);height:18px}' +
    '#duringGate .g-msg.err{color:#fb7185}' +
    '#duringGate .g-dots{display:flex;gap:16px;margin-top:14px}' +
    '#duringGate .g-dots i{width:15px;height:15px;border-radius:50%;border:2px solid rgba(224,176,96,.6);transition:background .12s,transform .12s}' +
    '#duringGate .g-dots i.on{background:#e0b060;border-color:#e0b060;transform:scale(1.08)}' +
    '#duringGate .g-dots.shake{animation:dgShake .38s}' +
    '@keyframes dgShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}' +
    '#duringGate .g-pad{display:grid;grid-template-columns:repeat(3,72px);gap:14px 22px;margin-top:34px}' +
    '#duringGate .g-pad button{width:72px;height:72px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);' +
      'color:#fff;font-size:26px;font-weight:700;font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
    '#duringGate .g-pad button:active{background:rgba(224,176,96,.28);border-color:#e0b060}' +
    '#duringGate .g-pad button.g-ghost{background:none;border:none;font-size:15px;font-weight:800;color:rgba(255,255,255,.6)}' +
    '#duringGate .g-pad button.g-ghost:active{color:#e0b060}' +
    '#duringGate .g-foot{margin-top:28px;font-size:11px;font-weight:600;color:rgba(255,255,255,.3)}' +
    '@media (max-height:640px){#duringGate .g-pad{grid-template-columns:repeat(3,62px);gap:10px 20px;margin-top:22px}#duringGate .g-pad button{width:62px;height:62px;font-size:23px}#duringGate .g-msg{margin-top:16px}}';
  (document.head || root).appendChild(st);

  var code = '';
  var ov, dots, msg;

  function paint() {
    var d = dots.children;
    for (var i = 0; i < d.length; i++) d[i].className = i < code.length ? 'on' : '';
  }
  function press(n) {
    if (code.length >= LEN) return;
    code += n; paint();
    if (code.length === LEN) setTimeout(check, 120);
  }
  function back() { code = code.slice(0, -1); paint(); msg.className = 'g-msg'; msg.textContent = '입장 코드를 입력하세요'; }
  function check() {
    if (hash(code) === GATE_HASH) {
      save(GATE_HASH);
      ov.classList.add('out');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(function () {
        root.classList.remove('during-gate-lock');
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        try { window.dispatchEvent(new Event('resize')); } catch (e) {}
      }, 230);
    } else {
      msg.className = 'g-msg err'; msg.textContent = '코드가 맞지 않습니다';
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
      try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
      code = ''; setTimeout(paint, 260);
    }
  }
  function onKey(e) {
    if (!document.getElementById('duringGate')) return;
    if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Backspace') { back(); e.preventDefault(); e.stopPropagation(); }
  }

  function build() {
    if (document.getElementById('duringGate')) return;
    ov = document.createElement('div');
    ov.id = 'duringGate';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', '입장 코드 입력');
    var keys = '';
    for (var i = 1; i <= 9; i++) keys += '<button type="button" data-n="' + i + '">' + i + '</button>';
    keys += '<span></span><button type="button" data-n="0">0</button><button type="button" class="g-ghost" data-b="1" aria-label="지우기">지우기</button>';
    var dotHtml = '';
    for (var k = 0; k < LEN; k++) dotHtml += '<i></i>';
    ov.innerHTML =
      '<img class="g-logo" src="icons/icon-192.png" alt="" onerror="this.style.display=\'none\'">' +
      '<div class="g-t1">품질경영팀 PORTAL</div><div class="g-t2">DURING QUALITY</div>' +
      '<div class="g-msg">입장 코드를 입력하세요</div>' +
      '<div class="g-dots">' + dotHtml + '</div>' +
      '<div class="g-pad">' + keys + '</div>' +
      '<div class="g-foot">처음 한 번만 입력하면 이 기기에서는 다시 묻지 않습니다</div>';
    dots = ov.querySelector('.g-dots');
    msg = ov.querySelector('.g-msg');
    ov.querySelector('.g-pad').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.getAttribute('data-b')) back(); else press(b.getAttribute('data-n'));
    });
    document.body.appendChild(ov);
  }
  document.addEventListener('keydown', onKey, true);
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
