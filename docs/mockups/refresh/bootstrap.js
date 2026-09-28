/* THE REFRESH VIEWER'S BOOTSTRAP (2026-09-26) — runs in each app frame BEFORE the app's own
   bundle, so the real app (Before) and the practice copy (After) open from a double-click with
   nothing reaching any server:
   · the runtime configuration is the harness's fake project (scripts/shots.mjs HARNESS_URL /
     HARNESS_KEY): a host that resolves nowhere and a key that is plainly not one;
   · a FRESH in-memory localStorage per load (file:// pages would otherwise share one store), seeded
     the way the harness seeds a signed-in session (seedPage): the session, the mode, the setup record;
   · prefers-color-scheme is ours to set, and changes LIVE: the app's theme preference defaults to
     'system', so flipping the query re-themes the running app in place, as the phone does;
   · every request to the fake project is answered by mock.js; every other request is refused;
     realtime's socket is a quiet stand-in that accepts joins and heartbeats;
   · the viewer drives it by postMessage: {type:'scheme', value}, {type:'go', steps}, {type:'reload'}.
   URL: index.html?scheme=dark|light&land=app|welcome|setup&mode=customer|worker&steps=<json>
        [&draft=1 a post in progress] [&draft=2 one on Review with photos] [&fresh=1 a customer who has never posted] */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var scheme = params.get('scheme') === 'dark' ? 'dark' : 'light';
  var land = params.get('land') || 'app';
  var mode = params.get('mode') === 'worker' ? 'worker' : 'customer';
  var USER_ID = '00000000-0000-4000-8000-000000000001';
  var HOST = 'https://harness.supabase.co';

  // &fresh=1 (2026-09-28): a customer who has never posted — the Home's first-run state.
  window.__REFRESH__ = { scheme: scheme, land: land, mode: mode, userId: USER_ID, host: HOST, app: params.get('app') || '', fresh: params.get('fresh') === '1' };
  window.__BRAZOS_CONFIG__ = { SUPABASE_URL: HOST, SUPABASE_KEY: 'harness-anon-key-not-a-real-key' };

  // ---- storage: fresh per load ------------------------------------------------------------
  var mem = new Map();
  var storage = {
    getItem: function (k) { k = String(k); return mem.has(k) ? mem.get(k) : null; },
    setItem: function (k, v) { mem.set(String(k), String(v)); },
    removeItem: function (k) { mem.delete(String(k)); },
    clear: function () { mem.clear(); },
    key: function (i) { return Array.from(mem.keys())[i] || null; },
    get length() { return mem.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return storage; } }); } catch (e) { /* the real one then */ }
  try { Object.defineProperty(window, 'sessionStorage', { configurable: true, get: function () { return storage; } }); } catch (e) { /* ignore */ }
  if (land === 'legal') land = 'app'; // signed in and set up; mock.js answers the acceptance read empty
  if (land !== 'welcome') {
    var now = Math.floor(Date.now() / 1000);
    storage.setItem('sb-harness-auth-token', JSON.stringify({
      access_token: 'harness', token_type: 'bearer', expires_in: 360000, expires_at: now + 360000, refresh_token: 'harness',
      user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'mahmudur@example.com', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Mahmudur Rahman' }, created_at: '2026-08-01T12:00:00.000Z' },
    }));
    storage.setItem('brazos.mode.v1.' + USER_ID, mode);
    if (land !== 'setup') storage.setItem('brazos.setup.v1.' + USER_ID, JSON.stringify({ completed: true, landing: mode === 'worker' ? 'work' : 'hire' }));
    // A job draft in progress on this phone, for the screens that show one (&draft=1).
    if (params.get('draft') === '1') {
      storage.setItem('brazos.postJobDraft.v2.' + USER_ID, JSON.stringify({
        title: 'Hang a gallery wall', description: 'Eight frames of different sizes on a plaster wall in the hallway. I have the frames and the hooks.',
        category: 'tv_mounting', location: 'Park Slope, Brooklyn', coords: null, budgetMin: '', budgetMax: '', pricingMode: 'open_bids',
        address: '', scheduledDate: null, arrivalStartHour: null, arrivalEndHour: null, photos: [], videos: [], step: 1,
      }));
    }
    // A draft on its last step with three photos (&draft=2, 2026-09-28, LUX-LIST-64 #38):
    // the review summary's media, as the posting flow resumes it.
    if (params.get('draft') === '2') {
      var sample = function (name) { return HOST + '/storage/v1/object/public/job-photos/samples/' + name; };
      storage.setItem('brazos.postJobDraft.v2.' + USER_ID, JSON.stringify({
        title: 'Assemble a three-seat sofa and an armchair', description: 'Both pieces are boxed in the living room. Tools on hand: an Allen key set and a drill. Please take the packaging with you.',
        category: 'furniture_assembly', location: 'Park Slope, Brooklyn', coords: null, budgetMin: '', budgetMax: '120', pricingMode: 'open_bids',
        address: '', scheduledDate: null, arrivalStartHour: 8, arrivalEndHour: 11, photos: [sample('armchair.webp'), sample('room.webp'), sample('toolbox.webp')], videos: [], step: 3,
      }));
    }
  }

  // ---- the colour scheme, live -------------------------------------------------------------
  var dark = scheme === 'dark';
  var mqls = [];
  var realMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
  window.matchMedia = function (query) {
    if (!/prefers-color-scheme/.test(query)) return realMatchMedia ? realMatchMedia(query) : { matches: false, addListener: function () {}, removeListener: function () {} };
    var wantsDark = /dark/.test(query);
    var fns = new Set();
    var mql = {
      media: query,
      get matches() { return wantsDark ? dark : !dark; },
      onchange: null,
      addListener: function (fn) { fns.add(fn); },
      removeListener: function (fn) { fns.delete(fn); },
      addEventListener: function (type, fn) { if (type === 'change') fns.add(fn); },
      removeEventListener: function (type, fn) { if (type === 'change') fns.delete(fn); },
      dispatchEvent: function () { return true; },
      _fire: function () { var ev = { matches: mql.matches, media: query }; fns.forEach(function (fn) { try { fn(ev); } catch (e) { console.error(e); } }); if (typeof mql.onchange === 'function') mql.onchange(ev); },
    };
    mqls.push(mql);
    return mql;
  };
  function setScheme(next) {
    dark = next === 'dark';
    window.__REFRESH__.scheme = next;
    document.documentElement.setAttribute('data-scheme', next);
    mqls.forEach(function (m) { m._fire(); });
  }
  document.documentElement.setAttribute('data-scheme', scheme);

  // ---- the network --------------------------------------------------------------------------
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (url.indexOf(HOST) === 0) return window.__REFRESH_MOCK__.fetch(url, init || {}, input);
    if (/^(https?:)?\/\//.test(url) && url.indexOf(location.origin) !== 0) {
      return Promise.resolve(new Response('', { status: 204, statusText: 'refused by the refresh viewer' }));
    }
    return realFetch(input, init);
  };
  var RealXHR = window.XMLHttpRequest;
  // supabase-js speaks fetch; an XHR to the fake host (an upload helper) is answered the same way
  window.XMLHttpRequest = function () {
    var xhr = new RealXHR();
    var open = xhr.open;
    var mocked = null;
    xhr.open = function (method, url) {
      if (String(url).indexOf(HOST) === 0) { mocked = { method: method, url: String(url), headers: {} }; return; }
      return open.apply(xhr, arguments);
    };
    var setHeader = xhr.setRequestHeader;
    xhr.setRequestHeader = function (k, v) { if (mocked) { mocked.headers[k] = v; return; } return setHeader.apply(xhr, arguments); };
    var send = xhr.send;
    xhr.send = function (body) {
      if (!mocked) return send.apply(xhr, arguments);
      window.__REFRESH_MOCK__.fetch(mocked.url, { method: mocked.method, headers: mocked.headers, body: body }).then(function (res) {
        return res.text().then(function (text) {
          Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true });
          Object.defineProperty(xhr, 'status', { value: res.status, configurable: true });
          Object.defineProperty(xhr, 'responseText', { value: text, configurable: true });
          Object.defineProperty(xhr, 'response', { value: text, configurable: true });
          if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
          if (typeof xhr.onload === 'function') xhr.onload({ target: xhr });
          xhr.dispatchEvent(new Event('load'));
          xhr.dispatchEvent(new Event('loadend'));
        });
      });
    };
    return xhr;
  };
  window.XMLHttpRequest.prototype = RealXHR.prototype;

  // realtime: a socket that joins every channel and answers heartbeats, and says nothing else
  var RealWS = window.WebSocket;
  function QuietSocket(url) {
    var self = this;
    this.url = url; this.readyState = 0; this.binaryType = 'blob'; this.protocol = ''; this.extensions = ''; this.bufferedAmount = 0;
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
    this._l = {};
    setTimeout(function () { self.readyState = 1; self._emit('open', {}); }, 20);
  }
  QuietSocket.CONNECTING = 0; QuietSocket.OPEN = 1; QuietSocket.CLOSING = 2; QuietSocket.CLOSED = 3;
  QuietSocket.prototype.addEventListener = function (t, fn) { (this._l[t] = this._l[t] || []).push(fn); };
  QuietSocket.prototype.removeEventListener = function (t, fn) { this._l[t] = (this._l[t] || []).filter(function (f) { return f !== fn; }); };
  QuietSocket.prototype._emit = function (t, ev) { var h = this['on' + t]; if (typeof h === 'function') h.call(this, ev); (this._l[t] || []).forEach(function (fn) { fn(ev); }); };
  QuietSocket.prototype.send = function (raw) {
    var self = this;
    var msg; try { msg = JSON.parse(raw); } catch (e) { return; }
    var arr = Array.isArray(msg);
    var joinRef = arr ? msg[0] : msg.join_ref, ref = arr ? msg[1] : msg.ref, topic = arr ? msg[2] : msg.topic, event = arr ? msg[3] : msg.event, payload = arr ? msg[4] : msg.payload;
    if (event !== 'phx_join' && event !== 'heartbeat' && event !== 'access_token' && event !== 'phx_leave') return;
    var response = {};
    if (event === 'phx_join' && payload && payload.config && payload.config.postgres_changes) {
      response = { postgres_changes: payload.config.postgres_changes.map(function (c, i) { return Object.assign({ id: i + 1 }, c); }) };
    }
    var reply = { status: 'ok', response: response };
    var out = arr ? [joinRef, ref, topic, 'phx_reply', reply] : { topic: topic, event: 'phx_reply', payload: reply, ref: ref, join_ref: joinRef };
    setTimeout(function () { self._emit('message', { data: JSON.stringify(out) }); }, 5);
  };
  QuietSocket.prototype.close = function () { this.readyState = 3; this._emit('close', { code: 1000, reason: '', wasClean: true }); };
  window.WebSocket = function (url, protocols) {
    if (String(url).indexOf('harness.supabase.co') >= 0) return new QuietSocket(url);
    return new RealWS(url, protocols);
  };
  window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1; window.WebSocket.CLOSING = 2; window.WebSocket.CLOSED = 3;

  // ---- pictures: a storage URL of the fake project shows a local file ------------------------
  // (an upload made in this session, or one of the app's own pictures standing in for a photo)
  function localFor(url) { return String(url).indexOf(HOST) >= 0 && window.__REFRESH_MOCK__ ? window.__REFRESH_MOCK__.media(url) : null; }
  var srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true, enumerable: true,
    get: function () { return srcDesc.get.call(this); },
    set: function (v) { srcDesc.set.call(this, localFor(v) || v); },
  });
  var setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === 'src' && this instanceof HTMLImageElement) { var m = localFor(value); if (m) value = m; }
    return setAttr.call(this, name, value);
  };
  function fixStyle(el) {
    var bi = el.style && el.style.backgroundImage;
    if (bi && bi.indexOf(HOST) >= 0) el.style.backgroundImage = bi.replace(/url\("?([^")]+)"?\)/g, function (all, u) { var m = localFor(u); return m ? 'url("' + m + '")' : all; });
  }
  new MutationObserver(function (records) {
    records.forEach(function (r) {
      if (r.type === 'attributes') { fixStyle(r.target); return; }
      r.addedNodes.forEach(function (n) { if (n.nodeType !== 1) return; fixStyle(n); if (n.querySelectorAll) n.querySelectorAll('[style*="harness.supabase.co"]').forEach(fixStyle); });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });

  // ---- driving the app: a recipe of taps, the way the harness walks to a screen ---------------
  function visible(el) { var r = el.getBoundingClientRect(); var cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; }
  function ownText(el) { var t = ''; el.childNodes.forEach(function (n) { if (n.nodeType === 3) t += n.textContent; }); return t.trim(); }
  function topmost(els) {
    // the element a finger would actually land on: the last in document order that is hit-testable at its centre
    for (var i = els.length - 1; i >= 0; i--) {
      var r = els[i].getBoundingClientRect();
      var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && (hit === els[i] || els[i].contains(hit) || hit.contains(els[i]))) return els[i];
    }
    return els[els.length - 1] || null;
  }
  function findByLabel(label) { return topmost(Array.prototype.filter.call(document.querySelectorAll('[aria-label]'), function (el) { return el.getAttribute('aria-label') === label && visible(el); })); }
  function findByText(text) { return topmost(Array.prototype.filter.call(document.querySelectorAll('body *'), function (el) { return ownText(el) === text && visible(el); })); }
  function pressables() { return Array.prototype.filter.call(document.querySelectorAll('[role="button"],[role="tab"],[role="link"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],[tabindex]'), visible); }
  function findTab(name) { return topmost(pressables().filter(function (el) { return el.getAttribute('role') === 'tab' && el.textContent.indexOf(name) >= 0; })); }
  function findHas(text) {
    // the smallest pressable whose text contains it — the card or row a finger would press
    var hits = pressables().filter(function (el) { return el.textContent.indexOf(text) >= 0; });
    hits.sort(function (a, b) { var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.width * ra.height - rb.width * rb.height; });
    return hits[0] || null;
  }
  function findByPlaceholder(ph) { return topmost(Array.prototype.filter.call(document.querySelectorAll('input[placeholder],textarea[placeholder]'), function (el) { return el.getAttribute('placeholder') === ph && visible(el); })); }
  function pressable(el) { var n = el; while (n && n !== document.body) { if (n.getAttribute && (n.getAttribute('role') === 'button' || n.getAttribute('role') === 'link' || n.getAttribute('role') === 'tab' || n.getAttribute('role') === 'switch' || n.getAttribute('role') === 'checkbox' || n.getAttribute('role') === 'radio' || n.getAttribute('role') === 'menuitem' || n.hasAttribute('tabindex'))) return n; n = n.parentElement; } return el; }
  function tap(el) {
    var target = pressable(el);
    var r = target.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: 1, view: window };
    var P = window.PointerEvent || MouseEvent;
    target.dispatchEvent(new P('pointerover', Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, base)));
    target.dispatchEvent(new P('pointerdown', Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, base)));
    target.dispatchEvent(new MouseEvent('mousedown', base));
    target.dispatchEvent(new P('pointerup', Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, base, { buttons: 0 })));
    target.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { buttons: 0 })));
    target.dispatchEvent(new MouseEvent('click', Object.assign({}, base, { buttons: 0 })));
  }
  function typeInto(el, text) {
    el.focus();
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(find, what, timeout) {
    var t0 = Date.now();
    while (Date.now() - t0 < (timeout || 15000)) { var el = find(); if (el) return el; await sleep(60); }
    throw new Error('not found: ' + what);
  }
  async function runSteps(steps) {
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.expect) { await waitFor(function () { return findByText(s.expect) || findByLabel(s.expect); }, s.expect); continue; }
      if (s.press) { tap(await waitFor(function () { return findByLabel(s.press); }, 'label ' + s.press)); await sleep(s.after || 850); continue; }
      if (s.text) { tap(await waitFor(function () { return findByText(s.text); }, 'text ' + s.text)); await sleep(s.after || 850); continue; }
      if (s.tab) { tap(await waitFor(function () { return findTab(s.tab); }, 'tab ' + s.tab)); await sleep(s.after || 850); continue; }
      if (s.has) { tap(await waitFor(function () { return findHas(s.has); }, 'pressable with ' + s.has)); await sleep(s.after || 850); continue; }
      if (s.fill) { typeInto(await waitFor(function () { return findByPlaceholder(s.fill); }, 'placeholder ' + s.fill), s.value || ''); await sleep(s.after || 250); continue; }
      if (s.wait) { await sleep(s.wait); continue; }
      if (s.scroll) {
        // the list under a finger in the middle of the screen: the innermost vertical scroller there
        var n = document.elementFromPoint(innerWidth / 2, s.at || innerHeight / 2), box = null;
        while (n && n !== document.body) { var cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 10) { box = n; break; } n = n.parentElement; }
        if (box) Element.prototype.scrollTo.call(box, { top: s.scroll === 'end' ? box.scrollHeight : s.scroll === 'top' ? 0 : s.scroll, behavior: 'smooth' });
        await sleep(s.after || 700); continue;
      }
    }
  }
  window.__REFRESH__.run = runSteps;
  window.__REFRESH__.tap = tap;
  window.__REFRESH__.setScheme = setScheme;

  var pending = null;
  try { var raw = params.get('steps'); if (raw) pending = JSON.parse(raw); } catch (e) { console.error('[refresh] bad steps', e); }
  function report(type, extra) { try { parent.postMessage(Object.assign({ source: 'refresh-app', app: window.__REFRESH__.app, type: type }, extra || {}), '*'); } catch (e) { /* no viewer */ } }
  window.addEventListener('message', function (e) {
    var m = e.data || {};
    if (m.type === 'scheme') setScheme(m.value);
    if (m.type === 'go' && Array.isArray(m.steps)) runSteps(m.steps).then(function () { report('arrived'); }, function (err) { report('lost', { error: String(err && err.message || err) }); });
  });
  window.addEventListener('load', function () {
    // the app is up once its root has children and the startup scaffold is gone
    var t0 = Date.now();
    (function poll() {
      var root = document.getElementById('root');
      if (root && root.children.length && !document.getElementById('brazos-startup')) {
        setTimeout(function () {
          if (pending) runSteps(pending).then(function () { report('arrived'); }, function (err) { report('lost', { error: String(err && err.message || err) }); });
          else report('arrived');
        }, 900);
        return;
      }
      if (Date.now() - t0 < 30000) setTimeout(poll, 80); else report('lost', { error: 'the app did not start' });
    })();
  });
  window.addEventListener('error', function (e) { report('error', { error: String(e.message || e) }); });
})();
