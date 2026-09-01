// The raw source of the embeddable trip-page widget, served verbatim by
// /embed.js (src/app/embed.js/route.ts). Kept as a pure constant with no
// server-only imports so tests can import it under plain Node.
//
// Rules for editing:
// - Vanilla ES5-ish JS, no dependencies, must stay well under 15KB.
// - No backticks and no "${" inside the source (it lives in a template
//   literal) and no backslashes (template-literal escape processing would
//   mangle them) — e.g. use [^0-9+] instead of \d.
// - Never console.error/warn — a broken widget must be invisible, not loud.
// - No cookies, no localStorage, no PII on the host page.

export const WIDGET_SOURCE = `(function () {
  'use strict';
  var debugged = false;
  function debug(msg) {
    if (debugged) return;
    debugged = true;
    try { console.debug('[leatherback-widget] ' + msg); } catch (e) { /* noop */ }
  }
  function mk(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function pic(cls, src) {
    var i = mk('img', cls);
    i.src = src;
    i.alt = '';
    return i;
  }
  try {
    // 1. Find our own <script> tag.
    var script = document.currentScript;
    if (!script || !script.src) {
      script = null;
      var all = document.querySelectorAll('script[src]');
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf('/embed.js') !== -1) { script = all[i]; break; }
      }
    }
    if (!script || !script.src) { debug('script tag not found'); return; }

    var origin;
    try { origin = new URL(script.src, window.location.href).origin; } catch (e) { debug('bad src'); return; }

    var brandKey = script.getAttribute('data-brand') || '';
    var tripAttr = script.getAttribute('data-trip') || '';
    var typeAttr = script.getAttribute('data-type') || '';

    // 2. Trip slug: data-trip wins, else /tour/<slug>/.
    var trip = tripAttr;
    if (!trip) {
      var parts = window.location.pathname.split('/').filter(function (p) { return p.length > 0; });
      var at = parts.indexOf('tour');
      if (at !== -1 && parts[at + 1]) trip = parts[at + 1];
      else if (parts.length > 0) trip = parts[parts.length - 1];
    }
    var pageHost = window.location.hostname;

    // Trip hero (og:image) tops the overlay; /book validates the URL.
    var hm = document.querySelector('meta[property="og:image"]');
    var hv = hm && hm.getAttribute('content');
    var heroQ = hv ? '&hero=' + encodeURIComponent(hv) : '';

    var bookUrl = origin + '/book?trip=' + encodeURIComponent(trip) +
      '&host=' + encodeURIComponent(pageHost) + '&embed=1' +
      '&type=' + encodeURIComponent(typeAttr || 'enquiry') + heroQ;

    function safeColor(value, fallback) {
      return (typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)) ? value : fallback;
    }

    var overlayHost = null;
    function closeOverlay() {
      if (!overlayHost) return;
      window.removeEventListener('message', onOverlayMessage);
      if (overlayHost.parentNode) overlayHost.parentNode.removeChild(overlayHost);
      overlayHost = null;
    }
    function onOverlayMessage(event) {
      if (event.origin !== origin) return;
      if (event.data && event.data.type === 'leatherback-booking-close') closeOverlay();
    }

    // 5. Full-screen overlay with the /book page in an iframe.
    function openOverlay() {
      if (overlayHost) return;
      overlayHost = mk('div');
      var sh = overlayHost.attachShadow({ mode: 'closed' });
      var st = mk('style');
      st.textContent = [
        '.backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,23,42,.55);',
        'z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}',
        '.panel{position:relative;width:100%;max-width:480px;height:90vh}',
        '.frame{width:100%;height:100%;border:0;border-radius:16px;background:#fff;',
        'box-shadow:0 20px 60px rgba(0,0,0,.35)}',
        '.oclose{position:absolute;top:-14px;right:-14px;width:32px;height:32px;border:0;border-radius:50%;',
        'background:#111827;color:#fff;font-size:18px;line-height:32px;text-align:center;cursor:pointer;padding:0}',
        '@media (max-width:639px){.backdrop{padding:0}.panel{max-width:none;height:100%}',
        '.frame{border-radius:0}.oclose{top:10px;right:10px;background:rgba(17,24,39,.7)}}'
      ].join('');
      sh.appendChild(st);
      var backdrop = mk('div', 'backdrop');
      var panel = mk('div', 'panel');
      var frame = mk('iframe', 'frame');
      frame.src = bookUrl;
      frame.setAttribute('title', 'Book a call');
      var oclose = mk('button', 'oclose');
      oclose.setAttribute('aria-label', 'Close booking window');
      oclose.textContent = '×';
      oclose.addEventListener('click', closeOverlay);
      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) closeOverlay();
      });
      panel.appendChild(frame);
      panel.appendChild(oclose);
      backdrop.appendChild(panel);
      sh.appendChild(backdrop);
      window.addEventListener('message', onOverlayMessage);
      document.body.appendChild(overlayHost);
    }

    // 4a. The host page's enquiry/book-now control.
    function findEnquiry() {
      var re = /enquire|book now|get in touch/i;
      var els = document.querySelectorAll('a,button');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var text = (el.textContent || '').trim();
        if (!text || text.length > 60 || !re.test(text)) continue;
        if (el.offsetWidth > 0 || el.offsetHeight > 0) return el;
      }
      return null;
    }

    // 4b. Docked row under the enquiry control.
    function renderDocked(title, photo, color, initial) {
      var target = findEnquiry();
      if (!target || !target.parentNode) return null;
      var hostEl = mk('div');
      var sh = hostEl.attachShadow({ mode: 'closed' });
      var st = mk('style');
      st.textContent = [
        '.drow{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
        '-webkit-font-smoothing:antialiased;display:flex;align-items:center;gap:12px;width:100%;',
        'margin:14px 0 0;padding:14px 0 0;border:0;border-top:1px solid rgba(0,0,0,.08);',
        'background:transparent;cursor:pointer;text-align:left;box-sizing:border-box}',
        '.dphoto{width:40px;height:40px;border-radius:50%;object-fit:cover;flex:none;background:#f3f4f6}',
        '.dinitial{width:40px;height:40px;border-radius:50%;flex:none;background:' + color + ';',
        'color:#fff;font-size:16px;font-weight:700;line-height:40px;text-align:center}',
        '.dtext{flex:1;min-width:0}',
        '.dsub{font-size:13px;line-height:1.3;color:#6b7280;margin:0 0 2px}',
        '.dtitle{font-size:15px;line-height:1.3;font-weight:600;color:' + color + '}',
        '.drow:hover .dtitle{text-decoration:underline}',
        '.dchev{flex:none;font-size:20px;line-height:1;color:' + color + '}'
      ].join('');
      sh.appendChild(st);
      var row = mk('button', 'drow');
      row.setAttribute('aria-label', title);
      if (photo) {
        row.appendChild(pic('dphoto', photo));
      } else {
        var init = mk('div', 'dinitial');
        init.textContent = initial;
        row.appendChild(init);
      }
      var textWrap = mk('div', 'dtext');
      var sub = mk('div', 'dsub');
      sub.textContent = 'Prefer to talk it through?';
      textWrap.appendChild(sub);
      var dtitle = mk('div', 'dtitle');
      dtitle.textContent = title;
      textWrap.appendChild(dtitle);
      row.appendChild(textWrap);
      var chev = mk('span', 'dchev');
      chev.textContent = '›';
      row.appendChild(chev);
      row.addEventListener('click', openOverlay);
      sh.appendChild(row);
      target.parentNode.insertBefore(hostEl, target.nextSibling);
      return hostEl;
    }

    // 4c. Floating card; with a docked row it waits till that scrolls away.
    function render(data) {
      var brand = data.brand || {};
      var staff = data.staff || {};
      var isPrimary = data.kind === 'primary' && staff.firstName;
      var color = safeColor(brand.colorPrimary, '#0f5f5c');
      var accent = safeColor(brand.colorAccent, '#c2571b');
      var title = isPrimary
        ? 'Book a call with ' + staff.firstName
        : 'Book a call with the ' + (brand.name || 'trip') + ' team';
      var photo = isPrimary ? (staff.photoUrl || '') : (brand.logoUrl || '');
      var bio = isPrimary ? (staff.bio || '') : '';
      var phone = typeof data.phone === 'string' ? data.phone : '';
      var initial = ((isPrimary ? staff.firstName : (brand.name || '')) + 'B').charAt(0).toUpperCase();

      var docked = null;
      try { docked = renderDocked(title, photo, color, initial); } catch (e) { debug('dock failed'); }

      var dismissed = false;
      var expanded = false;
      var floatHidden = !!docked;

      var hostEl = mk('div');
      var sh = hostEl.attachShadow({ mode: 'closed' });
      var st = mk('style');
      st.textContent = [
        '.root{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
        '-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.45;color:#1f2937}',
        '.card{position:fixed;right:20px;bottom:20px;width:320px;max-width:calc(100vw - 32px);',
        'background:#fff;border-radius:16px;box-shadow:0 10px 34px rgba(0,0,0,.18);padding:18px;',
        'box-sizing:border-box;z-index:2147483000}',
        '.head{display:flex;align-items:center;gap:12px;margin-bottom:8px;padding-right:20px}',
        '.photo{width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none;background:#f3f4f6}',
        '.title{font-size:16px;font-weight:700;color:#111827}',
        '.bio{font-size:14px;color:#4b5563;margin-bottom:10px;display:-webkit-box;',
        '-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
        '.phone{display:block;font-size:14px;font-weight:600;text-decoration:none;',
        'margin-bottom:12px;color:' + accent + '}',
        '.cta{display:block;width:100%;border:0;border-radius:10px;padding:12px 16px;font-size:15px;',
        'font-weight:700;color:#fff;cursor:pointer;background:' + color + '}',
        '.cta:hover{filter:brightness(1.08)}',
        '.close{position:absolute;top:10px;right:10px;width:26px;height:26px;border:0;border-radius:50%;',
        'background:#f3f4f6;color:#6b7280;font-size:15px;line-height:26px;text-align:center;cursor:pointer;padding:0}',
        '.bar{display:none}',
        '.reopen{display:none;position:fixed;right:16px;bottom:16px;width:52px;height:52px;border:0;',
        'border-radius:50%;cursor:pointer;z-index:2147483000;box-shadow:0 6px 20px rgba(0,0,0,.25);',
        'background:' + color + ';color:#fff;font-size:22px;padding:0;overflow:hidden}',
        '.reopen img{width:100%;height:100%;object-fit:cover;border-radius:50%}',
        '.root.dismissed .card,.root.dismissed .bar{display:none !important}',
        '.root.dismissed .reopen{display:block}',
        '@media (max-width:639px){',
        '.card{display:none;left:0;right:0;bottom:0;width:auto;max-width:none;border-radius:16px 16px 0 0}',
        '.root.expanded .card{display:block}',
        '.bar{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;',
        'background:#fff;padding:10px 16px;box-shadow:0 -4px 20px rgba(0,0,0,.15);cursor:pointer;',
        'border:0;width:100%;box-sizing:border-box;z-index:2147483000;text-align:left}',
        '.root.expanded .bar{display:none}',
        '.bar .photo{width:36px;height:36px}',
        '.bar span{font-size:15px;font-weight:700;color:#111827}}',
        '.root.hidden .card,.root.hidden .bar,.root.hidden .reopen{display:none !important}'
      ].join('');
      sh.appendChild(st);

      var root = mk('div');
      root.className = floatHidden ? 'root hidden' : 'root';

      function sync() {
        var cls = 'root';
        if (dismissed) cls += ' dismissed';
        if (expanded) cls += ' expanded';
        if (floatHidden) cls += ' hidden';
        if (root.className !== cls) root.className = cls;
      }

      var card = mk('div', 'card');
      var head = mk('div', 'head');
      if (photo) head.appendChild(pic('photo', photo));
      var titleEl = mk('div', 'title');
      titleEl.textContent = title;
      head.appendChild(titleEl);
      card.appendChild(head);
      if (bio) {
        var bioEl = mk('div', 'bio');
        bioEl.textContent = bio;
        card.appendChild(bioEl);
      }
      if (phone) {
        var tel = mk('a', 'phone');
        tel.href = 'tel:' + phone.replace(/[^0-9+]/g, '');
        tel.textContent = phone;
        card.appendChild(tel);
      }
      var cta = mk('button', 'cta');
      cta.textContent = 'Book a call';
      cta.addEventListener('click', openOverlay);
      card.appendChild(cta);
      var close = mk('button', 'close');
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '×';
      close.addEventListener('click', function () {
        // Session-only dismiss: in-memory state, nothing persisted.
        dismissed = true;
        expanded = false;
        sync();
      });
      card.appendChild(close);
      root.appendChild(card);

      // Collapsed slim bar for small viewports; expands on tap.
      var bar = mk('button', 'bar');
      if (photo) bar.appendChild(pic('photo', photo));
      var blabel = mk('span');
      blabel.textContent = 'Book a call';
      bar.appendChild(blabel);
      bar.addEventListener('click', function () {
        expanded = true;
        sync();
      });
      root.appendChild(bar);

      var reopen = mk('button', 'reopen');
      reopen.setAttribute('aria-label', 'Book a call');
      if (photo) reopen.appendChild(pic('', photo));
      else reopen.textContent = '✆';
      reopen.addEventListener('click', function () {
        dismissed = false;
        expanded = false;
        sync();
      });
      root.appendChild(reopen);

      sh.appendChild(root);
      document.body.appendChild(hostEl);

      // 4d. Float only once the docked row is out of view.
      if (docked && typeof IntersectionObserver === 'function') {
        var dockInView = true;
        var update = function () {
          floatHidden = dockInView || (window.scrollY || 0) <= 200;
          sync();
        };
        var io = new IntersectionObserver(function (entries) {
          dockInView = entries[entries.length - 1].isIntersecting;
          update();
        });
        io.observe(docked);
        window.addEventListener('scroll', update, { passive: true });
      }
    }

    // 3. Ask the API who fronts this trip.
    var api = origin + '/api/booking/widget?brand=' + encodeURIComponent(brandKey) +
      '&trip=' + encodeURIComponent(trip) + '&host=' + encodeURIComponent(pageHost);
    fetch(api)
      .then(function (res) {
        if (!res.ok) { debug('api status ' + res.status); return null; }
        return res.json();
      })
      .then(function (data) {
        if (!data || (data.kind !== 'primary' && data.kind !== 'pool')) return;
        // Fallback pages: the API pins the overlay to the BM or brand.
        if (data.bookQuery) bookUrl = origin + '/book?' + data.bookQuery + '&embed=1' + heroQ;
        try {
          if (document.body) render(data);
        } catch (e) { debug('render failed'); }
      })
      .catch(function () { debug('fetch failed'); });
  } catch (e) {
    debug('init failed');
  }
})();
`;
