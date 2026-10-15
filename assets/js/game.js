/* =========================================================
   JACK'S ESCAPE ROOM · 交互引擎
   粒子星空 / 帘幕转场 / 打字机 / Web Audio 音效
   密码谜题 / 分支选择 / 仗义值状态 / 结局结算
   ========================================================= */
(function () {
  'use strict';

  var STORE = 'jack_escape_v1';
  var SOUND_KEY = 'jack_escape_sound';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var BASE = (document.body && document.body.dataset.base) || '';

  /* ---------------- 状态 ---------------- */
  function getState() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function setState(patch) {
    var s = getState();
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) s[k] = patch[k]; }
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {}
    return s;
  }
  function resetState() { try { localStorage.removeItem(STORE); } catch (e) {} }
  function markSolved(id) {
    var s = getState();
    var arr = s.solved || [];
    if (arr.indexOf(id) < 0) arr.push(id);
    s.solved = arr;
    setState(s);
  }
  function addBro(n) {
    var s = getState();
    s.bro = (s.bro || 0) + n;
    setState(s);
    return s.bro;
  }

  /* ---------------- 音效（Web Audio 合成，无外部文件） ---------------- */
  var SFX = (function () {
    var ctx = null, on = true;
    try { on = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) {}
    function ac() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
      }
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    function beep(freq, dur, type, vol, slide) {
      if (!on) return; var c = ac(); if (!c) return;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      if (slide) { o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + dur); }
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(vol || 0.05, c.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur + 0.02);
    }
    function note(f, t0, dur, type, vol) {
      if (!on) return; var c = ac(); if (!c) return;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'triangle'; o.frequency.value = f;
      var s = c.currentTime + t0;
      g.gain.value = 0; g.gain.linearRampToValueAtTime(vol || 0.06, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      o.connect(g); g.connect(c.destination); o.start(s); o.stop(s + dur + 0.02);
    }
    function noise(dur, vol) {
      if (!on) return; var c = ac(); if (!c) return;
      var n = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = c.createBufferSource(); src.buffer = buf;
      var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.9;
      var g = c.createGain(); g.gain.value = vol || 0.06;
      src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    }
    return {
      isOn: function () { return on; },
      set: function (v) { on = v; try { localStorage.setItem(SOUND_KEY, v ? 'on' : 'off'); } catch (e) {} },
      wake: function () { ac(); },
      click: function () { beep(540, 0.07, 'triangle', 0.05); },
      hover: function () { beep(920, 0.03, 'sine', 0.02); },
      type: function () { beep(1050 + Math.random() * 520, 0.014, 'square', 0.012); },
      err: function () { beep(150, 0.28, 'sawtooth', 0.06, 90); note(110, 0.02, 0.22, 'sawtooth', 0.05); },
      ok: function () { note(660, 0, 0.16, 'triangle', 0.07); note(990, 0.09, 0.2, 'triangle', 0.06); },
      unlock: function () { note(523, 0, 0.16, 'triangle', 0.06); note(659, 0.09, 0.16, 'triangle', 0.06); note(784, 0.18, 0.16, 'triangle', 0.06); note(1047, 0.27, 0.3, 'triangle', 0.07); },
      whoosh: function () { noise(0.5, 0.07); beep(220, 0.4, 'sine', 0.03, 660); },
      step: function () { beep(320, 0.05, 'sine', 0.03); }
    };
  })();

  /* ---------------- 背景粒子 ---------------- */
  function initStars() {
    var cv = $('#stars'); if (!cv) return;
    var c = cv.getContext('2d'), W, H, dots = [], DPR = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      W = cv.width = window.innerWidth * DPR; H = cv.height = window.innerHeight * DPR;
      cv.style.width = window.innerWidth + 'px'; cv.style.height = window.innerHeight + 'px';
      var n = Math.round((window.innerWidth * window.innerHeight) / 16000);
      n = Math.max(40, Math.min(n, 150));
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * W, y: Math.random() * H,
          r: (Math.random() * 1.5 + 0.3) * DPR,
          vy: (Math.random() * 0.25 + 0.04) * DPR,
          vx: (Math.random() - 0.5) * 0.14 * DPR,
          a: Math.random() * 0.6 + 0.2,
          tw: Math.random() * Math.PI * 2,
          hue: [190, 265, 320][Math.floor(Math.random() * 3)]
        });
      }
    }
    function frame() {
      c.clearRect(0, 0, W, H);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.y -= d.vy; d.x += d.vx; d.tw += 0.02;
        if (d.y < -6) { d.y = H + 6; d.x = Math.random() * W; }
        if (d.x < -6) d.x = W + 6; if (d.x > W + 6) d.x = -6;
        var al = d.a * (0.55 + 0.45 * Math.sin(d.tw));
        c.beginPath();
        c.fillStyle = 'hsla(' + d.hue + ',95%,72%,' + al + ')';
        c.arc(d.x, d.y, d.r, 0, Math.PI * 2); c.fill();
      }
      requestAnimationFrame(frame);
    }
    resize(); window.addEventListener('resize', resize); frame();
  }

  /* ---------------- 鼠标光晕 / 视差 ---------------- */
  function initCursor() {
    if (!window.matchMedia || !window.matchMedia('(pointer:fine)').matches) return;
    document.body.classList.add('pointer-fine');
    var g = $('.cursor-glow'); if (!g) return;
    var tx = 0, ty = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      var sc = $('.scene');
      if (sc) {
        var r = sc.getBoundingClientRect();
        sc.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        sc.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      }
    });
    (function loop() {
      cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12;
      g.style.transform = 'translate(' + cx + 'px,' + cy + 'px) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();
  }

  /* ---------------- 帘幕转场 ---------------- */
  function initVeil() {
    var v = $('#veil'); if (!v) return;
    requestAnimationFrame(function () { setTimeout(function () { v.classList.add('lift'); }, 140); });
  }
  function leaveTo(url, label) {
    var v = $('#veil');
    if (v) {
      v.classList.remove('lift');
      var t = $('.veil-text', v); if (t && label) t.textContent = label;
    }
    try { SFX.whoosh(); } catch (e) {}
    setTimeout(function () { window.location.href = url; }, 640);
  }
  function bindNav() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-nav]') : null;
      if (!el) return;
      e.preventDefault();
      SFX.click();
      leaveTo(el.getAttribute('data-nav'), el.getAttribute('data-nav-label') || 'LOADING');
    });
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest ? e.target.closest('.btn,.choice,.icon-btn,[data-nav]') : null;
      if (el && !el._hv) { el._hv = 1; SFX.hover(); }
    });
  }

  /* ---------------- 打字机 ---------------- */
  var TY = { skip: false };
  function parseSegs(line) {
    var re = /\[(\/?)(b|j|c)\]/g, out = [], last = 0, m, cur = null;
    function push(o) { if (o.t === 'plain' ? o.text : o.text) out.push(o); }
    while ((m = re.exec(line))) {
      var text = line.slice(last, m.index); last = re.lastIndex;
      if (cur) cur.text += text; else push({ t: 'plain', text: text });
      if (!m[1]) { cur = { t: m[2], text: '' }; }
      else { if (cur) push(cur); cur = null; }
    }
    var tail = line.slice(last);
    if (cur) { cur.text += tail; push(cur); }
    else if (tail) push({ t: 'plain', text: tail });
    return out;
  }
  function segEl(t) {
    if (t === 'b') { var b = document.createElement('span'); b.className = 'hl'; return b; }
    if (t === 'j') { var j = document.createElement('span'); j.className = 'joke'; return j; }
    if (t === 'c') { var c = document.createElement('span'); c.className = 'hl'; return c; }
    return document.createElement('span');
  }
  async function typeLine(el, line, speed) {
    speed = speed || 26;
    var segs = parseSegs(line);
    var nodes = segs.map(function (s) { var n = segEl(s.t); el.appendChild(n); return n; });
    for (var i = 0; i < segs.length; i++) {
      var text = segs[i].text;
      for (var k = 0; k < text.length; k++) {
        if (TY.skip) { nodes[i].textContent += text.slice(k); break; }
        nodes[i].textContent += text[k];
        if (k % 2 === 0) { try { SFX.type(); } catch (e) {} }
        await sleep(/[，。！？、,.!?]/.test(text[k]) ? speed * 5 : speed);
      }
    }
  }
  async function typeLines(el, lines, speed) {
    el.innerHTML = '';
    for (var i = 0; i < lines.length; i++) {
      TY.skip = false;
      var p = document.createElement('p');
      el.appendChild(p);
      var cw = document.createElement('span'); cw.className = 'cursorblink';
      await typeLine(p, lines[i], speed);
      p.appendChild(cw);
      await sleep(160);
      if (cw.parentNode) cw.parentNode.removeChild(cw);
    }
    TY.skip = false;
  }

  /* ---------------- 揭示动画 ---------------- */
  function reveal(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    try { SFX.step(); } catch (e) {}
  }

  /* ---------------- 顶部条 ---------------- */
  function buildTopbar(cfg) {
    var fill = $('#progressFill'), label = $('#progressLabel');
    var base = getState().room || 0;
    var cur = cfg ? cfg.id : base;
    if (fill) setTimeout(function () { fill.style.width = Math.round((cur / 6) * 100) + '%'; }, 300);
    if (label) label.textContent = 'ROOM ' + String(cur).padStart(2, '0') + ' / 06';
    var sb = $('#soundBtn');
    if (sb) {
      sb.classList.toggle('off', !SFX.isOn());
      sb.textContent = SFX.isOn() ? '🔊' : '🔇';
      sb.addEventListener('click', function () {
        SFX.set(!SFX.isOn()); SFX.wake(); SFX.click();
        sb.classList.toggle('off', !SFX.isOn());
        sb.textContent = SFX.isOn() ? '🔊' : '🔇';
      });
    }
  }

  /* ---------------- 密码谜题 ---------------- */
  function normalize(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ''); }
  function waitPuzzle(pz) {
    return new Promise(function (resolve) {
      var row = $('#codeRow'), btn = $('#checkBtn'), fb = $('#feedback'),
        hintBtn = $('#hintBtn'), hintBox = $('#hintBox');
      if (!row) { resolve(true); return; }
      var n = pz.length || 4, cells = [];
      row.innerHTML = '';
      for (var i = 0; i < n; i++) {
        var inp = document.createElement('input');
        inp.className = 'code-cell'; inp.type = 'text'; inp.inputMode = 'text';
        inp.maxLength = 1; inp.autocomplete = 'off'; inp.setAttribute('aria-label', '第' + (i + 1) + '位');
        row.appendChild(inp); cells.push(inp);
      }
      if (pz.placeholder && cells[0]) cells[0].title = pz.placeholder;
      function val() { return cells.map(function (c) { return c.value; }).join(''); }
      function clearWrong() { cells.forEach(function (c) { c.classList.remove('wrong'); }); }
      function submit() {
        var v = normalize(val());
        var ok = v === normalize(pz.answer) ||
          (pz.accepts || []).some(function (a) { return normalize(a) === v; });
        if (!v) { if (fb) { fb.className = 'feedback err'; fb.textContent = '请输入密码。'; } return; }
        if (ok) {
          cells.forEach(function (c) { c.classList.remove('wrong'); c.classList.add('right'); c.blur(); });
          if (fb) { fb.className = 'feedback ok'; fb.textContent = '✓ 密码正确，门锁发出「咔哒」一声。'; }
          if (btn) btn.disabled = true;
          if (hintBtn) hintBtn.disabled = true;
          try { SFX.unlock(); } catch (e) {}
          burst(row);
          setTimeout(function () { resolve(true); }, 900);
        } else {
          cells.forEach(function (c) { c.classList.add('wrong'); });
          if (fb) { fb.className = 'feedback err'; fb.textContent = '✗ 密码不对。再想想线索里写的。'; }
          try { SFX.err(); } catch (e) {}
          setTimeout(function () { clearWrong(); cells.forEach(function (c) { c.value = ''; c.classList.remove('filled'); }); cells[0] && cells[0].focus(); }, 720);
        }
      }
      cells.forEach(function (c, idx) {
        c.addEventListener('input', function () {
          c.value = c.value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 1);
          c.classList.toggle('filled', !!c.value);
          try { SFX.step(); } catch (e) {}
          if (c.value && idx < n - 1) cells[idx + 1].focus();
        });
        c.addEventListener('keydown', function (e) {
          if (e.key === 'Backspace' && !c.value && idx > 0) { cells[idx - 1].focus(); cells[idx - 1].value = ''; cells[idx - 1].classList.remove('filled'); e.preventDefault(); }
          else if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'ArrowLeft' && idx > 0) cells[idx - 1].focus();
          else if (e.key === 'ArrowRight' && idx < n - 1) cells[idx + 1].focus();
        });
        c.addEventListener('paste', function (e) {
          var t = (e.clipboardData || window.clipboardData).getData('text') || '';
          t = t.replace(/[^0-9a-zA-Z]/g, '');
          if (!t) return; e.preventDefault();
          for (var k = 0; k < n; k++) { cells[k].value = t[k] || ''; cells[k].classList.toggle('filled', !!cells[k].value); }
          cells[Math.min(t.length, n - 1)].focus();
        });
        c.addEventListener('focus', function () { try { SFX.hover(); } catch (e) {} });
      });
      if (btn) {
        var nb = btn.cloneNode(true); btn.parentNode.replaceChild(nb, btn); btn = nb;
        btn.addEventListener('click', submit);
      }
      if (hintBtn && hintBox) {
        var nh = hintBtn.cloneNode(true); hintBtn.parentNode.replaceChild(nh, hintBtn); hintBtn = nh;
        hintBtn.addEventListener('click', function () {
          SFX.click(); hintBox.textContent = pz.hint || '仔细观察场景里的提示。';
          hintBox.classList.remove('hidden'); reveal(hintBox);
        });
      }
      if (cells[0]) setTimeout(function () { try { cells[0].focus(); } catch (e) {} }, 400);
    });
  }

  /* ---------------- 成功粒子爆发 ---------------- */
  function burst(anchor) {
    var r = anchor.getBoundingClientRect();
    for (var i = 0; i < 26; i++) {
      var d = document.createElement('div');
      var ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 130;
      d.style.cssText = 'position:fixed;z-index:999;width:7px;height:7px;border-radius:50%;pointer-events:none;' +
        'left:' + (r.left + r.width / 2) + 'px;top:' + (r.top + r.height / 2) + 'px;' +
        'background:' + ['#33d69f', '#25d8f0', '#8b5cff', '#ffc24b', '#ff5c93'][i % 5] + ';' +
        'box-shadow:0 0 12px currentColor;transition:transform .8s cubic-bezier(.22,.61,.36,1),opacity .8s';
      document.body.appendChild(d);
      (function (d, ang, dist) {
        requestAnimationFrame(function () {
          d.style.transform = 'translate(' + Math.cos(ang) * dist + 'px,' + Math.sin(ang) * dist + 'px) scale(.2)';
          d.style.opacity = '0';
        });
        setTimeout(function () { d.remove(); }, 900);
      })(d, ang, dist);
    }
  }

  /* ---------------- 分支选择 ---------------- */
  function waitChoice(ch) {
    return new Promise(function (resolve) {
      var list = $('#choiceList'), q = $('#choiceQ'), note = $('#choiceNote');
      if (!list) { resolve(null); return; }
      if (q) q.textContent = ch.q;
      list.innerHTML = '';
      var picked = false;
      ch.options.forEach(function (opt, i) {
        var b = document.createElement('button');
        b.className = 'choice'; b.type = 'button';
        b.innerHTML = '<span class="badge">' + 'ABC'[i] + '</span><span>' + opt.label + '</span>';
        b.addEventListener('click', function () {
          if (picked) return; picked = true;
          SFX.click();
          b.classList.add('picked');
          $$('.choice', list).forEach(function (o) { if (o !== b) o.classList.add('dim'); });
          addBro(opt.bro || 0);
          if (note) { note.textContent = opt.note || ''; note.classList.remove('hidden'); reveal(note); }
          try { SFX.ok(); } catch (e) {}
          setTimeout(function () { resolve(opt); }, 750);
        });
        list.appendChild(b);
      });
    });
  }

  /* ---------------- 房间主流程 ---------------- */
  async function runRoom(cfg) {
    buildTopbar(cfg);
    var s = getState();
    if (!s.started) { s.started = Date.now(); setState(s); }
    if ((s.room || 0) < cfg.id) setState({ room: cfg.id });

    // 头部
    var nameEl = $('#roomName'), enEl = $('#roomEn'), tagEl = $('#sceneTag');
    if (nameEl) nameEl.textContent = cfg.name;
    if (enEl) enEl.textContent = cfg.en;
    if (tagEl) tagEl.textContent = cfg.tag || ('ROOM ' + String(cfg.id).padStart(2, '0'));

    // 线索内容
    var clueH = $('#clueTitle'), clueB = $('#clueBody');
    if (clueH && cfg.clueTitle) clueH.innerHTML = cfg.clueTitle;
    if (clueB && cfg.clueHtml) clueB.innerHTML = cfg.clueHtml;

    // 1) 剧情打字
    var story = $('#story');
    if (story) await typeLines(story, cfg.intro || [], 24);
    await sleep(120);

    // 2) 线索
    reveal($('#clueBlock'));
    await sleep(900);

    // 3) 谜题
    reveal($('#puzzleBlock'));
    var pzLabel = $('#puzzleLabel'); if (pzLabel && cfg.puzzle && cfg.puzzle.label) pzLabel.textContent = cfg.puzzle.label;
    await sleep(260);
    await waitPuzzle(cfg.puzzle || { length: 4, answer: '0000' });
    markSolved(cfg.id);

    // 4) 成功 & 分支
    reveal($('#solvedBlock'));
    await sleep(700);
    var chosen = null;
    if (cfg.choice) {
      reveal($('#choiceBlock'));
      await sleep(500);
      chosen = await waitChoice(cfg.choice);
    }

    // 5) 继续
    var cont = $('#continueBlock');
    var contBtn = $('#continueBtn');
    if (contBtn && (cfg.next || (chosen && chosen.next))) {
      var rawNext = (chosen && chosen.next) ? chosen.next : cfg.next;
      var nUrl = (typeof rawNext === 'function') ? rawNext(chosen) : rawNext;
      var rawLabel = (chosen && chosen.nextLabel) ? chosen.nextLabel : cfg.nextLabel;
      var nLabel = (typeof rawLabel === 'function') ? rawLabel(chosen) : rawLabel;
      var rawEn = (chosen && chosen.nextEn) ? chosen.nextEn : cfg.nextEn;
      var nEn = (typeof rawEn === 'function') ? rawEn(chosen) : rawEn;
      contBtn.setAttribute('data-nav', BASE + nUrl);
      contBtn.setAttribute('data-nav-label', nEn || '下一步');
      var t = $('#continueLabel'); if (t) t.textContent = nLabel || '前往下一间';
    }
    reveal(cont);
  }

  /* ---------------- 首页 ---------------- */
  function runHome() {
    buildTopbar(null);
    var s = getState();
    var contBtn = $('#continueBtn');
    if (contBtn && s.room) {
      contBtn.classList.remove('hidden');
      var nextRoom = Math.min(s.room + 1, 6);
      contBtn.setAttribute('data-nav', 'room' + nextRoom + '.html');
      contBtn.setAttribute('data-nav-label', 'ROOM 0' + nextRoom);
      var t = $('#continueInfo');
      if (t) t.textContent = '上次进度：ROOM ' + String(s.room).padStart(2, '0') + ' · 仗义值 ' + (s.bro || 0);
    }
    var startBtn = $('#startBtn');
    if (startBtn) startBtn.addEventListener('click', function () {
      resetState();
      setState({ started: Date.now(), room: 0, bro: 0, solved: [] });
      SFX.unlock();
    });
    var resetBtn = $('#resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      resetState(); SFX.click();
    });
  }

  /* ---------------- 结局 ---------------- */
  function runEnding(cfg) {
    buildTopbar({ id: 6 });
    var s = getState();
    var dur = s.started ? Math.max(1, Math.round((Date.now() - s.started) / 60000)) : 0;
    var solved = (s.solved || []).length;
    var bro = s.bro || 0;
    var mm = $('#statTime'), sm = $('#statBro'), cm = $('#statClue');
    if (mm) mm.textContent = dur ? dur : '—';
    if (sm) sm.textContent = bro;
    if (cm) cm.textContent = solved + '/6';
    var rank = $('#rankBadge');
    if (rank) {
      var txt, r;
      if (cfg.kind === 'good') { r = bro >= 3 ? 'S · 生死之交' : 'A · 仗义同学'; }
      else if (cfg.kind === 'middle') { r = 'B · 一般路人'; }
      else { r = 'F · 塑料兄弟'; }
      var b = $('#rankText'); if (b) b.textContent = r;
    }
    // 结局主题
    document.body.classList.add('end-kind-' + cfg.kind);
    // 分享文案复制
    var share = $('#shareBtn');
    if (share) share.addEventListener('click', function () {
      var line = cfg.share || ('我在 Jack 的密室里逃出来了！仗义值 ' + bro);
      if (navigator.clipboard) navigator.clipboard.writeText(line).then(function () {
        share.textContent = '✓ 已复制';
        setTimeout(function () { share.textContent = '分享成绩'; }, 1600);
      });
      SFX.click();
    });
    var again = $('#againBtn');
    if (again) again.addEventListener('click', function () { resetState(); });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    initVeil(); initStars(); initCursor();
    // 首次点击唤醒音频
    var wake = function () { SFX.wake(); window.removeEventListener('pointerdown', wake); };
    window.addEventListener('pointerdown', wake);
    document.addEventListener('click', function () { TY.skip = true; }, true);
    bindNav();

    var body = document.body;
    if (window.ROOM) { runRoom(window.ROOM); }
    else if (window.ENDING) { runEnding(window.ENDING); }
    else { runHome(); }
    body.classList.add('ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* 暴露给房间页的小接口（结局分支判定用） */
  window.JACK = { getState: getState, setState: setState, reset: resetState, addBro: addBro };
})();
